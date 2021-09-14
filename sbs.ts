import axios from 'axios';
import { Comment, CommentData, CommentSettings } from './sbs/Comment';

export interface SBSLoginCredentials {
	username: string;
	password: string;
}

export class SmileBASICSource {
	/// The location of the API to make requests
	apiURL: string = 'https://smilebasicsource.com/api/';

	/// A function that is called whenever a pull is successful
	private onSuccessfulPull: Function;

	/// The credentials that are used to create authtokens with
	private credentials: SBSLoginCredentials;

	/// The authtoken that is used to create API calls with
	private authtoken: string = '';

	/// The last ID in the most recent request, this is used in order to
	/// make new requests
	private lastID: number = -1;

	/// Store the timeout for the infinite loop
	private loopTimeout?: ReturnType<typeof setTimeout>;

	/// The self user for filtering out own requests
	private userId: number = -1;

	constructor(onSuccessfulPull: Function,
				credentials: SBSLoginCredentials,
			    apiURL?: string) {
		this.onSuccessfulPull = onSuccessfulPull;
		this.credentials = credentials
		this.apiURL = apiURL || this.apiURL;
	}

	/// Creates an auth token from SmileBASIC Source and saves it for
	/// future use
	async login() {
		const data = JSON.stringify({
			'username': this.credentials.username,
			'password': this.credentials.password
		});
		const token = await axios.post(
			`${this.apiURL}User/authenticate`,
			data,
			{
				headers: {
					'Content-Type': 'application/json'
				}
			}
		)
			.then(res => res.data);
		this.authtoken = token;
	}

	public static generateHeaders(authtoken: string): any {
		return {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${authtoken}`
		};
	}

	private get headers(): any {
		return SmileBASICSource.generateHeaders(this.authtoken);
	}

	private get listenerSettings(): any {
		return {
			'lastId': this.lastID,
			'chains': ['comment.0id', 'user.1createUserId',
					   'content.1parentId']
		}
	}
	
	private runForever = () => {
		const headers = this.headers;
		const listenerSettings = this.listenerSettings;

		axios.get(`${this.apiURL}Read/listen?actions=${JSON.stringify(listenerSettings)}`,
				  {headers})
			.then(async res => {
				if (this.loopTimeout === undefined)
					return;
				const status = res.status;
				switch (status) {
					case 200: // successful
						this.lastID = res.data['lastId'];
						const comments: Array<Comment> = res.data.chains.comment.map(
							(c: CommentData) => new Comment(c, res.data.chains.user)
						)
						.filter((x: Comment) => x.createUserId !== this.userId);
						await this.onSuccessfulPull(comments);
						break;
					case 401: // invalid auth
						console.error("auth token has expired");
						console.log("attempt to refresh auth token");
						await this.login();
					case 429: // rate limited
						console.error("rate limited");
						this.loopTimeout = setTimeout(this.runForever, 3000);
				}
				this.loopTimeout = setTimeout(this.runForever, 0);
			});
	}

	/// Connects to the API and begins polling from the website in an
	/// infinite loop
	async connect() {
		if (this.authtoken === "")
			await this.login();

		// this is so we can filter our own messages
		const headers = this.headers;
		axios.get(`${this.apiURL}User/me`, {headers})
			.then(x => this.userId = x.data['id']);

		const lastComment = await Comment.getWithLimit(1, this.apiURL);
		this.lastID = lastComment[0].id;

		this.loopTimeout = setTimeout(this.runForever, 0);
	}

	async sendMessage(content: string, pageId: number,
		settings: CommentSettings = {m: '12y'}) {
		await Comment.send(content, settings, pageId, this.authtoken, this.apiURL);
	}
}

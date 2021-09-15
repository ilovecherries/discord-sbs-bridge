import axios, { AxiosError } from 'axios';
import { Comment, CommentData, CommentSettings } from './Comment';

export interface SBSLoginCredentials {
	username: string;
	password: string;
}

export class SmileBASICSource {
	/**
	 * The amount of time to wait before making another request when making
	 * too many requests at once.
	 */
	private static readonly TOO_MANY_REQUESTS_WAIT = 3000;

	/**
	 * Where to make API calls to grab comments/initializer 
	 */	
	readonly apiURL: string = 'https://smilebasicsource.com/api/';

	/**
	 * Whenever a pull from the listener is successful in runForever(), it will
	 * run this callback.
	 */
	private successfulPullCallback: Function;

	/**
	 * The credentials that are used to login to the API with and create
	 * auth tokens with. 
	 * 
	 * They are stored internally because the auth token expires after a month, 
	 * so long running processes require the credentials to make the auth 
	 * tokens once again.
	 */
	private credentials: SBSLoginCredentials;

	/**
	 * The token that is used to make API calls with
	 */
	authtoken: string = '';

	/**
	 * The ID in the most recent poll, this is used in order to make new
	 * requests starting from this point.
	 */
	private lastID: number = -1;

	/**
	 * Stores the timeout for the infinite loop. This is so that if a
	 * destructor is ever made at some point in time, this can be used to
	 * cancel the infinite loop if it is undefined.
	 */
	private loopTimeout?: ReturnType<typeof setTimeout>;

	// TODO: Should probably make it so that the filtering isn't handled by
	// this, should leave that to other interfaces accessing this.
	/**
	 * This is used for filtering out requests from the user that is accessing
	 * the API.
	 */
	private userId: number = -1;

	/**
	 * Creates a new SmileBASIC Source object that can be used later to
	 * connect with.
	 * 
	 * @param onSuccessfulPull Callback function to call when a pull is successful.
	 * @param credentials The credentials that are used to login to the site.
	 * @param apiURL The URL where requests for the API will be make 
	 */
	constructor(onSuccessfulPull: Function,
				credentials: SBSLoginCredentials,
			    apiURL?: string) {
		this.successfulPullCallback = onSuccessfulPull;
		this.credentials = credentials
		this.apiURL = apiURL || this.apiURL;
	}

	/**
	 * Creates an authtoken from SmileBASIC Source using the credentials stored
	 * @returns Authentification token
	 */
	login(credentials: SBSLoginCredentials = this.credentials): Promise<string> {
		const data = JSON.stringify({
			'username': credentials.username,
			'password': credentials.password
		});
		const headers = {
			'Content-Type': 'application/json'
		};
		return axios.post(`${this.apiURL}User/authenticate`, data, {headers})
				.then(res => res.data as string)
	}

	/**
	 * This generates headers that can be used for creating authenticated
	 * requests using JSON
	 * 
	 * @param authtoken The authentification token for the header
	 * @returns The headers that are used to create authenticated requests
	 */
	public static generateHeaders(authtoken: string, 
		contentType: string = 'application/json'): any {
		return {
			'Content-Type': contentType,
			'Authorization': `Bearer ${authtoken}`
		};
	}

	/**
	 * Headers that are used in order to make JSON requests.
	 */
	public get headers(): any {
		return SmileBASICSource.generateHeaders(this.authtoken);
	}

	/**
	 * Headers that are used in order to make file uploads with form data.
	 */
	public get formDataHeaders(): any {
		return SmileBASICSource.generateHeaders(this.authtoken, 'multipart/form-data');
	}

	/**
	 * Settings that are used by the listener in order to make another request
	 */
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
				this.lastID = res.data['lastId'];
				const comments: Array<Comment> = res.data.chains.comment.map(
					(c: CommentData) => new Comment(c, this.apiURL, res.data.chains.user, this.authtoken)
				)
				.filter((x: Comment) => x.createUserId !== this.userId);
				await this.successfulPullCallback(comments);
				this.loopTimeout = setTimeout(this.runForever, 0);
			})
			.catch(async (err: AxiosError) => {
				if (err.response) {
					const status = err.response!.status;

					switch (status) {
						case 401: // invalid auth
							console.error("auth token has expired");
							console.log("attempt to refresh auth token");
							await this.login();
							break;
						case 429: // rate limited
							console.error("rate limited");
							this.loopTimeout = setTimeout(this.runForever, SmileBASICSource.TOO_MANY_REQUESTS_WAIT);
							return;
							break;
					}
				} else {
					console.warn("there was a timeout for listen request")
				}
				this.loopTimeout = setTimeout(this.runForever, 0);
			});
	}

	/// Connects to the API and begins polling from the website in an
	/// infinite loop
	async connect() {
		if (this.authtoken === "")
			this.authtoken = await this.login();

		// this is so we can filter our own messages
		const headers = this.headers;
		axios.get(`${this.apiURL}User/me`, {headers})
			.then(x => this.userId = x.data['id']);

		const lastComment = await Comment.getWithLimit(10, this.apiURL);
		this.lastID = lastComment.find(x => !x.deleted)!.id;

		this.loopTimeout = setTimeout(this.runForever, 0);
	}

	sendMessage(content: string, pageId: number,
		settings: CommentSettings = {m: '12y'}): Promise<Comment> {
		return Comment.send(content, settings, pageId, this.authtoken, this.apiURL);
	}
}

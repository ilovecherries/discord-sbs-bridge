import axios from 'axios';

export class SBSMessage {
	constructor(
		public content: string,
		public settings: any
	) {}

	toJSON() {
		return {
			'content': `${JSON.stringify(this.settings)}this.content`
		}
	}
}

export class SmileBASICSource {
	/// The location of the API to make requests
	private apiURL: string = 'https://smilebasicsource.com/api/';
	
	/// The ID for the user that the bot possesses as
	private userID: number = -1;

	/// A function that is called whenever a pull is successful
	private onSuccessfulPull: Function;

	/// The username that is used to get a new authtoken
	private username: string;

	/// The password that is used to get a new authtoken
	private password: string;

	/// The authtoken that is used to create API calls with
	private authtoken: string = '';

	/// The last ID in the most recent request, this is used in order to
	/// make new requests
	private lastID: number = -1;

	constructor(onSuccessfulPull: Function,
				username: string,
				password: string,
			    apiURL?: string) {
		this.onSuccessfulPull = onSuccessfulPull;
		this.username = username;
		this.password = password;
		this.apiURL = apiURL || this.apiURL;
	}

	/// Creates an auth token from SmileBASIC Source and saves it for
	/// future use
	async login() {
		const data = await axios.post(`${this.apiURL}User/authenticate`)
			.then(res => res.data);
		this.authtoken = data;
	}

	private getHeaders(): any {
		return {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${this.authtoken}`
		}
	}

	/// Connects to the API and begins polling from the website in an
	/// infinite loop
	async connect() {
		if (this.authtoken === "")
			await this.login();

		// get the self user id
		const headers = this.getHeaders();
		const selfUserData = await axios.get(`${this.apiURL}User/me`, {headers})
			.then(res => res.data);
		this.userID = selfUserData['id'];

		// get the most recent sent comments so that we can begin polling
		const commentSettings = {
			'reverse': true,
			'limit': 1
		}
		
		const lastIdData = await axios.get(
			`${this.apiURL}Read/chain?requests=comment-${JSON.stringify(commentSettings)}&requests=user.0createUserId&content.0parentId`,
			{headers}
		)
		
		this.lastID = JSON.parse(lastIdData.data)['comment'][0]['id']
	}
}

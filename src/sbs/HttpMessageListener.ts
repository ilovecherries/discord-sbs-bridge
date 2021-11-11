import axios, { AxiosError } from 'axios';
import { Comment, CommentData } from "./Comment";
import { AuthTokenError, IMessageListener } from "./IMessageListener";
import { SmileBASICSource } from "./sbs";

export default class HttpMessageListener implements IMessageListener {
	static readonly TOO_MANY_REQUESTS_WAIT = 10000;

	readonly apiURL: string = 'https://smilebasicsource.com/api/';

	private loopTimeout?: ReturnType<typeof setTimeout>;

    private isRunning: boolean;

    private lastId: number = -1;

    private userId: number = -1;

    private authtoken: string;

    private authtokenExpired = false;

    private queuedMessages = new Array<Comment>();

	private get listenerSettings(): any {
		return {
			'lastId': this.lastId,
			'chains': ['comment.0id', 'user.1createUserId',
					   'content.1parentId']
		};
	}

	public get headers(): any {
		return SmileBASICSource.generateHeaders(this.authtoken);
	}

    private async runForever() {
        while (this.isRunning) {
            const headers = this.headers;
            const listenerSettings = this.listenerSettings;

            try {
                const res = await axios.get(`${this.apiURL}Read/listen?actions=${JSON.stringify(listenerSettings)}`,
                    { headers });
                if (!this.isRunning) {
                    return;
                }
                const data = res.data;
                this.lastId = res.data['lastId'];
                const comments: Array<Comment> = data.chains.comment.map(
                    (c: CommentData) => new Comment(c, this.apiURL, 
                        res.data.chains.user, this.authtoken)
                )
                    .filter((x: Comment) => x.createUserId !== this.userId);
                this.queuedMessages = this.queuedMessages.concat(comments);
            } catch (err) {
                if (err.response) {
                    const status = err.response!.status;

                    switch (err.status) {
                        case 401: // invalid auth
                            console.error("auth token has expired");
                            console.log("attempt to refresh auth token");
                            this.authtokenExpired = true;
                            break;
                        case 429: // rate limited
                            console.error("rate limited");
                            this.loopTimeout = setTimeout(this.runForever, SmileBASICSource.TOO_MANY_REQUESTS_WAIT);
                            return;
                    }
                }
            }
        }

        // axios.get(`${this.apiURL}Read/listen?actions=${JSON.stringify(listenerSettings)}`,
        //     { headers })
        //     .then(async (res) => {
        //         if (this.loopTimeout === undefined)
        //             return;
        //         console.log(res);
        //         const status = res.status;
        //         this.lastId = res.data['lastId'];
        //         const comments: Array<Comment> = res.data.chains.comment.map(
        //             (c: CommentData) => new Comment(c, this.apiURL, 
        //                 res.data.chains.user, this.authtoken)
        //         )
        //             .filter((x: Comment) => x.createUserId !== this.userId);
        //         this.queuedMessages = this.queuedMessages.concat(comments);
        //         this.loopTimeout = setTimeout(this.runForever, 0);
        //     })
        //     .catch(async (err: AxiosError) => {
        //         if (err.response) {
        //             const status = err.response!.status;

        //             switch (status) {
        //                 case 401: // invalid auth
        //                     console.error("auth token has expired");
        //                     console.log("attempt to refresh auth token");
        //                     this.authtokenExpired = true;
        //                     break;
        //                 case 429: // rate limited
        //                     console.error("rate limited");
        //                     this.loopTimeout = setTimeout(this.runForever, SmileBASICSource.TOO_MANY_REQUESTS_WAIT);
        //                     return;
        //             }
        //         } else {
        //             console.warn("there may have been timeout for listen request?");
        //             console.warn(err);
        //         }
        //         this.loopTimeout = setTimeout(this.runForever, 0);
        //     });
    };

    start(authtoken: string): Promise<void> {
        return new Promise(async (resolve, reject) => {
            if (authtoken === "")
                Promise.reject(new AuthTokenError("auth token is empty"));

            this.authtoken = authtoken;

			// this is so we can filter our own messages
			const headers = this.headers;
			axios.get(`${this.apiURL}User/me`, {headers})
				.then(x => this.userId = x.data['id'])
				.catch(err => reject(err));

			const lastComment = await Comment.getWithLimit(10, this.apiURL);
			lastComment.reverse();
			this.lastId = lastComment.find(x => !x.deleted)!.id;

            this.isRunning = true;

            this.runForever();

            resolve();
        });
    }

    close(): void {
        this.isRunning = false;
    }

    getMessages(): Promise<Comment[]> {
        if (this.authtokenExpired) {
            return Promise.reject(new AuthTokenError("auth token has expired"));
        }

        const messages = this.queuedMessages;
        this.queuedMessages = new Array<Comment>();

        return Promise.resolve(messages);
    }
}
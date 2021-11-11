import axios, { AxiosError } from 'axios';
import { Comment, CommentData } from "./Comment";
import { AuthTokenError, IMessageListener } from "./IMessageListener";
// import { WebSocket }  from 'ws';
import WebSocket = require('ws');
import { SmileBASICSource } from './sbs';

export default class WebsocketMessageListener implements IMessageListener {
	readonly apiURL: string = 'https://smilebasicsource.com/api/';
	readonly wsURL: string = 'wss://smilebasicsource.com/api/';

    private ws: WebSocket;

    private userId: number;

    private queuedMessages = new Array<Comment>();

    private authtokenExpired: boolean = false;

	private generateListenerSettings(lastId: number, token: string): any {
		return {
            auth: token,
            actions: {
			    'lastId': lastId,
			    'chains': ['comment.0id', 'user.1createUserId',
					    'content.1parentId']
            },
            // fields : {
            //     user : ["id","username","avatar"],
            //     content : ["id","name"]
            // }
		};
	}

    start(authtoken: string): void {
        const headers = SmileBASICSource.generateHeaders(authtoken);
        axios.get(`${this.apiURL}User/me`, {headers})
        .then(async x => {
            this.userId = x.data['id']
            const res = await axios.get(`${this.apiURL}read/wsauth`, {headers});
            const token = res.data as string;

			const lastComment = await Comment.getWithLimit(10, this.apiURL);
			lastComment.reverse();
			const lastId = lastComment.find(x => !x.deleted)!.id;

            this.ws = new WebSocket(`${this.wsURL}read/wslisten`);

            this.ws.on('open', () => {
                const settings = this.generateListenerSettings(lastId, token);
                this.ws.send(JSON.stringify(settings));
            });

            this.ws.on('message', (msg: any) => {
                try {
                    const data = JSON.parse(msg);
                    const comments: Array<Comment> = data.chains.comment.map(
                        (c: CommentData) => new Comment(c, this.apiURL, 
                            data.chains.user, authtoken)
                    )
                        .filter((x: Comment) => x.createUserId !== this.userId);
                    this.queuedMessages = this.queuedMessages.concat(comments);
                } catch {
                    console.error(msg.toString());
                }
            });
        })
    }

    close(): void {
        throw new Error("Method not implemented.");
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
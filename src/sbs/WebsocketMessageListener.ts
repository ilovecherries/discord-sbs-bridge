import axios, { AxiosError, AxiosResponse } from 'axios';
import { Comment, CommentData } from "./Comment";
import { AuthTokenError, IMessageListener } from "./IMessageListener";
// import { WebSocket }  from 'ws';
import WebSocket = require('ws');
import { SmileBASICSource } from './sbs';

export default class WebsocketMessageListener implements IMessageListener {
	readonly apiURL: string = 'https://smilebasicsource.com/api/';
	readonly wsURL: string = 'wss://smilebasicsource.com/api/';

    private ws: WebSocket;

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

        let lastId = -1;
        let userId = -1;
        let token = "";

        const onOpen = () => {
            const settings = this.generateListenerSettings(lastId, token);
            this.ws.send(JSON.stringify(settings));
        }

        const onMessage = (msg: any) => {
            try {
                const data = JSON.parse(msg);
                const comments: Array<Comment> = data.chains.comment.map(
                    (c: CommentData) => new Comment(c, this.apiURL, 
                        data.chains.user, authtoken)
                )
                    .filter((x: Comment) => x.createUserId !== userId);
                this.queuedMessages = this.queuedMessages.concat(comments);
            } catch {
                const text = msg.toString();
                if (text.startsWith("accepted")) {
                    console.log("authenticated")
                } else {
                    console.error(msg.toString());
                }
            }
        };

        const onError = (msg: any) => {
            console.error(msg.toString());
        }

        const startWebsocket = async () => {
            console.log("(Re)Starting WebSocket");

            let res: AxiosResponse

            while (true) {
                try {
                    res = await axios.get(`${this.apiURL}read/wsauth`, {
                        headers: headers
                    });
                    break;
                } catch (e) {
                    if (e.response) {
                        switch (e.response.status) {
                            case 401:
                                this.authtokenExpired = true;
                            case 502:
                                await new Promise(resolve => setTimeout(resolve, 60 * 1000));
                        }
                    }
                }
            }

            token = res.data as string;

			const lastComment = await Comment.getWithLimit(10, this.apiURL);
			lastComment.reverse();
			lastId = lastComment.find(x => !x.deleted)!.id;

            this.ws = new WebSocket(`${this.wsURL}read/wslisten`);
            this.ws.on('open', onOpen);
            this.ws.on('message', onMessage);
            this.ws.on('error', onError);
            this.ws.on('close', startWebsocket);
        }

        axios.get(`${this.apiURL}User/me`, {headers})
        .then(async x => {
            userId = x.data['id']

            startWebsocket();
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
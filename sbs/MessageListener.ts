import ContentAPI from "./ContentAPI";
import { isBrowser, isNode } from 'browser-or-node';
import { Comment, CommentData } from './Comment'
import axios from "axios";


interface ListenerSettings {
    lastId: number;
    chains: Array<string>;
}

interface ListenerResponse {
    chains: any;
    lastId: number;
}

interface LoginCredentials {
	username: string;
	password: string;
}

// sends new comments as "newComment" events
export default class MessageListener {
    private authtoken: string;
    private lastId: number = -1;
    private running: boolean = false;
    private callbacks: Array<Function> = [];

    constructor(authtoken: string) {
        this.authtoken = authtoken;
        this.runForever();
    }

	private get headers(): any {
		return {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${this.authtoken}`
		};
	}
	
    private call = async() => {
        if (this.running) {
            // let's make a call to the chainer to grab comments
            let settings: ListenerSettings = {
                lastId: this.lastId,
                chains: ['comment.0id', 'user.1createUserId',
                            'content.1parentId']
            };
            let url = `${ContentAPI.API_LINK}Read/listen?actions=` +
                        JSON.stringify(settings);
			interface ResponseData {
				data: any,
				status: number
			}
            let responseData: ResponseData = null;
			const headers = this.headers;
			if (isBrowser) {
				let response = await fetch(url, {headers})
                let responseData = {
                    data: await response.json(),
                    status: response.status
                }
			} else if (isNode) {
				let response = await axios.get(url, {headers})
                let responseData = {
                    data: response.data,
                    status: response.status
                }
            }

            fetch(url, {
                headers: {
                    'Authorization': 'Bearer ' + this.authtoken
                }
            })
                .then(response => response.json())
                .then((response: ListenerResponse) => {
                    this.lastId = response.lastId;
                    const comments: Array<Comment> = response.chains.comment.map((c: CommentData) => 
                        new Comment(c, response.chains.user)
                    );
                    this.callbacks.forEach((callback: Function) => {
                        callback(comments)
                    });
                    this.call();
                })
                .catch((error: Error) => {
                    console.error(error)
                    this.call();
                })
        }   
    }

    runForever() {
        this.running = true;
        Comment.getWithLimit(1)
            .then((comment: Array<Comment>) => {
                this.lastId = comment[0].id;
                this.running = true;
                this.call();
            })
    }

    endEventLoop() {
        this.running = false;
    }

    addCallback(id: string, callback: Function) {
        this.callbacks.push(callback);
    }
}

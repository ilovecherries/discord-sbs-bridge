import { Comment } from "./Comment";
import { IMessageListener } from "./IMessageListener";

export default class WebsocketMessageListener implements IMessageListener {
    start(authtoken: string): void {
        throw new Error("Method not implemented.");
    }
    close(): void {
        throw new Error("Method not implemented.");
    }
    getMessages(): Promise<Comment[]> {
        throw new Error("Method not implemented.");
    }
}
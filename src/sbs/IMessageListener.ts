import { Comment } from './Comment';

export class AuthTokenError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'AuthTokenError';
    }
}

export interface IMessageListener {
    /**
     * used to start the listener
     */
    start(authtoken: string): void;

    /**
     * used to stop the listener if it is in progress
     */
    close(): void;

    /**
     * get the messages that have been received from the listener
     */
    getMessages(): Promise<Comment[]>;
}
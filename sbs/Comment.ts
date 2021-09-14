import ContentAPI from './ContentAPI';
import { User, UserData } from './User';
import { SmileBASICSource } from './sbs';
import axios from 'axios';

export interface CommentSettings {
    // The markup type of the comment
    m: string;
    // The bridge username
    b?: string;
    // The nickname attached to the comment
    n?: string;
}

export interface CommentToSend {
    parentId: number;
    content: string;
}

export interface CommentData extends CommentToSend {
    createDate: string;
    editDate: string;
    createUserId: number;
    editUserId: number;
    deleted: boolean;
    id: number;
}

export class Comment implements CommentData {
    createDate: string;
    editDate: string;
    createUserId: number;
    editUserId: number;
    deleted: boolean;
    id: number;
    parentId: number;
    content: string;
    createUser?: User;
    editUser?: User;
    settings: CommentSettings;
    textContent: string;

    // sends comment data and returns the sent comment
    public static send(content: string, settings: CommentSettings, 
                       pageId: number, authtoken: string, 
                       apiURL: string): Promise<Comment> {
        const data: CommentToSend = {
            content: `${JSON.stringify(settings)}\n${content}`,
            parentId: pageId
        }
        const body = JSON.stringify(data);
        const headers = SmileBASICSource.generateHeaders(authtoken);
        return axios.post(`${apiURL}Comment`, body, {headers}) 
            .then(res =>  new Comment(res.data));
        
    }

    // get comment by ID
    public static getByID(id: number, apiURL: string): Promise<Comment> {
        return axios.get(`${apiURL}Comment?Ids=${id}`)
            .then(response => (new Comment(response.data[0])));
    }

    // get last sent comments in selected parentID with length LIMIT
    public static getWithLimit(limit: number, 
        apiURL: string,
        parentID: undefined | number = undefined,): Promise<Array<Comment>> {
        // TODO: Replace with Chainer dedicated class
        let settings: any = {
            'reverse': true,
            'limit': limit
        };
        if (parentID)
            settings.parentIds = [parentID];
        let url = `${apiURL}Read/chain/?requests=comment-${JSON.stringify(settings)}&requests=user.0createUserId&requests=user.0editUserId`;

        return axios.get(url)
            .then(res => {
                return res.data['comment']
                    .filter((x: CommentData) => !x.deleted)
                    .map((x: CommentData) => new Comment(x, res.data['user'])).reverse()
            });
    }

    constructor(commentData: CommentData, userlist: UserData[]=[]) {
        this.parentId = commentData.parentId;
        this.content = commentData.content;
        this.createDate = commentData.createDate;
        this.editDate = commentData.editDate;
        this.createUserId = commentData.createUserId;
        this.editUserId = commentData.editUserId;
        this.deleted = commentData.deleted;
        this.id = commentData.id;
        // these find if a certain user is in the userlist and we store them
        // for convenience later on
        let createUserData = userlist.find(user => user.id === this.createUserId);
        if (createUserData !== undefined) 
            this.createUser = new User(createUserData)

        let editUserData = userlist.find(user => user.id === this.editUserId);
        if (editUserData !== undefined) 
            this.editUser = new User(editUserData)
        // extract the settings from the text
        try {
            let firstNewline = this.content.indexOf('\n');
            let settings: CommentSettings = JSON.parse(
                this.content.substring(0, firstNewline)
            );
            this.settings = settings;
            this.textContent = this.content.substring(firstNewline);
        // if the json couldn't be parsed, then that probably means there are no
        // settings sent in the message
        } catch (Error) {
            this.settings = {m: 't'};
            this.textContent = this.content;
        }
    }

    toJSON() {
        return {
            createDate: this.createDate,
            editDate: this.editDate,
            createUserId: this.createUserId,
            editUserId: this.editUserId,
            deleted: this.deleted,
            id: this.id,
            parentId: this.parentId,
            content: this.content,
        }
    }

    edit(content: string, settings: CommentSettings, authtoken: string, apiURL: string) {
        this.content = `${JSON.stringify(settings)}\n${content}`;
        const body = JSON.stringify(this);
        const headers = SmileBASICSource.generateHeaders(authtoken);
        axios.put(`${apiURL}Comment/${this.id}`, body, {headers});
    }

    delete(authtoken: string, apiURL: string) {
        const headers = SmileBASICSource.generateHeaders(authtoken);
        axios.delete(`${apiURL}Comment/${this.id}`, {headers});
    }
}

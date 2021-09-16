import { User, UserData } from './User';
import { SmileBASICSource } from './sbs';
import axios from 'axios';

/**
 * Metadata that is used for comments
 */
export interface CommentSettings {
    /**
     * The markup type of the comment
     */
    m: string;
    /**
     * The display username as determined by a bridge endpoint
     */
    b?: string;
    /**
     *  Nickname
     */
    n?: string;
    /**
     * Avatar
     */
    a?: number;
}

/**
 * The parameters that are required in order to create a new comment on the
 * API
 */
export interface CommentToSend {
    /**
     * The room ID where the comment will be sent
     */
    parentId: number;
    /**
     * The contents of the comment that will be sent
     */
    content: string;
}

/**
 * The base data that makes up comments that are retrieved from the API
 */
export interface CommentData extends CommentToSend {
    /**
     * The time string when the comment was created
     */
    createDate: string;
    /**
     * The time string when the comment was last edited
     */
    editDate: string;
    /**
     * The ID of the user who created the comment
     */
    createUserId: number;
    /**
     * The ID of the user who edited the comment last
     */
    editUserId: number;
    /**
     * Whether the message is deleted or not
     */
    deleted: boolean;
    /**
     * The internal ID of the comment
     */
    id: number;
}

/**
 * A comment helper wrapper class that can be used to create and interact with
 * retrived comments from the API more easily
 */
export class Comment implements CommentData {
    createDate: string;
    editDate: string;
    createUserId: number;
    editUserId: number;
    deleted: boolean;
    id: number;
    parentId: number;
    content: string;

    /**
     * The token that is used to make API requests that interact with the
     * comment
     */
    private authtoken?: string;

    /**
     * The API URL that the comment was was retrieved from and where it
     * will be interacted with.
     */
    private apiURL: string;

    /**
     * Information about the user who created the comment
     */
    createUser?: User;

    /**
     * Information about the user who edited the comment last
     */
    editUser?: User;

    /**
     * The metadata that is included in the comment content
     */
    settings: CommentSettings;

    /**
     * The content of the comment with the metadata stripped out
     */
    textContent: string;

    /**
     * Generate the content for a comment and send it to an API endpoint. 
     * @param content The content of the comment
     * @param settings The metadata of the comment
     * @param pageId The page ID where the comment will be sent
     * @param authtoken The auth token that is used to make authorize API requests
     * @param apiURL The endpoint where the comment will be created
     * @returns The newly created comment
     */
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
            .then(res =>  new Comment(res.data, apiURL, [], authtoken));
        
    }

    /**
     * Gets a comment from an API endpoint by ID
     * @param id The ID of the comment to retrieve
     * @param apiURL The endpoint where the comment will be retrieved
     * @returns The comment retrieved from the API
     */
    public static getByID(id: number, apiURL: string): Promise<Comment> {
        return axios.get(`${apiURL}Comment?Ids=${id}`)
            .then(response => (new Comment(response.data[0], apiURL)));
    }

    /**
     * Get set amount of comments from an API endpoint with a limit
     * @param limit How many comments to grab
     * @param apiURL The API endpoint where to grab the comment from
     * @param parentID The page where to grab the comments from. If not provided, it grabs from all pages.
     * @returns An array of comments that are grabbed
     */
    public static getWithLimit(limit: number, 
        apiURL: string,
        parentID: undefined | number = undefined,): Promise<Array<Comment>> {
        // TODO: Replace with Chainer dedicated class
        const settings: any = {
            'reverse': true,
            'limit': limit
        };
        if (parentID)
            settings.parentIds = [parentID];
        const url = `${apiURL}Read/chain/?requests=comment-${JSON.stringify(settings)}&requests=user.0createUserId&requests=user.0editUserId`;

        return axios.get(url)
            .then(res => {
                return res.data['comment']
                    .map((x: CommentData) => new Comment(x, apiURL, res.data['user'])).reverse()
            });
    }

    /**
     * Generate a new comment using data from an API endpoint
     * @param commentData The comment data that is grabbed from an API endpoint
     * @param apiURL The API endpoint from which the comment data was grabbed
     * @param userlist A list of users that is used for refernece for attaching users to comments
     * @param authtoken The authtoken that is used in order to manipulate the comment on the API
     */
    constructor(commentData: CommentData, apiURL: string, userlist: UserData[]=[], authtoken?: string) {
        this.parentId = commentData.parentId;
        this.content = commentData.content;
        this.createDate = commentData.createDate;
        this.editDate = commentData.editDate;
        this.createUserId = commentData.createUserId;
        this.editUserId = commentData.editUserId;
        this.deleted = commentData.deleted;
        this.id = commentData.id;
        this.authtoken = authtoken;
        this.apiURL = apiURL;
        // these find if a certain user is in the userlist and we store them
        // for convenience later on
        const createUserData = userlist.find(user => user.id === this.createUserId);
        if (createUserData !== undefined) 
            this.createUser = new User(createUserData)

        const editUserData = userlist.find(user => user.id === this.editUserId);
        if (editUserData !== undefined) 
            this.editUser = new User(editUserData)
        // extract the settings from the text
        try {
            const firstNewline = this.content.indexOf('\n');
            const settings: CommentSettings = JSON.parse(
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

    /**
     * Edit the current comment on the API endpoingt
     * @param content The new content of the message
     * @param settings The new settings to be applied on the message
     * @param authtoken An authtoken to be used to edit the message if it doesn't already exist
     */
    edit(content: string, settings: CommentSettings = this.settings, 
        authtoken: string | undefined = this.authtoken) {
        this.content = `${JSON.stringify(settings)}\n${content}`;
        const body = JSON.stringify(this);
        if (authtoken) {
            const headers = SmileBASICSource.generateHeaders(authtoken);
            axios.put(`${this.apiURL}Comment/${this.id}`, body, {headers});
        } else {
            throw new Error("A valid auth token isn't available to edit the message.")
        }
    }

    /**
     * Delete the current comment on the API endpoint
     * @param authtoken An authtoken to be used to edit the message if it doesn't already exist
     */
    delete(authtoken: string | undefined = this.authtoken) {
        if (authtoken) {
            const headers = SmileBASICSource.generateHeaders(authtoken);
            axios.delete(`${this.apiURL}Comment/${this.id}`, {headers});
        } else {
            throw new Error("A valid auth token isn't available to delete the message.")
        }
    }
}

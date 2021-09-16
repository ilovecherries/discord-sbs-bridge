/**
 * User data as represented from the API
 */
export interface UserData {
    username: string;
    avatar: number;
    createDate: string;
    special?: string | undefined;
    banned: boolean;
    super: boolean;
    registered: boolean;
    id: number;
}

/**
 * Wrapper class for working with user data presented from the API
 */
export class User implements UserData {
    username: string;
    avatar: number;
    createDate: string;
    special?: string | undefined;
    banned: boolean;
    super: boolean;
    registered: boolean;
    id: number;
    apiURL: string;

    /**
     * Create a new User object
     * @param userData The user data as it is formatted on the API
     * @param apiURL The API URL from which the user data was grabbed
     */
    constructor(userData: UserData, apiURL: string) {
        this.username = userData.username;
        this.avatar = userData.avatar;
        this.createDate = userData.createDate;
        this.special = userData.special;
        this.banned = userData.banned;
        this.super = userData.super;
        this.registered = userData.registered;
        this.id = userData.id;
        this.apiURL = apiURL;
    }

    /**
     * Generates an avatar link given the available information about the user
     * @param size The size of the avatar in pixels
     * @returns A URL to the avatar on the API formatted correctly
     */
    getAvatarLink(size: number = 256): string {
        return `${this.apiURL}File/raw/${this.avatar}?size=${size}&crop=true`
    }
}
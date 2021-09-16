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

    constructor(userData: UserData) {
        this.username = userData.username;
        this.avatar = userData.avatar;
        this.createDate = userData.createDate;
        this.special = userData.special;
        this.banned = userData.banned;
        this.super = userData.super;
        this.registered = userData.registered;
        this.id = userData.id;
    }

    getAvatarLink(apiURL: string, size: number = 256): string {
        return `${apiURL}File/raw/${this.avatar}?size=${size}&crop=true`
    }
}
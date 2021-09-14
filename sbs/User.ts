import ContentAPI from "./ContentAPI";

export interface UserData {
    username: string;
    avatar: number;
    createDate: string;
    special?: string;
    banned: boolean;
    super: boolean;
    registered: boolean;
    id: number;
}

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

    getAvatarLink(size: number = 256): string {
        return `${ContentAPI.API_LINK}File/raw/${this.avatar}?size=${size}&crop=true`
    }
}
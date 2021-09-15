import { Client, Message, TextChannel, Webhook } from "discord.js";
import { Comment } from './sbs/Comment';
import * as LRU from 'lru-cache';


export interface ChannelPairConfig {
    discordChannelId: string;
    sbsChannelId: number;
}

export class ChannelPair {
	private discordChannelCached?: TextChannel;
	// sbs --> discord
	private sbsMsgs: LRU<number, Message> = new LRU({ max: 500 });
	// discord --> sbs
	private disMsgs: LRU<string, Comment> = new LRU({ max: 500 });

    constructor(
        private discordChannelId: string,
        private sbsChannelId: number,
    ) {}

	toJSON() {
		return {
			"discordChannelId": this.discordChannelId,
			"sbsChannelId": this.sbsChannelId
		}
	}

    public get discord(): string {return this.discordChannelId}
    public set discord(newId: string) {this.discordChannelId = newId}

	public discordChannel(client: Client): TextChannel {
		if (this.discordChannelCached === undefined) {
			this.discordChannelCached 
				= client.channels.cache.get(this.discordChannelId) as TextChannel;
		}
		return this.discordChannelCached!;
	}

	public discordWebhook(client: Client): Promise<Webhook> {
		return this.discordChannel(client).fetchWebhooks()
			.then(webhooks => {
				let w = webhooks.find((x: Webhook) => x.owner!.id === client.user!.id);
				if (w === undefined) {
					return this.discordChannel(client).createWebhook('SmileBASIC Source Bridge');
				}
				return w;
			})
	}

	public cacheSBSMessage(smsg: Comment, dmsg: Message) {
		this.sbsMsgs.set(smsg.id, dmsg);
	}

	public cacheDiscordMessage(dmsg: Message, smsg: Comment) {
		this.disMsgs.set(dmsg.id, smsg);
	}

	public getCachedSBSMessage(id: number): Message {
		let msg = this.sbsMsgs.get(id);
		if (msg === undefined)
			throw new Error("Unable to find cached message")
		return msg!;
	}

	public getCachedDiscordMessage(id: string): Comment {
		let msg = this.disMsgs.get(id);
		if (msg === undefined)
			throw new Error("Unable to find cached message")
		return msg!;
	}

    public get sbs() {return this.sbsChannelId}
    public set sbs(newId: number) {this.sbsChannelId = newId}
}

export class ChannelPairHandler {
	private channelList: Map<string, ChannelPair> = new Map<string, ChannelPair>();

	set(discordChannelId: string, sbsChannelId: number) {
		this.channelList.set(discordChannelId, new ChannelPair(discordChannelId, sbsChannelId));
	}

	removeWithDiscordID(channelId: string) {
		this.channelList.delete(channelId);
	}

	removeWithSBSID(channelID: number) {
		try {
        	const channel = this.getDiscord(channelID);
			this.channelList.delete(channel.discord)
		} catch (e) {
			console.error(e);
		}
	}

	getSBS(channelId: string): ChannelPair {
        const channel = this.channelList.get(channelId);
		if (channel === undefined)
			throw new Error("Wasn't able to find a match from the given channel ID");
		return channel!;
	}

	getDiscord(channelId: number): ChannelPair {
        const channel = Array.from(this.channelList).find(x => x[1].sbs === channelId);
		if (channel === undefined)
			throw new Error("Wasn't able to find a match from the given channel ID");
		return channel[1]!;
	}

	getAll(): Array<ChannelPair> {
		return Array.from(this.channelList.values());
	}

    toJSON() {
        return Array.from(this.channelList.values()).map(x => x.toJSON())
    }
}
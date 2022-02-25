import { Client, Message, TextChannel, Webhook } from "discord.js";
import { Comment } from './sbs/Comment';
import * as LRU from 'lru-cache';

/**
 * The channel pair representation as it is stored in JSON form
 */
export interface ChannelPairConfig {
    discordChannelId: string;
    sbsChannelId: number;
}

/**
 * A pair of an SBS and a Discord channel that make up an internal
 * connection between the two
 */
export class ChannelPair {
	/**
	 * A cached text channel that can be used to do operations on the channel
	 * that the SBS channel is linked against
	 */
	private discordChannelCached?: TextChannel;

	/**
	 * The cached webhook that is used to send messages from SmileBASIC Source
	 * to the Discord channel
	 */
	private discordChannelWebhookCached?: Webhook;

	/**
	 * Cached messages that were sent from SmileBASIC Source to Discord to
	 * check against if they were edited or deleted
	 */
	private sbsMsgs: LRU<number, Message> = new LRU({ max: 1000 });

	/**
	 * Cached messages that were sent from Discord to SmileBASIC Source to
	 * check against if they were edited or deleted
	 */
	private disMsgs: LRU<string, Comment> = new LRU({ max: 1000 });

	/**
	 * Create a new ChannelPair that associates a Discord channel and a SmileBASIC Source channel together
	 * @param discordChannelId The Discord channel ID to bind to
	 * @param sbsChannelId The SmileBASIC Source room ID to bind to
	 */
    constructor(
		/**
		 * The Discord channel ID
		 */
        private discordChannelId: string,
		/**
		 * The SmileBASIC Source channel ID
		 */
        private sbsChannelId: number,
    ) {}

	toJSON() {
		return {
			"discordChannelId": this.discordChannelId,
			"sbsChannelId": this.sbsChannelId
		}
	}

    public get discord(): string {return this.discordChannelId}
    public set discord(newId: string) {
		this.discordChannelCached = undefined;
		this.discordChannelWebhookCached = undefined;
		this.discordChannelId = newId;
	}

	/**
	 * Get the text channel that is associated to the Discord channel
	 * @param client A Discord bot client that can be used to get text channels by ID 
	 * @returns The text channel that is associated to the internal ID
	 */
	public discordChannel(client: Client): TextChannel {
		if (this.discordChannelCached === undefined) {
			this.discordChannelCached 
				= client.channels.cache.get(this.discordChannelId) as TextChannel;
		}
		return this.discordChannelCached!;
	}

	/**
	 * Get the webhook that is associated to the Discord channel
	 * @param client The client that can be used to create webhooks with
	 * @returns The webhook that the SBS end can send messages to
	 */
	public discordWebhook(client: Client): Promise<Webhook> {
		return new Promise((resolve, reject) => {
			if (this.discordChannelWebhookCached === undefined) {
				this.discordChannel(client).fetchWebhooks()
					.then(webhooks => {
						let w = webhooks.find((x: Webhook) => x.owner!.id === client.user!.id);
						if (w === undefined) {
							this.discordChannel(client).createWebhook('SmileBASIC Source Bridge')
								.then(w => {
									this.discordChannelWebhookCached = w;
									resolve(w)
								})
								.catch(err => reject(err));
						}
						this.discordChannelWebhookCached = w;
						resolve(w);
					})
					.catch(err => reject(err));
			} else {
				resolve(this.discordChannelWebhookCached);
			}
		})
	}

	/**
	 * Caches a comment from SmileBASIC Source and keeps it Discord counterpart
	 * in order to reference if any updates such as editing or deleting occurs
	 * @param smsg SmileBASIC Source message to check activity for
	 * @param dmsg The Discord message that the SmileBASIC Source message is linked to
	 */
	public cacheSBSMessage(smsg: Comment, dmsg: Message) {
		this.sbsMsgs.set(smsg.id, dmsg);
	}

	/**
	 * Caches a message from Discord and keeps it SmileBASIC Source counterpart
	 * in order to reference if any updates such as editing or deleting occurs
	 * @param dmsg Discord message to check activity for
	 * @param smsg The SmileBASIC Source comment that the Discord message is linked to
	 */
	public cacheDiscordMessage(dmsg: Message, smsg: Comment) {
		this.disMsgs.set(dmsg.id, smsg);
	}

	/**
	 * Gets a cached Discord message from a given SBS comment ID, this is used
	 * for checking messages from SBS to Discord and updating its content
	 * @param id The SmileBASIC Source comment ID
	 * @returns The result Discord message that it is linked to
	 */
	public getCachedSBSMessage(id: number): Message | undefined{
		return this.sbsMsgs.get(id);
	}

	/**	
	 * Gets a cached SBS comment from a given Discord message ID, this is used
	 * for checking messages from Discord to SBS and updating its content
	 * @param id The Discord message ID
	 * @returns The result SmileBASIC Source comment that it is linked to
	 */
	public getCachedDiscordMessage(id: string): Comment | undefined {
		return this.disMsgs.get(id);
	}

    public get sbs() {return this.sbsChannelId}
    public set sbs(newId: number) {this.sbsChannelId = newId}
}

/**
 * This handles a collection of channel pairs in a way that is most efficient
 * for the bridge bot
 */
export class ChannelPairHandler {
	/**
	 * This contains all of the channel pairs.
	 * The key being used is the Discord channel ID since that is the most
	 * accessed property.
	 */
	private channelList: Map<string, ChannelPair> = new Map<string, ChannelPair>();

	/**
	 * Create an association in the channel collection between the given
	 * two channels
	 * @param discordChannelId The Discord channel ID to link to
	 * @param sbsChannelId The SmileBASIC Source room ID to link to
	 */
	set(discordChannelId: string, sbsChannelId: number) {
		this.channelList.set(discordChannelId, new ChannelPair(discordChannelId, sbsChannelId));
	}

	/**
	 * Remove a channel pair from the list given the Discord channel ID
	 * @param channelId The Discord channel ID
	 */
	removeWithDiscordID(channelId: string) {
		this.channelList.delete(channelId);
	}

	/**
	 * Remove a channel pair from the list given the SmileBASIC Source room ID
	 * @param roomID The Discord room ID
	 */
	removeWithSBSID(roomID: number) {
		try {
        	const channel = this.getDiscord(roomID);
			this.channelList.delete(channel.discord)
		} catch (e) {
			console.error(e);
		}
	}

	/**
	 * Get the SmileBASIC Source room ID correlated with the given Discord channel ID
	 * @param channelId The Discord channel ID used to find the associated SmileBASIC Source room
	 * @returns The SmileBASIC Source room ID that is associated with the channel ID
	 */
	getSBS(channelId: string): ChannelPair {
        const channel = this.channelList.get(channelId);
		if (channel === undefined)
			throw new Error("Wasn't able to find a match from the given channel ID");
		return channel!;
	}

	/**
	 * Get the Discord channel ID correlated with the given SmileBASIC Source room ID
	 * @param roomID The SmileBASIC Source room ID used to find the associated Discord channel
	 * @returns The Discord channel ID that is associated with the room ID
	 */
	getDiscord(roomID: number): ChannelPair {
        const channel = Array.from(this.channelList).find(x => x[1].sbs === roomID);
		if (channel === undefined)
			throw new Error("Wasn't able to find a match from the given channel ID");
		return channel[1]!;
	}

	/**
	 * Create an array from the map of channel pairs and return it
	 * @returns All of the channel pairs in the form of an array
	 */
	getAll(): Array<ChannelPair> {
		return Array.from(this.channelList.values());
	}

    toJSON() {
        return Array.from(this.channelList.values()).map(x => x.toJSON())
    }
}
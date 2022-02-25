import { REST } from '@discordjs/rest';
import { Client, ClientOptions, Intents, Interaction, Message, PartialMessage, User } from 'discord.js';
import { CommandList } from './command';
import LOADED_COMMANDS from './commandList';
import { SBSLoginCredentials, SmileBASICSource } from './sbs/sbs';
import { Comment } from './sbs/Comment';
import { ChannelPairConfig, ChannelPairHandler } from './ChannelPair';
import { createReadStream, writeFile, readFile } from 'fs';
import axios from 'axios';
import * as sharp from 'sharp';
import * as FormData from 'form-data';
import HttpMessageListener from './sbs/HttpMessageListener';
import WebsocketMessageListener from './sbs/WebsocketMessageListener';
import { mdto12y } from './markup/md-to-12y'
import { Parse, toMd } from './markup/12y'


/**
 * The association between a SmileBASIC Source avatar and Discord avatar
 */
class AvatarAssociation {
	constructor(
		/**
		 * The ID number for a file on SmileBASIC Source that associates
		 * with the avatar
		 */
		public sbsAvatar: number,
		/**
		 * The URL for the Discord avatar that associates with the avatar
		 */
		public discordAvatar: string) { }
}


/**
 * The Discord bot instance for the SmileBASIC Source bridge
 */
export default class SBSBridgeBot extends Client {
	/**
	 * The amount of time to wait in between save points of the bot's
	 * runtime.
	 * @see save
	 */
	private static readonly SAVE_TIMEOUT = 30000;

	/**
	 * The file location where the save data will be preserved
	 * @see load
	 * @see save
	 */
	private static readonly SAVE_LOCATION: string = process.env['SAVE_LOCATION'] || 'save.json';

	/**
	 * A wrapper and manager for slash commmands
	 */
	private commands: CommandList = new CommandList();

	/**
	 * Handles channel pair associations between SmileBASIC Source and Discord
	 * channels
	 */
	public channelList: ChannelPairHandler = new ChannelPairHandler();

	/**
	 * A connection that is used for the bot to create interactions such as
	 * slash commands.
	 */
	private restConnection: REST;

	/**
	 * A wrapper that is used for keeping a persistent connection to SmileBASIC
	 * Source.
	 */
	private sbs: SmileBASICSource;

	/**
	 * An association list that is used to manage avatar. 
	 * The keys being used are the Discord user IDs,
	 */
	private avatars: Map<string, AvatarAssociation> = new Map<string, AvatarAssociation>();

	/**
	 * Create a new instance of the Discord-SBS bridge bot
	 * @param credentials The credentials for logging into SmileBASIC Source
	 * @param options Client options such as intents, there are already sane defaults
	 */
	constructor(authtoken: string,
		credentials: SBSLoginCredentials,
		options: ClientOptions = { intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES] }) {
		super(options);

		this.on('ready', this.onReady);
		this.on('messageCreate', this.onMessage);
		this.on('interactionCreate', this.onInteractionCreate);
		this.on('messageUpdate', this.onEdit);
		this.on('messageDelete', this.onDelete);

		this.commands = LOADED_COMMANDS;
		this.restConnection = new REST({ version: '9' }).setToken(authtoken);

		this.login(authtoken)
			.then(() => this.sbs.connect())
			.catch(err => console.error(err));
		this.load();
		this.sbs = new SmileBASICSource(
			this.onSuccessfulPull,
			credentials,
			new WebsocketMessageListener()
			// new HttpMessageListener()
		);
	}

	/**
	 * Is called when the Discord bot is in "ready" state
	 */
	private onReady = async () => {
		console.log(`Logged in as ${this.user!.tag}`);
		this.guilds.cache.map(x =>
			this.commands.addSlashCommands(this, this.restConnection, x.id));
		setTimeout(this.save, SBSBridgeBot.SAVE_TIMEOUT);
	}

	private getContents(msg: Message | PartialMessage) {
		return mdto12y(msg.content) +
			(msg.attachments.size > 0 && msg.content.length > 0 ? '\n' : '') +
			msg.attachments.map(x => `!${x.url}`).join('\n');
	}

	/**
	 * Is called when the Discord bot fires a "message create" event
	 * @param msg The Discord message created from the event
	 */
	private onMessage = async (msg: Message) => {
		if (msg.author === this.user)
			return;
		try {
			const channel = this.channelList.getSBS(msg.channelId);
			// filter it out if it's from the webhook
			const webhook = await channel!.discordWebhook(this);
			if (webhook.id === msg.author!.id)
				return;
			const content = this.getContents(msg);
			const username = msg.member?.nickname || msg.author.username;
			const avatar = await this.getDiscordAvatar(msg.author);
			this.sbs.sendMessage(content, channel!.sbs, { m: '12y', b: username, a: avatar })
				.then(c => channel!.cacheDiscordMessage(msg, c))
				.catch(err => console.error(err));
		} catch (e) {
			console.warn(e);
		}
	}

	/**
	 * Grabs an associated SBS message when given a Discord message
	 * @param msg The Discord message to find the associated SBS message for
	 * @returns The SBS message that the Discord message is associated to, if found
	 */
	private getSBSMessage(msg: Message | PartialMessage): Promise<Comment> {
		return new Promise((resolve, reject) => {
			const channel = this.channelList.getSBS(msg.channelId);
			if (channel === undefined)
				reject("The associated message for SBS was not found.");
			const message = channel.getCachedDiscordMessage(msg.id);
			if (message)
				resolve(message);
			else
				reject("The associated message for SBS was not found.");
		})
	}

	/**
	 * Is called when the Discord bot fires a "message edit" event
	 * @param before The message state before it was edited
	 * @param after The message state after it was edited
	 */
	private onEdit = async (before: Message | PartialMessage, after: Message | PartialMessage) => {
		if (before.author === this.user)
			return;
		try {
			const channel = this.channelList.getSBS(before.channelId);
			// filter it out if it's from the webhook
			const webhook = await channel!.discordWebhook(this);
			if (webhook.id === before.author!.id)
				return;
			this.getSBSMessage(before)
				.then(async msg => {
					const content = this.getContents(after);
					const username = after.member?.nickname
						|| after.author?.username
						|| msg.settings.b
						|| msg.settings.n;
					const avatar = msg.settings.a
						|| await this.getDiscordAvatar(after!.author!);
					msg?.edit(content, { m: '12y', b: username, a: avatar })
						.catch(err => console.error(err));
				})
				.catch(err => console.warn(err));
		} catch (e) {
			console.error(e)
		}
	}

	/**
	 * Is called when the Discord bot fires a "message delete" event
	 * @param msg The message that was deleted
	 */
	private onDelete = async (msg: Message | PartialMessage) => {
		if (msg.author === this.user)
			return;
		try {
			const channel = this.channelList.getSBS(msg.channelId);
			// filter it out if it's from the webhook
			const webhook = await channel!.discordWebhook(this);
			if (webhook.id === msg.author!.id)
				return;
			this.getSBSMessage(msg)
				.then(m => m.delete()
					.catch(err => console.error(err)))
				.catch(err => console.warn(err));
		} catch (e) {
			console.error(e)
		}
	}

	/**
	 * Is called when the SBS wrapper successfully gets newly made comments
	 * @param comments An array of comments to be processed and outputted
	 */
	private onSuccessfulPull = async (comments: Array<Comment>) => {
		comments
			.map(c => {
				// filter out comments that are empty without whitespace
				if (c.textContent.replace(/\s+/g, '').length === 0)
					c.textContent = 'ㅤ';
				// we add zwsp in front of @s because webhooks defy all
				// permissions when it comes to @s
				c.textContent = c.textContent.replace('@', '@\u200b');
				const content = toMd(Parse.parseLang(c.textContent, '12y', false))
				this.channelList.getAll()
					.filter(x => x.sbs === c.parentId)
					.map(async d => {
						await d.discordWebhook(this).then(w => {
							if (c.deleted) {
								let cachedMessage = d.getCachedSBSMessage(c.id)
								if (cachedMessage) {
									w.deleteMessage(cachedMessage!.id);
								}
							} else if (c.editDate !== c.createDate) {
								let cachedMessage = d.getCachedSBSMessage(c.id)
								if (cachedMessage) {
									w.editMessage(cachedMessage.id, {
										content
									}).catch(() => d.discordChannel(this).send('There was an error editing a message on Discord')
										.catch(err => console.error(err)));
								}
							} else {
								w.send({
									'username': c.createUser?.username,
									'avatarURL': c.createUser?.getAvatarLink(),
									'content': content
								})
									.then(x => d.cacheSBSMessage(c, x as Message))
									.catch(() => d.discordChannel(this).send('There was an error sending a message to Discord!')
										.catch(err => console.error(err)))
							}
						})
					})
			});
	}

	/**
	 * Is called when the Discord bot fires the "interaction create" event
	 * @param interaction A slash command or any sort of interaction
	 */
	private onInteractionCreate(interaction: Interaction) {
		this.commands.interactionHandler(interaction);
	}

	toJSON() {
		return {
			'channels': this.channelList,
			'avatars': Object.fromEntries(this.avatars)
		}
	}

	/**
	 * Loads the data for the bot from SAVE_LOCATION
	 * @see SAVE_LOCATION
	 */
	private load() {
		try {
			readFile(SBSBridgeBot.SAVE_LOCATION, 'utf8', (err, data) => {
				if (err) {
					console.error(err);
					return;
				}
				const parsedData = JSON.parse(data);
				parsedData!.channels!
					.map((x: ChannelPairConfig) =>
						this.channelList.set(x.discordChannelId, x.sbsChannelId));
				const avatars: any = new Map<string, AvatarAssociation>(Object.entries(parsedData!.avatars!));
				this.avatars = avatars;
			})
		} catch (e) {
			console.error("There was an error trying to load the save file:\n" + e);
		}
	}

	/**
	 * Saves the data for the bot in its current state to SAVE_LOCATION. It
	 * happens in a loop with an offset of SAVE_TIMEOUT milliseconds.
	 * @see SAVE_LOCATION
	 * @see SAVE_TIMEOUT
	 */
	private save = () => {
		writeFile(SBSBridgeBot.SAVE_LOCATION, JSON.stringify(this), err => {
			if (err) {
				console.error(err)
			}
			setTimeout(this.save, SBSBridgeBot.SAVE_TIMEOUT);
		})
	}

	/**
	 * Uploads a Discord avatar to SBS if it has not already been uploaded and
	 * returns the file ID associated with it.
	 * @param author The author of the message to get the avatar of
	 * @returns The SBS file ID that the avatar is associated to
	 */
	private getDiscordAvatar = async (author: User): Promise<number> => {
		const url = author.avatarURL()!;
		const id = author.id;
		let headers = this.sbs.formDataHeaders;
		if (!this.avatars.has(id) || this.avatars.get(id)!.discordAvatar !== url) {
			return axios.get(url, { responseType: 'arraybuffer' })
				.then(x => sharp(x.data)
					.toFile(`${id}.png`)
					.then(async () => {
						const data = new FormData();

						data.append('file', createReadStream(`${id}.png`));

						return axios.post(`${this.sbs.apiURL}File?bucket=discordavatar`, data, {
							headers: {
								'Content-Type': headers['Content-Type'],
								'Authorization': headers['Authorization'],
								...data.getHeaders()
							}
						}).then(x => {
							const sbsid = x.data.id;
							this.avatars.set(id, { sbsAvatar: sbsid, discordAvatar: url });
							return sbsid;
						})
					}))
		}
		if (this.avatars.has(id))
			return this.avatars.get(id)!.sbsAvatar
		throw new Error('Not able to get a SmileBASIC Source avatar for whatever reason???');
	}
}

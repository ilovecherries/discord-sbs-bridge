import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v9';
import { Client, ClientOptions, Intents, Interaction, Message, PartialMessage, TextChannel, ThreadChannel, User, Webhook } from 'discord.js';
import { CommandList } from './command';
import LOADED_COMMANDS from './commandList';
import { SBSLoginCredentials, SmileBASICSource } from './sbs/sbs';
import { Comment } from './sbs/Comment';
import { ChannelPairConfig, ChannelPairHandler } from './ChannelPair';
import { createReadStream, writeFile, readFile } from 'fs';
import axios from 'axios';
import sharp from 'sharp';
import FormData from 'form-data';
const { save_location } = require('./config.json');

class AvatarAssociation {
	constructor(
		public sbsAvatar: number,
		public discordAvatar: string){}
}

export default class SBSBridgeBot extends Client {
    private commands: CommandList = new CommandList();
    public channelList: ChannelPairHandler = new ChannelPairHandler();
	private restConnection: REST;
	private sbs: SmileBASICSource;
	private avatars: Map<string, AvatarAssociation> = new Map<string, AvatarAssociation>();

    constructor(token: string,
				credentials: SBSLoginCredentials,
				options: ClientOptions = {intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES]}) {
        super(options);

		this.on('ready', this.onReady);
        this.on('messageCreate', this.onMessage);
        this.on('interactionCreate', this.onInteractionCreate);
		this.on('messageUpdate', this.onEdit);
		this.on('messageDelete', this.onDelete);
		
		this.commands = LOADED_COMMANDS;
		this.restConnection = new REST({version: '9'}).setToken(token);

		this.load();
		// dummy value because FUCK TYPESCRIPT
		this.avatars.set('x', new AvatarAssociation(-1, ''));
		this.sbs = new SmileBASICSource(this.onSuccessfulPull, credentials);
		
        this.login(token);
    }

	private addApplicationCommands = (guildId: string) => {
		(async () => {
			try {
				console.log(`Started refreshing application (/) commands for ${guildId}.`);

				await this.restConnection.put(
					Routes.applicationGuildCommands(this.user!.id, guildId),
					{ body: this.commands.toJSON() },
				);

				console.log(`Successfully reloaded application (/) commands for ${guildId}.`);
			} catch (error) {
				console.error(error);
			}
		})();
	}

    private onReady = async () => {
        console.log(`Logged in as ${this.user!.tag}`);
		// get all of the guilds that the bot is in then add the application IDs
		// to them
		this.guilds.cache.map(x =>  this.addApplicationCommands(x.id));
		setTimeout(this.save, 30000);
		await this.sbs.connect();
    }

    private onMessage = async (msg: Message) => {
        if (msg.author === this.user)
            return;
		try {
			const channel = this.channelList.getSBS(msg.channelId);
			// filter it out if it's from the webhook
			const webhook = await channel!.discordWebhook(this);
			if (webhook.id === msg.author!.id)
				return;
        	let content = msg.content + 
            	msg.attachments.map(x => `!${x.url}`).join('\n');
			const username = msg.member?.nickname || msg.author.username;
			this.sbs.sendMessage(content, channel!.sbs, {m: '12y', b: username, a: await this.getDiscordAvatar(msg.author)})
				.then(c => channel!.cacheDiscordMessage(msg, c));
		} catch (e) {}
    }

	private getSBSMessage(msg: Message | PartialMessage): Comment | undefined {
 		const channel = this.channelList.getSBS(msg.channelId);
        if (channel === undefined) 
            return;
        return channel.getCachedDiscordMessage(msg.id);
	}

	private onEdit = (before: Message | PartialMessage, after: Message | PartialMessage) => {
		try {
			let message = this.getSBSMessage(before);
        	let content = after.content + 
            	after.attachments.map(x => `!${x.url}`).join('\n');
			const username = after.member?.nickname 
				|| after.author?.username
				|| message!.settings.b 
				|| message!.settings.n;
			this.sbs.editMessage(message!, content, {m: '12y', b: username})
		} catch (e) {
		}
	}

	private onDelete = (msg: Message | PartialMessage) => {
		try {
			let message = this.getSBSMessage(msg);
			this.sbs.deleteMessage(message!);
		} catch (e) {
		}
	}

	private onSuccessfulPull = async (comments: Array<Comment>) => {
		comments
			.map(c => {
				c.textContent = c.textContent.replace('@', '@\u200b');
				this.channelList.getAll()
					.filter(x => x.sbs === c.parentId)
					.map(async d => {
						let w = await d.discordWebhook(this)
						if (c.deleted) {
							try {
								let cachedMessage = d.getCachedSBSMessage(c.id)
								w.deleteMessage(cachedMessage!.id);
							}
							catch (e){}
						} else if (c.editDate !== c.createDate) {
							try {
								let cachedMessage = d.getCachedSBSMessage(c.id)
								w.editMessage(cachedMessage.id, {
									content: c.textContent
								});
							}
							catch (e){}
						} else {
							w.send({
								'username': c.createUser?.username,
								'avatarURL': c.createUser?.getAvatarLink(this.sbs.apiURL),
								'content': c.textContent
							})
								.then(x => d.cacheSBSMessage(c, x as Message))
						}
					})});
	}

	private onInteractionCreate(interaction: Interaction) {
		this.commands.interactionHandler(interaction);
	}

	toJSON() {
		return {
			'channels': this.channelList,
			'avatars': this.avatars
		}
	}

	private load() {
		readFile(save_location, 'utf8', (err, data) => {
			if (err) {
				console.error(err);
				return;
			}
			const parsedData = JSON.parse(data);
			parsedData!.channels!
				.map((x: ChannelPairConfig) => 
					this.channelList.set(x.discordChannelId, x.sbsChannelId));
			const avatars: any = parsedData!.avatars!;
			console.log(avatars)
			if (Array.from(avatars).length !== 0)
				this.avatars = avatars;
		})
	}

	private save = () => {
		writeFile(save_location, JSON.stringify(this), err => {
			if (err) {
				console.error(err)
			}
			setTimeout(this.save, 30000);
		})
	}

	getDiscordAvatar = async (author: User): Promise<number> => {
		const url = author.avatarURL()!;
		const id = author.id;
		let headers = this.sbs.headers;
		headers['Content-Type'] = 'multipart/form-data'
		if (!this.avatars.has(id) || this.avatars.get(id)!.discordAvatar === url) {
			return axios.get(url, {responseType: 'arraybuffer'})
				.then(x => sharp(x.data)
					.toFile(`${id}.png`)
					.then(() => {
						// i give up for now
						const data = new FormData();

						data.append('file', createReadStream(`${id}.png`));

						return axios.post(`${this.sbs.apiURL}File`, data, {headers: {
							'Content-Type': headers['Content-Type'],
							'Authorization': headers['Authorization'],
							...data.getHeaders()
						}}).then(x => {
							const sbsid = x.data.id;
							this.avatars.set(id, {sbsAvatar: sbsid, discordAvatar: url});
							return sbsid;
						}).catch(x => console.error(x))
					}))
		}
		return new Promise((resolve, reject) => {
			if (this.avatars.has(id))
				resolve(this.avatars.get(id)!.sbsAvatar)
			reject('Not able to get a SmileBASIC Source avatar for whatever reason???');
		});
	}
}

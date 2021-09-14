import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v9';
import { Channel, Client, ClientOptions, GuildChannel, Intents, Interaction, Message, TextBasedChannels, TextChannel, Webhook } from 'discord.js';
import { CommandList } from './command';
import LOADED_COMMANDS from './commandList';
import { SBSLoginCredentials, SmileBASICSource } from './sbs';
import { Comment } from './sbs/Comment';

class ChannelPair {
	private discordChannelCached?: TextChannel;

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

    public get sbs() {return this.sbsChannelId}
    public set sbs(newId: number) {this.sbsChannelId = newId}
}

export default class SBSBridgeBot extends Client {
    private commands: CommandList = new CommandList();
    private channelList: Array<ChannelPair> = [];
	private restConnection: REST;
	private sbs: SmileBASICSource;

    constructor(token: string,
				credentials: SBSLoginCredentials,
				options: ClientOptions = {intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES]}) {
        super(options);

		this.on('ready', this.onReady);
        this.on('messageCreate', this.onMessage);
        this.on('interactionCreate', this.onInteractionCreate);
		
		this.commands = LOADED_COMMANDS;
		this.restConnection = new REST({version: '9'}).setToken(token);
        this.channelList.push(new ChannelPair('774531326203527178', 937));
        this.channelList.push(new ChannelPair('774536860374401025', 6661));

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
        console.log(`Logged in as ${this.user?.tag || '???'}`);
		// get all of the guilds that the bot is in then add the application IDs
		// to them
		this.guilds.cache.map(x =>  this.addApplicationCommands(x.id));
		await this.sbs.connect();
    }

    private onMessage = async (msg: Message) => {
        if (msg.author === this.user)
            return;
        let channel = this.channelList.find(x => x.discord === msg.channelId);
        if (channel === undefined) 
            return;
		// filter it out if it's from the webhook
		const webhook = await channel.discordWebhook(this);
		if (webhook.id === msg.author!.id)
			return;
        let content = msg.content + 
            msg.attachments.map(x => `!${x.url}`).join('\n');
		const username = msg.member?.nickname || msg.author.username;
		this.sbs.sendMessage(content, channel!.sbs, {m: '12y', b: username})
    }

	private onSuccessfulPull = async (comments: Array<Comment>) => {
		comments.map(c => {
			c.textContent = c.textContent.replace('@', '@\u200b');
			this.channelList
				.filter(x => x.sbs === c.parentId)
				.map(d => d.discordWebhook(this))
				.map(w => w
					.then(x => 
						x.send({
							'username': c.createUser?.username,
							'avatarURL': c.createUser?.getAvatarLink(this.sbs.apiURL),
							'content': c.textContent
						})))
		})		
	}

	private onInteractionCreate(interaction: Interaction) {
		this.commands.interactionHandler(interaction);
	}
}

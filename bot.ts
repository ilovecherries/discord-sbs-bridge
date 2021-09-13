import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v9';
import { Client, ClientOptions, Intents, Interaction, Message } from 'discord.js';
import { CommandList } from './command';
import LOADED_COMMANDS from './commandList'

class ChannelPair {
    constructor(
        private discordChannelId: string,
        private sbsChannelId: number,
    ) {}

    public get discord(): string {return this.discordChannelId}
    public set discord(newId: string) {this.discordChannelId = newId}
    public get sbs() {return this.sbsChannelId}
    public set sbs(newId: number) {this.sbsChannelId = newId}
}

export default class SBSBridgeBot extends Client {
    private commands: CommandList = new CommandList();
    private channelList: Array<ChannelPair> = [];
	private restConnection: REST;

    constructor(token: string, 
				options: ClientOptions = {intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES]}) {
        super(options);
        this.on('ready', this.onReady);
        this.on('message', this.onMessage);
        this.on('interactionCreate', this.onInteractionCreate);
		this.commands = LOADED_COMMANDS;
		console.log(this.commands.toJSON())
		console.log(this.commands)
		this.restConnection = new REST({version: '9'}).setToken(token)
        this.channelList.push(new ChannelPair('774531326203527178', 937))
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

    private onReady = () => {
        console.log(`Logged in as ${this.user?.tag || '???'}`);
		// get all of the guilds that the bot is in then add the application IDs
		// to them
		this.guilds.cache.map(x =>  this.addApplicationCommands(x.id));
    }

    private onMessage = async (msg: Message) => {
        if (msg.author === this.user)
            return;
        let channels = this.channelList.find(x => x.discord === msg.channelId);
        if (channels === undefined) 
            return;
        let content = msg.content + 
            msg.attachments.map(x => `!${x.url}`).join('\n');
    }

	onInteractionCreate(interaction: Interaction) {
		this.commands.interactionHandler(interaction);
	}
}

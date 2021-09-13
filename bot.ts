import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types';
import { Channel, Client, ClientOptions, Intents, Interaction, Message } from 'discord.js';
import { CommandList } from './command';

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

    constructor(token: string, 
         options: ClientOptions = {intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES]}) {
        super(options);
        this.on('ready', this.onReady);
        this.on('message', this.onMessage);
        this.on('interactionCreate', this.commands.interactionHandler);
        this.channelList.push(new ChannelPair('774531326203527178', 937))
        this.login(token);
    }

    private onReady = () => {
        console.log(`Logged in as ${this.user?.tag || '???'}`);
    }

    private onMessage = async (msg: Message) => {
        if (msg.author === this.user)
            return;
        let channels = this.channelList.find(x => x.discord === msg.channelId);
        if (channels === undefined) 
            return;
        let content = msg.content + 
            msg.attachments.map(x => `!${x.url}`).join('\n');
        console.log(channels?.sbs || -1)
        console.log(channels?.discord || '???')
        console.log(content)
    }
}

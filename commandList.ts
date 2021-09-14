import { SlashCommandBuilder, SlashCommandIntegerOption } from '@discordjs/builders';
import { CommandInteraction, Interaction } from 'discord.js';
import SBSBridgeBot from './bot';
import { ChannelPair } from './ChannelPair';
import { CommandList } from './command';

const commands = new CommandList()

commands.add(
	'ping',
	new SlashCommandBuilder()
		.setDescription('hello, world!'),
	async (i: CommandInteraction, client: SBSBridgeBot) => {
        await i.reply('pong deez nuts');
    }
)

commands.add(
	'bind',
	new SlashCommandBuilder()
		.setDescription('Bind the current Discord channel to the SmileBASIC Source channel ID.')
		.addIntegerOption((option: SlashCommandIntegerOption) =>
			option.setName('id')
				.setDescription('SmileBASIC Source Room ID')
				.setRequired(true)),
	async (i: CommandInteraction, client: SBSBridgeBot) => {
		await i.deferReply()

		client.channelList.set(
			i.channelId!, i.options.getInteger('id')!
		)

		await i.editReply('This channel has been successfully bound!');
	}
)

commands.add(
	'unbind',
	new SlashCommandBuilder()
		.setDescription('Unbinds the current Discord channel from its assigned SmileBASIC Source channel.'),
	async (i: CommandInteraction, client: SBSBridgeBot) => {
		await i.deferReply()

		client.channelList.removeWithDiscordID(i.channelId!)

		await i.editReply('This channel has been successfully bound!');
	}
)

export default commands;

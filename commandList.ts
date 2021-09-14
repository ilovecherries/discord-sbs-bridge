import { SlashCommandBuilder } from '@discordjs/builders';
import { CommandInteraction, Interaction } from 'discord.js';
import SBSBridgeBot from './bot';
import { CommandList } from './command';

const commands = new CommandList()

commands.add(
	'ping',
	new SlashCommandBuilder()
		.setDescription('hello, world!'),
	async (interaction: Interaction, client: SBSBridgeBot) => {
		let i = interaction as CommandInteraction;
		console.log('XD')
        await i.reply('pong deez nuts');
    }
)

export default commands;

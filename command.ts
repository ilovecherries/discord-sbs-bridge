import { SlashCommandBuilder } from '@discordjs/builders';
import { CommandInteraction, Interaction, MessageComponentInteraction } from 'discord.js';


export class Command {
    private slashCommandData: SlashCommandBuilder;
    private func: Function;
	
    constructor(slashCommandData: SlashCommandBuilder, func: Function) {
        this.slashCommandData = slashCommandData;
        this.func = func;
    }

    toJSON() {
        return this.slashCommandData.toJSON();
    }

    public get name(): string {
        return this.slashCommandData.name;
    }

    async run(interaction: CommandInteraction) {
        await this.func(interaction);
    }
}


export class CommandList {
    private commands: Map<string, Command> = new Map<string, Command>();

    add(name: string, builder: SlashCommandBuilder, func: Function) {
        builder = builder.setName(name);
        this.commands.set(name, new Command(builder, func));
    }

    remove(name: string) {
        this.commands.delete(name);
    }

    toJSON() {
        return Array.from(this.commands.values()).map(x => x.toJSON());
    }

    async interactionHandler(interaction: Interaction) {
        if (!interaction.isCommand()) return;
		
        if (this.commands.has(interaction.commandName.toLowerCase())) {
            (async () => {
                await this.commands
                    .get(interaction.commandName)
                    ?.run(interaction);
            })();
        }
    }
}  

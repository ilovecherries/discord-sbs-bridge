import { SlashCommandBuilder } from '@discordjs/builders';
import { CommandInteraction, Interaction } from 'discord.js';
import SBSBridgeBot from './bot';


export class Command {
    private slashCommandData: Omit<SlashCommandBuilder, "addSubcommand" | "addSubcommandGroup">;
    private func: Function;
	
    constructor(slashCommandData: Omit<SlashCommandBuilder, "addSubcommand" | "addSubcommandGroup">, func: Function) {
        this.slashCommandData = slashCommandData;
        this.func = func;
    }

    toJSON() {
        return this.slashCommandData.toJSON();
    }

    public get name(): string {
        return this.slashCommandData.name;
    }

    async run(interaction: CommandInteraction, client: SBSBridgeBot) {
        await this.func(interaction, client);
    }
}


export class CommandList {
    private commands: Map<string, Command> = new Map<string, Command>();

    add(name: string, builder: Omit<SlashCommandBuilder, "addSubcommand" | "addSubcommandGroup">, func: Function) {
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
                    ?.run(interaction, interaction.client as SBSBridgeBot);
            })();
        }
    }
}  

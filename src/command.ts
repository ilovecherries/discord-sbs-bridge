import { SlashCommandBuilder } from '@discordjs/builders';
import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/rest/v9';
import { Client, CommandInteraction, Interaction } from 'discord.js';
import SBSBridgeBot from './bot';


/**
 * A wrapper for a slash command that stores a callback function for the slash
 * command to run as well as some internal metadata
 */
export class Command {
    /**
     * The information about the slash command as provided by SlashCommandBuilder
     */
    private slashCommandData: Omit<SlashCommandBuilder, "addSubcommand" | "addSubcommandGroup">;

    /** 
     * The callback that will be executed once the slash command is triggered
     */
    private func: Function;
	
    /**
     * Creates a new slash command wrapper
     * @param slashCommandData Information about the slash command as made by SlashCommandBuilder
     * @param func The callback function that will be called on run
     */
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

    /**
     * When this is run, it performs the actions that should happen given
     * that an interaction was triggered
     * @param interaction The interaction details
     * @param client The client that the interaction will perform actions on
     */
    async run(interaction: CommandInteraction, client: SBSBridgeBot) {
        await this.func(interaction, client);
    }
}


/**
 * A slash command list handler that can be used to manage a list of slash 
 * commands easily and add them to servers
 */
export class CommandList {
    /**
     * The list of slash commands that will be handled
     */
    private commands: Map<string, Command> = new Map<string, Command>();

    /**
     * Add a new slash command to the list of slash commands
     * @param name The name of the slash command
     * @param builder The inforamtion about the slash command as provided by SlashCommandBuilder, omitting the name
     * @param func The callback function that will be executed when the slash command is triggered
     */
    add(name: string, builder: Omit<SlashCommandBuilder, "addSubcommand" | "addSubcommandGroup">, func: Function) {
        builder = builder.setName(name);
        this.commands.set(name, new Command(builder, func));
    }

    /**
     * Remove a slash command from the list of slash commands
     * @param name The name of the slash command
     */
    remove(name: string) {
        this.commands.delete(name);
    }

    toJSON() {
        return Array.from(this.commands.values()).map(x => x.toJSON());
    }

    /**
     * Add all the stored slash commands to a guild
     * @param client The client to reference the user that creates the interacitons
     * @param restConnection The REST connection that the interactions will be created on
     * @param guildId The guild where the slash commands will be made
     */
    addSlashCommands(client: Client, restConnection: REST, guildId: string) {
		(async () => {
			try {
				console.log(`Started refreshing application (/) commands for ${guildId}.`);

				await restConnection.put(
					Routes.applicationGuildCommands(client.user!.id, guildId),
					{ body: this.toJSON() },
				);

				console.log(`Successfully reloaded application (/) commands for ${guildId}.`);
			} catch (error) {
				console.error(error);
			}
		})();
    }

    /**
     * This should be run whenever an interaction is created in order to execute the given commands
     * @param interaction The interaction that was given from the event fire
     */
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

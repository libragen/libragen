/**
 * completions command - Shell completion using @pnpm/tabtab
 *
 * Programmatically extracts completion info from Commander definitions.
 */

/* eslint-disable no-console, no-process-exit */

import { Command, Option, Argument } from 'commander';
import * as tabtab from '@pnpm/tabtab';

/** Shell types supported by tabtab */
type Shell = 'bash' | 'zsh' | 'fish';

/**
 * Extract command and option info from a Commander program for completions.
 */
function extractCommanderInfo(program: Command): {
   commands: Array<{ name: string; description: string }>;
   globalOptions: Array<{ name: string; description: string }>;
   commandOptions: Record<string, Array<{ name: string; description: string }>>;
   commandArgs: Record<string, string[]>;
} {
   const commands: Array<{ name: string; description: string }> = [];

   const globalOptions: Array<{ name: string; description: string }> = [];

   const commandOptions: Record<string, Array<{ name: string; description: string }>> = {};

   const commandArgs: Record<string, string[]> = {};

   // Extract global options
   for (const opt of program.options as Option[]) {
      const flags = opt.flags.split(/,\s*/).map((f: string) => { return f.trim().split(/\s+/)[0]; });

      for (const flag of flags) {
         if (flag.startsWith('-')) {
            globalOptions.push({ name: flag, description: opt.description || '' });
         }
      }
   }

   // Extract subcommands and their aliases
   for (const cmd of program.commands as Command[]) {
      const cmdName = cmd.name();

      const description = cmd.description() || '';

      commands.push({ name: cmdName, description });

      // Add aliases as separate completions
      const aliases = cmd.aliases();

      for (const alias of aliases) {
         commands.push({ name: alias, description: `${description} (alias for ${cmdName})` });
      }

      commandOptions[cmdName] = [];

      // Register options under both primary name and aliases
      for (const alias of aliases) {
         commandOptions[alias] = commandOptions[cmdName];
      }

      // Extract command options
      for (const opt of cmd.options as Option[]) {
         const flags = opt.flags.split(/,\s*/).map((f: string) => { return f.trim().split(/\s+/)[0]; });

         for (const flag of flags) {
            if (flag.startsWith('-')) {
               commandOptions[cmdName].push({ name: flag, description: opt.description || '' });
            }
         }
      }

      // Extract command arguments for hinting
      const args = (cmd as unknown as { registeredArguments?: Argument[] }).registeredArguments || [];

      commandArgs[cmdName] = args.map((arg: Argument) => { return arg.name(); });
   }

   return { commands, globalOptions, commandOptions, commandArgs };
}

/**
 * Get installed library names for dynamic completion.
 * Uses a simple file listing instead of LibraryManager to avoid slow initialization.
 */
async function getInstalledLibraries(): Promise<string[]> {
   try {
      const { homedir } = await import('os');

      const { readdir } = await import('fs/promises');

      const { join } = await import('path');

      // Check platform-specific library directory
      const platform = process.platform;

      let libDir: string;

      if (platform === 'darwin') {
         libDir = join(homedir(), 'Library', 'Application Support', 'libragen', 'libraries');
      } else if (platform === 'win32') {
         libDir = join(process.env.APPDATA || '', 'libragen', 'libraries');
      } else {
         libDir = join(process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share'), 'libragen', 'libraries');
      }

      const files = await readdir(libDir).catch(() => { return [] as string[]; });

      return files
         .filter((f) => { return f.endsWith('.libragen'); })
         .map((f) => { return f.replace(/-[\d.]+\.libragen$/, ''); }); // Extract library name
   } catch{
      return [];
   }
}

interface CommandCompletionContext {
   currentCommand: string;
   env: tabtab.ParseEnvResult;
   shell: Shell;
   cmdOpts: Array<{ name: string; description: string }>;
   globalOptions: Array<{ name: string; description: string }>;
   lastWord: string;
}

/**
 * Handle completions for a specific command's arguments/options.
 * Returns true if completion was handled, false otherwise.
 */
async function handleCommandCompletion(ctx: CommandCompletionContext): Promise<boolean> {
   const { currentCommand, env, shell, cmdOpts, globalOptions, lastWord } = ctx;

   // Check if previous word needs a value
   if (env.prev === '-l' || env.prev === '--library') {
      const libs = await getInstalledLibraries();

      tabtab.log(libs, shell, console.log);
      return true;
   }

   // Complete shell types for completions command
   if (currentCommand === 'completions') {
      tabtab.log([ 'bash', 'zsh', 'fish', 'install', 'uninstall' ], shell, console.log);
      return true;
   }

   // Complete collection subcommands
   if (currentCommand === 'collection') {
      tabtab.log(
         [
            { name: 'list', description: 'List configured collections' },
            { name: 'add', description: 'Add a collection' },
            { name: 'remove', description: 'Remove a collection' },
            { name: 'search', description: 'Search collections for libraries' },
            { name: 'clear-cache', description: 'Clear collection cache' },
            { name: 'create', description: 'Create a collection file (template if no libraries)' },
            { name: 'pack', description: 'Pack a collection into a distributable archive' },
            { name: 'unpack', description: 'Unpack a collection archive' },
         ],
         shell,
         console.log
      );
      return true;
   }

   // Complete uninstall with library names (uninstall has alias 'u')
   if (currentCommand === 'uninstall' || currentCommand === 'u') {
      const libs = await getInstalledLibraries();

      tabtab.log(libs, shell, console.log);
      return true;
   }

   // If typing a flag (starts with -), show options
   if (lastWord.startsWith('-') || env.line.endsWith(' ')) {
      const completions = [
         ...cmdOpts.map((opt) => { return { name: opt.name, description: opt.description }; }),
         ...globalOptions.map((opt) => { return { name: opt.name, description: opt.description }; }),
      ];

      tabtab.log(completions, shell, console.log);
      return true;
   }

   // For commands expecting files as first arg, use filesystem completion
   // (build has alias 'b')
   if (currentCommand === 'build' || currentCommand === 'b' || currentCommand === 'install' || currentCommand === 'inspect') {
      tabtab.logFiles();
      return true;
   }

   return false;
}

/**
 * Handle completion requests from the shell.
 */
async function handleCompletion(program: Command): Promise<void> {
   const env = tabtab.parseEnv(process.env);

   if (!env.complete) {
      return;
   }

   // getShellFromEnv expects the raw process.env, not the parsed env
   const shell = tabtab.getShellFromEnv(process.env) as Shell,
         { commands, globalOptions, commandOptions } = extractCommanderInfo(program),
         words = env.line.split(/\s+/).filter(Boolean),
         currentCommand = words.length > 1 ? words[1] : null,
         lastWord = env.last || '';

   // Completing the command name (first argument after 'libragen')
   if (words.length === 1 || (words.length === 2 && !env.line.endsWith(' '))) {
      const completions = commands
         .filter((cmd) => { return cmd.name !== 'completion-server'; }) // Hide internal command
         .map((cmd) => {
            return {
               name: cmd.name,
               description: cmd.description,
            };
         });

      tabtab.log(completions, shell, console.log);
      return;
   }

   // If we have a command, complete its options or arguments
   if (currentCommand && currentCommand !== 'completion-server') {
      const cmdOpts = commandOptions[currentCommand] || [];

      const handled = await handleCommandCompletion({
         currentCommand,
         env,
         shell,
         cmdOpts,
         globalOptions,
         lastWord,
      });

      if (handled) {
         return;
      }

      // Default: show options
      const completions = [
         ...cmdOpts.map((opt) => { return { name: opt.name, description: opt.description }; }),
         ...globalOptions.map((opt) => { return { name: opt.name, description: opt.description }; }),
      ];

      tabtab.log(completions, shell, console.log);
      return;
   }

   // Default: show commands
   const completions = commands
      .filter((cmd) => { return cmd.name !== 'completion-server'; })
      .map((cmd) => {
         return {
            name: cmd.name,
            description: cmd.description,
         };
      });

   tabtab.log(completions, shell, console.log);
}

/**
 * Create a hidden completion-server command that tabtab calls for completions.
 */
export function createCompletionServerCommand(program: Command): Command {
   const cmd = new Command('completion-server')
      .allowUnknownOption()
      .allowExcessArguments()
      .helpOption(false)
      .action(async () => {
         await handleCompletion(program);
      });

   // Hide from help output
   (cmd as unknown as { _hidden: boolean })._hidden = true;
   return cmd;
}

/**
 * Create a completions command that has access to the full program for introspection.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function createCompletionsCommand(program: Command): Command {
   return new Command('completions')
      .description('Manage shell completions')
      .argument('[action]', 'Action: install, uninstall, or shell name (bash/zsh/fish) for script output')
      .action(async (action?: string) => {

         if (!action) {
            console.log('Usage: libragen completions <action>');
            console.log('');
            console.log('Actions:');
            console.log('  install     Install shell completions (interactive)');
            console.log('  uninstall   Remove shell completions');
            console.log('  bash        Output bash completion script');
            console.log('  zsh         Output zsh completion script');
            console.log('  fish        Output fish completion script');
            return;
         }

         const actionLower = action.toLowerCase();

         if (actionLower === 'install') {
            await tabtab.install({
               name: 'libragen',
               completer: 'libragen',
            });
            console.log('Completions installed. Restart your shell or source your profile.');
            return;
         }

         if (actionLower === 'uninstall') {
            await tabtab.uninstall({ name: 'libragen' });
            console.log('Completions uninstalled.');
            return;
         }

         // Output completion script for specific shell
         if ([ 'bash', 'zsh', 'fish' ].includes(actionLower)) {
            const script = await tabtab.getCompletionScript({
               name: 'libragen',
               completer: 'libragen',
               shell: actionLower as Shell,
            });

            console.log(script);
            return;
         }

         console.error(`Unknown action: ${action}`);
         console.error('Valid actions: install, uninstall, bash, zsh, fish');
         process.exit(1);
      }) as unknown as Command;
}

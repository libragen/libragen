#!/usr/bin/env node
/**
 * @libragen/cli - Command-line interface for libragen
 *
 * Provides commands for building, querying, and managing libragen libraries.
 */

import { Command } from 'commander';
import { VERSION } from '@libragen/core';
import { buildCommand } from './commands/build.ts';
import { queryCommand } from './commands/query.ts';
import { listCommand } from './commands/list.ts';
import { installCommand } from './commands/install.ts';
import { uninstallCommand } from './commands/uninstall.ts';
import { updateCommand } from './commands/update.ts';
import { collectionCommand } from './commands/collection.ts';
import { configCommand } from './commands/config.ts';
import { inspectCommand } from './commands/inspect.ts';
import { createCompletionsCommand, createCompletionServerCommand } from './commands/completions.ts';

const program = new Command();

program
   .name('libragen')
   .description('Create, manage, and query RAG-ready libraries')
   .version(VERSION, '-V, --cli-version', 'Output the CLI version');

// Register commands
program.addCommand(buildCommand);
program.addCommand(queryCommand);
program.addCommand(listCommand);
program.addCommand(installCommand);
program.addCommand(uninstallCommand);
program.addCommand(updateCommand);
program.addCommand(collectionCommand);
program.addCommand(configCommand);
program.addCommand(inspectCommand);
program.addCommand(createCompletionsCommand(program));
program.addCommand(createCompletionServerCommand(program));

program.parse();

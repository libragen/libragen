/**
 * Uninstall command - Remove an installed library or collection
 */

/* eslint-disable no-console, no-process-exit */

import { Command } from 'commander';
import chalk from 'chalk';
import { LibraryManager } from '@libragen/core';

interface UninstallOptions {
   path?: string[];
   collection?: boolean;
}

export const uninstallCommand = new Command('uninstall')
   .alias('u')
   .description('Remove an installed library or collection')
   .argument('<name>', 'Library or collection name to uninstall')
   .option('-p, --path <paths...>', 'Library path(s) to search (excludes global and auto-detection)')
   .option('-c, --collection', 'Uninstall a collection (and unreferenced libraries)')
   .action(async (name: string, options: UninstallOptions) => {
      try {
         // If explicit paths provided, use only those
         const manager = new LibraryManager(
            options.path
               ? { paths: options.path }
               : undefined
         );

         if (options.collection) {
            // Uninstall collection
            const collection = await manager.getCollection(name);

            if (!collection) {
               console.error(chalk.red(`\nError: Collection '${name}' not found`));
               process.exit(1);
            }

            const removed = await manager.uninstallCollection(name);

            console.log(chalk.green(`\n✓ Uninstalled collection ${chalk.bold(name)}`));

            if (removed.length > 0) {
               console.log(`  ${chalk.dim('Removed libraries:')} ${removed.join(', ')}`);
            } else {
               console.log(`  ${chalk.dim('No libraries removed (still used by other collections)')}`);
            }

            console.log('');
         } else {
            // Uninstall library
            const lib = await manager.find(name);

            if (!lib) {
               // Check if it's a collection
               const collection = await manager.getCollection(name);

               if (collection) {
                  console.error(chalk.red(`\nError: '${name}' is a collection, not a library`));
                  console.log(chalk.dim('Use --collection flag to uninstall collections'));
                  process.exit(1);
               }

               console.error(chalk.red(`\nError: Library '${name}' not found`));
               process.exit(1);
            }

            const removed = await manager.uninstall(name);

            if (removed) {
               console.log(chalk.green(`\n✓ Uninstalled ${chalk.bold(name)}`));
               console.log(`  ${chalk.dim('Removed:')} ${lib.path}`);
               console.log('');
            } else {
               // Library is still referenced by a collection
               console.log(chalk.yellow(`\n⚠ Library '${name}' is still used by a collection`));
               console.log(chalk.dim('  Uninstall the collection first, or the library will remain'));
               console.log('');
            }
         }
      } catch(error) {
         console.error(chalk.red(`\nError: ${error instanceof Error ? error.message : String(error)}`));
         process.exit(1);
      }
   });

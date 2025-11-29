/**
 * Update command - Update installed libraries to newer versions
 */

/* eslint-disable no-console, no-process-exit */

import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs/promises';
import ora from 'ora';
import chalk from 'chalk';
import { LibraryManager, CollectionClient, Library } from '@libragen/core';
import type { InstalledLibrary, CollectionEntry } from '@libragen/core';

interface UpdateOptions {
   path?: string[];
   force?: boolean;
   dryRun?: boolean;
}

interface UpdateCandidate {
   name: string;
   currentVersion: string;
   currentContentVersion?: string;
   newVersion: string;
   newContentVersion?: string;
   source: string;
   location: 'global' | 'project';
}

async function findUpdates(
   toCheck: InstalledLibrary[],
   client: CollectionClient,
   options: UpdateOptions
): Promise<UpdateCandidate[]> {
   const updates: UpdateCandidate[] = [];

   for (const lib of toCheck) {
      // Try to find in collections
      const entry = await client.getEntry(lib.name);

      if (!entry) {
         continue;
      }

      const candidate = checkForUpdate(lib, entry, options);

      if (candidate) {
         updates.push(candidate);
      }
   }

   return updates;
}

function checkForUpdate(
   lib: InstalledLibrary,
   entry: CollectionEntry,
   options: UpdateOptions
): UpdateCandidate | null {
   const hasNewerVersion = entry.version !== lib.version,
         hasNewerContent = entry.contentVersion && entry.contentVersion !== lib.contentVersion;

   if (hasNewerVersion || hasNewerContent || options.force) {
      return {
         name: lib.name,
         currentVersion: lib.version,
         currentContentVersion: lib.contentVersion,
         newVersion: entry.version,
         newContentVersion: entry.contentVersion,
         source: entry.downloadURL,
         location: lib.location,
      };
   }

   return null;
}

function displayUpdates(updates: UpdateCandidate[]): void {
   console.log(chalk.bold('\nUpdates available:'));
   console.log('');

   for (const update of updates) {
      const versionChange = update.currentVersion === update.newVersion
         ? chalk.dim(update.currentVersion)
         : `${chalk.dim(update.currentVersion)} → ${chalk.green(update.newVersion)}`;

      let contentChange = '';

      if (update.newContentVersion && update.currentContentVersion !== update.newContentVersion) {
         const current = update.currentContentVersion || 'unknown';

         contentChange = ` (content: ${chalk.dim(current)} → ${chalk.green(update.newContentVersion)})`;
      }

      console.log(`  ${chalk.bold(update.name)} ${versionChange}${contentChange}`);
   }

   console.log('');
}

async function performUpdate(
   update: UpdateCandidate,
   manager: LibraryManager
): Promise<void> {
   const response = await fetch(update.source);

   if (!response.ok) {
      throw new Error(`Failed to download: ${response.status}`);
   }

   const tempPath = path.join(
      // eslint-disable-next-line no-process-env
      process.env.TMPDIR || '/tmp',
      `libragen-update-${Date.now()}.libragen`
   );

   const buffer = await response.arrayBuffer();

   await fs.writeFile(tempPath, Buffer.from(buffer));

   // Verify the downloaded library
   const newLib = await Library.open(tempPath);

   newLib.close();

   // Install with force to overwrite
   await manager.install(tempPath, {
      force: true,
   });

   await fs.unlink(tempPath);
}

export const updateCommand = new Command('update')
   .alias('up')
   .description('Update libraries from their collections (only works for libraries installed from collections)')
   .argument('[name]', 'Library name to update (updates all collection libraries if omitted)')
   .option('-p, --path <paths...>', 'Library path(s) to search (excludes global and auto-detection)')
   .option('-f, --force', 'Force update even if versions match')
   .option('-n, --dry-run', 'Show what would be updated without making changes')
   .action(async (name: string | undefined, options: UpdateOptions) => {
      const spinner = ora();

      try {
         // If explicit paths provided, use only those
         const manager = new LibraryManager(
            options.path
               ? { paths: options.path }
               : undefined
         );

         const client = new CollectionClient();

         await client.loadConfig();

         // Get installed libraries
         spinner.start('Checking installed libraries...');

         const installed = await manager.listInstalled();

         if (installed.length === 0) {
            spinner.info('No libraries installed');
            return;
         }

         // Filter by name if specified
         const toCheck = name
            ? installed.filter((lib) => {
               return lib.name === name;
            })
            : installed;

         if (name && toCheck.length === 0) {
            spinner.fail(`Library '${name}' is not installed`);
            process.exit(1);
         }

         // Check for updates
         spinner.text = 'Checking for updates...';

         const updates = await findUpdates(toCheck, client, options);

         spinner.stop();

         if (updates.length === 0) {
            console.log(chalk.green('✓ All libraries are up to date'));
            return;
         }

         displayUpdates(updates);

         if (options.dryRun) {
            console.log(chalk.yellow('Dry run - no changes made'));
            return;
         }

         // Perform updates
         spinner.start('Updating libraries...');

         let updated = 0,
             failed = 0;

         for (const update of updates) {
            spinner.text = `Updating ${update.name}...`;

            try {
               await performUpdate(update, manager);
               updated += 1;
            } catch(error) {
               const msg = error instanceof Error ? error.message : String(error);

               console.error(chalk.red(`\n  Failed to update ${update.name}: ${msg}`));
               failed += 1;
            }
         }

         if (updated > 0) {
            spinner.succeed(`Updated ${updated} ${updated === 1 ? 'library' : 'libraries'}`);
         } else {
            spinner.stop();
         }

         if (failed > 0) {
            console.log(chalk.red(`  ${failed} ${failed === 1 ? 'library' : 'libraries'} failed to update`));
            process.exit(1);
         }

         console.log('');
      } catch(error) {
         spinner.fail('Update failed');
         console.error(chalk.red(`\nError: ${error instanceof Error ? error.message : String(error)}`));
         process.exit(1);
      }
   });

/**
 * List command - List installed libraries and collections
 */

/* eslint-disable no-console, no-process-exit */

import { Command } from 'commander';
import chalk from 'chalk';
import { LibraryManager, formatBytes } from '@libragen/core';
import type { InstalledLibrary, InstalledCollection } from '@libragen/core';

interface ListOptions {
   json?: boolean;
   verbose?: boolean;
   path?: string[];
   libraries?: boolean;
   collections?: boolean;
}

export const listCommand = new Command('list')
   .alias('l')
   .description('List installed libraries and collections')
   .option('--json', 'Output as JSON')
   .option('-v, --verbose', 'Show detailed information')
   .option('-p, --path <paths...>', 'Library path(s) to use (excludes global and auto-detection)')
   .option('--libraries', 'Show only libraries')
   .option('--collections', 'Show only collections')
   .action(async (options: ListOptions) => {
      try {
         // If explicit paths provided, use only those (no global, no auto-detect)
         const manager = new LibraryManager(
            options.path
               ? { paths: options.path }
               : undefined
         );

         const showLibraries = !options.collections || options.libraries,
               showCollections = !options.libraries || options.collections;

         const libraries = showLibraries ? await manager.listInstalled() : [],
               collections = showCollections ? await manager.listCollections() : [];

         if (options.json) {
            console.log(JSON.stringify({ libraries, collections }, null, 2));
            return;
         }

         const hasContent = libraries.length > 0 || collections.length > 0;

         if (!hasContent) {
            printEmptyMessage();
            return;
         }

         // Show collections
         if (showCollections && collections.length > 0) {
            printCollections(collections, options.verbose);
         }

         // Show libraries
         if (showLibraries && libraries.length > 0) {
            printLibraries(libraries, options.verbose);
         }
      } catch(error) {
         console.error(chalk.red(`\nError: ${error instanceof Error ? error.message : String(error)}`));
         process.exit(1);
      }
   });

function printEmptyMessage(): void {
   console.log(chalk.yellow('\nNo libraries or collections installed.\n'));
   console.log('Install libraries with:');
   console.log(chalk.cyan('  libragen install <file.libragen>'));
   console.log('');
   console.log('Install collections with:');
   console.log(chalk.cyan('  libragen install <collection.json>'));
   console.log('');
   console.log('Or build a library with:');
   console.log(chalk.cyan('  libragen build <source>'));
   console.log('');
}

function printCollections(collections: InstalledCollection[], verbose?: boolean): void {
   console.log(chalk.bold(`\n📦 Installed Collections (${collections.length})\n`));

   for (const col of collections) {
      console.log(`  ${chalk.bold(col.name)} ${col.version ? chalk.dim(`v${col.version}`) : ''}`);
      console.log(`    ${chalk.dim('Libraries:')} ${col.libraries.length}`);

      if (verbose) {
         printCollectionDetails(col);
      }

      console.log('');
   }
}

function printCollectionDetails(col: InstalledCollection): void {
   console.log(`    ${chalk.dim('Source:')} ${col.source}`);
   console.log(`    ${chalk.dim('Installed:')} ${col.installedAt}`);

   if (col.libraries.length > 0) {
      console.log(`    ${chalk.dim('Includes:')} ${col.libraries.join(', ')}`);
   }
}

function printLibraries(libraries: InstalledLibrary[], verbose?: boolean): void {
   console.log(chalk.bold(`\n📚 Installed Libraries (${libraries.length})\n`));

   for (const lib of libraries) {
      const locationBadge = lib.location === 'project'
         ? chalk.blue('[project]')
         : chalk.dim('[global]');

      console.log(`  ${chalk.bold(lib.name)} ${chalk.dim(`v${lib.version}`)} ${locationBadge}`);

      if (lib.contentVersion) {
         console.log(`    ${chalk.dim('Content:')} ${lib.contentVersion}`);
      }

      if (lib.description) {
         console.log(`    ${chalk.dim(lib.description)}`);
      }

      if (verbose) {
         printLibraryDetails(lib);
      }

      console.log('');
   }
}

function printLibraryDetails(lib: InstalledLibrary): void {
   console.log(`    ${chalk.dim('Path:')} ${lib.path}`);
   console.log(`    ${chalk.dim('Chunks:')} ${lib.metadata.stats.chunkCount}`);
   console.log(`    ${chalk.dim('Size:')} ${formatBytes(lib.metadata.stats.fileSize)}`);

   if (lib.metadata.keywords?.length) {
      console.log(`    ${chalk.dim('Keywords:')} ${lib.metadata.keywords.join(', ')}`);
   }

   if (lib.metadata.programmingLanguages?.length) {
      console.log(`    ${chalk.dim('Programming Languages:')} ${lib.metadata.programmingLanguages.join(', ')}`);
   }

   if (lib.metadata.textLanguages?.length) {
      console.log(`    ${chalk.dim('Text Languages:')} ${lib.metadata.textLanguages.join(', ')}`);
   }
}

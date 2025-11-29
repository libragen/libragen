/**
 * Collection command - Manage library collections
 */

/* eslint-disable no-console, no-process-exit */

import { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import * as tar from 'tar';
import { CollectionClient, formatBytes } from '@libragen/core';
import type { CollectionDefinition, CollectionItem } from '@libragen/core';

export const collectionCommand = new Command('collection')
   .description('Manage library collections');

// collection list
collectionCommand
   .command('list')
   .description('List configured collections')
   .option('--json', 'Output as JSON')
   .action(async (options: { json?: boolean }) => {
      try {
         const client = new CollectionClient();

         await client.loadConfig();

         const collections = client.getCollections();

         if (options.json) {
            console.log(JSON.stringify(collections, null, 2));
            return;
         }

         if (collections.length === 0) {
            console.log(chalk.yellow('\nNo collections configured.\n'));
            console.log('Add a collection with:');
            console.log(chalk.cyan('  libragen collection add <name> <url>'));
            console.log('');
            return;
         }

         console.log(chalk.bold('\n📦 Configured Collections\n'));

         for (const coll of collections) {
            console.log(`  ${chalk.bold(coll.name)} ${chalk.dim(`(priority: ${coll.priority})`)}`);
            console.log(`    ${chalk.dim(coll.url)}`);
            console.log('');
         }
      } catch(error) {
         console.error(chalk.red(`\nError: ${error instanceof Error ? error.message : String(error)}`));
         process.exit(1);
      }
   });

// collection add
collectionCommand
   .command('add')
   .description('Add a collection')
   .argument('<name>', 'Collection name')
   .argument('<url>', 'Collection URL')
   .option('-p, --priority <number>', 'Priority (lower = higher priority)', '10')
   .action(async (name: string, url: string, options: { priority: string }) => {
      try {
         const client = new CollectionClient();

         await client.loadConfig();

         await client.addCollection({
            name,
            url,
            priority: parseInt(options.priority, 10),
         });

         console.log(chalk.green(`\n✓ Added collection '${name}'`));
         console.log(`  ${chalk.dim('URL:')} ${url}`);
         console.log(`  ${chalk.dim('Priority:')} ${options.priority}`);
         console.log('');
      } catch(error) {
         console.error(chalk.red(`\nError: ${error instanceof Error ? error.message : String(error)}`));
         process.exit(1);
      }
   });

// collection remove
collectionCommand
   .command('remove')
   .description('Remove a collection')
   .argument('<name>', 'Collection name')
   .action(async (name: string) => {
      try {
         const client = new CollectionClient();

         await client.loadConfig();

         const removed = await client.removeCollection(name);

         if (removed) {
            console.log(chalk.green(`\n✓ Removed collection '${name}'`));
            console.log('');
         } else {
            console.error(chalk.red(`\nError: Collection '${name}' not found`));
            process.exit(1);
         }
      } catch(error) {
         console.error(chalk.red(`\nError: ${error instanceof Error ? error.message : String(error)}`));
         process.exit(1);
      }
   });

// collection search
collectionCommand
   .command('search')
   .description('Search collections for libraries')
   .argument('<query>', 'Search query')
   .option('--json', 'Output as JSON')
   .option('--content-version <version>', 'Filter by content version')
   .action(async (query: string, options: { json?: boolean; contentVersion?: string }) => {
      try {
         const client = new CollectionClient();

         await client.loadConfig();

         const collections = client.getCollections();

         if (collections.length === 0) {
            console.error(chalk.yellow('\nNo collections configured.'));
            console.log('Add a collection with:');
            console.log(chalk.cyan('  libragen collection add <name> <url>'));
            process.exit(1);
         }

         const results = await client.search(query, {
            contentVersion: options.contentVersion,
         });

         if (options.json) {
            console.log(JSON.stringify(results, null, 2));
            return;
         }

         if (results.length === 0) {
            console.log(chalk.yellow(`\nNo libraries found matching '${query}'`));
            console.log('');
            return;
         }

         console.log(chalk.bold(`\n🔍 Search Results (${results.length})\n`));

         for (const entry of results) {
            console.log(`  ${chalk.bold(entry.name)} ${chalk.dim(`v${entry.version}`)}`);

            if (entry.contentVersion) {
               console.log(`    ${chalk.dim('Content:')} ${entry.contentVersion}`);
            }

            if (entry.description) {
               console.log(`    ${chalk.dim(entry.description)}`);
            }

            console.log(`    ${chalk.dim('Collection:')} ${entry.collection}`);
            console.log('');
         }

         console.log('Install with:');
         console.log(chalk.cyan('  libragen install <name>'));
         console.log('');
      } catch(error) {
         console.error(chalk.red(`\nError: ${error instanceof Error ? error.message : String(error)}`));
         process.exit(1);
      }
   });

// collection clear-cache
collectionCommand
   .command('clear-cache')
   .description('Clear the collection cache')
   .action(async () => {
      try {
         const client = new CollectionClient();

         await client.clearCache();

         console.log(chalk.green('\n✓ Collection cache cleared'));
         console.log('');
      } catch(error) {
         console.error(chalk.red(`\nError: ${error instanceof Error ? error.message : String(error)}`));
         process.exit(1);
      }
   });

// collection create
collectionCommand
   .command('create')
   .description('Create a new collection file (creates a template if no libraries specified)')
   .argument('<output>', 'Output file path (.json)')
   .option('-n, --name <name>', 'Collection name')
   .option('-d, --description <desc>', 'Collection description')
   .option('-v, --version <version>', 'Collection version', '1.0.0')
   .option('-l, --library <source...>', 'Add library (can be used multiple times)')
   .option('-c, --collection <source...>', 'Add nested collection (can be used multiple times)')
   .option('-o, --optional <source...>', 'Add optional library (can be used multiple times)')
   .action(async (output: string, options: CreateOptions) => {
      try {
         await createCollection(output, options);
      } catch(error) {
         console.error(chalk.red(`\nError: ${error instanceof Error ? error.message : String(error)}`));
         process.exit(1);
      }
   });

interface CreateOptions {
   name?: string;
   description?: string;
   version: string;
   library?: string[];
   collection?: string[];
   optional?: string[];
}

async function createCollection(output: string, options: CreateOptions): Promise<void> {
   // Ensure .json extension
   const outputPath = output.endsWith('.json') ? output : `${output}.json`;

   // Derive name from filename if not provided
   const name = options.name || path.basename(outputPath, '.json');

   // Check if any libraries/collections were specified
   const hasItems = options.library?.length || options.optional?.length || options.collection?.length;

   // Build items array
   const items: CollectionItem[] = [];

   if (hasItems) {
      // Add required libraries
      if (options.library) {
         for (const lib of options.library) {
            items.push({ library: lib });
         }
      }

      // Add optional libraries
      if (options.optional) {
         for (const lib of options.optional) {
            items.push({ library: lib, required: false });
         }
      }

      // Add nested collections
      if (options.collection) {
         for (const coll of options.collection) {
            items.push({ collection: coll });
         }
      }
   } else {
      // Create a template with placeholder
      items.push({ library: 'https://example.com/library.libragen' });
   }

   const definition: CollectionDefinition = {
      name,
      version: options.version,
      items,
   };

   if (options.description) {
      definition.description = options.description;
   } else if (!hasItems) {
      // Add placeholder description for templates
      definition.description = 'My library collection';
   }

   // Write the file
   await fs.writeFile(outputPath, JSON.stringify(definition, null, 2) + '\n');

   if (hasItems) {
      console.log(chalk.green(`\n✓ Created collection '${name}'`));
      console.log(`  ${chalk.dim('File:')} ${outputPath}`);
      console.log(`  ${chalk.dim('Libraries:')} ${(options.library?.length || 0) + (options.optional?.length || 0)}`);

      if (options.optional?.length) {
         console.log(`  ${chalk.dim('Optional:')} ${options.optional.length}`);
      }

      if (options.collection?.length) {
         console.log(`  ${chalk.dim('Nested collections:')} ${options.collection.length}`);
      }

      console.log('');
      console.log('Install with:');
      console.log(chalk.cyan(`  libragen install ${outputPath}`));
      console.log('');
   } else {
      // Template output
      console.log(chalk.green(`\n✓ Created collection template '${name}'`));
      console.log(`  ${chalk.dim('File:')} ${outputPath}`);
      console.log('');
      console.log('Edit the file to add your libraries, then install with:');
      console.log(chalk.cyan(`  libragen install ${outputPath}`));
      console.log('');
      console.log(chalk.dim('Collection format:'));
      console.log(chalk.dim('  { "library": "path/to/lib.libragen" }           - Required library'));
      console.log(chalk.dim('  { "library": "...", "required": false }         - Optional library'));
      console.log(chalk.dim('  { "collection": "path/to/other.json" }          - Nested collection'));
      console.log('');
   }
}

// collection pack
collectionCommand
   .command('pack')
   .description('Bundle a collection and its libraries into a single file for sharing')
   .argument('<collection>', 'Collection file (.json) to pack')
   .option('-o, --output <path>', 'Output file path (.libragen-collection)')
   .action(async (collection: string, options: { output?: string }) => {
      const spinner = ora();

      try {
         const collectionPath = path.resolve(collection);

         // Read and parse collection
         spinner.start('Reading collection...');

         const collectionContent = await fs.readFile(collectionPath, 'utf-8');

         const collectionDef: CollectionDefinition = JSON.parse(collectionContent);

         const collectionDir = path.dirname(collectionPath);

         // Gather all library files
         const libraries: { name: string; sourcePath: string }[] = [];

         for (const item of collectionDef.items) {
            if (item.library) {
               const libPath = path.isAbsolute(item.library)
                  ? item.library
                  : path.resolve(collectionDir, item.library);

               try {
                  await fs.access(libPath);
                  libraries.push({
                     name: path.basename(libPath),
                     sourcePath: libPath,
                  });
               } catch(_e) {
                  spinner.fail(`Library not found: ${item.library}`);
                  process.exit(1);
               }
            }
         }

         spinner.succeed(`Found ${libraries.length} libraries`);

         // Create output path
         const outputPath = options.output || `${collectionDef.name || 'collection'}.libragen-collection`;

         // Create a temp directory for packing
         const tempDir = path.join(
            process.env.TMPDIR || '/tmp',
            `libragen-pack-${Date.now()}`
         );

         await fs.mkdir(tempDir, { recursive: true });

         // Copy libraries to temp dir
         spinner.start('Copying libraries...');

         for (const lib of libraries) {
            await fs.copyFile(lib.sourcePath, path.join(tempDir, lib.name));
         }

         // Create modified collection with relative paths
         const packedCollection: CollectionDefinition = {
            ...collectionDef,
            items: collectionDef.items.map((item) => {
               if (item.library) {
                  return {
                     ...item,
                     library: `./${path.basename(item.library)}`,
                  };
               }

               return item;
            }),
         };

         await fs.writeFile(
            path.join(tempDir, 'collection.json'),
            JSON.stringify(packedCollection, null, 2)
         );

         spinner.succeed('Prepared files');

         // Create tar.gz archive
         spinner.start('Creating archive...');

         await tar.create(
            {
               gzip: true,
               file: outputPath,
               cwd: tempDir,
            },
            [ '.' ]
         );

         // Cleanup temp dir
         await fs.rm(tempDir, { recursive: true });

         // Get file size
         const stats = await fs.stat(outputPath);

         spinner.succeed('Archive created');

         console.log(chalk.bold.green('\n✓ Packed collection successfully!\n'));
         console.log(`  ${chalk.dim('File:')}      ${path.resolve(outputPath)}`);
         console.log(`  ${chalk.dim('Size:')}      ${formatBytes(stats.size)}`);
         console.log(`  ${chalk.dim('Libraries:')} ${libraries.length}`);
         console.log('');
         console.log('Share this file, then unpack with:');
         console.log(chalk.cyan(`  libragen collection unpack ${outputPath}`));
         console.log('');
      } catch(error) {
         spinner.fail('Pack failed');
         console.error(chalk.red(`\nError: ${error instanceof Error ? error.message : String(error)}`));
         process.exit(1);
      }
   });

// collection unpack
collectionCommand
   .command('unpack')
   .description('Extract a packed collection to a directory')
   .argument('<pack>', 'Packed collection file (.libragen-collection)')
   .option('-o, --output <dir>', 'Output directory (default: current directory)')
   .option('-i, --install', 'Install the collection after unpacking')
   .action(async (pack: string, options: { output?: string; install?: boolean }) => {
      const spinner = ora();

      try {
         const packPath = path.resolve(pack);

         // Verify file exists
         try {
            await fs.access(packPath);
         } catch(_e) {
            console.error(chalk.red(`Error: File not found: ${packPath}`));
            process.exit(1);
         }

         const outputDir = options.output ? path.resolve(options.output) : process.cwd();

         // Extract archive
         spinner.start('Extracting archive...');

         await fs.mkdir(outputDir, { recursive: true });

         await tar.extract({
            file: packPath,
            cwd: outputDir,
         });

         spinner.succeed('Extracted archive');

         // Read collection to show info
         const collectionPath = path.join(outputDir, 'collection.json');

         const collectionContent = await fs.readFile(collectionPath, 'utf-8');

         const collectionDef: CollectionDefinition = JSON.parse(collectionContent);

         const libraryCount = collectionDef.items.filter((i) => { return i.library; }).length;

         console.log(chalk.bold.green(`\n✓ Unpacked collection '${collectionDef.name}'!\n`));
         console.log(`  ${chalk.dim('Location:')}  ${outputDir}`);
         console.log(`  ${chalk.dim('Libraries:')} ${libraryCount}`);
         console.log('');

         if (options.install) {
            spinner.start('Installing collection...');

            // Import dynamically to avoid circular deps
            const { LibraryManager } = await import('@libragen/core');

            const manager = new LibraryManager();

            const result = await manager.installCollection(collectionPath, {
               force: false,
               includeOptional: false,
            });

            spinner.succeed(`Installed ${result.installed.length} libraries`);

            if (result.skipped.length > 0) {
               console.log(`  ${chalk.yellow('Skipped:')} ${result.skipped.join(', ')} (already installed)`);
            }
         } else {
            console.log('Install with:');
            console.log(chalk.cyan(`  libragen install ${collectionPath}`));
         }

         console.log('');
      } catch(error) {
         spinner.fail('Unpack failed');
         console.error(chalk.red(`\nError: ${error instanceof Error ? error.message : String(error)}`));
         process.exit(1);
      }
   });

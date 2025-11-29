/**
 * Install command - Install a library or collection
 */

/* eslint-disable no-console, no-process-exit */

import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs/promises';
import ora from 'ora';
import chalk from 'chalk';
import { LibraryManager, CollectionClient } from '@libragen/core';

interface InstallOptions {
   path?: string;
   force?: boolean;
   collection?: string;
   contentVersion?: string;
   all?: boolean;
   select?: boolean;
}

export const installCommand = new Command('install')
   .description('Install a library or collection')
   .argument('<source>', 'Library file (.libragen), collection file (.json), or URL')
   .option('-p, --path <path>', 'Install to specific directory (default: global or auto-detected project)')
   .option('-f, --force', 'Overwrite existing libraries')
   .option('-c, --collection <url>', 'Legacy: Collection URL to search for library name')
   .option('--content-version <version>', 'Install specific content version')
   .option('-a, --all', 'Install all libraries including optional (for collections)')
   .option('-s, --select', 'Interactively select optional libraries (for collections)')
   .action(async (source: string, options: InstallOptions) => {
      const spinner = ora();

      try {
         // If explicit path provided, use only that; otherwise use default (auto-detect +
         // global)
         const manager = new LibraryManager(
            options.path
               ? { paths: [ options.path ] }
               : undefined
         );

         // Determine source type
         const isCollection = manager.isCollection(source),
               isLibraryFile = source.endsWith('.libragen'),
               isPackedCollection = source.endsWith('.libragen-collection'),
               isLocalPath = source.includes(path.sep) || source.startsWith('.'),
               isURL = source.startsWith('http://') || source.startsWith('https://');

         if (isPackedCollection) {
            // Install from packed collection (unpack and install)
            await installPackedCollection(manager, source, options, spinner);
         } else if (isCollection || (isURL && source.endsWith('.json'))) {
            // Install collection
            await installCollection(manager, source, options, spinner);
         } else if (isLibraryFile || isLocalPath) {
            // Install from local library file
            await installLocalLibrary(manager, source, options, spinner);
         } else if (isURL) {
            // Install from remote library URL
            await installRemoteLibrary(manager, source, options, spinner);
         } else {
            // Legacy: search in configured collections by name
            await installFromLegacyCollection(source, options, spinner, manager);
         }

         console.log('');
      } catch(error) {
         spinner.fail('Installation failed');
         console.error(chalk.red(`\nError: ${error instanceof Error ? error.message : String(error)}`));
         process.exit(1);
      }
   });

async function installLocalLibrary(
   manager: LibraryManager,
   source: string,
   options: InstallOptions,
   spinner: ReturnType<typeof ora>
): Promise<void> {
   const sourcePath = path.resolve(source);

   try {
      await fs.access(sourcePath);
   } catch(_e) {
      console.error(chalk.red(`Error: File not found: ${sourcePath}`));
      process.exit(1);
   }

   spinner.start(`Installing from ${sourcePath}...`);

   const installed = await manager.install(sourcePath, {
      force: options.force,
   });

   spinner.succeed(`Installed ${chalk.bold(installed.name)} v${installed.version}`);
   console.log(`  ${chalk.dim('Location:')} ${installed.path}`);
}

async function installRemoteLibrary(
   manager: LibraryManager,
   source: string,
   options: InstallOptions,
   spinner: ReturnType<typeof ora>
): Promise<void> {
   spinner.start(`Downloading from ${source}...`);

   // Download to temp file
   const response = await fetch(source);

   if (!response.ok) {
      throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
   }

   const tempPath = path.join(
      // eslint-disable-next-line no-process-env
      process.env.TMPDIR || '/tmp',
      `libragen-download-${Date.now()}.libragen`
   );

   const buffer = await response.arrayBuffer();

   await fs.writeFile(tempPath, Buffer.from(buffer));

   spinner.text = 'Installing...';

   const installed = await manager.install(tempPath, {
      force: options.force,
   });

   await fs.unlink(tempPath);

   spinner.succeed(`Installed ${chalk.bold(installed.name)} v${installed.version}`);
   console.log(`  ${chalk.dim('Location:')} ${installed.path}`);
}

async function installCollection(
   manager: LibraryManager,
   source: string,
   options: InstallOptions,
   spinner: ReturnType<typeof ora>
): Promise<void> {
   // Preview collection first
   spinner.start('Resolving collection...');

   const preview = await manager.previewCollection(source);

   spinner.stop();

   console.log(chalk.bold('\nCollection contents:'));
   console.log(`  ${chalk.green('Required:')} ${preview.required.length} libraries`);

   for (const lib of preview.required) {
      console.log(`    • ${lib.name}`);
   }

   if (preview.optional.length > 0) {
      console.log(`  ${chalk.yellow('Optional:')} ${preview.optional.length} libraries`);

      for (const lib of preview.optional) {
         console.log(`    • ${lib.name}`);
      }
   }

   console.log('');

   // Determine which optional libraries to include
   let selectOptional: string[] | undefined;

   if (options.select && preview.optional.length > 0) {
      // Interactive selection (simplified - just list them for now)
      console.log(chalk.dim('Use --all to include all optional libraries'));
      console.log('');
   }

   // Install the collection
   spinner.start('Installing collection...');

   const result = await manager.installCollection(source, {
      force: options.force,
      includeOptional: options.all,
      selectOptional,
      onProgress: (progress) => {
         if (progress.libraryName) {
            spinner.text = `${progress.phase}: ${progress.libraryName} (${progress.current}/${progress.total})`;
         } else {
            spinner.text = progress.message || 'Installing...';
         }
      },
   });

   spinner.succeed(`Installed collection ${chalk.bold(result.collectionName)}`);

   if (result.installed.length > 0) {
      console.log(`  ${chalk.green('Installed:')} ${result.installed.join(', ')}`);
   }

   if (result.skipped.length > 0) {
      console.log(`  ${chalk.yellow('Skipped:')} ${result.skipped.join(', ')} (already installed)`);
   }

   if (result.failed.length > 0) {
      console.log(`  ${chalk.red('Failed:')}`);

      for (const f of result.failed) {
         console.log(`    • ${f.name}: ${f.error}`);
      }
   }
}

async function installFromLegacyCollection(
   source: string,
   options: InstallOptions,
   spinner: ReturnType<typeof ora>,
   manager: LibraryManager
): Promise<void> {
   // Legacy: search in configured collections by name
   spinner.start('Searching collections...');

   const client = new CollectionClient();

   await client.loadConfig();

   // Add custom collection if specified
   if (options.collection) {
      await client.addCollection({
         name: 'custom',
         url: options.collection,
         priority: 0,
      });
   }

   const collections = client.getCollections();

   if (collections.length === 0) {
      spinner.fail('No collections configured');
      console.log('');
      console.log('Add a collection with:');
      console.log(chalk.cyan('  libragen collection add <name> <url>'));
      process.exit(1);
   }

   const entry = await client.getEntry(source);

   if (!entry) {
      spinner.fail(`Library '${source}' not found in collections`);
      process.exit(1);
   }

   spinner.text = `Downloading ${entry.name} v${entry.version}...`;

   const tempPath = path.join(
      // eslint-disable-next-line no-process-env
      process.env.TMPDIR || '/tmp',
      `libragen-download-${Date.now()}.libragen`
   );

   await client.download(entry, tempPath, {
      onProgress: (progress: { percent: number }) => {
         spinner.text = `Downloading ${entry.name}... ${progress.percent.toFixed(0)}%`;
      },
   });

   spinner.text = 'Installing...';

   const installed = await manager.install(tempPath, {
      force: options.force,
   });

   await fs.unlink(tempPath);

   spinner.succeed(`Installed ${chalk.bold(installed.name)} v${installed.version}`);
   console.log(`  ${chalk.dim('Location:')} ${installed.path}`);

   if (installed.contentVersion) {
      console.log(`  ${chalk.dim('Content:')} ${installed.contentVersion}`);
   }
}

async function installPackedCollection(
   manager: LibraryManager,
   source: string,
   options: InstallOptions,
   spinner: ReturnType<typeof ora>
): Promise<void> {
   const sourcePath = path.resolve(source);

   try {
      await fs.access(sourcePath);
   } catch(_e) {
      console.error(chalk.red(`Error: File not found: ${sourcePath}`));
      process.exit(1);
   }

   spinner.start('Extracting packed collection...');

   // Import tar dynamically
   const tar = await import('tar');

   // Create temp directory for extraction
   const tempDir = path.join(
      process.env.TMPDIR || '/tmp',
      `libragen-install-${Date.now()}`
   );

   await fs.mkdir(tempDir, { recursive: true });

   // Extract the archive
   await tar.extract({
      file: sourcePath,
      cwd: tempDir,
   });

   spinner.succeed('Extracted');

   // Find and install the collection
   const collectionPath = path.join(tempDir, 'collection.json');

   try {
      await fs.access(collectionPath);
   } catch(_e) {
      await fs.rm(tempDir, { recursive: true });
      throw new Error('Invalid packed collection: missing collection.json');
   }

   // Install the collection from the extracted directory
   await installCollection(manager, collectionPath, options, spinner);

   // Cleanup temp directory
   await fs.rm(tempDir, { recursive: true });
}

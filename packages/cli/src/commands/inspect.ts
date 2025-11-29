/**
 * Inspect command - View contents of .libragen and .libragen-collection files
 */

/* eslint-disable no-console, no-process-exit */

import { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';
import chalk from 'chalk';
import ora from 'ora';
import * as tar from 'tar';
import { Library, formatBytes } from '@libragen/core';
import type { CollectionDefinition } from '@libragen/core';

export const inspectCommand = new Command('inspect')
   .description('Inspect the contents of a library (.libragen) or packed collection (.libragen-collection)')
   .argument('<source>', 'Library file, packed collection, or URL')
   .option('--json', 'Output as JSON')
   .action(async (source: string, options: { json?: boolean }) => {
      const spinner = ora();

      try {
         let filePath = source,
             tempFile: string | null = null;

         // Handle URLs
         if (source.startsWith('http://') || source.startsWith('https://')) {
            spinner.start('Downloading file...');

            const response = await fetch(source);

            if (!response.ok) {
               throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
            }

            const ext = source.endsWith('.libragen-collection') ? '.libragen-collection' : '.libragen';

            tempFile = path.join(
               process.env.TMPDIR || '/tmp',
               `libragen-inspect-${Date.now()}${ext}`
            );

            const buffer = await response.arrayBuffer();

            await fs.writeFile(tempFile, Buffer.from(buffer));
            filePath = tempFile;
            spinner.succeed('Downloaded');
         }

         // Resolve path
         filePath = path.resolve(filePath);

         // Verify file exists
         try {
            await fs.access(filePath);
         } catch(_e) {
            console.error(chalk.red(`Error: File not found: ${filePath}`));
            process.exit(1);
         }

         // Detect file type and inspect
         if (filePath.endsWith('.libragen-collection')) {
            await inspectCollection(filePath, options.json ?? false, spinner);
         } else if (filePath.endsWith('.libragen')) {
            await inspectLibrary(filePath, options.json ?? false, spinner);
         } else {
            // Try to detect by content
            // First try as library (SQLite), then as collection (tar.gz)
            try {
               await inspectLibrary(filePath, options.json ?? false, spinner);
            } catch(_e) {
               try {
                  await inspectCollection(filePath, options.json ?? false, spinner);
               } catch(_e2) {
                  console.error(chalk.red('Error: Unable to determine file type. Use .libragen or .libragen-collection extension.'));
                  process.exit(1);
               }
            }
         }

         // Cleanup temp file
         if (tempFile) {
            await fs.unlink(tempFile);
         }
      } catch(error) {
         spinner.fail('Inspection failed');
         console.error(chalk.red(`\nError: ${error instanceof Error ? error.message : String(error)}`));
         process.exit(1);
      }
   });

async function inspectLibrary(filePath: string, json: boolean, spinner: ReturnType<typeof ora>): Promise<void> {
   spinner.start('Reading library...');

   const library = await Library.open(filePath, { readOnly: true });

   const metadata = library.getMetadata();

   const stats = await fs.stat(filePath);

   library.close();

   spinner.stop();

   if (json) {
      console.log(JSON.stringify({
         type: 'library',
         file: filePath,
         fileSize: stats.size,
         metadata: {
            name: metadata.name,
            version: metadata.version,
            description: metadata.description,
            agentDescription: metadata.agentDescription,
            contentVersion: metadata.contentVersion,
            contentVersionType: metadata.contentVersionType,
            schemaVersion: metadata.schemaVersion,
            createdAt: metadata.createdAt,
            embedding: metadata.embedding,
            chunking: metadata.chunking,
            stats: metadata.stats,
            license: metadata.license,
            source: metadata.source,
            keywords: metadata.keywords,
            programmingLanguages: metadata.programmingLanguages,
            frameworks: metadata.frameworks,
         },
      }, null, 2));

      return;
   }

   console.log(chalk.bold('\n📚 Library Contents\n'));
   console.log(`  ${chalk.dim('File:')}    ${filePath}`);
   console.log(`  ${chalk.dim('Size:')}    ${formatBytes(stats.size)}`);

   console.log('');
   console.log(chalk.bold('  Metadata:'));
   console.log(`    ${chalk.dim('Name:')}        ${metadata.name}`);
   console.log(`    ${chalk.dim('Version:')}     ${metadata.version}`);

   if (metadata.description) {
      console.log(`    ${chalk.dim('Description:')} ${metadata.description}`);
   }

   if (metadata.contentVersion) {
      // eslint-disable-next-line max-len
      console.log(`    ${chalk.dim('Content:')}     ${metadata.contentVersion}${metadata.contentVersionType ? ` (${metadata.contentVersionType})` : ''}`);
   }

   console.log(`    ${chalk.dim('Schema:')}      v${metadata.schemaVersion}`);
   console.log(`    ${chalk.dim('Created:')}     ${metadata.createdAt}`);

   console.log('');
   console.log(chalk.bold('  Stats:'));
   console.log(`    ${chalk.dim('Chunks:')}      ${metadata.stats.chunkCount.toLocaleString()}`);
   console.log(`    ${chalk.dim('Sources:')}     ${metadata.stats.sourceCount.toLocaleString()} files`);

   if (metadata.embedding) {
      console.log('');
      console.log(chalk.bold('  Embedding:'));
      console.log(`    ${chalk.dim('Model:')}       ${metadata.embedding.model}`);
      console.log(`    ${chalk.dim('Dimensions:')}  ${metadata.embedding.dimensions}`);
   }

   if (metadata.chunking) {
      console.log('');
      console.log(chalk.bold('  Chunking:'));
      console.log(`    ${chalk.dim('Strategy:')}    ${metadata.chunking.strategy}`);
      console.log(`    ${chalk.dim('Chunk size:')}  ${metadata.chunking.chunkSize} chars`);
      console.log(`    ${chalk.dim('Overlap:')}     ${metadata.chunking.chunkOverlap} chars`);
   }

   if (metadata.source) {
      console.log('');
      console.log(chalk.bold('  Source:'));
      console.log(`    ${chalk.dim('Type:')}        ${metadata.source.type}`);

      if (metadata.source.url) {
         console.log(`    ${chalk.dim('URL:')}         ${metadata.source.url}`);
      }

      if (metadata.source.ref) {
         console.log(`    ${chalk.dim('Ref:')}         ${metadata.source.ref}`);
      }

      if (metadata.source.commitHash) {
         console.log(`    ${chalk.dim('Commit:')}      ${metadata.source.commitHash.substring(0, 12)}`);
      }
   }

   if (metadata.license && metadata.license.length > 0) {
      console.log('');
      console.log(chalk.bold('  License(s):'));

      for (const lic of metadata.license) {
         console.log(`    • ${lic}`);
      }
   }

   if (metadata.keywords && metadata.keywords.length > 0) {
      console.log('');
      console.log(chalk.bold('  Keywords:'));
      console.log(`    ${metadata.keywords.join(', ')}`);
   }

   if (metadata.programmingLanguages && metadata.programmingLanguages.length > 0) {
      console.log('');
      console.log(chalk.bold('  Languages:'));
      console.log(`    ${metadata.programmingLanguages.join(', ')}`);
   }

   if (metadata.frameworks && metadata.frameworks.length > 0) {
      console.log('');
      console.log(chalk.bold('  Frameworks:'));
      console.log(`    ${metadata.frameworks.join(', ')}`);
   }

   console.log('');
}

async function inspectCollection(filePath: string, json: boolean, spinner: ReturnType<typeof ora>): Promise<void> {
   spinner.start('Reading collection...');

   // Get file stats
   const stats = await fs.stat(filePath);

   // List archive contents
   const files: { path: string; size: number }[] = [];

   await tar.list({
      file: filePath,
      onReadEntry: (entry) => {
         files.push({
            path: entry.path,
            size: entry.size || 0,
         });
      },
   });

   // Extract collection.json to temp to read metadata
   const tempDir = path.join(
      process.env.TMPDIR || '/tmp',
      `libragen-inspect-${Date.now()}`
   );

   await fs.mkdir(tempDir, { recursive: true });

   await tar.extract({
      file: filePath,
      cwd: tempDir,
      filter: (p) => { return p === 'collection.json' || p === './collection.json'; },
   });

   // Read collection metadata
   let collectionDef: CollectionDefinition | undefined;

   try {
      const collectionContent = await fs.readFile(
         path.join(tempDir, 'collection.json'),
         'utf-8'
      );

      collectionDef = JSON.parse(collectionContent);
   } catch(_e) {
      // Collection.json might not exist or be readable
   }

   // Cleanup temp dir
   await fs.rm(tempDir, { recursive: true });

   spinner.stop();

   // Filter to just .libragen files
   const libraries = files.filter((f) => { return f.path.endsWith('.libragen'); });

   if (json) {
      console.log(JSON.stringify({
         type: 'collection',
         file: filePath,
         fileSize: stats.size,
         collection: collectionDef ? {
            name: collectionDef.name,
            version: collectionDef.version,
            description: collectionDef.description,
         } : null,
         libraries: libraries.map((l) => {
            return {
               name: path.basename(l.path),
               size: l.size,
            };
         }),
      }, null, 2));

      return;
   }

   console.log(chalk.bold('\n📦 Collection Contents\n'));
   console.log(`  ${chalk.dim('File:')} ${filePath}`);
   console.log(`  ${chalk.dim('Size:')} ${formatBytes(stats.size)}`);

   if (collectionDef) {
      console.log('');
      console.log(chalk.bold('  Metadata:'));
      console.log(`    ${chalk.dim('Name:')}    ${collectionDef.name}`);

      if (collectionDef.version) {
         console.log(`    ${chalk.dim('Version:')} ${collectionDef.version}`);
      }

      if (collectionDef.description) {
         console.log(`    ${chalk.dim('Desc:')}    ${collectionDef.description}`);
      }
   }

   console.log('');
   console.log(chalk.bold(`  Libraries (${libraries.length}):`));

   for (const lib of libraries) {
      const name = path.basename(lib.path);

      console.log(`    • ${name} ${chalk.dim(`(${formatBytes(lib.size)})`)}`);
   }

   console.log('');
   console.log('Install with:');
   console.log(chalk.cyan(`  libragen install ${filePath}`));
   console.log('');
}

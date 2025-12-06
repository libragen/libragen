/**
 * Query command - Search a .libragen library
 */

/* eslint-disable no-console, no-process-exit */

import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs/promises';
import ora from 'ora';
import chalk from 'chalk';
import { Embedder, VectorStore, Searcher, LibraryManager } from '@libragen/core';

interface QueryOptions {
   library: string;
   path?: string[];
   k?: string;
   hybridAlpha?: string;
   json?: boolean;
   contentVersion?: string;
   contextBefore?: string;
   contextAfter?: string;
}

/**
 * Determine if a value looks like a file path vs a library name.
 * A path contains path separators or ends with .libragen.
 */
function isFilePath(value: string): boolean {
   return value.includes('/') || value.includes('\\') || value.endsWith('.libragen');
}

/**
 * Resolve a library path from either a file path or library name.
 */
async function resolveLibraryPath(
   library: string,
   paths: string[] | undefined,
   spinner: ReturnType<typeof ora>,
   isJson: boolean
): Promise<string> {
   if (isFilePath(library)) {
      const libraryPath = path.resolve(library);

      try {
         await fs.access(libraryPath);
      } catch(_e) {
         console.error(chalk.red(`Error: Library not found: ${libraryPath}`));
         process.exit(1);
      }

      return libraryPath;
   }

   // Treat as a library name - use LibraryManager to resolve
   if (!isJson) {
      spinner.start(`Resolving library '${library}'...`);
   }

   // Transform paths to .libragen/libraries subdirectories
   const transformedPaths = paths?.map((p) => {
      return path.join(p, '.libragen', 'libraries');
   });

   const manager = new LibraryManager(transformedPaths ? { paths: transformedPaths } : undefined);

   const installed = await manager.find(library);

   if (!installed) {
      if (!isJson) {
         spinner.fail(`Library '${library}' not found`);
      }
      console.error(chalk.red(`\nError: Library '${library}' is not installed.`));
      console.error(chalk.dim('Use `libragen list` to see installed libraries.'));
      process.exit(1);
   }

   if (!isJson) {
      spinner.succeed(`Found library at ${chalk.dim(installed.path)}`);
   }

   return installed.path;
}

/**
 * Print search results to the console.
 */
function printResults(results: Awaited<ReturnType<Searcher['search']>>): void {
   if (results.length === 0) {
      console.log(chalk.yellow('\nNo results found.'));
      return;
   }

   console.log(chalk.bold(`\n📚 Found ${results.length} results:\n`));

   for (const [ index, result ] of results.entries()) {
      printSingleResult(result, index);
   }
}

/**
 * Print a single search result.
 */
function printSingleResult(
   result: Awaited<ReturnType<Searcher['search']>>[number],
   index: number
): void {
   const sourceInfo = result.sourceFile
      ? chalk.dim(path.basename(result.sourceFile))
      : chalk.dim('unknown source');

   const lineInfo = result.startLine ? chalk.dim(`:${result.startLine}`) : '';

   console.log(chalk.bold.cyan(`${index + 1}. ${sourceInfo}${lineInfo}`));
   console.log(chalk.dim(`   Score: ${result.score.toFixed(4)}`));

   if (result.contentVersion) {
      console.log(chalk.dim(`   Version: ${result.contentVersion}`));
   }

   console.log('');

   printContextBefore(result);
   printMainContent(result);
   printContextAfter(result);

   console.log('');
}

function printContextBefore(result: Awaited<ReturnType<Searcher['search']>>[number]): void {
   if (!result.contextBefore || result.contextBefore.length === 0) {
      return;
   }

   for (const chunk of result.contextBefore) {
      const ctxLine = chunk.startLine ? `:${chunk.startLine}` : '';

      console.log(chalk.dim(`   [context${ctxLine}]`));
      console.log(chalk.dim(`   ${chunk.content.trim().split('\n').join('\n   ')}`));
      console.log('');
   }
   console.log(chalk.dim('   --- match ---'));
   console.log('');
}

function printMainContent(result: Awaited<ReturnType<Searcher['search']>>[number]): void {
   const content = result.content.trim();

   console.log(`   ${content.split('\n').join('\n   ')}`);
}

function printContextAfter(result: Awaited<ReturnType<Searcher['search']>>[number]): void {
   if (!result.contextAfter || result.contextAfter.length === 0) {
      return;
   }

   console.log('');
   console.log(chalk.dim('   --- match ---'));

   for (const chunk of result.contextAfter) {
      const ctxLine = chunk.startLine ? `:${chunk.startLine}` : '';

      console.log('');
      console.log(chalk.dim(`   [context${ctxLine}]`));
      console.log(chalk.dim(`   ${chunk.content.trim().split('\n').join('\n   ')}`));
   }
}

export const queryCommand = new Command('query')
   .alias('q')
   .description('Search a .libragen library')
   .argument('<query>', 'Search query')
   .requiredOption('-l, --library <name-or-path>', 'Library name or path to .libragen file')
   .option('-p, --path <paths...>', 'Project directory (will search <path>/.libragen/libraries)')
   .option('-k <number>', 'Number of results to return', '5')
   .option('--hybrid-alpha <number>', 'Balance between vector (1) and keyword (0) search', '0.5')
   .option('--content-version <version>', 'Filter by content version')
   .option('--context-before <n>', 'Number of chunks to include before each result')
   .option('--context-after <n>', 'Number of chunks to include after each result')
   .option('--json', 'Output results as JSON')
   .action(async (query: string, options: QueryOptions) => {
      const spinner = ora();

      try {
         const libraryPath = await resolveLibraryPath(
            options.library,
            options.path,
            spinner,
            Boolean(options.json)
         );

         if (!options.json) {
            spinner.start('Loading embedding model...');
         }

         const embedder = new Embedder();

         await embedder.initialize();

         if (!options.json) {
            spinner.succeed('Embedding model loaded');
         }

         const store = new VectorStore(libraryPath);

         store.initialize();

         const searcher = new Searcher(embedder, store),
               k = parseInt(options.k || '10', 10),
               hybridAlpha = parseFloat(options.hybridAlpha || '0.5'),
               contextBefore = options.contextBefore ? parseInt(options.contextBefore, 10) : undefined,
               contextAfter = options.contextAfter ? parseInt(options.contextAfter, 10) : undefined;

         if (!options.json) {
            spinner.start('Searching...');
         }

         const results = await searcher.search({
            query,
            k,
            hybridAlpha,
            contentVersion: options.contentVersion,
            contextBefore,
            contextAfter,
         });

         if (!options.json) {
            spinner.stop();
         }

         if (options.json) {
            console.log(JSON.stringify(results, null, 2));
         } else {
            printResults(results);
         }

         store.close();
         await embedder.dispose();
      } catch(error) {
         spinner.fail('Query failed');
         console.error(chalk.red(`\nError: ${error instanceof Error ? error.message : String(error)}`));
         process.exit(1);
      }
   });

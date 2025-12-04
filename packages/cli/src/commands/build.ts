/**
 * Build command - Creates a .libragen library from source files
 */

/* eslint-disable no-console, no-process-exit */

import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import {
   Builder,
   formatBytes,
   formatDuration,
   isGitUrl,
   parseGitUrl,
   estimateEmbeddingTime,
   formatSystemInfo,
} from '@libragen/core';
import type { BuildProgress } from '@libragen/core';

interface BuildOptions {
   output?: string;
   name?: string;
   version?: string;
   contentVersion?: string;
   description?: string;
   agentDescription?: string;
   exampleQueries?: string[];
   keywords?: string[];
   programmingLanguages?: string[];
   textLanguages?: string[];
   frameworks?: string[];
   chunkSize?: string;
   chunkOverlap?: string;
   include?: string[];
   exclude?: string[];
   noDefaultExcludes?: boolean;
   gitRef?: string;
   gitRepoAuthToken?: string;
   license?: string[];
}

export const buildCommand = new Command('build')
   .alias('b')
   .description('Build a .libragen library from source files')
   .argument('<source>', 'Source directory or file to index')
   .option('-o, --output <path>', 'Output path for the .libragen file')
   .option('-n, --name <name>', 'Library name (defaults to directory name)')
   .option('-v, --version <version>', 'Library version (default: 0.1.0)', '0.1.0')
   .option('--content-version <version>', 'Version of the source content')
   .option('-d, --description <text>', 'Short description of the library')
   .option('--agent-description <text>', 'Guidance for AI agents on when to use this library')
   .option('--example-queries <queries...>', 'Example queries this library can answer')
   .option('--keywords <keywords...>', 'Searchable keywords/tags')
   .option('--programming-languages <langs...>', 'Programming languages covered (e.g., typescript python)')
   .option('--text-languages <langs...>', 'Human/natural languages of the content as ISO 639-1 codes (e.g., en es zh)')
   .option('--frameworks <frameworks...>', 'Frameworks covered (e.g., react express)')
   .option('--chunk-size <size>', 'Target chunk size in characters', '1000')
   .option('--chunk-overlap <overlap>', 'Chunk overlap in characters', '100')
   .option('-i, --include <patterns...>', 'Glob patterns to include')
   .option('-e, --exclude <patterns...>', 'Glob patterns to exclude (added to defaults)')
   .option('--no-default-excludes', 'Disable default exclusions (node_modules, .git, dist, etc.)')
   .option('--git-ref <ref>', 'Git branch, tag, or commit to checkout (remote git sources only)')
   .option('--git-repo-auth-token <token>', 'Auth token for private git repositories (remote git sources only)', undefined)
   .option('--license <licenses...>', 'SPDX license identifier(s) for the source content')
   .action(async (source: string, options: BuildOptions) => {
      const spinner = ora();

      try {
         // Display initial info
         const isGit = isGitUrl(source);

         if (isGit) {
            const parsed = parseGitUrl(source);

            console.log(chalk.bold('\n📚 Building libragen library from git\n'));
            console.log(`  Repository: ${chalk.cyan(parsed.repoUrl)}`);
            if (options.gitRef || parsed.ref) {
               console.log(`  Ref:        ${chalk.cyan(options.gitRef || parsed.ref)}`);
            }
            if (parsed.path) {
               console.log(`  Path:       ${chalk.cyan(parsed.path)}`);
            }
            console.log('');
         } else {
            console.log(chalk.bold('\n📚 Building libragen library\n'));
            console.log(`  Source:  ${chalk.cyan(source)}`);
         }

         // Track time estimate display state
         let estimateShown = false;

         // Progress callback handler
         const handleBuildProgress = (progress: BuildProgress): void => {
            switch (progress.phase) {
               case 'cloning': {
                  spinner.start(progress.message);
                  break;
               }
               case 'loading-model': {
                  spinner.start(progress.message);
                  break;
               }
               case 'chunking': {
                  if (spinner.isSpinning) {
                     spinner.succeed();
                  }
                  spinner.start(progress.message);
                  break;
               }
               case 'embedding': {
                  if (!estimateShown && progress.total) {
                     // Show time estimate before embedding starts
                     if (spinner.isSpinning) {
                        spinner.succeed();
                     }
                     const estimate = estimateEmbeddingTime(progress.total);

                     const estMsg = `${chalk.yellow(estimate.formattedTime)} ` +
                        `(~${Math.round(estimate.chunksPerSecond)} chunks/sec)`;

                     console.log('');
                     console.log(`  ${chalk.dim('System:')}      ${formatSystemInfo(estimate.systemInfo)}`);
                     console.log(`  ${chalk.dim('Est. time:')}   ${estMsg}`);
                     console.log('');
                     estimateShown = true;
                  }
                  spinner.start(progress.message);
                  break;
               }
               case 'creating-database': {
                  if (spinner.isSpinning) {
                     spinner.succeed();
                  }
                  spinner.start(progress.message);
                  break;
               }
               case 'complete': {
                  if (spinner.isSpinning) {
                     spinner.succeed();
                  }
                  break;
               }
               default: {
                  spinner.start(progress.message);
               }
            }
         };

         // Build using the Builder class
         const builder = new Builder();

         const buildOptions = {
            output: options.output,
            name: options.name,
            version: options.version,
            contentVersion: options.contentVersion,
            description: options.description,
            agentDescription: options.agentDescription,
            exampleQueries: options.exampleQueries,
            keywords: options.keywords,
            programmingLanguages: options.programmingLanguages,
            textLanguages: options.textLanguages,
            frameworks: options.frameworks,
            chunkSize: options.chunkSize ? parseInt(options.chunkSize, 10) : undefined,
            chunkOverlap: options.chunkOverlap ? parseInt(options.chunkOverlap, 10) : undefined,
            include: options.include,
            exclude: options.exclude,
            noDefaultExcludes: options.noDefaultExcludes,
            gitRef: options.gitRef,
            gitRepoAuthToken: options.gitRepoAuthToken,
            license: options.license,
         };

         const result = await builder.build(source, buildOptions, handleBuildProgress);

         // Show git-specific info
         if (result.git) {
            spinner.info(`Commit: ${result.git.commitHash.slice(0, 8)}`);
            if (result.git.detectedLicense) {
               const licenseMsg = `Detected license: ${result.git.detectedLicense.identifier} ` +
                  `(${result.git.detectedLicense.confidence} confidence)`;

               spinner.info(licenseMsg);
            }
         }

         // Summary
         console.log(chalk.bold.green('\n✅ Library built successfully!\n'));
         console.log(`  ${chalk.dim('File:')}        ${result.outputPath}`);
         console.log(`  ${chalk.dim('Size:')}        ${formatBytes(result.stats.fileSize)}`);
         console.log(`  ${chalk.dim('Chunks:')}      ${result.stats.chunkCount}`);
         console.log(`  ${chalk.dim('Sources:')}     ${result.stats.sourceCount} files`);
         const embedMsg = `${formatDuration(result.stats.embedDuration)} ` +
            `(~${result.stats.chunksPerSecond} chunks/sec)`;

         console.log(`  ${chalk.dim('Embed time:')}  ${embedMsg}`);
         if (result.metadata.source?.licenses?.length) {
            console.log(`  ${chalk.dim('License:')}     ${result.metadata.source.licenses.join(', ')}`);
         }
         console.log(`  ${chalk.dim('Hash:')}        ${result.metadata.contentHash.replace('sha256:', '').slice(0, 16)}...`);
         console.log('');
      } catch(error) {
         spinner.fail('Build failed');
         console.error(chalk.red(`\nError: ${error instanceof Error ? error.message : String(error)}`));
         process.exit(1);
      }
   });

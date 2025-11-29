/**
 * Build command - Creates a .libragen library from source files
 */

/* eslint-disable no-console, no-process-exit */

import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs/promises';
import ora from 'ora';
import chalk from 'chalk';
import {
   Embedder,
   Chunker,
   VectorStore,
   GitSource,
   isGitUrl,
   parseGitUrl,
   getAuthToken,
   CURRENT_SCHEMA_VERSION,
   formatBytes,
   deriveGitLibraryName,
} from '@libragen/core';
import type { LibraryMetadata, SourceProvenance, GitSourceResult } from '@libragen/core';
import { createHash } from 'crypto';
import { estimateEmbeddingTime, formatSystemInfo } from '../time-estimate.js';

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
   // eslint-disable-next-line complexity
   .action(async (source: string, options: BuildOptions) => {
      const spinner = ora();

      let gitResult: GitSourceResult | undefined;

      const gitSource = new GitSource();

      try {
         // Detect if source is a git URL
         const isGit = isGitUrl(source);

         let includePatterns = options.include,
             sourcePath: string,
             sourceProvenance: SourceProvenance;

         if (isGit) {
            // Parse git URL to extract repo, ref, and path
            const parsed = parseGitUrl(source);

            const ref = options.gitRef || parsed.ref;

            const token = getAuthToken(parsed.repoUrl, options.gitRepoAuthToken);

            // If URL contains a path, prepend it to include patterns
            if (parsed.path) {
               const pathPattern = parsed.path.endsWith('/') || !parsed.path.includes('.')
                  ? `${parsed.path}/**`
                  : parsed.path;

               includePatterns = includePatterns
                  ? [ pathPattern, ...includePatterns ]
                  : [ pathPattern ];
            }

            console.log(chalk.bold('\n📚 Building libragen library from git\n'));
            console.log(`  Repository: ${chalk.cyan(parsed.repoUrl)}`);
            if (ref) {
               console.log(`  Ref:        ${chalk.cyan(ref)}`);
            }
            if (parsed.path) {
               console.log(`  Path:       ${chalk.cyan(parsed.path)}`);
            }
            console.log('');

            // Clone the repository
            spinner.start('Cloning repository...');
            gitResult = await gitSource.getFiles({
               url: parsed.repoUrl,
               ref,
               token,
               depth: 1,
               patterns: includePatterns,
               ignore: options.exclude,
               useDefaultIgnore: !options.noDefaultExcludes,
               onProgress: (progress) => {
                  if (progress.total) {
                     spinner.text = `Cloning repository... ${progress.phase} (${progress.loaded}/${progress.total})`;
                  } else {
                     spinner.text = `Cloning repository... ${progress.phase}`;
                  }
               },
            });
            spinner.succeed(`Cloned ${gitResult.files.length} files (commit: ${gitResult.commitHash.slice(0, 8)})`);

            sourcePath = gitResult.tempDir || parsed.repoUrl;

            // Determine licenses: explicit > auto-detected
            const licenses = options.license ?? (
               gitResult.detectedLicense?.identifier && gitResult.detectedLicense.identifier !== 'Unknown'
                  ? [ gitResult.detectedLicense.identifier ]
                  : undefined
            );

            sourceProvenance = {
               type: 'git',
               url: source,
               ref: gitResult.ref,
               commitHash: gitResult.commitHash,
               licenses,
            };

            if (gitResult.detectedLicense && !options.license) {
               const msg = `Detected license: ${gitResult.detectedLicense.identifier} ` +
                  `(${gitResult.detectedLicense.confidence} confidence)`;

               spinner.info(msg);
            }
         } else {
            // Local source
            sourcePath = path.resolve(source);
            const stats = await fs.stat(sourcePath);

            if (!stats.isDirectory() && !stats.isFile()) {
               console.error(chalk.red(`Error: ${source} is not a valid file or directory`));
               process.exit(1);
            }

            sourceProvenance = {
               type: 'local',
               path: sourcePath,
               licenses: options.license,
            };
         }

         const libraryName = options.name ||
            (isGit ? deriveGitLibraryName(parseGitUrl(source).repoUrl) : path.basename(sourcePath));

         const libraryVersion = options.version || '1.0.0';

         const defaultFilename = options.version
            ? `${libraryName}-${libraryVersion}.libragen`
            : `${libraryName}.libragen`;

         // Resolve output path: if it's a directory or doesn't end in .libragen, treat as
         // directory
         let outputPath: string;

         if (!options.output) {
            outputPath = defaultFilename;
         } else if (options.output.endsWith('.libragen')) {
            // Explicit file path
            outputPath = options.output;
            // Ensure parent directory exists
            await fs.mkdir(path.dirname(path.resolve(outputPath)), { recursive: true });
         } else {
            // Treat as directory - create it and use default filename
            await fs.mkdir(options.output, { recursive: true });
            outputPath = path.join(options.output, defaultFilename);
         }

         if (!isGit) {
            console.log(chalk.bold('\n📚 Building libragen library\n'));
            console.log(`  Source:  ${chalk.cyan(sourcePath)}`);
         }
         console.log(`  Output:  ${chalk.cyan(outputPath)}`);
         console.log(`  Name:    ${chalk.cyan(libraryName)}`);
         console.log(`  Version: ${chalk.cyan(options.version)}`);
         console.log('');

         // Initialize embedder
         spinner.start('Loading embedding model...');
         const embedder = new Embedder();

         await embedder.initialize();
         spinner.succeed('Embedding model loaded');

         // Initialize chunker
         const chunkSize = parseInt(options.chunkSize || '1000', 10),
               chunkOverlap = parseInt(options.chunkOverlap || '100', 10),
               chunker = new Chunker({ chunkSize, chunkOverlap });

         // Chunk source files
         spinner.start('Chunking source files...');
         let chunks;

         if (gitResult) {
            // Use files from git clone
            chunks = await chunker.chunkSourceFiles(gitResult.files);
         } else {
            const stats = await fs.stat(sourcePath);

            if (stats.isDirectory()) {
               chunks = await chunker.chunkDirectory(sourcePath, {
                  patterns: includePatterns,
                  ignore: options.exclude,
                  useDefaultIgnore: !options.noDefaultExcludes,
               });
            } else {
               chunks = await chunker.chunkFile(sourcePath);
            }
         }
         spinner.succeed(`Chunked ${chunks.length} chunks from source`);

         if (chunks.length === 0) {
            console.log(chalk.yellow('\n⚠️  No chunks created. Check your source files.'));
            await embedder.dispose();
            return;
         }

         // Show time estimate
         const estimate = estimateEmbeddingTime(chunks.length);

         console.log('');
         console.log(`  ${chalk.dim('System:')}      ${formatSystemInfo(estimate.systemInfo)}`);
         const estMsg = `${chalk.yellow(estimate.formattedTime)} (~${Math.round(estimate.chunksPerSecond)} chunks/sec)`;

         console.log(`  ${chalk.dim('Est. time:')}   ${estMsg}`);
         console.log('');

         // Generate embeddings
         const embedStartTime = Date.now();

         spinner.start(`Generating embeddings for ${chunks.length} chunks...`);
         const contents = chunks.map((c) => {
            return c.content;
         });

         const embeddings = await embedder.embedBatch(contents);

         const embedDuration = (Date.now() - embedStartTime) / 1000,
               actualChunksPerSec = Math.round(chunks.length / embedDuration);

         const embedMsg = `Generated ${embeddings.length} embeddings in ` +
            `${formatDuration(embedDuration)} (~${actualChunksPerSec} chunks/sec)`;

         spinner.succeed(embedMsg);

         // Create vector store
         spinner.start('Creating library database...');
         const store = new VectorStore(outputPath);

         store.initialize();
         store.addChunks(chunks, embeddings);

         // Calculate content hash
         const allContent = chunks
            .map((c) => {
               return c.content;
            })
            .join('');

         const contentHash = createHash('sha256').update(allContent).digest('hex');

         // Set schema version
         store.setMeta('schema_version', String(CURRENT_SCHEMA_VERSION));

         // Store metadata
         const metadata: LibraryMetadata = {
            name: libraryName,
            version: options.version || '0.1.0',
            schemaVersion: CURRENT_SCHEMA_VERSION,
            contentVersion: options.contentVersion,
            description: options.description,
            agentDescription: options.agentDescription,
            exampleQueries: options.exampleQueries,
            keywords: options.keywords,
            programmingLanguages: options.programmingLanguages,
            textLanguages: options.textLanguages,
            frameworks: options.frameworks,
            createdAt: new Date().toISOString(),
            embedding: {
               model: 'Xenova/bge-small-en-v1.5',
               dimensions: 384,
            },
            chunking: {
               strategy: 'recursive',
               chunkSize,
               chunkOverlap,
            },
            stats: {
               chunkCount: chunks.length,
               sourceCount: new Set(
                  chunks.map((c) => {
                     return c.metadata.sourceFile;
                  })
               )
                  .size,
               fileSize: 0, // Will be updated after close
            },
            contentHash: `sha256:${contentHash}`,
            source: sourceProvenance,
         };

         store.setMetadata(metadata);
         store.close();

         // Get final file size
         const fileStats = await fs.stat(outputPath);

         spinner.succeed('Library database created');

         // Summary
         const absoluteOutputPath = path.resolve(outputPath);

         console.log(chalk.bold.green('\n✅ Library built successfully!\n'));
         console.log(`  ${chalk.dim('File:')}        ${absoluteOutputPath}`);
         console.log(`  ${chalk.dim('Size:')}        ${formatBytes(fileStats.size)}`);
         console.log(`  ${chalk.dim('Chunks:')}      ${chunks.length}`);
         console.log(`  ${chalk.dim('Sources:')}     ${metadata.stats.sourceCount} files`);
         if (sourceProvenance.licenses?.length) {
            console.log(`  ${chalk.dim('License:')}     ${sourceProvenance.licenses.join(', ')}`);
         }
         console.log(`  ${chalk.dim('Hash:')}        ${contentHash.slice(0, 16)}...`);
         console.log('');

         await embedder.dispose();
      } catch(error) {
         spinner.fail('Build failed');
         console.error(chalk.red(`\nError: ${error instanceof Error ? error.message : String(error)}`));
         process.exit(1);
      } finally {
         // Clean up git temp directory
         if (gitResult?.tempDir) {
            await gitSource.cleanup(gitResult.tempDir);
         }
      }
   });

function formatDuration(seconds: number): string {
   if (seconds < 60) {
      return `${seconds.toFixed(1)}s`;
   }

   const minutes = Math.floor(seconds / 60),
         remainingSeconds = Math.round(seconds % 60);

   return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
}

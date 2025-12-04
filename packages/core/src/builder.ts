/**
 * Builder - Creates .libragen libraries from source files
 *
 * This class encapsulates the complete build workflow including source detection,
 * chunking, embedding generation, and database creation.
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { createHash } from 'crypto';
import { Embedder } from './embedder.ts';
import { Chunker } from './chunker.ts';
import type { Chunk } from './chunker.ts';
import { VectorStore } from './store.ts';
import { GitSource, isGitUrl, parseGitUrl, getAuthToken } from './sources/index.ts';
import type { GitSourceResult } from './sources/index.ts';
import { CURRENT_SCHEMA_VERSION } from './migrations/index.ts';
import { deriveGitLibraryName } from './utils.ts';
import type { LibraryMetadata, SourceProvenance } from './types.ts';

/**
 * Options for building a library.
 */
export interface BuildOptions {

   /** Output path for the .libragen file */
   output?: string;

   /** Library name (defaults to directory name or derived from git URL) */
   name?: string;

   /** Library version (default: 0.1.0) */
   version?: string;

   /** Version of the source content */
   contentVersion?: string;

   /** Short description of the library */
   description?: string;

   /** Guidance for AI agents on when to use this library */
   agentDescription?: string;

   /** Example queries this library can answer */
   exampleQueries?: string[];

   /** Searchable keywords/tags */
   keywords?: string[];

   /** Programming languages covered (e.g., "typescript", "python") */
   programmingLanguages?: string[];

   /** Human/natural languages of the content as ISO 639-1 codes (e.g., "en", "es") */
   textLanguages?: string[];

   /** Frameworks covered (e.g., "react", "express") */
   frameworks?: string[];

   /** Target chunk size in characters (default: 1000) */
   chunkSize?: number;

   /** Chunk overlap in characters (default: 100) */
   chunkOverlap?: number;

   /** Glob patterns to include */
   include?: string[];

   /** Glob patterns to exclude (added to defaults) */
   exclude?: string[];

   /** Disable default exclusions (node_modules, .git, dist, etc.) */
   noDefaultExcludes?: boolean;

   /** Git branch, tag, or commit to checkout (remote git sources only) */
   gitRef?: string;

   /** Auth token for private git repositories */
   gitRepoAuthToken?: string;

   /** SPDX license identifier(s) for the source content */
   license?: string[];
}

/**
 * Result of a successful build operation.
 */
export interface BuildResult {

   /** Absolute path to the created .libragen file */
   outputPath: string;

   /** Library metadata */
   metadata: LibraryMetadata;

   /** Build statistics */
   stats: {

      /** Number of chunks created */
      chunkCount: number;

      /** Number of source files processed */
      sourceCount: number;

      /** Final file size in bytes */
      fileSize: number;

      /** Time spent embedding in seconds */
      embedDuration: number;

      /** Chunks processed per second */
      chunksPerSecond: number;
   };

   /** Git-specific information (if source was a git URL) */
   git?: {

      /** Commit hash */
      commitHash: string;

      /** Branch/tag name */
      ref: string;

      /** Detected license (if any) */
      detectedLicense?: {
         identifier: string;
         confidence: string;
      };
   };
}

/**
 * Build phase identifiers.
 */
export type BuildPhase =
   | 'initializing'
   | 'cloning'
   | 'loading-model'
   | 'chunking'
   | 'embedding'
   | 'creating-database'
   | 'complete';

/**
 * Progress information during build.
 */
export interface BuildProgress {

   /** Current build phase */
   phase: BuildPhase;

   /** Progress percentage (0-100) */
   progress: number;

   /** Human-readable message */
   message: string;

   /** Current item being processed (for embedding phase) */
   current?: number;

   /** Total items to process (for embedding phase) */
   total?: number;
}

/**
 * Callback for receiving build progress updates.
 */
export type BuildProgressCallback = (progress: BuildProgress) => void;

/**
 * Configuration for the Builder class.
 */
export interface BuilderConfig {

   /** Custom embedder instance (for testing or custom models) */
   embedder?: Embedder;
}

/**
 * Builder class for creating .libragen libraries from source files.
 *
 * @example
 * ```typescript
 * const builder = new Builder();
 * const result = await builder.build('./my-docs', {
 *   name: 'my-library',
 *   description: 'My documentation library',
 * });
 * console.log(`Built library at ${result.outputPath}`);
 * ```
 */
export class Builder {

   private readonly _config: BuilderConfig;

   /**
    * Create a new Builder instance.
    *
    * @param config - Optional configuration
    */
   public constructor(config?: BuilderConfig) {
      this._config = config ?? {};
   }

   /**
    * Build a .libragen library from source files.
    *
    * @param source - Source directory, file path, or git URL
    * @param options - Build options
    * @param onProgress - Optional progress callback
    * @returns Build result with output path and metadata
    * @throws Error if build fails
    */
   // eslint-disable-next-line complexity
   public async build(
      source: string,
      options?: BuildOptions,
      onProgress?: BuildProgressCallback
   ): Promise<BuildResult> {
      const opts = options ?? {};

      const progress = onProgress ?? ((): void => {});

      let gitResult: GitSourceResult | undefined;

      const gitSource = new GitSource();

      try {
         progress({ phase: 'initializing', progress: 5, message: 'Initializing...' });

         // Detect if source is a git URL
         const isGit = isGitUrl(source);

         let includePatterns = opts.include,
             sourcePath: string,
             sourceProvenance: SourceProvenance;

         if (isGit) {
            progress({ phase: 'cloning', progress: 10, message: 'Cloning repository...' });

            // Parse git URL to extract repo, ref, and path
            const parsed = parseGitUrl(source),
                  resolvedRef = opts.gitRef || parsed.ref,
                  resolvedToken = getAuthToken(parsed.repoUrl, opts.gitRepoAuthToken);

            // If URL contains a path, prepend it to include patterns
            if (parsed.path) {
               const pathPattern = parsed.path.endsWith('/') || !parsed.path.includes('.')
                  ? `${parsed.path}/**`
                  : parsed.path;

               includePatterns = includePatterns
                  ? [ pathPattern, ...includePatterns ]
                  : [ pathPattern ];
            }

            // Clone the repository
            gitResult = await gitSource.getFiles({
               url: parsed.repoUrl,
               ref: resolvedRef,
               token: resolvedToken,
               depth: 1,
               patterns: includePatterns,
               ignore: opts.exclude,
               useDefaultIgnore: !opts.noDefaultExcludes,
            });

            sourcePath = gitResult.tempDir || parsed.repoUrl;

            // Determine licenses: explicit > auto-detected
            const licenses = opts.license ?? (
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
         } else {
            progress({ phase: 'initializing', progress: 10, message: 'Reading source...' });

            // Local source
            sourcePath = path.resolve(source);

            const stats = await fs.stat(sourcePath);

            if (!stats.isDirectory() && !stats.isFile()) {
               throw new Error(`${source} is not a valid file or directory`);
            }

            sourceProvenance = {
               type: 'local',
               path: sourcePath,
               licenses: opts.license,
            };
         }

         const libraryName = opts.name ||
            (isGit ? deriveGitLibraryName(parseGitUrl(source).repoUrl) : path.basename(sourcePath));

         const libraryVersion = opts.version || '0.1.0';

         // Resolve output path
         const outputPath = await this._resolveOutputPath(
            opts.output,
            libraryName,
            libraryVersion,
            isGit
         );

         // Initialize embedder
         progress({ phase: 'loading-model', progress: 20, message: 'Loading embedding model...' });

         const embedder = this._config.embedder ?? new Embedder();

         const disposeEmbedder = !this._config.embedder; // Only dispose if we created it

         try {
            await embedder.initialize();

            // Initialize chunker
            const chunkSize = opts.chunkSize ?? 1000,
                  chunkOverlap = opts.chunkOverlap ?? 100,
                  chunker = new Chunker({ chunkSize, chunkOverlap });

            // Chunk source files
            progress({ phase: 'chunking', progress: 30, message: 'Chunking source files...' });

            let chunks: Chunk[];

            if (gitResult) {
               // Use files from git clone
               chunks = await chunker.chunkSourceFiles(gitResult.files);
            } else {
               const stats = await fs.stat(sourcePath);

               if (stats.isDirectory()) {
                  chunks = await chunker.chunkDirectory(sourcePath, {
                     patterns: includePatterns,
                     ignore: opts.exclude,
                     useDefaultIgnore: !opts.noDefaultExcludes,
                  });
               } else {
                  chunks = await chunker.chunkFile(sourcePath);
               }
            }

            if (chunks.length === 0) {
               throw new Error('No content found to index. Check your source path and include/exclude patterns.');
            }

            // Generate embeddings
            progress({
               phase: 'embedding',
               progress: 40,
               message: `Generating embeddings (${chunks.length} chunks)...`,
               current: 0,
               total: chunks.length,
            });

            const embedStartTime = Date.now();

            const contents = chunks.map((c) => { return c.content; });

            // Embed in batches with progress updates
            const batchSize = 50,
                  embeddings: Float32Array[] = [];

            for (let i = 0; i < contents.length; i += batchSize) {
               const batch = contents.slice(i, i + batchSize),
                     batchEmbeddings = await embedder.embedBatch(batch);

               for (const emb of batchEmbeddings) {
                  embeddings.push(emb);
               }

               // Progress from 40% to 85%
               const progressPct = 40 + Math.round((i / contents.length) * 45);

               progress({
                  phase: 'embedding',
                  progress: progressPct,
                  message: `Generating embeddings (${Math.min(i + batchSize, contents.length)}/${contents.length})...`,
                  current: Math.min(i + batchSize, contents.length),
                  total: contents.length,
               });
            }

            const embedDuration = (Date.now() - embedStartTime) / 1000,
                  chunksPerSecond = Math.round(chunks.length / embedDuration);

            // Create database
            progress({ phase: 'creating-database', progress: 90, message: 'Creating library database...' });

            const store = new VectorStore(outputPath);

            store.initialize();
            store.addChunks(chunks, embeddings);

            // Calculate content hash
            const allContent = contents.join(''),
                  contentHash = createHash('sha256').update(allContent).digest('hex');

            // Set schema version
            store.setMeta('schema_version', String(CURRENT_SCHEMA_VERSION));

            // Store metadata
            const metadata: LibraryMetadata = {
               name: libraryName,
               version: libraryVersion,
               schemaVersion: CURRENT_SCHEMA_VERSION,
               contentVersion: opts.contentVersion,
               description: opts.description,
               agentDescription: opts.agentDescription,
               exampleQueries: opts.exampleQueries,
               keywords: opts.keywords,
               programmingLanguages: opts.programmingLanguages,
               textLanguages: opts.textLanguages,
               frameworks: opts.frameworks,
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
                  sourceCount: new Set(chunks.map((c) => { return c.metadata.sourceFile; })).size,
                  fileSize: 0, // Will be updated after close
               },
               contentHash: `sha256:${contentHash}`,
               source: sourceProvenance,
            };

            store.setMetadata(metadata);
            store.close();

            // Get final file size
            const fileStats = await fs.stat(outputPath);

            progress({ phase: 'complete', progress: 100, message: 'Complete' });

            const result: BuildResult = {
               outputPath: path.resolve(outputPath),
               metadata,
               stats: {
                  chunkCount: chunks.length,
                  sourceCount: metadata.stats.sourceCount,
                  fileSize: fileStats.size,
                  embedDuration,
                  chunksPerSecond,
               },
            };

            if (gitResult) {
               result.git = {
                  commitHash: gitResult.commitHash,
                  ref: gitResult.ref,
                  detectedLicense: gitResult.detectedLicense,
               };
            }

            return result;
         } finally {
            if (disposeEmbedder) {
               await embedder.dispose();
            }
         }
      } finally {
         // Clean up git temp directory
         if (gitResult?.tempDir) {
            await gitSource.cleanup(gitResult.tempDir);
         }
      }
   }

   /**
    * Resolve the output path for the library file.
    */
   private async _resolveOutputPath(
      output: string | undefined,
      libraryName: string,
      libraryVersion: string,
      isGit: boolean
   ): Promise<string> {
      const defaultFilename = `${libraryName}-${libraryVersion}.libragen`;

      if (!output) {
         if (isGit) {
            // For git sources without explicit output, use a temp location
            const os = await import('os'),
                  tempDir = os.tmpdir();

            return path.join(tempDir, defaultFilename);
         }

         // For local sources, put output in current directory
         return defaultFilename;
      }

      if (output.endsWith('.libragen')) {
         // Explicit file path
         await fs.mkdir(path.dirname(path.resolve(output)), { recursive: true });
         return output;
      }

      // Treat as directory - create it and use default filename
      await fs.mkdir(output, { recursive: true });
      return path.join(output, defaultFilename);
   }

}

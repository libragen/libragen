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
 * Resolved source information after detecting and preparing the source.
 */
export interface ResolvedSource {

   /** Path to the source files (local path or temp directory for git) */
   sourcePath: string;

   /** Whether the source is from a git repository */
   isGit: boolean;

   /** Source provenance information */
   provenance: SourceProvenance;

   /** Git result (if source was a git URL) */
   gitResult?: GitSourceResult;

   /** Include patterns (may be modified for git path filtering) */
   includePatterns?: string[];
}

/**
 * Result of embedding generation.
 */
export interface EmbeddingResult {

   /** Generated embeddings */
   embeddings: Float32Array[];

   /** Time spent embedding in seconds */
   duration: number;

   /** Chunks processed per second */
   chunksPerSecond: number;
}

/**
 * Options for creating the library database.
 */
export interface CreateLibraryOptions {

   /** Path for the output file */
   outputPath: string;

   /** Chunks to store */
   chunks: Chunk[];

   /** Embeddings for chunks */
   embeddings: Float32Array[];

   /** Library name */
   libraryName: string;

   /** Library version */
   libraryVersion: string;

   /** Chunk size used */
   chunkSize: number;

   /** Chunk overlap used */
   chunkOverlap: number;

   /** Source provenance */
   provenance: SourceProvenance;

   /** Build options */
   buildOptions: BuildOptions;
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
   public async build(
      source: string,
      options?: BuildOptions,
      onProgress?: BuildProgressCallback
   ): Promise<BuildResult> {
      const opts = options ?? {};

      const progress = onProgress ?? ((): void => {});

      const gitSource = new GitSource();

      let resolved: ResolvedSource | undefined;

      try {
         // Phase 1: Resolve source
         progress({ phase: 'initializing', progress: 5, message: 'Initializing...' });
         resolved = await this._resolveSource(source, opts, gitSource, progress);

         // Derive library name and version
         const libraryName = opts.name ||
            (resolved.isGit
               ? deriveGitLibraryName(parseGitUrl(source).repoUrl)
               : path.basename(resolved.sourcePath));

         const libraryVersion = opts.version || '0.1.0';

         // Resolve output path
         const outputPath = await this._resolveOutputPath(opts.output, libraryName, libraryVersion, resolved.isGit);

         // Phase 2: Initialize embedder
         progress({ phase: 'loading-model', progress: 20, message: 'Loading embedding model...' });

         const embedder = this._config.embedder ?? new Embedder();

         const disposeEmbedder = !this._config.embedder;

         try {
            await embedder.initialize();

            // Phase 3: Chunk source files
            const chunkSize = opts.chunkSize ?? 1000,
                  chunkOverlap = opts.chunkOverlap ?? 100;

            const chunks = await this._chunkSource(resolved, opts, chunkSize, chunkOverlap, progress);

            // Phase 4: Generate embeddings
            const embeddingResult = await this._generateEmbeddings(chunks, embedder, progress);

            // Phase 5: Create library database
            progress({ phase: 'creating-database', progress: 90, message: 'Creating library database...' });

            const metadata = await this._createLibrary({
               outputPath,
               chunks,
               embeddings: embeddingResult.embeddings,
               libraryName,
               libraryVersion,
               chunkSize,
               chunkOverlap,
               provenance: resolved.provenance,
               buildOptions: opts,
            });

            // Get final file size
            const fileStats = await fs.stat(outputPath);

            progress({ phase: 'complete', progress: 100, message: 'Complete' });

            // Build result
            const result: BuildResult = {
               outputPath: path.resolve(outputPath),
               metadata,
               stats: {
                  chunkCount: chunks.length,
                  sourceCount: metadata.stats.sourceCount,
                  fileSize: fileStats.size,
                  embedDuration: embeddingResult.duration,
                  chunksPerSecond: embeddingResult.chunksPerSecond,
               },
            };

            if (resolved.gitResult) {
               result.git = {
                  commitHash: resolved.gitResult.commitHash,
                  ref: resolved.gitResult.ref,
                  detectedLicense: resolved.gitResult.detectedLicense,
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
         if (resolved?.gitResult?.tempDir) {
            await gitSource.cleanup(resolved.gitResult.tempDir);
         }
      }
   }

   /**
    * Resolve and prepare the source for building.
    * Handles both local paths and git URLs.
    *
    * @param source - Source directory, file path, or git URL
    * @param opts - Build options
    * @param gitSource - GitSource instance for cloning
    * @param progress - Progress callback
    * @returns Resolved source information
    */
   protected async _resolveSource(
      source: string,
      opts: BuildOptions,
      gitSource: GitSource,
      progress: BuildProgressCallback
   ): Promise<ResolvedSource> {
      const isGit = isGitUrl(source);

      if (isGit) {
         return this._resolveGitSource(source, opts, gitSource, progress);
      }

      return this._resolveLocalSource(source, opts, progress);
   }

   /**
    * Resolve a git URL source.
    */
   protected async _resolveGitSource(
      source: string,
      opts: BuildOptions,
      gitSource: GitSource,
      progress: BuildProgressCallback
   ): Promise<ResolvedSource> {
      progress({ phase: 'cloning', progress: 10, message: 'Cloning repository...' });

      const parsed = parseGitUrl(source),
            resolvedRef = opts.gitRef || parsed.ref,
            resolvedToken = getAuthToken(parsed.repoUrl, opts.gitRepoAuthToken);

      // If URL contains a path, prepend it to include patterns
      let includePatterns = opts.include;

      if (parsed.path) {
         const pathPattern = parsed.path.endsWith('/') || !parsed.path.includes('.')
            ? `${parsed.path}/**`
            : parsed.path;

         includePatterns = includePatterns
            ? [ pathPattern, ...includePatterns ]
            : [ pathPattern ];
      }

      // Clone the repository
      const gitResult = await gitSource.getFiles({
         url: parsed.repoUrl,
         ref: resolvedRef,
         token: resolvedToken,
         depth: 1,
         patterns: includePatterns,
         ignore: opts.exclude,
         useDefaultIgnore: !opts.noDefaultExcludes,
      });

      // Determine licenses: explicit > auto-detected
      const licenses = opts.license ?? (
         gitResult.detectedLicense?.identifier && gitResult.detectedLicense.identifier !== 'Unknown'
            ? [ gitResult.detectedLicense.identifier ]
            : undefined
      );

      return {
         sourcePath: gitResult.tempDir || parsed.repoUrl,
         isGit: true,
         provenance: {
            type: 'git',
            url: source,
            ref: gitResult.ref,
            commitHash: gitResult.commitHash,
            licenses,
         },
         gitResult,
         includePatterns,
      };
   }

   /**
    * Resolve a local file or directory source.
    */
   protected async _resolveLocalSource(
      source: string,
      opts: BuildOptions,
      progress: BuildProgressCallback
   ): Promise<ResolvedSource> {
      progress({ phase: 'initializing', progress: 10, message: 'Reading source...' });

      const sourcePath = path.resolve(source);

      const stats = await fs.stat(sourcePath);

      if (!stats.isDirectory() && !stats.isFile()) {
         throw new Error(`${source} is not a valid file or directory`);
      }

      return {
         sourcePath,
         isGit: false,
         provenance: {
            type: 'local',
            path: sourcePath,
            licenses: opts.license,
         },
         includePatterns: opts.include,
      };
   }

   /**
    * Chunk source files into smaller pieces for embedding.
    *
    * @param resolved - Resolved source information
    * @param opts - Build options
    * @param chunkSize - Target chunk size
    * @param chunkOverlap - Chunk overlap
    * @param progress - Progress callback
    * @returns Array of chunks
    */
   protected async _chunkSource(
      resolved: ResolvedSource,
      opts: BuildOptions,
      chunkSize: number,
      chunkOverlap: number,
      progress: BuildProgressCallback
   ): Promise<Chunk[]> {
      progress({ phase: 'chunking', progress: 30, message: 'Chunking source files...' });

      const chunker = new Chunker({ chunkSize, chunkOverlap });

      let chunks: Chunk[];

      if (resolved.gitResult) {
         chunks = await chunker.chunkSourceFiles(resolved.gitResult.files);
      } else {
         const stats = await fs.stat(resolved.sourcePath);

         if (stats.isDirectory()) {
            chunks = await chunker.chunkDirectory(resolved.sourcePath, {
               patterns: resolved.includePatterns,
               ignore: opts.exclude,
               useDefaultIgnore: !opts.noDefaultExcludes,
            });
         } else {
            chunks = await chunker.chunkFile(resolved.sourcePath);
         }
      }

      if (chunks.length === 0) {
         throw new Error('No content found to index. Check your source path and include/exclude patterns.');
      }

      return chunks;
   }

   /**
    * Generate embeddings for chunks.
    *
    * @param chunks - Chunks to embed
    * @param embedder - Embedder instance
    * @param progress - Progress callback
    * @returns Embedding result with embeddings and timing info
    */
   protected async _generateEmbeddings(
      chunks: Chunk[],
      embedder: Embedder,
      progress: BuildProgressCallback
   ): Promise<EmbeddingResult> {
      progress({
         phase: 'embedding',
         progress: 40,
         message: `Generating embeddings (${chunks.length} chunks)...`,
         current: 0,
         total: chunks.length,
      });

      const startTime = Date.now();

      const contents = chunks.map((c) => { return c.content; });

      const batchSize = 50;

      const embeddings: Float32Array[] = [];

      for (let i = 0; i < contents.length; i += batchSize) {
         const batch = contents.slice(i, i + batchSize);

         const batchEmbeddings = await embedder.embedBatch(batch);

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

      const duration = (Date.now() - startTime) / 1000;

      return {
         embeddings,
         duration,
         chunksPerSecond: Math.round(chunks.length / duration),
      };
   }

   /**
    * Create the library database file.
    *
    * @param options - Options for creating the library
    * @returns Library metadata
    */
   protected async _createLibrary(options: CreateLibraryOptions): Promise<LibraryMetadata> {
      const {
         outputPath,
         chunks,
         embeddings,
         libraryName,
         libraryVersion,
         chunkSize,
         chunkOverlap,
         provenance,
         buildOptions: opts,
      } = options;

      const store = new VectorStore(outputPath);

      store.initialize();
      store.addChunks(chunks, embeddings);

      // Calculate content hash
      const allContent = chunks.map((c) => { return c.content; }).join('');

      const contentHash = createHash('sha256').update(allContent).digest('hex');

      // Set schema version
      store.setMeta('schema_version', String(CURRENT_SCHEMA_VERSION));

      // Build metadata
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
            fileSize: 0,
         },
         contentHash: `sha256:${contentHash}`,
         source: provenance,
      };

      store.setMetadata(metadata);
      store.close();

      return metadata;
   }

   /**
    * Resolve the output path for the library file.
    *
    * @param output - Explicit output path (optional)
    * @param libraryName - Library name
    * @param libraryVersion - Library version
    * @param isGit - Whether source is from git
    * @returns Resolved output path
    */
   protected async _resolveOutputPath(
      output: string | undefined,
      libraryName: string,
      libraryVersion: string,
      isGit: boolean
   ): Promise<string> {
      const defaultFilename = `${libraryName}-${libraryVersion}.libragen`;

      if (!output) {
         if (isGit) {
            const os = await import('os');

            return path.join(os.tmpdir(), defaultFilename);
         }

         return defaultFilename;
      }

      if (output.endsWith('.libragen')) {
         await fs.mkdir(path.dirname(path.resolve(output)), { recursive: true });
         return output;
      }

      await fs.mkdir(output, { recursive: true });
      return path.join(output, defaultFilename);
   }

}

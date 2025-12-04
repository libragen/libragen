/**
 * Build Worker - Runs build operations in a worker thread
 *
 * This script is executed in a worker thread to perform CPU-intensive
 * build operations without blocking the main MCP server thread.
 */

import { parentPort, workerData } from 'worker_threads';
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
import * as path from 'path';
import * as fs from 'fs/promises';
import { createHash } from 'crypto';
import type { BuildParams } from './task-manager.ts';

/** Messages sent from main thread to worker */
export interface WorkerInMessage {
   type: 'start' | 'cancel';
   params?: BuildParams;
}

/** Messages sent from worker to main thread */
export interface WorkerOutMessage {
   type: 'progress' | 'complete' | 'error';
   step?: string;
   progress?: number;
   result?: string;
   error?: string;
}

// Cancellation flag
let cancelled = false;

/**
 * Check if cancelled and throw if so.
 */
function checkCancelled(): void {
   if (cancelled) {
      throw new Error('Build cancelled');
   }
}

/**
 * Send a progress update to the main thread.
 */
function sendProgress(step: string, progress: number): void {
   parentPort?.postMessage({
      type: 'progress',
      step,
      progress,
   } satisfies WorkerOutMessage);
}

/**
 * Send completion message to the main thread.
 */
function sendComplete(result: string): void {
   parentPort?.postMessage({
      type: 'complete',
      result,
   } satisfies WorkerOutMessage);
}

/**
 * Send error message to the main thread.
 */
function sendError(error: string): void {
   parentPort?.postMessage({
      type: 'error',
      error,
   } satisfies WorkerOutMessage);
}

/**
 * Execute the build operation.
 */
// eslint-disable-next-line complexity
async function executeBuild(params: BuildParams): Promise<void> {
   const {
      source,
      output,
      name,
      version = '0.1.0',
      contentVersion,
      description,
      agentDescription,
      exampleQueries,
      keywords,
      programmingLanguages,
      textLanguages,
      frameworks,
      chunkSize = 1000,
      chunkOverlap = 100,
      include,
      exclude,
      gitRef,
      gitRepoAuthToken,
      license,
      install = false,
   } = params;

   let gitResult: GitSourceResult | undefined;

   const gitSource = new GitSource();

   try {
      sendProgress('Initializing...', 5);
      checkCancelled();

      // Detect if source is a git URL
      const isGit = isGitUrl(source);

      let includePatterns = include,
          sourceProvenance: SourceProvenance,
          sourcePath: string;

      if (isGit) {
         sendProgress('Cloning repository...', 10);
         checkCancelled();

         // Parse git URL to extract repo, ref, and path
         const parsed = parseGitUrl(source),
               resolvedRef = gitRef || parsed.ref,
               resolvedToken = getAuthToken(parsed.repoUrl, gitRepoAuthToken);

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
            ignore: exclude,
            useDefaultIgnore: true,
         });

         checkCancelled();

         sourcePath = gitResult.tempDir || parsed.repoUrl;

         // Determine licenses: explicit > auto-detected
         const licenses = license ?? (
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
         sendProgress('Reading source...', 10);
         checkCancelled();

         // Local source
         sourcePath = path.resolve(source);

         const stats = await fs.stat(sourcePath);

         if (!stats.isDirectory() && !stats.isFile()) {
            throw new Error(`${source} is not a valid file or directory`);
         }

         sourceProvenance = {
            type: 'local',
            path: sourcePath,
            licenses: license,
         };
      }

      const libraryName = name || (isGit ? deriveGitLibraryName(parseGitUrl(source).repoUrl) : path.basename(sourcePath));

      // Resolve output path: temp dir for git sources, relative to source for local
      let outputPath: string;

      if (output) {
         outputPath = path.resolve(output);
      } else if (isGit) {
         // For git sources without explicit output, use a temp location
         const os = await import('os'),
               tempDir = os.tmpdir();

         outputPath = path.join(tempDir, `${libraryName}.libragen`);
      } else {
         // For local sources, put output next to the source
         const sourceDir = path.dirname(sourcePath);

         outputPath = path.join(sourceDir, `${libraryName}.libragen`);
      }

      // Ensure parent directory exists
      const outputDir = path.dirname(outputPath);

      await fs.mkdir(outputDir, { recursive: true });

      sendProgress('Loading embedding model...', 20);
      checkCancelled();

      // Create and initialize embedder
      const embedder = new Embedder();

      try {
         await embedder.initialize();
         checkCancelled();

         sendProgress('Chunking content...', 30);

         // Initialize chunker
         const chunker = new Chunker({ chunkSize, chunkOverlap });

         // Chunk source files
         let chunks;

         if (gitResult) {
            // Use files from git clone
            chunks = await chunker.chunkSourceFiles(gitResult.files);
         } else {
            const stats = await fs.stat(sourcePath);

            if (stats.isDirectory()) {
               chunks = await chunker.chunkDirectory(sourcePath, {
                  patterns: includePatterns,
                  ignore: exclude,
                  useDefaultIgnore: true,
               });
            } else {
               chunks = await chunker.chunkFile(sourcePath);
            }
         }

         checkCancelled();

         if (chunks.length === 0) {
            throw new Error('No content found to index. Check your source path and include/exclude patterns.');
         }

         sendProgress(`Generating embeddings (${chunks.length} chunks)...`, 40);

         // Generate embeddings
         const contents = chunks.map((c) => {
            return c.content;
         });

         // Embed in batches with progress updates
         const batchSize = 50,
               embeddings: Float32Array[] = [];

         for (let i = 0; i < contents.length; i += batchSize) {
            checkCancelled();

            const batch = contents.slice(i, i + batchSize),
                  batchEmbeddings = await embedder.embedBatch(batch);

            for (const emb of batchEmbeddings) {
               embeddings.push(emb);
            }

            // Progress from 40% to 85%
            const progress = 40 + Math.round((i / contents.length) * 45);

            sendProgress(`Generating embeddings (${Math.min(i + batchSize, contents.length)}/${contents.length})...`, progress);
         }

         checkCancelled();
         sendProgress('Creating database...', 90);

         // Create vector store
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
            version,
            schemaVersion: CURRENT_SCHEMA_VERSION,
            contentVersion,
            description,
            agentDescription,
            exampleQueries,
            keywords,
            programmingLanguages,
            textLanguages,
            frameworks,
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
               sourceCount: new Set(chunks.map((c) => {
                  return c.metadata.sourceFile;
               }))
                  .size,
               fileSize: 0,
            },
            contentHash: `sha256:${contentHash}`,
            source: sourceProvenance,
         };

         store.setMetadata(metadata);
         store.close();

         // Get final file size
         const fileStats = await fs.stat(outputPath);

         let result = `✓ Built library: ${libraryName}\n`;

         result += `  Output: ${outputPath}\n`;
         result += `  Size: ${formatBytes(fileStats.size)}\n`;
         result += `  Chunks: ${chunks.length}\n`;
         result += `  Sources: ${metadata.stats.sourceCount} files`;

         if (gitResult) {
            result += `\n  Commit: ${gitResult.commitHash.slice(0, 8)}`;
            result += `\n  Ref: ${gitResult.ref}`;
         }

         if (sourceProvenance.licenses?.length) {
            result += `\n  License: ${sourceProvenance.licenses.join(', ')}`;
         }

         // Install if requested
         if (install) {
            sendProgress('Installing library...', 95);
            checkCancelled();

            const { LibraryManager } = await import('@libragen/core'),
                  manager = new LibraryManager(),
                  installed = await manager.install(path.resolve(outputPath), { force: true });

            result += `\n\n✓ Installed to: ${installed.path}`;
         }

         sendProgress('Complete', 100);
         sendComplete(result);
      } finally {
         await embedder.dispose();
      }
   } catch(error) {
      if (cancelled) {
         sendError('Build cancelled');
      } else {
         sendError(error instanceof Error ? error.message : String(error));
      }
   } finally {
      // Clean up git temp directory
      if (gitResult?.tempDir) {
         await gitSource.cleanup(gitResult.tempDir);
      }
   }
}

// Listen for messages from main thread
parentPort?.on('message', (msg: WorkerInMessage) => {
   if (msg.type === 'cancel') {
      cancelled = true;
   } else if (msg.type === 'start' && msg.params) {
      executeBuild(msg.params).catch((error) => {
         sendError(error instanceof Error ? error.message : String(error));
      });
   }
});

// If started with workerData, begin immediately
if (workerData?.params) {
   executeBuild(workerData.params as BuildParams).catch((error) => {
      sendError(error instanceof Error ? error.message : String(error));
   });
}

/**
 * Build Worker - Runs build operations in a worker thread
 *
 * This script is executed in a worker thread to perform CPU-intensive
 * build operations without blocking the main MCP server thread.
 */

import { parentPort, workerData } from 'worker_threads';
import * as path from 'path';
import { Builder, LibraryManager, formatBytes } from '@libragen/core';
import type { BuildProgress } from '@libragen/core';
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
 * Execute the build operation using the core Builder class.
 */
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

   try {
      sendProgress('Initializing...', 5);
      checkCancelled();

      const builder = new Builder();

      // Build using the core Builder class with progress callback
      const buildOptions = {
         output,
         name,
         version,
         contentVersion,
         description,
         agentDescription,
         exampleQueries,
         keywords,
         programmingLanguages,
         textLanguages,
         frameworks,
         chunkSize,
         chunkOverlap,
         include,
         exclude,
         noDefaultExcludes: false,
         gitRef,
         gitRepoAuthToken,
         license,
      };

      const handleProgress = (progress: BuildProgress): void => {
         checkCancelled();

         // Map BuildProgress to worker progress
         const progressMap: Record<string, number> = {
            'initializing': 5,
            'cloning': 10,
            'loading-model': 20,
            'chunking': 30,
            'embedding': progress.progress,
            'creating-database': 90,
            'complete': 100,
         };

         const pct = progressMap[progress.phase] ?? progress.progress;

         sendProgress(progress.message, pct);
      };

      const buildResult = await builder.build(source, buildOptions, handleProgress);

      checkCancelled();

      // Format result message
      let result = `✓ Built library: ${buildResult.metadata.name}\n`;

      result += `  Output: ${buildResult.outputPath}\n`;
      result += `  Size: ${formatBytes(buildResult.stats.fileSize)}\n`;
      result += `  Chunks: ${buildResult.stats.chunkCount}\n`;
      result += `  Sources: ${buildResult.stats.sourceCount} files`;

      if (buildResult.git) {
         result += `\n  Commit: ${buildResult.git.commitHash.slice(0, 8)}`;
         result += `\n  Ref: ${buildResult.git.ref}`;
      }

      if (buildResult.metadata.source?.licenses?.length) {
         result += `\n  License: ${buildResult.metadata.source.licenses.join(', ')}`;
      }

      // Install if requested
      if (install) {
         sendProgress('Installing library...', 95);
         checkCancelled();

         // Use explicit install path if provided (from MCP server's discovered paths)
         // Otherwise fall back to default behavior
         const managerOptions = params.installPath
            ? { paths: [ params.installPath ] }
            : undefined;

         const manager = new LibraryManager(managerOptions),
               installed = await manager.install(path.resolve(buildResult.outputPath), { force: true });

         result += `\n\n✓ Installed to: ${installed.path}`;
      }

      sendProgress('Complete', 100);
      sendComplete(result);
   } catch(error) {
      if (cancelled) {
         sendError('Build cancelled');
      } else {
         sendError(error instanceof Error ? error.message : String(error));
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

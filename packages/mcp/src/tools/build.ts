/**
 * libragen_build MCP tool
 *
 * Creates a .libragen library from source files.
 * Supports async builds with action parameter: start, status, cancel.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { estimateEmbeddingTime } from '@libragen/core';
import {
   getTaskManager,
   initializeWorkerPool,
   cancelWorker,
   type BuildParams,
   type BuildTask,
} from '../tasks/index.ts';
import { getLibraryPaths } from '../server.ts';

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface BuildToolConfig {
   // Config options reserved for future use
}

// Track if worker pool has been initialized
let workerPoolInitialized = false;

/**
 * Calculate estimated time remaining based on progress and elapsed time.
 */
function calculateTimeEstimate(task: BuildTask, chunkCount?: number): {
   elapsedSeconds?: number;
   estimatedTotalSeconds: number;
   estimatedRemainingSeconds?: number;
} {
   // Use system-aware estimation from core if we have chunk count
   const baseEstimate = chunkCount
      ? estimateEmbeddingTime(chunkCount).estimatedSeconds
      : 60; // Default fallback

   // Add overhead for non-embedding phases (~15 seconds)
   const estimatedTotalSeconds = Math.round(baseEstimate + 15);

   if (!task.startedAt) {
      return { estimatedTotalSeconds };
   }

   const elapsedMs = Date.now() - task.startedAt.getTime(),
         elapsedSeconds = Math.round(elapsedMs / 1000);

   if (task.progress <= 0) {
      return { elapsedSeconds, estimatedTotalSeconds };
   }

   // Calculate remaining time based on progress
   const progressRatio = task.progress / 100,
         elapsedBasedTotal = elapsedSeconds / progressRatio,
         estimatedRemaining = Math.max(0, Math.round((1 - progressRatio) * elapsedBasedTotal));

   return {
      elapsedSeconds,
      estimatedTotalSeconds: Math.round(elapsedBasedTotal),
      estimatedRemainingSeconds: estimatedRemaining,
   };
}

/**
 * Format a task for response.
 */
function formatTaskResponse(task: BuildTask): {
   taskId: string;
   status: string;
   progress: number;
   currentStep: string;
   result?: string;
   error?: string;
   queuePosition?: number;
   elapsedSeconds?: number;
   estimatedTotalSeconds?: number;
   estimatedRemainingSeconds?: number;
} {
   const taskManager = getTaskManager(),
         queueLength = taskManager.getQueueLength();

   // Calculate queue position if queued
   let queuePosition: number | undefined;

   if (task.status === 'queued') {
      const allTasks = taskManager.getAllTasks();

      const queuedTasks = allTasks.filter((t) => {
         return t.status === 'queued';
      });

      queuePosition = queuedTasks.findIndex((t) => {
         return t.id === task.id;
      }) + 1;
   }

   // Calculate time estimates for running tasks
   const timeEstimate = task.status === 'running' ? calculateTimeEstimate(task) : undefined;

   return {
      taskId: task.id,
      status: task.status,
      progress: task.progress,
      currentStep: task.currentStep,
      result: task.result,
      error: task.error,
      queuePosition: queuePosition ?? (task.status === 'queued' ? queueLength : undefined),
      ...timeEstimate,
   };
}

/**
 * Register the libragen_build tool with the MCP server.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function registerBuildTool(server: McpServer, config: BuildToolConfig = {}): void {
   // Initialize worker pool on first registration
   if (!workerPoolInitialized) {
      initializeWorkerPool();
      workerPoolInitialized = true;
   }

   const toolConfig = {
      title: 'Build Library',
      description: `Build a searchable .libragen library from any text content for semantic search.

ACTIONS:
- action: 'start' (default) - Start a new build, returns taskId immediately
- action: 'status' - Check build progress (requires taskId)
- action: 'cancel' - Cancel a running or queued build (requires taskId)

WORKFLOW:
1. Call with action='start' and source to begin a build
2. Poll with action='status' and taskId to check progress (every 3-5 seconds)
3. When status='completed', the result contains the build output

IMPORTANT - USER FEEDBACK:
When polling for status, ALWAYS inform the user about progress. The response includes:
- progress: percentage complete (0-100)
- currentStep: what the build is currently doing
- estimatedTotalSeconds: estimated total build time (~60s for typical builds)
- estimatedRemainingSeconds: estimated seconds until completion
- elapsedSeconds: how long the build has been running

Example user updates:
- "Building library... 20% complete (Loading embedding model). About 45 seconds remaining."
- "Build progress: 65% - Generating embeddings (234/500 chunks). ~20 seconds left."
- "Almost done! 95% complete - Installing library..."

Builds typically take 30-90 seconds depending on content size. The embedding phase (40-85%) is the longest.

USE THIS TOOL when you need to:
- Index code, documentation, research papers, articles, or notes
- Create a searchable knowledge base from any text files
- Build a RAG database for AI-assisted retrieval
- Make content available for semantic search queries

SUPPORTED SOURCES:
- Local directories or files
- Git repository URLs (GitHub, GitLab, Bitbucket)
- Markdown files (.md, .mdx)
- Code files (.js, .ts, .py, .go, .rs, .java, .c, .cpp, .rb, .php, etc.)
- Documentation directories (READMEs, wikis, Obsidian vaults, Notion exports)
- Plain text files (.txt)
- JSON/YAML config files

GIT URL EXAMPLES:
- https://github.com/org/repo
- https://github.com/org/repo/tree/v1.0.0
- https://github.com/org/repo/tree/main/docs
- https://gitlab.com/org/repo/-/tree/main/src

The resulting library can be searched with libragen_search to find relevant content.`,
      inputSchema: {
         action: z.enum([ 'start', 'status', 'cancel' ]).default('start')
            .describe('Action to perform: start a build, check status, or cancel'),
         taskId: z.string().optional()
            .describe('Task ID (required for status and cancel actions)'),
         source: z.string().optional()
            .describe('Source directory, file path, or git repository URL to index (required for start action)'),
         output: z.string().optional()
            .describe('Output path for the .libragen file (defaults to <name>.libragen)'),
         name: z.string().optional()
            .describe('Library name (defaults to directory/file name)'),
         version: z.string().optional().default('0.1.0')
            .describe('Library version'),
         contentVersion: z.string().optional()
            .describe('Version of the source content being indexed'),
         description: z.string().optional()
            .describe('Short description of the library'),
         agentDescription: z.string().optional()
            .describe('Guidance for AI agents on when to use this library'),
         exampleQueries: z.array(z.string()).optional()
            .describe('Example queries this library can answer'),
         keywords: z.array(z.string()).optional()
            .describe('Searchable keywords/tags'),
         programmingLanguages: z.array(z.string()).optional()
            .describe('Programming languages covered (e.g., "typescript", "python")'),
         textLanguages: z.array(z.string()).optional()
            .describe('Human/natural languages of the content as ISO 639-1 codes (e.g., "en", "es")'),
         frameworks: z.array(z.string()).optional()
            .describe('Frameworks covered'),
         chunkSize: z.number().optional().default(1000)
            .describe('Target chunk size in characters'),
         chunkOverlap: z.number().optional().default(100)
            .describe('Chunk overlap in characters'),
         include: z.array(z.string()).optional()
            .describe('Glob patterns to include'),
         exclude: z.array(z.string()).optional()
            .describe('Glob patterns to exclude'),
         gitRef: z.string().optional()
            .describe('Git branch, tag, or commit to checkout (remote git sources only)'),
         gitRepoAuthToken: z.string().optional()
            .describe('Auth token for private git repositories (remote git sources only)'),
         license: z.array(z.string()).optional()
            .describe('SPDX license identifier(s) for the source content'),
         install: z.boolean().optional().default(false)
            .describe('Install the library after building'),
      },
   };

   server.registerTool('libragen_build', toolConfig, async (params) => {
      const { action = 'start', taskId } = params;

      const taskManager = getTaskManager();

      switch (action) {
         case 'start': {
            // Validate source is provided
            if (!params.source) {
               return {
                  content: [
                     {
                        type: 'text' as const,
                        text: JSON.stringify({ error: 'source is required for start action' }),
                     },
                  ],
               };
            }

            // Get install path from discovered library paths (first path is primary)
            const libraryPaths = getLibraryPaths(),
                  installPath = libraryPaths.length > 0 ? libraryPaths[0] : undefined;

            // Validate install path if install is requested
            if (params.install && !installPath) {
               return {
                  content: [
                     {
                        type: 'text' as const,
                        text: JSON.stringify({
                           error: 'Cannot install: no library directory available. ' +
                              'Ensure LIBRAGEN_HOME or HOME environment variable is set.',
                        }),
                     },
                  ],
               };
            }

            // Build params for the task
            const buildParams: BuildParams = {
               source: params.source,
               output: params.output,
               name: params.name,
               version: params.version,
               contentVersion: params.contentVersion,
               description: params.description,
               agentDescription: params.agentDescription,
               exampleQueries: params.exampleQueries,
               keywords: params.keywords,
               programmingLanguages: params.programmingLanguages,
               textLanguages: params.textLanguages,
               frameworks: params.frameworks,
               chunkSize: params.chunkSize,
               chunkOverlap: params.chunkOverlap,
               include: params.include,
               exclude: params.exclude,
               gitRef: params.gitRef,
               gitRepoAuthToken: params.gitRepoAuthToken,
               license: params.license,
               install: params.install,
               installPath,
            };

            // Create task and start processing queue
            const task = taskManager.createTask(buildParams);

            taskManager.processQueue();

            const response = formatTaskResponse(task);

            // Get system-aware time estimate (assumes ~500 chunks for unknown content)
            const defaultEstimate = estimateEmbeddingTime(500),
                  estimatedSeconds = Math.round(defaultEstimate.estimatedSeconds + 15);

            return {
               content: [
                  {
                     type: 'text' as const,
                     text: JSON.stringify({
                        ...response,
                        estimatedTotalSeconds: estimatedSeconds,
                        message: `Build started. Estimated time: ~${estimatedSeconds}s. ` +
                           'Poll with action="status" every 3-5s and inform the user of progress.',
                     }),
                  },
               ],
            };
         }

         case 'status': {
            if (!taskId) {
               return {
                  content: [
                     {
                        type: 'text' as const,
                        text: JSON.stringify({ error: 'taskId is required for status action' }),
                     },
                  ],
               };
            }

            const task = taskManager.getTask(taskId);

            if (!task) {
               return {
                  content: [
                     {
                        type: 'text' as const,
                        text: JSON.stringify({ error: 'Task not found', taskId }),
                     },
                  ],
               };
            }

            return {
               content: [
                  {
                     type: 'text' as const,
                     text: JSON.stringify(formatTaskResponse(task)),
                  },
               ],
            };
         }

         case 'cancel': {
            if (!taskId) {
               return {
                  content: [
                     {
                        type: 'text' as const,
                        text: JSON.stringify({ error: 'taskId is required for cancel action' }),
                     },
                  ],
               };
            }

            const task = taskManager.getTask(taskId);

            if (!task) {
               return {
                  content: [
                     {
                        type: 'text' as const,
                        text: JSON.stringify({ error: 'Task not found', taskId }),
                     },
                  ],
               };
            }

            // Cancel worker if running
            if (task.status === 'running') {
               cancelWorker(taskId);
            }

            const cancelled = taskManager.cancelTask(taskId);

            return {
               content: [
                  {
                     type: 'text' as const,
                     text: JSON.stringify({
                        success: cancelled,
                        taskId,
                        message: cancelled
                           ? 'Build cancelled'
                           : 'Task could not be cancelled (may already be completed)',
                     }),
                  },
               ],
            };
         }

         default: {
            return {
               content: [
                  {
                     type: 'text' as const,
                     text: JSON.stringify({ error: `Unknown action: ${action}` }),
                  },
               ],
            };
         }
      }
   });
}

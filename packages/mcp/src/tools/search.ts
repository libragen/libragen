/**
 * libragen_search MCP tool
 *
 * Searches libraries for relevant content using hybrid search.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { Embedder, VectorStore, Searcher, Reranker } from '@libragen/core';
import type { LibraryMetadata, StoredChunk } from '@libragen/core';
import * as path from 'path';
import * as fs from 'fs';
import type { ServerConfig } from '../server.ts';
import { getLibraryPaths } from '../server.ts';

interface SearchResultItem {
   content: string;
   score: number;
   sourceFile: string;
   startLine?: number;
   endLine?: number;
   language?: string;
   library: string;
   contextBefore?: StoredChunk[];
   contextAfter?: StoredChunk[];
}

/**
 * Register the libragen_search tool with the MCP server.
 */
export function registerSearchTool(server: McpServer, config: ServerConfig): void {
   // Use pre-warmed embedder if provided, otherwise create on demand
   const sharedEmbedder = config.embedder;

   // Lazy-initialized reranker (only created when rerank=true)
   let sharedReranker: Reranker | null = null;

   const toolConfig = {
      title: 'Search Libraries',
      description: `Search your installed libragen libraries for relevant code snippets, documentation, and examples.

USE THIS TOOL when you need to:
- Find code examples for a specific task or API
- Look up how something is implemented in a codebase
- Search documentation for a library or framework
- Find relevant patterns or best practices

Uses semantic search combined with keyword matching. Results include file paths and line numbers.

Libraries are discovered from:
- Project-local .libragen/libraries (if workspace root has one)
- Global library directory`,
      inputSchema: {
         query: z.string().describe('Natural language search query (e.g., "how to authenticate users")'),
         libraries: z.array(z.string()).optional()
            .describe('Specific libraries to search (searches all installed libraries if not specified)'),
         contentVersion: z.string().optional().describe('Filter results by content version'),
         topK: z.number().optional().default(10).describe('Number of results to return (default: 10)'),
         hybridAlpha: z.number().optional().default(0.5)
            .describe('Balance between vector (1) and keyword (0) search (default: 0.5)'),
         contextBefore: z.number().optional().default(1)
            .describe('Number of chunks to include before each result for context (default: 1)'),
         contextAfter: z.number().optional().default(1)
            .describe('Number of chunks to include after each result for context (default: 1)'),
         rerank: z.boolean().optional().default(false)
            .describe('Apply cross-encoder reranking for improved relevance (slower but more accurate)'),
      },
   };

   server.registerTool('libragen_search', toolConfig, async ({
      query,
      libraries,
      contentVersion,
      topK = 10,
      hybridAlpha = 0.5,
      contextBefore = 1,
      contextAfter = 1,
      rerank = false,
   }) => {
      // Get library paths (includes project-local if discovered from roots)
      const libraryPaths = config.librariesDir
         ? [ config.librariesDir ]
         : getLibraryPaths();

      // Discover available libraries from all paths
      const availableLibraries = discoverLibrariesFromPaths(libraryPaths);

      // Filter to requested libraries if specified
      const targetLibraries = libraries
         ? availableLibraries.filter((lib) => {
            return libraries.includes(lib.name);
         })
         : availableLibraries;

      if (targetLibraries.length === 0) {
         return {
            content: [ { type: 'text' as const, text: 'No libraries found to search.' } ],
         };
      }

      // Use shared embedder if available, otherwise create a new one
      const embedder = sharedEmbedder ?? new Embedder();

      const ownsEmbedder = !sharedEmbedder;

      // Initialize reranker if needed (lazy initialization)
      let reranker: Reranker | undefined;

      if (rerank) {
         if (!sharedReranker) {
            sharedReranker = new Reranker();
         }
         reranker = sharedReranker;
      }

      try {
         const allResults: SearchResultItem[] = [];

         // Search each library
         for (const lib of targetLibraries) {
            const store = new VectorStore(lib.path);

            store.initialize();

            const searcher = new Searcher(embedder, store, { reranker });

            const results = await searcher.search({
               query,
               k: topK,
               hybridAlpha,
               contentVersion,
               contextBefore,
               contextAfter,
               rerank,
            });

            for (const result of results) {
               allResults.push({
                  content: result.content,
                  score: result.score,
                  sourceFile: result.sourceFile,
                  startLine: result.startLine,
                  endLine: result.endLine,
                  language: result.language,
                  library: lib.name,
                  contextBefore: result.contextBefore,
                  contextAfter: result.contextAfter,
               });
            }

            store.close();
         }

         // Sort by score and limit to topK
         allResults.sort((a, b) => {
            return b.score - a.score;
         });
         const limitedResults = allResults.slice(0, topK);

         // Format text output
         const textOutput = formatResults(limitedResults);

         return {
            content: [ { type: 'text' as const, text: textOutput } ],
         };
      } finally {
         // Only dispose if we created the embedder (not shared)
         if (ownsEmbedder) {
            await embedder.dispose();
         }
      }
   });
}

interface LibraryInfo {
   name: string;
   path: string;
}

/**
 * Discover libraries from multiple paths, deduplicating by name.
 * First path has priority (project-local wins over global).
 */
function discoverLibrariesFromPaths(libraryPaths: string[]): LibraryInfo[] {
   const libraries: LibraryInfo[] = [],
         seen = new Set<string>();

   for (const librariesDir of libraryPaths) {
      const libs = discoverLibraries(librariesDir);

      for (const lib of libs) {
         if (!seen.has(lib.name)) {
            seen.add(lib.name);
            libraries.push(lib);
         }
      }
   }

   return libraries;
}

function discoverLibraries(librariesDir: string): LibraryInfo[] {
   // eslint-disable-next-line no-sync
   if (!fs.existsSync(librariesDir)) {
      return [];
   }

   // eslint-disable-next-line no-sync
   const entries = fs.readdirSync(librariesDir);

   const libraries: LibraryInfo[] = [];

   for (const entry of entries) {
      if (entry.endsWith('.libragen')) {
         const libPath = path.join(librariesDir, entry);

         try {
            // Open library to read actual metadata name (not filename)
            const store = new VectorStore(libPath);

            store.initialize();

            const metadata = store.getMetadata<LibraryMetadata>();

            store.close();

            if (metadata?.name) {
               libraries.push({
                  name: metadata.name,
                  path: libPath,
               });
            }
         } catch{
            // Skip invalid library files
            continue;
         }
      }
   }

   return libraries;
}

function formatResults(results: SearchResultItem[]): string {
   if (results.length === 0) {
      return 'No results found.';
   }

   const lines: string[] = [ `Found ${results.length} result(s):\n` ];

   for (let i = 0; i < results.length; i++) {
      const result = results[i];

      let lineInfo = '';

      if (result.startLine) {
         lineInfo = `:${result.startLine}${result.endLine ? `-${result.endLine}` : ''}`;
      }

      lines.push(`--- Result ${i + 1} [${result.library}] ${result.sourceFile}${lineInfo} (score: ${result.score.toFixed(3)}) ---`);

      // Show context before if present
      if (result.contextBefore && result.contextBefore.length > 0) {
         for (const chunk of result.contextBefore) {
            const ctxLine = chunk.startLine ? `:${chunk.startLine}` : '';

            lines.push(`[context${ctxLine}]`);
            lines.push(chunk.content.trim());
            lines.push('');
         }
         lines.push('--- match ---');
      }

      lines.push(result.content);

      // Show context after if present
      if (result.contextAfter && result.contextAfter.length > 0) {
         lines.push('--- match ---');

         for (const chunk of result.contextAfter) {
            const ctxLine = chunk.startLine ? `:${chunk.startLine}` : '';

            lines.push('');
            lines.push(`[context${ctxLine}]`);
            lines.push(chunk.content.trim());
         }
      }

      lines.push('');
   }

   return lines.join('\n');
}

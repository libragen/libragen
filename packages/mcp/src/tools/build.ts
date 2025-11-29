/**
 * libragen_build MCP tool
 *
 * Creates a .libragen library from source files.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
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

export interface BuildToolConfig {

   /** Pre-warmed embedder instance */
   embedder?: Embedder;
}

/**
 * Register the libragen_build tool with the MCP server.
 */
export function registerBuildTool(server: McpServer, config: BuildToolConfig = {}): void {
   const toolConfig = {
      title: 'Build Library',
      description: `Build a searchable .libragen library from any text content for semantic search.

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
         source: z.string().describe('Source directory, file path, or git repository URL to index'),
         output: z.string().optional().describe('Output path for the .libragen file (defaults to <name>.libragen)'),
         name: z.string().optional().describe('Library name (defaults to directory/file name)'),
         version: z.string().optional().default('0.1.0').describe('Library version'),
         contentVersion: z.string().optional().describe('Version of the source content being indexed'),
         description: z.string().optional().describe('Short description of the library'),
         agentDescription: z.string().optional().describe('Guidance for AI agents on when to use this library'),
         exampleQueries: z.array(z.string()).optional().describe('Example queries this library can answer'),
         keywords: z.array(z.string()).optional().describe('Searchable keywords/tags'),
         programmingLanguages: z.array(z.string()).optional().describe('Programming languages covered (e.g., "typescript", "python")'),
         // eslint-disable-next-line @typescript-eslint/no-unused-vars
         textLanguages: z.array(z.string()).optional()
            .describe('Human/natural languages of the content as ISO 639-1 codes (e.g., "en", "es")'),
         frameworks: z.array(z.string()).optional().describe('Frameworks covered'),
         chunkSize: z.number().optional().default(1000).describe('Target chunk size in characters'),
         chunkOverlap: z.number().optional().default(100).describe('Chunk overlap in characters'),
         include: z.array(z.string()).optional().describe('Glob patterns to include'),
         exclude: z.array(z.string()).optional().describe('Glob patterns to exclude'),
         gitRef: z.string().optional().describe('Git branch, tag, or commit to checkout (remote git sources only)'),
         gitRepoAuthToken: z.string().optional().describe('Auth token for private git repositories (remote git sources only)'),
         license: z.array(z.string()).optional().describe('SPDX license identifier(s) for the source content'),
         install: z.boolean().optional().default(false).describe('Install the library after building'),
      },
   };

   // eslint-disable-next-line complexity
   server.registerTool('libragen_build', toolConfig, async (params) => {
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
         // Detect if source is a git URL
         const isGit = isGitUrl(source);

         let includePatterns = include,
             sourceProvenance: SourceProvenance,
             sourcePath: string;

         if (isGit) {
            // Parse git URL to extract repo, ref, and path
            const parsed = parseGitUrl(source);

            const resolvedRef = gitRef || parsed.ref;

            const resolvedToken = getAuthToken(parsed.repoUrl, gitRepoAuthToken);

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
            // Local source
            sourcePath = path.resolve(source);

            let stats;

            try {
               stats = await fs.stat(sourcePath);
            } catch(_e) {
               return {
                  content: [
                     {
                        type: 'text' as const,
                        text: `Error: Source not found: ${sourcePath}`,
                     },
                  ],
               };
            }

            if (!stats.isDirectory() && !stats.isFile()) {
               return {
                  content: [
                     {
                        type: 'text' as const,
                        text: `Error: ${source} is not a valid file or directory`,
                     },
                  ],
               };
            }

            sourceProvenance = {
               type: 'local',
               path: sourcePath,
               licenses: license,
            };
         }

         const libraryName = name || (isGit ? deriveGitLibraryName(parseGitUrl(source).repoUrl) : path.basename(sourcePath)),
               outputPath = output || `${libraryName}.libragen`;

         // Use pre-warmed embedder or create new one
         const embedder = config.embedder || new Embedder(),
               disposeEmbedder = !config.embedder;

         try {
            // Initialize embedder if not pre-warmed
            if (!config.embedder) {
               await embedder.initialize();
            }

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

            if (chunks.length === 0) {
               return {
                  content: [
                     {
                        type: 'text' as const,
                        text: 'No content found to index. Check your source path and include/exclude patterns.',
                     },
                  ],
               };
            }

            // Generate embeddings
            const contents = chunks.map((c) => {
               return c.content;
            });

            const embeddings = await embedder.embedBatch(contents);

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
                  sourceCount: new Set(
                     chunks.map((c) => {
                        return c.metadata.sourceFile;
                     })
                  )
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
               const { LibraryManager } = await import('@libragen/core');

               const manager = new LibraryManager();

               const installed = await manager.install(path.resolve(outputPath), { force: true });

               result += `\n\n✓ Installed to: ${installed.path}`;
            }

            return {
               content: [ { type: 'text' as const, text: result } ],
            };
         } finally {
            if (disposeEmbedder) {
               await embedder.dispose();
            }
         }
      } catch(error) {
         return {
            content: [
               {
                  type: 'text' as const,
                  text: `Error: ${error instanceof Error ? error.message : String(error)}`,
               },
            ],
         };
      } finally {
         // Clean up git temp directory
         if (gitResult?.tempDir) {
            await gitSource.cleanup(gitResult.tempDir);
         }
      }
   });
}

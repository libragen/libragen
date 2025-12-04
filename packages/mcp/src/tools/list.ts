/**
 * libragen_list MCP tool
 *
 * Lists available libraries in the libraries directory.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { LibraryManager, formatBytes } from '@libragen/core';
import type { InstalledLibrary } from '@libragen/core';
import type { ServerConfig } from '../server.ts';
import { getLibraryPaths } from '../server.ts';

/**
 * Register the libragen_list tool with the MCP server.
 */
export function registerListTool(server: McpServer, config: ServerConfig): void {
   const toolConfig = {
      title: 'List Libraries',
      description: `List all installed libragen libraries with their metadata, descriptions, and usage guidance.

USE THIS TOOL when you need to:
- See what libraries are available to search
- Find the right library for a specific topic or framework
- Check library versions and content coverage
- Discover example queries for each library

Each library includes an "agentDescription" explaining when to use it, and "exampleQueries" showing what questions it can answer.

Libraries are discovered from:
- Project-local .libragen/libraries (if workspace root has one)
- Global library directory`,
      inputSchema: {},
   };

   server.registerTool('libragen_list', toolConfig, async () => {
      // Get library paths (includes project-local if discovered from roots)
      const libraryPaths = config.librariesDir
         ? [ config.librariesDir ]
         : getLibraryPaths();

      // Use LibraryManager to discover libraries
      const manager = new LibraryManager({ paths: libraryPaths });

      const libraries = await manager.listInstalled();

      if (libraries.length === 0) {
         return {
            content: [ { type: 'text' as const, text: 'No libraries found.' } ],
         };
      }

      const textOutput = formatLibraries(libraries);

      return {
         content: [ { type: 'text' as const, text: textOutput } ],
      };
   });
}

/**
 * Format libraries for display.
 */
// eslint-disable-next-line complexity
function formatLibraries(libraries: InstalledLibrary[]): string {
   const lines: string[] = [ `Found ${libraries.length} library(ies):\n` ];

   for (const lib of libraries) {
      lines.push(`📚 ${lib.name}`);

      if (lib.description) {
         lines.push(`   ${lib.description}`);
      }

      // Agent guidance (most important for library selection)
      if (lib.metadata.agentDescription) {
         lines.push(`   🤖 When to use: ${lib.metadata.agentDescription}`);
      }

      if (lib.metadata.exampleQueries && lib.metadata.exampleQueries.length > 0) {
         lines.push(`   💡 Example queries: "${lib.metadata.exampleQueries.join('", "')}"`);
      }

      // Categorization
      if (lib.metadata.programmingLanguages && lib.metadata.programmingLanguages.length > 0) {
         lines.push(`   Programming Languages: ${lib.metadata.programmingLanguages.join(', ')}`);
      }

      if (lib.metadata.textLanguages && lib.metadata.textLanguages.length > 0) {
         lines.push(`   Text Languages: ${lib.metadata.textLanguages.join(', ')}`);
      }

      if (lib.metadata.frameworks && lib.metadata.frameworks.length > 0) {
         lines.push(`   Frameworks: ${lib.metadata.frameworks.join(', ')}`);
      }

      if (lib.metadata.keywords && lib.metadata.keywords.length > 0) {
         lines.push(`   Keywords: ${lib.metadata.keywords.join(', ')}`);
      }

      // Source and license info
      if (lib.metadata.source) {
         if (lib.metadata.source.type === 'git' && lib.metadata.source.url) {
            lines.push(`   Source: ${lib.metadata.source.url}`);
         } else if (lib.metadata.source.type === 'local' && lib.metadata.source.path) {
            lines.push(`   Source: ${lib.metadata.source.path}`);
         }
         if (lib.metadata.source.licenses && lib.metadata.source.licenses.length > 0) {
            lines.push(`   License: ${lib.metadata.source.licenses.join(', ')}`);
         }
      }

      // Technical details
      if (lib.metadata.schemaVersion !== undefined) {
         lines.push(`   Schema Version: ${lib.metadata.schemaVersion}`);
      }

      if (lib.contentVersion) {
         lines.push(`   Content Version: ${lib.contentVersion}`);
      }

      if (lib.metadata.stats.chunkCount !== undefined) {
         lines.push(`   Chunks: ${lib.metadata.stats.chunkCount}`);
      }

      if (lib.metadata.stats.fileSize !== undefined && lib.metadata.stats.fileSize > 0) {
         lines.push(`   Size: ${formatBytes(lib.metadata.stats.fileSize)}`);
      }

      lines.push('');
   }

   return lines.join('\n');
}

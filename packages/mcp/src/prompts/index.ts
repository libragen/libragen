/**
 * MCP Prompts (slash commands)
 *
 * Prompts are reusable templates that guide LLM interactions.
 * They appear as slash commands in MCP-compatible clients.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

/**
 * Register all libragen prompts with the MCP server.
 */
export function registerPrompts(server: McpServer): void {
   registerSearchPrompt(server);
   registerBuildPrompt(server);
   registerUpdatePrompt(server);
   registerCollectionPrompt(server);
}

/**
 * /libragen-search - Search installed libraries for code snippets
 */
function registerSearchPrompt(server: McpServer): void {
   const config = {
      title: 'Search Libraries',
      description: 'Search your installed libragen libraries for relevant code, documentation, and examples',
      argsSchema: {
         query: z.string().describe('What are you looking for? (e.g., "authentication", "React hooks")'),
      },
   };

   server.registerPrompt('libragen-search', config, ({ query }) => {
      return {
         messages: [
            {
               role: 'user' as const,
               content: {
                  type: 'text' as const,
                  text: `Search my installed libragen libraries for: "${query}"

Use the libragen_search tool to find relevant code snippets, documentation, and examples.

After searching:
1. Show the most relevant results with file paths and line numbers
2. Explain how the code relates to my query
3. Offer to search with different terms or in specific libraries if needed`,
               },
            },
         ],
      };
   });
}

/**
 * /libragen-build - Build a library from source files
 */
function registerBuildPrompt(server: McpServer): void {
   const config = {
      title: 'Build Library',
      description: 'Build a searchable library from any text content: code, docs, papers, articles, notes',
      argsSchema: {
         source: z.string().describe('Path to the directory or files to index'),
      },
   };

   server.registerPrompt('libragen-build', config, ({ source }) => {
      return {
         messages: [
            {
               role: 'user' as const,
               content: {
                  type: 'text' as const,
                  text: `Build a libragen library from: ${source}

Use the libragen_build tool to create a searchable library. Please:
1. Use sensible defaults for the library name (based on the directory name)
2. Set install=true so the library is immediately available for searching
3. Report the results including number of files indexed and chunks created
4. Suggest using /libragen-search to query the new library`,
               },
            },
         ],
      };
   });
}

/**
 * /libragen-update - Update installed libraries to newer versions
 */
function registerUpdatePrompt(server: McpServer): void {
   const config = {
      title: 'Update Libraries',
      description: 'Check for and apply updates to installed libraries from collections',
      argsSchema: {
         name: z.string().optional().describe('Library name to update (leave empty to check all)'),
         dryRun: z.boolean().optional().describe('Just check for updates without applying them'),
      },
   };

   server.registerPrompt('libragen-update', config, ({ name, dryRun }) => {
      const target = name ? `library "${name}"` : 'all installed libraries',
            mode = dryRun ? ' (dry run - just checking)' : '';

      return {
         messages: [
            {
               role: 'user' as const,
               content: {
                  type: 'text' as const,
                  text: `Check for updates to ${target}${mode}

Use the libragen_update tool to:
1. Check which libraries have newer versions available in collections
2. Show the version changes (current → new)
3. ${dryRun ? 'Report what would be updated' : 'Apply the updates'}
4. Summarize the results`,
               },
            },
         ],
      };
   });
}

/**
 * /libragen-collection - Create a collection of libraries
 */
function registerCollectionPrompt(server: McpServer): void {
   const config = {
      title: 'Create Collection',
      description: 'Create a collection file that groups multiple libraries together',
      argsSchema: {
         name: z.string().describe('Name for the collection'),
         libraries: z.string().optional()
            .describe('Comma-separated list of library paths (or leave empty to scan current directory)'),
      },
   };

   server.registerPrompt('libragen-collection', config, ({ name, libraries }) => {
      const libraryList = libraries
         ? `Include these libraries: ${libraries}`
         : 'Scan the current directory for .libragen files to include';

      return {
         messages: [
            {
               role: 'user' as const,
               content: {
                  type: 'text' as const,
                  text: `Create a libragen collection named "${name}"

${libraryList}

Use the libragen_collection tool to create the collection file. Please:
1. Create the collection as ${name}.json
2. Add a helpful description
3. Show the resulting collection structure
4. Provide the command to install the collection`,
               },
            },
         ],
      };
   });
}

/**
 * libragen_collection MCP tool
 *
 * Creates and manages collection files.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { CollectionDefinition, CollectionItem } from '@libragen/core';

/**
 * Register the libragen_collection tool with the MCP server.
 */
export function registerCollectionTool(server: McpServer): void {
   const toolConfig = {
      title: 'Create Collection',
      description: `Create a collection file that groups multiple libraries together for easy installation and sharing.

USE THIS TOOL when you need to:
- Bundle related libraries into a single installable package
- Create a project-specific library set
- Share a curated set of libraries with your team
- Organize libraries by topic, framework, or project

Collections support required and optional libraries, and can include nested collections.`,
      inputSchema: {
         output: z.string().describe('Output file path for the collection (.json)'),
         name: z.string().optional().describe('Collection name (defaults to filename)'),
         description: z.string().optional().describe('Collection description'),
         version: z.string().optional().default('1.0.0').describe('Collection version'),
         libraries: z.array(z.string()).optional()
            .describe('Array of library sources (URLs or paths to .libragen files)'),
         optionalLibraries: z.array(z.string()).optional()
            .describe('Array of optional library sources'),
         collections: z.array(z.string()).optional()
            .describe('Array of nested collection sources (URLs or paths to .json files)'),
      },
   };

   server.registerTool('libragen_collection', toolConfig, async (params) => {
      const {
         output,
         name,
         description,
         version = '1.0.0',
         libraries = [],
         optionalLibraries = [],
         collections = [],
      } = params;

      try {
         // Ensure .json extension
         const outputPath = output.endsWith('.json') ? output : `${output}.json`;

         // Derive name from filename if not provided
         const collectionName = name || path.basename(outputPath, '.json');

         // Build items array
         const items: CollectionItem[] = [];

         // Add required libraries
         for (const lib of libraries) {
            items.push({ library: lib });
         }

         // Add optional libraries
         for (const lib of optionalLibraries) {
            items.push({ library: lib, required: false });
         }

         // Add nested collections
         for (const coll of collections) {
            items.push({ collection: coll });
         }

         const definition: CollectionDefinition = {
            name: collectionName,
            version,
            items,
         };

         if (description) {
            definition.description = description;
         }

         // Write the file
         await fs.writeFile(outputPath, JSON.stringify(definition, null, 2) + '\n');

         const requiredCount = libraries.length,
               optionalCount = optionalLibraries.length,
               nestedCount = collections.length;

         let message = `✓ Created collection '${collectionName}'\n`;

         message += `File: ${outputPath}\n`;
         message += `Libraries: ${requiredCount + optionalCount}`;

         if (optionalCount > 0) {
            message += ` (${optionalCount} optional)`;
         }

         if (nestedCount > 0) {
            message += `\nNested collections: ${nestedCount}`;
         }

         message += '\n\nInstall with: libragen install ' + outputPath;

         return {
            content: [ { type: 'text' as const, text: message } ],
         };
      } catch(error) {
         return {
            content: [
               {
                  type: 'text' as const,
                  text: `Error: ${error instanceof Error ? error.message : String(error)}`,
               },
            ],
         };
      }
   });
}

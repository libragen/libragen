/**
 * libragen_uninstall MCP tool
 *
 * Removes an installed library.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { LibraryManager } from '@libragen/core';

/**
 * Register the libragen_uninstall tool with the MCP server.
 */
export function registerUninstallTool(server: McpServer): void {
   const toolConfig = {
      title: 'Uninstall Library',
      description: `Remove an installed libragen library from the system.

USE THIS TOOL when you need to:
- Remove a library you no longer need
- Free up disk space from unused libraries
- Clean up before reinstalling a library

Use libragen_list first to see installed libraries and their names.`,
      inputSchema: {
         name: z.string().describe('Name of the library to uninstall (use libragen_list to see available names)'),
      },
   };

   server.registerTool('libragen_uninstall', toolConfig, async ({ name }) => {
      const manager = new LibraryManager();

      // Find the library first to show what we're removing
      const lib = await manager.find(name);

      if (!lib) {
         return {
            content: [
               {
                  type: 'text' as const,
                  text: `Library '${name}' not found.`,
               },
            ],
         };
      }

      const removed = await manager.uninstall(name);

      if (removed) {
         return {
            content: [
               {
                  type: 'text' as const,
                  text: `✓ Uninstalled ${name}\nRemoved: ${lib.path}`,
               },
            ],
         };
      }

      return {
         content: [
            {
               type: 'text' as const,
               text: `Failed to uninstall '${name}'.`,
            },
         ],
      };
   });
}

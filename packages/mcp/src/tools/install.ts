/**
 * libragen_install MCP tool
 *
 * Installs a library or collection.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { LibraryManager, CollectionClient } from '@libragen/core';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';

/**
 * Register the libragen_install tool with the MCP server.
 */
export function registerInstallTool(server: McpServer): void {
   const toolConfig = {
      title: 'Install Library or Collection',
      description: `Install a libragen library or collection to make it available for searching.

USE THIS TOOL when you need to:
- Install a library from a local .libragen file
- Install a library from a URL
- Install a collection of libraries at once
- Add new searchable content to your library set

After installation, use libragen_search to query the installed libraries.`,
      inputSchema: {
         source: z.string().describe('Library file (.libragen), collection file (.json), or URL'),
         force: z.boolean().optional().default(false).describe('Overwrite existing libraries'),
         includeOptional: z.boolean().optional().default(false)
            .describe('Include optional libraries when installing a collection'),
      },
   };

   server.registerTool('libragen_install', toolConfig, async (params) => {
      const { source, force = false, includeOptional = false } = params,
            manager = new LibraryManager();

      // Determine source type
      const isCollection = manager.isCollection(source),
            isLibraryFile = source.endsWith('.libragen'),
            isLocalPath = source.includes(path.sep) || source.startsWith('.'),
            isURL = source.startsWith('http://') || source.startsWith('https://');

      try {
         if (isCollection || (isURL && source.endsWith('.json'))) {
            // Install collection
            return await installCollection(manager, source, force, includeOptional);
         } else if (isLibraryFile || isLocalPath) {
            // Install from local library file
            return await installLocalLibrary(manager, source, force);
         } else if (isURL) {
            // Install from remote library URL
            return await installRemoteLibrary(manager, source, force);
         }

         // Legacy: search in configured collections by name
         return await installFromLegacyCollection(manager, source, force);
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

async function installLocalLibrary(
   manager: LibraryManager,
   source: string,
   force: boolean
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
   const sourcePath = path.resolve(source);

   try {
      await fs.access(sourcePath);
   } catch(_e) {
      return {
         content: [ { type: 'text' as const, text: `Error: File not found: ${sourcePath}` } ],
      };
   }

   const installed = await manager.install(sourcePath, { force });

   return {
      content: [
         {
            type: 'text' as const,
            text: `✓ Installed ${installed.name} v${installed.version}\nLocation: ${installed.path}`,
         },
      ],
   };
}

async function installRemoteLibrary(
   manager: LibraryManager,
   source: string,
   force: boolean
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
   const response = await fetch(source);

   if (!response.ok) {
      return {
         content: [
            {
               type: 'text' as const,
               text: `Error: Failed to download: ${response.status} ${response.statusText}`,
            },
         ],
      };
   }

   const tempPath = path.join(os.tmpdir(), `libragen-download-${Date.now()}.libragen`);

   const buffer = await response.arrayBuffer();

   await fs.writeFile(tempPath, Buffer.from(buffer));

   const installed = await manager.install(tempPath, { force });

   await fs.unlink(tempPath);

   return {
      content: [
         {
            type: 'text' as const,
            text: `✓ Installed ${installed.name} v${installed.version}\nLocation: ${installed.path}`,
         },
      ],
   };
}

async function installCollection(
   manager: LibraryManager,
   source: string,
   force: boolean,
   includeOptional: boolean
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
   const result = await manager.installCollection(source, {
      force,
      includeOptional,
   });

   const lines: string[] = [ `✓ Installed collection: ${result.collectionName}` ];

   if (result.installed.length > 0) {
      lines.push(`Installed: ${result.installed.join(', ')}`);
   }

   if (result.skipped.length > 0) {
      lines.push(`Skipped (already installed): ${result.skipped.join(', ')}`);
   }

   if (result.failed.length > 0) {
      lines.push('Failed:');

      for (const f of result.failed) {
         lines.push(`  - ${f.name}: ${f.error}`);
      }
   }

   return {
      content: [ { type: 'text' as const, text: lines.join('\n') } ],
   };
}

async function installFromLegacyCollection(
   manager: LibraryManager,
   source: string,
   force: boolean
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
   const client = new CollectionClient();

   await client.loadConfig();

   const collections = client.getCollections();

   if (collections.length === 0) {
      return {
         content: [
            {
               type: 'text' as const,
               text: 'No collections configured. Add a collection first using the CLI:\n' +
                  '  libragen collection add <name> <url>',
            },
         ],
      };
   }

   const entry = await client.getEntry(source);

   if (!entry) {
      return {
         content: [
            {
               type: 'text' as const,
               text: `Library '${source}' not found in collections.`,
            },
         ],
      };
   }

   const tempPath = path.join(os.tmpdir(), `libragen-download-${Date.now()}.libragen`);

   await client.download(entry, tempPath);

   const installed = await manager.install(tempPath, { force });

   await fs.unlink(tempPath);

   let message = `✓ Installed ${installed.name} v${installed.version}`;

   if (installed.contentVersion) {
      message += `\nContent version: ${installed.contentVersion}`;
   }
   message += `\nLocation: ${installed.path}`;

   return {
      content: [ { type: 'text' as const, text: message } ],
   };
}

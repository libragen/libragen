/**
 * libragen_update MCP tool
 *
 * Updates installed libraries to newer versions from collections.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { LibraryManager, CollectionClient, Library } from '@libragen/core';
import type { InstalledLibrary, CollectionEntry } from '@libragen/core';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';

interface UpdateCandidate {
   name: string;
   currentVersion: string;
   currentContentVersion?: string;
   newVersion: string;
   newContentVersion?: string;
   source: string;
}

/**
 * Register the libragen_update tool with the MCP server.
 */
export function registerUpdateTool(server: McpServer): void {
   const toolConfig = {
      title: 'Update Libraries',
      description: `Update installed libraries to newer versions from collections.

USE THIS TOOL when you need to:
- Check for updates to installed libraries
- Update a specific library to the latest version
- Update all libraries at once
- See what updates are available without applying them

Libraries are updated from their original collection sources.`,
      inputSchema: {
         name: z.string().optional().describe('Library name to update (updates all if omitted)'),
         force: z.boolean().optional().default(false)
            .describe('Force update even if versions match'),
         dryRun: z.boolean().optional().default(false)
            .describe('Show what would be updated without making changes'),
      },
   };

   server.registerTool('libragen_update', toolConfig, async (params) => {
      const { name, force = false, dryRun = false } = params;

      try {
         return await handleUpdate(name, force, dryRun);
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

type ToolResponse = { content: Array<{ type: 'text'; text: string }> };

async function handleUpdate(
   name: string | undefined,
   force: boolean,
   dryRun: boolean
): Promise<ToolResponse> {
   const manager = new LibraryManager(),
         client = new CollectionClient();

   await client.loadConfig();

   // Get installed libraries
   const installed = await manager.listInstalled();

   if (installed.length === 0) {
      return { content: [ { type: 'text' as const, text: 'No libraries installed.' } ] };
   }

   // Filter by name if specified
   const toCheck = name
      ? installed.filter((lib) => {
         return lib.name === name;
      })
      : installed;

   if (name && toCheck.length === 0) {
      return { content: [ { type: 'text' as const, text: `Library '${name}' is not installed.` } ] };
   }

   // Check for updates
   const updates = await findUpdates(toCheck, client, force);

   if (updates.length === 0) {
      return { content: [ { type: 'text' as const, text: '✓ All libraries are up to date.' } ] };
   }

   // Format update list
   const lines = formatUpdateList(updates);

   if (dryRun) {
      lines.push('', '(dry run - no changes made)');
      return { content: [ { type: 'text' as const, text: lines.join('\n') } ] };
   }

   // Perform updates
   const result = await applyUpdates(updates, manager);

   lines.push('', ...result);

   return { content: [ { type: 'text' as const, text: lines.join('\n') } ] };
}

function formatUpdateList(updates: UpdateCandidate[]): string[] {
   const lines: string[] = [ 'Updates available:', '' ];

   for (const update of updates) {
      let line = `• ${update.name}: ${update.currentVersion} → ${update.newVersion}`;

      if (update.newContentVersion && update.currentContentVersion !== update.newContentVersion) {
         line += ` (content: ${update.currentContentVersion || 'unknown'} → ${update.newContentVersion})`;
      }
      lines.push(line);
   }

   return lines;
}

async function applyUpdates(updates: UpdateCandidate[], manager: LibraryManager): Promise<string[]> {
   const lines: string[] = [ 'Updating...' ];

   let updated = 0,
       failed = 0;

   const failedNames: string[] = [];

   for (const update of updates) {
      try {
         await performUpdate(update, manager);
         updated += 1;
      } catch(error) {
         failed += 1;
         const msg = error instanceof Error ? error.message : String(error);

         failedNames.push(`${update.name}: ${msg}`);
      }
   }

   lines.push('');

   if (updated > 0) {
      lines.push(`✓ Updated ${updated} ${updated === 1 ? 'library' : 'libraries'}`);
   }

   if (failed > 0) {
      lines.push(`✗ Failed to update ${failed} ${failed === 1 ? 'library' : 'libraries'}:`);

      for (const failedName of failedNames) {
         lines.push(`  - ${failedName}`);
      }
   }

   return lines;
}

async function findUpdates(
   toCheck: InstalledLibrary[],
   client: CollectionClient,
   force: boolean
): Promise<UpdateCandidate[]> {
   const updates: UpdateCandidate[] = [];

   for (const lib of toCheck) {
      const entry = await client.getEntry(lib.name);

      if (!entry) {
         continue;
      }

      const candidate = checkForUpdate(lib, entry, force);

      if (candidate) {
         updates.push(candidate);
      }
   }

   return updates;
}

function checkForUpdate(
   lib: InstalledLibrary,
   entry: CollectionEntry,
   force: boolean
): UpdateCandidate | null {
   const hasNewerVersion = entry.version !== lib.version,
         hasNewerContent = entry.contentVersion && entry.contentVersion !== lib.contentVersion;

   if (hasNewerVersion || hasNewerContent || force) {
      return {
         name: lib.name,
         currentVersion: lib.version,
         currentContentVersion: lib.contentVersion,
         newVersion: entry.version,
         newContentVersion: entry.contentVersion,
         source: entry.downloadURL,
      };
   }

   return null;
}

async function performUpdate(
   update: UpdateCandidate,
   manager: LibraryManager
): Promise<void> {
   const response = await fetch(update.source);

   if (!response.ok) {
      throw new Error(`Failed to download: ${response.status}`);
   }

   const tempPath = path.join(os.tmpdir(), `libragen-update-${Date.now()}.libragen`);

   const buffer = await response.arrayBuffer();

   await fs.writeFile(tempPath, Buffer.from(buffer));

   // Verify the downloaded library
   const newLib = await Library.open(tempPath);

   newLib.close();

   // Install with force to overwrite
   await manager.install(tempPath, { force: true });

   await fs.unlink(tempPath);
}

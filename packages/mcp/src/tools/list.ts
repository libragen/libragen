/**
 * libragen_list MCP tool
 *
 * Lists available libraries in the libraries directory.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as path from 'path';
import * as fs from 'fs';
import Database from 'better-sqlite3';
import type { ServerConfig } from '../server.ts';
import { getLibraryPaths } from '../server.ts';

interface SourceInfo {
   type: 'local' | 'git';
   url?: string;
   path?: string;
   ref?: string;
   licenses?: string[];
}

interface LibraryInfo {
   name: string;
   version?: string;
   schemaVersion?: number;
   contentVersion?: string;
   description?: string;
   agentDescription?: string;
   exampleQueries?: string[];
   keywords?: string[];
   programmingLanguages?: string[];
   textLanguages?: string[];
   frameworks?: string[];
   chunkCount?: number;
   fileSize?: number;
   path: string;
   source?: SourceInfo;
}

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

      const libraries = discoverLibrariesFromPaths(libraryPaths);

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
            const metadata = getLibraryInfo(libPath);

            libraries.push({
               ...metadata,
               path: libPath,
            });
         } catch{
            // Skip invalid libraries
            libraries.push({
               name: entry.replace(/\.libragen$/, ''),
               path: libPath,
            });
         }
      }
   }

   return libraries;
}

function getLibraryInfo(dbPath: string): Omit<LibraryInfo, 'path'> {
   const db = new Database(dbPath, { readonly: true });

   try {
      // Check if library_meta table exists
      const tableExists = db
         .prepare('SELECT name FROM sqlite_master WHERE type=\'table\' AND name=\'library_meta\'')
         .get();

      if (!tableExists) {
         // Fall back to basic info
         const chunkCount = db.prepare('SELECT COUNT(*) as count FROM chunks').get() as { count: number };

         return {
            name: path.basename(dbPath, '.libragen'),
            chunkCount: chunkCount.count,
            // eslint-disable-next-line no-sync
            fileSize: fs.statSync(dbPath).size,
         };
      }

      // Get manifest and schema version from library_meta table
      const manifestRow = db
         .prepare('SELECT value FROM library_meta WHERE key = \'manifest\'')
         .get() as { value: string } | undefined;

      const schemaVersionRow = db
         .prepare('SELECT value FROM library_meta WHERE key = \'schema_version\'')
         .get() as { value: string } | undefined;

      const schemaVersion = schemaVersionRow ? parseInt(schemaVersionRow.value, 10) : undefined;

      const chunkCount = db.prepare('SELECT COUNT(*) as count FROM chunks').get() as { count: number };

      if (!manifestRow) {
         // Fall back to reading individual keys (legacy format)
         const rows = db.prepare('SELECT key, value FROM library_meta').all() as Array<{ key: string; value: string }>;

         const meta: Record<string, string> = {};

         for (const row of rows) {
            meta[row.key] = row.value;
         }

         return {
            name: meta.name ?? path.basename(dbPath, '.libragen'),
            version: meta.version,
            schemaVersion: meta.schema_version ? parseInt(meta.schema_version, 10) : schemaVersion,
            contentVersion: meta.contentVersion,
            description: meta.description,
            chunkCount: chunkCount.count,
            // eslint-disable-next-line no-sync
            fileSize: fs.statSync(dbPath).size,
         };
      }

      // Parse the manifest JSON
      const manifest = JSON.parse(manifestRow.value) as {
         name?: string;
         version?: string;
         contentVersion?: string;
         description?: string;
         agentDescription?: string;
         exampleQueries?: string[];
         keywords?: string[];
         programmingLanguages?: string[];
         textLanguages?: string[];
         frameworks?: string[];
         source?: {
            type: 'local' | 'git';
            url?: string;
            path?: string;
            ref?: string;
            licenses?: string[];
         };
      };

      return {
         name: manifest.name ?? path.basename(dbPath, '.libragen'),
         version: manifest.version,
         schemaVersion,
         contentVersion: manifest.contentVersion,
         description: manifest.description,
         agentDescription: manifest.agentDescription,
         exampleQueries: manifest.exampleQueries,
         keywords: manifest.keywords,
         programmingLanguages: manifest.programmingLanguages,
         textLanguages: manifest.textLanguages,
         frameworks: manifest.frameworks,
         chunkCount: chunkCount.count,
         // eslint-disable-next-line no-sync
         fileSize: fs.statSync(dbPath).size,
         source: manifest.source ? {
            type: manifest.source.type,
            url: manifest.source.url,
            path: manifest.source.path,
            ref: manifest.source.ref,
            licenses: manifest.source.licenses,
         } : undefined,
      };
   } finally {
      db.close();
   }
}

// eslint-disable-next-line complexity
function formatLibraries(libraries: LibraryInfo[]): string {
   const lines: string[] = [ `Found ${libraries.length} library(ies):\n` ];

   for (const lib of libraries) {
      lines.push(`📚 ${lib.name}`);

      if (lib.description) {
         lines.push(`   ${lib.description}`);
      }

      // Agent guidance (most important for library selection)
      if (lib.agentDescription) {
         lines.push(`   🤖 When to use: ${lib.agentDescription}`);
      }

      if (lib.exampleQueries && lib.exampleQueries.length > 0) {
         lines.push(`   💡 Example queries: "${lib.exampleQueries.join('", "')}"`);
      }

      // Categorization
      if (lib.programmingLanguages && lib.programmingLanguages.length > 0) {
         lines.push(`   Programming Languages: ${lib.programmingLanguages.join(', ')}`);
      }

      if (lib.textLanguages && lib.textLanguages.length > 0) {
         lines.push(`   Text Languages: ${lib.textLanguages.join(', ')}`);
      }

      if (lib.frameworks && lib.frameworks.length > 0) {
         lines.push(`   Frameworks: ${lib.frameworks.join(', ')}`);
      }

      if (lib.keywords && lib.keywords.length > 0) {
         lines.push(`   Keywords: ${lib.keywords.join(', ')}`);
      }

      // Source and license info
      if (lib.source) {
         if (lib.source.type === 'git' && lib.source.url) {
            lines.push(`   Source: ${lib.source.url}`);
         } else if (lib.source.type === 'local' && lib.source.path) {
            lines.push(`   Source: ${lib.source.path}`);
         }
         if (lib.source.licenses && lib.source.licenses.length > 0) {
            lines.push(`   License: ${lib.source.licenses.join(', ')}`);
         }
      }

      // Technical details
      if (lib.schemaVersion !== undefined) {
         lines.push(`   Schema Version: ${lib.schemaVersion}`);
      }

      if (lib.contentVersion) {
         lines.push(`   Content Version: ${lib.contentVersion}`);
      }

      if (lib.chunkCount !== undefined) {
         lines.push(`   Chunks: ${lib.chunkCount}`);
      }

      if (lib.fileSize !== undefined) {
         lines.push(`   Size: ${formatFileSize(lib.fileSize)}`);
      }

      lines.push('');
   }

   return lines.join('\n');
}

function formatFileSize(bytes: number): string {
   const units = [ 'B', 'KB', 'MB', 'GB' ];

   let size = bytes,
       unitIndex = 0;

   while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex += 1;
   }

   return `${size.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * Collection Resolver - Resolves nested collections and deduplicates libraries
 *
 * Handles:
 * - Fetching collection definitions from URLs or local paths
 * - Recursively resolving nested collections
 * - Deduplicating libraries across collections
 * - Separating required vs optional libraries
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { CollectionDefinition, ResolvedLibrary } from './manifest.ts';

export interface ResolveOptions {

   /** Include optional libraries (default: false) */
   includeOptional?: boolean;

   /** Maximum nesting depth to prevent infinite loops (default: 10) */
   maxDepth?: number;
}

export interface ResolveResult {

   /** All resolved libraries (deduplicated) */
   libraries: ResolvedLibrary[];

   /** Required libraries only */
   required: ResolvedLibrary[];

   /** Optional libraries only */
   optional: ResolvedLibrary[];

   /** All collection names encountered during resolution */
   collections: string[];
}

/**
 * Resolve a collection into a flat list of libraries.
 *
 * @param source - Collection URL or local path
 * @param options - Resolution options
 */
export async function resolveCollection(
   source: string,
   options: ResolveOptions = {}
): Promise<ResolveResult> {
   const maxDepth = options.maxDepth ?? 10,
         visited = new Set<string>(),
         libraryMap = new Map<string, ResolvedLibrary>(),
         collectionNames: string[] = [],
         context: ResolveContext = { visited, libraryMap, collectionNames, maxDepth };

   await _resolveRecursive(source, context, 0);

   const libraries = Array.from(libraryMap.values());

   const required = libraries.filter((lib) => {
      return lib.required;
   });

   const optional = libraries.filter((lib) => {
      return !lib.required;
   });

   return {
      libraries: options.includeOptional ? libraries : required,
      required,
      optional,
      collections: collectionNames,
   };
}

/**
 * Fetch a collection definition from a URL or local path.
 */
export async function fetchCollectionDefinition(source: string): Promise<CollectionDefinition> {
   if (source.startsWith('http://') || source.startsWith('https://')) {
      const response = await fetch(source);

      if (!response.ok) {
         throw new Error(`Failed to fetch collection: ${response.status} ${response.statusText}`);
      }

      return await response.json() as CollectionDefinition;
   }

   // Local file
   const resolvedPath = path.resolve(source);

   const content = await fs.readFile(resolvedPath, 'utf-8');

   return JSON.parse(content) as CollectionDefinition;
}

/**
 * Check if a source is a collection (JSON file or URL ending in .json).
 */
export function isCollectionSource(source: string): boolean {
   if (source.endsWith('.json')) {
      return true;
   }

   // Could also check content-type for URLs, but .json suffix is simpler
   return false;
}

/**
 * Check if a source is a library (.libragen file).
 */
export function isLibrarySource(source: string): boolean {
   return source.endsWith('.libragen');
}

/**
 * Extract library name from source.
 */
export function getLibraryNameFromSource(source: string): string {
   // Remove query params and hash
   const cleanSource = source.split('?')[0].split('#')[0];

   // Get filename
   const filename = path.basename(cleanSource);

   // Remove extension
   return filename.replace(/\.(libragen|json)$/, '');
}

interface ResolveContext {
   visited: Set<string>;
   libraryMap: Map<string, ResolvedLibrary>;
   collectionNames: string[];
   maxDepth: number;
}

async function _resolveRecursive(
   source: string,
   context: ResolveContext,
   currentDepth: number
): Promise<void> {
   const { visited, libraryMap, collectionNames, maxDepth } = context;

   // Prevent infinite loops
   if (currentDepth >= maxDepth) {
      throw new Error(`Maximum collection nesting depth (${maxDepth}) exceeded`);
   }

   // Normalize source for deduplication
   const normalizedSource = _normalizeSource(source);

   if (visited.has(normalizedSource)) {
      return; // Already processed
   }

   visited.add(normalizedSource);

   // Fetch collection definition
   const definition = await fetchCollectionDefinition(source);

   collectionNames.push(definition.name);

   // Process each item
   for (const item of definition.items) {
      const isRequired = item.required !== false; // Default to required

      if (item.library) {
         // It's a library
         await _addLibrary(item.library, isRequired, definition.name, libraryMap);
      } else if (item.collection) {
         // It's a nested collection - recurse
         await _resolveRecursive(item.collection, context, currentDepth + 1);
      }
   }
}

async function _addLibrary(
   source: string,
   required: boolean,
   collectionName: string,
   libraryMap: Map<string, ResolvedLibrary>
): Promise<void> {
   const name = getLibraryNameFromSource(source),
         existing = libraryMap.get(name);

   if (existing) {
      // Library already exists - merge
      if (!existing.fromCollections.includes(collectionName)) {
         existing.fromCollections.push(collectionName);
      }
      // If any collection marks it as required, it's required
      if (required) {
         existing.required = true;
      }
   } else {
      // New library
      libraryMap.set(name, {
         name,
         source,
         required,
         fromCollections: [ collectionName ],
      });
   }
}

function _normalizeSource(source: string): string {
   // Remove trailing slashes and normalize path separators
   return source.replace(/\/+$/, '').replace(/\\/g, '/');
}

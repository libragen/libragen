/**
 * Collection Client - Fetch library metadata and files from collections
 *
 * Supports multiple collections with priority ordering and caching.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { createHash } from 'crypto';
import { getDefaultCollectionConfigDir } from './config.ts';

export interface Collection {

   /** Collection name (unique identifier) */
   name: string;

   /** Collection URL (must serve a collection index JSON) */
   url: string;

   /** Priority (lower = higher priority) */
   priority: number;
}

export interface CollectionLibraryVersion {

   /** Library version (e.g., "1.0.0") */
   version: string;

   /** Content version (e.g., "1.74.0" for Rust docs) */
   contentVersion?: string;

   /** Content version type */
   contentVersionType?: 'semver' | 'commit' | 'date' | 'revision' | 'custom';

   /** Download URL for the .libragen file */
   downloadURL: string;

   /** SHA-256 content hash for integrity verification */
   contentHash: string;

   /** File size in bytes */
   fileSize?: number;
}

export interface CollectionLibrary {

   /** Library name */
   name: string;

   /** Short description */
   description?: string;

   /** Available versions */
   versions: CollectionLibraryVersion[];
}

export interface CollectionIndex {

   /** Collection name */
   name: string;

   /** Collection index format version */
   version: string;

   /** Last updated timestamp */
   updatedAt: string;

   /** Available libraries */
   libraries: CollectionLibrary[];
}

export interface CollectionEntry {

   /** Library name */
   name: string;

   /** Library version */
   version: string;

   /** Content version */
   contentVersion?: string;

   /** Content version type */
   contentVersionType?: 'semver' | 'commit' | 'date' | 'revision' | 'custom';

   /** Description */
   description?: string;

   /** Download URL */
   downloadURL: string;

   /** Content hash */
   contentHash: string;

   /** File size */
   fileSize?: number;

   /** Source collection name */
   collection: string;
}

export interface CollectionClientConfig {

   /** Directory to store collection cache and config */
   configDir?: string;

   /** Cache TTL in milliseconds (default: 1 hour) */
   cacheTTL?: number;
}

// Re-export for backwards compatibility
export { getDefaultCollectionConfigDir } from './config.ts';

const DEFAULT_CACHE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Collection client for fetching library metadata and files.
 */
export class CollectionClient {

   private readonly _configDir: string;
   private readonly _cacheTTL: number;
   private _collections: Collection[] = [];

   public constructor(config: CollectionClientConfig = {}) {
      this._configDir = config.configDir ?? getDefaultCollectionConfigDir();
      this._cacheTTL = config.cacheTTL ?? DEFAULT_CACHE_TTL;
   }

   /**
    * Get configured collections.
    */
   public getCollections(): Collection[] {
      return [ ...this._collections ].sort((a, b) => {
         return a.priority - b.priority;
      });
   }

   /**
    * Add a collection.
    */
   public async addCollection(collection: Collection): Promise<void> {
      // Check if collection with same name exists
      const existing = this._collections.findIndex((c) => {
         return c.name === collection.name;
      });

      if (existing >= 0) {
         this._collections[existing] = collection;
      } else {
         this._collections.push(collection);
      }

      await this._saveConfig();
   }

   /**
    * Remove a collection by name.
    */
   public async removeCollection(name: string): Promise<boolean> {
      const index = this._collections.findIndex((c) => {
         return c.name === name;
      });

      if (index < 0) {
         return false;
      }

      this._collections.splice(index, 1);
      await this._saveConfig();

      return true;
   }

   /**
    * Load collections from config file.
    */
   public async loadConfig(): Promise<void> {
      const configPath = path.join(this._configDir, 'collections.json');

      try {
         const content = await fs.readFile(configPath, 'utf-8');

         const config = JSON.parse(content) as { collections: Collection[] };

         this._collections = config.collections ?? [];
      } catch(_e) {
         // Config doesn't exist or is invalid
         this._collections = [];
      }
   }

   /**
    * Search for libraries across all collections.
    *
    * @param query - Search query (matches name and description)
    * @param options - Search options
    */
   public async search(
      query: string,
      options: { contentVersion?: string } = {}
   ): Promise<CollectionEntry[]> {
      const results: CollectionEntry[] = [],
            queryLower = query.toLowerCase();

      for (const collection of this.getCollections()) {
         const entries = await this._searchCollection(collection, queryLower, options);

         results.push(...entries);
      }

      return results;
   }

   /**
    * Get a specific library entry from collections.
    *
    * @param name - Library name
    * @param version - Optional specific version
    */
   public async getEntry(name: string, version?: string): Promise<CollectionEntry | null> {
      for (const collection of this.getCollections()) {
         try {
            const index = await this._fetchIndex(collection);

            const lib = index.libraries.find((l) => {
               return l.name === name;
            });

            if (lib) {
               let libVersion: CollectionLibraryVersion | undefined;

               if (version) {
                  libVersion = lib.versions.find((v) => {
                     return v.version === version;
                  });
               } else {
                  libVersion = lib.versions[0]; // Latest
               }

               if (libVersion) {
                  return {
                     name: lib.name,
                     version: libVersion.version,
                     contentVersion: libVersion.contentVersion,
                     contentVersionType: libVersion.contentVersionType,
                     description: lib.description,
                     downloadURL: libVersion.downloadURL,
                     contentHash: libVersion.contentHash,
                     fileSize: libVersion.fileSize,
                     collection: collection.name,
                  };
               }
            }
         } catch(_e) {
            continue;
         }
      }

      return null;
   }

   /**
    * Download a library from a collection entry.
    *
    * @param entry - Collection entry to download
    * @param destPath - Destination file path
    * @param options - Download options
    */
   public async download(
      entry: CollectionEntry,
      destPath: string,
      options: { verifyHash?: boolean; onProgress?: (progress: DownloadProgress) => void } = {}
   ): Promise<void> {
      const verifyHash = options.verifyHash ?? true;

      // Fetch the file
      const response = await fetch(entry.downloadURL);

      if (!response.ok) {
         throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
      }

      const contentLength = response.headers.get('content-length');

      const totalSize = contentLength ? parseInt(contentLength, 10) : entry.fileSize ?? 0;

      // Read the response as array buffer
      const buffer = await response.arrayBuffer();

      const data = Buffer.from(buffer);

      // Report progress
      if (options.onProgress) {
         options.onProgress({
            downloaded: data.length,
            total: totalSize,
            percent: totalSize > 0 ? (data.length / totalSize) * 100 : 100,
         });
      }

      // Verify hash if requested
      if (verifyHash && entry.contentHash) {
         const hash = createHash('sha256').update(data).digest('hex');

         const expectedHash = entry.contentHash.replace(/^sha256:/, '');

         if (hash !== expectedHash) {
            throw new Error(`Hash mismatch: expected ${expectedHash}, got ${hash}`);
         }
      }

      // Ensure destination directory exists
      await fs.mkdir(path.dirname(destPath), { recursive: true });

      // Write the file
      await fs.writeFile(destPath, data);
   }

   /**
    * Clear the collection index cache.
    */
   public async clearCache(): Promise<void> {
      const cacheDir = path.join(this._configDir, 'cache');

      try {
         await fs.rm(cacheDir, { recursive: true, force: true });
      } catch(_e) {
         // Cache doesn't exist
      }
   }

   private async _searchCollection(
      collection: Collection,
      queryLower: string,
      options: { contentVersion?: string }
   ): Promise<CollectionEntry[]> {
      const results: CollectionEntry[] = [];

      try {
         const index = await this._fetchIndex(collection);

         for (const lib of index.libraries) {
            const entry = this._matchLibrary(lib, queryLower, options, collection.name);

            if (entry) {
               results.push(entry);
            }
         }
      } catch(_e) {
         // Skip collections that fail to fetch
      }

      return results;
   }

   private _matchLibrary(
      lib: CollectionLibrary,
      queryLower: string,
      options: { contentVersion?: string },
      collectionName: string
   ): CollectionEntry | null {
      const nameMatch = lib.name.toLowerCase().includes(queryLower),
            descMatch = lib.description?.toLowerCase().includes(queryLower);

      if (!nameMatch && !descMatch) {
         return null;
      }

      // Find matching version
      let version = lib.versions[0]; // Default to latest

      if (options.contentVersion) {
         const matchingVersion = lib.versions.find((v) => {
            return v.contentVersion === options.contentVersion;
         });

         if (!matchingVersion) {
            return null; // Skip if content version doesn't match
         }
         version = matchingVersion;
      }

      if (!version) {
         return null;
      }

      return {
         name: lib.name,
         version: version.version,
         contentVersion: version.contentVersion,
         contentVersionType: version.contentVersionType,
         description: lib.description,
         downloadURL: version.downloadURL,
         contentHash: version.contentHash,
         fileSize: version.fileSize,
         collection: collectionName,
      };
   }

   private async _saveConfig(): Promise<void> {
      const configPath = path.join(this._configDir, 'collections.json');

      await fs.mkdir(this._configDir, { recursive: true });
      await fs.writeFile(configPath, JSON.stringify({ collections: this._collections }, null, 2));
   }

   private async _fetchIndex(collection: Collection): Promise<CollectionIndex> {
      // Check cache first
      const cached = await this._getCachedIndex(collection);

      if (cached) {
         return cached;
      }

      // Fetch from network
      const response = await fetch(collection.url);

      if (!response.ok) {
         throw new Error(`Failed to fetch collection index: ${response.status}`);
      }

      const index = await response.json() as CollectionIndex;

      // Cache the result
      await this._cacheIndex(collection, index);

      return index;
   }

   private async _getCachedIndex(collection: Collection): Promise<CollectionIndex | null> {
      const cachePath = this._getCachePath(collection);

      try {
         const stats = await fs.stat(cachePath);

         // Check if cache is still valid
         if (Date.now() - stats.mtimeMs > this._cacheTTL) {
            return null;
         }

         const content = await fs.readFile(cachePath, 'utf-8');

         return JSON.parse(content) as CollectionIndex;
      } catch(_e) {
         return null;
      }
   }

   private async _cacheIndex(collection: Collection, index: CollectionIndex): Promise<void> {
      const cachePath = this._getCachePath(collection);

      await fs.mkdir(path.dirname(cachePath), { recursive: true });
      await fs.writeFile(cachePath, JSON.stringify(index));
   }

   private _getCachePath(collection: Collection): string {
      const hash = createHash('md5').update(collection.url).digest('hex');

      return path.join(this._configDir, 'cache', `${collection.name}-${hash}.json`);
   }

}

export interface DownloadProgress {
   downloaded: number;
   total: number;
   percent: number;
}

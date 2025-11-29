/**
 * Manifest - Tracks installed libraries and collections with reference counting
 *
 * The manifest stores:
 * - Which collections are installed
 * - Which libraries are installed and by which collection(s)
 * - Reference counts for proper cleanup on uninstall
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { getDefaultManifestDir } from './config.ts';

/**
 * A collection item can be either a library or a nested collection.
 */
export interface CollectionItem {

   /** Library source (URL, path, or git repo) - mutually exclusive with collection */
   library?: string;

   /** Nested collection source (URL or path) - mutually exclusive with library */
   collection?: string;

   /** Whether this item is required (default: true) */
   required?: boolean;
}

/**
 * Collection definition format.
 */
export interface CollectionDefinition {

   /** Collection name */
   name: string;

   /** Collection description */
   description?: string;

   /** Collection version */
   version?: string;

   /** Items in this collection (libraries and/or nested collections) */
   items: CollectionItem[];
}

/**
 * Resolved library ready for installation.
 */
export interface ResolvedLibrary {

   /** Library name (derived from source or metadata) */
   name: string;

   /** Source URL or path */
   source: string;

   /** Whether this library is required */
   required: boolean;

   /** Which collection(s) include this library */
   fromCollections: string[];
}

/**
 * Installed collection record.
 */
export interface InstalledCollection {

   /** Collection name */
   name: string;

   /** Collection source (URL or path) */
   source: string;

   /** Collection version */
   version?: string;

   /** Libraries installed by this collection */
   libraries: string[];

   /** Nested collections installed by this collection */
   collections: string[];

   /** Installation timestamp */
   installedAt: string;
}

/**
 * Installed library record with reference counting.
 */
export interface InstalledLibraryRecord {

   /** Library name */
   name: string;

   /** Source URL or path */
   source: string;

   /** Collections that installed this library */
   installedBy: string[];

   /** Whether manually installed (not via collection) */
   manual: boolean;

   /** Installation timestamp */
   installedAt: string;
}

/**
 * Manifest file format.
 */
export interface ManifestData {

   /** Manifest format version */
   version: string;

   /** Installed collections */
   collections: Record<string, InstalledCollection>;

   /** Installed libraries with reference counts */
   libraries: Record<string, InstalledLibraryRecord>;
}

// Re-export for backwards compatibility
export { getDefaultManifestDir } from './config.ts';

const MANIFEST_VERSION = '1.0.0';

/**
 * Manifest manager for tracking installed libraries and collections.
 */
export class Manifest {

   private readonly _manifestPath: string;
   private _data: ManifestData;

   public constructor(manifestDir?: string) {
      const dir = manifestDir ?? getDefaultManifestDir();

      this._manifestPath = path.join(dir, 'manifest.json');
      this._data = this._createEmpty();
   }

   /**
    * Load manifest from disk.
    */
   public async load(): Promise<void> {
      try {
         const content = await fs.readFile(this._manifestPath, 'utf-8');

         this._data = JSON.parse(content) as ManifestData;
      } catch(_e) {
         this._data = this._createEmpty();
      }
   }

   /**
    * Save manifest to disk.
    */
   public async save(): Promise<void> {
      await fs.mkdir(path.dirname(this._manifestPath), { recursive: true });
      await fs.writeFile(this._manifestPath, JSON.stringify(this._data, null, 2));
   }

   /**
    * Get all installed collections.
    */
   public getCollections(): InstalledCollection[] {
      return Object.values(this._data.collections);
   }

   /**
    * Get a specific installed collection.
    */
   public getCollection(name: string): InstalledCollection | undefined {
      return this._data.collections[name];
   }

   /**
    * Get all installed library records.
    */
   public getLibraryRecords(): InstalledLibraryRecord[] {
      return Object.values(this._data.libraries);
   }

   /**
    * Get a specific library record.
    */
   public getLibraryRecord(name: string): InstalledLibraryRecord | undefined {
      return this._data.libraries[name];
   }

   /**
    * Record a collection installation.
    */
   public addCollection(collection: InstalledCollection): void {
      this._data.collections[collection.name] = collection;
   }

   /**
    * Record a library installation.
    *
    * @param name - Library name
    * @param source - Source URL or path
    * @param collectionName - Collection that installed it (undefined for manual)
    */
   public addLibrary(name: string, source: string, collectionName?: string): void {
      const existing = this._data.libraries[name];

      if (existing) {
         // Update existing record
         if (collectionName && !existing.installedBy.includes(collectionName)) {
            existing.installedBy.push(collectionName);
         }
         if (!collectionName) {
            existing.manual = true;
         }
      } else {
         // Create new record
         this._data.libraries[name] = {
            name,
            source,
            installedBy: collectionName ? [ collectionName ] : [],
            manual: !collectionName,
            installedAt: new Date().toISOString(),
         };
      }
   }

   /**
    * Remove a collection and return libraries that should be uninstalled.
    *
    * @param name - Collection name
    * @returns Library names that are no longer referenced
    */
   public removeCollection(name: string): string[] {
      const collection = this._data.collections[name];

      if (!collection) {
         return [];
      }

      // Remove collection
      delete this._data.collections[name];

      // Find libraries to uninstall (no longer referenced and not manual)
      const toUninstall: string[] = [];

      for (const libName of collection.libraries) {
         const lib = this._data.libraries[libName];

         if (!lib) {
            continue;
         }

         // Remove this collection from installedBy
         lib.installedBy = lib.installedBy.filter((c) => {
            return c !== name;
         });

         // If no longer referenced and not manual, mark for uninstall
         if (lib.installedBy.length === 0 && !lib.manual) {
            toUninstall.push(libName);
            delete this._data.libraries[libName];
         }
      }

      return toUninstall;
   }

   /**
    * Remove a library record.
    *
    * @param name - Library name
    * @param collectionName - Collection to remove reference from (undefined = manual)
    * @returns True if library should be uninstalled from disk
    */
   public removeLibrary(name: string, collectionName?: string): boolean {
      const lib = this._data.libraries[name];

      if (!lib) {
         return false;
      }

      if (collectionName) {
         // Remove collection reference
         lib.installedBy = lib.installedBy.filter((c) => {
            return c !== collectionName;
         });

         // Only uninstall if no references remain and not manual
         if (lib.installedBy.length === 0 && !lib.manual) {
            delete this._data.libraries[name];
            return true;
         }

         return false;
      }

      // Manual uninstall - remove manual flag
      lib.manual = false;

      // Only uninstall if no collection references
      if (lib.installedBy.length === 0) {
         delete this._data.libraries[name];
         return true;
      }

      return false;
   }

   /**
    * Check if a library is installed.
    */
   public hasLibrary(name: string): boolean {
      return name in this._data.libraries;
   }

   /**
    * Check if a collection is installed.
    */
   public hasCollection(name: string): boolean {
      return name in this._data.collections;
   }

   private _createEmpty(): ManifestData {
      return {
         version: MANIFEST_VERSION,
         collections: {},
         libraries: {},
      };
   }

}

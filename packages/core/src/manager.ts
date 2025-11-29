/**
 * Library Manager - Manage installed libraries
 *
 * Handles installation, uninstallation, listing, and discovery of
 * libragen libraries across multiple locations.
 */

/* eslint-disable @typescript-eslint/member-ordering */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { Library } from './library.ts';
import { Manifest } from './manifest.ts';
import {
   getDefaultLibraryDir,
   getDefaultManifestDir,
   detectProjectLibraryDir,
   hasProjectLibraryDir,
} from './config.ts';
import {
   resolveCollection,
   fetchCollectionDefinition,
   isCollectionSource,
} from './collection-resolver.ts';
import type { LibraryMetadata } from './types.ts';
import type { InstalledCollection, ResolvedLibrary } from './manifest.ts';

export interface LibraryLocation {

   /**
    * Library directories to search, in priority order.
    * First directory is the "primary" location for installs.
    * If empty, uses global directory.
    */
   paths: string[];

   /** Manifest directory (for tracking installed collections) */
   manifestDir?: string;
}

export interface LibraryManagerOptions {

   /**
    * Explicit library paths to use. When provided, ONLY these paths are used
    * (no global, no auto-detection). Supports multiple paths.
    */
   paths?: string[];

   /**
    * If true, auto-detect `.libragen/libraries` in cwd and include it.
    * Default: true (when no explicit paths provided)
    */
   autoDetect?: boolean;

   /**
    * If true, include the global library directory.
    * Default: true (when no explicit paths provided)
    */
   includeGlobal?: boolean;

   /** Manifest directory (for tracking installed collections) */
   manifestDir?: string;

   /** Current working directory for auto-detection */
   cwd?: string;
}

export interface InstalledLibrary {

   /** Library name */
   name: string;

   /** Library version */
   version: string;

   /** Content version (e.g., "1.74.0" for Rust docs) */
   contentVersion?: string;

   /** Short description */
   description?: string;

   /** Full path to the library file */
   path: string;

   /** Location type: 'global' or 'project' */
   location: 'global' | 'project';

   /** Full metadata */
   metadata: LibraryMetadata;
}

export interface InstallOptions {

   /** Overwrite existing library with same name */
   force?: boolean;

   /** Collection name (for tracking which collection installed this library) */
   collectionName?: string;
}

export interface CollectionInstallOptions {

   /** Overwrite existing libraries */
   force?: boolean;

   /** Include optional libraries (default: false, only required) */
   includeOptional?: boolean;

   /** Specific optional libraries to include (by name) */
   selectOptional?: string[];

   /** Progress callback */
   onProgress?: (progress: CollectionInstallProgress) => void;
}

export interface CollectionInstallProgress {
   phase: 'resolving' | 'downloading' | 'installing' | 'complete';
   current: number;
   total: number;
   libraryName?: string;
   message?: string;
}

export interface CollectionInstallResult {

   /** Collection name */
   collectionName: string;

   /** Libraries that were installed */
   installed: string[];

   /** Libraries that were skipped (already installed) */
   skipped: string[];

   /** Libraries that failed to install */
   failed: Array<{ name: string; error: string }>;
}

// Re-export for backwards compatibility
export { getDefaultLibraryDir } from './config.ts';

/**
 * Library manager for installing, uninstalling, and discovering libraries.
 */
export class LibraryManager {

   private readonly _locations: LibraryLocation;
   private readonly _manifest: Manifest;
   private _manifestLoaded = false;
   private _autoDetected = false;
   private readonly _options: LibraryManagerOptions;

   public constructor(options?: LibraryManagerOptions) {
      this._options = options ?? {};

      // If explicit paths provided, use only those
      if (options?.paths && options.paths.length > 0) {
         this._locations = {
            paths: options.paths,
            manifestDir: options.manifestDir,
         };
      } else {
         // Default behavior: global + auto-detect project
         const paths: string[] = [];

         // Auto-detect is on by default
         if (options?.autoDetect !== false) {
            const projectDir = detectProjectLibraryDir(options?.cwd);

            if (projectDir) {
               paths.push(projectDir);
            }
         }

         // Global is included by default
         if (options?.includeGlobal !== false) {
            paths.push(getDefaultLibraryDir());
         }

         this._locations = {
            paths,
            manifestDir: options?.manifestDir,
         };
      }

      this._manifest = new Manifest(options?.manifestDir ?? getDefaultManifestDir());
   }

   /**
    * Initialize the manager, performing async auto-detection if needed.
    * Call this before using the manager if you want project detection to work.
    */
   public async initialize(): Promise<void> {
      if (this._autoDetected) {
         return;
      }

      // If explicit paths were provided, skip auto-detection
      if (this._options.paths && this._options.paths.length > 0) {
         this._autoDetected = true;
         return;
      }

      // Filter paths to only include existing directories (for discovery)
      // But keep all paths for potential installation
      const hasProject = await hasProjectLibraryDir(this._options.cwd);

      if (!hasProject && this._options.autoDetect !== false) {
         // Remove the project path if it doesn't exist (for listing)
         const projectDir = detectProjectLibraryDir(this._options.cwd);

         if (projectDir) {
            this._locations.paths = this._locations.paths.filter((p) => {
               return p !== projectDir;
            });
         }
      }

      this._autoDetected = true;
   }

   /**
    * Get the configured library locations.
    */
   public getLocations(): LibraryLocation {
      return { ...this._locations };
   }

   /**
    * List all installed libraries across all configured locations.
    */
   public async listInstalled(): Promise<InstalledLibrary[]> {
      await this.initialize();

      const libraries: InstalledLibrary[] = [],
            seen = new Set<string>();

      // Scan directories in order (first = highest priority)
      for (const dirPath of this._locations.paths) {
         const location = this._getLocationLabel(dirPath);

         const libs = await this._scanDirectory(dirPath, location);

         // Only add if not already seen (priority ordering)
         for (const lib of libs) {
            if (!seen.has(lib.name)) {
               seen.add(lib.name);
               libraries.push(lib);
            }
         }
      }

      // Sort by name
      return libraries.sort((a, b) => {
         return a.name.localeCompare(b.name);
      });
   }

   /**
    * Get a human-readable label for a directory path.
    */
   private _getLocationLabel(dirPath: string): 'global' | 'project' {
      const globalDir = getDefaultLibraryDir();

      return dirPath === globalDir ? 'global' : 'project';
   }

   /**
    * Find a library by name.
    * Searches directories in priority order (first match wins).
    *
    * @param name - Library name to find
    * @returns Library info or null if not found
    */
   public async find(name: string): Promise<InstalledLibrary | null> {
      await this.initialize();

      for (const dirPath of this._locations.paths) {
         const location = this._getLocationLabel(dirPath);

         const lib = await this._findInDirectory(name, dirPath, location);

         if (lib) {
            return lib;
         }
      }

      return null;
   }

   /**
    * Get the path where a library would be installed.
    * Uses the first (primary) directory in the paths list.
    *
    * @param name - Library name
    */
   public getInstallPath(name: string): string {
      const dir = this._locations.paths[0] ?? getDefaultLibraryDir();

      return path.join(dir, `${name}.libragen`);
   }

   /**
    * Get the primary install directory.
    */
   public getPrimaryDirectory(): string {
      return this._locations.paths[0] ?? getDefaultLibraryDir();
   }

   /**
    * Install a library from a file path.
    * Installs to the first (primary) directory in the paths list.
    *
    * @param sourcePath - Path to the .libragen file to install
    * @param options - Install options
    * @returns Installed library info
    */
   public async install(sourcePath: string, options: InstallOptions = {}): Promise<InstalledLibrary> {
      await this._ensureManifest();

      // Open the source library to get metadata
      const sourceLib = await Library.open(sourcePath);

      const metadata = sourceLib.getMetadata();

      sourceLib.close();

      // Determine destination (first path is primary)
      const destDir = this._locations.paths[0] ?? getDefaultLibraryDir();

      const destFilename = metadata.version
         ? `${metadata.name}-${metadata.version}.libragen`
         : `${metadata.name}.libragen`;

      const destPath = path.join(destDir, destFilename);

      // Check if already exists
      const exists = await this._fileExists(destPath);

      if (exists && !options.force) {
         throw new Error(`Library '${metadata.name}' is already installed. Use --force to overwrite.`);
      }

      // Ensure destination directory exists
      await fs.mkdir(destDir, { recursive: true });

      // Copy the file
      await fs.copyFile(sourcePath, destPath);

      // Track in manifest
      this._manifest.addLibrary(metadata.name, sourcePath, options.collectionName);
      await this._manifest.save();

      const location = this._getLocationLabel(destDir);

      return {
         name: metadata.name,
         version: metadata.version,
         contentVersion: metadata.contentVersion,
         description: metadata.description,
         path: destPath,
         location,
         metadata,
      };
   }

   /**
    * Uninstall a library by name.
    * Searches all configured directories.
    *
    * @param name - Library name to uninstall
    * @returns True if library was uninstalled, false if not found
    */
   public async uninstall(name: string): Promise<boolean> {
      await this._ensureManifest();
      await this.initialize();

      // Check manifest - only uninstall if not referenced by collections
      const shouldUninstall = this._manifest.removeLibrary(name);

      if (!shouldUninstall && this._manifest.hasLibrary(name)) {
         // Library is still referenced by a collection, don't delete file
         await this._manifest.save();
         return false;
      }

      await this._manifest.save();

      // Search all directories
      for (const dirPath of this._locations.paths) {
         const location = this._getLocationLabel(dirPath);

         const lib = await this._findInDirectory(name, dirPath, location);

         if (lib) {
            await fs.unlink(lib.path);
            return true;
         }
      }

      return false;
   }

   /**
    * Open a library by name.
    *
    * @param name - Library name to open
    * @returns Library instance
    */
   public async open(name: string): Promise<Library> {
      const installed = await this.find(name);

      if (!installed) {
         throw new Error(`Library '${name}' not found`);
      }

      return Library.open(installed.path);
   }

   /**
    * Ensure all configured library directories exist.
    */
   public async ensureDirectories(): Promise<void> {
      for (const dirPath of this._locations.paths) {
         await fs.mkdir(dirPath, { recursive: true });
      }
   }

   // ========== Collection Methods ==========

   /**
    * Install a collection (group of libraries).
    *
    * @param source - Collection URL or local path
    * @param options - Installation options
    */
   public async installCollection(
      source: string,
      options: CollectionInstallOptions = {}
   ): Promise<CollectionInstallResult> {
      await this._ensureManifest();

      // eslint-disable-next-line no-empty-function
      const onProgress = options.onProgress ?? ((): void => {});

      // Phase 1: Resolve collection
      onProgress({ phase: 'resolving', current: 0, total: 1, message: 'Resolving collection...' });

      const definition = await fetchCollectionDefinition(source),
            resolved = await resolveCollection(source, { includeOptional: true });

      // Determine which libraries to install
      let librariesToInstall = resolved.required;

      if (options.includeOptional) {
         librariesToInstall = resolved.libraries;
      } else if (options.selectOptional && options.selectOptional.length > 0) {
         const selected = options.selectOptional;

         const selectedOptional = resolved.optional.filter((lib) => {
            return selected.includes(lib.name);
         });

         librariesToInstall = [ ...resolved.required, ...selectedOptional ];
      }

      const result: CollectionInstallResult = {
         collectionName: definition.name,
         installed: [],
         skipped: [],
         failed: [],
      };

      const total = librariesToInstall.length;

      // Phase 2 & 3: Download and install each library
      for (let i = 0; i < librariesToInstall.length; i++) {
         const lib = librariesToInstall[i];

         onProgress({
            phase: 'downloading',
            current: i + 1,
            total,
            libraryName: lib.name,
            message: `Downloading ${lib.name}...`,
         });

         try {
            // Check if already installed
            const existing = await this.find(lib.name);

            if (existing && !options.force) {
               result.skipped.push(lib.name);
               // Still track in manifest
               this._manifest.addLibrary(lib.name, lib.source, definition.name);
               continue;
            }

            // Download the library
            const tempPath = await this._downloadLibrary(lib.source);

            onProgress({
               phase: 'installing',
               current: i + 1,
               total,
               libraryName: lib.name,
               message: `Installing ${lib.name}...`,
            });

            // Install it
            await this.install(tempPath, {
               force: options.force,
               collectionName: definition.name,
            });

            // Clean up temp file
            // eslint-disable-next-line no-empty-function
            await fs.unlink(tempPath).catch(() => {});

            result.installed.push(lib.name);
         } catch(error) {
            result.failed.push({
               name: lib.name,
               error: error instanceof Error ? error.message : String(error),
            });
         }
      }

      // Record collection in manifest
      const installedCollection: InstalledCollection = {
         name: definition.name,
         source,
         version: definition.version,
         libraries: [ ...result.installed, ...result.skipped ],
         collections: resolved.collections.filter((c) => {
            return c !== definition.name;
         }),
         installedAt: new Date().toISOString(),
      };

      this._manifest.addCollection(installedCollection);
      await this._manifest.save();

      onProgress({
         phase: 'complete',
         current: total,
         total,
         message: `Installed ${result.installed.length} libraries`,
      });

      return result;
   }

   /**
    * Uninstall a collection and its libraries (if not used by other collections).
    *
    * @param name - Collection name
    * @returns Libraries that were uninstalled
    */
   public async uninstallCollection(name: string): Promise<string[]> {
      await this._ensureManifest();

      const collection = this._manifest.getCollection(name);

      if (!collection) {
         throw new Error(`Collection '${name}' is not installed`);
      }

      // Remove collection and get libraries to uninstall
      const toUninstall = this._manifest.removeCollection(name);

      // Uninstall the libraries
      for (const libName of toUninstall) {
         await this.uninstall(libName);
      }

      await this._manifest.save();

      return toUninstall;
   }

   /**
    * List installed collections.
    */
   public async listCollections(): Promise<InstalledCollection[]> {
      await this._ensureManifest();

      return this._manifest.getCollections();
   }

   /**
    * Get information about an installed collection.
    */
   public async getCollection(name: string): Promise<InstalledCollection | undefined> {
      await this._ensureManifest();

      return this._manifest.getCollection(name);
   }

   /**
    * Check if a source is a collection (vs a library).
    */
   public isCollection(source: string): boolean {
      return isCollectionSource(source);
   }

   /**
    * Preview what would be installed from a collection without installing.
    */
   public async previewCollection(
      source: string,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      _options: { includeOptional?: boolean } = {}
   ): Promise<{ required: ResolvedLibrary[]; optional: ResolvedLibrary[] }> {
      const resolved = await resolveCollection(source, { includeOptional: true });

      return {
         required: resolved.required,
         optional: resolved.optional,
      };
   }

   /**
    * Ensure manifest is loaded.
    */
   private async _ensureManifest(): Promise<void> {
      if (!this._manifestLoaded) {
         await this._manifest.load();
         this._manifestLoaded = true;
      }
   }

   /**
    * Download a library from a URL or copy from local path.
    */
   private async _downloadLibrary(source: string): Promise<string> {
      const tempDir = os.tmpdir(),
            tempPath = path.join(tempDir, `libragen-${Date.now()}.libragen`);

      if (source.startsWith('http://') || source.startsWith('https://')) {
         const response = await fetch(source);

         if (!response.ok) {
            throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
         }

         const buffer = await response.arrayBuffer();

         await fs.writeFile(tempPath, Buffer.from(buffer));
      } else {
         // Local file - copy it
         await fs.copyFile(path.resolve(source), tempPath);
      }

      return tempPath;
   }

   private async _scanDirectory(
      dirPath: string,
      location: 'global' | 'project'
   ): Promise<InstalledLibrary[]> {
      const libraries: InstalledLibrary[] = [];

      try {
         const entries = await fs.readdir(dirPath, { withFileTypes: true });

         for (const entry of entries) {
            if (entry.isFile() && entry.name.endsWith('.libragen')) {
               const libPath = path.join(dirPath, entry.name);

               try {
                  const lib = await Library.open(libPath);

                  const metadata = lib.getMetadata();

                  lib.close();

                  libraries.push({
                     name: metadata.name,
                     version: metadata.version,
                     contentVersion: metadata.contentVersion,
                     description: metadata.description,
                     path: libPath,
                     location,
                     metadata,
                  });
               } catch(_e) {
                  // Skip invalid library files
                  continue;
               }
            }
         }
      } catch(_e) {
         // Directory doesn't exist or can't be read
      }

      return libraries;
   }

   private async _findInDirectory(
      name: string,
      dirPath: string,
      location: 'global' | 'project'
   ): Promise<InstalledLibrary | null> {
      // Look for versioned filename pattern: name-version.libragen
      // Also support legacy non-versioned filename: name.libragen
      try {
         const entries = await fs.readdir(dirPath, { withFileTypes: true });

         // Find files matching name-*.libragen or name.libragen
         const matchingFiles = entries
            .filter((entry) => {
               if (!entry.isFile() || !entry.name.endsWith('.libragen')) {
                  return false;
               }

               // Match name-version.libragen or name.libragen
               const baseName = entry.name.slice(0, -'.libragen'.length);

               return baseName === name || baseName.startsWith(`${name}-`);
            })
            .map((entry) => {
               return entry.name;
            });

         if (matchingFiles.length === 0) {
            return null;
         }

         // Prefer versioned files, use first match
         // Sort to get consistent ordering (versioned files sort after non-versioned)
         matchingFiles.sort();
         const libPath = path.join(dirPath, matchingFiles[matchingFiles.length - 1]);

         const lib = await Library.open(libPath);

         const metadata = lib.getMetadata();

         lib.close();

         return {
            name: metadata.name,
            version: metadata.version,
            contentVersion: metadata.contentVersion,
            description: metadata.description,
            path: libPath,
            location,
            metadata,
         };
      } catch(_e) {
         return null;
      }
   }

   private async _fileExists(filePath: string): Promise<boolean> {
      try {
         await fs.access(filePath);
         return true;
      } catch(_e) {
         return false;
      }
   }

}

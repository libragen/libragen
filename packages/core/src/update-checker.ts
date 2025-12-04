/**
 * Update Checker - Utilities for checking library updates
 *
 * Provides functions for comparing installed libraries against collection entries
 * and finding available updates.
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { Library } from './library.ts';
import type { LibraryManager } from './manager.ts';
import type { InstalledLibrary } from './manager.ts';
import type { CollectionClient, CollectionEntry } from './collection.ts';

/**
 * Represents an available update for an installed library.
 */
export interface UpdateCandidate {

   /** Library name */
   name: string;

   /** Currently installed version */
   currentVersion: string;

   /** Currently installed content version (if any) */
   currentContentVersion?: string;

   /** New version available */
   newVersion: string;

   /** New content version available (if any) */
   newContentVersion?: string;

   /** Download URL for the new version */
   source: string;

   /** Location of the installed library */
   location?: 'global' | 'project';
}

/**
 * Options for checking updates.
 */
export interface CheckUpdateOptions {

   /** Force update even if versions match */
   force?: boolean;
}

/**
 * Check if a single library has an update available.
 *
 * @param installed - The installed library to check
 * @param entry - The collection entry to compare against
 * @param options - Check options
 * @returns UpdateCandidate if an update is available, null otherwise
 *
 * @example
 * ```typescript
 * const update = checkForUpdate(installedLib, collectionEntry);
 * if (update) {
 *   console.log(`Update available: ${update.currentVersion} → ${update.newVersion}`);
 * }
 * ```
 */
export function checkForUpdate(
   installed: InstalledLibrary,
   entry: CollectionEntry,
   options: CheckUpdateOptions = {}
): UpdateCandidate | null {
   const hasNewerVersion = entry.version !== installed.version,
         hasNewerContent = entry.contentVersion && entry.contentVersion !== installed.contentVersion;

   if (hasNewerVersion || hasNewerContent || options.force) {
      return {
         name: installed.name,
         currentVersion: installed.version,
         currentContentVersion: installed.contentVersion,
         newVersion: entry.version,
         newContentVersion: entry.contentVersion,
         source: entry.downloadURL,
         location: installed.location,
      };
   }

   return null;
}

/**
 * Find all available updates for a list of installed libraries.
 *
 * @param libraries - List of installed libraries to check
 * @param client - Collection client for looking up entries
 * @param options - Check options
 * @returns List of available updates
 *
 * @example
 * ```typescript
 * const manager = new LibraryManager();
 * const client = new CollectionClient();
 * await client.loadConfig();
 *
 * const installed = await manager.listInstalled();
 * const updates = await findUpdates(installed, client);
 *
 * for (const update of updates) {
 *   console.log(`${update.name}: ${update.currentVersion} → ${update.newVersion}`);
 * }
 * ```
 */
export async function findUpdates(
   libraries: InstalledLibrary[],
   client: CollectionClient,
   options: CheckUpdateOptions = {}
): Promise<UpdateCandidate[]> {
   const updates: UpdateCandidate[] = [];

   for (const lib of libraries) {
      // Try to find in collections
      const entry = await client.getEntry(lib.name);

      if (!entry) {
         continue;
      }

      const candidate = checkForUpdate(lib, entry, options);

      if (candidate) {
         updates.push(candidate);
      }
   }

   return updates;
}

/**
 * Perform an update by downloading and installing a new version.
 *
 * @param update - The update to perform
 * @param manager - Library manager for installation
 * @throws Error if download or installation fails
 *
 * @example
 * ```typescript
 * const updates = await findUpdates(installed, client);
 * for (const update of updates) {
 *   await performUpdate(update, manager);
 *   console.log(`Updated ${update.name}`);
 * }
 * ```
 */
export async function performUpdate(
   update: UpdateCandidate,
   manager: LibraryManager
): Promise<void> {
   const response = await fetch(update.source);

   if (!response.ok) {
      throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
   }

   const tempPath = path.join(os.tmpdir(), `libragen-update-${Date.now()}.libragen`);

   const buffer = await response.arrayBuffer();

   await fs.writeFile(tempPath, Buffer.from(buffer));

   try {
      // Verify the downloaded library
      const newLib = await Library.open(tempPath);

      newLib.close();

      // Install with force to overwrite
      await manager.install(tempPath, { force: true });
   } finally {
      // Clean up temp file
      await fs.unlink(tempPath).catch(() => {});
   }
}

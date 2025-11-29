/**
 * Configuration - Centralized directory and path configuration
 *
 * Determines default paths for libragen data based on platform conventions
 * and environment variables.
 *
 * Directory structure:
 *   $LIBRAGEN_HOME/
 *     libraries/     - Installed library files (.libragen)
 *     manifest.json  - Tracks installed libraries and collections
 *     collections.json - Collection configuration
 *     cache/         - Cached collection indexes
 *     models/        - Downloaded ML models (shared across all instances)
 *
 * Environment variables:
 *   LIBRAGEN_HOME - Override the base directory for all libragen data
 *   LIBRAGEN_MODEL_CACHE - Override the model cache directory specifically
 *
 * Platform defaults (when LIBRAGEN_HOME is not set):
 *   macOS:   ~/Library/Application Support/libragen
 *   Windows: %APPDATA%\libragen
 *   Linux:   $XDG_DATA_HOME/libragen (defaults to ~/.local/share/libragen)
 */

import * as path from 'path';
import * as os from 'os';

/**
 * Get the base libragen home directory.
 *
 * Checks LIBRAGEN_HOME environment variable first, then falls back to
 * platform-specific defaults.
 */
export function getLibragenHome(): string {
   // eslint-disable-next-line no-process-env
   const envHome = process.env.LIBRAGEN_HOME;

   if (envHome) {
      return envHome;
   }

   const platform = os.platform();

   if (platform === 'darwin') {
      // macOS: ~/Library/Application Support/libragen
      return path.join(os.homedir(), 'Library', 'Application Support', 'libragen');
   } else if (platform === 'win32') {
      // Windows: %APPDATA%\libragen
      // eslint-disable-next-line no-process-env
      const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');

      return path.join(appData, 'libragen');
   }

   // Linux/other: $XDG_DATA_HOME/libragen (defaults to ~/.local/share/libragen)
   // eslint-disable-next-line no-process-env
   const xdgDataHome = process.env.XDG_DATA_HOME || path.join(os.homedir(), '.local', 'share');

   return path.join(xdgDataHome, 'libragen');
}

/**
 * Get the default directory for installed library files.
 */
export function getDefaultLibraryDir(): string {
   return path.join(getLibragenHome(), 'libraries');
}

/**
 * Get the default directory for the manifest file.
 */
export function getDefaultManifestDir(): string {
   return getLibragenHome();
}

/**
 * Get the default directory for collection configuration.
 */
export function getDefaultCollectionConfigDir(): string {
   return getLibragenHome();
}

/**
 * Get the directory for cached ML models.
 *
 * Models are stored in a shared location so they don't need to be downloaded
 * multiple times. The directory structure allows multiple model versions to
 * coexist (Transformers.js handles versioning internally via model name paths).
 *
 * Override with LIBRAGEN_MODEL_CACHE environment variable.
 */
export function getModelCacheDir(): string {
   // eslint-disable-next-line no-process-env
   const envCache = process.env.LIBRAGEN_MODEL_CACHE;

   if (envCache) {
      return envCache;
   }

   return path.join(getLibragenHome(), 'models');
}

/**
 * Detect a project-local `.libragen/libraries` directory.
 *
 * Checks the current working directory for a `.libragen/libraries` folder.
 * Returns the path if it exists, undefined otherwise.
 *
 * @param cwd - Directory to check (defaults to process.cwd())
 */
export function detectProjectLibraryDir(cwd?: string): string | undefined {
   const dir = cwd ?? process.cwd();

   const projectDir = path.join(dir, '.libragen', 'libraries');

   // We return the path even if it doesn't exist yet - the caller can decide
   // whether to create it or just use it for discovery
   return projectDir;
}

/**
 * Check if a project-local `.libragen/libraries` directory exists.
 *
 * @param cwd - Directory to check (defaults to process.cwd())
 */
export async function hasProjectLibraryDir(cwd?: string): Promise<boolean> {
   const fs = await import('fs/promises');

   const projectDir = detectProjectLibraryDir(cwd);

   if (!projectDir) {
      return false;
   }

   try {
      const stats = await fs.stat(projectDir);

      return stats.isDirectory();
   } catch{
      return false;
   }
}

/**
 * Tests for the LibraryManager class
 */

/* eslint-disable @silvermine/silvermine/fluent-chaining */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { LibraryManager, getDefaultLibraryDir } from '../manager.js';
import { Library } from '../library.js';

describe('LibraryManager', () => {
   let tempDir: string,
       globalDir: string,
       projectDir: string,
       manager: LibraryManager;

   beforeEach(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'libragen-manager-test-'));
      globalDir = path.join(tempDir, 'global');
      projectDir = path.join(tempDir, 'project');

      await fs.mkdir(globalDir, { recursive: true });
      await fs.mkdir(projectDir, { recursive: true });

      // Use explicit paths: project first (higher priority), then global
      manager = new LibraryManager({
         paths: [ projectDir, globalDir ],
      });
   });

   afterEach(async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
   });

   /**
    * Helper to create a test library (non-versioned filename)
    */
   async function createTestLibrary(name: string, dir: string): Promise<string> {
      const libPath = path.join(dir, `${name}.libragen`);

      const lib = await Library.create(libPath, {
         name,
         description: `Test library: ${name}`,
         version: '1.0.0',
         contentVersion: '2.0.0',
      });

      lib.close();
      return libPath;
   }

   /**
    * Helper to create a test library with versioned filename
    */
   async function createVersionedLibrary(
      name: string,
      version: string,
      dir: string
   ): Promise<string> {
      const libPath = path.join(dir, `${name}-${version}.libragen`);

      const lib = await Library.create(libPath, {
         name,
         description: `Test library: ${name}`,
         version,
         contentVersion: '2.0.0',
      });

      lib.close();
      return libPath;
   }

   describe('getDefaultLibraryDir', () => {
      it('returns a path string', () => {
         const dir = getDefaultLibraryDir();

         expect(typeof dir).toBe('string');
         expect(dir.length).toBeGreaterThan(0);
      });

      it('includes libragen in the path', () => {
         const dir = getDefaultLibraryDir();

         expect(dir).toContain('libragen');
      });
   });

   describe('getLocations', () => {
      it('returns configured locations', () => {
         const locations = manager.getLocations();

         expect(locations.paths).toContain(globalDir);
         expect(locations.paths).toContain(projectDir);
      });

      it('uses default global location when not specified', async () => {
         const defaultManager = new LibraryManager({ autoDetect: false });

         await defaultManager.initialize();
         const locations = defaultManager.getLocations();

         expect(locations.paths).toContain(getDefaultLibraryDir());
      });
   });

   describe('listInstalled', () => {
      it('returns empty array when no libraries installed', async () => {
         const libraries = await manager.listInstalled();

         expect(libraries).toEqual([]);
      });

      it('lists libraries from global directory', async () => {
         await createTestLibrary('lib-a', globalDir);
         await createTestLibrary('lib-b', globalDir);

         const libraries = await manager.listInstalled();

         expect(libraries).toHaveLength(2);
         expect(libraries.map((l) => {
            return l.name;
         }))
            .toEqual([ 'lib-a', 'lib-b' ]);
      });

      it('lists libraries from project directory', async () => {
         await createTestLibrary('project-lib', projectDir);

         const libraries = await manager.listInstalled();

         expect(libraries).toHaveLength(1);
         expect(libraries[0].name).toBe('project-lib');
         expect(libraries[0].location).toBe('project');
      });

      it('lists libraries from both directories', async () => {
         await createTestLibrary('global-lib', globalDir);
         await createTestLibrary('project-lib', projectDir);

         const libraries = await manager.listInstalled();

         expect(libraries).toHaveLength(2);
         // Both are labeled 'project' since neither is the default global dir
         expect(libraries.map((l) => { return l.name; }))
            .toEqual(expect.arrayContaining([ 'global-lib', 'project-lib' ]));
      });

      it('includes metadata in results', async () => {
         await createTestLibrary('test-lib', globalDir);

         const libraries = await manager.listInstalled();

         expect(libraries[0].version).toBe('1.0.0');
         expect(libraries[0].contentVersion).toBe('2.0.0');
         expect(libraries[0].description).toBe('Test library: test-lib');
         expect(libraries[0].metadata).toBeDefined();
      });

      it('lists libraries with versioned filenames', async () => {
         await createVersionedLibrary('versioned-a', '1.0.0', globalDir);
         await createVersionedLibrary('versioned-b', '2.0.0', globalDir);

         const libraries = await manager.listInstalled();

         expect(libraries).toHaveLength(2);
         expect(libraries.map((l) => {
            return l.name;
         }))
            .toEqual(expect.arrayContaining([ 'versioned-a', 'versioned-b' ]));
      });

      it('lists mix of versioned and non-versioned libraries', async () => {
         await createTestLibrary('nonversioned', globalDir);
         await createVersionedLibrary('versioned', '3.0.0', globalDir);

         const libraries = await manager.listInstalled();

         expect(libraries).toHaveLength(2);
         expect(libraries.find((l) => {
            return l.name === 'nonversioned';
         }))
            .toBeDefined();
         expect(libraries.find((l) => {
            return l.name === 'versioned';
         }))
            .toBeDefined();
      });
   });

   describe('find', () => {
      it('finds library by name', async () => {
         await createTestLibrary('findme', globalDir);

         const lib = await manager.find('findme');

         expect(lib).not.toBeNull();
         expect(lib?.name).toBe('findme');
      });

      it('returns null for nonexistent library', async () => {
         const lib = await manager.find('nonexistent');

         expect(lib).toBeNull();
      });

      it('prefers project library over global', async () => {
         await createTestLibrary('shared', globalDir);
         await createTestLibrary('shared', projectDir);

         const lib = await manager.find('shared');

         expect(lib?.location).toBe('project');
      });

      it('finds library with versioned filename', async () => {
         await createVersionedLibrary('versioned-lib', '2.0.0', globalDir);

         const lib = await manager.find('versioned-lib');

         expect(lib).not.toBeNull();
         expect(lib?.name).toBe('versioned-lib');
         expect(lib?.version).toBe('2.0.0');
      });

      it('finds library with non-versioned filename', async () => {
         await createTestLibrary('nonversioned-lib', globalDir);

         const lib = await manager.find('nonversioned-lib');

         expect(lib).not.toBeNull();
         expect(lib?.name).toBe('nonversioned-lib');
      });

      it('finds either versioned or non-versioned when both exist', async () => {
         // Create non-versioned first
         await createTestLibrary('mixed-lib', globalDir);
         // Create versioned second
         await createVersionedLibrary('mixed-lib', '2.0.0', globalDir);

         const lib = await manager.find('mixed-lib');

         expect(lib).not.toBeNull();
         expect(lib?.name).toBe('mixed-lib');
         // Either version is acceptable - sorted alphabetically, non-versioned wins
         // (mixed-lib.libragen sorts after mixed-lib-2.0.0.libragen)
         expect(lib?.version).toBe('1.0.0');
      });
   });

   describe('getInstallPath', () => {
      it('returns primary (first) path', () => {
         // Project is first in our paths array
         const installPath = manager.getInstallPath('test-lib');

         expect(installPath).toBe(path.join(projectDir, 'test-lib.libragen'));
      });

      it('returns global path when global-only manager', () => {
         const globalOnlyManager = new LibraryManager({ paths: [ globalDir ] });

         const installPath = globalOnlyManager.getInstallPath('test-lib');

         expect(installPath).toBe(path.join(globalDir, 'test-lib.libragen'));
      });
   });

   describe('install', () => {
      it('installs a library to primary directory', async () => {
         const sourcePath = await createTestLibrary('source-lib', tempDir);

         const installed = await manager.install(sourcePath);

         expect(installed.name).toBe('source-lib');
         // Project is first in our paths array, so it's the primary
         expect(installed.location).toBe('project');
         expect(installed.path).toBe(path.join(projectDir, 'source-lib-1.0.0.libragen'));

         // Verify file was copied
         const exists = await fs.access(installed.path).then(() => {
            return true;
         })
            .catch(() => {
               return false;
            });

         expect(exists).toBe(true);
      });

      it('installs a library to specified directory with explicit paths', async () => {
         const sourcePath = await createTestLibrary('local-lib', tempDir);

         const specificManager = new LibraryManager({ paths: [ globalDir ] });

         const installed = await specificManager.install(sourcePath);

         // globalDir isn't the default global, so it's labeled 'project'
         expect(installed.location).toBe('project');
         expect(installed.path).toBe(path.join(globalDir, 'local-lib-1.0.0.libragen'));
      });

      it('throws when library already exists', async () => {
         const sourcePath = await createTestLibrary('existing', tempDir);

         await manager.install(sourcePath);

         await expect(manager.install(sourcePath)).rejects.toThrow('already installed');
      });

      it('overwrites with force option', async () => {
         const sourcePath = await createTestLibrary('overwrite', tempDir);

         await manager.install(sourcePath);
         const installed = await manager.install(sourcePath, { force: true });

         expect(installed.name).toBe('overwrite');
      });
   });

   describe('uninstall', () => {
      it('uninstalls a library', async () => {
         await createTestLibrary('to-remove', globalDir);

         const result = await manager.uninstall('to-remove');

         expect(result).toBe(true);

         const lib = await manager.find('to-remove');

         expect(lib).toBeNull();
      });

      it('returns false for nonexistent library', async () => {
         const result = await manager.uninstall('nonexistent');

         expect(result).toBe(false);
      });

      it('uninstalls from first directory in paths (project)', async () => {
         await createTestLibrary('shared', globalDir);
         await createTestLibrary('shared', projectDir);

         await manager.uninstall('shared');

         // Should have removed from first path (project), second path (global) should
         // still exist
         const lib = await manager.find('shared');

         // The remaining lib is in globalDir, but since globalDir isn't the default
         // global, it's labeled 'project'
         expect(lib).not.toBeNull();
         expect(lib?.path).toContain(globalDir);
      });

      it('uninstalls from configured paths', async () => {
         await createTestLibrary('local-only', projectDir);

         const result = await manager.uninstall('local-only');

         expect(result).toBe(true);
      });

      it('uninstalls library with versioned filename', async () => {
         await createVersionedLibrary('versioned-remove', '3.0.0', globalDir);

         const result = await manager.uninstall('versioned-remove');

         expect(result).toBe(true);

         const lib = await manager.find('versioned-remove');

         expect(lib).toBeNull();
      });

      it('uninstalls library with non-versioned filename', async () => {
         await createTestLibrary('nonversioned-remove', globalDir);

         const result = await manager.uninstall('nonversioned-remove');

         expect(result).toBe(true);

         const lib = await manager.find('nonversioned-remove');

         expect(lib).toBeNull();
      });
   });

   describe('open', () => {
      it('opens a library by name', async () => {
         await createTestLibrary('openme', globalDir);

         const lib = await manager.open('openme');

         expect(lib).toBeInstanceOf(Library);
         expect(lib.getMetadata().name).toBe('openme');

         lib.close();
      });

      it('throws for nonexistent library', async () => {
         await expect(manager.open('nonexistent')).rejects.toThrow('not found');
      });
   });

   describe('ensureDirectories', () => {
      it('creates directories if they do not exist', async () => {
         const newGlobal = path.join(tempDir, 'new-global');

         const newProject = path.join(tempDir, 'new-project');

         const newManager = new LibraryManager({
            paths: [ newProject, newGlobal ],
         });

         await newManager.ensureDirectories();

         const globalExists = await fs.stat(newGlobal).then(() => {
            return true;
         })
            .catch(() => {
               return false;
            });

         const projectExists = await fs.stat(newProject).then(() => {
            return true;
         })
            .catch(() => {
               return false;
            });

         expect(globalExists).toBe(true);
         expect(projectExists).toBe(true);
      });
   });
});

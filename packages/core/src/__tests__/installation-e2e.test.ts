/**
 * End-to-end tests for library and collection installation
 *
 * Tests all installation scenarios:
 * - Local library files
 * - Remote library URLs
 * - Local collection files
 * - Remote collection URLs
 * - Deeply nested collections
 * - Library deduplication with matching versions
 * - Reference counting on uninstall
 */

/* eslint-disable @silvermine/silvermine/fluent-chaining */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import * as http from 'http';
import { LibraryManager } from '../manager.ts';
import { Library } from '../library.ts';
import type { CollectionDefinition } from '../manifest.ts';

describe('Installation E2E', () => {
   let tempDir: string,
       globalDir: string,
       projectDir: string,
       fixturesDir: string,
       manifestDir: string,
       manager: LibraryManager;

   beforeEach(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'libragen-install-e2e-'));
      globalDir = path.join(tempDir, 'global');
      projectDir = path.join(tempDir, 'project');
      fixturesDir = path.join(tempDir, 'fixtures');
      manifestDir = path.join(tempDir, 'manifest');

      await fs.mkdir(globalDir, { recursive: true });
      await fs.mkdir(projectDir, { recursive: true });
      await fs.mkdir(fixturesDir, { recursive: true });
      await fs.mkdir(manifestDir, { recursive: true });

      // Use explicit paths: global first (primary for install), then project
      manager = new LibraryManager({
         paths: [ globalDir, projectDir ],
         manifestDir,
      });
   });

   afterEach(async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
   });

   /**
    * Helper to create a test library file
    */
   async function createLibrary(name: string, version = '1.0.0'): Promise<string> {
      const libPath = path.join(fixturesDir, `${name}.libragen`);

      const lib = await Library.create(libPath, {
         name,
         description: `Test library: ${name}`,
         version,
         contentVersion: version,
      });

      await lib.close();
      return libPath;
   }

   /**
    * Helper to create a collection JSON file
    */
   async function createCollection(
      name: string,
      definition: Partial<CollectionDefinition>
   ): Promise<string> {
      const collectionPath = path.join(fixturesDir, `${name}.json`);

      const fullDefinition: CollectionDefinition = {
         name,
         version: '1.0.0',
         items: [],
         ...definition,
      };

      await fs.writeFile(collectionPath, JSON.stringify(fullDefinition, null, 2));
      return collectionPath;
   }

   // ========== Local Library Installation ==========

   describe('Local Library Installation', () => {
      it('installs a library from local file path', async () => {
         const libPath = await createLibrary('local-lib');

         const installed = await manager.install(libPath);

         expect(installed.name).toBe('local-lib');
         expect(installed.version).toBe('1.0.0');
         // globalDir isn't the default global, so it's labeled 'project'
         expect(installed.location).toBe('project');

         // Verify file exists
         const exists = await fs.access(installed.path)
            .then(() => { return true; })
            .catch(() => { return false; });

         expect(exists).toBe(true);
      });

      it('installs to specified directory with explicit paths', async () => {
         const libPath = await createLibrary('project-lib');

         const projectManager = new LibraryManager({
            paths: [ projectDir ],
            manifestDir,
         });

         const installed = await projectManager.install(libPath);

         expect(installed.location).toBe('project');
         expect(installed.path).toContain(projectDir);
      });

      it('prevents duplicate installation without force', async () => {
         const libPath = await createLibrary('dupe-lib');

         await manager.install(libPath);

         await expect(manager.install(libPath)).rejects.toThrow('already installed');
      });

      it('allows reinstallation with force option', async () => {
         const libPath = await createLibrary('force-lib');

         await manager.install(libPath);
         const reinstalled = await manager.install(libPath, { force: true });

         expect(reinstalled.name).toBe('force-lib');
      });
   });

   // ========== Local Collection Installation ==========

   describe('Local Collection Installation', () => {
      it('installs a simple collection from local file', async () => {
         // Create libraries
         const libA = await createLibrary('lib-a');

         const libB = await createLibrary('lib-b');

         // Create collection referencing local libraries
         const collectionPath = await createCollection('simple-collection', {
            items: [
               { library: libA },
               { library: libB },
            ],
         });

         const result = await manager.installCollection(collectionPath);

         expect(result.collectionName).toBe('simple-collection');
         expect(result.installed).toContain('lib-a');
         expect(result.installed).toContain('lib-b');
         expect(result.failed).toHaveLength(0);
      });

      it('separates required and optional libraries', async () => {
         const required = await createLibrary('required-lib');

         const optional = await createLibrary('optional-lib');

         const collectionPath = await createCollection('mixed-collection', {
            items: [
               { library: required },
               { library: optional, required: false },
            ],
         });

         // Install without optional
         const result = await manager.installCollection(collectionPath);

         expect(result.installed).toContain('required-lib');
         expect(result.installed).not.toContain('optional-lib');
      });

      it('includes optional libraries with includeOptional flag', async () => {
         const required = await createLibrary('req-lib');

         const optional = await createLibrary('opt-lib');

         const collectionPath = await createCollection('opt-collection', {
            items: [
               { library: required },
               { library: optional, required: false },
            ],
         });

         const result = await manager.installCollection(collectionPath, {
            includeOptional: true,
         });

         expect(result.installed).toContain('req-lib');
         expect(result.installed).toContain('opt-lib');
      });

      it('selects specific optional libraries', async () => {
         const required = await createLibrary('base-lib');

         const opt1 = await createLibrary('opt-one');

         const opt2 = await createLibrary('opt-two');

         const collectionPath = await createCollection('selective-collection', {
            items: [
               { library: required },
               { library: opt1, required: false },
               { library: opt2, required: false },
            ],
         });

         const result = await manager.installCollection(collectionPath, {
            selectOptional: [ 'opt-one' ],
         });

         expect(result.installed).toContain('base-lib');
         expect(result.installed).toContain('opt-one');
         expect(result.installed).not.toContain('opt-two');
      });
   });

   // ========== Nested Collections ==========

   describe('Nested Collections', () => {
      it('installs a collection with one level of nesting', async () => {
         // Create libraries
         const parentLib = await createLibrary('parent-lib');

         const childLib = await createLibrary('child-lib');

         // Create child collection
         const childCollection = await createCollection('child-collection', {
            items: [
               { library: childLib },
            ],
         });

         // Create parent collection that includes child
         const parentCollection = await createCollection('parent-collection', {
            items: [
               { library: parentLib },
               { collection: childCollection },
            ],
         });

         const result = await manager.installCollection(parentCollection);

         expect(result.installed).toContain('parent-lib');
         expect(result.installed).toContain('child-lib');
      });

      it('installs deeply nested collections (3 levels)', async () => {
         // Level 3 (deepest)
         const level3Lib = await createLibrary('level3-lib');

         const level3Collection = await createCollection('level3', {
            items: [ { library: level3Lib } ],
         });

         // Level 2
         const level2Lib = await createLibrary('level2-lib');

         const level2Collection = await createCollection('level2', {
            items: [
               { library: level2Lib },
               { collection: level3Collection },
            ],
         });

         // Level 1 (root)
         const level1Lib = await createLibrary('level1-lib');

         const level1Collection = await createCollection('level1', {
            items: [
               { library: level1Lib },
               { collection: level2Collection },
            ],
         });

         const result = await manager.installCollection(level1Collection);

         expect(result.installed).toContain('level1-lib');
         expect(result.installed).toContain('level2-lib');
         expect(result.installed).toContain('level3-lib');
         expect(result.failed).toHaveLength(0);
      });

      it('handles diamond dependency pattern', async () => {
         // Diamond pattern:
         //       root
         //      /    \
         //   left    right
         //      \    /
         //       base

         const baseLib = await createLibrary('base-lib');

         const baseCollection = await createCollection('base', {
            items: [ { library: baseLib } ],
         });

         const leftLib = await createLibrary('left-lib');

         const leftCollection = await createCollection('left', {
            items: [
               { library: leftLib },
               { collection: baseCollection },
            ],
         });

         const rightLib = await createLibrary('right-lib');

         const rightCollection = await createCollection('right', {
            items: [
               { library: rightLib },
               { collection: baseCollection },
            ],
         });

         const rootLib = await createLibrary('root-lib');

         const rootCollection = await createCollection('root', {
            items: [
               { library: rootLib },
               { collection: leftCollection },
               { collection: rightCollection },
            ],
         });

         const result = await manager.installCollection(rootCollection);

         // All libraries should be installed
         expect(result.installed).toContain('root-lib');
         expect(result.installed).toContain('left-lib');
         expect(result.installed).toContain('right-lib');
         expect(result.installed).toContain('base-lib');

         // base-lib should only be installed once (not duplicated)
         const baseCount = result.installed.filter((name) => { return name === 'base-lib'; }).length;

         expect(baseCount).toBe(1);
      });
   });

   // ========== Library Deduplication ==========

   describe('Library Deduplication', () => {
      it('deduplicates libraries with matching sources', async () => {
         const sharedLib = await createLibrary('shared-lib');

         // Two collections both reference the same library
         const collection1 = await createCollection('collection1', {
            items: [ { library: sharedLib } ],
         });

         const collection2 = await createCollection('collection2', {
            items: [ { library: sharedLib } ],
         });

         const rootCollection = await createCollection('root', {
            items: [
               { collection: collection1 },
               { collection: collection2 },
            ],
         });

         const result = await manager.installCollection(rootCollection);

         // shared-lib should appear only once in installed
         const sharedCount = result.installed.filter((name) => { return name === 'shared-lib'; }).length;

         expect(sharedCount).toBe(1);
      });

      it('skips already installed libraries', async () => {
         const existingLib = await createLibrary('existing-lib');

         // Pre-install the library
         await manager.install(existingLib);

         // Create collection that includes the same library
         const collectionPath = await createCollection('skip-collection', {
            items: [ { library: existingLib } ],
         });

         const result = await manager.installCollection(collectionPath);

         expect(result.skipped).toContain('existing-lib');
         expect(result.installed).not.toContain('existing-lib');
      });

      it('promotes optional to required when both exist', async () => {
         const sharedLib = await createLibrary('promoted-lib');

         // Child marks as optional
         const childCollection = await createCollection('child-opt', {
            items: [ { library: sharedLib, required: false } ],
         });

         // Parent marks as required
         const parentCollection = await createCollection('parent-req', {
            items: [
               { library: sharedLib, required: true },
               { collection: childCollection },
            ],
         });

         // Install without includeOptional - should still get the library
         // because parent requires it
         const result = await manager.installCollection(parentCollection);

         expect(result.installed).toContain('promoted-lib');
      });
   });

   // ========== Reference Counting ==========

   describe('Reference Counting', () => {
      it('tracks library references from collections', async () => {
         const lib = await createLibrary('tracked-lib');

         const collectionPath = await createCollection('tracking-collection', {
            items: [ { library: lib } ],
         });

         await manager.installCollection(collectionPath);

         // Check manifest has the reference
         const collections = await manager.listCollections();

         const trackingCollection = collections.find((c) => {
            return c.name === 'tracking-collection';
         });

         expect(trackingCollection).toBeDefined();
         expect(trackingCollection?.libraries).toContain('tracked-lib');
      });

      it('preserves library when still referenced by other collections', async () => {
         const sharedLib = await createLibrary('shared-ref-lib');

         const collection1 = await createCollection('ref-collection1', {
            items: [ { library: sharedLib } ],
         });

         const collection2 = await createCollection('ref-collection2', {
            items: [ { library: sharedLib } ],
         });

         // Install both collections
         await manager.installCollection(collection1);
         await manager.installCollection(collection2);

         // Uninstall first collection
         await manager.uninstallCollection('ref-collection1');

         // Library should still exist (referenced by collection2)
         const lib = await manager.find('shared-ref-lib');

         expect(lib).not.toBeNull();
      });

      it('removes library when last reference is removed', async () => {
         const singleRefLib = await createLibrary('single-ref-lib');

         const collectionPath = await createCollection('single-ref-collection', {
            items: [ { library: singleRefLib } ],
         });

         await manager.installCollection(collectionPath);

         // Verify library exists
         let lib = await manager.find('single-ref-lib');

         expect(lib).not.toBeNull();

         // Uninstall the collection
         await manager.uninstallCollection('single-ref-collection');

         // Library should be removed
         lib = await manager.find('single-ref-lib');
         expect(lib).toBeNull();
      });
   });

   // ========== Remote Installation (with mock server) ==========

   describe('Remote Installation', () => {
      let server: http.Server,
          serverPort: number,
          serverUrl: string;

      beforeAll(async () => {
         // Create a simple HTTP server to serve test files
         server = http.createServer(async (req, res) => {
            const urlPath = req.url || '/';

            const filePath = path.join(fixturesDir, urlPath);

            try {
               const content = await fs.readFile(filePath);

               if (urlPath.endsWith('.json')) {
                  res.setHeader('Content-Type', 'application/json');
               } else {
                  res.setHeader('Content-Type', 'application/octet-stream');
               }
               res.writeHead(200);
               res.end(content);
            } catch{
               res.writeHead(404);
               res.end('Not found');
            }
         });

         await new Promise<void>((resolve) => {
            server.listen(0, '127.0.0.1', () => {
               const addr = server.address();

               if (addr && typeof addr === 'object') {
                  serverPort = addr.port;
                  serverUrl = `http://127.0.0.1:${serverPort}`;
               }
               resolve();
            });
         });
      });

      afterAll(async () => {
         await new Promise<void>((resolve) => {
            server.close(() => { return resolve(); });
         });
      });

      it('installs a library from URL', async () => {
         // Create library in fixtures dir (served by mock server)
         await createLibrary('remote-lib');

         const result = await manager.installCollection(
            await createCollection('remote-collection', {
               items: [ { library: `${serverUrl}/remote-lib.libragen` } ],
            })
         );

         expect(result.installed).toContain('remote-lib');
      });

      it('installs a collection from URL', async () => {
         // Create library and collection in fixtures dir
         await createLibrary('url-lib');

         await createCollection('url-collection', {
            items: [ { library: `${serverUrl}/url-lib.libragen` } ],
         });

         const result = await manager.installCollection(`${serverUrl}/url-collection.json`);

         expect(result.collectionName).toBe('url-collection');
         expect(result.installed).toContain('url-lib');
      });

      it('installs nested collections from URLs', async () => {
         // Create libraries
         await createLibrary('nested-url-lib1');
         await createLibrary('nested-url-lib2');

         // Create child collection
         await createCollection('nested-child', {
            items: [ { library: `${serverUrl}/nested-url-lib2.libragen` } ],
         });

         // Create parent collection referencing child via URL
         await createCollection('nested-parent', {
            items: [
               { library: `${serverUrl}/nested-url-lib1.libragen` },
               { collection: `${serverUrl}/nested-child.json` },
            ],
         });

         const result = await manager.installCollection(`${serverUrl}/nested-parent.json`);

         expect(result.installed).toContain('nested-url-lib1');
         expect(result.installed).toContain('nested-url-lib2');
      });

      it('handles mixed local and remote sources', async () => {
         // Create local library
         const localLib = await createLibrary('local-mixed-lib');

         // Create remote library
         await createLibrary('remote-mixed-lib');

         // Create collection with both
         const collectionPath = await createCollection('mixed-sources', {
            items: [
               { library: localLib },
               { library: `${serverUrl}/remote-mixed-lib.libragen` },
            ],
         });

         const result = await manager.installCollection(collectionPath);

         expect(result.installed).toContain('local-mixed-lib');
         expect(result.installed).toContain('remote-mixed-lib');
      });
   });

   // ========== Error Handling ==========

   describe('Error Handling', () => {
      it('reports failed library downloads', async () => {
         const collectionPath = await createCollection('failing-collection', {
            items: [
               { library: '/nonexistent/path/lib.libragen' },
            ],
         });

         const result = await manager.installCollection(collectionPath);

         expect(result.failed).toHaveLength(1);
         expect(result.failed[0].name).toBe('lib');
         expect(result.failed[0].error).toBeDefined();
      });

      it('continues installing other libraries after failure', async () => {
         const goodLib = await createLibrary('good-lib');

         const collectionPath = await createCollection('partial-fail-collection', {
            items: [
               { library: goodLib },
               { library: '/nonexistent/bad-lib.libragen' },
            ],
         });

         const result = await manager.installCollection(collectionPath);

         expect(result.installed).toContain('good-lib');
         expect(result.failed).toHaveLength(1);
      });

      it('throws for invalid collection JSON', async () => {
         const invalidPath = path.join(fixturesDir, 'invalid.json');

         await fs.writeFile(invalidPath, 'not valid json');

         await expect(manager.installCollection(invalidPath)).rejects.toThrow();
      });

      it('throws for missing collection file', async () => {
         await expect(
            manager.installCollection('/nonexistent/collection.json')
         ).rejects.toThrow();
      });
   });

   // ========== Progress Reporting ==========

   describe('Progress Reporting', () => {
      it('reports progress phases during installation', async () => {
         const lib1 = await createLibrary('progress-lib1');

         const lib2 = await createLibrary('progress-lib2');

         const collectionPath = await createCollection('progress-collection', {
            items: [
               { library: lib1 },
               { library: lib2 },
            ],
         });

         const phases: string[] = [];

         await manager.installCollection(collectionPath, {
            onProgress: (progress) => {
               if (!phases.includes(progress.phase)) {
                  phases.push(progress.phase);
               }
            },
         });

         expect(phases).toContain('resolving');
         expect(phases).toContain('downloading');
         expect(phases).toContain('installing');
      });

      it('reports library names during installation', async () => {
         const lib = await createLibrary('named-lib');

         const collectionPath = await createCollection('named-collection', {
            items: [ { library: lib } ],
         });

         const libraryNames: string[] = [];

         await manager.installCollection(collectionPath, {
            onProgress: (progress) => {
               if (progress.libraryName) {
                  libraryNames.push(progress.libraryName);
               }
            },
         });

         expect(libraryNames).toContain('named-lib');
      });
   });
});

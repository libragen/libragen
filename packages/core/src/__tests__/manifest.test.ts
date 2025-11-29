/**
 * Tests for Manifest class
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { Manifest } from '../manifest.ts';

describe('Manifest', () => {
   let tempDir: string,
       manifest: Manifest;

   beforeEach(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'libragen-manifest-test-'));
      manifest = new Manifest(tempDir);
   });

   afterEach(async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
   });

   describe('load and save', () => {
      it('creates empty manifest when file does not exist', async () => {
         await manifest.load();

         expect(manifest.getCollections()).toEqual([]);
         expect(manifest.getLibraryRecords()).toEqual([]);
      });

      it('saves and loads manifest data', async () => {
         await manifest.load();

         manifest.addLibrary('test-lib', 'https://example.com/test.libragen');
         await manifest.save();

         // Create new manifest instance and load
         const manifest2 = new Manifest(tempDir);

         await manifest2.load();

         const records = manifest2.getLibraryRecords();

         expect(records).toHaveLength(1);
         expect(records[0].name).toBe('test-lib');
      });
   });

   describe('library tracking', () => {
      beforeEach(async () => {
         await manifest.load();
      });

      it('adds manual library', () => {
         manifest.addLibrary('my-lib', '/path/to/lib.libragen');

         const record = manifest.getLibraryRecord('my-lib');

         expect(record).toBeDefined();
         expect(record?.manual).toBe(true);
         expect(record?.installedBy).toEqual([]);
      });

      it('adds library from collection', () => {
         manifest.addLibrary('my-lib', '/path/to/lib.libragen', 'my-collection');

         const record = manifest.getLibraryRecord('my-lib');

         expect(record).toBeDefined();
         expect(record?.manual).toBe(false);
         expect(record?.installedBy).toEqual([ 'my-collection' ]);
      });

      it('tracks multiple collections for same library', () => {
         manifest.addLibrary('shared-lib', '/path/to/lib.libragen', 'collection-a');
         manifest.addLibrary('shared-lib', '/path/to/lib.libragen', 'collection-b');

         const record = manifest.getLibraryRecord('shared-lib');

         expect(record?.installedBy).toContain('collection-a');
         expect(record?.installedBy).toContain('collection-b');
      });

      it('removes manual library when not referenced', () => {
         manifest.addLibrary('my-lib', '/path/to/lib.libragen');

         const shouldUninstall = manifest.removeLibrary('my-lib');

         expect(shouldUninstall).toBe(true);
         expect(manifest.hasLibrary('my-lib')).toBe(false);
      });

      it('keeps library when still referenced by collection', () => {
         manifest.addLibrary('my-lib', '/path/to/lib.libragen', 'my-collection');

         const shouldUninstall = manifest.removeLibrary('my-lib');

         expect(shouldUninstall).toBe(false);
         expect(manifest.hasLibrary('my-lib')).toBe(true);
      });
   });

   describe('collection tracking', () => {
      beforeEach(async () => {
         await manifest.load();
      });

      it('adds collection', () => {
         manifest.addCollection({
            name: 'my-collection',
            source: 'https://example.com/collection.json',
            libraries: [ 'lib-a', 'lib-b' ],
            collections: [],
            installedAt: new Date().toISOString(),
         });

         expect(manifest.hasCollection('my-collection')).toBe(true);

         const collection = manifest.getCollection('my-collection');

         expect(collection?.libraries).toEqual([ 'lib-a', 'lib-b' ]);
      });

      it('removes collection and returns unreferenced libraries', () => {
         // Add collection with libraries
         manifest.addCollection({
            name: 'my-collection',
            source: 'https://example.com/collection.json',
            libraries: [ 'lib-a', 'lib-b' ],
            collections: [],
            installedAt: new Date().toISOString(),
         });

         manifest.addLibrary('lib-a', '/path/a.libragen', 'my-collection');
         manifest.addLibrary('lib-b', '/path/b.libragen', 'my-collection');

         const toUninstall = manifest.removeCollection('my-collection');

         expect(toUninstall).toContain('lib-a');
         expect(toUninstall).toContain('lib-b');
         expect(manifest.hasCollection('my-collection')).toBe(false);
      });

      it('keeps libraries referenced by other collections', () => {
         // Add two collections sharing a library
         manifest.addCollection({
            name: 'collection-a',
            source: 'https://example.com/a.json',
            libraries: [ 'shared-lib', 'lib-a' ],
            collections: [],
            installedAt: new Date().toISOString(),
         });

         manifest.addCollection({
            name: 'collection-b',
            source: 'https://example.com/b.json',
            libraries: [ 'shared-lib', 'lib-b' ],
            collections: [],
            installedAt: new Date().toISOString(),
         });

         manifest.addLibrary('shared-lib', '/path/shared.libragen', 'collection-a');
         manifest.addLibrary('shared-lib', '/path/shared.libragen', 'collection-b');
         manifest.addLibrary('lib-a', '/path/a.libragen', 'collection-a');
         manifest.addLibrary('lib-b', '/path/b.libragen', 'collection-b');

         // Remove collection-a
         const toUninstall = manifest.removeCollection('collection-a');

         // shared-lib should NOT be uninstalled (still used by collection-b)
         expect(toUninstall).not.toContain('shared-lib');
         expect(toUninstall).toContain('lib-a');
         expect(manifest.hasLibrary('shared-lib')).toBe(true);
      });
   });
});

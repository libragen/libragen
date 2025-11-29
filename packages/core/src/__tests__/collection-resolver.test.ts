/**
 * Tests for Collection Resolver
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import {
   resolveCollection,
   fetchCollectionDefinition,
   isCollectionSource,
   isLibrarySource,
   getLibraryNameFromSource,
} from '../collection-resolver.ts';

describe('Collection Resolver', () => {
   let tempDir: string;

   beforeEach(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'libragen-resolver-test-'));
   });

   afterEach(async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
   });

   describe('isCollectionSource', () => {
      it('returns true for .json files', () => {
         expect(isCollectionSource('collection.json')).toBe(true);
         expect(isCollectionSource('/path/to/collection.json')).toBe(true);
         expect(isCollectionSource('https://example.com/collection.json')).toBe(true);
      });

      it('returns false for non-json files', () => {
         expect(isCollectionSource('library.libragen')).toBe(false);
         expect(isCollectionSource('file.txt')).toBe(false);
      });
   });

   describe('isLibrarySource', () => {
      it('returns true for .libragen files', () => {
         expect(isLibrarySource('library.libragen')).toBe(true);
         expect(isLibrarySource('/path/to/library.libragen')).toBe(true);
         expect(isLibrarySource('https://example.com/library.libragen')).toBe(true);
      });

      it('returns false for non-libragen files', () => {
         expect(isLibrarySource('collection.json')).toBe(false);
         expect(isLibrarySource('file.txt')).toBe(false);
      });
   });

   describe('getLibraryNameFromSource', () => {
      it('extracts name from local path', () => {
         expect(getLibraryNameFromSource('/path/to/react.libragen')).toBe('react');
         expect(getLibraryNameFromSource('./my-lib.libragen')).toBe('my-lib');
      });

      it('extracts name from URL', () => {
         expect(getLibraryNameFromSource('https://example.com/typescript.libragen')).toBe('typescript');
      });

      it('handles query params and hash', () => {
         expect(getLibraryNameFromSource('https://example.com/lib.libragen?v=1')).toBe('lib');
         expect(getLibraryNameFromSource('https://example.com/lib.libragen#section')).toBe('lib');
      });
   });

   describe('fetchCollectionDefinition', () => {
      it('loads collection from local file', async () => {
         const collectionPath = path.join(tempDir, 'test-collection.json');

         await fs.writeFile(collectionPath, JSON.stringify({
            name: 'test-collection',
            description: 'A test collection',
            items: [
               { library: 'https://example.com/lib.libragen' },
            ],
         }));

         const definition = await fetchCollectionDefinition(collectionPath);

         expect(definition.name).toBe('test-collection');
         expect(definition.items).toHaveLength(1);
      });
   });

   describe('resolveCollection', () => {
      it('resolves simple collection with required libraries', async () => {
         const collectionPath = path.join(tempDir, 'simple.json');

         await fs.writeFile(collectionPath, JSON.stringify({
            name: 'simple',
            items: [
               { library: 'https://example.com/lib-a.libragen' },
               { library: 'https://example.com/lib-b.libragen' },
            ],
         }));

         const result = await resolveCollection(collectionPath);

         expect(result.required).toHaveLength(2);
         expect(result.optional).toHaveLength(0);
         expect(result.collections).toContain('simple');
      });

      it('separates required and optional libraries', async () => {
         const collectionPath = path.join(tempDir, 'mixed.json');

         await fs.writeFile(collectionPath, JSON.stringify({
            name: 'mixed',
            items: [
               { library: 'https://example.com/required.libragen' },
               { library: 'https://example.com/optional.libragen', required: false },
            ],
         }));

         const result = await resolveCollection(collectionPath);

         expect(result.required).toHaveLength(1);
         expect(result.required[0].name).toBe('required');
         expect(result.optional).toHaveLength(1);
         expect(result.optional[0].name).toBe('optional');
      });

      it('resolves nested collections', async () => {
         // Create parent collection
         const parentPath = path.join(tempDir, 'parent.json'),
               childPath = path.join(tempDir, 'child.json');

         await fs.writeFile(childPath, JSON.stringify({
            name: 'child',
            items: [
               { library: 'https://example.com/child-lib.libragen' },
            ],
         }));

         await fs.writeFile(parentPath, JSON.stringify({
            name: 'parent',
            items: [
               { library: 'https://example.com/parent-lib.libragen' },
               { collection: childPath },
            ],
         }));

         const result = await resolveCollection(parentPath);

         expect(result.required).toHaveLength(2);
         expect(result.collections).toContain('parent');
         expect(result.collections).toContain('child');
      });

      it('deduplicates libraries across collections', async () => {
         const parentPath = path.join(tempDir, 'parent.json'),
               childPath = path.join(tempDir, 'child.json');

         // Both collections include the same library
         await fs.writeFile(childPath, JSON.stringify({
            name: 'child',
            items: [
               { library: 'https://example.com/shared.libragen' },
            ],
         }));

         await fs.writeFile(parentPath, JSON.stringify({
            name: 'parent',
            items: [
               { library: 'https://example.com/shared.libragen' },
               { collection: childPath },
            ],
         }));

         const result = await resolveCollection(parentPath);

         // Should only have one instance of shared library
         const sharedLibs = result.required.filter((lib) => {
            return lib.name === 'shared';
         });

         expect(sharedLibs).toHaveLength(1);
         expect(sharedLibs[0].fromCollections).toContain('parent');
         expect(sharedLibs[0].fromCollections).toContain('child');
      });

      it('promotes optional to required if any collection requires it', async () => {
         const parentPath = path.join(tempDir, 'parent.json'),
               childPath = path.join(tempDir, 'child.json');

         // Child marks library as optional
         await fs.writeFile(childPath, JSON.stringify({
            name: 'child',
            items: [
               { library: 'https://example.com/lib.libragen', required: false },
            ],
         }));

         // Parent marks same library as required
         await fs.writeFile(parentPath, JSON.stringify({
            name: 'parent',
            items: [
               { library: 'https://example.com/lib.libragen', required: true },
               { collection: childPath },
            ],
         }));

         const result = await resolveCollection(parentPath);

         expect(result.required).toHaveLength(1);
         expect(result.optional).toHaveLength(0);
      });
   });
});

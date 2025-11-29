/**
 * Tests for the CollectionClient class
 */

/* eslint-disable @silvermine/silvermine/fluent-chaining, global-require */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { CollectionClient, getDefaultCollectionConfigDir } from '../collection.js';
import type { CollectionIndex } from '../collection.js';

// Mock fetch globally
const mockFetch = vi.fn();

vi.stubGlobal('fetch', mockFetch);

describe('CollectionClient', () => {
   let tempDir: string,
       client: CollectionClient;

   const mockCollectionIndex: CollectionIndex = {
      name: 'test-collection',
      version: '1',
      updatedAt: '2025-01-01T00:00:00Z',
      libraries: [
         {
            name: 'rust-std',
            description: 'Rust standard library documentation',
            versions: [
               {
                  version: '1.0.0',
                  contentVersion: '1.74.0',
                  contentVersionType: 'semver',
                  downloadURL: 'https://example.com/rust-std-1.0.0.libragen',
                  contentHash: 'sha256:abc123',
                  fileSize: 1024000,
               },
               {
                  version: '0.9.0',
                  contentVersion: '1.73.0',
                  contentVersionType: 'semver',
                  downloadURL: 'https://example.com/rust-std-0.9.0.libragen',
                  contentHash: 'sha256:def456',
                  fileSize: 1000000,
               },
            ],
         },
         {
            name: 'react-docs',
            description: 'React documentation',
            versions: [
               {
                  version: '1.0.0',
                  contentVersion: '18.2.0',
                  downloadURL: 'https://example.com/react-docs-1.0.0.libragen',
                  contentHash: 'sha256:ghi789',
               },
            ],
         },
      ],
   };

   beforeEach(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'libragen-collection-test-'));
      client = new CollectionClient({ configDir: tempDir, cacheTTL: 0 }); // Disable cache for tests
      mockFetch.mockReset();
   });

   afterEach(async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
      vi.restoreAllMocks();
   });

   describe('getDefaultCollectionConfigDir', () => {
      it('returns a path string', () => {
         const dir = getDefaultCollectionConfigDir();

         expect(typeof dir).toBe('string');
         expect(dir.length).toBeGreaterThan(0);
      });

      it('includes libragen in the path', () => {
         const dir = getDefaultCollectionConfigDir();

         expect(dir).toContain('libragen');
      });
   });

   describe('collection management', () => {
      it('adds a collection', async () => {
         await client.addCollection({
            name: 'test',
            url: 'https://example.com/collection.json',
            priority: 1,
         });

         const collections = client.getCollections();

         expect(collections).toHaveLength(1);
         expect(collections[0].name).toBe('test');
      });

      it('updates existing collection with same name', async () => {
         await client.addCollection({
            name: 'test',
            url: 'https://old.com/collection.json',
            priority: 1,
         });

         await client.addCollection({
            name: 'test',
            url: 'https://new.com/collection.json',
            priority: 2,
         });

         const collections = client.getCollections();

         expect(collections).toHaveLength(1);
         expect(collections[0].url).toBe('https://new.com/collection.json');
      });

      it('removes a collection', async () => {
         await client.addCollection({
            name: 'test',
            url: 'https://example.com/collection.json',
            priority: 1,
         });

         const removed = await client.removeCollection('test');

         expect(removed).toBe(true);
         expect(client.getCollections()).toHaveLength(0);
      });

      it('returns false when removing nonexistent collection', async () => {
         const removed = await client.removeCollection('nonexistent');

         expect(removed).toBe(false);
      });

      it('sorts collections by priority', async () => {
         await client.addCollection({ name: 'low', url: 'https://low.com', priority: 10 });
         await client.addCollection({ name: 'high', url: 'https://high.com', priority: 1 });
         await client.addCollection({ name: 'mid', url: 'https://mid.com', priority: 5 });

         const collections = client.getCollections();

         expect(collections.map((c) => {
            return c.name;
         }))
            .toEqual([ 'high', 'mid', 'low' ]);
      });

      it('persists collections to config file', async () => {
         await client.addCollection({
            name: 'test',
            url: 'https://example.com/collection.json',
            priority: 1,
         });

         // Create new client and load config
         const newClient = new CollectionClient({ configDir: tempDir });

         await newClient.loadConfig();

         expect(newClient.getCollections()).toHaveLength(1);
         expect(newClient.getCollections()[0].name).toBe('test');
      });
   });

   describe('search', () => {
      beforeEach(async () => {
         await client.addCollection({
            name: 'test',
            url: 'https://example.com/collection.json',
            priority: 1,
         });

         mockFetch.mockResolvedValue({
            ok: true,
            json: async () => {
               return mockCollectionIndex;
            },
         });
      });

      it('searches by name', async () => {
         const results = await client.search('rust');

         expect(results).toHaveLength(1);
         expect(results[0].name).toBe('rust-std');
      });

      it('searches by description', async () => {
         const results = await client.search('documentation');

         expect(results).toHaveLength(2);
      });

      it('returns latest version by default', async () => {
         const results = await client.search('rust');

         expect(results[0].version).toBe('1.0.0');
         expect(results[0].contentVersion).toBe('1.74.0');
      });

      it('filters by content version', async () => {
         const results = await client.search('rust', { contentVersion: '1.73.0' });

         expect(results).toHaveLength(1);
         expect(results[0].version).toBe('0.9.0');
      });

      it('returns empty array when no matches', async () => {
         const results = await client.search('nonexistent');

         expect(results).toEqual([]);
      });

      it('includes collection name in results', async () => {
         const results = await client.search('rust');

         expect(results[0].collection).toBe('test');
      });
   });

   describe('getEntry', () => {
      beforeEach(async () => {
         await client.addCollection({
            name: 'test',
            url: 'https://example.com/collection.json',
            priority: 1,
         });

         mockFetch.mockResolvedValue({
            ok: true,
            json: async () => {
               return mockCollectionIndex;
            },
         });
      });

      it('gets library by name', async () => {
         const entry = await client.getEntry('rust-std');

         expect(entry).not.toBeNull();
         expect(entry?.name).toBe('rust-std');
         expect(entry?.version).toBe('1.0.0'); // Latest
      });

      it('gets specific version', async () => {
         const entry = await client.getEntry('rust-std', '0.9.0');

         expect(entry?.version).toBe('0.9.0');
         expect(entry?.contentVersion).toBe('1.73.0');
      });

      it('returns null for nonexistent library', async () => {
         const entry = await client.getEntry('nonexistent');

         expect(entry).toBeNull();
      });

      it('returns null for nonexistent version', async () => {
         const entry = await client.getEntry('rust-std', '99.0.0');

         expect(entry).toBeNull();
      });
   });

   describe('download', () => {
      it('downloads and saves file', async () => {
         const fileContent = Buffer.from('test library content');

         const hash = require('crypto').createHash('sha256').update(fileContent).digest('hex');

         // Create a proper ArrayBuffer from the content
         const arrayBuffer = new Uint8Array(fileContent).buffer;

         mockFetch.mockResolvedValueOnce({
            ok: true,
            headers: { get: () => {
               return String(fileContent.length);
            } },
            arrayBuffer: async () => {
               return arrayBuffer;
            },
         });

         const destPath = path.join(tempDir, 'downloaded.libragen');

         await client.download(
            {
               name: 'test',
               version: '1.0.0',
               downloadURL: 'https://example.com/test.libragen',
               contentHash: `sha256:${hash}`,
               collection: 'test',
            },
            destPath
         );

         const content = await fs.readFile(destPath);

         expect(content.toString()).toBe('test library content');
      });

      it('throws on hash mismatch', async () => {
         const fileContent = Buffer.from('test library content');

         const arrayBuffer = new Uint8Array(fileContent).buffer;

         mockFetch.mockResolvedValueOnce({
            ok: true,
            headers: { get: () => {
               return null;
            } },
            arrayBuffer: async () => {
               return arrayBuffer;
            },
         });

         const destPath = path.join(tempDir, 'downloaded2.libragen');

         await expect(
            client.download(
               {
                  name: 'test',
                  version: '1.0.0',
                  downloadURL: 'https://example.com/test.libragen',
                  contentHash: 'sha256:wronghash',
                  collection: 'test',
               },
               destPath
            )
         )
            .rejects
            .toThrow('Hash mismatch');
      });

      it('skips hash verification when disabled', async () => {
         const fileContent = Buffer.from('test library content');

         const arrayBuffer = new Uint8Array(fileContent).buffer;

         mockFetch.mockResolvedValueOnce({
            ok: true,
            headers: { get: () => {
               return null;
            } },
            arrayBuffer: async () => {
               return arrayBuffer;
            },
         });

         const destPath = path.join(tempDir, 'downloaded3.libragen');

         await client.download(
            {
               name: 'test',
               version: '1.0.0',
               downloadURL: 'https://example.com/test.libragen',
               contentHash: 'sha256:wronghash',
               collection: 'test',
            },
            destPath,
            { verifyHash: false }
         );

         const content = await fs.readFile(destPath);

         expect(content.toString()).toBe('test library content');
      });

      it('calls progress callback', async () => {
         const fileContent = Buffer.from('test library content');

         const arrayBuffer = new Uint8Array(fileContent).buffer;

         mockFetch.mockResolvedValueOnce({
            ok: true,
            headers: { get: () => {
               return String(fileContent.length);
            } },
            arrayBuffer: async () => {
               return arrayBuffer;
            },
         });

         const destPath = path.join(tempDir, 'downloaded4.libragen');

         const onProgress = vi.fn();

         await client.download(
            {
               name: 'test',
               version: '1.0.0',
               downloadURL: 'https://example.com/test.libragen',
               contentHash: '',
               collection: 'test',
            },
            destPath,
            { verifyHash: false, onProgress }
         );

         expect(onProgress).toHaveBeenCalledWith({
            downloaded: fileContent.length,
            total: fileContent.length,
            percent: 100,
         });
      });
   });

   describe('cache', () => {
      it('clears cache', async () => {
         // Create some cache files
         const cacheDir = path.join(tempDir, 'cache');

         await fs.mkdir(cacheDir, { recursive: true });
         await fs.writeFile(path.join(cacheDir, 'test.json'), '{}');

         await client.clearCache();

         await expect(fs.access(cacheDir)).rejects.toThrow();
      });
   });
});

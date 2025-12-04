/**
 * Tests for the Library class
 */

/* eslint-disable @silvermine/silvermine/fluent-chaining */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { Library } from '../library.js';
import type { Chunk } from '../chunker.js';

describe('Library', () => {
   let tempDir: string,
       libraryPath: string;

   beforeEach(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'libragen-test-'));
      libraryPath = path.join(tempDir, 'test.libragen');
   });

   afterEach(async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
   });

   describe('create', () => {
      it('creates a new library file', async () => {
         const library = await Library.create(libraryPath, {
            name: 'test-library',
            description: 'A test library',
         });

         expect(library).toBeInstanceOf(Library);
         expect(library.getPath()).toBe(libraryPath);

         const metadata = library.getMetadata();

         expect(metadata.name).toBe('test-library');
         expect(metadata.description).toBe('A test library');
         expect(metadata.version).toBe('0.1.0');
         expect(metadata.createdAt).toBeDefined();

         await library.close();

         // Verify file was created
         const stats = await fs.stat(libraryPath);

         expect(stats.isFile()).toBe(true);
      });

      it('creates library with all options', async () => {
         const library = await Library.create(libraryPath, {
            name: 'full-library',
            version: '1.0.0',
            contentVersion: '2.0.0',
            contentVersionType: 'semver',
            displayName: 'Full Test Library',
            description: 'A fully configured library',
            agentDescription: 'Use this for testing',
            exampleQueries: [ 'How do I test?', 'What is testing?' ],
            keywords: [ 'test', 'example' ],
            programmingLanguages: [ 'typescript', 'javascript' ],
            textLanguages: [ 'en' ],
            frameworks: [ 'vitest' ],
            license: 'MIT',
            author: { name: 'Test Author', email: 'test@example.com' },
            repository: 'https://github.com/test/repo',
            embedding: { model: 'test-model', dimensions: 384 },
            chunking: { strategy: 'recursive', chunkSize: 500, chunkOverlap: 50 },
         });

         const metadata = library.getMetadata();

         expect(metadata.name).toBe('full-library');
         expect(metadata.version).toBe('1.0.0');
         expect(metadata.contentVersion).toBe('2.0.0');
         expect(metadata.contentVersionType).toBe('semver');
         expect(metadata.displayName).toBe('Full Test Library');
         expect(metadata.agentDescription).toBe('Use this for testing');
         expect(metadata.exampleQueries).toEqual([ 'How do I test?', 'What is testing?' ]);
         expect(metadata.keywords).toEqual([ 'test', 'example' ]);
         expect(metadata.programmingLanguages).toEqual([ 'typescript', 'javascript' ]);
         expect(metadata.textLanguages).toEqual([ 'en' ]);
         expect(metadata.frameworks).toEqual([ 'vitest' ]);
         expect(metadata.license).toBe('MIT');
         expect(metadata.author?.name).toBe('Test Author');
         expect(metadata.repository).toBe('https://github.com/test/repo');
         expect(metadata.embedding.model).toBe('test-model');
         expect(metadata.chunking.chunkSize).toBe(500);

         await library.close();
      });

      it('throws if file already exists', async () => {
         // Create the file first
         await fs.writeFile(libraryPath, '');

         await expect(
            Library.create(libraryPath, { name: 'test' })
         )
            .rejects
            .toThrow('already exists');
      });
   });

   describe('open', () => {
      it('opens an existing library', async () => {
         // Create a library first
         const created = await Library.create(libraryPath, {
            name: 'test-library',
            description: 'Test description',
         });

         await created.close();

         // Open it
         const opened = await Library.open(libraryPath);

         expect(opened.getMetadata().name).toBe('test-library');
         expect(opened.getMetadata().description).toBe('Test description');

         await opened.close();
      });

      it('throws if file does not exist', async () => {
         await expect(
            Library.open('/nonexistent/path.libragen')
         )
            .rejects
            .toThrow('not found');
      });
   });

   describe('validate', () => {
      it('validates a valid library', async () => {
         const library = await Library.create(libraryPath, {
            name: 'valid-library',
         });

         await library.close();

         const result = await Library.validate(libraryPath);

         expect(result.valid).toBe(true);
         expect(result.errors).toHaveLength(0);
      });

      it('returns error for nonexistent file', async () => {
         const result = await Library.validate('/nonexistent/path.libragen');

         expect(result.valid).toBe(false);
         expect(result.errors).toContain('Library file not found: /nonexistent/path.libragen');
      });

      it('warns about chunk count mismatch', async () => {
         const library = await Library.create(libraryPath, {
            name: 'test-library',
         });

         // Manually set incorrect chunk count in metadata
         const metadata = library.getMetadata();

         metadata.stats.chunkCount = 999;
         library.setMetadata(metadata);
         await library.close();

         const result = await Library.validate(libraryPath);

         expect(result.valid).toBe(true);
         expect(result.warnings.some((w) => {
            return w.includes('Chunk count mismatch');
         }))
            .toBe(true);
      });
   });

   describe('addChunks', () => {
      it('adds chunks to the library', async () => {
         const library = await Library.create(libraryPath, {
            name: 'test-library',
         });

         const chunks: Chunk[] = [
            {
               content: 'First chunk content',
               metadata: { sourceFile: 'file1.ts', startLine: 1, endLine: 5 },
            },
            {
               content: 'Second chunk content',
               metadata: { sourceFile: 'file1.ts', startLine: 6, endLine: 10 },
            },
         ];

         const embeddings = [
            new Float32Array(384).fill(0.1),
            new Float32Array(384).fill(0.2),
         ];

         const ids = library.addChunks(chunks, embeddings);

         expect(ids).toHaveLength(2);
         expect(ids[0]).toBe(1);
         expect(ids[1]).toBe(2);

         // Verify chunks were added
         const store = library.getStore();

         expect(store.getChunkCount()).toBe(2);

         const chunk1 = store.getChunk(1);

         expect(chunk1?.content).toBe('First chunk content');

         await library.close();
      });
   });

   describe('computeContentHash', () => {
      it('computes consistent hash for same content', async () => {
         const library = await Library.create(libraryPath, {
            name: 'test-library',
         });

         const chunks: Chunk[] = [
            { content: 'Hello world', metadata: { sourceFile: 'test.ts' } },
         ];

         library.addChunks(chunks, [ new Float32Array(384).fill(0.1) ]);

         const hash1 = await library.computeContentHash();

         const hash2 = await library.computeContentHash();

         expect(hash1).toBe(hash2);
         expect(hash1).toMatch(/^sha256:[a-f0-9]{64}$/);

         await library.close();
      });

      it('computes different hash for different content', async () => {
         // Create first library
         const library1 = await Library.create(libraryPath, {
            name: 'test-library-1',
         });

         library1.addChunks(
            [ { content: 'Content A', metadata: { sourceFile: 'a.ts' } } ],
            [ new Float32Array(384).fill(0.1) ]
         );

         const hash1 = await library1.computeContentHash();

         await library1.close();

         // Create second library
         const libraryPath2 = path.join(tempDir, 'test2.libragen');

         const library2 = await Library.create(libraryPath2, {
            name: 'test-library-2',
         });

         library2.addChunks(
            [ { content: 'Content B', metadata: { sourceFile: 'b.ts' } } ],
            [ new Float32Array(384).fill(0.1) ]
         );

         const hash2 = await library2.computeContentHash();

         await library2.close();

         expect(hash1).not.toBe(hash2);
      });
   });

   describe('finalize', () => {
      it('updates stats and computes hash', async () => {
         const library = await Library.create(libraryPath, {
            name: 'test-library',
         });

         const chunks: Chunk[] = [
            { content: 'Chunk 1', metadata: { sourceFile: 'file1.ts' } },
            { content: 'Chunk 2', metadata: { sourceFile: 'file2.ts' } },
         ];

         library.addChunks(chunks, [
            new Float32Array(384).fill(0.1),
            new Float32Array(384).fill(0.2),
         ]);

         await library.finalize();

         const metadata = library.getMetadata();

         expect(metadata.stats.chunkCount).toBe(2);
         expect(metadata.stats.fileSize).toBeGreaterThan(0);
         expect(metadata.contentHash).toMatch(/^sha256:[a-f0-9]{64}$/);

         await library.close();
      });
   });

   describe('verifyIntegrity', () => {
      it('returns true for valid library', async () => {
         const library = await Library.create(libraryPath, {
            name: 'test-library',
         });

         library.addChunks(
            [ { content: 'Test content', metadata: { sourceFile: 'test.ts' } } ],
            [ new Float32Array(384).fill(0.1) ]
         );

         await library.finalize();
         await library.close();

         // Reopen and verify
         const reopened = await Library.open(libraryPath);

         const isValid = await reopened.verifyIntegrity();

         expect(isValid).toBe(true);

         await reopened.close();
      });

      it('returns false when hash is missing', async () => {
         const library = await Library.create(libraryPath, {
            name: 'test-library',
         });

         // Don't call finalize, so no hash is set
         await library.close();

         const reopened = await Library.open(libraryPath);

         const isValid = await reopened.verifyIntegrity();

         expect(isValid).toBe(false);

         await reopened.close();
      });
   });

   describe('setMetadata', () => {
      it('updates metadata fields', async () => {
         const library = await Library.create(libraryPath, {
            name: 'original-name',
         });

         library.setMetadata({
            description: 'Updated description',
            keywords: [ 'new', 'keywords' ],
         });

         const metadata = library.getMetadata();

         expect(metadata.name).toBe('original-name'); // Unchanged
         expect(metadata.description).toBe('Updated description');
         expect(metadata.keywords).toEqual([ 'new', 'keywords' ]);

         await library.close();

         // Verify persistence
         const reopened = await Library.open(libraryPath);

         expect(reopened.getMetadata().description).toBe('Updated description');

         await reopened.close();
      });
   });
});

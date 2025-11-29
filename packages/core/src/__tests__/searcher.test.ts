import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Searcher } from '../searcher.js';
import { VectorStore } from '../store.js';
import { Embedder } from '../embedder.js';
import type { Chunk } from '../chunker.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// Mock the transformers module
vi.mock('@huggingface/transformers', () => {
   const mockPipeline = vi.fn().mockImplementation(async (texts: string | string[]) => {
      const textsArray = Array.isArray(texts) ? texts : [ texts ],
            embeddingDim = 384;

      // Generate deterministic mock embeddings based on text content
      const data = new Float32Array(textsArray.length * embeddingDim);

      for (let i = 0; i < textsArray.length; i++) {
         const text = textsArray[i],
               baseValue = (text.charCodeAt(0) % 100) / 100;

         for (let j = 0; j < embeddingDim; j++) {
            data[i * embeddingDim + j] = baseValue + (j % 10) / 100;
         }
      }

      return { data };
   });

   return {
      pipeline: vi.fn().mockResolvedValue(mockPipeline),
      env: {
         cacheDir: undefined as string | undefined,
         allowLocalModels: true,
      },
   };
});

describe('Searcher', () => {
   let searcher: Searcher,
       embedder: Embedder,
       store: VectorStore,
       tempDir: string,
       dbPath: string;

   beforeEach(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'searcher-test-'));
      dbPath = path.join(tempDir, 'test.db');
      embedder = new Embedder();
      store = new VectorStore(dbPath);
      store.initialize();
      searcher = new Searcher(embedder, store);
   });

   afterEach(async () => {
      store.close();
      await embedder.dispose();
      await fs.rm(tempDir, { recursive: true, force: true });
   });

   function createMockChunk(content: string, file: string = 'test.js'): Chunk {
      return {
         content,
         metadata: {
            sourceFile: file,
            startLine: 1,
            endLine: 5,
            language: 'js',
         },
      };
   }

   async function addTestChunks(): Promise<void> {
      const chunks = [
         createMockChunk('function hello() { return "world"; }'),
         createMockChunk('class Greeting { sayHello() {} }'),
         createMockChunk('const greeting = "hello world";'),
         createMockChunk('export function goodbye() { return "farewell"; }'),
      ];

      const embeddings = await embedder.embedBatch(chunks.map((c) => {
         return c.content;
      }));

      store.addChunks(chunks, embeddings);
   }

   describe('constructor', () => {
      it('creates a searcher with default config', () => {
         const s = new Searcher(embedder, store);

         expect(s.embedder).toBe(embedder);
         expect(s.store).toBe(store);
      });

      it('accepts custom configuration', () => {
         const s = new Searcher(embedder, store, {
            defaultK: 20,
            defaultHybridAlpha: 0.7,
         });

         expect(s.embedder).toBe(embedder);
      });
   });

   describe('search', () => {
      it('returns empty array for empty query', async () => {
         await addTestChunks();

         const results = await searcher.search({ query: '' });

         expect(results).toEqual([]);
      });

      it('returns empty array for whitespace-only query', async () => {
         await addTestChunks();

         const results = await searcher.search({ query: '   ' });

         expect(results).toEqual([]);
      });

      it('returns results for valid query', async () => {
         await addTestChunks();

         const results = await searcher.search({ query: 'hello' });

         expect(results.length).toBeGreaterThan(0);
      });

      it('respects k parameter', async () => {
         await addTestChunks();

         const results = await searcher.search({ query: 'function', k: 2 });

         expect(results.length).toBeLessThanOrEqual(2);
      });

      it('uses default k when not specified', async () => {
         // Add more chunks than default k
         for (let i = 0; i < 15; i++) {
            const chunk = createMockChunk(`function test${i}() {}`, `test${i}.js`),
                  embedding = await embedder.embed(chunk.content);

            store.addChunk(chunk, embedding);
         }

         const results = await searcher.search({ query: 'function' });

         // Default k is 10
         expect(results.length).toBe(10);
      });

      it('performs keyword-only search when hybridAlpha is 0', async () => {
         await addTestChunks();

         const results = await searcher.search({
            query: 'hello',
            hybridAlpha: 0,
         });

         expect(results.length).toBeGreaterThan(0);
      });

      it('performs vector-only search when hybridAlpha is 1', async () => {
         await addTestChunks();

         const results = await searcher.search({
            query: 'hello',
            hybridAlpha: 1,
         });

         expect(results.length).toBeGreaterThan(0);
      });

      it('performs hybrid search when hybridAlpha is between 0 and 1', async () => {
         await addTestChunks();

         const results = await searcher.search({
            query: 'hello',
            hybridAlpha: 0.5,
         });

         expect(results.length).toBeGreaterThan(0);
      });

      it('filters by content version', async () => {
         const chunk1 = createMockChunk('function v1()'),
               chunk2 = createMockChunk('function v2()'),
               embedding1 = await embedder.embed(chunk1.content),
               embedding2 = await embedder.embed(chunk2.content);

         store.addChunk(chunk1, embedding1, { contentVersion: '1.0.0' });
         store.addChunk(chunk2, embedding2, { contentVersion: '2.0.0' });

         const results = await searcher.search({
            query: 'function',
            contentVersion: '1.0.0',
         });

         expect(results.length).toBe(1);
         expect(results[0].contentVersion).toBe('1.0.0');
      });
   });

   describe('vectorSearch', () => {
      it('returns results using vector similarity only', async () => {
         await addTestChunks();

         const results = await searcher.vectorSearch('hello');

         expect(results.length).toBeGreaterThan(0);
      });

      it('respects k parameter', async () => {
         await addTestChunks();

         const results = await searcher.vectorSearch('hello', 2);

         expect(results.length).toBeLessThanOrEqual(2);
      });

      it('filters by content version', async () => {
         const chunk = createMockChunk('test content'),
               embedding = await embedder.embed(chunk.content);

         store.addChunk(chunk, embedding, { contentVersion: '1.0.0' });

         const results = await searcher.vectorSearch('test', 10, {
            contentVersion: '1.0.0',
         });

         expect(results.length).toBe(1);
      });
   });

   describe('keywordSearch', () => {
      it('returns results using BM25 only', async () => {
         await addTestChunks();

         const results = searcher.keywordSearch('hello');

         expect(results.length).toBeGreaterThan(0);
      });

      it('returns empty array for empty query', async () => {
         await addTestChunks();

         const results = searcher.keywordSearch('');

         expect(results).toEqual([]);
      });

      it('respects k parameter', async () => {
         await addTestChunks();

         const results = searcher.keywordSearch('function', 2);

         expect(results.length).toBeLessThanOrEqual(2);
      });

      it('filters by content version', async () => {
         const chunk = createMockChunk('hello world'),
               embedding = await embedder.embed(chunk.content);

         store.addChunk(chunk, embedding, { contentVersion: '1.0.0' });

         const results = searcher.keywordSearch('hello', 10, {
            contentVersion: '1.0.0',
         });

         expect(results.length).toBe(1);
      });
   });

   describe('accessors', () => {
      it('exposes embedder', () => {
         expect(searcher.embedder).toBe(embedder);
      });

      it('exposes store', () => {
         expect(searcher.store).toBe(store);
      });

      it('exposes reranker when configured', () => {
         const mockReranker = {
            rerank: vi.fn(),
            isInitialized: true,
         };

         const searcherWithReranker = new Searcher(embedder, store, {
            reranker: mockReranker as any,
         });

         expect(searcherWithReranker.reranker).toBe(mockReranker);
         expect(searcherWithReranker.hasReranker).toBe(true);
      });

      it('returns null reranker when not configured', () => {
         expect(searcher.reranker).toBeNull();
         expect(searcher.hasReranker).toBe(false);
      });
   });

   describe('reranking', () => {
      it('applies reranking when rerank option is true and reranker is configured', async () => {
         await addTestChunks();

         const mockReranker = {
            rerank: vi.fn().mockResolvedValue([
               { index: 2, document: 'doc2', score: 0.9 },
               { index: 0, document: 'doc0', score: 0.7 },
               { index: 1, document: 'doc1', score: 0.5 },
            ]),
            isInitialized: true,
         };

         const searcherWithReranker = new Searcher(embedder, store, {
            reranker: mockReranker as any,
         });

         const results = await searcherWithReranker.search({
            query: 'hello',
            rerank: true,
         });

         expect(mockReranker.rerank).toHaveBeenCalled();
         expect(results.length).toBeGreaterThan(0);
      });

      it('does not apply reranking when rerank option is false', async () => {
         await addTestChunks();

         const mockReranker = {
            rerank: vi.fn(),
            isInitialized: true,
         };

         const searcherWithReranker = new Searcher(embedder, store, {
            reranker: mockReranker as any,
         });

         await searcherWithReranker.search({
            query: 'hello',
            rerank: false,
         });

         expect(mockReranker.rerank).not.toHaveBeenCalled();
      });

      it('does not apply reranking when no reranker is configured', async () => {
         await addTestChunks();

         // Should not throw even with rerank: true but no reranker
         const results = await searcher.search({
            query: 'hello',
            rerank: true,
         });

         expect(results.length).toBeGreaterThan(0);
      });

      it('uses reranker scores in results', async () => {
         await addTestChunks();

         const mockReranker = {
            rerank: vi.fn().mockResolvedValue([
               { index: 0, document: 'doc0', score: 99.5 },
               { index: 1, document: 'doc1', score: 50.0 },
            ]),
            isInitialized: true,
         };

         const searcherWithReranker = new Searcher(embedder, store, {
            reranker: mockReranker as any,
         });

         const results = await searcherWithReranker.search({
            query: 'hello',
            k: 2,
            rerank: true,
         });

         // First result should have the higher reranker score
         expect(results[0].score).toBe(99.5);
      });
   });
});

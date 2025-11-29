import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { VectorStore } from '../store.js';
import type { Chunk } from '../chunker.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('VectorStore', () => {
   let store: VectorStore,
       tempDir: string,
       dbPath: string;

   beforeEach(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'store-test-'));
      dbPath = path.join(tempDir, 'test.db');
      store = new VectorStore(dbPath);
   });

   afterEach(async () => {
      store.close();
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

   function createMockEmbedding(): Float32Array {
      // Create a normalized random embedding
      const embedding = new Float32Array(384);

      for (let i = 0; i < 384; i++) {
         embedding[i] = Math.random() - 0.5;
      }

      // Normalize
      const magnitude = Math.sqrt(embedding.reduce((sum, val) => {
         return sum + val * val;
      }, 0));

      for (let i = 0; i < 384; i++) {
         embedding[i] /= magnitude;
      }

      return embedding;
   }

   describe('initialization', () => {
      it('creates a new database file', async () => {
         store.initialize();

         const exists = await fs.access(dbPath)
            .then(() => {
               return true;
            })
            .catch(() => {
               return false;
            });

         expect(exists).toBe(true);
      });

      it('isInitialized returns false before initialization', () => {
         expect(store.isInitialized()).toBe(false);
      });

      it('isInitialized returns true after initialization', () => {
         store.initialize();

         expect(store.isInitialized()).toBe(true);
      });

      it('is idempotent', () => {
         store.initialize();
         store.initialize();

         expect(store.isInitialized()).toBe(true);
      });
   });

   describe('addChunk', () => {
      it('returns a chunk ID', () => {
         store.initialize();

         const chunk = createMockChunk('const x = 1;'),
               embedding = createMockEmbedding();

         const id = store.addChunk(chunk, embedding);

         expect(id).toBeGreaterThan(0);
      });

      it('stores the chunk content', () => {
         store.initialize();

         const chunk = createMockChunk('const x = 1;'),
               embedding = createMockEmbedding(),
               id = store.addChunk(chunk, embedding);

         const stored = store.getChunk(id);

         expect(stored).toBeDefined();
         expect(stored?.content).toBe('const x = 1;');
      });

      it('stores metadata', () => {
         store.initialize();

         const chunk = createMockChunk('const x = 1;', 'src/index.js'),
               embedding = createMockEmbedding();

         const id = store.addChunk(chunk, embedding, {
            sourceType: 'git',
            contentVersion: '1.0.0',
         });

         const stored = store.getChunk(id);

         expect(stored?.sourceFile).toBe('src/index.js');
         expect(stored?.sourceType).toBe('git');
         expect(stored?.contentVersion).toBe('1.0.0');
         expect(stored?.language).toBe('js');
      });

      it('throws if not initialized', () => {
         const chunk = createMockChunk('test'),
               embedding = createMockEmbedding();

         expect(() => { return store.addChunk(chunk, embedding); })
            .toThrow('not initialized');
      });
   });

   describe('addChunks', () => {
      it('adds multiple chunks in a transaction', () => {
         store.initialize();

         const chunks = [
            createMockChunk('const a = 1;'),
            createMockChunk('const b = 2;'),
            createMockChunk('const c = 3;'),
         ];

         const embeddings = chunks.map(() => {
            return createMockEmbedding();
         });

         const ids = store.addChunks(chunks, embeddings);

         expect(ids.length).toBe(3);
         expect(store.getChunkCount()).toBe(3);
      });

      it('throws if chunks and embeddings have different lengths', () => {
         store.initialize();

         const chunks = [ createMockChunk('test') ];

         const embeddings = [ createMockEmbedding(), createMockEmbedding() ];

         expect(() => { return store.addChunks(chunks, embeddings); })
            .toThrow('same length');
      });
   });

   describe('vectorSearch', () => {
      it('returns results ordered by similarity', () => {
         store.initialize();

         // Create chunks with specific embeddings
         const embedding1 = new Float32Array(384).fill(0);

         embedding1[0] = 1;

         const embedding2 = new Float32Array(384).fill(0);

         embedding2[0] = 0.9;
         embedding2[1] = 0.1;

         const embedding3 = new Float32Array(384).fill(0);

         embedding3[0] = 0.5;
         embedding3[1] = 0.5;

         store.addChunk(createMockChunk('first'), embedding1);
         store.addChunk(createMockChunk('second'), embedding2);
         store.addChunk(createMockChunk('third'), embedding3);

         // Query with embedding similar to first
         const queryEmbedding = new Float32Array(384).fill(0);

         queryEmbedding[0] = 1;

         const results = store.vectorSearch(queryEmbedding, 3);

         expect(results.length).toBe(3);
         // First result should be most similar
         expect(results[0].content).toBe('first');
      });

      it('respects k parameter', () => {
         store.initialize();

         for (let i = 0; i < 10; i++) {
            store.addChunk(createMockChunk(`chunk ${i}`), createMockEmbedding());
         }

         const results = store.vectorSearch(createMockEmbedding(), 5);

         expect(results.length).toBe(5);
      });

      it('filters by content version', () => {
         store.initialize();

         store.addChunk(createMockChunk('v1 chunk'), createMockEmbedding(), {
            contentVersion: '1.0.0',
         });
         store.addChunk(createMockChunk('v2 chunk'), createMockEmbedding(), {
            contentVersion: '2.0.0',
         });

         const results = store.vectorSearch(createMockEmbedding(), 10, {
            contentVersion: '1.0.0',
         });

         expect(results.length).toBe(1);
         expect(results[0].content).toBe('v1 chunk');
      });
   });

   describe('keywordSearch', () => {
      it('finds chunks by keyword', () => {
         store.initialize();

         store.addChunk(createMockChunk('function hello world'), createMockEmbedding());
         store.addChunk(createMockChunk('class goodbye world'), createMockEmbedding());

         const results = store.keywordSearch('hello', 10);

         expect(results.length).toBe(1);
         expect(results[0].content).toContain('hello');
      });

      it('returns empty array for no matches', () => {
         store.initialize();

         store.addChunk(createMockChunk('const x = 1;'), createMockEmbedding());

         const results = store.keywordSearch('nonexistent', 10);

         expect(results).toEqual([]);
      });

      it('respects k parameter', () => {
         store.initialize();

         for (let i = 0; i < 10; i++) {
            store.addChunk(createMockChunk(`function test${i}`), createMockEmbedding());
         }

         const results = store.keywordSearch('function', 5);

         expect(results.length).toBe(5);
      });
   });

   describe('hybridSearch', () => {
      it('combines vector and keyword results', () => {
         store.initialize();

         // Create chunks that will match differently for vector vs keyword
         const embedding1 = new Float32Array(384).fill(0);

         embedding1[0] = 1;

         const embedding2 = new Float32Array(384).fill(0);

         embedding2[1] = 1;

         store.addChunk(createMockChunk('hello world'), embedding1);
         store.addChunk(createMockChunk('goodbye world'), embedding2);

         // Query that matches first chunk by vector but second by keyword
         const queryEmbedding = new Float32Array(384).fill(0);

         queryEmbedding[0] = 1;

         const results = store.hybridSearch(queryEmbedding, 'goodbye', 2);

         expect(results.length).toBe(2);
         // Both should appear in results due to RRF fusion
      });

      it('returns results with fused scores', () => {
         store.initialize();

         store.addChunk(createMockChunk('function test'), createMockEmbedding());

         const results = store.hybridSearch(createMockEmbedding(), 'function', 1);

         expect(results.length).toBe(1);
         expect(results[0].score).toBeGreaterThan(0);
      });
   });

   describe('metadata operations', () => {
      it('sets and gets metadata', () => {
         store.initialize();

         store.setMeta('name', 'test-library');
         store.setMeta('version', '1.0.0');

         expect(store.getMeta('name')).toBe('test-library');
         expect(store.getMeta('version')).toBe('1.0.0');
      });

      it('returns null for missing metadata', () => {
         store.initialize();

         expect(store.getMeta('nonexistent')).toBeNull();
      });

      it('updates existing metadata', () => {
         store.initialize();

         store.setMeta('version', '1.0.0');
         store.setMeta('version', '2.0.0');

         expect(store.getMeta('version')).toBe('2.0.0');
      });

      it('gets all metadata', () => {
         store.initialize();

         store.setMeta('name', 'test');
         store.setMeta('version', '1.0.0');

         const all = store.getAllMeta();

         expect(all).toEqual({
            name: 'test',
            version: '1.0.0',
         });
      });
   });

   describe('getChunkCount', () => {
      it('returns 0 for empty store', () => {
         store.initialize();

         expect(store.getChunkCount()).toBe(0);
      });

      it('returns correct count after adding chunks', () => {
         store.initialize();

         store.addChunk(createMockChunk('a'), createMockEmbedding());
         store.addChunk(createMockChunk('b'), createMockEmbedding());

         expect(store.getChunkCount()).toBe(2);
      });
   });
});

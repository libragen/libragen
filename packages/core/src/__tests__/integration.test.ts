/**
 * End-to-end integration tests using real Transformers.js embeddings.
 *
 * These tests verify the full pipeline works with actual model inference,
 * not mocked embeddings. They are slower but ensure real-world functionality.
 *
 * @vitest-environment node
 */

/* eslint-disable @typescript-eslint/naming-convention */
/* eslint-disable @silvermine/silvermine/fluent-chaining */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Embedder } from '../embedder.js';
import { Chunker } from '../chunker.js';
import { VectorStore } from '../store.js';
import { Searcher } from '../searcher.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { fileURLToPath } from 'url';

// eslint-disable-next-line @typescript-eslint/naming-convention
const currentDir = path.dirname(fileURLToPath(import.meta.url));

const FIXTURES_DIR = path.join(currentDir, 'fixtures');

describe('Integration Tests (Real Embeddings)', () => {
   let embedder: Embedder,
       chunker: Chunker,
       store: VectorStore,
       searcher: Searcher,
       tempDir: string,
       dbPath: string;

   beforeAll(async () => {
      // Create temp directory for database
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'libragen-integration-'));
      dbPath = path.join(tempDir, 'test.libragen');

      // Initialize components
      embedder = new Embedder();
      chunker = new Chunker({ chunkSize: 500, chunkOverlap: 50 });
      store = new VectorStore(dbPath);
      store.initialize();
      searcher = new Searcher(embedder, store);

      // Pre-initialize embedder (downloads model if needed)
      await embedder.initialize();
   }, 120000); // 2 minute timeout for model download

   afterAll(async () => {
      store.close();
      await embedder.dispose();
      await fs.rm(tempDir, { recursive: true, force: true });
   });

   describe('Embedder with real model', () => {
      it('generates 384-dimensional embeddings', async () => {
         const embedding = await embedder.embed('Hello world');

         expect(embedding).toBeInstanceOf(Float32Array);
         expect(embedding.length).toBe(384);
      });

      it('produces similar embeddings for semantically similar text', async () => {
         const embedding1 = await embedder.embed('How do I calculate factorial?'),
               embedding2 = await embedder.embed('What is the factorial function?'),
               embedding3 = await embedder.embed('The weather is nice today');

         const similarity12 = cosineSimilarity(embedding1, embedding2),
               similarity13 = cosineSimilarity(embedding1, embedding3);

         // Similar questions should have higher similarity
         expect(similarity12).toBeGreaterThan(similarity13);
         expect(similarity12).toBeGreaterThan(0.7); // High similarity
         expect(similarity13).toBeLessThan(0.5); // Low similarity
      });

      it('handles batch embedding correctly', async () => {
         const texts = [
            'function factorial(n) { return n <= 1 ? 1 : n * factorial(n-1); }',
            'def is_prime(n): return n > 1 and all(n % i for i in range(2, int(n**0.5)+1))',
            'The quick brown fox jumps over the lazy dog',
         ];

         const embeddings = await embedder.embedBatch(texts);

         expect(embeddings.length).toBe(3);
         embeddings.forEach((emb) => {
            expect(emb.length).toBe(384);
         });
      });
   });

   describe('Chunker with real files', () => {
      it('chunks TypeScript file correctly', async () => {
         const filePath = path.join(FIXTURES_DIR, 'sample-utils.ts'),
               chunks = await chunker.chunkFile(filePath);

         expect(chunks.length).toBeGreaterThan(0);
         chunks.forEach((chunk) => {
            expect(chunk.content.length).toBeGreaterThan(0);
            expect(chunk.metadata.sourceFile).toBe(filePath);
            expect(chunk.metadata.language).toBe('js'); // TS uses JS splitter
         });
      });

      it('chunks Python file correctly', async () => {
         const filePath = path.join(FIXTURES_DIR, 'sample-class.py'),
               chunks = await chunker.chunkFile(filePath);

         expect(chunks.length).toBeGreaterThan(0);
         chunks.forEach((chunk) => {
            expect(chunk.content.length).toBeGreaterThan(0);
            expect(chunk.metadata.language).toBe('python');
         });
      });

      it('chunks Markdown file correctly', async () => {
         const filePath = path.join(FIXTURES_DIR, 'sample-readme.md'),
               chunks = await chunker.chunkFile(filePath);

         expect(chunks.length).toBeGreaterThan(0);
         chunks.forEach((chunk) => {
            expect(chunk.metadata.language).toBe('markdown');
         });
      });

      it('chunks directory with multiple file types', async () => {
         const chunks = await chunker.chunkDirectory(FIXTURES_DIR);

         expect(chunks.length).toBeGreaterThan(0);

         // Should have chunks from multiple languages
         const languages = new Set(chunks.map((c) => {
            return c.metadata.language;
         }));

         expect(languages.has('js')).toBe(true); // TypeScript
         expect(languages.has('python')).toBe(true);
         expect(languages.has('markdown')).toBe(true);
      });
   });

   describe('Full pipeline: chunk -> embed -> store -> search', () => {
      beforeAll(async () => {
         // Index all fixture files
         const chunks = await chunker.chunkDirectory(FIXTURES_DIR);

         // Embed all chunks
         const contents = chunks.map((c) => {
            return c.content;
         });

         const embeddings = await embedder.embedBatch(contents);

         // Store chunks with embeddings
         store.addChunks(chunks, embeddings);
      }, 60000); // 1 minute timeout for embedding

      it('finds relevant code for factorial query', async () => {
         const results = await searcher.search({
            query: 'How do I calculate factorial?',
            k: 5,
         });

         expect(results.length).toBeGreaterThan(0);

         // Top result should contain factorial-related code
         const topContent = results[0].content.toLowerCase();

         expect(
            topContent.includes('factorial') ||
            topContent.includes('n * factorial') ||
            topContent.includes('n - 1')
         )
            .toBe(true);
      });

      it('finds relevant code for prime number query', async () => {
         const results = await searcher.search({
            query: 'Check if a number is prime',
            k: 5,
         });

         expect(results.length).toBeGreaterThan(0);

         // Should find prime-related code
         const allContent = results.map((r) => {
            return r.content.toLowerCase();
         })
            .join(' ');

         expect(allContent.includes('prime')).toBe(true);
      });

      it('finds relevant documentation for API reference query', async () => {
         const results = await searcher.search({
            query: 'API documentation for fibonacci function',
            k: 5,
         });

         expect(results.length).toBeGreaterThan(0);

         // Should find fibonacci-related content
         const allContent = results.map((r) => {
            return r.content.toLowerCase();
         })
            .join(' ');

         expect(allContent.includes('fibonacci')).toBe(true);
      });

      it('finds Python class definitions', async () => {
         const results = await searcher.search({
            query: 'Python stack data structure implementation',
            k: 5,
         });

         expect(results.length).toBeGreaterThan(0);

         // Should find Stack class
         const allContent = results.map((r) => {
            return r.content.toLowerCase();
         })
            .join(' ');

         expect(
            allContent.includes('stack') ||
            allContent.includes('push') ||
            allContent.includes('pop')
         )
            .toBe(true);
      });

      it('keyword search finds exact matches', () => {
         const results = searcher.keywordSearch('debounce', 5);

         expect(results.length).toBeGreaterThan(0);
         expect(results[0].content.toLowerCase()).toContain('debounce');
      });

      it('vector search finds semantically similar content', async () => {
         const results = await searcher.vectorSearch(
            'delay function execution until user stops typing',
            5
         );

         expect(results.length).toBeGreaterThan(0);

         // Should find debounce-related code (semantically similar)
         const allContent = results.map((r) => {
            return r.content.toLowerCase();
         })
            .join(' ');

         expect(
            allContent.includes('debounce') ||
            allContent.includes('delay') ||
            allContent.includes('timeout')
         )
            .toBe(true);
      });

      it('hybrid search combines vector and keyword results', async () => {
         const results = await searcher.search({
            query: 'calculate area of shapes',
            k: 5,
            hybridAlpha: 0.5,
         });

         expect(results.length).toBeGreaterThan(0);

         // Should find shape-related code
         const allContent = results.map((r) => {
            return r.content.toLowerCase();
         })
            .join(' ');

         expect(
            allContent.includes('area') ||
            allContent.includes('shape') ||
            allContent.includes('rectangle') ||
            allContent.includes('circle')
         )
            .toBe(true);
      });
   });

   describe('Store persistence', () => {
      it('persists data across store instances', async () => {
         // Close current store
         const chunkCount = store.getChunkCount();

         store.close();

         // Reopen store
         const newStore = new VectorStore(dbPath);

         newStore.initialize();

         expect(newStore.getChunkCount()).toBe(chunkCount);

         // Search should still work
         const newSearcher = new Searcher(embedder, newStore);

         const results = await newSearcher.search({
            query: 'factorial',
            k: 3,
         });

         expect(results.length).toBeGreaterThan(0);

         newStore.close();

         // Reopen original store for cleanup
         store = new VectorStore(dbPath);
         store.initialize();
         searcher = new Searcher(embedder, store);
      });
   });
});

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
   let dotProduct = 0,
       normA = 0,
       normB = 0;

   for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
   }

   return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

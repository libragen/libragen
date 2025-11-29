import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Embedder } from '../embedder.js';
import type { EmbedProgress } from '../embedder.js';

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

describe('Embedder', () => {
   let embedder: Embedder;

   beforeEach(() => {
      embedder = new Embedder();
      vi.clearAllMocks();
   });

   afterEach(async () => {
      await embedder.dispose();
   });

   describe('constructor', () => {
      it('uses default configuration when none provided', () => {
         const e = new Embedder();

         expect(e.model).toBe('Xenova/bge-small-en-v1.5');
         expect(e.dimensions).toBe(384);
      });

      it('accepts custom configuration', () => {
         const e = new Embedder({
            model: 'custom/model',
            quantization: 'fp16',
            batchSize: 16,
         });

         expect(e.model).toBe('custom/model');
      });
   });

   describe('initialization', () => {
      it('is not initialized before first use', () => {
         expect(embedder.isInitialized()).toBe(false);
      });

      it('initializes on first embed call', async () => {
         expect(embedder.isInitialized()).toBe(false);
         await embedder.embed('test');
         expect(embedder.isInitialized()).toBe(true);
      });

      it('can be explicitly initialized', async () => {
         await embedder.initialize();
         expect(embedder.isInitialized()).toBe(true);
      });

      it('does not initialize twice', async () => {
         const { pipeline } = await import('@huggingface/transformers');

         await embedder.initialize();
         await embedder.initialize();

         expect(pipeline).toHaveBeenCalledTimes(1);
      });
   });

   describe('embed', () => {
      it('returns a Float32Array', async () => {
         const result = await embedder.embed('hello world');

         expect(result).toBeInstanceOf(Float32Array);
      });

      it('returns correct dimensions', async () => {
         const result = await embedder.embed('hello world');

         expect(result.length).toBe(384);
      });

      it('produces consistent embeddings for same input', async () => {
         const result1 = await embedder.embed('test text'),
               result2 = await embedder.embed('test text');

         expect(Array.from(result1)).toEqual(Array.from(result2));
      });

      it('produces different embeddings for different inputs', async () => {
         const result1 = await embedder.embed('hello'),
               result2 = await embedder.embed('world');

         // At least some values should differ
         const hasDifference = Array.from(result1).some((v, i) => {
            return v !== result2[i];
         });

         expect(hasDifference).toBe(true);
      });
   });

   describe('embedBatch', () => {
      it('returns empty array for empty input', async () => {
         const result = await embedder.embedBatch([]);

         expect(result).toEqual([]);
      });

      it('returns array of Float32Arrays', async () => {
         const result = await embedder.embedBatch([ 'hello', 'world' ]);

         expect(result.length).toBe(2);
         expect(result[0]).toBeInstanceOf(Float32Array);
         expect(result[1]).toBeInstanceOf(Float32Array);
      });

      it('returns correct dimensions for each embedding', async () => {
         const result = await embedder.embedBatch([ 'a', 'b', 'c' ]);

         for (const embedding of result) {
            expect(embedding.length).toBe(384);
         }
      });

      it('calls progress callback with correct information', async () => {
         const onProgress = vi.fn(),
               texts = [ 'a', 'b', 'c', 'd', 'e' ],
               batchEmbedder = new Embedder({ batchSize: 2 });

         await batchEmbedder.embedBatch(texts, onProgress);

         // Should have 3 batches for 5 items with batch size 2
         expect(onProgress).toHaveBeenCalledTimes(3);

         // Check first batch progress
         expect(onProgress).toHaveBeenNthCalledWith(1, {
            batch: 0,
            totalBatches: 3,
            processed: 2,
            total: 5,
         } as EmbedProgress);

         // Check last batch progress
         expect(onProgress).toHaveBeenNthCalledWith(3, {
            batch: 2,
            totalBatches: 3,
            processed: 5,
            total: 5,
         } as EmbedProgress);

         await batchEmbedder.dispose();
      });

      it('handles batch sizes larger than input', async () => {
         const texts = [ 'a', 'b' ],
               result = await embedder.embedBatch(texts);

         expect(result.length).toBe(2);
      });
   });

   describe('dispose', () => {
      it('marks embedder as not initialized after dispose', async () => {
         await embedder.initialize();
         expect(embedder.isInitialized()).toBe(true);

         await embedder.dispose();
         expect(embedder.isInitialized()).toBe(false);
      });

      it('is safe to call multiple times', async () => {
         await embedder.initialize();
         await embedder.dispose();
         await embedder.dispose();

         expect(embedder.isInitialized()).toBe(false);
      });
   });
});

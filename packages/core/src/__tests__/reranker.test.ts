import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Reranker } from '../reranker.js';

// Mock the transformers module
vi.mock('@huggingface/transformers', () => {
   // Mock tokenizer that returns mock input tensors
   const mockTokenizer = vi.fn().mockImplementation(
      (texts: string[]) => {
         const batchSize = texts.length;

         return {
            input_ids: { data: new BigInt64Array(batchSize * 10), dims: [ batchSize, 10 ] },
            attention_mask: { data: new BigInt64Array(batchSize * 10), dims: [ batchSize, 10 ] },
         };
      }
   );

   // Mock model that returns logits based on text content. Higher scores for
   // documents containing query-related terms
   const mockModel = vi.fn().mockImplementation(async (inputs: unknown) => {
      // Get batch size from inputs
      const inputIds = (inputs as { input_ids: { dims: number[] } }).input_ids,
            batchSize = inputIds.dims[0];

      // Generate mock scores - in real usage these would be based on
      // query-document relevance. For testing, use deterministic scores.
      const logits = new Float32Array(batchSize);

      for (let i = 0; i < batchSize; i++) {
         // Decreasing scores for testing sort order
         logits[i] = 10 - i;
      }

      return { logits: { data: logits } };
   });

   return {
      AutoTokenizer: {
         from_pretrained: vi.fn().mockResolvedValue(mockTokenizer),
      },
      AutoModelForSequenceClassification: {
         from_pretrained: vi.fn().mockResolvedValue(mockModel),
      },
      env: {
         allowLocalModels: true,
      },
   };
});

describe('Reranker', () => {
   let reranker: Reranker;

   beforeEach(() => {
      reranker = new Reranker();
   });

   afterEach(async () => {
      await reranker.dispose();
   });

   describe('constructor', () => {
      it('creates a reranker with default config', () => {
         const r = new Reranker();

         expect(r.config.model).toBe('Xenova/bge-reranker-base');
         expect(r.config.dtype).toBe('q8');
         expect(r.config.maxLength).toBe(512);
         expect(r.config.batchSize).toBe(32);
      });

      it('accepts custom configuration', () => {
         const r = new Reranker({
            model: 'custom/model',
            dtype: 'fp32',
            maxLength: 256,
            batchSize: 16,
         });

         expect(r.config.model).toBe('custom/model');
         expect(r.config.dtype).toBe('fp32');
         expect(r.config.maxLength).toBe(256);
         expect(r.config.batchSize).toBe(16);
      });
   });

   describe('initialize', () => {
      it('initializes the model and tokenizer', async () => {
         expect(reranker.isInitialized).toBe(false);

         await reranker.initialize();

         expect(reranker.isInitialized).toBe(true);
      });

      it('only initializes once on multiple calls', async () => {
         const { AutoTokenizer, AutoModelForSequenceClassification } = await import(
            '@huggingface/transformers'
         );

         // Clear previous call counts
         vi.mocked(AutoTokenizer.from_pretrained).mockClear();
         vi.mocked(AutoModelForSequenceClassification.from_pretrained).mockClear();

         // Create a fresh reranker for this test
         const freshReranker = new Reranker();

         await freshReranker.initialize();
         await freshReranker.initialize();
         await freshReranker.initialize();

         expect(AutoTokenizer.from_pretrained).toHaveBeenCalledTimes(1);
         expect(AutoModelForSequenceClassification.from_pretrained).toHaveBeenCalledTimes(1);

         await freshReranker.dispose();
      });
   });

   describe('rerank', () => {
      it('returns empty array for empty documents', async () => {
         const results = await reranker.rerank('query', []);

         expect(results).toEqual([]);
      });

      it('returns reranked results with scores', async () => {
         const documents = [
            'First document about pandas',
            'Second document about bears',
            'Third document about animals',
         ];

         const results = await reranker.rerank('what is a panda?', documents);

         expect(results).toHaveLength(3);
         expect(results[0]).toHaveProperty('index');
         expect(results[0]).toHaveProperty('document');
         expect(results[0]).toHaveProperty('score');
      });

      it('sorts results by score in descending order', async () => {
         const documents = [ 'doc1', 'doc2', 'doc3' ];

         const results = await reranker.rerank('query', documents);

         // Verify descending order
         for (let i = 1; i < results.length; i++) {
            expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
         }
      });

      it('respects topK parameter', async () => {
         const documents = [ 'doc1', 'doc2', 'doc3', 'doc4', 'doc5' ];

         const results = await reranker.rerank('query', documents, 2);

         expect(results).toHaveLength(2);
      });

      it('returns all results when topK exceeds document count', async () => {
         const documents = [ 'doc1', 'doc2' ];

         const results = await reranker.rerank('query', documents, 10);

         expect(results).toHaveLength(2);
      });

      it('preserves original document content in results', async () => {
         const documents = [ 'unique content A', 'unique content B' ];

         const results = await reranker.rerank('query', documents);

         const returnedDocs = results.map((r) => {
            return r.document;
         });

         expect(returnedDocs).toContain('unique content A');
         expect(returnedDocs).toContain('unique content B');
      });

      it('preserves original indices in results', async () => {
         const documents = [ 'doc0', 'doc1', 'doc2' ];

         const results = await reranker.rerank('query', documents);

         const indices = results.map((r) => {
            return r.index;
         });

         expect(indices).toContain(0);
         expect(indices).toContain(1);
         expect(indices).toContain(2);
      });

      it('calls progress callback during processing', async () => {
         const documents = [ 'doc1', 'doc2', 'doc3' ],
               progressCallback = vi.fn();

         await reranker.rerank('query', documents, undefined, progressCallback);

         expect(progressCallback).toHaveBeenCalled();
         expect(progressCallback).toHaveBeenCalledWith(
            expect.objectContaining({
               currentBatch: expect.any(Number),
               totalBatches: expect.any(Number),
               processedCount: expect.any(Number),
               totalCount: 3,
            })
         );
      });

      it('processes large document sets in batches', async () => {
         // Create more documents than batch size
         const documents = Array.from({ length: 50 }, (_, i) => {
            return `document ${i}`;
         });

         const progressCallback = vi.fn();

         // Use small batch size to test batching
         const smallBatchReranker = new Reranker({ batchSize: 10 });

         await smallBatchReranker.rerank('query', documents, undefined, progressCallback);

         // Should have multiple batches (50 docs / 10 batch size = 5 batches)
         expect(progressCallback).toHaveBeenCalledTimes(5);

         await smallBatchReranker.dispose();
      });
   });

   describe('score', () => {
      it('returns a single score for query-document pair', async () => {
         const score = await reranker.score('what is a panda?', 'The panda is a bear.');

         expect(typeof score).toBe('number');
      });
   });

   describe('dispose', () => {
      it('cleans up resources', async () => {
         await reranker.initialize();
         expect(reranker.isInitialized).toBe(true);

         await reranker.dispose();
         expect(reranker.isInitialized).toBe(false);
      });

      it('can be called multiple times safely', async () => {
         await reranker.initialize();

         await reranker.dispose();
         await reranker.dispose();
         await reranker.dispose();

         expect(reranker.isInitialized).toBe(false);
      });

      it('allows re-initialization after dispose', async () => {
         await reranker.initialize();
         await reranker.dispose();

         // Should be able to initialize again
         await reranker.initialize();
         expect(reranker.isInitialized).toBe(true);
      });
   });
});

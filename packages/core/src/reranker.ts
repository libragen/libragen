/**
 * Reranker module for cross-encoder reranking
 *
 * Uses a cross-encoder model to rerank search results by computing
 * relevance scores for query-document pairs. This provides more accurate
 * ranking than bi-encoder similarity alone.
 */

import {
   AutoModelForSequenceClassification,
   AutoTokenizer,
   type PreTrainedModel,
   type PreTrainedTokenizer,
   env,
} from '@huggingface/transformers';

import { getModelCacheDir } from './config.js';

export interface RerankerConfig {

   /** Model ID to use for reranking (default: Xenova/bge-reranker-base) */
   model?: string;

   /** Data type for model weights (default: q8 for quantized inference) */
   dtype?: 'fp32' | 'fp16' | 'q8' | 'q4';

   /** Maximum sequence length for tokenization (default: 512) */
   maxLength?: number;

   /** Batch size for processing pairs (default: 32) */
   batchSize?: number;

   /** Cache directory for downloaded models (default: centralized libragen models dir) */
   cacheDir?: string;
}

export interface RerankResult {

   /** Index of the document in the original array */
   index: number;

   /** Original document content */
   document: string;

   /** Relevance score (higher = more relevant) */
   score: number;
}

export interface RerankProgress {

   /** Current batch being processed */
   currentBatch: number;

   /** Total number of batches */
   totalBatches: number;

   /** Number of documents processed so far */
   processedCount: number;

   /** Total number of documents to process */
   totalCount: number;
}

export type RerankProgressCallback = (progress: RerankProgress) => void;

const DEFAULT_MODEL = 'Xenova/bge-reranker-base';

const DEFAULT_DTYPE = 'q8' as const;

const DEFAULT_MAX_LENGTH = 512;

const DEFAULT_BATCH_SIZE = 32;

export class Reranker {

   private _model: PreTrainedModel | null = null;
   private _tokenizer: PreTrainedTokenizer | null = null;
   private readonly _config: Required<Omit<RerankerConfig, 'cacheDir'>> & Pick<RerankerConfig, 'cacheDir'>;
   private _initPromise: Promise<void> | null = null;

   public constructor(config: RerankerConfig = {}) {
      this._config = {
         model: config.model ?? DEFAULT_MODEL,
         dtype: config.dtype ?? DEFAULT_DTYPE,
         maxLength: config.maxLength ?? DEFAULT_MAX_LENGTH,
         batchSize: config.batchSize ?? DEFAULT_BATCH_SIZE,
         cacheDir: config.cacheDir,
      };
   }

   /**
    * Initialize the reranker by loading the model and tokenizer.
    * This is called automatically on first use, but can be called
    * explicitly to pre-warm the model.
    */
   public async initialize(): Promise<void> {
      if (this._model && this._tokenizer) {
         return;
      }

      // Use a single promise to prevent concurrent initialization
      if (!this._initPromise) {
         this._initPromise = this._doInitialize();
      }

      await this._initPromise;
   }

   /**
    * Rerank documents based on their relevance to a query.
    *
    * @param query - The search query
    * @param documents - Array of document contents to rerank
    * @param topK - Number of top results to return (default: all)
    * @param progressCallback - Optional callback for progress updates
    * @returns Array of rerank results sorted by score (highest first)
    */
   public async rerank(
      query: string,
      documents: string[],
      topK?: number,
      progressCallback?: RerankProgressCallback
   ): Promise<RerankResult[]> {
      if (documents.length === 0) {
         return [];
      }

      await this.initialize();

      // Safe to assert non-null after initialize()
      const tokenizer = this._tokenizer as PreTrainedTokenizer,
            model = this._model as PreTrainedModel,
            results: RerankResult[] = [],
            batchSize = this._config.batchSize,
            totalBatches = Math.ceil(documents.length / batchSize);

      // Process in batches
      for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
         const start = batchIdx * batchSize,
               end = Math.min(start + batchSize, documents.length),
               batchDocs = documents.slice(start, end);

         // Create parallel arrays for tokenizer
         // texts = [query, query, query, ...]
         // pairs = [doc1, doc2, doc3, ...]
         const texts = new Array(batchDocs.length).fill(query);

         // Tokenize the batch
         const inputs = tokenizer(texts, {
            text_pair: batchDocs,
            padding: true,
            truncation: true,
            max_length: this._config.maxLength,
         });

         // Get model output
         const output = await model(inputs),
               logits = output.logits.data as Float32Array;

         // Extract scores and create results
         for (let i = 0; i < batchDocs.length; i++) {
            results.push({
               index: start + i,
               document: batchDocs[i],
               score: logits[i],
            });
         }

         // Report progress
         if (progressCallback) {
            progressCallback({
               currentBatch: batchIdx + 1,
               totalBatches,
               processedCount: end,
               totalCount: documents.length,
            });
         }
      }

      // Sort by score (highest first)
      results.sort((a, b) => {
         return b.score - a.score;
      });

      // Return top-k if specified
      if (topK !== undefined && topK < results.length) {
         return results.slice(0, topK);
      }

      return results;
   }

   /**
    * Compute relevance score for a single query-document pair.
    *
    * @param query - The search query
    * @param document - The document content
    * @returns Relevance score (higher = more relevant)
    */
   public async score(query: string, document: string): Promise<number> {
      const results = await this.rerank(query, [ document ]);

      return results[0]?.score ?? 0;
   }

   /**
    * Check if the reranker has been initialized.
    */
   public get isInitialized(): boolean {
      return this._model !== null && this._tokenizer !== null;
   }

   /**
    * Get the model configuration.
    */
   public get config(): Readonly<Required<Omit<RerankerConfig, 'cacheDir'>> & Pick<RerankerConfig, 'cacheDir'>> {
      return this._config;
   }

   /**
    * Dispose of the reranker and release resources.
    */
   public async dispose(): Promise<void> {
      // Transformers.js models don't have explicit dispose
      // but we can null out the references for garbage collection
      this._model = null;
      this._tokenizer = null;
      this._initPromise = null;
   }

   private async _doInitialize(): Promise<void> {
      // Configure cache directory (use centralized default if not specified)
      env.cacheDir = this._config.cacheDir ?? getModelCacheDir();

      // Disable local model check to always use remote/cached models
      env.allowLocalModels = false;

      const [ tokenizer, model ] = await Promise.all([
         AutoTokenizer.from_pretrained(this._config.model),
         (AutoModelForSequenceClassification.from_pretrained as Function)(this._config.model, {
            dtype: this._config.dtype,
         }),
      ]);

      this._tokenizer = tokenizer;
      this._model = model;
   }

}

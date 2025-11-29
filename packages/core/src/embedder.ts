/**
 * Embedding module using Transformers.js
 *
 * Provides local embedding generation using the BGE model for RAG applications.
 * Features lazy model initialization, batched processing, and progress callbacks.
 */

import {
   pipeline,
   env,
   type FeatureExtractionPipeline,
   type ProgressInfo,
} from '@huggingface/transformers';

import { getModelCacheDir } from './config.js';

export interface EmbedderConfig {
   model?: string;
   quantization?: 'fp32' | 'fp16' | 'q8' | 'q4';
   batchSize?: number;
   cacheDir?: string;
}

export interface EmbedProgress {
   batch: number;
   totalBatches: number;
   processed: number;
   total: number;
}

export type ProgressCallback = (progress: EmbedProgress) => void;

export type ModelLoadCallback = (info: ProgressInfo) => void;

const DEFAULT_MODEL = 'Xenova/bge-small-en-v1.5';

const DEFAULT_QUANTIZATION = 'q8' as const;

const DEFAULT_BATCH_SIZE = 32;

export class Embedder {

   private _pipeline: FeatureExtractionPipeline | null = null;
   private _initPromise: Promise<void> | null = null;
   private readonly _config: Required<Omit<EmbedderConfig, 'cacheDir'>> & Pick<EmbedderConfig, 'cacheDir'>;

   public constructor(config: EmbedderConfig = {}) {
      this._config = {
         model: config.model ?? DEFAULT_MODEL,
         quantization: config.quantization ?? DEFAULT_QUANTIZATION,
         batchSize: config.batchSize ?? DEFAULT_BATCH_SIZE,
         cacheDir: config.cacheDir,
      };
   }

   public get model(): string {
      return this._config.model;
   }

   public get dimensions(): number {
      // BGE-small produces 384-dimensional embeddings
      if (this._config.model.includes('bge-small')) {
         return 384;
      }
      // Default to 384 for unknown models; will be validated on first embed
      return 384;
   }

   /**
    * Initialize the embedding pipeline.
    * Called automatically on first embed, but can be called explicitly for eager loading.
    */
   public async initialize(onProgress?: ModelLoadCallback): Promise<void> {
      if (this._pipeline) {
         return;
      }

      // Avoid duplicate initialization
      if (this._initPromise) {
         await this._initPromise;
         return;
      }

      this._initPromise = this._doInitialize(onProgress);
      await this._initPromise;
   }

   /**
    * Embed a single text.
    */
   public async embed(text: string): Promise<Float32Array> {
      await this.initialize();

      if (!this._pipeline) {
         throw new Error('Embedder not initialized');
      }

      const result = await this._pipeline(text, {
         pooling: 'mean',
         normalize: true,
      });

      // Result is a Tensor; convert to Float32Array
      return new Float32Array(result.data as ArrayLike<number>);
   }

   /**
    * Embed multiple texts with batching and optional progress callback.
    */
   public async embedBatch(
      texts: string[],
      onProgress?: ProgressCallback
   ): Promise<Float32Array[]> {
      await this.initialize();

      if (!this._pipeline) {
         throw new Error('Embedder not initialized');
      }

      if (texts.length === 0) {
         return [];
      }

      const results: Float32Array[] = [],
            totalBatches = Math.ceil(texts.length / this._config.batchSize);

      for (let i = 0; i < texts.length; i += this._config.batchSize) {
         const batch = texts.slice(i, i + this._config.batchSize),
               batchIndex = Math.floor(i / this._config.batchSize);

         // Process batch
         const batchResults = await this._pipeline(batch, {
            pooling: 'mean',
            normalize: true,
         });

         // Extract embeddings from tensor
         // For batched input, result.data contains all embeddings concatenated
         const data = batchResults.data as ArrayLike<number>,
               embeddingDim = this.dimensions;

         for (let j = 0; j < batch.length; j++) {
            const start = j * embeddingDim,
                  end = start + embeddingDim;

            results.push(new Float32Array(Array.prototype.slice.call(data, start, end)));
         }

         // Report progress
         if (onProgress) {
            onProgress({
               batch: batchIndex,
               totalBatches,
               processed: Math.min(i + this._config.batchSize, texts.length),
               total: texts.length,
            });
         }
      }

      return results;
   }

   public isInitialized(): boolean {
      return this._pipeline !== null;
   }

   public async dispose(): Promise<void> {
      if (this._pipeline) {
         // Transformers.js pipelines don't have explicit dispose
         // but we can null out the reference for garbage collection
         this._pipeline = null;
         this._initPromise = null;
      }
   }

   private async _doInitialize(onProgress?: ModelLoadCallback): Promise<void> {
      // Configure cache directory (use centralized default if not specified)
      env.cacheDir = this._config.cacheDir ?? getModelCacheDir();

      // Disable local model check to always use remote/cached models
      env.allowLocalModels = false;

      const dtype = this._getDtype();

      this._pipeline = await (pipeline as Function)(
         'feature-extraction',
         this._config.model,
         { dtype, progress_callback: onProgress }
      ) as FeatureExtractionPipeline;
   }

   private _getDtype(): 'fp32' | 'fp16' | 'q8' | 'q4' {
      switch (this._config.quantization) {
         case 'fp32': {
            return 'fp32';
         }
         case 'fp16': {
            return 'fp16';
         }
         case 'q8': {
            return 'q8';
         }
         case 'q4': {
            return 'q4';
         }
         default: {
            return 'q8';
         }
      }
   }

}

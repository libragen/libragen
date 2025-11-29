/**
 * Searcher module for hybrid search operations
 *
 * Provides a high-level interface for searching that combines query embedding,
 * hybrid search (vector + BM25), and optional reranking.
 */

import type { Embedder } from './embedder.ts';
import type { VectorStore, SearchResult, StoredChunk } from './store.ts';
import type { Reranker } from './reranker.ts';

export interface SearchOptions {

   /** The search query text */
   query: string;

   /** Number of results to return (default: 10) */
   k?: number;

   /**
    * Balance between vector and keyword search (default: 0.5)
    * 0 = keyword only, 1 = vector only, 0.5 = equal weight
    */
   hybridAlpha?: number;

   /** Whether to apply reranking (default: false) */
   rerank?: boolean;

   /** Filter by content version */
   contentVersion?: string;

   /** Number of chunks to include before each result for context */
   contextBefore?: number;

   /** Number of chunks to include after each result for context */
   contextAfter?: number;
}

export interface SearcherConfig {

   /** Default number of results to return */
   defaultK?: number;

   /** Default hybrid alpha value */
   defaultHybridAlpha?: number;

   /** Reranker instance for optional result reranking */
   reranker?: Reranker;
}

export { SearchResult };

export interface SearchResultWithContext extends SearchResult {

   /** Chunks before this result from the same source file */
   contextBefore?: StoredChunk[];

   /** Chunks after this result from the same source file */
   contextAfter?: StoredChunk[];
}

const DEFAULT_K = 10;

const DEFAULT_HYBRID_ALPHA = 0.5;

export class Searcher {

   private readonly _embedder: Embedder;
   private readonly _store: VectorStore;
   private readonly _reranker: Reranker | null;
   private readonly _config: Omit<Required<SearcherConfig>, 'reranker'>;

   public constructor(
      embedder: Embedder,
      store: VectorStore,
      config: SearcherConfig = {}
   ) {
      this._embedder = embedder;
      this._store = store;
      this._reranker = config.reranker ?? null;
      this._config = {
         defaultK: config.defaultK ?? DEFAULT_K,
         defaultHybridAlpha: config.defaultHybridAlpha ?? DEFAULT_HYBRID_ALPHA,
      };
   }

   /**
    * Perform a search using hybrid search (vector + keyword).
    *
    * The search process:
    * 1. Embed the query using the embedder
    * 2. Perform hybrid search combining vector similarity and BM25
    * 3. Deduplicate results by source file + line
    * 4. Optionally apply cross-encoder reranking for improved relevance
    * 5. Optionally expand results with surrounding context chunks
    */
   public async search(options: SearchOptions): Promise<SearchResultWithContext[]> {
      const { query, contentVersion, contextBefore, contextAfter } = options,
            k = options.k ?? this._config.defaultK,
            hybridAlpha = options.hybridAlpha ?? this._config.defaultHybridAlpha;

      if (!query || query.trim().length === 0) {
         return [];
      }

      // Embed the query
      const queryEmbedding = await this._embedder.embed(query),
            willRerank = options.rerank && this._reranker;

      // Request extra results to account for duplicates that will be filtered.
      // When reranking, fetch more candidates to give the reranker better options.
      const expandedK = willRerank ? k * 5 : k * 2;

      // Determine search strategy based on hybridAlpha
      let results: SearchResult[];

      if (hybridAlpha === 0) {
         // Keyword-only search
         results = this._store.keywordSearch(query, expandedK, { contentVersion });
      } else if (hybridAlpha === 1) {
         // Vector-only search
         results = this._store.vectorSearch(queryEmbedding, expandedK, { contentVersion });
      } else {
         // Hybrid search with RRF fusion
         results = this._store.hybridSearch(queryEmbedding, query, expandedK, { contentVersion });
      }

      // Deduplicate results by source file + start line BEFORE reranking to save compute.
      // When reranking, keep more candidates (k * 3) for the reranker to work with.
      const seen = new Set<string>(),
            dedupLimit = willRerank ? k * 3 : k;

      let deduped: SearchResult[] = [];

      for (const result of results) {
         const key = `${result.sourceFile}:${result.startLine ?? 'unknown'}`;

         if (!seen.has(key)) {
            seen.add(key);
            deduped.push(result);
            if (deduped.length >= dedupLimit) {
               break;
            }
         }
      }

      // Apply reranking AFTER deduplication to avoid wasting compute on duplicates
      if (willRerank && this._reranker) {
         const documents = deduped.map((r) => {
            return r.content;
         });

         const reranked = await this._reranker.rerank(query, documents, k);

         // Map reranked results back to original SearchResult objects with updated scores
         deduped = reranked.map((r) => {
            const original = deduped[r.index];

            return {
               ...original,
               score: r.score, // Use reranker score
            };
         });
      } else {
         // Without reranking, just limit to k
         deduped = deduped.slice(0, k);
      }

      // Expand results with context if requested
      if (contextBefore || contextAfter) {
         return deduped.map((result) => {
            const adjacent = this._store.getAdjacentChunks(
               result.id,
               contextBefore ?? 0,
               contextAfter ?? 0
            );

            return {
               ...result,
               contextBefore: adjacent.before.length > 0 ? adjacent.before : undefined,
               contextAfter: adjacent.after.length > 0 ? adjacent.after : undefined,
            };
         });
      }

      return deduped;
   }

   /**
    * Perform a vector-only search.
    */
   public async vectorSearch(
      query: string,
      k?: number,
      options: { contentVersion?: string } = {}
   ): Promise<SearchResult[]> {
      return this.search({
         query,
         k,
         hybridAlpha: 1,
         contentVersion: options.contentVersion,
      });
   }

   /**
    * Perform a keyword-only search using BM25.
    */
   public keywordSearch(
      query: string,
      k?: number,
      options: { contentVersion?: string } = {}
   ): SearchResult[] {
      const effectiveK = k ?? this._config.defaultK;

      if (!query || query.trim().length === 0) {
         return [];
      }

      return this._store.keywordSearch(query, effectiveK, options);
   }

   /**
    * Get the embedder instance.
    */
   public get embedder(): Embedder {
      return this._embedder;
   }

   /**
    * Get the vector store instance.
    */
   public get store(): VectorStore {
      return this._store;
   }

   /**
    * Get the reranker instance (if configured).
    */
   public get reranker(): Reranker | null {
      return this._reranker;
   }

   /**
    * Check if reranking is available.
    */
   public get hasReranker(): boolean {
      return this._reranker !== null;
   }

}

/**
 * Vector Store module using SQLite with sqlite-vec and FTS5
 *
 * Provides persistent vector storage and hybrid search (vector + BM25) capabilities
 * using SQLite extensions.
 */

import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import type { Chunk } from './chunker.ts';

export interface StoredChunk {
   id: number;
   content: string;
   embedding?: Float32Array;
   sourceFile: string;
   sourceType: string;
   sourceRef?: string;
   contentVersion?: string;
   startLine?: number;
   endLine?: number;
   language?: string;
   metadata?: Record<string, unknown>;
}

export interface SearchResult {
   id: number;
   content: string;
   score: number;
   sourceFile: string;
   sourceType: string;
   sourceRef?: string;
   contentVersion?: string;
   startLine?: number;
   endLine?: number;
   language?: string;
   metadata?: Record<string, unknown>;
}

export interface VectorStoreConfig {
   embeddingDimensions?: number;
}

const DEFAULT_EMBEDDING_DIMENSIONS = 384;

const RRF_K = 60; // RRF fusion constant

export class VectorStore {

   private readonly _db: Database.Database;
   private readonly _embeddingDimensions: number;
   private _isInitialized: boolean = false;

   public constructor(dbPath: string, config: VectorStoreConfig = {}) {
      this._db = new Database(dbPath);
      this._embeddingDimensions = config.embeddingDimensions ?? DEFAULT_EMBEDDING_DIMENSIONS;
   }

   /**
    * Initialize the database schema.
    */
   public initialize(): void {
      if (this._isInitialized) {
         return;
      }

      // Load sqlite-vec extension
      sqliteVec.load(this._db);

      // Enable WAL mode for better concurrency
      this._db.pragma('journal_mode = WAL');

      // Create sources table
      this._db.exec(`
         CREATE TABLE IF NOT EXISTS sources (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL,
            uri TEXT NOT NULL,
            ref TEXT,
            content_version TEXT,
            content_version_type TEXT,
            retrieved_at TEXT DEFAULT CURRENT_TIMESTAMP,
            metadata TEXT
         )
      `);

      // Create chunks table
      this._db.exec(`
         CREATE TABLE IF NOT EXISTS chunks (
            id INTEGER PRIMARY KEY,
            content TEXT NOT NULL,
            embedding BLOB NOT NULL,
            source_file TEXT NOT NULL,
            source_type TEXT NOT NULL DEFAULT 'file',
            source_ref TEXT,
            content_version TEXT,
            start_line INTEGER,
            end_line INTEGER,
            language TEXT,
            metadata TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
         )
      `);

      // Create index for content version filtering
      this._db.exec(`
         CREATE INDEX IF NOT EXISTS idx_chunks_content_version
         ON chunks(content_version)
      `);

      // Create FTS5 virtual table for keyword search
      this._db.exec(`
         CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
            content,
            content='chunks',
            content_rowid='id',
            tokenize='porter unicode61'
         )
      `);

      // Create triggers to keep FTS in sync
      this._db.exec(`
         CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
            INSERT INTO chunks_fts(rowid, content) VALUES (new.id, new.content);
         END
      `);

      this._db.exec(`
         CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
            INSERT INTO chunks_fts(chunks_fts, rowid, content)
            VALUES ('delete', old.id, old.content);
         END
      `);

      this._db.exec(`
         CREATE TRIGGER IF NOT EXISTS chunks_au AFTER UPDATE ON chunks BEGIN
            INSERT INTO chunks_fts(chunks_fts, rowid, content)
            VALUES ('delete', old.id, old.content);
            INSERT INTO chunks_fts(rowid, content) VALUES (new.id, new.content);
         END
      `);

      // Create library metadata table
      this._db.exec(`
         CREATE TABLE IF NOT EXISTS library_meta (
            key TEXT PRIMARY KEY,
            value TEXT
         )
      `);

      this._isInitialized = true;
   }

   /**
    * Add a single chunk with its embedding.
    */
   public addChunk(
      chunk: Chunk,
      embedding: Float32Array,
      options: {
         sourceType?: string;
         sourceRef?: string;
         contentVersion?: string;
      } = {}
   ): number {
      this._ensureInitialized();

      const insertChunk = this._db.prepare(`
         INSERT INTO chunks (
            content, embedding, source_file, source_type, source_ref,
            content_version, start_line, end_line, language, metadata
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const result = insertChunk.run(
         chunk.content,
         Buffer.from(embedding.buffer),
         chunk.metadata.sourceFile,
         options.sourceType ?? 'file',
         options.sourceRef,
         options.contentVersion,
         chunk.metadata.startLine,
         chunk.metadata.endLine,
         chunk.metadata.language,
         null
      );

      return Number(result.lastInsertRowid);
   }

   /**
    * Add multiple chunks with their embeddings in a transaction.
    */
   public addChunks(
      chunks: Chunk[],
      embeddings: Float32Array[],
      options: {
         sourceType?: string;
         sourceRef?: string;
         contentVersion?: string;
      } = {}
   ): number[] {
      this._ensureInitialized();

      if (chunks.length !== embeddings.length) {
         throw new Error('Chunks and embeddings must have the same length');
      }

      const insertChunk = this._db.prepare(`
         INSERT INTO chunks (
            content, embedding, source_file, source_type, source_ref,
            content_version, start_line, end_line, language, metadata
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const ids: number[] = [];

      const transaction = this._db.transaction(() => {
         for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i],
                  embedding = embeddings[i];

            const result = insertChunk.run(
               chunk.content,
               Buffer.from(embedding.buffer),
               chunk.metadata.sourceFile,
               options.sourceType ?? 'file',
               options.sourceRef,
               options.contentVersion,
               chunk.metadata.startLine,
               chunk.metadata.endLine,
               chunk.metadata.language,
               null
            );

            ids.push(Number(result.lastInsertRowid));
         }
      });

      transaction();

      return ids;
   }

   /**
    * Perform vector similarity search.
    */
   public vectorSearch(
      queryEmbedding: Float32Array,
      k: number,
      options: { contentVersion?: string } = {}
   ): SearchResult[] {
      this._ensureInitialized();

      let query: string,
          params: unknown[];

      if (options.contentVersion) {
         query = `
            SELECT
               id, content, embedding, source_file, source_type,
               source_ref, content_version, start_line, end_line,
               language, metadata
            FROM chunks
            WHERE content_version = ?
         `;
         params = [ options.contentVersion ];
      } else {
         query = `
            SELECT
               id, content, embedding, source_file, source_type,
               source_ref, content_version, start_line, end_line,
               language, metadata
            FROM chunks
         `;
         params = [];
      }

      const stmt = this._db.prepare(query);

      const rows = stmt.all(...params) as Array<{
         id: number;
         content: string;
         embedding: Buffer;
         source_file: string;
         source_type: string;
         source_ref: string | null;
         content_version: string | null;
         start_line: number | null;
         end_line: number | null;
         language: string | null;
         metadata: string | null;
      }>;

      // Compute similarity scores
      const embeddingArray = new Float32Array(queryEmbedding.buffer);

      const results = rows.map((row) => {
         const docEmbedding = new Float32Array(row.embedding.buffer);

         const similarity = this._cosineSimilarity(embeddingArray, docEmbedding);

         return {
            id: row.id,
            content: row.content,
            score: similarity,
            sourceFile: row.source_file,
            sourceType: row.source_type,
            sourceRef: row.source_ref ?? undefined,
            contentVersion: row.content_version ?? undefined,
            startLine: row.start_line ?? undefined,
            endLine: row.end_line ?? undefined,
            language: row.language ?? undefined,
            metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
         };
      });

      // Sort by similarity descending and take top k
      return results
         .sort((a, b) => {
            return b.score - a.score;
         })
         .slice(0, k);
   }

   /**
    * Perform BM25 keyword search using FTS5.
    */
   public keywordSearch(
      query: string,
      k: number,
      options: { contentVersion?: string } = {}
   ): SearchResult[] {
      this._ensureInitialized();

      // Escape special FTS5 characters
      const escapedQuery = this._escapeFts5Query(query);

      let sqlQuery: string,
          params: unknown[];

      if (options.contentVersion) {
         sqlQuery = `
            SELECT
               c.id,
               c.content,
               c.source_file,
               c.source_type,
               c.source_ref,
               c.content_version,
               c.start_line,
               c.end_line,
               c.language,
               c.metadata,
               bm25(chunks_fts) as score
            FROM chunks_fts f
            JOIN chunks c ON c.id = f.rowid
            WHERE chunks_fts MATCH ?
               AND c.content_version = ?
            ORDER BY score
            LIMIT ?
         `;
         params = [ escapedQuery, options.contentVersion, k ];
      } else {
         sqlQuery = `
            SELECT
               c.id,
               c.content,
               c.source_file,
               c.source_type,
               c.source_ref,
               c.content_version,
               c.start_line,
               c.end_line,
               c.language,
               c.metadata,
               bm25(chunks_fts) as score
            FROM chunks_fts f
            JOIN chunks c ON c.id = f.rowid
            WHERE chunks_fts MATCH ?
            ORDER BY score
            LIMIT ?
         `;
         params = [ escapedQuery, k ];
      }

      try {
         const stmt = this._db.prepare(sqlQuery);

         const rows = stmt.all(...params) as Array<{
            id: number;
            content: string;
            source_file: string;
            source_type: string;
            source_ref: string | null;
            content_version: string | null;
            start_line: number | null;
            end_line: number | null;
            language: string | null;
            metadata: string | null;
            score: number;
         }>;

         return rows.map((row) => {
            return {
               id: row.id,
               content: row.content,
               // BM25 returns negative scores, lower is better
               // Normalize to 0-1 range where higher is better
               score: -row.score,
               sourceFile: row.source_file,
               sourceType: row.source_type,
               sourceRef: row.source_ref ?? undefined,
               contentVersion: row.content_version ?? undefined,
               startLine: row.start_line ?? undefined,
               endLine: row.end_line ?? undefined,
               language: row.language ?? undefined,
               metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
            };
         });
      } catch(_e) {
         // FTS5 query failed (e.g., syntax error), return empty results
         return [];
      }
   }

   /**
    * Perform hybrid search combining vector and keyword search with RRF fusion.
    */
   public hybridSearch(
      queryEmbedding: Float32Array,
      queryText: string,
      k: number,
      options: { contentVersion?: string } = {}
   ): SearchResult[] {
      this._ensureInitialized();

      // Get more results from each search for better fusion
      const expandedK = k * 3;

      const vectorResults = this.vectorSearch(queryEmbedding, expandedK, options);

      const keywordResults = this.keywordSearch(queryText, expandedK, options);

      // RRF fusion
      const scores = new Map<number, { score: number; result: SearchResult }>();

      vectorResults.forEach((result, rank) => {
         const rrfScore = 1 / (RRF_K + rank + 1);

         scores.set(result.id, { score: rrfScore, result });
      });

      keywordResults.forEach((result, rank) => {
         const rrfScore = 1 / (RRF_K + rank + 1),
               existing = scores.get(result.id);

         if (existing) {
            existing.score += rrfScore;
         } else {
            scores.set(result.id, { score: rrfScore, result });
         }
      });

      // Sort by fused score and return top k
      const fusedResults = Array.from(scores.values())
         .sort((a, b) => {
            return b.score - a.score;
         })
         .slice(0, k)
         .map(({ score, result }) => {
            return { ...result, score };
         });

      return fusedResults;
   }

   /**
    * Get a chunk by ID.
    */
   public getChunk(id: number): StoredChunk | null {
      this._ensureInitialized();

      const stmt = this._db.prepare(`
         SELECT
            id, content, source_file, source_type, source_ref,
            content_version, start_line, end_line, language, metadata
         FROM chunks
         WHERE id = ?
      `);

      const row = stmt.get(id) as {
         id: number;
         content: string;
         source_file: string;
         source_type: string;
         source_ref: string | null;
         content_version: string | null;
         start_line: number | null;
         end_line: number | null;
         language: string | null;
         metadata: string | null;
      } | undefined;

      if (!row) {
         return null;
      }

      return {
         id: row.id,
         content: row.content,
         sourceFile: row.source_file,
         sourceType: row.source_type,
         sourceRef: row.source_ref ?? undefined,
         contentVersion: row.content_version ?? undefined,
         startLine: row.start_line ?? undefined,
         endLine: row.end_line ?? undefined,
         language: row.language ?? undefined,
         metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      };
   }

   /**
    * Get chunks adjacent to a given chunk from the same source file.
    * Returns chunks ordered by start_line.
    *
    * @param chunkId - The ID of the reference chunk
    * @param before - Number of chunks to fetch before the reference chunk
    * @param after - Number of chunks to fetch after the reference chunk
    */
   public getAdjacentChunks(
      chunkId: number,
      before: number = 0,
      after: number = 0
   ): { before: StoredChunk[]; after: StoredChunk[] } {
      this._ensureInitialized();

      // Get the reference chunk to find its source file and position
      const refChunk = this.getChunk(chunkId);

      if (!refChunk || refChunk.startLine === undefined) {
         return { before: [], after: [] };
      }

      const { sourceFile, startLine } = refChunk;

      // Fetch chunks before (same file, end_line < reference start_line)
      const beforeChunks: StoredChunk[] = [];

      if (before > 0) {
         const beforeStmt = this._db.prepare(`
            SELECT
               id, content, source_file, source_type, source_ref,
               content_version, start_line, end_line, language, metadata
            FROM chunks
            WHERE source_file = ? AND end_line < ?
            ORDER BY start_line DESC
            LIMIT ?
         `);

         const beforeRows = beforeStmt.all(sourceFile, startLine, before) as Array<{
            id: number;
            content: string;
            source_file: string;
            source_type: string;
            source_ref: string | null;
            content_version: string | null;
            start_line: number | null;
            end_line: number | null;
            language: string | null;
            metadata: string | null;
         }>;

         // Reverse to get chronological order
         for (const row of beforeRows.reverse()) {
            beforeChunks.push(this._rowToStoredChunk(row));
         }
      }

      // Fetch chunks after (same file, start_line > reference end_line)
      const afterChunks: StoredChunk[] = [];

      if (after > 0) {
         const refEndLine = refChunk.endLine ?? startLine;

         const afterStmt = this._db.prepare(`
            SELECT
               id, content, source_file, source_type, source_ref,
               content_version, start_line, end_line, language, metadata
            FROM chunks
            WHERE source_file = ? AND start_line > ?
            ORDER BY start_line ASC
            LIMIT ?
         `);

         const afterRows = afterStmt.all(sourceFile, refEndLine, after) as Array<{
            id: number;
            content: string;
            source_file: string;
            source_type: string;
            source_ref: string | null;
            content_version: string | null;
            start_line: number | null;
            end_line: number | null;
            language: string | null;
            metadata: string | null;
         }>;

         for (const row of afterRows) {
            afterChunks.push(this._rowToStoredChunk(row));
         }
      }

      return { before: beforeChunks, after: afterChunks };
   }

   /**
    * Get total chunk count.
    */
   public getChunkCount(): number {
      this._ensureInitialized();

      const stmt = this._db.prepare('SELECT COUNT(*) as count FROM chunks');

      const row = stmt.get() as { count: number };

      return row.count;
   }

   /**
    * Set a metadata value.
    */
   public setMeta(key: string, value: string): void {
      this._ensureInitialized();

      const stmt = this._db.prepare(`
         INSERT OR REPLACE INTO library_meta (key, value) VALUES (?, ?)
      `);

      stmt.run(key, value);
   }

   /**
    * Get a metadata value.
    */
   public getMeta(key: string): string | null {
      this._ensureInitialized();

      const stmt = this._db.prepare('SELECT value FROM library_meta WHERE key = ?');

      const row = stmt.get(key) as { value: string } | undefined;

      return row?.value ?? null;
   }

   /**
    * Get all metadata as an object.
    */
   public getAllMeta(): Record<string, string> {
      this._ensureInitialized();

      const stmt = this._db.prepare('SELECT key, value FROM library_meta');

      const rows = stmt.all() as Array<{ key: string; value: string }>;

      const meta: Record<string, string> = {};

      for (const row of rows) {
         meta[row.key] = row.value;
      }

      return meta;
   }

   /**
    * Set the library metadata object.
    * Stores the entire metadata as a JSON string under the 'manifest' key.
    */
   public setMetadata(metadata: object): void {
      this.setMeta('manifest', JSON.stringify(metadata));
   }

   /**
    * Get the library metadata object.
    */
   public getMetadata<T = Record<string, unknown>>(): T | null {
      const manifest = this.getMeta('manifest');

      if (!manifest) {
         return null;
      }

      return JSON.parse(manifest) as T;
   }

   /**
    * Close the database connection.
    */
   public close(): void {
      this._db.close();
   }

   /**
    * Check if the store is initialized.
    */
   public isInitialized(): boolean {
      return this._isInitialized;
   }

   /**
    * Get the underlying database connection.
    * Use with caution - direct database access can bypass store invariants.
    */
   public getDatabase(): Database.Database {
      return this._db;
   }

   private _ensureInitialized(): void {
      if (!this._isInitialized) {
         throw new Error('VectorStore not initialized. Call initialize() first.');
      }
   }

   private _escapeFts5Query(query: string): string {
      // Simple tokenization - split on whitespace and join with OR
      // This handles basic queries without special FTS5 syntax
      const tokens = query
         .split(/\s+/)
         .filter((t) => {
            return t.length > 0;
         })
         .map((t) => {
            // Remove special FTS5 characters
            return t.replace(/['"*()-]/g, '');
         })
         .filter((t) => {
            return t.length > 0;
         });

      if (tokens.length === 0) {
         return '*'; // Match all if empty query
      }

      return tokens.join(' OR ');
   }

   private _rowToStoredChunk(row: {
      id: number;
      content: string;
      source_file: string;
      source_type: string;
      source_ref: string | null;
      content_version: string | null;
      start_line: number | null;
      end_line: number | null;
      language: string | null;
      metadata: string | null;
   }): StoredChunk {
      return {
         id: row.id,
         content: row.content,
         sourceFile: row.source_file,
         sourceType: row.source_type,
         sourceRef: row.source_ref ?? undefined,
         contentVersion: row.content_version ?? undefined,
         startLine: row.start_line ?? undefined,
         endLine: row.end_line ?? undefined,
         language: row.language ?? undefined,
         metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      };
   }

   private _cosineSimilarity(a: Float32Array, b: Float32Array): number {
      let dotProduct = 0,
          normA = 0,
          normB = 0;

      for (let i = 0; i < a.length; i++) {
         dotProduct += a[i] * b[i];
         normA += a[i] * a[i];
         normB += b[i] * b[i];
      }

      const magnitude = Math.sqrt(normA) * Math.sqrt(normB);

      if (magnitude === 0) {
         return 0;
      }

      return dotProduct / magnitude;
   }

}

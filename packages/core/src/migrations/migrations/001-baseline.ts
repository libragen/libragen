/**
 * Baseline migration (v1)
 *
 * This migration documents the initial schema. It is a no-op because the schema
 * is created by VectorStore.initialize().
 *
 * Schema v1 includes:
 * - sources table: tracks source files/repos
 * - chunks table: stores content chunks with embeddings
 * - chunks_fts: FTS5 virtual table for keyword search
 * - library_meta: key-value metadata storage
 */

import type { Migration } from '../types.ts';

export const migration001Baseline: Migration = {
   version: 1,
   description: 'Baseline schema: chunks, sources, library_meta tables with FTS5',
   up(): void {
      // No-op: schema created by VectorStore.initialize()
   },
};

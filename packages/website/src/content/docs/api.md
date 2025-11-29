---
title: API Reference
description: TypeScript API for @libragen/core
section: Reference
order: 11
---

The `@libragen/core` package provides programmatic access to libragen functionality.

## Installation

```bash
npm install --save-exact @libragen/core
```

## Quick Example

```typescript
import { Embedder, VectorStore, Searcher } from '@libragen/core';

// Create an embedder
const embedder = new Embedder();

// Open a library
const store = new VectorStore('./my-library.libragen');

// Search
const searcher = new Searcher(store, embedder);
const results = await searcher.search('How do I authenticate?', { topK: 5 });

for (const result of results) {
  console.log(`[${result.score.toFixed(2)}] ${result.source}`);
  console.log(result.content);
}
```

## Classes

### `Embedder`

Generates vector embeddings from text using a local transformer model.

```typescript
import { Embedder } from '@libragen/core';

const embedder = new Embedder({
  model: 'Xenova/bge-small-en-v1.5', // default
  dtype: 'q8', // quantized for speed
});

// Generate embedding for a single text
const embedding = await embedder.embed('Hello world');
// Returns: Float32Array(384)

// Generate embeddings for multiple texts (batched)
const embeddings = await embedder.embedBatch([
  'First document',
  'Second document',
]);
// Returns: Float32Array(384)[]
```

#### Constructor Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `model` | string | `Xenova/bge-small-en-v1.5` | HuggingFace model ID |
| `dtype` | `'fp32' \| 'fp16' \| 'q8' \| 'q4'` | `'q8'` | Model precision |

---

### `VectorStore`

SQLite-based storage for vectors, metadata, and full-text search.

```typescript
import { VectorStore } from '@libragen/core';

// Open existing library
const store = new VectorStore('./my-library.libragen');

// Create new library
const store = new VectorStore('./new-library.libragen', {
  create: true,
  metadata: {
    name: 'my-library',
    description: 'My documentation',
    contentVersion: '1.0.0',
  },
});

// Add chunks
await store.addChunks([
  {
    content: 'Document content here...',
    source: 'docs/getting-started.md',
    embedding: await embedder.embed('Document content here...'),
  },
]);

// Get metadata
const meta = store.getMetadata();
console.log(meta.name, meta.chunkCount);

// Close when done
store.close();
```

#### Constructor Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `create` | boolean | `false` | Create new database if doesn't exist |
| `metadata` | object | — | Library metadata (required when creating) |

#### Methods

| Method | Description |
|--------|-------------|
| `addChunks(chunks)` | Add document chunks with embeddings |
| `getMetadata()` | Get library metadata |
| `vectorSearch(embedding, k)` | Search by vector similarity |
| `ftsSearch(query, k)` | Full-text search |
| `close()` | Close database connection |

---

### `Searcher`

Hybrid search combining vector similarity and full-text search.

```typescript
import { Searcher } from '@libragen/core';

const searcher = new Searcher(store, embedder);

const results = await searcher.search('authentication methods', {
  topK: 10,
  contentVersion: '2.0.0', // optional filter
});

for (const result of results) {
  console.log({
    score: result.score,
    source: result.source,
    content: result.content,
  });
}
```

#### Search Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `topK` | number | `10` | Number of results |
| `contentVersion` | string | — | Filter by version |
| `vectorWeight` | number | `0.5` | Weight for vector search (0-1) |
| `ftsWeight` | number | `0.5` | Weight for full-text search (0-1) |

---

### `Chunker`

Split documents into chunks for indexing.

```typescript
import { Chunker } from '@libragen/core';

const chunker = new Chunker({
  chunkSize: 512,
  chunkOverlap: 50,
});

const chunks = chunker.chunk('Long document content...', {
  source: 'docs/guide.md',
});

// Returns: { content: string, source: string }[]
```

#### Constructor Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `chunkSize` | number | `512` | Target chunk size in tokens |
| `chunkOverlap` | number | `50` | Overlap between chunks |

---

## Configuration Helpers

```typescript
import {
  getLibragenHome,
  getDefaultLibraryDir,
  getModelCacheDir,
} from '@libragen/core';

// Get base config directory
const home = getLibragenHome();
// macOS: ~/Library/Application Support/libragen

// Get default library storage location
const libDir = getDefaultLibraryDir();
// macOS: ~/Library/Application Support/libragen/libraries

// Get model cache directory
const modelDir = getModelCacheDir();
// macOS: ~/Library/Application Support/libragen/models
```

Override with environment variables:
- `LIBRAGEN_HOME` - Base directory
- `LIBRAGEN_MODEL_CACHE` - Model cache location

> **Tip:** Run `libragen config` to see current paths and active environment variables.

---

## Types

### `SearchResult`

```typescript
interface SearchResult {
  /** Relevance score (higher = more relevant) */
  score: number;

  /** Source file path */
  source: string;

  /** Chunk content */
  content: string;

  /** Content version if set */
  contentVersion?: string;
}
```

### `LibraryMetadata`

```typescript
interface LibraryMetadata {
  name: string;
  description?: string;
  contentVersion?: string;
  chunkCount: number;
  createdAt: string;
}
```

### `Chunk`

```typescript
interface Chunk {
  content: string;
  source: string;
  embedding: Float32Array;
  metadata?: Record<string, unknown>;
}
```

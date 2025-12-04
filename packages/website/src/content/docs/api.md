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

### Building a Library

```typescript
import { Builder } from '@libragen/core';

const builder = new Builder();

// Build from local directory
const result = await builder.build('./docs', {
  name: 'my-docs',
  version: '1.0.0',
  description: 'My documentation library',
});

console.log(`Built: ${result.outputPath}`);
console.log(`Chunks: ${result.stats.chunkCount}`);
```

### Searching a Library

```typescript
import { Embedder, VectorStore, Searcher } from '@libragen/core';

const embedder = new Embedder();
await embedder.initialize();

const store = new VectorStore('./my-library.libragen');
store.initialize();

const searcher = new Searcher(embedder, store);
const results = await searcher.search({ query: 'How do I authenticate?', k: 5 });

for (const result of results) {
  console.log(`[${result.score.toFixed(2)}] ${result.source}`);
  console.log(result.content);
}
```

## Classes

### `Builder`

High-level API for building `.libragen` libraries from source files or git repositories.

```typescript
import { Builder } from '@libragen/core';

const builder = new Builder();

// Build from local source
const result = await builder.build('./src', {
  name: 'my-library',
  version: '1.0.0',
  description: 'My library',
  chunkSize: 1000,
  chunkOverlap: 100,
});

// Build from git repository
const gitResult = await builder.build('https://github.com/user/repo', {
  gitRef: 'main',
  include: ['docs/**/*.md'],
});

// With progress callback
await builder.build('./docs', { name: 'my-docs' }, (progress) => {
  console.log(`${progress.phase}: ${progress.message}`);
});
```

#### Build Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `output` | string | — | Output path for .libragen file |
| `name` | string | — | Library name |
| `version` | string | `'0.1.0'` | Library version |
| `description` | string | — | Short description |
| `chunkSize` | number | `1000` | Target chunk size in characters |
| `chunkOverlap` | number | `100` | Overlap between chunks |
| `include` | string[] | — | Glob patterns to include |
| `exclude` | string[] | — | Glob patterns to exclude |
| `gitRef` | string | — | Git branch/tag/commit |
| `license` | string[] | — | SPDX license identifiers |

#### Build Result

```typescript
interface BuildResult {
  outputPath: string;      // Absolute path to .libragen file
  metadata: LibraryMetadata;
  stats: {
    chunkCount: number;
    sourceCount: number;
    fileSize: number;
    embedDuration: number;
    chunksPerSecond: number;
  };
  git?: {
    commitHash: string;
    ref: string;
    detectedLicense?: { identifier: string; confidence: string };
  };
}
```

---

### `Embedder`

Generates vector embeddings from text using a local transformer model. Implements the `IEmbedder` interface.

```typescript
import { Embedder } from '@libragen/core';

const embedder = new Embedder({
  model: 'Xenova/bge-small-en-v1.5', // default
  quantization: 'q8', // quantized for speed
});

await embedder.initialize();

// Generate embedding for a single text
const embedding = await embedder.embed('Hello world');
// Returns: Float32Array(384)

// Generate embeddings for multiple texts (batched)
const embeddings = await embedder.embedBatch([
  'First document',
  'Second document',
]);
// Returns: Float32Array(384)[]

// Clean up when done
await embedder.dispose();
```

#### Constructor Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `model` | string | `Xenova/bge-small-en-v1.5` | HuggingFace model ID |
| `quantization` | `'fp32' \| 'fp16' \| 'q8' \| 'q4'` | `'q8'` | Model precision |

---

### `IEmbedder` Interface

Interface for custom embedding implementations. Use this to integrate external embedding services like OpenAI, Cohere, or other providers.

```typescript
import type { IEmbedder } from '@libragen/core';

class OpenAIEmbedder implements IEmbedder {
  dimensions = 1536; // text-embedding-3-small

  async initialize() {
    // Setup OpenAI client
  }

  async embed(text: string): Promise<Float32Array> {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
    });
    return new Float32Array(response.data[0].embedding);
  }

  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: texts,
    });
    return response.data.map(d => new Float32Array(d.embedding));
  }

  async dispose() {
    // Cleanup if needed
  }
}

// Use with Builder
const builder = new Builder({ embedder: new OpenAIEmbedder() });

// Use with Searcher
const searcher = new Searcher(new OpenAIEmbedder(), store);
```

#### Interface Methods

| Method | Description |
|--------|-------------|
| `dimensions` | The dimensionality of embedding vectors (readonly) |
| `initialize()` | Initialize the embedder (called before embedding) |
| `embed(text)` | Embed a single text string |
| `embedBatch(texts)` | Embed multiple texts |
| `dispose()` | Clean up resources |

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

const searcher = new Searcher(embedder, store);

const results = await searcher.search({
  query: 'authentication methods',
  k: 10,
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
| `query` | string | — | Search query text (required) |
| `k` | number | `10` | Number of results |
| `hybridAlpha` | number | `0.5` | Balance between vector (1) and keyword (0) search |
| `rerank` | boolean | `false` | Apply reranking for better results |
| `contentVersion` | string | — | Filter by version |

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

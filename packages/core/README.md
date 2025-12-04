<p align="center">
  <img src="https://libragen.dev/favicon.svg" alt="Libragen Logo" width="80" height="80">
</p>

<h1 align="center">@libragen/core</h1>

<p align="center">
  <strong>Core library for <a href="https://libragen.dev">libragen</a> — stop your AI from hallucinating code</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@libragen/core"><img src="https://img.shields.io/npm/v/@libragen/core.svg" alt="npm"></a>
  <a href="https://github.com/libragen/libragen/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License"></a>
</p>

---

This package provides the core functionality for building and querying libragen libraries — private, local RAG libraries that ground your AI in real documentation instead of stale training data.

**[Full documentation →](https://libragen.dev)**

## Installation

```bash
npm install @libragen/core
```

## Quick Start

### Building a Library

The simplest way to build a library is using the `Builder` class:

```typescript
import { Builder } from '@libragen/core';

const builder = new Builder();

// Build from a local directory
const result = await builder.build('./my-docs', {
   name: 'my-library',
   version: '1.0.0',
   description: 'My documentation library',
});

console.log(`Built library at ${result.outputPath}`);
console.log(`Chunks: ${result.stats.chunkCount}`);

// Build from a git repository
const gitResult = await builder.build('https://github.com/user/repo', {
   name: 'repo-docs',
   gitRef: 'main',
   include: ['docs/**/*.md'],
});
```

### Querying a Library

```typescript
import { Embedder, VectorStore, Searcher } from '@libragen/core';

const embedder = new Embedder();
await embedder.initialize();

const store = new VectorStore('./my-library.libragen');
store.initialize();

const searcher = new Searcher(embedder, store);
const results = await searcher.search({ query: 'authentication' });

console.log(results);

await embedder.dispose();
store.close();
```

## API Reference

### Builder

High-level API for building `.libragen` libraries from source files or git repositories.

```typescript
import { Builder } from '@libragen/core';

const builder = new Builder();

// Build from local source
const result = await builder.build('./src', {
   name: 'my-library',
   version: '1.0.0',
   description: 'My library description',
   agentDescription: 'Use this library when...',
   exampleQueries: ['how to authenticate', 'error handling'],
   keywords: ['typescript', 'api'],
   programmingLanguages: ['typescript'],
   chunkSize: 1000,
   chunkOverlap: 100,
   include: ['**/*.ts', '**/*.md'],
   exclude: ['**/test/**'],
});

console.log(result.outputPath);           // Absolute path to .libragen file
console.log(result.stats.chunkCount);     // Number of chunks created
console.log(result.stats.sourceCount);    // Number of source files
console.log(result.stats.embedDuration);  // Embedding time in seconds

// Build from git with progress callback
const gitResult = await builder.build('https://github.com/user/repo', {
   gitRef: 'v2.0.0',
   gitRepoAuthToken: process.env.GITHUB_TOKEN,
   license: ['MIT'],
}, (progress) => {
   console.log(`${progress.phase}: ${progress.message} (${progress.progress}%)`);
});

if (gitResult.git) {
   console.log(gitResult.git.commitHash);
   console.log(gitResult.git.detectedLicense);
}
```

**Build options:**

```typescript
interface BuildOptions {
   output?: string;              // Output path for .libragen file
   name?: string;                // Library name
   version?: string;             // Library version (default: '0.1.0')
   contentVersion?: string;      // Source content version
   description?: string;         // Short description
   agentDescription?: string;    // AI agent guidance
   exampleQueries?: string[];    // Example queries
   keywords?: string[];          // Searchable tags
   programmingLanguages?: string[];
   textLanguages?: string[];     // ISO 639-1 codes
   frameworks?: string[];
   chunkSize?: number;           // Target chunk size (default: 1000)
   chunkOverlap?: number;        // Chunk overlap (default: 100)
   include?: string[];           // Glob patterns to include
   exclude?: string[];           // Glob patterns to exclude
   noDefaultExcludes?: boolean;  // Disable default exclusions
   gitRef?: string;              // Git branch/tag/commit
   gitRepoAuthToken?: string;    // Auth token for private repos
   license?: string[];           // SPDX license identifiers
}
```

### Embedder

Generates vector embeddings using Transformers.js with the `Xenova/bge-small-en-v1.5` model (384 dimensions).

```typescript
import { Embedder } from '@libragen/core';

const embedder = new Embedder();
await embedder.initialize();

// Single embedding
const embedding = await embedder.embed('some text');

// Batch embeddings
const embeddings = await embedder.embedBatch(['text1', 'text2']);

// Clean up
await embedder.dispose();
```

### Chunker

Splits text into semantic chunks using recursive character splitting.

```typescript
import { Chunker } from '@libragen/core';

const chunker = new Chunker({
   chunkSize: 1500,    // Target chunk size in characters
   chunkOverlap: 200,  // Overlap between chunks
});

// Chunk a file
const chunks = await chunker.chunkFile('./src/index.ts');

// Chunk text directly
const chunks = chunker.chunkText(content, 'index.ts');

// Chunk a directory
const chunks = await chunker.chunkDirectory('./src', {
   patterns: ['**/*.ts', '**/*.md'],
   ignore: ['**/node_modules/**'],
});
```

**Chunk structure:**

```typescript
interface Chunk {
   content: string;
   metadata: ChunkMetadata;
}

interface ChunkMetadata {
   sourceFile: string;
   startLine?: number;
   endLine?: number;
   language?: string;
}
```

### VectorStore

SQLite-based storage with sqlite-vec for vector search and FTS5 for keyword search.

```typescript
import { VectorStore } from '@libragen/core';

const store = new VectorStore('./library.libragen');
store.initialize();

// Add chunks with embeddings
store.addChunks(chunks, embeddings);

// Search
const vectorResults = store.searchVector(queryEmbedding, { k: 10 });
const keywordResults = store.searchKeyword('authentication', { k: 10 });

// Metadata
store.setMetadata({ name: 'my-lib', version: '1.0.0' });
const metadata = store.getMetadata();

store.close();
```

### Searcher

Hybrid search combining vector similarity and BM25 keyword matching with RRF fusion.

```typescript
import { Searcher, Reranker } from '@libragen/core';

const reranker = new Reranker(); // Optional
const searcher = new Searcher(embedder, store, { reranker });

const results = await searcher.search({
   query: 'how to handle errors',
   k: 10,
   contentVersion: 'v2.0.0',  // Optional filter
   rerank: true,              // Use cross-encoder reranking
});
```

**Search result structure:**

```typescript
interface SearchResult {
   content: string;
   score: number;
   sourceFile: string;
   sourceType: string;
   sourceRef?: string;
   contentVersion?: string;
   startLine?: number;
   endLine?: number;
   language?: string;
}
```

### Reranker

Cross-encoder reranking using `mixedbread-ai/mxbai-rerank-xsmall-v1`.

```typescript
import { Reranker } from '@libragen/core';

const reranker = new Reranker();

const reranked = await reranker.rerank(
   'authentication middleware',
   candidates,  // Array of { content, ... }
   { topK: 5 }
);
```

### Library

High-level API for creating and managing library files.

```typescript
import { Library } from '@libragen/core';

// Create a new library
const library = await Library.create('./lib.libragen', {
   name: 'my-lib',
   version: '1.0.0',
   description: 'Description',
   agentDescription: 'Use this library for...',
   contentVersion: 'v2.0.0',
   contentVersionType: 'semver',
   keywords: ['typescript', 'utilities'],
   programmingLanguages: ['typescript'],
   textLanguages: ['en'],
   exampleQueries: ['how to parse JSON', 'error handling'],
});

// Add content
library.addChunks(chunks, embeddings);

// Close (automatically finalizes if chunks were added)
await library.close();

// Open existing library
const lib = await Library.open('./lib.libragen');
const metadata = lib.getMetadata();
await lib.close();

// Validate a library
const { valid, errors, warnings } = await Library.validate('./lib.libragen');
```

### Configuration

Get default paths for libragen data. These respect the `LIBRAGEN_HOME` environment variable.

```typescript
import {
   getLibragenHome,
   getDefaultLibraryDir,
   getDefaultManifestDir,
   getDefaultCollectionConfigDir,
   getModelCacheDir,
   detectProjectLibraryDir,
   hasProjectLibraryDir,
} from '@libragen/core';

// Get the base libragen directory
const home = getLibragenHome();
// macOS: ~/Library/Application Support/libragen
// Windows: %APPDATA%\libragen
// Linux: $XDG_DATA_HOME/libragen (defaults to ~/.local/share/libragen)
// Or: $LIBRAGEN_HOME if set

// Get specific directories
const librariesDir = getDefaultLibraryDir();  // $home/libraries
const manifestDir = getDefaultManifestDir();  // $home
const configDir = getDefaultCollectionConfigDir();  // $home
const modelDir = getModelCacheDir();  // $home/models (or LIBRAGEN_MODEL_CACHE)

// Project-local library detection
const projectDir = detectProjectLibraryDir();  // .libragen/libraries in cwd
const hasLocal = await hasProjectLibraryDir();  // true if directory exists
```

### LibraryManager

Manages installed libraries across multiple locations.

```typescript
import { LibraryManager } from '@libragen/core';

// Default: auto-detect .libragen/libraries in cwd + global directory
const manager = new LibraryManager();

// Or use explicit paths only (no global, no auto-detection)
const customManager = new LibraryManager({
   paths: ['.libragen/libraries', '/shared/libs'],
});

// Install a library (to first path in the list)
const installed = await manager.install('./lib.libragen', {
   force: true,   // Overwrite existing
});

// List installed libraries
const libraries = await manager.listInstalled();

// Find a specific library (searches paths in order)
const lib = await manager.find('my-lib');

// Uninstall
await manager.uninstall('my-lib');
```

**Options:**

```typescript
interface LibraryManagerOptions {
   // Explicit paths to use (excludes global and auto-detection)
   paths?: string[];

   // Auto-detect .libragen/libraries in cwd (default: true)
   autoDetect?: boolean;

   // Include global directory (default: true)
   includeGlobal?: boolean;

   // Current working directory for auto-detection
   cwd?: string;
}
```

### CollectionClient

Fetch libraries from remote collections.

```typescript
import { CollectionClient } from '@libragen/core';

const client = new CollectionClient();
await client.loadConfig();

// Add a collection
await client.addCollection({
   name: 'my-collection',
   url: 'https://example.com/collection.json',
   priority: 10,
});

// Search for libraries
const results = await client.search('react hooks');

// Get a specific library
const entry = await client.getEntry('some-library');

// Download
await client.download(entry, './downloaded.libragen');
```

### Sources

#### FileSource

Read files from the local filesystem.

```typescript
import { FileSource } from '@libragen/core';

const source = new FileSource();

const files = await source.getFiles({
   paths: ['./src', './docs'],
   patterns: ['**/*.ts', '**/*.md'],
   ignore: ['**/node_modules/**'],
   maxFileSize: 1024 * 1024,  // 1MB
});
```

#### GitSource

Clone and read files from git repositories. Automatically detects licenses from LICENSE files.

```typescript
import { GitSource } from '@libragen/core';

const source = new GitSource();

const result = await source.getFiles({
   url: 'https://github.com/user/repo',
   ref: 'main',
   depth: 1,
   patterns: ['**/*.ts'],
});

console.log(result.files);           // Array of source files
console.log(result.commitHash);      // Full commit SHA
console.log(result.detectedLicense); // { identifier: 'MIT', file: 'LICENSE', confidence: 'high' }

// Clean up temp directory for remote repos
if (result.tempDir) {
   await source.cleanup(result.tempDir);
}
```

#### LicenseDetector

Detect SPDX license identifiers from license files.

```typescript
import { LicenseDetector } from '@libragen/core';

const detector = new LicenseDetector();

// Detect from file content
const result = detector.detectFromContent(licenseText);
// { identifier: 'MIT', confidence: 'high' }

// Detect from a directory (checks LICENSE, LICENSE.md, COPYING, etc.)
const detected = await detector.detectFromDirectory('./my-project');
// { identifier: 'Apache-2.0', file: 'LICENSE', confidence: 'high' }
```

**Supported licenses:**

- MIT
- Apache-2.0
- GPL-3.0, GPL-2.0
- LGPL-3.0, LGPL-2.1
- BSD-3-Clause, BSD-2-Clause
- ISC
- Unlicense
- MPL-2.0
- CC0-1.0
- AGPL-3.0

#### Git URL Utilities

Helper functions for working with git URLs.

```typescript
import { isGitUrl, parseGitUrl, getAuthToken, detectGitProvider } from '@libragen/core';

// Check if a string is a git URL
isGitUrl('https://github.com/user/repo');  // true
isGitUrl('/local/path');  // false

// Parse a git URL into components
const parsed = parseGitUrl('https://github.com/vercel/next.js/tree/main/docs');
// { repoUrl: 'https://github.com/vercel/next.js', ref: 'main', path: 'docs' }

// Get auth token for a repo (checks environment variables)
const token = getAuthToken('https://github.com/user/repo');
// Checks GITHUB_TOKEN, GH_TOKEN for GitHub; GITLAB_TOKEN for GitLab, etc.

// Detect git provider from URL
detectGitProvider('https://github.com/user/repo');  // 'github'
detectGitProvider('https://gitlab.com/user/repo');  // 'gitlab'
```

### Migrations

Schema migration utilities for upgrading library files.

```typescript
import {
   MigrationRunner,
   CURRENT_SCHEMA_VERSION,
   MigrationRequiredError,
   SchemaVersionError,
} from '@libragen/core';

// Check and run migrations on a library
const runner = new MigrationRunner();

try {
   const result = await runner.migrateIfNeeded('./library.libragen');
   if (result.migrated) {
      console.log(`Migrated from v${result.fromVersion} to v${result.toVersion}`);
   }
} catch (e) {
   if (e instanceof MigrationRequiredError) {
      console.log('Migration required but not run (use force option)');
   }
   if (e instanceof SchemaVersionError) {
      console.log('Unsupported schema version');
   }
}

// Current schema version
console.log(CURRENT_SCHEMA_VERSION);  // e.g., 2
```

### Update Checking

Utilities for checking and applying library updates from collections.

```typescript
import {
   LibraryManager,
   CollectionClient,
   checkForUpdate,
   findUpdates,
   performUpdate,
} from '@libragen/core';

const manager = new LibraryManager();
const client = new CollectionClient();
await client.loadConfig();

// Get installed libraries
const installed = await manager.listInstalled();

// Find all available updates
const updates = await findUpdates(installed, client, { force: false });

for (const update of updates) {
   console.log(`${update.name}: ${update.currentVersion} → ${update.newVersion}`);

   // Apply the update
   await performUpdate(update, manager);
}

// Or check a single library
const lib = await manager.find('my-library');
const entry = await client.getEntry('my-library');

if (lib && entry) {
   const update = checkForUpdate(lib, entry);
   if (update) {
      await performUpdate(update, manager);
   }
}
```

**Types:**

```typescript
interface UpdateCandidate {
   name: string;
   currentVersion: string;
   currentContentVersion?: string;
   newVersion: string;
   newContentVersion?: string;
   source: string;  // Download URL
   location?: 'global' | 'project';
}

interface CheckUpdateOptions {
   force?: boolean;  // Update even if versions match
}
```

### Utilities

Helper functions for common operations.

```typescript
import { formatBytes, deriveGitLibraryName, formatDuration } from '@libragen/core';

// Format bytes into human-readable string
formatBytes(1536);      // "1.5 KB"
formatBytes(1048576);   // "1 MB"
formatBytes(0);         // "0 Bytes"

// Derive library name from git URL
deriveGitLibraryName('https://github.com/vercel/next.js.git');  // "vercel-next.js"
deriveGitLibraryName('https://github.com/microsoft/typescript'); // "microsoft-typescript"

// Format duration in seconds
formatDuration(45.5);   // "45.5s"
formatDuration(90);     // "1m 30s"
formatDuration(120);    // "2m"
```

### Time Estimation

Estimate embedding time based on system capabilities. Useful for providing user feedback during builds.

```typescript
import { getSystemInfo, estimateEmbeddingTime, formatSystemInfo } from '@libragen/core';

// Get system information
const info = getSystemInfo();
console.log(info.cpuModel);      // "Apple M2 Pro"
console.log(info.cpuCores);      // 12
console.log(info.totalMemoryGB); // 32
console.log(info.platform);      // "darwin"
console.log(info.arch);          // "arm64"

// Estimate time for embedding chunks
const estimate = estimateEmbeddingTime(500);
console.log(estimate.estimatedSeconds);  // 10
console.log(estimate.formattedTime);     // "10s"
console.log(estimate.chunksPerSecond);   // 50

// Format system info for display
const display = formatSystemInfo(info);
console.log(display);  // "Apple M2 Pro (12 cores)"
```

The estimation accounts for different CPU types:
- Apple Silicon (M1-M4): 35-55 chunks/second
- Intel/AMD x64: 10-30 chunks/second (scales with core count)
- ARM Linux: 8-20 chunks/second

## Library File Format

A `.libragen` file is a SQLite database with the following schema:

**Tables:**

*  `metadata` — Key-value store for library metadata
*  `chunks` — Code/documentation chunks with source info
*  `vec_chunks` — Virtual table for vector similarity search (sqlite-vec)
*  `chunks_fts` — FTS5 table for keyword search

**Metadata fields:**

```typescript
interface LibraryMetadata {
   name: string;
   version: string;
   description?: string;
   agentDescription?: string;
   contentVersion?: string;
   contentVersionType?: 'semver' | 'date' | 'commit';
   keywords?: string[];
   programmingLanguages?: string[];
   textLanguages?: string[];
   exampleQueries?: string[];
   createdAt: string;
   embedding: {
      model: string;
      dimensions: number;
   };
   chunking: {
      strategy: string;
      chunkSize: number;
      chunkOverlap: number;
   };
   stats: {
      chunkCount: number;
      sourceCount: number;
      fileSize: number;
   };
   contentHash: string;
   source?: {
      type: 'local' | 'git';
      path?: string;       // For local sources
      url?: string;        // For git sources
      ref?: string;        // Branch/tag name
      commitHash?: string; // Full commit SHA
      licenses?: string[]; // SPDX license identifiers
   };
}
```

## Collection Format

Collections are JSON files with the following structure:

```json
{
   "name": "My Collection",
   "description": "A collection of libraries",
   "libraries": [
      {
         "name": "my-library",
         "description": "A helpful library",
         "versions": [
            {
               "version": "1.0.0",
               "contentVersion": "v2.0.0",
               "contentVersionType": "semver",
               "downloadURL": "https://example.com/my-library-1.0.0.libragen",
               "contentHash": "sha256:abc123...",
               "fileSize": 1234567
            }
         ]
      }
   ]
}
```

## Related

*  [@libragen/cli](../cli) — Command-line interface
*  [@libragen/mcp](../mcp) — MCP server for AI assistants

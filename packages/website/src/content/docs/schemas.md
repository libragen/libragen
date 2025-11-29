---
title: Schemas
description: JSON schemas for libragen data structures
section: Reference
order: 20
---

Libragen uses JSON Schema to define its data structures. These schemas are versioned and available for validation and tooling integration.

## Schema URLs

All schemas are available at versioned URLs:

| Schema | URL |
|--------|-----|
| Library Metadata | [/schemas/v1/library-metadata.schema.json](/schemas/v1/library-metadata.schema.json) |
| Collection Index | [/schemas/v1/collection-index.schema.json](/schemas/v1/collection-index.schema.json) |
| Collection | [/schemas/v1/collection.schema.json](/schemas/v1/collection.schema.json) |
| Collection Item | [/schemas/v1/collection-item.schema.json](/schemas/v1/collection-item.schema.json) |

Use these URLs in your `$schema` field for validation:

```json
{
  "$schema": "https://libragen.dev/schemas/v1/library-metadata.schema.json",
  "name": "my-library",
  ...
}
```

## Library Metadata

**Schema:** [`/schemas/v1/library-metadata.schema.json`](/schemas/v1/library-metadata.schema.json)

Every `.libragen` file contains metadata describing its contents. This is stored in the library's SQLite database and returned by `libragen inspect`.

### Key Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Library name (e.g., "react-docs") |
| `version` | Yes | Library format version |
| `createdAt` | Yes | ISO 8601 creation timestamp |
| `contentVersion` | No | Version of source content |
| `description` | No | Short description |
| `agentDescription` | No | Guidance for AI agents |
| `exampleQueries` | No | Example queries this library answers |
| `keywords` | No | Searchable tags |
| `programmingLanguages` | No | Programming languages covered |
| `textLanguages` | No | Human/natural languages (ISO 639-1 codes) |
| `frameworks` | No | Frameworks covered |

### Example

```json
{
  "$schema": "https://libragen.dev/schemas/v1/library-metadata.schema.json",
  "name": "react-docs",
  "version": "1.0.0",
  "contentVersion": "19.0.0",
  "description": "Official React documentation",
  "agentDescription": "Use when users ask about React hooks, components, or JSX.",
  "exampleQueries": ["How do I use useEffect?"],
  "keywords": ["react", "frontend"],
  "programmingLanguages": ["javascript", "typescript"],
  "textLanguages": ["en"],
  "frameworks": ["react"],
  "createdAt": "2024-01-15T10:30:00Z",
  "embedding": {
    "model": "Xenova/bge-small-en-v1.5",
    "dimensions": 384
  },
  "chunking": {
    "strategy": "recursive",
    "chunkSize": 512,
    "chunkOverlap": 50
  },
  "stats": {
    "chunkCount": 8392,
    "sourceCount": 247,
    "fileSize": 12400000
  },
  "contentHash": "sha256:a1b2c3d4..."
}
```

## Collection Index

**Schema:** [`/schemas/v1/collection-index.schema.json`](/schemas/v1/collection-index.schema.json)

Collections serve a JSON index listing available libraries. Host this file at your collection URL.

### Key Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Collection name |
| `version` | Yes | Index format version (use "1.0") |
| `updatedAt` | Yes | ISO 8601 timestamp |
| `libraries` | Yes | Array of available libraries |

Each library version includes:

| Field | Required | Description |
|-------|----------|-------------|
| `version` | Yes | Library version |
| `downloadURL` | Yes | URL to download .libragen file |
| `contentHash` | Yes | SHA-256 hash for verification |
| `contentVersion` | No | Source content version |
| `fileSize` | No | File size in bytes |

### Example

```json
{
  "$schema": "https://libragen.dev/schemas/v1/collection-index.schema.json",
  "name": "frontend",
  "version": "1.0",
  "updatedAt": "2024-01-15T10:30:00Z",
  "libraries": [
    {
      "name": "react",
      "description": "Official React documentation",
      "versions": [
        {
          "version": "1.0.0",
          "contentVersion": "19.0.0",
          "downloadURL": "https://example.com/react-1.0.0.libragen",
          "contentHash": "sha256:a1b2c3d4e5f6...",
          "fileSize": 12400000
        }
      ]
    }
  ]
}
```

## Collection

**Schema:** [`/schemas/v1/collection.schema.json`](/schemas/v1/collection.schema.json)

A collection file that can be installed locally. Contains a list of libraries and/or nested collections.

### Example

```json
{
  "$schema": "https://libragen.dev/schemas/v1/collection.schema.json",
  "name": "my-team",
  "description": "Libraries for our team",
  "items": [
    { "library": "https://example.com/api-docs-1.0.0.libragen" },
    { "library": "./local-docs.libragen" },
    { "collection": "https://example.com/shared.json" }
  ]
}
```

## File Format

The `.libragen` file format is a SQLite database containing:

| Table | Description |
|-------|-------------|
| `metadata` | Key-value store for library metadata |
| `chunks` | Document chunks with content and source info |
| `embeddings` | Vector embeddings for each chunk |
| `fts_chunks` | Full-text search index |

The format is designed to be:

- **Portable** — Single file, no external dependencies
- **Queryable** — Standard SQLite, readable by any SQLite client
- **Efficient** — Optimized for hybrid vector + full-text search

## Versioning

Schemas are versioned using URL paths (e.g., `/schemas/v1/`). When breaking changes are introduced, a new version will be released (e.g., `/schemas/v2/`). Older versions remain available for backward compatibility.

Current version: **v1**

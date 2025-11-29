# Library Versioning Design Document

## Executive Summary

This document outlines best practices for versioning data files containing SQLite databases with vector embeddings, based on research into package managers (npm, Cargo), content-addressable systems (Git, OCI), ML model registries (HuggingFace), and provenance standards (W3C PROV-DM).

**Recommendation**: Libraries should be **immutable once published**, with a hybrid versioning scheme combining semantic versioning for human readability and content-addressable hashes for integrity verification.

---

## 1. Mutability: Immutable vs. Incremental Updates

### Recommendation: **Immutable Libraries**

Once a library is published with a version number, its contents should never change.

#### Rationale

| Approach | Pros | Cons |
|----------|------|------|
| **Immutable** | Reproducibility, caching, trust, simpler distribution | Larger downloads for updates |
| **Mutable/Incremental** | Bandwidth efficient | Complex merge logic, cache invalidation, trust issues, harder to reproduce |

**Key factors for immutability:**

1. **Reproducibility**: Users can always get exactly the same embeddings for a given version
2. **Caching**: CDNs and local caches work perfectly without invalidation concerns
3. **Trust**: Content hashes can verify integrity (like npm's `integrity` field)
4. **Simplicity**: No need for complex delta/patch mechanisms

**For updates**: Publish a new version. The CLI can provide commands to upgrade installed libraries.

---

## 2. Versioning Scheme

### Recommendation: **Modified Semantic Versioning**

Use `MAJOR.MINOR.PATCH` with embedding-model-aware semantics:

```
MAJOR - Breaking changes that invalidate existing embeddings
        - Embedding model change
        - Dimension change
        - Incompatible schema changes

MINOR - Backward-compatible additions
        - New sources ingested
        - Additional content chunks
        - New metadata fields

PATCH - Backward-compatible fixes
        - Metadata corrections
        - Re-chunking with same settings (if embeddings unchanged)
        - Documentation updates
```

### Content Hash for Integrity

In addition to semantic version, include a content-addressable hash:

```
library-name@1.2.3 (sha256:a1b2c3d4...)
```

This follows patterns from:
- **npm**: `integrity` field with `sha512-...`
- **OCI/Docker**: `digest: sha256:...` for every layer
- **Git**: SHA-1 (now SHA-256) for all objects

### Library Version vs. Content Version

There are **two distinct versioning concepts** that must be tracked separately:

| Concept | Description | Examples | Use Case |
|---------|-------------|----------|----------|
| **Library Version** | Version of the `.libragen` artifact itself | `1.0.0`, `2.1.3` | Package management, updates, compatibility |
| **Content Version** | Version of the source material indexed | `v1.74.0`, `abc123f`, `3.12`, `2024-01-15` | Querying specific documentation/code versions |

#### Why Both Matter

1. **Library version** changes when:
   - Embedding model changes (MAJOR)
   - New content is added (MINOR)
   - Metadata is fixed (PATCH)
   - Chunking strategy is updated

2. **Content version** reflects:
   - The git tag/commit of the source repository
   - The release version of documentation (e.g., Python 3.12 docs)
   - A revision number or GUID from the source system
   - A snapshot date for web content

#### Example: Same Content, Different Library Versions

```
rust-std@1.0.0 → content: Rust 1.74.0, embedding: bge-small-en-v1.5
rust-std@2.0.0 → content: Rust 1.74.0, embedding: bge-large-en-v1.5  ← Same content, new embeddings
```

#### Example: Same Library, Different Content Versions

A single library may index multiple content versions:

```
python-docs@1.0.0 → content versions: ["3.10", "3.11", "3.12"]
```

Or a library series may track content versions:

```
rust-std@1.0.0 → content: Rust 1.74.0
rust-std@1.1.0 → content: Rust 1.75.0
rust-std@1.2.0 → content: Rust 1.76.0
```

---

## 3. Embedding Model Version Tracking

### The Critical Issue

**Changing the embedding model invalidates ALL existing embeddings.** This is fundamentally different from code dependencies where APIs might be compatible.

### Recommendation: Treat Embedding Model as a "Breaking" Dependency

```yaml
embedding:
  model: "text-embedding-3-small"
  provider: "openai"
  version: "2024-01-25"  # API version or model checkpoint date
  dimensions: 1536

  # Fingerprint for exact reproducibility
  model_hash: "sha256:..."  # Hash of model weights if local, or API version hash
```

### Version Implications

| Change | Version Bump |
|--------|--------------|
| Same model, add content | MINOR |
| Same model, fix metadata | PATCH |
| Different model | MAJOR |
| Same model family, new version | MAJOR (embeddings differ) |

### Migration Path

When a library author wants to update the embedding model:
1. Publish as new MAJOR version
2. Old versions remain available
3. Users explicitly opt-in to upgrade
4. Document migration: "v2 uses text-embedding-3-large, incompatible with v1 embeddings"

---

## 4. Metadata Schema for Registry Discoverability

### Core Schema (Required)

```yaml
# library.yaml - embedded in .libragen file or separate manifest
schema_version: "1.0"

# === Identity ===
name: "rust-std"                    # Unique identifier (like npm package name)
version: "1.2.3"                    # Semantic version of the LIBRARY artifact
content_hash: "sha256:abc123..."    # Hash of the entire library file

# === Content Version (for querying by source version) ===
content_version: "1.74.0"           # Primary content version (for single-source libraries)
content_version_type: "semver"      # semver | commit | date | revision | custom
content_versions:                   # For multi-source or multi-version libraries
  - version: "1.74.0"
    type: "semver"
    source_index: 0
  - version: "1.74.0"
    type: "semver"
    source_index: 1

# === Descriptive ===
display_name: "Rust Standard Library"
description: "Vector embeddings of the Rust standard library documentation"
keywords: ["rust", "stdlib", "documentation", "programming"]
license: "MIT OR Apache-2.0"        # SPDX expression

# === Authorship ===
author:
  name: "Jane Developer"
  email: "jane@example.com"
  url: "https://github.com/jane"

maintainers:                        # Optional additional maintainers
  - name: "Team Member"
    email: "team@example.com"

# === Repository & Links ===
repository:
  type: "git"
  url: "https://github.com/jane/rust-std-embeddings"

homepage: "https://rust-std-embeddings.dev"
documentation: "https://rust-std-embeddings.dev/docs"
```

### Embedding Configuration (Required)

```yaml
# === Embedding Details ===
embedding:
  model: "text-embedding-3-small"
  provider: "openai"
  version: "2024-01-25"
  dimensions: 1536

  # For local models, include more detail
  # model_hash: "sha256:..."
  # quantization: "fp16"

# === Chunking Configuration ===
chunking:
  strategy: "semantic"              # semantic, fixed, markdown-aware
  target_tokens: 512
  overlap_tokens: 50

  # Strategy-specific settings
  settings:
    respect_headers: true
    code_block_handling: "preserve"
```

### Source Provenance (Required)

```yaml
# === Sources ===
sources:
  - type: "git"
    url: "https://github.com/rust-lang/rust"
    ref: "1.74.0"                   # Tag, branch, or commit
    commit: "f2702e922ba31e49d6167f5b87e4aa0718012303"
    content_version: "1.74.0"       # Human-readable version of the content
    content_version_type: "semver"  # semver | commit | date | revision | custom
    paths:
      - "library/std/src/**/*.rs"
      - "library/core/src/**/*.rs"
    retrieved_at: "2024-01-15T10:30:00Z"

  - type: "url"
    url: "https://doc.rust-lang.org/std/"
    retrieved_at: "2024-01-15T10:35:00Z"
    content_version: "1.74.0"       # Version of the docs
    content_version_type: "semver"
    content_hash: "sha256:..."      # Hash of retrieved content

  - type: "local"
    path: "./additional-docs/"
    description: "Curated examples and tutorials"
    content_version: "2024-01-15"   # Snapshot date
    content_version_type: "date"

# === Build Information ===
build:
  tool: "libragen"
  tool_version: "0.5.0"
  created_at: "2024-01-15T12:00:00Z"
  build_host: "github-actions"      # Optional
```

### Statistics (Auto-generated)

```yaml
# === Content Statistics ===
stats:
  total_chunks: 15432
  total_documents: 847
  total_tokens: 7891234             # Approximate
  file_size_bytes: 125829120        # 120 MB

  # Per-source breakdown
  source_stats:
    - source_index: 0
      chunks: 12000
      documents: 700
    - source_index: 1
      chunks: 3432
      documents: 147
```

### Compatibility & Dependencies (Optional)

```yaml
# === Compatibility ===
compatibility:
  libragen_version: ">=0.5.0"         # Minimum CLI version

# === Related Libraries ===
extends:                            # This library builds on another
  name: "rust-core"
  version: "^1.0.0"

supersedes:                         # This replaces an older library
  name: "rust-docs-legacy"
  version: "<2.0.0"

# === Versioning Hints ===
versioning:
  deprecation_notice: null          # Or "Use rust-std-v2 instead"
  end_of_life: null                 # Or "2025-01-01"
  new_version: null                 # Or "rust-std@2.0.0"
```

---

## 5. Source Provenance Tracking

### Principles (from W3C PROV-DM)

The provenance model tracks:
- **Entities**: The library, source documents, embeddings
- **Activities**: Fetching, chunking, embedding
- **Agents**: The user/system that created the library

### Minimum Required Provenance

```yaml
provenance:
  # What was the input?
  sources:
    - uri: "https://github.com/rust-lang/rust"
      type: "git"
      commit: "f2702e922ba31e49d6167f5b87e4aa0718012303"
      retrieved_at: "2024-01-15T10:30:00Z"

  # How was it transformed?
  activities:
    - action: "chunk"
      strategy: "semantic"
      parameters:
        target_tokens: 512
    - action: "embed"
      model: "text-embedding-3-small"
      provider: "openai"

  # Who/what created it?
  agents:
    - type: "software"
      name: "libragen"
      version: "0.5.0"
    - type: "person"
      name: "Jane Developer"
```

### Git-like Provenance Chain

For libraries that build on others:

```yaml
provenance:
  # Parent library (like git parent commit)
  derived_from:
    - library: "rust-std@1.1.0"
      content_hash: "sha256:..."
      relationship: "extends"       # extends, updates, replaces

  # What changed?
  changes:
    - type: "add_source"
      description: "Added Rust 1.75 documentation"
    - type: "update_source"
      description: "Updated std library docs"
```

---

## 6. Complete Schema Example

```yaml
# ===== LIBRARY MANIFEST =====
# Embedded as metadata.yaml within the .libragen file (SQLite + metadata)

schema_version: "1.0"

# --- Identity ---
name: "rust-std"
version: "1.2.3"                     # Library artifact version
content_hash: "sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"

# --- Content Version ---
content_version: "1.74.0"            # Primary content version for easy querying
content_version_type: "semver"       # semver | commit | date | revision | custom

# --- Description ---
display_name: "Rust Standard Library Documentation"
description: |
  Comprehensive vector embeddings of the Rust standard library,
  including std, core, and alloc crates. Optimized for code
  assistance and documentation lookup.
keywords: ["rust", "stdlib", "documentation", "programming", "systems"]
license: "MIT OR Apache-2.0"

# --- Author ---
author:
  name: "Jane Developer"
  email: "jane@example.com"
  url: "https://github.com/jane"

repository:
  type: "git"
  url: "https://github.com/jane/rust-std-lib"

# --- Embedding Configuration ---
embedding:
  model: "text-embedding-3-small"
  provider: "openai"
  version: "2024-01-25"
  dimensions: 1536

chunking:
  strategy: "semantic"
  target_tokens: 512
  overlap_tokens: 50
  settings:
    respect_headers: true
    code_block_handling: "preserve"
    language: "rust"

# --- Sources ---
sources:
  - type: "git"
    url: "https://github.com/rust-lang/rust"
    ref: "1.74.0"
    commit: "f2702e922ba31e49d6167f5b87e4aa0718012303"
    content_version: "1.74.0"
    content_version_type: "semver"
    paths: ["library/std/src/**/*.rs"]
    retrieved_at: "2024-01-15T10:30:00Z"

  - type: "url"
    url: "https://doc.rust-lang.org/std/"
    content_version: "1.74.0"
    content_version_type: "semver"
    retrieved_at: "2024-01-15T10:35:00Z"
    content_hash: "sha256:abc123..."

# --- Build Info ---
build:
  tool: "libragen"
  tool_version: "0.5.0"
  created_at: "2024-01-15T12:00:00Z"

# --- Statistics ---
stats:
  total_chunks: 15432
  total_documents: 847
  file_size_bytes: 125829120

# --- Compatibility ---
compatibility:
  libragen_version: ">=0.5.0"

# --- Provenance ---
provenance:
  derived_from: null  # First version, no parent
  agents:
    - type: "person"
      name: "Jane Developer"
```

---

## 7. File Format Recommendation

### Option A: Single SQLite File with Metadata Table (Recommended)

```
library.libragen(SQLite file)
├── metadata          (JSON blob in a table)
├── chunks            (text content)
├── embeddings        (BLOB or vec0 extension)
├── sources           (source tracking)
└── fts_index         (full-text search)
```

**Pros**: Single file, SQLite's robustness, atomic operations
**Cons**: Metadata extraction requires opening DB

### Option B: Archive with Separate Manifest

```
library.libragen.tar.gz
├── manifest.yaml     (metadata)
├── library.db        (SQLite with embeddings)
└── PROVENANCE.json   (detailed provenance)
```

**Pros**: Manifest readable without extracting
**Cons**: More complex, two files to manage

### Recommendation: Option A with Magic Header

Use SQLite but store manifest in first table with known schema, allowing quick metadata extraction without full DB parsing:

```sql
CREATE TABLE _libragen_manifest (
    key TEXT PRIMARY KEY,
    value TEXT  -- JSON
);

-- Single row with full manifest
INSERT INTO _libragen_manifest VALUES ('manifest', '{...}');

-- Or structured for quick queries
INSERT INTO _libragen_manifest VALUES ('name', '"rust-std"');
INSERT INTO _libragen_manifest VALUES ('version', '"1.2.3"');
INSERT INTO _libragen_manifest VALUES ('content_hash', '"sha256:..."');
```

---

## 8. User Experience for Updates

### Listing Available Updates

```bash
$ libragen update --check
rust-std: 1.2.3 → 1.3.0 available (minor: new sources)
python-docs: 3.12.0 → 4.0.0 available (major: new embedding model)
```

### Update Commands

```bash
# Update to latest compatible version (same major)
$ libragen update rust-std

# Update to specific version
$ libragen update rust-std@1.3.0

# Update all libraries (respecting major version)
$ libragen update --all

# Force major version upgrade (requires confirmation)
$ libragen update python-docs@4.0.0
⚠️  Major version change: embedding model changed from text-embedding-ada-002 to text-embedding-3-small
    This may affect search result relevance. Continue? [y/N]
```

### Version Pinning

```yaml
# libragen.yaml or .libragen/config.yaml
libraries:
  rust-std: "^1.2.0"      # Compatible with 1.x.x
  python-docs: "~3.12.0"  # Only patch updates
  custom-lib: "=2.0.0"    # Exact version
```

### Querying by Content Version

Users often need to query specific versions of documentation or codebases:

```bash
# List installed libraries with their content versions
$ libragen list --verbose
rust-std@1.2.3 (content: Rust 1.74.0, 15432 chunks)
python-docs@1.0.0 (content: Python 3.12, 8721 chunks)

# Query a specific content version (if library has multiple)
$ libragen query "async await" --library python-docs --content-version 3.11

# Find libraries by content version
$ libragen search --content-version "1.74.0"
rust-std@1.2.3 (content: Rust 1.74.0)
rust-core@1.1.0 (content: Rust 1.74.0)

# Install library for specific content version
$ libragen install rust-std --content-version 1.74.0
```

### Content Version in Query Results

Query results should include content version metadata:

```json
{
  "chunks": [
    {
      "content": "The async/await syntax...",
      "source": {
        "file": "library/std/src/future.rs",
        "content_version": "1.74.0",
        "content_version_type": "semver"
      },
      "score": 0.89
    }
  ]
}
```

---

## 9. Registry API Design

### Endpoints

```
GET /v1/libraries                           # List all
GET /v1/libraries/{name}                    # Get library info
GET /v1/libraries/{name}/versions           # List versions
GET /v1/libraries/{name}/{version}          # Get specific version metadata
GET /v1/libraries/{name}/{version}/download # Download .libragen file

POST /v1/libraries                          # Publish new library
PUT /v1/libraries/{name}/{version}/yank     # Yank (soft-delete) version
```

### Search & Discovery

```
GET /v1/search?q=rust&embedding_model=text-embedding-3-small
GET /v1/search?keywords=documentation,programming
GET /v1/search?content_version=1.74.0          # Find libraries with specific content version
GET /v1/search?content_version_type=semver     # Filter by version type
GET /v1/libraries?sort=downloads&limit=50
```

### Response Format

```json
{
  "name": "rust-std",
  "version": "1.2.3",
  "content_version": "1.74.0",
  "content_version_type": "semver",
  "content_hash": "sha256:9f86d081...",
  "display_name": "Rust Standard Library",
  "description": "...",
  "embedding": {
    "model": "text-embedding-3-small",
    "dimensions": 1536
  },
  "stats": {
    "chunks": 15432,
    "size_bytes": 125829120
  },
  "download_url": "https://registry.libragen.dev/v1/libraries/rust-std/1.2.3/download",
  "published_at": "2024-01-15T12:00:00Z",
  "downloads": 1523
}
```

---

## 10. Summary of Recommendations

| Aspect | Recommendation |
|--------|----------------|
| **Mutability** | Immutable once published |
| **Library Version** | Semantic versioning (MAJOR.MINOR.PATCH) for the artifact |
| **Content Version** | Track source material version (semver, commit, date, revision, custom) |
| **Breaking Changes** | Embedding model change = MAJOR bump |
| **Integrity** | SHA-256 content hash for every version |
| **Metadata** | Structured YAML/JSON manifest in SQLite |
| **Provenance** | Track sources with commits, timestamps, content hashes, content versions |
| **File Format** | Single SQLite file with `_libragen_manifest` table |
| **Updates** | Explicit user action, warn on major version changes |
| **Registry** | RESTful API with search, filtering by embedding model and content version |
| **Querying** | Support filtering by content version in CLI and API |

---

## Appendix: Comparison with Existing Systems

| System | Versioning | Immutability | Content Hash | Provenance |
|--------|------------|--------------|--------------|------------|
| npm | SemVer | ✅ | SHA-512 integrity | repository field |
| Cargo | SemVer | ✅ | Checksum | Cargo.toml metadata |
| Docker/OCI | Tags + Digest | ✅ | SHA-256 digest | Labels/annotations |
| Git | SHA commits | ✅ | SHA-1/256 | Commit history |
| HuggingFace | Model cards | ❌ (can update) | Git-based | base_model field |
| **libragen** | SemVer | ✅ | SHA-256 | Full provenance chain |

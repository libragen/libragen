<p align="center">
  <img src="packages/website/public/favicon.svg" alt="Libragen Logo" width="80" height="80">
</p>

<h1 align="center">libragen</h1>

<p align="center">
  <em>(pronounced "LIB-ruh-jen")</em>
</p>

<p align="center">
  <strong>Stop your AI from hallucinating code, and ground it in your actual documentation</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@libragen/cli"><img src="https://img.shields.io/npm/v/@libragen/cli.svg?label=cli" alt="npm cli"></a>
  <a href="https://www.npmjs.com/package/@libragen/core"><img src="https://img.shields.io/npm/v/@libragen/core.svg?label=core" alt="npm core"></a>
  <a href="https://www.npmjs.com/package/@libragen/mcp"><img src="https://img.shields.io/npm/v/@libragen/mcp.svg?label=mcp" alt="npm mcp"></a>
  <a href="https://github.com/libragen/libragen/actions"><img src="https://github.com/libragen/libragen/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/libragen/libragen/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License"></a>
</p>

<p align="center">
  <a href="https://libragen.dev">Documentation</a> •
  <a href="https://libragen.dev/docs/getting-started">Getting Started</a> •
  <a href="https://github.com/libragen/libragen/discussions">Discussions</a>
</p>

---

Create private, local RAG libraries that ground your AI in real documentation—not 2-year-old training data. No cloud, no API keys, just single files you can share with your whole team.

> **What's RAG?** Retrieval-Augmented Generation lets AI retrieve relevant context before responding, instead of relying solely on training data. libragen packages your docs into searchable libraries your AI can query.

## 🎯 Why libragen?

- **Ground AI in truth** — Give your coding agents authoritative docs to cite, dramatically reducing hallucinations
- **Always current** — Rebuild libraries when docs change; your AI gets the latest APIs, not stale training data
- **Private & local** — Everything runs on your machine. No API keys, no cloud bills, no data leaving your network
- **Shareable** — Single `.libragen` files work anywhere. Share via git, S3, or install from curated collections

## ✨ Features

- **� Hybrid Search** — Combines vector similarity with BM25 keyword matching
- **📊 Reranking** — Optional cross-encoder reranking for improved relevance
- **📦 Portable** — Single-file SQLite databases with embedded vectors
- **🧠 Smart Chunking** — Language-aware splitting that respects code boundaries
- **🌐 Multiple Sources** — Build from local files or git repositories
- **🤖 MCP Native** — Works directly in Claude Desktop, VS Code, and any MCP client

## 📦 Packages

| Package | Description |
|---------|-------------|
| [`@libragen/core`](./packages/core) | Core library for embedding, chunking, storage |
| [`@libragen/cli`](./packages/cli) | Command-line interface for building and querying |
| [`@libragen/mcp`](./packages/mcp) | Model Context Protocol server for AI assistants |

## 🚀 Quick Start

### Installation

```bash
npm install -g @libragen/cli
```

### Build a Library

```bash
# From your internal docs
libragen build ./internal-api-docs --name internal-api

# From a private git repository
libragen build https://github.com/your-org/private-docs -o company-docs.libragen

# From any public repo
libragen build https://github.com/facebook/react -o react.libragen
```

### Query a Library

```bash
libragen query "how to authenticate users" -l my-project.libragen
```

### Use with AI Assistants

Install the MCP server globally:

```bash
npm install -g @libragen/mcp
```

Add to your Claude Desktop config (on macOS:
`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
   "mcpServers": {
      "libragen": {
         "command": "npx",
         "args": ["-y", "@libragen/mcp"]
      }
   }
}
```

Then install libraries to make them available:

```bash
libragen install my-project.libragen
```

## � CLI Commands

| Command | Description |
|---------|-------------|
| `build <source>` | Build a library from files or git repo |
| `query <query>` | Search a library for relevant content |
| `info <library>` | Display library metadata |
| `list` | List installed libraries and collections |
| `install <source>` | Install a library or collection |
| `uninstall <name>` | Remove an installed library or collection |
| `update [name]` | Update installed libraries to newer versions |
| `collection create` | Create a collection file |
| `config` | Display configuration and paths |
| `completions <action>` | Manage shell completions (bash, zsh, fish) |

## 📚 Collections

Collections are JSON files that group libraries together for easy installation:

```json
{
   "name": "my-stack",
   "description": "Libraries for my project",
   "version": "1.0.0",
   "items": [
      { "library": "https://example.com/react.libragen" },
      { "library": "https://example.com/typescript.libragen" },
      { "library": "https://example.com/testing.libragen", "required": false },
      { "collection": "https://example.com/base-web.json" }
   ]
}
```

Create a collection:

```bash
# Initialize a template
libragen collection init my-stack.json

# Or create with libraries directly
libragen collection create my-stack.json \
   -l ./react.libragen \
   -l ./typescript.libragen \
   -o ./testing.libragen
```

Install a collection:

```bash
libragen install ./my-stack.json        # Required libraries only
libragen install ./my-stack.json --all  # Include optional libraries
```

Collections support:

- **Nesting** — Collections can include other collections
- **Deduplication** — Libraries are only installed once
- **Optional items** — Mark libraries as `"required": false`
- **Reference counting** — Uninstalling removes only unreferenced libraries

## ⚙️ Configuration

### Storage Location

By default, libragen stores libraries and configuration in a platform-specific directory:

| Platform | Default Location                                                  |
| -------- | ----------------------------------------------------------------- |
| macOS    | `~/Library/Application Support/libragen`                          |
| Windows  | `%APPDATA%\libragen`                                              |
| Linux    | `$XDG_DATA_HOME/libragen` (defaults to `~/.local/share/libragen`) |

Override this by setting the `LIBRAGEN_HOME` environment variable:

```bash
export LIBRAGEN_HOME=/custom/path/to/libragen
```

The directory structure is:

```text
$LIBRAGEN_HOME/
  libraries/       # Installed .libragen files
  manifest.json    # Tracks installed libraries and collections
  collections.json # Collection configuration
  cache/           # Cached collection indexes
```

## 📄 Library Format

A `.libragen` file is a SQLite database containing:

- **Metadata** — Library name, version, description, embedding model info
- **Chunks** — Code/documentation segments with source file info
- **Embeddings** — Vector representations using `Xenova/bge-small-en-v1.5` (384 dims)
- **FTS Index** — Full-text search index for keyword matching

## 📖 Programmatic Usage

Use `@libragen/core` directly in your TypeScript/JavaScript projects:

```typescript
import { Library, Searcher } from '@libragen/core';

// Open an existing library and search it
const library = await Library.open('./my-docs.libragen');
const searcher = new Searcher(library.store);

const results = await searcher.search('how do I authenticate?', {
   limit: 5,
   rerank: true,  // Use cross-encoder reranking
});

for (const result of results) {
   console.log(`[${result.score.toFixed(3)}] ${result.filePath}`);
   console.log(result.content);
}
```

```typescript
import { Library, Embedder, Chunker, FileSource } from '@libragen/core';

// Build a library from scratch
const library = await Library.create('./output.libragen', {
   name: 'my-docs',
   description: 'Internal API documentation',
});

const source = new FileSource('./docs', { extensions: ['.md', '.mdx'] });
const files = await source.getFiles();

const chunker = new Chunker();
const embedder = new Embedder();
await embedder.initialize();

for (const file of files) {
   const chunks = chunker.chunk(file.content, { filePath: file.path });
   const embeddings = await embedder.embedBatch(chunks.map(c => c.content));
   await library.store.addChunks(chunks, embeddings);
}

await library.close();
```

## 🛠️ Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run linting
npm run standards

# Build all packages
npm run build
```

## 🏗️ Architecture

```text
@libragen/cli (build, query, install, manage)
        │
        ▼
@libragen/core
  ├── Embedder (bge-small-en-v1.5)
  ├── Chunker (language-aware splitting)
  ├── VectorStore (SQLite + sqlite-vec + FTS5)
  ├── Searcher (hybrid search with RRF)
  ├── Reranker (mxbai-rerank-xsmall-v1)
  ├── Library (create/open/validate)
  ├── LibraryManager (install/uninstall/update)
  ├── Manifest (tracks installations)
  ├── CollectionResolver (nested collections)
  └── Sources (FileSource, GitSource)
        │
        ▼
@libragen/mcp (MCP server for AI assistants)
  Tools: libragen_search, libragen_list, libragen_build,
         libragen_install, libragen_uninstall, libragen_update,
         libragen_collection
```

## 🙏 Acknowledgments

libragen uses the following open-source models:

- **[BGE-small-en-v1.5](https://huggingface.co/BAAI/bge-small-en-v1.5)** — Embedding model by BAAI (MIT License)
- **[mxbai-rerank-xsmall-v1][mxbai]** — Reranking model by Mixedbread (Apache-2.0)

[mxbai]: https://huggingface.co/mixedbread-ai/mxbai-rerank-xsmall-v1

If you use libragen in academic work, please cite the underlying models:

```bibtex
@misc{bge_embedding,
   title={C-Pack: Packaged Resources To Advance General Chinese Embedding},
   author={Shitao Xiao and Zheng Liu and Peitian Zhang and Niklas Muennighoff},
   year={2023},
   eprint={2309.07597},
   archivePrefix={arXiv},
   primaryClass={cs.CL}
}

@online{rerank2024mxbai,
   title={Boost Your Search With The Crispy Mixedbread Rerank Models},
   author={Aamir Shakir and Darius Koenig and Julius Lipp and Sean Lee},
   year={2024},
   url={https://www.mixedbread.ai/blog/mxbai-rerank-v1},
}
```

## 📜 License

MIT — see [LICENSE](./LICENSE) for details.

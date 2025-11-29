---
title: "Package React Docs for AI"
description: Step-by-step guide to creating a searchable RAG library from React documentation
section: Tutorials
order: 15
---

In this tutorial, you'll create a libragen library from the React documentation. By the end, you'll have a searchable library that any AI tool can query for accurate React answers.

**Time required:** ~10 minutes

**What you'll learn:**

- Downloading documentation from a repository
- Building a library with custom metadata
- Querying the library from CLI and MCP
- Versioning and updating libraries

## Prerequisites

- Node.js 20 or later
- Basic familiarity with the command line

## Step 1: Get the React Documentation

First, let's download the React documentation. The React team maintains their docs as MDX files in their GitHub repository.

```bash
# Create a working directory
mkdir react-library && cd react-library

# Clone just the docs (sparse checkout)
git clone --depth 1 --filter=blob:none --sparse \
  https://github.com/reactjs/react.dev.git
cd react.dev
git sparse-checkout set src/content/reference src/content/learn
```

You now have the React reference and learning docs locally.

## Step 2: Build the Library

Build a libragen library from the documentation:

```bash
libragen build ./src/content \
  --name react-docs \
  --description "React documentation including hooks, components, and APIs" \
  --content-version 19.0.0
```

You'll see output like:

```
Processing files...
  ✓ 142 files processed
  ✓ 1,847 chunks created
  ✓ Embeddings generated
  ✓ Full-text index built

Library saved: react-docs-19.0.0.libragen (12.4 MB)
```

The library is now ready to use.

## Step 3: Query from the CLI

Test your library with a query:

```bash
libragen query --library react-docs "When should I use useEffect vs useLayoutEffect?"
```

You'll get results with relevance scores:

```
Results for: "When should I use useEffect vs useLayoutEffect?"

[0.92] reference/react/useLayoutEffect.md
  useLayoutEffect is a version of useEffect that fires before the browser
  repaints the screen. useLayoutEffect can hurt performance. Prefer useEffect
  when possible...

[0.89] reference/react/useEffect.md
  useEffect is a React Hook that lets you synchronize a component with an
  external system. Effects run after render, so they don't block painting...

[0.84] learn/synchronizing-with-effects.md
  Some components need to synchronize with external systems. For example,
  you might want to control a non-React component based on React state...
```

## Step 4: Use with Your AI Tool

### Option A: MCP Integration (Recommended)

Install the MCP server for your AI tool:

```bash
npx -y install-mcp @libragen/mcp
```

This automatically configures Claude Desktop, Cursor, Windsurf, or other MCP-compatible tools. Now you can ask your AI:

> "Using my React library, explain the difference between controlled and uncontrolled components"

The AI will search your library and provide accurate, grounded answers.

### Option B: Programmatic Access

Use the library in your own code:

```typescript
import { Searcher, VectorStore } from '@libragen/core';

const store = await VectorStore.open('react-docs');
const searcher = new Searcher(store);

const results = await searcher.search('useState best practices', { topK: 5 });

for (const result of results) {
  console.log(`[${result.score.toFixed(2)}] ${result.source}`);
  console.log(result.content);
}
```

## Step 5: Update When React Updates

When a new React version is released, update your library:

```bash
# Pull latest docs
cd react.dev
git pull

# Rebuild with new version
libragen build ./src/content \
  --name react-docs \
  --content-version 19.1.0
```

Both versions are now available. Query a specific version:

```bash
libragen query \
  --library react-docs \
  --content-version 19.0.0 \
  "useEffect cleanup"
```

## Step 6: Share Your Library

### Option A: Direct File Sharing

The `.libragen` file is self-contained. Share it via:

- File hosting (S3, GitHub Releases, etc.)
- Direct transfer
- Package registry

Others can install it:

```bash
libragen install ./react-docs-19.0.0.libragen
```

### Option B: Add to a Collection

Create a collection manifest to bundle related libraries:

```json
{
  "name": "frontend-stack",
  "description": "Frontend development documentation",
  "libraries": [
    {
      "name": "react-docs",
      "url": "https://example.com/react-docs-19.0.0.libragen"
    },
    {
      "name": "typescript-docs",
      "url": "https://example.com/typescript-docs-5.7.0.libragen"
    }
  ]
}
```

Others can install the entire collection:

```bash
libragen install --collection https://example.com/frontend-stack.json
```

## Troubleshooting

### "Out of memory" during embedding

Large documentation sets may need more memory:

```bash
NODE_OPTIONS="--max-old-space-size=8192" libragen build ./docs
```

### Slow embedding generation

Use the `--batch-size` flag to process fewer chunks at once:

```bash
libragen build ./docs --batch-size 50
```

### Files not being processed

Check that your files have supported extensions (`.md`, `.mdx`, `.txt`, `.html`). Use `--include` to add custom patterns:

```bash
libragen build ./docs --include "**/*.rst"
```

## Next Steps

Now that you've built your first library:

- [Building Libraries](/docs/building) - Advanced options like chunking strategies
- [CI Integration](/docs/ci-integration) - Automate builds on every release
- [Collections](/docs/collections) - Create and publish collection manifests
- [API Reference](/docs/api) - Use libragen programmatically

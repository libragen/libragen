---
title: "Make Your Obsidian Vault AI-Searchable"
description: Turn your personal Obsidian notes into a private RAG library for AI assistants
section: Tutorials
order: 16
---

Your Obsidian vault contains years of notes, ideas, and knowledge. In this tutorial, you'll package it as a libragen library so AI tools can search your personal knowledge base—completely offline and private.

**Time required:** ~5 minutes

**What you'll learn:**

- Building a library from an Obsidian vault
- Handling wiki-links and frontmatter
- Querying your notes with AI
- Keeping your library in sync

## Why This Matters

When you ask an AI assistant a question, it only knows what's in its training data. But your Obsidian vault contains:

- Meeting notes and decisions
- Project documentation
- Research and learning notes
- Personal workflows and processes

With libragen, your AI can search your actual notes and give you answers grounded in your own knowledge.

## Prerequisites

- Node.js 20 or later
- An Obsidian vault with markdown notes

## Step 1: Build from Your Vault

Point libragen at your Obsidian vault directory:

```bash
libragen build ~/Documents/ObsidianVault \
  --name my-brain \
  --description "My personal knowledge base"
```

Libragen processes all `.md` files recursively, including nested folders.

### Excluding Folders

Skip templates, daily notes, or other folders you don't want indexed:

```bash
libragen build ~/Documents/ObsidianVault \
  --name my-brain \
  --exclude "**/Templates/**" \
  --exclude "**/Daily Notes/**" \
  --exclude "**/.obsidian/**"
```

### Including Attachments

If you have text-based attachments (like `.txt` files), include them:

```bash
libragen build ~/Documents/ObsidianVault \
  --name my-brain \
  --include "**/*.md" \
  --include "**/*.txt"
```

## Step 2: Test Your Library

Query your notes from the command line:

```bash
libragen query --library my-brain "What did we decide about the API redesign?"
```

You'll see results from your actual notes:

```
Results for: "What did we decide about the API redesign?"

[0.91] Projects/API Redesign/Meeting Notes 2024-03-15.md
  Decision: We'll use REST for public endpoints and GraphQL for internal
  dashboard. Timeline is Q2. Sarah owns the migration plan...

[0.87] Projects/API Redesign/Architecture.md
  The new API will follow resource-oriented design. Authentication moves
  to JWT with refresh tokens. Rate limiting at 1000 req/min...

[0.82] Areas/Engineering/Technical Decisions.md
  API Redesign: Approved 2024-03-15. See [[API Redesign/Meeting Notes]]
  for full context...
```

## Step 3: Connect to Your AI Tool

### Claude Desktop, Cursor, or Windsurf

Install the MCP server:

```bash
npx -y install-mcp @libragen/mcp
```

Now you can ask Claude or your AI coding assistant:

> "Search my notes for everything about the onboarding flow redesign"

> "What were the key points from my 1:1 with Sarah last month?"

> "Find my notes on Kubernetes networking"

The AI searches your library and responds with information from your actual notes.

### Privacy Note

Your notes never leave your machine. Libragen runs entirely locally:

- Embeddings are generated on your device
- The library file stays on your disk
- MCP queries happen locally
- No data is sent to any cloud service

## Step 4: Keep It Updated

Your vault changes constantly. Rebuild periodically to keep your library current.

### Manual Rebuild

```bash
libragen build ~/Documents/ObsidianVault \
  --name my-brain \
  --description "My personal knowledge base"
```

This overwrites the previous version.

### Automated Rebuild with a Script

Create a simple update script (`update-brain.sh`):

```bash
#!/bin/bash
libragen build ~/Documents/ObsidianVault \
  --name my-brain \
  --description "My personal knowledge base - Updated $(date +%Y-%m-%d)" \
  --exclude "**/Templates/**" \
  --exclude "**/Daily Notes/**" \
  --exclude "**/.obsidian/**"

echo "✓ Library updated at $(date)"
```

Run it weekly or whenever you've added significant notes.

### Automated Rebuild with Cron (macOS/Linux)

Update daily at 6 AM:

```bash
# Edit crontab
crontab -e

# Add this line
0 6 * * * /path/to/update-brain.sh >> /tmp/libragen-update.log 2>&1
```

## Advanced: Handling Obsidian Features

### Wiki-Links

Libragen preserves wiki-link syntax (`[[Note Name]]`) in the indexed content. When you query, results may include these links, helping you find related notes.

### Frontmatter

YAML frontmatter is included in the searchable content. If your notes have metadata like:

```yaml
---
tags: [project, api, architecture]
status: in-progress
owner: Sarah
---
```

You can search for it:

```bash
libragen query --library my-brain "notes owned by Sarah"
```

### Dataview Queries

Dataview query blocks are indexed as-is. While libragen won't execute them, the query text itself becomes searchable, which can help you find notes with specific query patterns.

### Canvas Files

Obsidian canvas files (`.canvas`) are JSON and won't be processed by default. If you want to index them, you'd need to extract the text content first.

## Tips for Better Results

### 1. Use Descriptive Titles

Notes with clear titles rank higher in search:

- ✅ `API Redesign - Architecture Decision Record`
- ❌ `Untitled 23`

### 2. Add Context to Notes

Include project names, people, and dates in your notes. This makes semantic search more effective:

```markdown
## Meeting: API Redesign Kickoff
**Date:** 2024-03-15
**Attendees:** Sarah, Mike, Alex

Discussed the timeline for migrating to the new REST API...
```

### 3. Use Consistent Terminology

If you call something "API" in some notes and "backend service" in others, search may miss connections. Pick consistent terms for important concepts.

### 4. Organize with MOCs

Maps of Content (MOCs) that link related notes together provide additional context for search, since the links themselves are indexed.

## Troubleshooting

### "Too many files" or slow processing

Large vaults (10,000+ notes) may take a while. Use `--exclude` aggressively:

```bash
libragen build ~/Documents/ObsidianVault \
  --name my-brain \
  --exclude "**/Archive/**" \
  --exclude "**/Daily Notes/**" \
  --exclude "**/Templates/**"
```

### Notes not appearing in results

Check that:

1. The file has a `.md` extension
2. It's not in an excluded folder
3. The file isn't empty or very short (< 50 characters)

### Out of memory

For very large vaults:

```bash
NODE_OPTIONS="--max-old-space-size=8192" libragen build ~/Documents/ObsidianVault --name my-brain
```

## Next Steps

- [Building Libraries](/docs/building) - Advanced chunking and processing options
- [MCP Integration](/docs/mcp) - Configure AI tool connections
- [CLI Reference](/docs/cli) - Full command documentation

---
title: Building Libraries
description: Create optimized RAG libraries from your documentation
section: Guides
order: 3
---

This guide covers advanced options for building high-quality RAG libraries.

## Basic Build

```bash
libragen build ./docs --name my-docs
```

This processes all markdown, text, and HTML files, generating embeddings and a full-text search index.

## Supported File Types

| Extension | Format |
|-----------|--------|
| `.md` | Markdown |
| `.txt` | Plain text |
| `.html` | HTML (text extracted) |
| `.mdx` | MDX (treated as markdown) |

Customize with `--extensions`:

```bash
libragen build ./docs --name my-docs --extensions ".md,.rst,.txt"
```

## Chunking Strategy

Documents are split into chunks for indexing. The chunking parameters affect search quality. The defaults work well for most cases, but you can tune them for specific content types.

### When to Adjust Chunk Settings

**Use defaults** (chunk-size: 1000, overlap: 100) when:
- You have typical documentation with mixed content types
- You're not sure what settings to use
- Your docs have clear headings and sections

**Use smaller chunks** (256-384) when:
- Content is dense with distinct concepts (API references, glossaries)
- Users ask very specific questions ("What does X parameter do?")
- Each paragraph covers a different topic

**Use larger chunks** (768-1024) when:
- Content is narrative or tutorial-style
- Context matters more than precision (architecture guides, explanations)
- You want results to include more surrounding context

### Chunk Size

Target size in characters.

```bash
# Smaller chunks = more precise, more results
libragen build ./docs --name my-docs --chunk-size 256

# Larger chunks = more context per result
libragen build ./docs --name my-docs --chunk-size 1024
```

**By content type:**

| Content Type | Chunk Size | Why |
|--------------|------------|-----|
| API reference | 256-384 | Each function/method is self-contained |
| Configuration docs | 384-512 | Options are usually independent |
| Tutorials | 512-768 | Steps need some context |
| Architecture guides | 768-1024 | Concepts span multiple paragraphs |
| FAQs | 256-384 | Each Q&A is standalone |

### Chunk Overlap

Characters shared between adjacent chunks. Overlap helps when:
- Important context spans chunk boundaries
- You have long sentences or paragraphs
- Search queries might match text split across chunks

```bash
libragen build ./docs --name my-docs --chunk-overlap 100
```

**Guidelines:**
- **10% overlap** (default): Good for well-structured docs with clear sections
- **15-20% overlap**: Better for prose-heavy content or long paragraphs
- **25%+ overlap**: Use when search quality suffers from split context (rare)

Higher overlap increases library size and build time, so only increase if needed.

## Versioning Content

Track documentation versions to match your releases:

```bash
libragen build ./docs \
  --name my-api \
  --content-version 2.1.0
```

Query specific versions later:

```bash
libragen query -l my-api --content-version 2.1.0 "authentication"
```

## Excluding Files

Skip files matching glob patterns:

```bash
libragen build ./docs \
  --name my-docs \
  --exclude "**/node_modules/**" \
  --exclude "**/drafts/**" \
  --exclude "**/*.test.md"
```

## Adding Metadata

Provide description for better discoverability:

```bash
libragen build ./docs \
  --name react-docs \
  --description "Official React documentation including hooks, components, and API reference"
```

The description appears in `libragen list` and helps AI tools understand what the library contains.

## License Tracking

When building from git repositories, licenses are automatically detected from LICENSE files. You can also specify licenses explicitly:

```bash
# Explicit license
libragen build ./docs --name my-docs --license MIT

# Multiple licenses (dual licensing)
libragen build ./docs --name my-docs --license MIT Apache-2.0
```

View license information with:

```bash
libragen inspect my-docs.libragen
```

**Supported licenses:** MIT, Apache-2.0, GPL-3.0, GPL-2.0, BSD-3-Clause, BSD-2-Clause, ISC, Unlicense, and more.

## CI/CD Integration

Automate library builds in your pipeline. See the [CI Integration guide](/docs/ci-integration) for complete examples with GitHub Actions, GitLab CI, CircleCI, and Azure Pipelines.

## Output Location

By default, libraries are saved to the current directory. Specify a different location:

```bash
libragen build ./docs \
  --name my-docs \
  --output ~/.libragen/libraries/
```

## Performance Tips

### Large Documentation Sets

For very large doc sets (>10,000 files):

1. Use larger chunk sizes to reduce total chunks
2. Exclude non-essential files (changelogs, drafts)
3. Build incrementally if possible

### Optimizing for Search Quality

1. **Structure your docs** - Use clear headings and sections
2. **Front-load important content** - Key information at the start of sections
3. **Use consistent terminology** - Same terms across related docs
4. **Include examples** - Code examples improve retrieval for technical queries

## Need Help?

See the [Troubleshooting guide](/docs/troubleshooting) for solutions to common build issues like slow builds, memory errors, and poor search results.

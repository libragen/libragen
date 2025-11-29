---
title: CLI Reference
description: Complete command-line interface documentation
section: Reference
order: 10
---

The libragen CLI provides commands for building, querying, and managing RAG libraries.

## Global Options

These options work with all commands:

| Option | Description |
|--------|-------------|
| `--help`, `-h` | Show help for a command |
| `--cli-version`, `-V` | Show CLI version number |

## Commands

### `build`

Create a new library from source files.

```bash
libragen build <source> [options]
```

#### Arguments

| Argument | Description |
|----------|-------------|
| `source` | Directory or file to process |

#### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--name`, `-n` | string | Required | Library name (creates `<name>-<version>.libragen`) |
| `--output`, `-o` | string | Current dir | Output directory |
| `--description`, `-d` | string | — | Library description |
| `--content-version` | string | — | Version tag for the content |
| `--extensions` | string[] | `.md,.txt,.html` | File extensions to process |
| `--exclude` | string[] | — | Glob patterns to exclude |
| `--chunk-size` | number | `1000` | Target chunk size in characters |
| `--chunk-overlap` | number | `100` | Overlap between chunks |
| `--license` | string[] | Auto-detected | SPDX license identifier(s) for the source |
| `--git-ref` | string | — | Git branch, tag, or commit (git sources only) |
| `--git-repo-auth-token` | string | — | Auth token for private repos |

#### Examples

```bash
# Basic build
libragen build ./docs --name my-docs

# With version and description
libragen build ./docs \
  --name my-api \
  --description "API documentation" \
  --content-version 2.1.0

# Custom chunk settings
libragen build ./docs \
  --name my-docs \
  --chunk-size 1024 \
  --chunk-overlap 100

# Exclude patterns
libragen build ./docs \
  --name my-docs \
  --exclude "**/node_modules/**" \
  --exclude "**/test/**"

# Build from git repository
libragen build https://github.com/user/repo --name repo-docs

# Build with explicit license
libragen build ./docs --name my-docs --license MIT

# Build with multiple licenses (dual licensing)
libragen build ./docs --name my-docs --license MIT Apache-2.0
```

#### License Detection

When building from git repositories, licenses are automatically detected from LICENSE files (LICENSE, LICENSE.md, LICENSE.txt, COPYING).

- **Git sources**: Auto-detected if not explicitly provided
- **Local sources**: Use `--license` to specify
- **Explicit `--license`**: Always takes precedence

**Supported licenses:** MIT, Apache-2.0, GPL-3.0, GPL-2.0, LGPL-3.0, LGPL-2.1, BSD-3-Clause, BSD-2-Clause, ISC, Unlicense, MPL-2.0, CC0-1.0, AGPL-3.0

---

### `query`

Search a library with natural language.

```bash
libragen query [options] <query>
```

#### Arguments

| Argument | Description |
|----------|-------------|
| `query` | Natural language search query |

#### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--library`, `-l` | string | Required | Library name or path |
| `--top-k`, `-k` | number | `10` | Number of results to return |
| `--content-version` | string | — | Filter by content version |
| `--format`, `-f` | string | `text` | Output format (`text`, `json`) |

#### Examples

```bash
# Basic query
libragen query --library my-docs "How do I authenticate?"

# Get more results as JSON
libragen query -l my-docs -k 20 -f json "error handling"

# Query specific version
libragen query -l my-api --content-version 2.0.0 "rate limits"
```

#### Output Format

**Text output** (default):

```
[1] authentication.md (score: 0.89)
    To authenticate, pass your API key in the Authorization header...

[2] getting-started.md (score: 0.82)
    First, obtain an API key from the dashboard...
```

**JSON output** (`--format json`):

```json
{
  "results": [
    {
      "rank": 1,
      "score": 0.89,
      "source": "authentication.md",
      "content": "To authenticate, pass your API key..."
    }
  ]
}
```

---

### `list`

List installed libraries.

```bash
libragen list [options]
```

#### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `-p, --path` | string[] | — | Library path(s) to use (excludes global and auto-detection) |
| `-v, --verbose` | boolean | `false` | Show detailed information |
| `--json` | boolean | `false` | Output as JSON |
| `--libraries` | boolean | `false` | Show only libraries |
| `--collections` | boolean | `false` | Show only collections |

#### Library Discovery

By default, libragen discovers libraries from:

1. **Project directory** — If `.libragen/libraries/` exists in the current directory, it's included automatically
2. **Global directory** — Platform-specific location (see [Library Storage](#library-storage))

When `-p` is specified, **only** the provided path(s) are searched—no global directory, no auto-detection.

#### Examples

```bash
# List all libraries (auto-detected + global)
libragen list

# List only project-local libraries
libragen list -p .libragen/libraries

# List from multiple specific paths
libragen list -p ./libs -p ./vendor/libs
```

```
NAME          VERSION    CHUNKS    SIZE
my-docs       1.0.0      1,247     12.4 MB
react-docs    19.0.0     3,892     45.2 MB
```

---

### `inspect`

Inspect the contents of a library (`.libragen`) or packed collection (`.libragen-collection`) file.

```bash
libragen inspect <source> [options]
```

#### Arguments

| Argument | Description |
|----------|-------------|
| `source` | Library file, packed collection, or URL |

#### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--json` | boolean | `false` | Output as JSON |

#### Examples

```bash
# Inspect a library file
libragen inspect my-lib.libragen

# Inspect a packed collection
libragen inspect my-collection.libragen-collection

# Inspect from URL
libragen inspect https://example.com/my-lib.libragen

# JSON output for scripting
libragen inspect my-lib.libragen --json
```

#### Output (library)

```
📚 Library Contents

  File:    /path/to/my-lib.libragen
  Size:    1.23 MB

  Metadata:
    Name:        my-lib
    Version:     1.0.0
    Description: My library description
    Content:     v2.0.0 (semver)
    Schema:      v3
    Created:     2024-01-15T10:30:00.000Z

  Stats:
    Chunks:      1,234
    Sources:     42 files

  Embedding:
    Model:       Xenova/bge-small-en-v1.5
    Dimensions:  384

  Source:
    Type:        git
    URL:         https://github.com/user/repo
    Ref:         main
    Commit:      abc12345

  License(s):
    • MIT
```

#### Output (packed collection)

```
📦 Collection Contents

  File: /path/to/my-collection.libragen-collection
  Size: 5.67 MB

  Metadata:
    Name:    my-collection
    Version: 1.0.0
    Desc:    My collection description

  Libraries (3):
    • api-docs.libragen (1.2 MB)
    • guides.libragen (2.3 MB)
    • tutorials.libragen (2.17 MB)

Install with:
  libragen install /path/to/my-collection.libragen-collection
```

---

### `install`

Install a library from a collection or URL.

```bash
libragen install <source> [options]
```

#### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `-p, --path` | string | — | Install to specific directory (default: global or auto-detected project) |
| `-f, --force` | boolean | `false` | Overwrite existing library |
| `-c, --collection` | string | — | Collection URL to use |
| `--content-version` | string | — | Install specific content version |
| `-a, --all` | boolean | `false` | Install all libraries including optional (for collections) |

#### Examples

```bash
# Install from file (to global or auto-detected project directory)
libragen install ./my-lib.libragen

# Install to specific directory
libragen install ./my-lib.libragen -p .libragen/libraries

# Install from collection
libragen install react-docs

# Install from URL
libragen install https://example.com/my-lib-1.0.0.libragen
```

---

### `uninstall`

Remove an installed library.

```bash
libragen uninstall <name> [options]
```

#### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `-p, --path` | string[] | — | Library path(s) to search (excludes global and auto-detection) |
| `-c, --collection` | boolean | `false` | Uninstall a collection (and unreferenced libraries) |

#### Examples

```bash
# Uninstall from auto-detected paths
libragen uninstall my-docs

# Uninstall from specific path only
libragen uninstall my-docs -p .libragen/libraries
```

---

### `update`

Update installed libraries to newer versions from their collections.

```bash
libragen update [name] [options]
```

#### Arguments

| Argument | Description |
|----------|-------------|
| `name` | Optional library name to update (updates all if omitted) |

#### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `-p, --path` | string[] | — | Library path(s) to search (excludes global and auto-detection) |
| `-n, --dry-run` | boolean | `false` | Show what would be updated without making changes |
| `-f, --force` | boolean | `false` | Force update even if versions match |

#### Examples

```bash
# Update all libraries
libragen update

# Update specific library
libragen update react-docs

# Preview updates without applying
libragen update --dry-run

# Update only project-local libraries
libragen update -p .libragen/libraries
```

---

### `config`

Display current libragen configuration and paths.

```bash
libragen config [options]
```

#### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `--json` | boolean | `false` | Output as JSON |

#### Example

```bash
libragen config
```

```
⚙️  Libragen Configuration

  Version:  0.1.0

  Paths:
    Home:       ~/Library/Application Support/libragen
    Libraries:  ~/Library/Application Support/libragen/libraries
    Models:     ~/Library/Application Support/libragen/models

  Environment Variables:
    (none set, using defaults)
```

With environment variable overrides:

```bash
LIBRAGEN_HOME=/custom/path libragen config
```

```
⚙️  Libragen Configuration

  Version:  0.1.0

  Paths:
    Home:       /custom/path (from LIBRAGEN_HOME)
    Libraries:  /custom/path/libraries
    Models:     /custom/path/models

  Environment Variables:
    LIBRAGEN_HOME=/custom/path
```

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `LIBRAGEN_HOME` | Override base directory for all libragen data |
| `LIBRAGEN_MODEL_CACHE` | Override model cache directory |

Use `libragen config` to see current values and which environment variables are active.

---

### `completions`

Manage shell completions for bash, zsh, and fish.

```bash
libragen completions <action>
```

#### Actions

| Action | Description |
|--------|-------------|
| `install` | Install shell completions (interactive prompt for shell type) |
| `uninstall` | Remove shell completions |
| `bash` | Output bash completion script |
| `zsh` | Output zsh completion script |
| `fish` | Output fish completion script |

#### Examples

```bash
# Interactive install (prompts for shell type)
libragen completions install

# Output completion script for specific shell
libragen completions bash
libragen completions zsh
libragen completions fish

# Add to your shell profile manually
# Bash (~/.bashrc):
eval "$(libragen completions bash)"

# Zsh (~/.zshrc):
eval "$(libragen completions zsh)"

# Fish (~/.config/fish/completions/libragen.fish):
libragen completions fish > ~/.config/fish/completions/libragen.fish

# Remove completions
libragen completions uninstall
```

#### Features

Shell completions provide:

- **Command completion** - Tab-complete all libragen commands
- **Option completion** - Tab-complete command options
- **Library name completion** - Tab-complete installed library names for `--library`, `uninstall`, etc.
- **File completion** - Native file/directory completion for `build`, `install`, `info`

---

## Exit Codes

| Code | Description |
|------|-------------|
| `0` | Success |
| `1` | General error |
| `2` | Invalid arguments |

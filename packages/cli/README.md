# @libragen/cli

Command-line interface for building and querying libragen libraries.

## Installation

```bash
npm install -g @libragen/cli
```

Or use with npx:

```bash
npx @libragen/cli <command>
```

## Commands

### `build` (alias: `b`)

Build a library from source files or a git repository.

```bash
libragen build <source> [options]
libragen b <source> [options]
```

**Arguments:**

*  `source` — Path to directory/files or git URL

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `-o, --output <path>` | Output file or directory path | `<name>.libragen` |
| `-n, --name <name>` | Library name | Directory/repo name |
| `-v, --version <version>` | Library version | `1.0.0` |
| `-d, --description <text>` | Library description | — |
| `--agent-description <text>` | Description for AI agents | — |
| `--content-version <version>` | Content version (e.g., `v2.0.0`) | — |
| `--content-version-type <type>` | Version type: `semver`, `date`, `commit` | — |
| `-p, --patterns <patterns>` | Glob patterns to include | `**/*.{ts,js,...}` |
| `-i, --ignore <patterns>` | Glob patterns to ignore | — |
| `--chunk-size <size>` | Target chunk size in characters | `1000` |
| `--chunk-overlap <size>` | Overlap between chunks | `100` |
| `--git-ref <ref>` | Git branch, tag, or commit (remote git sources only) | — |
| `--git-repo-auth-token <token>` | Auth token for private repos (remote git sources only) | — |
| `--license <licenses...>` | SPDX license identifier(s) for the source content | Auto-detected for git |

**Examples:**

```bash
# Build from local directory (output to file)
libragen build ./src -o my-lib.libragen

# Build to directory (creates ./dist/<name>.libragen)
libragen build ./src -o ./dist

# Build from git repository
libragen build https://github.com/user/repo -o repo.libragen

# Build from specific branch/tag
libragen build https://github.com/user/repo/tree/v1.0.0

# Build from subdirectory (path extracted from URL)
libragen build https://github.com/user/repo/tree/main/docs

# Build with explicit include filter
libragen build https://github.com/user/repo --include 'docs/**'

# Build from private repository
GITHUB_TOKEN=xxx libragen build https://github.com/org/private-repo

# Build with custom options
libragen build ./src \
   -o my-lib.libragen \
   -n "My Library" \
   -d "A helpful library" \
   --content-version "v2.0.0" \
   --patterns "**/*.ts" "**/*.md"

# Build with explicit license
libragen build ./src --license MIT

# Build with multiple licenses (dual licensing)
libragen build ./src --license MIT Apache-2.0
```

### License Detection

When building from git repositories, licenses are automatically detected from common license files (LICENSE, LICENSE.md, LICENSE.txt, COPYING). The detected license is stored in the library metadata.

**Behavior:**

- **Git sources**: Auto-detected from LICENSE files if not explicitly provided
- **Local sources**: No auto-detection; use `--license` if needed
- **Explicit `--license`**: Always takes precedence over auto-detection

**Supported licenses:**

MIT, Apache-2.0, GPL-3.0, GPL-2.0, LGPL-3.0, LGPL-2.1, BSD-3-Clause, BSD-2-Clause, ISC, Unlicense, MPL-2.0, CC0-1.0, AGPL-3.0

### Git Repository Authentication

When building from private repositories, authentication tokens are resolved in this order:

1. Explicit `--git-repo-auth-token` parameter
2. Environment variables based on provider:
   - **GitHub:** `GITHUB_TOKEN`
   - **GitLab:** `GITLAB_TOKEN` or `GL_TOKEN`
   - **Bitbucket:** `BITBUCKET_TOKEN`
   - **Custom GitLab:** Set `GITLAB_HOST` to your instance domain

**Supported URL formats:**

```bash
# Basic repository URLs
https://github.com/org/repo
https://github.com/org/repo.git
https://gitlab.com/org/repo
https://bitbucket.org/org/repo

# Repository at specific ref (branch/tag/commit)
https://github.com/org/repo/tree/v1.0.0
https://github.com/org/repo/tree/main
https://gitlab.com/org/repo/-/tree/v1.0.0

# Specific directory at ref
https://github.com/org/repo/tree/main/docs
https://gitlab.com/org/repo/-/tree/main/src

# Specific file at ref
https://github.com/org/repo/blob/main/README.md
https://gitlab.com/org/repo/-/blob/v1.0.0/README.md

# Custom GitLab instances
https://gitlab.example.com/org/repo
```

### `query` (alias: `q`)

Search a library for relevant content.

```bash
libragen query <query> [options]
libragen q <query> [options]
```

**Arguments:**

*  `query` — Natural language search query

**Options:**

| Option | Description | Default |
|--------|-------------|---------|
| `-l, --library <path>` | Library file to search (required) | — |
| `-k, --top-k <number>` | Number of results | `5` |
| `-r, --rerank` | Enable cross-encoder reranking | `false` |
| `-c, --context <lines>` | Lines of context around matches | `0` |
| `--json` | Output as JSON | `false` |

**Examples:**

```bash
# Basic search
libragen query "authentication middleware" -l my-lib.libragen

# Search with reranking and context
libragen query "error handling" -l my-lib.libragen -r -c 3 -k 10

# JSON output for scripting
libragen query "database connection" -l my-lib.libragen --json
```

### `inspect`

Inspect the contents of a library (`.libragen`) or packed collection (`.libragen-collection`) file.

```bash
libragen inspect <source> [options]
```

**Arguments:**

*  `source` — Library file, packed collection, or URL

**Options:**

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

**Examples:**

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

**Output (library):**

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
```

**Output (packed collection):**

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

### `list` (alias: `l`)

List installed libraries.

```bash
libragen list [options]
libragen l [options]
```

**Options:**

| Option | Description |
|--------|-------------|
| `-v, --verbose` | Show detailed information |
| `-p, --path <paths...>` | Library path(s) to use (excludes global and auto-detection) |
| `--json` | Output as JSON |
| `--libraries` | Show only libraries |
| `--collections` | Show only collections |

**Library Discovery:**

By default, libragen searches for libraries in:

1. **Project directory** (if `.libragen/libraries/` exists in cwd) — auto-detected
2. **Global directory** — platform-specific (see below)

When `-p` is specified, **only** the provided path(s) are searched — no global or auto-detection.

### `install`

Install a library from a file or collection.

```bash
libragen install <source> [options]
```

**Arguments:**

*  `source` — Library file path or collection library name

**Options:**

| Option | Description |
|--------|-------------|
| `-p, --path <path>` | Install to specific directory (default: global or auto-detected project) |
| `-f, --force` | Overwrite existing library |
| `-c, --collection <url>` | Collection URL to use |
| `--content-version <version>` | Install specific content version |
| `-a, --all` | Install all libraries including optional (for collections) |

**Examples:**

```bash
# Install from file (to global or auto-detected project directory)
libragen install ./my-lib.libragen

# Install to specific directory
libragen install ./my-lib.libragen -p .libragen/libraries

# Install from collection (when configured)
libragen install some-library
```

### `uninstall` (alias: `u`)

Remove an installed library.

```bash
libragen uninstall <name> [options]
libragen u <name> [options]
```

**Options:**

| Option | Description |
|--------|-------------|
| `-p, --path <paths...>` | Library path(s) to search (excludes global and auto-detection) |
| `-c, --collection` | Uninstall a collection (and unreferenced libraries) |

### `collection`

Manage library collections.

```bash
libragen collection <subcommand>
```

**Subcommands:**

*  `list` — List configured collections
*  `add <name> <url>` — Add a collection
*  `remove <name>` — Remove a collection
*  `search <query>` — Search collections for libraries
*  `clear-cache` — Clear the collection cache
*  `create <output>` — Create a collection file (creates a template if no libraries specified)
*  `pack <collection>` — Bundle a collection and libraries into a single `.libragen-collection` file
*  `unpack <file>` — Extract a `.libragen-collection` file

**Examples:**

```bash
# List collections
libragen collection list

# Add a collection
libragen collection add my-collection https://example.com/collection.json

# Search for libraries
libragen collection search "react hooks"

# Create a collection template (edit manually)
libragen collection create my-docs.json

# Create a collection with libraries
libragen collection create my-docs.json \
  --library ./api-docs.libragen \
  --library ./guides.libragen

# Pack for sharing (creates .libragen-collection file)
libragen collection pack ./my-docs.json

# Unpack and install
libragen collection unpack my-docs.libragen-collection --install
```

### `update` (alias: `up`)

Update libraries from their collections. **Only works for libraries that were installed from a collection** — libraries installed directly from `.libragen` files are not tracked and cannot be updated this way.

```bash
libragen update [name] [options]
libragen up [name] [options]
```

**Arguments:**

*  `name` — Optional library name (updates all collection-tracked libraries if omitted)

**Options:**

| Option | Description |
|--------|-------------|
| `-p, --path <paths...>` | Library path(s) to search (excludes global and auto-detection) |
| `-n, --dry-run` | Show what would be updated without making changes |
| `-f, --force` | Force update even if versions match |

### `config`

Display current configuration and paths.

```bash
libragen config [options]
```

**Options:**

| Option | Description |
|--------|-------------|
| `--json` | Output as JSON |

### `completions`

Manage shell completions for bash, zsh, and fish.

```bash
libragen completions <action>
```

**Actions:**

| Action | Description |
|--------|-------------|
| `install` | Install completions (interactive) |
| `uninstall` | Remove completions |
| `bash` | Output bash completion script |
| `zsh` | Output zsh completion script |
| `fish` | Output fish completion script |

**Examples:**

```bash
# Interactive install
libragen completions install

# Add to shell profile manually
# Bash (~/.bashrc):
eval "$(libragen completions bash)"

# Zsh (~/.zshrc):
eval "$(libragen completions zsh)"

# Fish:
libragen completions fish > ~/.config/fish/completions/libragen.fish
```

## Library Locations

Libraries are discovered from multiple locations:

### Default Behavior (no `-p` flag)

1. **Auto-detected project directory**: If `.libragen/libraries/` exists in the current working directory, it is included automatically.
2. **Global directory**: Platform-specific location (see below).

| Platform | Global Location |
|----------|-----------------|
| macOS | `~/Library/Application Support/libragen/libraries` |
| Linux | `~/.local/share/libragen/libraries` |
| Windows | `%APPDATA%\libragen\libraries` |

### Explicit Paths (`-p` flag)

When `-p` is specified, **only** the provided path(s) are used — no global directory, no auto-detection. This is useful for:

- Working with a specific project's libraries only
- Testing with isolated library sets
- CI/CD environments

```bash
# Use only project-local libraries
libragen list -p .libragen/libraries

# Use multiple paths
libragen list -p ./libs -p ./vendor/libs
```

## Exit Codes

| Code | Description |
|------|-------------|
| `0` | Success |
| `1` | Error (see stderr for details) |

## Related

*  [@libragen/core](../core) — Core library
*  [@libragen/mcp](../mcp) — MCP server for AI assistants

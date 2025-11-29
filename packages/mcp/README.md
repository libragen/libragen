# @libragen/mcp

Model Context Protocol (MCP) server for libragen, enabling AI assistants to search code libraries.

## Installation

```bash
npm install -g @libragen/mcp
```

## Integration

### Claude Desktop

Add to your Claude Desktop configuration file:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

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

### VS Code with Continue

Add to your Continue configuration:

```json
{
   "mcpServers": [
      {
         "name": "libragen",
         "command": "npx",
         "args": ["-y", "@libragen/mcp"]
      }
   ]
}
```

## Library Discovery

The MCP server automatically discovers libraries from multiple locations:

1. **Project-local libraries**: If the MCP client provides workspace roots (via the MCP roots capability), the server checks each root for a `.libragen/libraries` directory.
2. **Global libraries**: Platform-specific global directory (e.g., `~/Library/Application Support/libragen/libraries` on macOS).

Project-local libraries take priority over global libraries with the same name.

### IDE Integration

When used in VS Code, Windsurf, or other IDEs that support MCP roots, the server will automatically detect project-local libraries in your workspace. This means:

- Libraries installed in `<project>/.libragen/libraries/` are discovered automatically
- Project libraries shadow global libraries with the same name
- No configuration needed — just open your project

## Tools

The MCP server exposes the following tools:

### `libragen_search`

Search installed libraries for relevant code and documentation.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | Natural language search query |
| `libraries` | string[] | No | Specific libraries to search (searches all if not specified) |
| `contentVersion` | string | No | Filter results by content version |
| `topK` | number | No | Number of results to return (default: 10) |
| `hybridAlpha` | number | No | Balance between vector (1) and keyword (0) search (default: 0.5) |
| `contextBefore` | number | No | Chunks to include before each result (default: 1) |
| `contextAfter` | number | No | Chunks to include after each result (default: 1) |
| `rerank` | boolean | No | Apply cross-encoder reranking (default: false) |

**Example:**

```
Use libragen_search to find authentication middleware code
```

### `libragen_list`

List all installed libraries with their metadata.

**Parameters:** None

**Returns:** List of libraries with name, version, description, content version, chunk count, and file size.

### `libragen_install`

Install a library or collection from file path or URL.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `source` | string | Yes | Library (.libragen), collection (.json), or URL |
| `force` | boolean | No | Overwrite existing libraries (default: false) |
| `includeOptional` | boolean | No | Include optional libraries for collections (default: false) |

**Example:**

```
Use libragen_install to install ./my-collection.json with includeOptional=true
```

### `libragen_uninstall`

Remove an installed library.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | Yes | Name of the library to uninstall |

### `libragen_update`

Update installed libraries to newer versions from collections.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | No | Library name to update (updates all if omitted) |
| `force` | boolean | No | Force update even if versions match (default: false) |
| `dryRun` | boolean | No | Show what would be updated without making changes (default: false) |

**Example:**

```
Use libragen_update with dryRun=true to check for available updates
```

### `libragen_build`

Build a .libragen library from source files, a directory, or a git repository.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `source` | string | Yes | Source directory, file path, or git URL to index |
| `output` | string | No | Output path for the .libragen file |
| `name` | string | No | Library name (defaults to directory/file name) |
| `version` | string | No | Library version (default: 0.1.0) |
| `contentVersion` | string | No | Version of the source content |
| `description` | string | No | Short description of the library |
| `agentDescription` | string | No | Guidance for AI agents |
| `exampleQueries` | string[] | No | Example queries this library can answer |
| `keywords` | string[] | No | Searchable keywords/tags |
| `programmingLanguages` | string[] | No | Programming languages covered |
| `textLanguages` | string[] | No | Human/natural languages (ISO 639-1 codes) |
| `frameworks` | string[] | No | Frameworks covered |
| `chunkSize` | number | No | Target chunk size in characters (default: 1000) |
| `chunkOverlap` | number | No | Chunk overlap in characters (default: 100) |
| `include` | string[] | No | Glob patterns to include |
| `exclude` | string[] | No | Glob patterns to exclude |
| `gitRef` | string | No | Git branch, tag, or commit (remote git sources only) |
| `gitRepoAuthToken` | string | No | Auth token for private repos (remote git sources only) |
| `install` | boolean | No | Install the library after building (default: false) |

**Examples:**

```
# Build from local directory
Use libragen_build to create a library from the ./src directory

# Build from git repository
Use libragen_build with source="https://github.com/org/repo"

# Build from specific branch
Use libragen_build with source="https://github.com/org/repo/tree/v1.0.0"

# Build from subdirectory
Use libragen_build with source="https://github.com/org/repo/tree/main/docs"
```

**Git URL formats supported:**

- `https://github.com/org/repo`
- `https://github.com/org/repo/tree/v1.0.0` (specific ref)
- `https://github.com/org/repo/tree/main/docs` (subdirectory)
- `https://gitlab.com/org/repo/-/tree/main/src`
- `https://bitbucket.org/org/repo`

**Authentication:** Tokens are auto-detected from environment variables (`GITHUB_TOKEN`, `GITLAB_TOKEN`, `GL_TOKEN`, `BITBUCKET_TOKEN`) or can be passed explicitly via the `gitRepoAuthToken` parameter.

### `libragen_collection`

Create a collection file that groups libraries together for easy installation.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `output` | string | Yes | Output file path for the collection (.json) |
| `name` | string | No | Collection name (defaults to filename) |
| `description` | string | No | Collection description |
| `version` | string | No | Collection version (default: 1.0.0) |
| `libraries` | string[] | No | Array of library sources (URLs or paths) |
| `optionalLibraries` | string[] | No | Array of optional library sources |
| `collections` | string[] | No | Array of nested collection sources |

**Example:**

```
Use libragen_collection to create my-stack.json with libraries react.libragen and typescript.libragen
```

## Prompts (Slash Commands)

The server exposes prompts that appear as slash commands in MCP-compatible clients:

### `/libragen-search`

Search installed libraries for relevant code snippets.

**Arguments:**

| Argument | Type | Description |
|----------|------|-------------|
| `query` | string | What to search for (e.g., "authentication", "React hooks") |

### `/libragen-build`

Build a searchable library from source code.

**Arguments:**

| Argument | Type | Description |
|----------|------|-------------|
| `source` | string | Path to the source directory or file to index |

### `/libragen-collection`

Create a collection file grouping multiple libraries.

**Arguments:**

| Argument | Type | Description |
|----------|------|-------------|
| `name` | string | Name for the collection |
| `libraries` | string (optional) | Comma-separated list of library paths |

## Library Discovery

The MCP server automatically discovers libraries from:

| Platform | Location |
|----------|----------|
| macOS | `~/Library/Application Support/libragen/libraries` |
| Linux | `~/.local/share/libragen/libraries` |
| Windows | `%APPDATA%\libragen\libraries` |

Install libraries using the CLI:

```bash
libragen install my-library.libragen
```

Or use the `libragen_install` tool directly from your AI assistant.

## Pre-warming

For faster first query response, the server pre-warms the embedding model on startup. This adds a few seconds to startup time but eliminates the delay on the first query.

## Programmatic Usage

```typescript
import { createServer, warmEmbedder } from '@libragen/mcp';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

// Optional: Pre-warm the embedder
const embedder = await warmEmbedder();

// Create server with custom config
const server = createServer({
   librariesDir: '/custom/path/to/libraries',
   embedder, // Use pre-warmed embedder
});

// Connect via stdio
const transport = new StdioServerTransport();

await server.connect(transport);
```

## Related

*  [@libragen/core](../core) — Core library
*  [@libragen/cli](../cli) — Command-line interface
*  [Model Context Protocol](https://modelcontextprotocol.io/) — MCP specification

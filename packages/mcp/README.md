<p align="center">
  <img src="https://libragen.dev/favicon.svg" alt="Libragen Logo" width="80" height="80">
</p>

<h1 align="center">@libragen/mcp</h1>

<p align="center">
  <strong>MCP server for <a href="https://libragen.dev">libragen</a> — stop your AI from hallucinating code</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@libragen/mcp"><img src="https://img.shields.io/npm/v/@libragen/mcp.svg" alt="npm"></a>
  <a href="https://github.com/libragen/libragen/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License"></a>
</p>

---

Model Context Protocol (MCP) server that enables AI assistants like Claude Desktop, VS Code, and Windsurf to search libragen libraries. Ground your AI in real documentation instead of stale training data.

**[Full documentation →](https://libragen.dev)**

## Quick Setup

Install the libragen MCP server with one command:

```bash
npx -y install-mcp @libragen/mcp
```

This automatically detects and configures your AI tool (Claude Desktop, Cursor, Windsurf, VS Code, etc.).

After installation, restart your AI tool to load the server.

## Manual Configuration

If you prefer manual setup or need custom options, add this to your tool's MCP configuration:

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

See [install-mcp documentation](https://www.npmjs.com/package/install-mcp) for config file locations by tool.

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

**This tool uses an async pattern** to avoid timeouts on long-running builds. Builds run in worker threads (up to n-1 CPU cores) to avoid blocking the MCP server.

**Actions:**

| Action | Description |
|--------|-------------|
| `start` | Start a new build (default). Returns a `taskId` immediately. |
| `status` | Check build progress. Requires `taskId`. |
| `cancel` | Cancel a running or queued build. Requires `taskId`. |

**Workflow:**

1. Call with `action='start'` and `source` to begin a build
2. Poll with `action='status'` and `taskId` to check progress
3. When `status='completed'`, the `result` field contains the build output

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | No | Action to perform: `start`, `status`, or `cancel` (default: `start`) |
| `taskId` | string | For status/cancel | Task ID returned from start action |
| `source` | string | For start | Source directory, file path, or git URL to index |
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

**Response fields:**

| Field | Description |
|-------|-------------|
| `taskId` | Unique identifier for the build task |
| `status` | Task status: `queued`, `running`, `completed`, `failed`, `cancelled` |
| `progress` | Progress percentage (0-100) |
| `currentStep` | Description of current build step |
| `result` | Build output (when completed) |
| `error` | Error message (when failed) |
| `queuePosition` | Position in queue (when queued) |
| `estimatedTotalSeconds` | Estimated total build time in seconds |
| `estimatedRemainingSeconds` | Estimated seconds until completion (when running) |
| `elapsedSeconds` | How long the build has been running (when running) |

**User Feedback:** When polling for status, inform the user about progress using the timing fields. Example: "Building library... 45% complete (Generating embeddings). About 30 seconds remaining."

**Examples:**

```
# Start a build (returns immediately with taskId)
Use libragen_build with action="start" source="https://github.com/org/repo"
→ { "taskId": "abc-123", "status": "queued", "message": "Build started..." }

# Check progress
Use libragen_build with action="status" taskId="abc-123"
→ { "taskId": "abc-123", "status": "running", "progress": 45, "currentStep": "Generating embeddings..." }

# Get result when complete
Use libragen_build with action="status" taskId="abc-123"
→ { "taskId": "abc-123", "status": "completed", "progress": 100, "result": "✓ Built library: repo..." }

# Cancel if needed
Use libragen_build with action="cancel" taskId="abc-123"
→ { "success": true, "message": "Build cancelled" }
```

**Git URL formats supported:**

- `https://github.com/org/repo`
- `https://github.com/org/repo/tree/v1.0.0` (specific ref)
- `https://github.com/org/repo/tree/main/docs` (subdirectory)
- `https://gitlab.com/org/repo/-/tree/main/src`
- `https://bitbucket.org/org/repo`

**Authentication:** Tokens are auto-detected from environment variables (`GITHUB_TOKEN`, `GITLAB_TOKEN`, `GL_TOKEN`, `BITBUCKET_TOKEN`) or can be passed explicitly via the `gitRepoAuthToken` parameter.

**Environment Variables:**

| Variable | Description |
|----------|-------------|
| `LIBRAGEN_TASK_EXPIRY_MS` | How long completed tasks are retained (default: 3600000 = 1 hour) |

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

### `libragen_config`

Get libragen configuration including paths, version, and discovered project directories.

**Parameters:** None

**Returns:**

- `version`: libragen version
- `paths`: default paths (home, libraries, models)
- `discoveredPaths`: all library paths being searched (includes project-local)
- `pathsInitialized`: whether paths have been discovered from workspace roots
- `environment`: active environment variable overrides

**Example:**

```
Use libragen_config to see where libraries are stored and which paths are being searched
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

## Custom Library Directory

To use libraries from a custom location, set the `LIBRAGEN_HOME` environment variable:

```bash
# Install with custom library path
LIBRAGEN_HOME=/path/to/your/libragen npx -y install-mcp @libragen/mcp
```

Or add it manually to your MCP config:

```json
{
   "mcpServers": {
      "libragen": {
         "command": "npx",
         "args": ["-y", "@libragen/mcp"],
         "env": {
            "LIBRAGEN_HOME": "/path/to/your/libragen"
         }
      }
   }
}
```

## Tips for Best Results

1. **Be specific** - "Search react-docs for useEffect dependency arrays" works better than "how does useEffect work"
2. **Name your libraries clearly** - The AI uses library names to understand what's available
3. **Add descriptions** - When building libraries, include descriptions so the AI knows what each library contains
4. **Version your content** - Use `contentVersion` when building so you can reference specific versions

## Troubleshooting

### Server not loading

1. Verify the MCP config syntax is valid JSON
2. Check that `npx` is in your PATH
3. Restart your AI tool completely

### No libraries found

1. Check that libraries exist in the default location
2. Verify with `libragen list` in your terminal
3. Try setting `LIBRAGEN_HOME` explicitly

### Slow first query

The first query downloads the embedding model (~50MB). Subsequent queries are fast.

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

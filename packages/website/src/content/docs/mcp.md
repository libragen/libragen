---
title: MCP Integration
description: Connect libragen to Claude, Cursor, VS Code, and other AI tools
section: Guides
order: 5
---

Libragen includes an [MCP](https://modelcontextprotocol.io/) server that lets AI assistants query your libraries directly. Once configured, your AI can search documentation without you copying and pasting.

## Quick Setup

Install the libragen MCP server with one command:

```bash
npx -y install-mcp @libragen/mcp
```

That's it! This automatically detects and configures your AI tool (Claude Desktop, Cursor, Windsurf, etc.).

## Library Discovery

The MCP server automatically discovers libraries from multiple locations:

1. **Project-local libraries**: If your workspace has a `.libragen/libraries/` directory, those libraries are discovered automatically
2. **Global libraries**: Platform-specific global directory (e.g., `~/Library/Application Support/libragen/libraries/` on macOS)

Project-local libraries take priority over global libraries with the same name. This means you can have project-specific versions of libraries that shadow global ones.

### How It Works

When used in VS Code, Windsurf, Cursor, or other IDEs that support MCP roots:

- The server requests workspace roots from the IDE
- For each workspace root, it checks for `.libragen/libraries/`
- Project libraries are searched first, then global libraries
- No configuration needed—just open your project!

## Supported Tools

The `install-mcp` package automatically configures:

- **Claude Desktop** - Adds to `claude_desktop_config.json`
- **Cursor** - Adds to Cursor's MCP settings
- **Windsurf** - Adds to Windsurf's MCP configuration
- **VS Code** - Adds to Copilot's MCP servers

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

## Available Tools

The MCP server provides 7 tools for managing and querying libraries:

### `libragen_search`

Search libraries for relevant content using hybrid semantic + keyword search.

**Inputs:**
- `query` (string, required) - Natural language search query
- `libraries` (string[], optional) - Specific libraries to search (searches all if omitted)
- `contentVersion` (string, optional) - Filter by content version
- `topK` (number, default: 10) - Number of results
- `hybridAlpha` (number, default: 0.5) - Balance between vector (1) and keyword (0) search
- `contextBefore` (number, default: 1) - Chunks to include before each result
- `contextAfter` (number, default: 1) - Chunks to include after each result
- `rerank` (boolean, default: false) - Apply cross-encoder reranking for better relevance

**Example prompt:**
> "Search my react-docs library for information about useEffect cleanup"

### `libragen_list`

List available libraries with metadata, descriptions, and usage guidance.

**Example prompt:**
> "What libragen libraries do I have installed?"

### `libragen_build`

Build a searchable library from source files or git repositories.

**Inputs:**
- `source` (string, required) - Directory, file path, or git URL to index
- `name` (string, optional) - Library name
- `output` (string, optional) - Output path for the .libragen file
- `version` (string, default: "0.1.0") - Library version
- `contentVersion` (string, optional) - Version of source content
- `description` (string, optional) - Short description
- `agentDescription` (string, optional) - Guidance for AI agents
- `exampleQueries` (string[], optional) - Example queries
- `keywords` (string[], optional) - Searchable tags
- `programmingLanguages` (string[], optional) - Languages covered
- `frameworks` (string[], optional) - Frameworks covered
- `chunkSize` (number, default: 1000) - Target chunk size
- `chunkOverlap` (number, default: 100) - Chunk overlap
- `include` (string[], optional) - Glob patterns to include
- `exclude` (string[], optional) - Glob patterns to exclude
- `gitRef` (string, optional) - Git branch/tag/commit
- `gitRepoAuthToken` (string, optional) - Auth token for private repos
- `install` (boolean, default: false) - Install after building

**Example prompt:**
> "Build a library from https://github.com/vercel/next.js/tree/main/docs"

### `libragen_install`

Install a library or collection to make it available for searching.

**Inputs:**
- `source` (string, required) - Library file (.libragen), collection (.json), or URL
- `force` (boolean, default: false) - Overwrite existing libraries
- `includeOptional` (boolean, default: false) - Include optional libraries from collections

**Example prompt:**
> "Install the library from ./my-docs.libragen"

### `libragen_uninstall`

Remove an installed library.

**Inputs:**
- `name` (string, required) - Name of the library to uninstall

**Example prompt:**
> "Uninstall the react-docs library"

### `libragen_update`

Update installed libraries to newer versions from collections.

**Inputs:**
- `name` (string, optional) - Library to update (updates all if omitted)
- `force` (boolean, default: false) - Force update even if versions match
- `dryRun` (boolean, default: false) - Show what would be updated without applying

**Example prompt:**
> "Check for updates to my installed libraries"

### `libragen_collection`

Create a collection file that bundles multiple libraries together.

**Inputs:**
- `output` (string, required) - Output file path (.json)
- `name` (string, optional) - Collection name
- `description` (string, optional) - Collection description
- `version` (string, default: "1.0.0") - Collection version
- `libraries` (string[], optional) - Required library sources
- `optionalLibraries` (string[], optional) - Optional library sources
- `collections` (string[], optional) - Nested collection sources

**Example prompt:**
> "Create a collection called team-docs with my api-docs and guides libraries"

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

4. **Version your content** - Use `--content-version` when building so you can reference specific versions

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

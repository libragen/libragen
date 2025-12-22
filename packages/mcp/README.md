<p align="center">
  <img src="https://libragen.dev/favicon.svg" alt="Libragen Logo" width="80" height="80">
</p>

<h1 align="center">@libragen/mcp</h1>

<p align="center">
  <strong>Connect AI assistants to your documentation libraries</strong>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@libragen/mcp"><img src="https://img.shields.io/npm/v/@libragen/mcp.svg" alt="npm"></a>
  <a href="https://github.com/libragen/libragen/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License"></a>
</p>

<p align="center">
  <a href="https://libragen.dev/docs/cli">CLI</a> •
  <a href="https://libragen.dev/docs/api">Core API</a>
</p>

---

MCP server that lets Claude Desktop, VS Code, Cursor, and other AI tools search your libragen libraries directly. Ground your AI in real documentation instead of stale training data.

**[Full documentation →](https://libragen.dev/docs/mcp)**

## Quick Start

Try it in 60 seconds with the libragen documentation library:

```bash
# Download and install the libragen docs library
curl -L -O https://libragen.dev/libragen-docs-0.4.0.libragen
npx @libragen/cli install libragen-docs-0.4.0.libragen

# Install the MCP server (recommended: global install for reliability)
npm install -g @libragen/mcp
npx -y install-mcp libragen-mcp
```

Restart your AI tool (Claude Desktop, VS Code, Cursor, etc.), then ask:

> "Search my libragen-docs library for how to build a library from a git repo"

> "Give me some ideas for things I can do with the libragen MCP tools"

> "How do I install libraries to a project-local directory?"

Your AI retrieves relevant documentation and responds with accurate, cited answers.

## Build Your Own Libraries

Use the [@libragen/cli](../cli) to build libraries from your own docs:

```bash
# From local docs
npx @libragen/cli build ./your-private-docs --name company-docs

# From a git repository
npx @libragen/cli build https://github.com/anthropics/anthropic-cookbook --name anthropic-cookbook
```

Libraries are automatically discovered from your global directory and any `.libragen/libraries/` folders in your workspace.

<details>
<summary><strong>Manual MCP configuration</strong></summary>

Add to your tool's MCP config (using global install):

```json
{
  "mcpServers": {
    "libragen": {
      "command": "libragen-mcp"
    }
  }
}
```

Or with npx (may have cache issues on some systems):

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

</details>

## Available Tools

| Tool | Description |
|------|-------------|
| [`libragen_search`](https://libragen.dev/docs/mcp#libragen_search) | Search libraries for relevant content |
| [`libragen_list`](https://libragen.dev/docs/mcp#libragen_list) | List installed libraries |
| [`libragen_build`](https://libragen.dev/docs/mcp#libragen_build) | Build a library from source (async) |
| [`libragen_install`](https://libragen.dev/docs/mcp#libragen_install) | Install a library or collection |
| [`libragen_uninstall`](https://libragen.dev/docs/mcp#libragen_uninstall) | Remove an installed library |
| [`libragen_update`](https://libragen.dev/docs/mcp#libragen_update) | Update libraries from collections |
| [`libragen_collection`](https://libragen.dev/docs/mcp#libragen_collection) | Create collection files |
| [`libragen_config`](https://libragen.dev/docs/mcp#libragen_config) | Get configuration info |

## Related

- [@libragen/cli](../cli) — Build and manage libraries from the command line
- [@libragen/core](../core) — Programmatic API for custom integrations

**[Full MCP reference →](https://libragen.dev/docs/mcp)**

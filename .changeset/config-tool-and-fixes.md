---
"@libragen/mcp": minor
"@libragen/cli": minor
"@libragen/core": patch
---

### @libragen/mcp

- Add `libragen_config` tool to expose configuration info (paths, version, discovered directories, environment variables)

### @libragen/cli

- Add active library paths display to `config` command showing project-local and global paths
- Fix `install` command to accept multiple `-p, --path` flags (aligning with `uninstall`, `list`, `update`)

### @libragen/core

- Fix Windows compatibility for path separators and file locking in tests

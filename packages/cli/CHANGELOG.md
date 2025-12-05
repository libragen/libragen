# @libragen/cli

## 0.2.1

### Patch Changes

- [`7060aad`](https://github.com/libragen/libragen/commit/7060aad2856555c814102d6404753d717bc077da) Thanks [@yokuze](https://github.com/yokuze)! - **Performance Improvements:**

  - Refactor time estimation with config objects for better maintainability
  - Implement lazy embedder initialization with background warming for faster startup

  **Features:**

  - Upgrade Commander.js to v14 with enhanced TypeScript support, providing better type inference and developer experience

  **Fixes:**

  - Make VERSION constant dynamically read from package.json instead of being hardcoded

  **Refactoring:**

  - Remove legacy markings from collection search functionality
  - Remove legacy marking from collection install option

  **Documentation:**

  - Update CLI usage examples and workflow in README
  - Add quick setup and usage examples to MCP README
  - Fix CLI install command syntax in marketing copy
  - Update collections description to focus on team use case

- Updated dependencies [[`7060aad`](https://github.com/libragen/libragen/commit/7060aad2856555c814102d6404753d717bc077da)]:
  - @libragen/core@0.2.1

## 0.2.0

### Minor Changes

- [`e63c78e`](https://github.com/libragen/libragen/commit/e63c78e41cafda3a9196b6bbedff4dafc367f147) Thanks [@yokuze](https://github.com/yokuze)! - ### @libragen/mcp

  - Add `libragen_config` tool to expose configuration info (paths, version, discovered directories, environment variables)

  ### @libragen/cli

  - Add active library paths display to `config` command showing project-local and global paths
  - Fix `install` command to accept multiple `-p, --path` flags (aligning with `uninstall`, `list`, `update`)

  ### @libragen/core

  - Fix Windows compatibility for path separators and file locking in tests

### Patch Changes

- Updated dependencies [[`e63c78e`](https://github.com/libragen/libragen/commit/e63c78e41cafda3a9196b6bbedff4dafc367f147)]:
  - @libragen/core@0.2.0

## 0.1.1

### Patch Changes

- [`4da256a`](https://github.com/libragen/libragen/commit/4da256a7b8240e53e86735dd5b6f61dada659de2) Thanks [@yokuze](https://github.com/yokuze)! - Fixed TypeScript build configuration and synced schema $id URLs to use versioned paths.

- Updated dependencies [[`4da256a`](https://github.com/libragen/libragen/commit/4da256a7b8240e53e86735dd5b6f61dada659de2)]:
  - @libragen/core@0.1.1

## 0.1.0

Initial release.

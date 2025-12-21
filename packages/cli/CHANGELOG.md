# @libragen/cli

## 0.5.0

### Minor Changes

- [`a074cad`](https://github.com/libragen/libragen/commit/a074cadba746584bf8ac575a758c2e940e7f2f43) Thanks [@yokuze](https://github.com/yokuze)! - Migrate CLI from Commander.js to OClif framework

  ### Breaking Changes

  - **Shell completions**: The `completions` command has been replaced with `autocomplete`.
    - Old: `libragen completions install`
    - New: `libragen autocomplete`
    - Run `libragen autocomplete` for setup instructions

  ### Features

  - **Command suggestions**: Mistyped commands now show suggestions for similar commands
  - **CLI self-update**: Run `libragen cli-update` to update the CLI to the latest version

## 0.4.0

### Minor Changes

- [`c70ccb2`](https://github.com/libragen/libragen/commit/c70ccb24fd4568b3064f997284f43296aba4a93d) Thanks [@yokuze](https://github.com/yokuze)! - ### Features

  - Add ONNX Runtime parallelism configuration to embedder for improved performance
  - Add update prompt to CLI when a newer version is available
  - Increase default query result limit and show full content

  ### Fixes

  - Ensure git builds output to current working directory
  - Fix query result content display issues

### Patch Changes

- Updated dependencies [[`c70ccb2`](https://github.com/libragen/libragen/commit/c70ccb24fd4568b3064f997284f43296aba4a93d)]:
  - @libragen/core@0.4.0

## 0.3.0

### Minor Changes

- [`1ce77c6`](https://github.com/libragen/libragen/commit/1ce77c6528916ae34084fe195a529d920ad5b506) Thanks [@yokuze](https://github.com/yokuze)! - Enhanced CLI path handling and updated default installation location.

  - **Breaking Change**: Installations now default to `$LIBRAGEN_HOME/libraries` (global) instead of local `.libragen/libraries`.
  - **Feature**: The `-p` flag now automatically appends `.libragen/libraries` to the provided path.
  - **Improved**: Library discovery now prioritizes project-local libraries (shadowing global ones) while maintaining global default for new installations.
  - Updated documentation and tests to reflect these changes.

### Patch Changes

- Updated dependencies [[`1ce77c6`](https://github.com/libragen/libragen/commit/1ce77c6528916ae34084fe195a529d920ad5b506)]:
  - @libragen/core@0.3.0

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

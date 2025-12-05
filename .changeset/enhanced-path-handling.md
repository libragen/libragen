---
"@libragen/cli": minor
"@libragen/core": minor
"@libragen/mcp": minor
---

Enhanced CLI path handling and updated default installation location.

- **Breaking Change**: Installations now default to `$LIBRAGEN_HOME/libraries` (global) instead of local `.libragen/libraries`.
- **Feature**: The `-p` flag now automatically appends `.libragen/libraries` to the provided path.
- Updated documentation and tests to reflect these changes.

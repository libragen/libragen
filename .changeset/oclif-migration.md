---
"@libragen/cli": minor
---

Migrate CLI from Commander.js to OClif framework

### Breaking Changes

- **Shell completions**: The `completions` command has been replaced with `autocomplete`.
  - Old: `libragen completions install`
  - New: `libragen autocomplete`
  - Run `libragen autocomplete` for setup instructions

### Features

- **Command suggestions**: Mistyped commands now show suggestions for similar commands
- **CLI self-update**: Run `libragen cli-update` to update the CLI to the latest version

# Agent Guidelines for libragen

This document contains essential information for AI agents working on the libragen codebase.

## Repository Structure

```
libragen/
├── packages/
│   ├── core/           # Core library - embeddings, search, vector store, library manager
│   ├── cli/            # Command-line interface
│   ├── mcp/            # Model Context Protocol server for AI assistants
│   ├── website/        # Documentation/marketing site (Astro + Starlight)
│   ├── collections-site/ # Collections browser site
│   └── ui/             # Shared UI components
├── schemas/            # JSON schemas for library metadata
└── collections/        # Official library collections
```

## Package Dependencies

```
@libragen/core  ← @libragen/cli
                ← @libragen/mcp
```

- `@libragen/core` is the foundation - changes here affect CLI and MCP
- `@libragen/cli` and `@libragen/mcp` are consumers of core

## Key Architectural Concepts

### Library Manager (`packages/core/src/manager.ts`)

The `LibraryManager` class handles library discovery, installation, and uninstallation.

**Path Discovery (IMPORTANT):**
- Default behavior: auto-detect `.libragen/libraries` in cwd + global directory
- Install: Defaults to Global directory (unless `-p` is used)
- Discovery: Project-local libraries take priority over global (first path wins)
- When `paths` option is provided (via `-p`): use ONLY those paths (no global, no auto-detection, no transformations applied by core, but CLI applies transformation)

```typescript
// Default: project (priority) + global
// Install defaults to global via getPrimaryDirectory() logic
const manager = new LibraryManager();

// Explicit paths only (no global, no auto-detection)
const manager = new LibraryManager({ paths: ['.libragen/libraries'] });
```
```

### CLI Commands (`packages/cli/src/commands/`)

All commands that work with installed libraries support the `-p, --path` flag:
- `list`, `install`, `uninstall`, `update`
- When `-p` is provided, ONLY those paths are used
- Multiple `-p` flags are additive: `-p path1 -p path2`

**The `--local` flag was REMOVED** - use `-p .libragen/libraries` instead.

### MCP Server (`packages/mcp/src/`)

The MCP server provides 8 tools:
1. `libragen_search` - Search libraries for relevant content
2. `libragen_list` - List available libraries
3. `libragen_build` - Build a library from source (async with worker threads)
4. `libragen_install` - Install a library or collection
5. `libragen_uninstall` - Remove an installed library
6. `libragen_update` - Update installed libraries
7. `libragen_collection` - Create collection files
8. `libragen_config` - Get configuration info (paths, version, discovered directories)

The MCP server discovers libraries from:
1. Workspace roots (via MCP roots capability) - checks for `.libragen/libraries`
2. Global directory (fallback)

**Key files:**
- `server.ts` - exports `getLibraryPaths()`, `updateLibraryPathsFromRoots()`
- `index.ts` - calls `updateLibraryPathsFromRoots()` after connection
- `tools/*.ts` - individual tool implementations
- `tasks/` - async build task management (TaskManager, WorkerPool, build-worker)

### Async Build System (`packages/mcp/src/tasks/`)

The `libragen_build` tool uses an async pattern to avoid MCP timeouts:

**Architecture:**
- `task-manager.ts` - Manages build tasks with queuing and concurrency control
- `worker-pool.ts` - Spawns and manages worker threads
- `build-worker.ts` - Runs build operations in worker threads

**How it works:**
1. `action: 'start'` creates a task and returns a `taskId` immediately
2. Build runs in a worker thread (up to n-1 CPU cores concurrently)
3. `action: 'status'` returns progress, current step, and result when complete
4. `action: 'cancel'` cancels a running or queued build

**Environment variables:**
- `LIBRAGEN_TASK_EXPIRY_MS` - How long completed tasks are retained (default: 1 hour)

## Documentation Locations

When making changes that affect user-facing behavior, update ALL of these:

1. **Package READMEs:**
   - `packages/cli/README.md`
   - `packages/core/README.md`
   - `packages/mcp/README.md`

2. **Website docs (`packages/website/src/content/docs/`):**
   - `getting-started.md` - Quick start, library storage
   - `cli.md` - CLI reference
   - `mcp.md` - MCP integration
   - `building.md` - Building libraries
   - `collections.md` - Collections

3. **Schemas (`schemas/`):**
   - `library-metadata.schema.json` - Library file format

## Testing

```bash
# Run all tests
npm test

# Run tests for specific package
npm test --workspace=@libragen/core
npm test --workspace=@libragen/cli
npm test --workspace=@libragen/mcp
```

Tests are in `__tests__/` directories within each package.

## Building

```bash
# Build everything (TypeScript + websites)
npm run build

# TypeScript only
npx tsc --build
```

## Releasing

This repo uses **changesets** with automated GitHub Actions for releases.

**DO NOT run `npm run version` or `npm run release` locally.** The release process is:

1. **Create a changeset** describing your changes:
   ```bash
   npm run changeset
   ```
   Or create a file manually in `.changeset/` with the format:
   ```markdown
   ---
   "@libragen/cli": minor
   ---

   Description of changes
   ```

2. **Commit and push** the changeset file along with your code changes

3. **GitHub Actions handles the rest:**
   - When changesets are pushed to `main`, the `changesets/action` creates a "Version Packages" PR
   - This PR contains the version bumps and CHANGELOG updates
   - **Merging that PR triggers the actual npm publish**

**Changeset types:**
- `major` - Breaking changes
- `minor` - New features
- `patch` - Bug fixes

**Linked packages:** `@libragen/core`, `@libragen/cli`, and `@libragen/mcp` are linked in
`.changeset/config.json`, meaning they share version numbers.

**Ignored packages:** `@libragen/website`, `@libragen/collections-site`, and `@libragen/ui` are
not published to npm.

## Core Design Principles

### Core as the Single Source of Truth

**CRITICAL:** All business logic shared between CLI and MCP MUST live in `@libragen/core`.

The package hierarchy is:
```
@libragen/core   ← Contains ALL reusable logic
    ↑
    ├── @libragen/cli   ← Thin wrapper: UI, argument parsing, formatting
    └── @libragen/mcp   ← Thin wrapper: MCP protocol, async task management
```

**What belongs in core:**
- Building libraries (`Builder` class)
- Library management (`LibraryManager`)
- Searching and querying (`Searcher`, `Embedder`)
- Update checking (`checkForUpdate`, `findUpdates`)
- Collection resolution
- All data types and interfaces
- Utility functions (`formatBytes`, `formatDuration`, etc.)

**What belongs in CLI/MCP:**
- User interface concerns (chalk, ora, interactive prompts)
- Protocol-specific code (MCP SDK, commander.js)
- Async execution patterns (worker threads in MCP)
- Output formatting for specific contexts

### Avoiding Duplication

Before implementing logic in CLI or MCP, ask:
1. Does this logic already exist in core?
2. Could another consumer (CLI or MCP) benefit from this logic?
3. Is this pure business logic or UI/protocol-specific?

If the logic is reusable, it MUST go in core. CLI and MCP should be thin wrappers that:
- Parse inputs (arguments, MCP tool params)
- Call core functions
- Format outputs for their context

**Anti-pattern (DO NOT DO THIS):**
```typescript
// packages/cli/src/commands/build.ts
// 300 lines of build logic...

// packages/mcp/src/tasks/build-worker.ts
// 300 lines of nearly identical build logic...
```

**Correct pattern:**
```typescript
// packages/core/src/builder.ts
export class Builder {
  async build(source: string, options: BuildOptions): Promise<BuildResult> {
    // All build logic here
  }
}

// packages/cli/src/commands/build.ts
const builder = new Builder();
const result = await builder.build(source, options);
// Format and display result with chalk/ora

// packages/mcp/src/tasks/build-worker.ts
const builder = new Builder();
const result = await builder.build(source, options);
// Send result via worker message
```

### Core Module Organization

Core exports are organized by domain:

```typescript
// Building
export { Builder } from './builder.ts';
export type { BuildOptions, BuildResult, BuildProgress } from './builder.ts';

// Library Management
export { LibraryManager } from './manager.ts';
export type { InstalledLibrary, InstallOptions } from './manager.ts';

// Searching
export { Searcher, Embedder, Reranker } from './...';

// Update Checking
export { checkForUpdate, findUpdates } from './update-checker.ts';

// Utilities
export { formatBytes, formatDuration, deriveGitLibraryName } from './utils.ts';
```

## Common Patterns

### Adding a New Option to CLI Commands

1. Update the command's options interface
2. Add the option to the command definition
3. Update the command's action handler
4. Update tests in `packages/cli/src/__tests__/cli.test.ts`
5. Update `packages/cli/README.md`
6. Update `packages/website/src/content/docs/cli.md`

### Modifying LibraryManager Behavior

1. Update `packages/core/src/manager.ts`
2. Update `packages/core/src/index.ts` exports if needed
3. Update tests in `packages/core/src/__tests__/manager.test.ts`
4. Update `packages/core/README.md`
5. Check if CLI commands need updates
6. Check if MCP tools need updates
7. Update website docs

### Adding/Modifying Library Metadata Fields

1. Update `schemas/library-metadata.schema.json`
2. Update TypeScript types in `packages/core/src/types.ts`
3. Update builder in `packages/core/src/builder.ts`
4. Update MCP tools that read metadata
5. Update website schema docs at `packages/website/src/content/docs/schemas.md`

### Adding New Functionality to Both CLI and MCP

1. **First, implement in core:**
   - Create the class/function in `packages/core/src/`
   - Export from `packages/core/src/index.ts`
   - Add tests in `packages/core/src/__tests__/`
   - Add JSDoc documentation
2. **Then, create CLI wrapper:**
   - Import from `@libragen/core`
   - Add command in `packages/cli/src/commands/`
   - Handle argument parsing and output formatting only
3. **Then, create MCP wrapper:**
   - Import from `@libragen/core`
   - Add tool in `packages/mcp/src/tools/`
   - Handle MCP protocol concerns only
4. **Update documentation** for all three packages

## Code Style

- Use TypeScript strict mode
- Use ESLint with the project's config
- Prefer early returns to reduce nesting
- Use JSDoc for public APIs
- Follow existing patterns in the codebase

## Commit Messages

Follow conventional commits:
- `feat:` - New features
- `fix:` - Bug fixes
- `docs:` - Documentation only
- `refactor:` - Code changes that don't add features or fix bugs
- `test:` - Adding or updating tests
- `chore:` - Maintenance tasks

DO NOT USE SCOPED COMMITS

## Common Mistakes to Avoid

1. **Forgetting to update documentation** - Always update READMEs AND website docs
2. **Not running tests** - Run `npm test` before considering work complete
3. **Hardcoding paths** - Use `getDefaultLibraryDir()` and path utilities
4. **Breaking the MCP server** - Test with actual MCP clients when possible
5. **Ignoring TypeScript errors** - Fix all errors before committing
6. **Creating ad-hoc test scripts** - Use the existing test infrastructure
7. **Using scoped commits** - Use conventional commits but do not scope them
8. **Linting errors** - Run `npm run standards` as a final check before finishing a task
9. **Duplicating logic between CLI and MCP** - If logic could be shared, it belongs in core. See "Core Design Principles" above
10. **Implementing business logic in CLI/MCP** - CLI and MCP should be thin wrappers around core functionality
11. **Running `npm run version` or `npm run release` locally** - Use changesets workflow instead. See "Releasing" above

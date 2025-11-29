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
- When `paths` option is provided: use ONLY those paths (no global, no auto-detection)
- Project-local libraries take priority over global (first path wins)

```typescript
// Default: auto-detect + global
const manager = new LibraryManager();

// Explicit paths only (no global, no auto-detection)
const manager = new LibraryManager({ paths: ['.libragen/libraries'] });
```

### CLI Commands (`packages/cli/src/commands/`)

All commands that work with installed libraries support the `-p, --path` flag:
- `list`, `install`, `uninstall`, `update`
- When `-p` is provided, ONLY those paths are used
- Multiple `-p` flags are additive: `-p path1 -p path2`

**The `--local` flag was REMOVED** - use `-p .libragen/libraries` instead.

### MCP Server (`packages/mcp/src/`)

The MCP server discovers libraries from:
1. Workspace roots (via MCP roots capability) - checks for `.libragen/libraries`
2. Global directory (fallback)

**Key files:**
- `server.ts` - exports `getLibraryPaths()`, `updateLibraryPathsFromRoots()`
- `index.ts` - calls `updateLibraryPathsFromRoots()` after connection
- `tools/list.ts`, `tools/search.ts` - use `getLibraryPaths()` for discovery

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

## Common Mistakes to Avoid

1. **Forgetting to update documentation** - Always update READMEs AND website docs
2. **Not running tests** - Run `npm test` before considering work complete
3. **Hardcoding paths** - Use `getDefaultLibraryDir()` and path utilities
4. **Breaking the MCP server** - Test with actual MCP clients when possible
5. **Ignoring TypeScript errors** - Fix all errors before committing
6. **Creating ad-hoc test scripts** - Use the existing test infrastructure

# Schema Changes & Versioning Guide

This document describes how to make schema changes to `.libragen` library files and how the versioning system works.

## Overview

Libragen uses an integer-based schema versioning system stored in the `library_meta` table. When a library is opened, the `MigrationRunner` automatically applies any pending migrations to bring it up to the current schema version.

## Current Schema (v1)

The baseline schema includes:

- **`sources`** - Tracks source files/repositories
- **`chunks`** - Stores content chunks with embeddings
- **`chunks_fts`** - FTS5 virtual table for keyword search
- **`library_meta`** - Key-value metadata storage (includes `schema_version` and `manifest`)

## When to Bump the Schema Version

Bump the schema version when you need to:

- Add new tables
- Add columns to existing tables
- Modify column types or constraints
- Add or modify indexes
- Change the structure of stored JSON (e.g., the manifest format)

**Do NOT bump** the schema version for:

- Adding new keys to the manifest JSON (backward compatible)
- Adding new optional metadata fields
- Changes to the application code that don't affect storage

## Types of Schema Changes

### Non-Breaking (Additive)

These changes are backward compatible - older libraries can be migrated automatically:

- Adding new tables
- Adding nullable columns to existing tables
- Adding new indexes
- Adding new optional keys to JSON structures

### Breaking

These changes require careful handling:

- Removing tables or columns
- Changing column types
- Renaming tables or columns
- Changing the meaning of existing data

For breaking changes, consider:

1. Whether the change is truly necessary
2. How to migrate existing data
3. Whether to support a deprecation period

## How to Add a Migration

### 1. Create the Migration File

Create a new file in `packages/core/src/migrations/migrations/` following the naming convention `NNN-description.ts`:

```typescript
// 002-add-tags-column.ts
import type { Migration } from '../types.ts';

export const migration002AddTagsColumn: Migration = {
   version: 2,
   description: 'Add tags column to chunks table',
   up(db) {
      db.exec('ALTER TABLE chunks ADD COLUMN tags TEXT');
   },
};
```

### 2. Register the Migration

Update `packages/core/src/migrations/registry.ts`:

```typescript
import { migration001Baseline } from './migrations/001-baseline.ts';
import { migration002AddTagsColumn } from './migrations/002-add-tags-column.ts';

export const migrations: Migration[] = [
   migration001Baseline,
   migration002AddTagsColumn,
];

// IMPORTANT: Update this to match the new migration version
export const CURRENT_SCHEMA_VERSION = 2;
```

### 3. Write Tests

Add tests in `packages/core/src/__tests__/migrations.test.ts`:

```typescript
it('migration 002 adds tags column', async () => {
   // Create a v1 database
   const store = new VectorStore(dbPath);
   store.initialize();
   store.setMeta('schema_version', '1');
   store.close();

   // Open should trigger migration
   const library = await Library.open(dbPath);

   // Verify the column exists
   const db = library.getStore().getDatabase();
   const columns = db.pragma('table_info(chunks)') as Array<{ name: string }>;
   expect(columns.some(c => c.name === 'tags')).toBe(true);

   library.close();
});
```

### 4. Update Documentation

If the change affects users or library authors, update relevant documentation.

## Migration Guidelines

### Do

- **Keep migrations simple**: One logical change per migration
- **Make migrations idempotent**: Running twice should be safe
- **Test thoroughly**: Test migration from each previous version
- **Handle empty tables**: Don't assume data exists
- **Use transactions**: The runner wraps each migration in a transaction

### Don't

- **Don't modify existing migrations**: Once released, migrations are immutable
- **Don't skip versions**: Migrations must be sequential (1, 2, 3, not 1, 3)
- **Don't use async operations**: The `up()` function must be synchronous
- **Don't assume column order**: Use explicit column names in queries

## Safety Features

The migration framework provides several safety features:

### Backup/Restore

Before running migrations, a backup is created at `<library>.backup`. On success, the backup is deleted. On failure, the backup is restored.

### Transactions

Each migration runs in a SQLite transaction. If the migration throws, the transaction is rolled back.

### Version Checks

- Libraries with schema versions higher than `CURRENT_SCHEMA_VERSION` are rejected with `SchemaVersionError`
- Read-only mode (`Library.open(path, { readOnly: true })`) refuses to migrate

## Version Compatibility Matrix

| Library Schema | Libragen Version | Result |
|----------------|------------------|--------|
| v1 | v1 | Opens normally |
| v1 | v2 | Migrates to v2 |
| v2 | v1 | `SchemaVersionError` |
| v2 | v2 | Opens normally |

## Checking Schema Version

### CLI

```bash
libragen inspect my-library.libragen
```

Output includes:
```
Schema:         v1
```

### Programmatically

```typescript
import { Library } from '@libragen/core';

const library = await Library.open('my-library.libragen');
console.log(library.getMetadata().schemaVersion); // 1
```

### Validation

```typescript
import { Library } from '@libragen/core';

const result = await Library.validate('my-library.libragen');
// result.warnings may include schema version info
// result.errors will include SchemaVersionError if incompatible
```

## Downgrade Considerations

The migration framework is **forward-only** - there are no downgrade migrations. If you need to open a library with an older version of libragen:

1. Keep a backup of the original library before upgrading
2. Use the version of libragen that matches the library's schema version
3. Consider maintaining schema compatibility in your CI/CD pipeline

## Release Checklist

When releasing a version with schema changes:

- [ ] Migration file created and tested
- [ ] `CURRENT_SCHEMA_VERSION` updated in registry
- [ ] Tests cover migration from all previous versions
- [ ] Documentation updated
- [ ] CHANGELOG mentions the schema change
- [ ] Consider backward compatibility implications

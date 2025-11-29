# Libragen Schema Migrations

This directory contains the schema migration framework for `.libragen` library files.

## Overview

The migration framework provides:

- **Automatic migrations**: Libraries are automatically migrated when opened
- **Backup/restore**: A backup is created before migration and restored on failure
- **Read-only mode**: Libraries can be opened in read-only mode (refuses migration)
- **Version compatibility**: Libraries with future schema versions are rejected

## Current Schema Version

The current schema version is defined in `registry.ts` as `CURRENT_SCHEMA_VERSION`.

## Creating a New Migration

### 1. Create the Migration File

Create a new file in `migrations/` with the naming convention `NNN-description.ts`:

```typescript
// migrations/002-add-tags-column.ts
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

Add the migration to `registry.ts`:

```typescript
import { migration001Baseline } from './migrations/001-baseline.ts';
import { migration002AddTagsColumn } from './migrations/002-add-tags-column.ts';

export const migrations: Migration[] = [
   migration001Baseline,
   migration002AddTagsColumn,
];

// Update this to match the highest migration version
export const CURRENT_SCHEMA_VERSION = 2;
```

### 3. Write Tests

Add tests for your migration in `__tests__/migrations.test.ts`:

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
   const columns = db.pragma('table_info(chunks)');
   expect(columns.some(c => c.name === 'tags')).toBe(true);

   library.close();
});
```

## Migration Guidelines

### Do

- **Keep migrations simple**: Each migration should do one thing
- **Use transactions**: The runner wraps each migration in a transaction
- **Test thoroughly**: Test both the migration itself and the rollback scenario
- **Document breaking changes**: If a migration changes data format, document it

### Don't

- **Don't modify existing migrations**: Once released, migrations are immutable
- **Don't skip versions**: Migrations must be sequential (1, 2, 3, not 1, 3)
- **Don't assume data exists**: Handle empty tables gracefully
- **Don't use async operations**: The `up()` function must be synchronous

## Migration Interface

```typescript
interface Migration {
   /** The schema version this migration upgrades to */
   version: number;

   /** Human-readable description of what this migration does */
   description: string;

   /**
    * Execute the migration.
    * @param db - The better-sqlite3 database connection
    */
   up(db: Database.Database): void;
}
```

## Error Handling

The migration framework handles errors as follows:

1. **SchemaVersionError**: Thrown when a library has a schema version higher than
   `CURRENT_SCHEMA_VERSION`. This means the library was created with a newer version
   of libragen.

2. **MigrationRequiredError**: Thrown when opening a library in read-only mode that
   requires migration.

3. **Migration failure**: If any migration fails, the backup is restored and the
   original error is rethrown.

## File Structure

```
migrations/
├── index.ts              # Public exports
├── types.ts              # Migration interface, error classes
├── runner.ts             # MigrationRunner class
├── registry.ts           # Migration list and CURRENT_SCHEMA_VERSION
├── README.md             # This file
└── migrations/
    └── 001-baseline.ts   # Baseline v1 (no-op)
```

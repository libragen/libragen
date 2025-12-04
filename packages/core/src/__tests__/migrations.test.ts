/**
 * Tests for the migration framework
 */

/* eslint-disable @silvermine/silvermine/fluent-chaining */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { Library } from '../library.ts';
import { VectorStore } from '../store.ts';
import {
   MigrationRunner,
   MigrationRequiredError,
   SchemaVersionError,
   CURRENT_SCHEMA_VERSION,
} from '../migrations/index.ts';
import type { Migration } from '../migrations/index.ts';

describe('MigrationRunner', () => {
   let tempDir: string,
       dbPath: string;

   beforeEach(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'libragen-migration-test-'));
      dbPath = path.join(tempDir, 'test.libragen');
   });

   afterEach(async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
   });

   describe('getCurrentVersion', () => {
      it('returns 0 for new database without schema_version', async () => {
         const store = new VectorStore(dbPath);

         store.initialize();

         const runner = new MigrationRunner([]);

         const version = runner.getCurrentVersion(store.getDatabase());

         expect(version).toBe(0);

         store.close();
      });

      it('returns correct version from database', async () => {
         const store = new VectorStore(dbPath);

         store.initialize();
         store.setMeta('schema_version', '5');

         const runner = new MigrationRunner([]);

         const version = runner.getCurrentVersion(store.getDatabase());

         expect(version).toBe(5);

         store.close();
      });
   });

   describe('getPendingMigrations', () => {
      it('returns migrations greater than current version', () => {
         const migrations: Migration[] = [
            { version: 1, description: 'v1', up: () => {} },
            { version: 2, description: 'v2', up: () => {} },
            { version: 3, description: 'v3', up: () => {} },
         ];

         const runner = new MigrationRunner(migrations);

         const pending = runner.getPendingMigrations(1);

         expect(pending).toHaveLength(2);
         expect(pending[0].version).toBe(2);
         expect(pending[1].version).toBe(3);
      });

      it('returns empty array when up to date', () => {
         const migrations: Migration[] = [
            { version: 1, description: 'v1', up: () => {} },
            { version: 2, description: 'v2', up: () => {} },
         ];

         const runner = new MigrationRunner(migrations);

         const pending = runner.getPendingMigrations(2);

         expect(pending).toHaveLength(0);
      });

      it('returns all migrations for version 0', () => {
         const migrations: Migration[] = [
            { version: 1, description: 'v1', up: () => {} },
            { version: 2, description: 'v2', up: () => {} },
         ];

         const runner = new MigrationRunner(migrations);

         const pending = runner.getPendingMigrations(0);

         expect(pending).toHaveLength(2);
      });
   });

   describe('migrate', () => {
      it('runs migrations in order and updates schema_version', async () => {
         const store = new VectorStore(dbPath);

         store.initialize();
         store.setMeta('schema_version', '1');

         const executionOrder: number[] = [];

         const migrations: Migration[] = [
            { version: 1, description: 'v1', up: () => { executionOrder.push(1); } },
            { version: 2, description: 'v2', up: () => { executionOrder.push(2); } },
            { version: 3, description: 'v3', up: () => { executionOrder.push(3); } },
         ];

         const runner = new MigrationRunner(migrations);

         const result = await runner.migrate(dbPath, store.getDatabase());

         expect(result.fromVersion).toBe(1);
         expect(result.toVersion).toBe(3);
         expect(result.migrationsApplied).toEqual([ 2, 3 ]);
         expect(executionOrder).toEqual([ 2, 3 ]);

         // Verify schema_version was updated
         const newVersion = runner.getCurrentVersion(store.getDatabase());

         expect(newVersion).toBe(3);

         store.close();
      });

      it('creates and deletes backup on success', async () => {
         const store = new VectorStore(dbPath);

         store.initialize();
         store.setMeta('schema_version', '1');

         const migrations: Migration[] = [
            { version: 1, description: 'v1', up: () => {} },
            { version: 2, description: 'v2', up: () => {} },
         ];

         const runner = new MigrationRunner(migrations);

         await runner.migrate(dbPath, store.getDatabase());

         // Backup should be deleted on success
         const backupExists = await fs.access(`${dbPath}.backup`)
            .then(() => { return true; })
            .catch(() => { return false; });

         expect(backupExists).toBe(false);

         store.close();
      });

      it('restores backup on failure', async () => {
         const store = new VectorStore(dbPath);

         store.initialize();
         store.setMeta('schema_version', '1');
         store.setMeta('test_key', 'original_value');
         store.close();

         // Reopen for migration
         const store2 = new VectorStore(dbPath);

         store2.initialize();

         const migrations: Migration[] = [
            { version: 1, description: 'v1', up: () => {} },
            {
               version: 2,
               description: 'v2',
               up: () => {
                  // Fail the migration
                  throw new Error('Migration failed!');
               },
            },
         ];

         const runner = new MigrationRunner(migrations);

         await expect(runner.migrate(dbPath, store2.getDatabase()))
            .rejects
            .toThrow('Migration failed!');

         // The db was closed by the runner on failure, so open a new one
         const store3 = new VectorStore(dbPath);

         store3.initialize();

         // Verify data is intact (transaction rolled back or backup restored)
         const testValue = store3.getMeta('test_key');

         expect(testValue).toBe('original_value');

         // Schema version should still be 1
         const version = runner.getCurrentVersion(store3.getDatabase());

         expect(version).toBe(1);

         // Backup should have been cleaned up
         const backupExists = await fs.access(`${dbPath}.backup`)
            .then(() => { return true; })
            .catch(() => { return false; });

         expect(backupExists).toBe(false);

         store3.close();
      });

      it('throws SchemaVersionError for future schema versions', async () => {
         const store = new VectorStore(dbPath);

         store.initialize();
         store.setMeta('schema_version', '999');

         const runner = new MigrationRunner([]);

         await expect(runner.migrate(dbPath, store.getDatabase()))
            .rejects
            .toThrow(SchemaVersionError);

         store.close();
      });

      it('throws MigrationRequiredError in read-only mode when migration needed', async () => {
         const store = new VectorStore(dbPath);

         store.initialize();
         store.setMeta('schema_version', '0');

         const migrations: Migration[] = [
            { version: 1, description: 'v1', up: () => {} },
         ];

         const runner = new MigrationRunner(migrations);

         await expect(runner.migrate(dbPath, store.getDatabase(), { readOnly: true }))
            .rejects
            .toThrow(MigrationRequiredError);

         store.close();
      });

      it('succeeds in read-only mode when no migration needed', async () => {
         const store = new VectorStore(dbPath);

         store.initialize();
         store.setMeta('schema_version', '1');

         const migrations: Migration[] = [
            { version: 1, description: 'v1', up: () => {} },
         ];

         const runner = new MigrationRunner(migrations);

         const result = await runner.migrate(dbPath, store.getDatabase(), { readOnly: true });

         expect(result.migrationsApplied).toHaveLength(0);

         store.close();
      });

      it('returns no-op result when already at current version', async () => {
         const store = new VectorStore(dbPath);

         store.initialize();
         store.setMeta('schema_version', '2');

         const migrations: Migration[] = [
            { version: 1, description: 'v1', up: () => {} },
            { version: 2, description: 'v2', up: () => {} },
         ];

         const runner = new MigrationRunner(migrations);

         const result = await runner.migrate(dbPath, store.getDatabase());

         expect(result.fromVersion).toBe(2);
         expect(result.toVersion).toBe(2);
         expect(result.migrationsApplied).toHaveLength(0);

         store.close();
      });
   });
});

describe('Library migration integration', () => {
   let tempDir: string,
       libraryPath: string;

   beforeEach(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'libragen-lib-migration-test-'));
      libraryPath = path.join(tempDir, 'test.libragen');
   });

   afterEach(async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
   });

   describe('Library.create', () => {
      it('sets current schema version', async () => {
         const library = await Library.create(libraryPath, {
            name: 'test-library',
         });

         const metadata = library.getMetadata();

         expect(metadata.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);

         // Also verify it's in the database
         const dbVersion = library.getStore().getMeta('schema_version');

         expect(dbVersion).toBe(String(CURRENT_SCHEMA_VERSION));

         await library.close();
      });
   });

   describe('Library.open', () => {
      it('triggers migrations automatically', async () => {
         // Create a library with an old schema version
         const store = new VectorStore(libraryPath);

         store.initialize();
         store.setMeta('schema_version', '0');
         store.setMetadata({
            name: 'old-library',
            version: '1.0.0',
            createdAt: new Date().toISOString(),
            embedding: { model: 'test', dimensions: 384 },
            chunking: { strategy: 'recursive', chunkSize: 1000, chunkOverlap: 100 },
            stats: { chunkCount: 0, sourceCount: 0, fileSize: 0 },
            contentHash: '',
         });
         store.close();

         // Open should trigger migration
         const library = await Library.open(libraryPath);

         // Schema version should be updated
         const dbVersion = library.getStore().getMeta('schema_version');

         expect(dbVersion).toBe(String(CURRENT_SCHEMA_VERSION));

         // Metadata should have schemaVersion
         expect(library.getMetadata().schemaVersion).toBe(CURRENT_SCHEMA_VERSION);

         await library.close();
      });

      it('refuses migration in read-only mode', async () => {
         // Create a library with an old schema version
         const store = new VectorStore(libraryPath);

         store.initialize();
         store.setMeta('schema_version', '0');
         store.setMetadata({
            name: 'old-library',
            version: '1.0.0',
            createdAt: new Date().toISOString(),
            embedding: { model: 'test', dimensions: 384 },
            chunking: { strategy: 'recursive', chunkSize: 1000, chunkOverlap: 100 },
            stats: { chunkCount: 0, sourceCount: 0, fileSize: 0 },
            contentHash: '',
         });
         store.close();

         // Open in read-only mode should fail
         await expect(Library.open(libraryPath, { readOnly: true }))
            .rejects
            .toThrow(MigrationRequiredError);
      });

      it('opens normally when no migration needed', async () => {
         // Create a library with current schema version
         const library = await Library.create(libraryPath, {
            name: 'current-library',
         });

         await library.close();

         // Open should work without issues
         const reopened = await Library.open(libraryPath);

         expect(reopened.getMetadata().name).toBe('current-library');
         expect(reopened.getMetadata().schemaVersion).toBe(CURRENT_SCHEMA_VERSION);

         await reopened.close();
      });

      it('opens in read-only mode when no migration needed', async () => {
         // Create a library with current schema version
         const library = await Library.create(libraryPath, {
            name: 'current-library',
         });

         await library.close();

         // Open in read-only mode should work
         const reopened = await Library.open(libraryPath, { readOnly: true });

         expect(reopened.getMetadata().name).toBe('current-library');

         await reopened.close();
      });
   });

   describe('Library.validate', () => {
      it('reports error for future schema version', async () => {
         const store = new VectorStore(libraryPath);

         store.initialize();
         store.setMeta('schema_version', '999');
         store.setMetadata({
            name: 'future-library',
            version: '1.0.0',
            createdAt: new Date().toISOString(),
            embedding: { model: 'test', dimensions: 384 },
            chunking: { strategy: 'recursive', chunkSize: 1000, chunkOverlap: 100 },
            stats: { chunkCount: 0, sourceCount: 0, fileSize: 0 },
            contentHash: '',
         });
         store.close();

         const result = await Library.validate(libraryPath);

         expect(result.valid).toBe(false);
         expect(result.errors.some((e) => { return e.includes('requires libragen with schema v999'); })).toBe(true);
      });

      it('warns about pending migration', async () => {
         const store = new VectorStore(libraryPath);

         store.initialize();
         store.setMeta('schema_version', '0');
         store.setMetadata({
            name: 'old-library',
            version: '1.0.0',
            createdAt: new Date().toISOString(),
            embedding: { model: 'test', dimensions: 384 },
            chunking: { strategy: 'recursive', chunkSize: 1000, chunkOverlap: 100 },
            stats: { chunkCount: 0, sourceCount: 0, fileSize: 0 },
            contentHash: '',
         });
         store.close();

         const result = await Library.validate(libraryPath);

         expect(result.valid).toBe(true);
         expect(result.warnings.some((w) => { return w.includes('Migration will be applied'); })).toBe(true);
      });
   });
});

describe('LibraryMetadata.schemaVersion', () => {
   let tempDir: string,
       libraryPath: string;

   beforeEach(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'libragen-metadata-test-'));
      libraryPath = path.join(tempDir, 'test.libragen');
   });

   afterEach(async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
   });

   it('is populated correctly on create', async () => {
      const library = await Library.create(libraryPath, {
         name: 'test-library',
      });

      expect(library.getMetadata().schemaVersion).toBe(CURRENT_SCHEMA_VERSION);

      await library.close();
   });

   it('is populated correctly on open', async () => {
      const library = await Library.create(libraryPath, {
         name: 'test-library',
      });

      await library.close();

      const reopened = await Library.open(libraryPath);

      expect(reopened.getMetadata().schemaVersion).toBe(CURRENT_SCHEMA_VERSION);

      await reopened.close();
   });
});

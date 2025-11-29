/**
 * MigrationRunner - Executes schema migrations with backup/restore safety.
 */

import * as fs from 'fs/promises';
import type Database from 'better-sqlite3';
import type { Migration, MigrationResult } from './types.ts';
import { MigrationRequiredError, SchemaVersionError } from './types.ts';
import { CURRENT_SCHEMA_VERSION, migrations } from './registry.ts';

export { CURRENT_SCHEMA_VERSION };

/**
 * Options for running migrations.
 */
export interface MigrateOptions {

   /** If true, refuse to migrate and throw MigrationRequiredError if migration is needed
    * */
   readOnly?: boolean;
}

/**
 * Runs schema migrations on a library database.
 */
export class MigrationRunner {

   private readonly _migrations: Migration[];
   private readonly _targetVersion: number;

   public constructor(migrationList: Migration[] = migrations) {
      // Sort migrations by version to ensure correct order
      this._migrations = [ ...migrationList ].sort((a, b) => {
         return a.version - b.version;
      });

      // Target version is the highest migration version, or CURRENT_SCHEMA_VERSION if no
      // migrations
      this._targetVersion = this._migrations.length > 0
         ? this._migrations[this._migrations.length - 1].version
         : CURRENT_SCHEMA_VERSION;
   }

   /**
    * Get the target schema version for this runner.
    */
   public getTargetVersion(): number {
      return this._targetVersion;
   }

   /**
    * Get the current schema version from the database. Returns 0 if no schema version is
    * set (legacy library).
    */
   public getCurrentVersion(db: Database.Database): number {
      try {
         const row = db
            .prepare('SELECT value FROM library_meta WHERE key = ?')
            .get('schema_version') as { value: string } | undefined;

         if (!row) {
            return 0;
         }

         const version = parseInt(row.value, 10);

         return isNaN(version) ? 0 : version;
      } catch{
         // Table might not exist yet
         return 0;
      }
   }

   /**
    * Get migrations that need to be applied to reach the current schema version.
    */
   public getPendingMigrations(currentVersion: number): Migration[] {
      return this._migrations.filter((m) => {
         return m.version > currentVersion;
      });
   }

   /**
    * Run pending migrations on a database.
    *
    * @param dbPath - Path to the database file (for backup/restore)
    * @param db - Open database connection
    * @param options - Migration options
    * @returns Result of the migration
    * @throws SchemaVersionError if the library requires a newer libragen version
    * @throws MigrationRequiredError if readOnly is true and migration is needed
    */
   public async migrate(
      dbPath: string,
      db: Database.Database,
      options: MigrateOptions = {}
   ): Promise<MigrationResult> {
      const currentVersion = this.getCurrentVersion(db);

      // Check for future schema version
      if (currentVersion > this._targetVersion) {
         throw new SchemaVersionError(
            `Library requires libragen with schema v${currentVersion}, but this version ` +
            `only supports up to v${this._targetVersion}. Please upgrade libragen.`,
            currentVersion,
            this._targetVersion
         );
      }

      const pending = this.getPendingMigrations(currentVersion);

      // No migrations needed
      if (pending.length === 0) {
         return {
            fromVersion: currentVersion,
            toVersion: currentVersion,
            migrationsApplied: [],
         };
      }

      // Check read-only mode
      if (options.readOnly) {
         throw new MigrationRequiredError(currentVersion, this._targetVersion);
      }

      const backupPath = `${dbPath}.backup`;

      let backupCreated = false;

      try {
         // Create backup before migration
         await fs.copyFile(dbPath, backupPath);
         backupCreated = true;

         const appliedVersions: number[] = [];

         // Run each migration in a transaction
         for (const migration of pending) {
            const runMigration = db.transaction(() => {
               migration.up(db);

               // Update schema version after each migration
               db.prepare('INSERT OR REPLACE INTO library_meta (key, value) VALUES (?, ?)')
                  .run('schema_version', String(migration.version));
            });

            runMigration();
            appliedVersions.push(migration.version);
         }

         // Migration successful - delete backup
         await fs.unlink(backupPath);

         return {
            fromVersion: currentVersion,
            toVersion: this._targetVersion,
            migrationsApplied: appliedVersions,
         };
      } catch(error) {
         // Migration failed - restore backup if it was created
         if (backupCreated) {
            try {
               // Close the database before restoring
               db.close();

               // Restore from backup
               await fs.copyFile(backupPath, dbPath);
               await fs.unlink(backupPath);
            } catch(restoreError) {
               // Log restore failure but rethrow original error
               console.error('Failed to restore backup after migration failure:', restoreError);
            }
         }

         throw error;
      }
   }

}

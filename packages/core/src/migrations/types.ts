/**
 * Migration types and interfaces for schema versioning.
 */

import type Database from 'better-sqlite3';

/**
 * A migration that upgrades the database schema from one version to the next.
 */
export interface Migration {

   /** The schema version this migration upgrades to */
   version: number;

   /** Human-readable description of what this migration does */
   description: string;

   /**
    * Execute the migration.
    * @param db - The database connection to run the migration on
    */
   up(db: Database.Database): void;
}

/**
 * Result of running migrations.
 */
export interface MigrationResult {

   /** Schema version before migration */
   fromVersion: number;

   /** Schema version after migration */
   toVersion: number;

   /** List of migration versions that were applied */
   migrationsApplied: number[];
}

/**
 * Error thrown when a library requires a newer version of libragen.
 */
export class SchemaVersionError extends Error {

   public readonly name = 'SchemaVersionError';

   public constructor(
      message: string,
      public readonly currentVersion: number,
      public readonly requiredVersion: number
   ) {
      super(message);
   }

}

/**
 * Error thrown when a library needs migration but was opened in read-only mode.
 */
export class MigrationRequiredError extends Error {

   public readonly name = 'MigrationRequiredError';

   public constructor(
      public readonly currentVersion: number,
      public readonly targetVersion: number
   ) {
      super(
         `Library needs migration from schema v${currentVersion} to v${targetVersion}; open in write mode to migrate`
      );
   }

}

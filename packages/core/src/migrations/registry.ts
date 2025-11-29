/**
 * Migration registry - contains all migrations and the current schema version.
 */

import { migration001Baseline } from './migrations/001-baseline.ts';
import type { Migration } from './types.ts';

/**
 * All registered migrations, in order.
 * When adding a new migration:
 * 1. Create a new file in ./migrations/ (e.g., 002-add-column.ts)
 * 2. Import and add it to this array
 * 3. Update CURRENT_SCHEMA_VERSION to match the new migration's version
 */
export const migrations: Migration[] = [
   migration001Baseline,
];

/**
 * The current schema version.
 * This should always match the highest migration version in the migrations array.
 */
export const CURRENT_SCHEMA_VERSION = 1;

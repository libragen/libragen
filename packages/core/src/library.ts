/**
 * Library module - High-level abstraction for .libragen library files
 *
 * Provides a clean interface for creating, opening, and validating library files. Wraps
 * VectorStore with additional features like content hash verification.
 */

import { createHash } from 'crypto';
import * as fs from 'fs/promises';
import { VectorStore } from './store.ts';
import { MigrationRunner, CURRENT_SCHEMA_VERSION } from './migrations/index.ts';
import type { LibraryMetadata } from './types.ts';
import type { Chunk } from './chunker.ts';

export interface ValidationResult {
   valid: boolean;
   errors: string[];
   warnings: string[];
}

export interface LibraryCreateOptions {

   /** Library name (required) */
   name: string;

   /** Library version (default: "0.1.0") */
   version?: string;

   /** Version of the source content (e.g., "1.74.0" for Rust docs) */
   contentVersion?: string;

   /** Type of content version */
   contentVersionType?: 'semver' | 'commit' | 'date' | 'revision' | 'custom';

   /** Human-readable display name */
   displayName?: string;

   /** Short description */
   description?: string;

   /** Guidance for AI agents on when to use this library */
   agentDescription?: string;

   /** Example queries this library can answer */
   exampleQueries?: string[];

   /** Searchable keywords/tags */
   keywords?: string[];

   /** Programming languages covered (e.g., "typescript", "python") */
   programmingLanguages?: string[];

   /** Human/natural languages of the content, as ISO 639-1 codes (e.g., "en", "es") */
   textLanguages?: string[];

   /** Frameworks covered */
   frameworks?: string[];

   /** License identifier */
   license?: string;

   /** Author information */
   author?: {
      name: string;
      email?: string;
      url?: string;
   };

   /** Repository URL */
   repository?: string;

   /** Embedding configuration */
   embedding?: {
      model: string;
      dimensions: number;
      quantization?: string;
   };

   /** Chunking configuration */
   chunking?: {
      strategy: string;
      chunkSize: number;
      chunkOverlap: number;
   };
}

/**
 * Options for opening a library.
 */
export interface LibraryOpenOptions {

   /**
    * If true, open the library in read-only mode. Read-only mode will throw
    * MigrationRequiredError if the library needs migration.
    */
   readOnly?: boolean;
}

/**
 * High-level interface for working with .libragen library files.
 */
export class Library {

   private readonly _store: VectorStore;
   private readonly _path: string;
   private _metadata: LibraryMetadata | null = null;

   private constructor(path: string, store: VectorStore) {
      this._path = path;
      this._store = store;
   }

   /**
    * Create a new library file.
    *
    * @param path - Path to the new .libragen file
    * @param options - Library creation options
    */
   public static async create(path: string, options: LibraryCreateOptions): Promise<Library> {
      // Check if file already exists
      try {
         await fs.access(path);
         throw new Error(`Library file already exists: ${path}`);
      } catch(e) {
         if ((e as NodeJS.ErrnoException).code !== 'ENOENT') {
            throw e;
         }
      }

      const store = new VectorStore(path);

      store.initialize();

      // Set schema version
      store.setMeta('schema_version', String(CURRENT_SCHEMA_VERSION));

      const library = new Library(path, store);

      // Initialize metadata with defaults
      const metadata: LibraryMetadata = {
         name: options.name,
         version: options.version ?? '0.1.0',
         schemaVersion: CURRENT_SCHEMA_VERSION,
         contentVersion: options.contentVersion,
         contentVersionType: options.contentVersionType,
         displayName: options.displayName,
         description: options.description,
         agentDescription: options.agentDescription,
         exampleQueries: options.exampleQueries,
         keywords: options.keywords,
         programmingLanguages: options.programmingLanguages,
         textLanguages: options.textLanguages,
         frameworks: options.frameworks,
         license: options.license,
         author: options.author,
         repository: options.repository,
         createdAt: new Date().toISOString(),
         embedding: options.embedding ?? {
            model: 'Xenova/bge-small-en-v1.5',
            dimensions: 384,
         },
         chunking: options.chunking ?? {
            strategy: 'recursive',
            chunkSize: 1000,
            chunkOverlap: 100,
         },
         stats: {
            chunkCount: 0,
            sourceCount: 0,
            fileSize: 0,
         },
         contentHash: '',
      };

      library._metadata = metadata;
      store.setMetadata(metadata);

      return library;
   }

   /**
    * Open an existing library file.
    *
    * @param path - Path to the .libragen file
    * @param options - Open options (e.g., readOnly mode)
    * @throws MigrationRequiredError if readOnly is true and library needs migration
    * @throws SchemaVersionError if library requires a newer libragen version
    */
   public static async open(path: string, options: LibraryOpenOptions = {}): Promise<Library> {
      // Check file exists
      try {
         await fs.access(path);
      } catch(_e) {
         throw new Error(`Library file not found: ${path}`);
      }

      const store = new VectorStore(path);

      store.initialize();

      // Run migrations if needed
      const runner = new MigrationRunner();

      await runner.migrate(path, store.getDatabase(), { readOnly: options.readOnly });

      const library = new Library(path, store);

      // Load metadata
      library._metadata = store.getMetadata<LibraryMetadata>();

      if (!library._metadata) {
         throw new Error('Invalid library file: missing metadata');
      }

      // Ensure schemaVersion is populated in metadata
      const dbSchemaVersion = runner.getCurrentVersion(store.getDatabase());

      if (library._metadata.schemaVersion !== dbSchemaVersion) {
         library._metadata.schemaVersion = dbSchemaVersion;
         store.setMetadata(library._metadata);
      }

      return library;
   }

   /**
    * Validate a library file without fully opening it.
    *
    * @param path - Path to the .libragen file
    */
   public static async validate(path: string): Promise<ValidationResult> {
      const errors: string[] = [],
            warnings: string[] = [];

      // Check file exists
      try {
         await fs.access(path);
      } catch(_e) {
         return {
            valid: false,
            errors: [ `Library file not found: ${path}` ],
            warnings: [],
         };
      }

      let store: VectorStore | null = null;

      try {
         store = new VectorStore(path);
         store.initialize();

         // Check schema version
         const schemaVersionStr = store.getMeta('schema_version'),
               schemaVersion = schemaVersionStr ? parseInt(schemaVersionStr, 10) : 0;

         if (!schemaVersionStr) {
            warnings.push('Missing schema version - may be an older library format');
         } else if (schemaVersion > CURRENT_SCHEMA_VERSION) {
            errors.push(
               `Library requires libragen with schema v${schemaVersion}, but this version ` +
               `only supports up to v${CURRENT_SCHEMA_VERSION}. Please upgrade libragen.`
            );
         } else if (schemaVersion < CURRENT_SCHEMA_VERSION) {
            warnings.push(
               `Library has schema v${schemaVersion}, current is v${CURRENT_SCHEMA_VERSION}. Migration will be applied on open.`
            );
         }

         // Check metadata
         const metadata = store.getMetadata<LibraryMetadata>();

         if (metadata) {
            // Validate required fields
            if (!metadata.name) {
               errors.push('Missing required field: name');
            }
            if (!metadata.version) {
               errors.push('Missing required field: version');
            }
            if (!metadata.createdAt) {
               errors.push('Missing required field: createdAt');
            }
            if (!metadata.embedding) {
               errors.push('Missing required field: embedding');
            }
            if (!metadata.chunking) {
               errors.push('Missing required field: chunking');
            }

            // Check chunk count matches
            const actualChunkCount = store.getChunkCount();

            if (metadata.stats?.chunkCount !== actualChunkCount) {
               warnings.push(
                  `Chunk count mismatch: metadata says ${metadata.stats?.chunkCount}, actual is ${actualChunkCount}`
               );
            }
         } else {
            errors.push('Missing library metadata');
         }
      } catch(e) {
         errors.push(`Failed to open library: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
         store?.close();
      }

      return {
         valid: errors.length === 0,
         errors,
         warnings,
      };
   }

   /**
    * Get the library metadata.
    */
   public getMetadata(): LibraryMetadata {
      if (!this._metadata) {
         throw new Error('Library metadata not loaded');
      }

      return this._metadata;
   }

   /**
    * Update library metadata.
    */
   public setMetadata(metadata: Partial<LibraryMetadata>): void {
      if (!this._metadata) {
         throw new Error('Library metadata not loaded');
      }

      this._metadata = { ...this._metadata, ...metadata };
      this._store.setMetadata(this._metadata);
   }

   /**
    * Get the underlying VectorStore.
    */
   public getStore(): VectorStore {
      return this._store;
   }

   /**
    * Get the library file path.
    */
   public getPath(): string {
      return this._path;
   }

   /**
    * Add chunks with embeddings to the library.
    */
   public addChunks(
      chunks: Chunk[],
      embeddings: Float32Array[],
      options: {
         sourceType?: string;
         sourceRef?: string;
         contentVersion?: string;
      } = {}
   ): number[] {
      const ids = this._store.addChunks(chunks, embeddings, options);

      // Update stats
      if (this._metadata) {
         this._metadata.stats.chunkCount = this._store.getChunkCount();
         const sourceFiles = new Set<string>();

         // Note: This is a simplified count - in a full implementation, we'd track source
         // files more accurately
         for (const chunk of chunks) {
            sourceFiles.add(chunk.metadata.sourceFile);
         }
         this._metadata.stats.sourceCount += sourceFiles.size;
      }

      return ids;
   }

   /**
    * Compute the content hash of all chunks. This can be used to verify library
    * integrity.
    */
   public async computeContentHash(): Promise<string> {
      const hash = createHash('sha256');

      // Get all chunks and hash their content Note: For large libraries, this should be
      // done in batches
      const chunkCount = this._store.getChunkCount();

      for (let id = 1; id <= chunkCount; id++) {
         const chunk = this._store.getChunk(id);

         if (chunk) {
            hash.update(chunk.content);
         }
      }

      return `sha256:${hash.digest('hex')}`;
   }

   /**
    * Verify the library's content hash matches the stored hash.
    */
   public async verifyIntegrity(): Promise<boolean> {
      if (!this._metadata?.contentHash) {
         return false;
      }

      const computedHash = await this.computeContentHash();

      return computedHash === this._metadata.contentHash;
   }

   /**
    * Finalize the library after adding all content. Updates stats and computes content
    * hash.
    */
   public async finalize(): Promise<void> {
      if (!this._metadata) {
         throw new Error('Library metadata not loaded');
      }

      // Update chunk count
      this._metadata.stats.chunkCount = this._store.getChunkCount();

      // Compute content hash
      this._metadata.contentHash = await this.computeContentHash();

      // Get file size
      const stats = await fs.stat(this._path);

      this._metadata.stats.fileSize = stats.size;

      // Save metadata
      this._store.setMetadata(this._metadata);
   }

   /**
    * Close the library and release resources.
    */
   public close(): void {
      this._store.close();
   }

}

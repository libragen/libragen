/**
 * Core type definitions for @libragen/core
 */

/**
 * Information about the source of a library's content.
 * Tracks where the content came from for provenance and reproducibility.
 */
export interface SourceProvenance {

   /** Source type: 'local' for filesystem, 'git' for git repositories */
   type: 'local' | 'git';

   /** For local sources: the absolute path to the source directory or file */
   path?: string;

   /** For git sources: the repository URL (e.g., "https://github.com/owner/repo") */
   url?: string;

   /** For git sources: the branch, tag, or ref that was checked out */
   ref?: string;

   /** For git sources: the full commit SHA */
   commitHash?: string;

   /** SPDX license identifiers or custom license strings for the source content */
   licenses?: string[];
}

/**
 * Metadata stored in a .libragen library file.
 * Contains all information about the library including its content, configuration,
 * and provenance.
 */
export interface LibraryMetadata {

   /** Unique name for the library (e.g., "react-docs", "rust-std") */
   name: string;

   /** Library version in semver format (e.g., "1.0.0") */
   version: string;

   /** Schema version for database compatibility */
   schemaVersion: number;

   /** Version of the source content (e.g., "1.74.0" for Rust docs) */
   contentVersion?: string;

   /** Type of content versioning used */
   contentVersionType?: 'semver' | 'commit' | 'date' | 'revision' | 'custom';

   /** Human-readable display name */
   displayName?: string;

   /** Short description of what this library contains */
   description?: string;

   /**
    * Detailed guidance for AI agents on when to use this library. Should describe the
    * types of questions/tasks this library can help with. Example: "Use this library when
    * the user asks about React hooks, component lifecycle, or JSX syntax. Contains
    * official React documentation and examples."
    */
   agentDescription?: string;

   /**
    * Example queries that this library is good at answering. Helps agents understand the
    * library's scope through concrete examples.
    */
   exampleQueries?: string[];

   /** Searchable keywords/tags */
   keywords?: string[];

   /** Primary programming language(s) covered (e.g., "typescript", "python") */
   programmingLanguages?: string[];

   /** Human/natural language(s) of the content, as ISO 639-1 codes (e.g., "en", "es",
    * "zh") */
   textLanguages?: string[];

   /** Frameworks or tools covered (e.g., "react", "express", "pytest") */
   frameworks?: string[];

   license?: string;
   author?: {
      name: string;
      email?: string;
      url?: string;
   };
   repository?: string;
   createdAt: string;
   embedding: {
      model: string;
      dimensions: number;
      quantization?: string;
   };
   chunking: {
      strategy: string;
      chunkSize: number;
      chunkOverlap: number;
   };
   stats: {
      chunkCount: number;
      sourceCount: number;
      fileSize: number;
   };
   contentHash: string;

   /** Source provenance information */
   source?: SourceProvenance;
}

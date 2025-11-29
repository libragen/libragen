/**
 * Core type definitions for @libragen/core
 */

export interface SourceProvenance {
   type: 'local' | 'git';

   /** For local sources: the absolute path */
   path?: string;

   /** For git sources: the repository URL */
   url?: string;

   /** Branch/tag name */
   ref?: string;

   /** Full commit SHA */
   commitHash?: string;

   /** SPDX license identifiers or custom license strings */
   licenses?: string[];
}

export interface LibraryMetadata {
   name: string;
   version: string;
   schemaVersion: number;
   contentVersion?: string;
   contentVersionType?: 'semver' | 'commit' | 'date' | 'revision' | 'custom';
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

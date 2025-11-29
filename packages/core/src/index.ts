/**
 * @libragen/core - Core library for RAG operations
 *
 * This package provides embedding, chunking, vector storage, and hybrid search
 * capabilities for building RAG-ready libraries.
 */

export const VERSION = '0.1.0';

// Embedder
export { Embedder } from './embedder.ts';
export type { EmbedderConfig, EmbedProgress, ProgressCallback, ModelLoadCallback } from './embedder.ts';

// Chunker
export { Chunker } from './chunker.ts';
export type { Chunk, ChunkMetadata, ChunkerConfig } from './chunker.ts';

// Vector Store
export { VectorStore } from './store.ts';
export type { StoredChunk, SearchResult, VectorStoreConfig } from './store.ts';

// Searcher
export { Searcher } from './searcher.ts';
export type { SearchOptions, SearcherConfig, SearchResultWithContext } from './searcher.ts';

// Reranker
export { Reranker } from './reranker.ts';
export type { RerankerConfig, RerankResult, RerankProgress, RerankProgressCallback } from './reranker.ts';

// Library
export { Library } from './library.ts';
export type { ValidationResult, LibraryCreateOptions, LibraryOpenOptions } from './library.ts';

// Configuration
export {
   getLibragenHome,
   getDefaultLibraryDir,
   getDefaultManifestDir,
   getDefaultCollectionConfigDir,
   getModelCacheDir,
   detectProjectLibraryDir,
   hasProjectLibraryDir,
} from './config.ts';

// Library Manager
export { LibraryManager } from './manager.ts';
export type {
   LibraryLocation,
   LibraryManagerOptions,
   InstalledLibrary,
   InstallOptions,
   CollectionInstallOptions,
   CollectionInstallProgress,
   CollectionInstallResult,
} from './manager.ts';

// Collection (legacy - for fetching from remote indexes)
export { CollectionClient } from './collection.ts';
export type {
   Collection,
   CollectionIndex,
   CollectionLibrary,
   CollectionLibraryVersion,
   CollectionEntry,
   CollectionClientConfig,
   DownloadProgress,
} from './collection.ts';

// Manifest (tracks installed libraries and collections with reference counting)
export { Manifest } from './manifest.ts';
export type {
   CollectionDefinition,
   CollectionItem,
   ResolvedLibrary,
   InstalledCollection,
   InstalledLibraryRecord,
   ManifestData,
} from './manifest.ts';

// Collection Resolver (resolves nested collections and deduplicates libraries)
export {
   resolveCollection,
   fetchCollectionDefinition,
   isCollectionSource,
   isLibrarySource,
   getLibraryNameFromSource,
} from './collection-resolver.ts';
export type { ResolveOptions, ResolveResult } from './collection-resolver.ts';

// Sources
export { FileSource, GitSource, LicenseDetector, detectGitProvider, getAuthToken, isGitUrl, parseGitUrl } from './sources/index.ts';
export type {
   SourceFile,
   FileSourceOptions,
   GitSourceOptions,
   GitSourceResult,
   GitProgress,
   GitProvider,
   ParsedGitUrl,
   DetectedLicense,
} from './sources/index.ts';

// Migrations
export {
   MigrationRunner,
   MigrationRequiredError,
   SchemaVersionError,
   CURRENT_SCHEMA_VERSION,
   migrations,
} from './migrations/index.ts';
export type { Migration, MigrationResult, MigrateOptions } from './migrations/index.ts';

// Types
export type { LibraryMetadata, SourceProvenance } from './types.ts';

// Utils
export { formatBytes, deriveGitLibraryName } from './utils.ts';

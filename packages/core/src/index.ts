/**
 * @libragen/core - Core library for RAG operations
 *
 * This package provides embedding, chunking, vector storage, and hybrid search
 * capabilities for building RAG-ready libraries.
 */

export const VERSION = '0.1.0';

// ============================================================================
// Building
// ============================================================================

export { Builder } from './builder.ts';
export type {
   BuildOptions,
   BuildResult,
   BuildPhase,
   BuildProgress,
   BuildProgressCallback,
   BuilderConfig,
} from './builder.ts';

// ============================================================================
// Embedding & Chunking
// ============================================================================

export { Embedder } from './embedder.ts';
export type { EmbedderConfig, EmbedProgress, ProgressCallback, ModelLoadCallback } from './embedder.ts';

export { Chunker } from './chunker.ts';
export type { Chunk, ChunkMetadata, ChunkerConfig } from './chunker.ts';

// ============================================================================
// Vector Store & Search
// ============================================================================

export { VectorStore } from './store.ts';
export type { StoredChunk, SearchResult, VectorStoreConfig } from './store.ts';

export { Searcher } from './searcher.ts';
export type { SearchOptions, SearcherConfig, SearchResultWithContext } from './searcher.ts';

export { Reranker } from './reranker.ts';
export type { RerankerConfig, RerankResult, RerankProgress, RerankProgressCallback } from './reranker.ts';

// ============================================================================
// Library
// ============================================================================

export { Library } from './library.ts';
export type { ValidationResult, LibraryCreateOptions, LibraryOpenOptions } from './library.ts';

// ============================================================================
// Library Management
// ============================================================================

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

// ============================================================================
// Update Checking
// ============================================================================

export { checkForUpdate, findUpdates, performUpdate } from './update-checker.ts';
export type { UpdateCandidate, CheckUpdateOptions } from './update-checker.ts';

// ============================================================================
// Configuration
// ============================================================================

export {
   getLibragenHome,
   getDefaultLibraryDir,
   getDefaultManifestDir,
   getDefaultCollectionConfigDir,
   getModelCacheDir,
   detectProjectLibraryDir,
   hasProjectLibraryDir,
} from './config.ts';

// ============================================================================
// Collections
// ============================================================================

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

export { Manifest } from './manifest.ts';
export type {
   CollectionDefinition,
   CollectionItem,
   ResolvedLibrary,
   InstalledCollection,
   InstalledLibraryRecord,
   ManifestData,
} from './manifest.ts';

export {
   resolveCollection,
   fetchCollectionDefinition,
   isCollectionSource,
   isLibrarySource,
   getLibraryNameFromSource,
} from './collection-resolver.ts';
export type { ResolveOptions, ResolveResult } from './collection-resolver.ts';

// ============================================================================
// Sources
// ============================================================================

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

// ============================================================================
// Migrations
// ============================================================================

export {
   MigrationRunner,
   MigrationRequiredError,
   SchemaVersionError,
   CURRENT_SCHEMA_VERSION,
   migrations,
} from './migrations/index.ts';
export type { Migration, MigrationResult, MigrateOptions } from './migrations/index.ts';

// ============================================================================
// Types
// ============================================================================

export type { LibraryMetadata, SourceProvenance } from './types.ts';

// ============================================================================
// Utilities
// ============================================================================

export { formatBytes, deriveGitLibraryName, formatDuration } from './utils.ts';

export { getSystemInfo, estimateEmbeddingTime, formatSystemInfo } from './time-estimate.ts';
export type { SystemInfo, TimeEstimate } from './time-estimate.ts';

/**
 * Source handlers for @libragen/core
 *
 * Provides unified interfaces for reading content from various sources:
 * - Local files
 * - Git repositories (local and remote)
 */

export { FileSource } from './files.ts';
export type { SourceFile, FileSourceOptions } from './files.ts';

export { GitSource, detectGitProvider, getAuthToken, isGitUrl, parseGitUrl } from './git.ts';
export type { GitSourceOptions, GitSourceResult, GitProgress, GitProvider, ParsedGitUrl } from './git.ts';

export { LicenseDetector } from './license-detector.ts';
export type { DetectedLicense } from './license-detector.ts';

/**
 * Git source handler - Clone and read from git repositories
 *
 * Provides a unified interface for reading files from git repositories, supporting both
 * local and remote repos using isomorphic-git.
 */

import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import git from 'isomorphic-git';
import http from 'isomorphic-git/http/node';
import { FileSource } from './files.ts';
import type { SourceFile } from './files.ts';
import { LicenseDetector } from './license-detector.ts';
import type { DetectedLicense } from './license-detector.ts';

/** Git provider type */
export type GitProvider = 'github' | 'gitlab' | 'bitbucket' | 'unknown';

/** Parsed git URL components */
export interface ParsedGitUrl {

   /** Normalized clone URL (with .git suffix) */
   repoUrl: string;

   /** Branch, tag, or commit extracted from URL */
   ref?: string;

   /** File or directory path extracted from URL */
   path?: string;
}

export interface GitSourceOptions {

   /** Git repository URL (remote) or path (local) */
   url: string;

   /** Authentication token for private repositories */
   token?: string;

   /** Branch, tag, or commit to checkout (default: default branch) */
   ref?: string;

   /** Shallow clone depth (default: 1 for remote, full for local) */
   depth?: number;

   /** Glob patterns to include files */
   patterns?: string[];

   /** Glob patterns to ignore files */
   ignore?: string[];

   /** Whether to use default ignore patterns (default: true) */
   useDefaultIgnore?: boolean;

   /** Maximum file size in bytes to include (default: 1MB) */
   maxFileSize?: number;

   /** Progress callback for clone operations */
   onProgress?: (progress: GitProgress) => void;

   /** Skip automatic license detection (default: false) */
   skipLicenseDetection?: boolean;
}

export interface GitProgress {
   phase: 'counting' | 'compressing' | 'receiving' | 'resolving' | 'done';
   loaded?: number;
   total?: number;
}

export interface GitSourceResult {

   /** Files from the repository */
   files: SourceFile[];

   /** Resolved commit hash */
   commitHash: string;

   /** Repository URL or path */
   url: string;

   /** Resolved ref (branch/tag name) */
   ref: string;

   /** Temporary directory path (for remote repos, caller should clean up) */
   tempDir?: string;

   /** Detected license from the repository */
   detectedLicense?: DetectedLicense;
}

/**
 * Detect the git provider from a URL.
 *
 * @param url - Git repository URL
 * @returns The detected provider
 */
export function detectGitProvider(url: string): GitProvider {
   const lowerUrl = url.toLowerCase();

   if (lowerUrl.includes('github.com')) {
      return 'github';
   }

   if (lowerUrl.includes('gitlab.com') || lowerUrl.includes('gitlab')) {
      return 'gitlab';
   }

   // Check for custom GitLab instance via env var eslint-disable-next-line no-process-env
   const gitlabHost = process.env.GITLAB_HOST;

   if (gitlabHost && lowerUrl.includes(gitlabHost.toLowerCase())) {
      return 'gitlab';
   }

   if (lowerUrl.includes('bitbucket.org') || lowerUrl.includes('bitbucket')) {
      return 'bitbucket';
   }

   return 'unknown';
}

/**
 * Get authentication token for a git URL.
 *
 * Checks environment variables based on the detected provider:
 * - GitHub: GITHUB_TOKEN
 * - GitLab: GITLAB_TOKEN or GL_TOKEN
 * - Bitbucket: BITBUCKET_TOKEN
 *
 * @param url - Git repository URL
 * @param explicitToken - Explicit token (takes precedence)
 * @returns The authentication token or undefined
 */
export function getAuthToken(url: string, explicitToken?: string): string | undefined {
   if (explicitToken) {
      return explicitToken;
   }

   const provider = detectGitProvider(url);

   /* eslint-disable no-process-env */
   switch (provider) {
      case 'github': {
         return process.env.GITHUB_TOKEN;
      }
      case 'gitlab': {
         return process.env.GITLAB_TOKEN || process.env.GL_TOKEN;
      }
      case 'bitbucket': {
         return process.env.BITBUCKET_TOKEN;
      }
      default: {
         // For unknown providers, try common token env vars
         return process.env.GIT_TOKEN;
      }
   }
   /* eslint-enable no-process-env */
}

/**
 * Check if a string is a git URL (remote repository).
 *
 * Detects URLs for GitHub, GitLab, Bitbucket, and generic git URLs.
 *
 * @param source - Source string to check
 * @returns True if the source is a git URL
 */
export function isGitUrl(source: string): boolean {
   if (!source.startsWith('https://') && !source.startsWith('http://')) {
      return false;
   }

   // Known providers
   const isKnownProvider = source.includes('github.com') ||
      source.includes('gitlab.com') ||
      source.includes('bitbucket.org');

   if (isKnownProvider) {
      return true;
   }

   // Generic git URL (ends with .git)
   if (source.endsWith('.git')) {
      return true;
   }

   // Check for custom GitLab instance eslint-disable-next-line no-process-env
   const gitlabHost = process.env.GITLAB_HOST;

   if (gitlabHost && source.includes(gitlabHost)) {
      return true;
   }

   // URLs with /tree/ or /blob/ patterns (GitHub/GitLab web URLs)
   if (source.includes('/tree/') || source.includes('/blob/') || source.includes('/-/tree/') || source.includes('/-/blob/')) {
      return true;
   }

   return false;
}

/**
 * Parse a git URL to extract repository URL, ref, and path.
 *
 * Supports GitHub, GitLab, and Bitbucket URL formats:
 * - https://github.com/org/repo
 * - https://github.com/org/repo/tree/main
 * - https://github.com/org/repo/blob/v1.0.0/README.md
 * - https://gitlab.com/org/repo/-/tree/main/docs
 *
 * @param source - Git URL to parse
 * @returns Parsed URL components
 */
export function parseGitUrl(source: string): ParsedGitUrl {
   let url = source;

   // Remove trailing slash
   url = url.replace(/\/$/, '');

   // GitHub/Bitbucket: /tree/<ref>[/<path>] or /blob/<ref>/<path>
   const githubTreeMatch = url.match(/^(https?:\/\/[^/]+\/[^/]+\/[^/]+)\/tree\/([^/]+)(?:\/(.+))?$/);

   if (githubTreeMatch) {
      const [ , repoBase, ref, pathPart ] = githubTreeMatch;

      return {
         repoUrl: `${repoBase}.git`,
         ref,
         path: pathPart,
      };
   }

   const githubBlobMatch = url.match(/^(https?:\/\/[^/]+\/[^/]+\/[^/]+)\/blob\/([^/]+)\/(.+)$/);

   if (githubBlobMatch) {
      const [ , repoBase, ref, filePath ] = githubBlobMatch;

      return {
         repoUrl: `${repoBase}.git`,
         ref,
         path: filePath,
      };
   }

   // GitLab: /-/tree/<ref>[/<path>] or /-/blob/<ref>/<path>
   const gitlabTreeMatch = url.match(/^(https?:\/\/[^/]+\/[^/]+\/[^/]+)\/-\/tree\/([^/]+)(?:\/(.+))?$/);

   if (gitlabTreeMatch) {
      const [ , repoBase, ref, pathPart ] = gitlabTreeMatch;

      return {
         repoUrl: `${repoBase}.git`,
         ref,
         path: pathPart,
      };
   }

   const gitlabBlobMatch = url.match(/^(https?:\/\/[^/]+\/[^/]+\/[^/]+)\/-\/blob\/([^/]+)\/(.+)$/);

   if (gitlabBlobMatch) {
      const [ , repoBase, ref, filePath ] = gitlabBlobMatch;

      return {
         repoUrl: `${repoBase}.git`,
         ref,
         path: filePath,
      };
   }

   // Basic repo URL (no tree/blob) Remove .git suffix if present, then add it back for
   // consistency
   const baseUrl = url.replace(/\.git$/, '');

   return {
      repoUrl: `${baseUrl}.git`,
   };
}

/**
 * Git source handler for reading files from git repositories.
 */
export class GitSource {

   private readonly _fileSource: FileSource;
   private readonly _licenseDetector: LicenseDetector;

   public constructor() {
      this._fileSource = new FileSource();
      this._licenseDetector = new LicenseDetector();
   }

   /**
    * Get files from a git repository.
    *
    * For remote repositories, this clones to a temp directory. The caller is responsible
    * for cleaning up the temp directory by calling `cleanup()` on the result or manually
    * removing `tempDir`.
    *
    * @param options - Git source options
    * @returns Files and metadata from the repository
    */
   public async getFiles(options: GitSourceOptions): Promise<GitSourceResult> {
      const isRemote = this._isRemoteURL(options.url);

      if (isRemote) {
         return this._getRemoteFiles(options);
      }

      return this._getLocalFiles(options);
   }

   /**
    * Get the current commit hash for a repository.
    *
    * @param repoPath - Path to the git repository
    * @param ref - Optional ref (branch/tag/commit) to resolve
    */
   public async getCommitHash(repoPath: string, ref?: string): Promise<string> {
      const resolvedRef = ref ?? 'HEAD';

      try {
         const oid = await git.resolveRef({
            fs,
            dir: repoPath,
            ref: resolvedRef,
         });

         return oid;
      } catch(_e) {
         // Try as a commit hash directly
         if (ref && /^[a-f0-9]{40}$/i.test(ref)) {
            return ref;
         }
         throw new Error(`Could not resolve ref: ${resolvedRef}`);
      }
   }

   /**
    * Get the default branch name for a repository.
    */
   public async getDefaultBranch(repoPath: string): Promise<string> {
      try {
         const head = await git.currentBranch({
            fs,
            dir: repoPath,
            fullname: false,
         });

         return head ?? 'main';
      } catch(_e) {
         return 'main';
      }
   }

   /**
    * Check if a path is a git repository.
    */
   public async isGitRepo(repoPath: string): Promise<boolean> {
      try {
         const gitDir = path.join(repoPath, '.git');

         const stats = await fsPromises.stat(gitDir);

         return stats.isDirectory();
      } catch(_e) {
         return false;
      }
   }

   /**
    * Clean up a temporary directory created during clone.
    */
   public async cleanup(tempDir: string): Promise<void> {
      await fsPromises.rm(tempDir, { recursive: true, force: true });
   }

   private _isRemoteURL(url: string): boolean {
      return (
         url.startsWith('http://') ||
         url.startsWith('https://') ||
         url.startsWith('git://') ||
         url.startsWith('git@') ||
         url.includes('github.com') ||
         url.includes('gitlab.com') ||
         url.includes('bitbucket.org')
      );
   }

   private async _getRemoteFiles(options: GitSourceOptions): Promise<GitSourceResult> {
      // Create temp directory for clone
      const tempDir = await fsPromises.mkdtemp(
         path.join(os.tmpdir(), 'libragen-git-')
      );

      try {
         await git.clone({
            fs,
            http,
            dir: tempDir,
            url: options.url,
            ref: options.ref,
            singleBranch: true,
            depth: options.depth ?? 1,
            onProgress: options.onProgress ? (progress) => {
               // onProgress is checked above, so it's safe to call
               (options.onProgress as NonNullable<typeof options.onProgress>)({
                  phase: progress.phase as GitProgress['phase'],
                  loaded: progress.loaded,
                  total: progress.total,
               });
            } : undefined,
         });

         // Get commit hash
         const commitHash = await this.getCommitHash(tempDir, options.ref);

         // Get resolved ref name
         const ref = options.ref ?? await this.getDefaultBranch(tempDir);

         // Get files using FileSource
         const files = await this._fileSource.getFiles({
            paths: [ tempDir ],
            patterns: options.patterns,
            ignore: options.ignore,
            useDefaultIgnore: options.useDefaultIgnore,
            maxFileSize: options.maxFileSize,
         });

         // Update file paths to be relative to repo root
         const normalizedFiles = files.map((file) => {
            return {
               ...file,
               relativePath: path.relative(tempDir, file.path),
            };
         });

         // Detect license if not skipped
         let detectedLicense: DetectedLicense | undefined;

         if (!options.skipLicenseDetection) {
            detectedLicense = await this._licenseDetector.detectFromDirectory(tempDir) ?? undefined;
         }

         return {
            files: normalizedFiles,
            commitHash,
            url: options.url,
            ref,
            tempDir,
            detectedLicense,
         };
      } catch(error) {
         // Clean up on error
         await this.cleanup(tempDir);
         throw error;
      }
   }

   private async _getLocalFiles(options: GitSourceOptions): Promise<GitSourceResult> {
      const repoPath = path.resolve(options.url);

      // Verify it's a git repo
      if (!await this.isGitRepo(repoPath)) {
         throw new Error(`Not a git repository: ${repoPath}`);
      }

      // If a specific ref is requested, we need to checkout For now, we just read from
      // the working directory TODO: Support reading from specific commits without
      // checkout

      // Get commit hash
      const commitHash = await this.getCommitHash(repoPath, options.ref);

      // Get resolved ref name
      const ref = options.ref ?? await this.getDefaultBranch(repoPath);

      // Get files using FileSource
      const files = await this._fileSource.getFiles({
         paths: [ repoPath ],
         patterns: options.patterns,
         ignore: options.ignore,
         useDefaultIgnore: options.useDefaultIgnore,
         maxFileSize: options.maxFileSize,
      });

      // Update file paths to be relative to repo root
      const normalizedFiles = files.map((file) => {
         return {
            ...file,
            relativePath: path.relative(repoPath, file.path),
         };
      });

      // Detect license if not skipped
      let detectedLicense: DetectedLicense | undefined;

      if (!options.skipLicenseDetection) {
         detectedLicense = await this._licenseDetector.detectFromDirectory(repoPath) ?? undefined;
      }

      return {
         files: normalizedFiles,
         commitHash,
         url: options.url,
         ref,
         detectedLicense,
      };
   }

}

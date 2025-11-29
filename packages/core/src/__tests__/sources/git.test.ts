/**
 * Tests for the GitSource class
 */

/* eslint-disable @silvermine/silvermine/fluent-chaining */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import git from 'isomorphic-git';
import {
   GitSource,
   isGitUrl,
   parseGitUrl,
   detectGitProvider,
   getAuthToken,
} from '../../sources/git.js';

describe('GitSource', () => {
   let tempDir: string,
       gitSource: GitSource;

   beforeEach(async () => {
      tempDir = await fsPromises.mkdtemp(path.join(os.tmpdir(), 'libragen-gitsource-test-'));
      gitSource = new GitSource();
   });

   afterEach(async () => {
      await fsPromises.rm(tempDir, { recursive: true, force: true });
   });

   /**
    * Helper to create a test git repository
    */
   async function createTestRepo(repoPath: string): Promise<string> {
      await fsPromises.mkdir(repoPath, { recursive: true });

      // Initialize git repo
      await git.init({ fs, dir: repoPath, defaultBranch: 'main' });

      // Create some files
      await fsPromises.writeFile(path.join(repoPath, 'index.ts'), 'export const x = 1;');
      await fsPromises.writeFile(path.join(repoPath, 'README.md'), '# Test Repo');
      await fsPromises.mkdir(path.join(repoPath, 'src'));
      await fsPromises.writeFile(path.join(repoPath, 'src', 'utils.ts'), 'export function helper() {}');

      // Add and commit
      await git.add({ fs, dir: repoPath, filepath: 'index.ts' });
      await git.add({ fs, dir: repoPath, filepath: 'README.md' });
      await git.add({ fs, dir: repoPath, filepath: 'src/utils.ts' });

      const commitHash = await git.commit({
         fs,
         dir: repoPath,
         message: 'Initial commit',
         author: { name: 'Test', email: 'test@example.com' },
      });

      return commitHash;
   }

   describe('getFiles (local repo)', () => {
      it('reads files from a local git repository', async () => {
         const repoPath = path.join(tempDir, 'repo');

         await createTestRepo(repoPath);

         const result = await gitSource.getFiles({ url: repoPath });

         expect(result.files.length).toBeGreaterThan(0);
         expect(result.commitHash).toMatch(/^[a-f0-9]{40}$/);
         expect(result.url).toBe(repoPath);
         expect(result.ref).toBe('main');
         expect(result.tempDir).toBeUndefined(); // Local repos don't create temp dirs
      });

      it('returns correct file content', async () => {
         const repoPath = path.join(tempDir, 'repo');

         await createTestRepo(repoPath);

         const result = await gitSource.getFiles({ url: repoPath });

         const indexFile = result.files.find((f) => {
            return f.relativePath === 'index.ts';
         });

         expect(indexFile).toBeDefined();
         expect(indexFile?.content).toBe('export const x = 1;');
      });

      it('applies file patterns', async () => {
         const repoPath = path.join(tempDir, 'repo');

         await createTestRepo(repoPath);

         const result = await gitSource.getFiles({
            url: repoPath,
            patterns: [ '**/*.ts' ],
         });

         expect(result.files.every((f) => {
            return f.path.endsWith('.ts');
         }))
            .toBe(true);
         expect(result.files.length).toBe(2); // index.ts and src/utils.ts
      });

      it('applies ignore patterns', async () => {
         const repoPath = path.join(tempDir, 'repo');

         await createTestRepo(repoPath);

         const result = await gitSource.getFiles({
            url: repoPath,
            patterns: [ '**/*.ts' ],
            ignore: [ '**/src/**' ],
         });

         expect(result.files.length).toBe(1);
         expect(result.files[0].relativePath).toBe('index.ts');
      });

      it('throws for non-git directory', async () => {
         const nonGitDir = path.join(tempDir, 'not-a-repo');

         await fsPromises.mkdir(nonGitDir);

         await expect(
            gitSource.getFiles({ url: nonGitDir })
         )
            .rejects
            .toThrow('Not a git repository');
      });
   });

   describe('getCommitHash', () => {
      it('returns the current commit hash', async () => {
         const repoPath = path.join(tempDir, 'repo');

         const expectedHash = await createTestRepo(repoPath);

         const hash = await gitSource.getCommitHash(repoPath);

         expect(hash).toBe(expectedHash);
      });

      it('resolves HEAD ref', async () => {
         const repoPath = path.join(tempDir, 'repo');

         const expectedHash = await createTestRepo(repoPath);

         const hash = await gitSource.getCommitHash(repoPath, 'HEAD');

         expect(hash).toBe(expectedHash);
      });

      it('resolves branch name', async () => {
         const repoPath = path.join(tempDir, 'repo');

         const expectedHash = await createTestRepo(repoPath);

         const hash = await gitSource.getCommitHash(repoPath, 'main');

         expect(hash).toBe(expectedHash);
      });

      it('accepts full commit hash as ref', async () => {
         const repoPath = path.join(tempDir, 'repo');

         const commitHash = await createTestRepo(repoPath);

         const hash = await gitSource.getCommitHash(repoPath, commitHash);

         expect(hash).toBe(commitHash);
      });
   });

   describe('getDefaultBranch', () => {
      it('returns the default branch name', async () => {
         const repoPath = path.join(tempDir, 'repo');

         await createTestRepo(repoPath);

         const branch = await gitSource.getDefaultBranch(repoPath);

         expect(branch).toBe('main');
      });
   });

   describe('isGitRepo', () => {
      it('returns true for git repository', async () => {
         const repoPath = path.join(tempDir, 'repo');

         await createTestRepo(repoPath);

         expect(await gitSource.isGitRepo(repoPath)).toBe(true);
      });

      it('returns false for non-git directory', async () => {
         const nonGitDir = path.join(tempDir, 'not-a-repo');

         await fsPromises.mkdir(nonGitDir);

         expect(await gitSource.isGitRepo(nonGitDir)).toBe(false);
      });

      it('returns false for nonexistent path', async () => {
         expect(await gitSource.isGitRepo('/nonexistent/path')).toBe(false);
      });
   });

   describe('cleanup', () => {
      it('removes a temporary directory', async () => {
         const tempPath = path.join(tempDir, 'to-cleanup');

         await fsPromises.mkdir(tempPath);
         await fsPromises.writeFile(path.join(tempPath, 'file.txt'), 'content');

         await gitSource.cleanup(tempPath);

         await expect(fsPromises.access(tempPath)).rejects.toThrow();
      });
   });

   describe('remote URL detection', () => {
      it('identifies HTTPS URLs as remote', async () => {
         // We can't easily test the actual clone without network,
         // but we can verify the URL detection by checking that
         // a non-existent HTTPS URL throws an appropriate error
         await expect(
            gitSource.getFiles({ url: 'https://github.com/nonexistent/repo.git' })
         )
            .rejects
            .toThrow();
      });
   });
});

describe('isGitUrl', () => {
   it('detects GitHub URLs', () => {
      expect(isGitUrl('https://github.com/org/repo')).toBe(true);
      expect(isGitUrl('https://github.com/org/repo.git')).toBe(true);
      expect(isGitUrl('https://github.com/org/repo/tree/main')).toBe(true);
      expect(isGitUrl('https://github.com/org/repo/blob/main/README.md')).toBe(true);
   });

   it('detects GitLab URLs', () => {
      expect(isGitUrl('https://gitlab.com/org/repo')).toBe(true);
      expect(isGitUrl('https://gitlab.com/org/repo.git')).toBe(true);
      expect(isGitUrl('https://gitlab.com/org/repo/-/tree/main')).toBe(true);
      expect(isGitUrl('https://gitlab.com/org/repo/-/blob/main/README.md')).toBe(true);
   });

   it('detects Bitbucket URLs', () => {
      expect(isGitUrl('https://bitbucket.org/org/repo')).toBe(true);
      expect(isGitUrl('https://bitbucket.org/org/repo.git')).toBe(true);
   });

   it('detects generic .git URLs', () => {
      expect(isGitUrl('https://example.com/org/repo.git')).toBe(true);
   });

   it('rejects non-git URLs', () => {
      expect(isGitUrl('/local/path')).toBe(false);
      expect(isGitUrl('./relative/path')).toBe(false);
      expect(isGitUrl('https://example.com/page')).toBe(false);
   });

   it('detects custom GitLab instances via GITLAB_HOST', () => {
      const originalEnv = process.env.GITLAB_HOST;

      process.env.GITLAB_HOST = 'gitlab.example.com';
      expect(isGitUrl('https://gitlab.example.com/org/repo')).toBe(true);
      process.env.GITLAB_HOST = originalEnv;
   });
});

describe('parseGitUrl', () => {
   it('parses basic GitHub URL', () => {
      const result = parseGitUrl('https://github.com/org/repo');

      expect(result.repoUrl).toBe('https://github.com/org/repo.git');
      expect(result.ref).toBeUndefined();
      expect(result.path).toBeUndefined();
   });

   it('parses GitHub URL with .git suffix', () => {
      const result = parseGitUrl('https://github.com/org/repo.git');

      expect(result.repoUrl).toBe('https://github.com/org/repo.git');
   });

   it('parses GitHub tree URL with ref', () => {
      const result = parseGitUrl('https://github.com/org/repo/tree/v1.0.0');

      expect(result.repoUrl).toBe('https://github.com/org/repo.git');
      expect(result.ref).toBe('v1.0.0');
      expect(result.path).toBeUndefined();
   });

   it('parses GitHub tree URL with ref and path', () => {
      const result = parseGitUrl('https://github.com/org/repo/tree/main/docs');

      expect(result.repoUrl).toBe('https://github.com/org/repo.git');
      expect(result.ref).toBe('main');
      expect(result.path).toBe('docs');
   });

   it('parses GitHub blob URL with ref and file path', () => {
      const result = parseGitUrl('https://github.com/org/repo/blob/main/README.md');

      expect(result.repoUrl).toBe('https://github.com/org/repo.git');
      expect(result.ref).toBe('main');
      expect(result.path).toBe('README.md');
   });

   it('parses GitLab tree URL', () => {
      const result = parseGitUrl('https://gitlab.com/org/repo/-/tree/main');

      expect(result.repoUrl).toBe('https://gitlab.com/org/repo.git');
      expect(result.ref).toBe('main');
   });

   it('parses GitLab tree URL with path', () => {
      const result = parseGitUrl('https://gitlab.com/org/repo/-/tree/main/src');

      expect(result.repoUrl).toBe('https://gitlab.com/org/repo.git');
      expect(result.ref).toBe('main');
      expect(result.path).toBe('src');
   });

   it('parses GitLab blob URL', () => {
      const result = parseGitUrl('https://gitlab.com/org/repo/-/blob/v1.0.0/README.md');

      expect(result.repoUrl).toBe('https://gitlab.com/org/repo.git');
      expect(result.ref).toBe('v1.0.0');
      expect(result.path).toBe('README.md');
   });

   it('handles trailing slash', () => {
      const result = parseGitUrl('https://github.com/org/repo/');

      expect(result.repoUrl).toBe('https://github.com/org/repo.git');
   });
});

describe('detectGitProvider', () => {
   it('detects GitHub', () => {
      expect(detectGitProvider('https://github.com/org/repo')).toBe('github');
      expect(detectGitProvider('https://github.com/org/repo.git')).toBe('github');
   });

   it('detects GitLab', () => {
      expect(detectGitProvider('https://gitlab.com/org/repo')).toBe('gitlab');
      expect(detectGitProvider('https://gitlab.example.com/org/repo')).toBe('gitlab');
   });

   it('detects Bitbucket', () => {
      expect(detectGitProvider('https://bitbucket.org/org/repo')).toBe('bitbucket');
   });

   it('returns unknown for other URLs', () => {
      expect(detectGitProvider('https://example.com/repo.git')).toBe('unknown');
   });

   it('detects custom GitLab via GITLAB_HOST', () => {
      const originalEnv = process.env.GITLAB_HOST;

      process.env.GITLAB_HOST = 'git.mycompany.com';
      expect(detectGitProvider('https://git.mycompany.com/org/repo')).toBe('gitlab');
      process.env.GITLAB_HOST = originalEnv;
   });
});

describe('getAuthToken', () => {
   const originalEnv = { ...process.env };

   afterEach(() => {
      process.env = { ...originalEnv };
   });

   it('returns explicit token when provided', () => {
      expect(getAuthToken('https://github.com/org/repo', 'my-token')).toBe('my-token');
   });

   it('returns GITHUB_TOKEN for GitHub URLs', () => {
      process.env.GITHUB_TOKEN = 'github-token';
      expect(getAuthToken('https://github.com/org/repo')).toBe('github-token');
   });

   it('returns GITLAB_TOKEN for GitLab URLs', () => {
      process.env.GITLAB_TOKEN = 'gitlab-token';
      expect(getAuthToken('https://gitlab.com/org/repo')).toBe('gitlab-token');
   });

   it('returns GL_TOKEN as fallback for GitLab', () => {
      delete process.env.GITLAB_TOKEN;
      process.env.GL_TOKEN = 'gl-token';
      expect(getAuthToken('https://gitlab.com/org/repo')).toBe('gl-token');
   });

   it('returns BITBUCKET_TOKEN for Bitbucket URLs', () => {
      process.env.BITBUCKET_TOKEN = 'bitbucket-token';
      expect(getAuthToken('https://bitbucket.org/org/repo')).toBe('bitbucket-token');
   });

   it('returns undefined when no token available', () => {
      delete process.env.GITHUB_TOKEN;
      delete process.env.GITLAB_TOKEN;
      delete process.env.GL_TOKEN;
      delete process.env.BITBUCKET_TOKEN;
      delete process.env.GIT_TOKEN;
      expect(getAuthToken('https://github.com/org/repo')).toBeUndefined();
   });
});

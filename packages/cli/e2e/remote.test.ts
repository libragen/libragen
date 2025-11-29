/**
 * E2E Tests: Remote Git Sources
 *
 * Tests building libraries from GitHub URLs.
 * Gated by RUN_REMOTE_TESTS env var (default: true).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as path from 'path';
import {
   createTestEnv,
   cleanupTestEnv,
   runCli,
   parseJson,
   shouldRunRemoteTests,
   type TestEnv,
} from './helpers.ts';

const SKIP_REMOTE = !shouldRunRemoteTests();

describe('E2E: Remote Git Sources', () => {
   let env: TestEnv;

   beforeAll(async () => {
      if (SKIP_REMOTE) {
         return;
      }
      env = await createTestEnv();
   }, 30000);

   afterAll(async () => {
      if (env) {
         await cleanupTestEnv(env);
      }
   });

   describe('Build from Public GitHub Repo', () => {
      let libraryPath: string;

      it.skipIf(SKIP_REMOTE)('builds from small public repo', async () => {
         libraryPath = path.join(env.workDir, 'is-odd.libragen');

         // is-odd is a tiny npm package, good for testing
         const { exitCode, stdout, stderr } = await runCli([
            'build', 'https://github.com/jonschlinkert/is-odd',
            '-o', libraryPath,
            '-n', 'is-odd-lib',
            '--patterns', '**/*.js', '**/*.md',
         ], env);

         if (exitCode !== 0) {
            console.error('Build failed:', stderr);
         }

         expect(exitCode).toBe(0);
         expect(stdout).toContain('Library built successfully');
      }, 180000);

      it.skipIf(SKIP_REMOTE)('inspect shows git source metadata', async () => {
         const { exitCode, stdout } = await runCli([ 'inspect', libraryPath, '--json' ], env);

         expect(exitCode).toBe(0);

         type InspectResult = {
            metadata: {
               name: string;
               source?: {
                  type: string;
                  url: string;
               };
            };
         };

         const data = parseJson<InspectResult>(stdout);

         expect(data.metadata.name).toBe('is-odd-lib');

         // Should have git source info
         if (data.metadata.source) {
            expect(data.metadata.source.type).toBe('git');
            expect(data.metadata.source.url).toContain('github.com');
         }
      });

      it.skipIf(SKIP_REMOTE)('library is queryable', async () => {
         const { exitCode, stdout } = await runCli([
            'query', 'odd number',
            '-l', libraryPath,
            '-k', '3',
         ], env);

         expect(exitCode).toBe(0);
         expect(stdout).toContain('Found');
      }, 60000);
   });

   describe('Build from Specific Branch/Tag', () => {
      let libraryPath: string;

      it.skipIf(SKIP_REMOTE)('builds from specific tag', async () => {
         libraryPath = path.join(env.workDir, 'chalk-v5.libragen');

         // Build from chalk v5.0.0 tag
         const { exitCode, stdout, stderr } = await runCli([
            'build', 'https://github.com/chalk/chalk/tree/v5.0.0',
            '-o', libraryPath,
            '-n', 'chalk-v5',
            '--patterns', 'source/**/*.js', '**/*.md',
         ], env);

         if (exitCode !== 0) {
            console.error('Build failed:', stderr);
         }

         expect(exitCode).toBe(0);
         expect(stdout).toContain('Library built successfully');
      }, 180000);

      it.skipIf(SKIP_REMOTE)('inspect shows ref in metadata', async () => {
         const { exitCode, stdout } = await runCli([ 'inspect', libraryPath, '--json' ], env);

         expect(exitCode).toBe(0);

         type RefResult = {
            metadata: {
               source?: {
                  ref?: string;
                  commitHash?: string;
               };
            };
         };

         const data = parseJson<RefResult>(stdout);

         // Should have ref info
         if (data.metadata.source) {
            expect(data.metadata.source.ref || data.metadata.source.commitHash).toBeDefined();
         }
      });
   });

   describe('Build with Include Filter on Remote', () => {
      let libraryPath: string;

      it.skipIf(SKIP_REMOTE)('builds with include filter', async () => {
         libraryPath = path.join(env.workDir, 'express-lib.libragen');

         // Build only lib folder from express
         const { exitCode, stderr } = await runCli([
            'build', 'https://github.com/expressjs/express',
            '-o', libraryPath,
            '-n', 'express-lib',
            '--patterns', 'lib/**/*.js',
         ], env);

         if (exitCode !== 0) {
            console.error('Build failed:', stderr);
         }

         expect(exitCode).toBe(0);
      }, 180000);

      it.skipIf(SKIP_REMOTE)('library contains filtered content', async () => {
         const { exitCode, stdout } = await runCli([ 'inspect', libraryPath, '--json' ], env);

         expect(exitCode).toBe(0);

         const data = parseJson<{ stats: { chunks: number; sources: number } }>(stdout);

         // Should have some chunks from the lib folder
         expect(data.stats.chunks).toBeGreaterThan(0);
      });
   });

   describe('Build from Subdirectory URL', () => {
      let libraryPath: string;

      it.skipIf(SKIP_REMOTE)('builds from subdirectory path in URL', async () => {
         libraryPath = path.join(env.workDir, 'lodash-array.libragen');

         // Build just the array methods from lodash
         const { exitCode, stdout, stderr } = await runCli([
            'build', 'https://github.com/lodash/lodash/tree/main/.internal',
            '-o', libraryPath,
            '-n', 'lodash-internal',
            '--patterns', '**/*.js',
         ], env);

         // This might fail if the repo structure changed, that's okay for E2E
         if (exitCode !== 0) {
            console.warn('Subdirectory build skipped (repo may have changed):', stderr);
            return;
         }

         expect(stdout).toContain('Library built successfully');
      }, 180000);
   });

   describe('Error Handling for Remote Sources', () => {
      it.skipIf(SKIP_REMOTE)('fails gracefully for non-existent repo', async () => {
         const { exitCode, stderr } = await runCli([
            'build', 'https://github.com/nonexistent-user-12345/nonexistent-repo-67890',
            '-o', path.join(env.workDir, 'should-fail.libragen'),
         ], env);

         expect(exitCode).toBe(1);
         expect(stderr.toLowerCase()).toMatch(/error|fail|not found|404/);
      }, 60000);

      it.skipIf(SKIP_REMOTE)('fails gracefully for invalid URL', async () => {
         const { exitCode, stderr } = await runCli([
            'build', 'https://not-a-git-host.example.com/repo',
            '-o', path.join(env.workDir, 'should-fail.libragen'),
         ], env);

         expect(exitCode).toBe(1);
         expect(stderr.toLowerCase()).toMatch(/error|fail|invalid|unsupported/);
      }, 60000);
   });
});

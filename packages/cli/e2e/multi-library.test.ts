/**
 * E2E Tests: Multi-Library Scenarios
 *
 * Tests scenarios involving multiple libraries.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
   createTestEnv,
   cleanupTestEnv,
   runCli,
   parseJson,
   buildTestLibrary,
   createProjectDir,
   getProjectLibDir,
   FIXTURES_DIR,
   type TestEnv,
} from './helpers.ts';

describe('E2E: Multi-Library Scenarios', () => {
   let env: TestEnv;

   beforeAll(async () => {
      env = await createTestEnv();
   }, 30000);

   afterAll(async () => {
      await cleanupTestEnv(env);
   });

   describe('Multiple Libraries Coexist', () => {
      let projectDir: string;

      const libraries = [ 'docs-lib', 'utils-lib', 'examples-lib' ];

      beforeAll(async () => {
         projectDir = await createProjectDir(env, 'multi-lib-project');
         const libDir = getProjectLibDir(projectDir);

         // Build and install 3 libraries
         for (const name of libraries) {
            const libPath = await buildTestLibrary(env, {
               name,
               description: `${name} description`,
               output: `${name}.libragen`,
            });

            await runCli([ 'install', libPath, '-p', libDir ], env);
         }
      }, 360000);

      it('lists all 3 libraries', async () => {
         const { exitCode, stdout } = await runCli([
            'list', '--json',
            '-p', getProjectLibDir(projectDir),
         ], env);

         expect(exitCode).toBe(0);

         const data = parseJson<{ libraries: Array<{ name: string }> }>(stdout);

         const names = data.libraries.map((l) => { return l.name; });

         for (const lib of libraries) {
            expect(names).toContain(lib);
         }
      });

      it('queries each library individually', async () => {
         const libDir = getProjectLibDir(projectDir);

         const files = await fs.readdir(libDir);

         for (const file of files.filter((f) => { return f.endsWith('.libragen'); })) {
            const libPath = path.join(libDir, file);

            const { exitCode, stdout } = await runCli([
               'query', 'factorial',
               '-l', libPath,
               '-k', '1',
            ], env);

            expect(exitCode).toBe(0);
            expect(stdout).toContain('Found');
         }
      }, 180000);

      it('uninstalls one library', async () => {
         const { exitCode } = await runCli([
            'uninstall', 'utils-lib',
            '-p', getProjectLibDir(projectDir),
         ], env);

         expect(exitCode).toBe(0);
      });

      it('lists shows 2 remaining libraries', async () => {
         const { exitCode, stdout } = await runCli([
            'list', '--json',
            '-p', getProjectLibDir(projectDir),
         ], env);

         expect(exitCode).toBe(0);

         const data = parseJson<{ libraries: Array<{ name: string }> }>(stdout);

         const names = data.libraries.map((l) => { return l.name; });

         expect(names).toContain('docs-lib');
         expect(names).toContain('examples-lib');
         expect(names).not.toContain('utils-lib');
      });

      it('remaining libraries still work', async () => {
         const libDir = getProjectLibDir(projectDir);

         const files = await fs.readdir(libDir);

         const remainingLib = files.find((f) => { return f.endsWith('.libragen'); });

         expect(remainingLib).toBeDefined();

         const { exitCode, stdout } = await runCli([
            'query', 'function',
            '-l', path.join(libDir, (remainingLib || '')),
            '-k', '1',
         ], env);

         expect(exitCode).toBe(0);
         expect(stdout).toContain('Found');
      }, 60000);
   });

   describe('Same Content, Different Configs', () => {
      let smallChunkLib: string,
          largeChunkLib: string;

      it('builds library with small chunk size', async () => {
         smallChunkLib = path.join(env.workDir, 'small-chunks.libragen');

         const { exitCode } = await runCli([
            'build', FIXTURES_DIR,
            '-o', smallChunkLib,
            '-n', 'small-chunks-lib',
            '--chunk-size', '300',
         ], env);

         expect(exitCode).toBe(0);
      }, 120000);

      it('builds library with large chunk size', async () => {
         largeChunkLib = path.join(env.workDir, 'large-chunks.libragen');

         const { exitCode } = await runCli([
            'build', FIXTURES_DIR,
            '-o', largeChunkLib,
            '-n', 'large-chunks-lib',
            '--chunk-size', '2000',
         ], env);

         expect(exitCode).toBe(0);
      }, 120000);

      it('libraries have different chunk counts', async () => {
         const { stdout: smallOut } = await runCli([ 'inspect', smallChunkLib, '--json' ], env);

         const { stdout: largeOut } = await runCli([ 'inspect', largeChunkLib, '--json' ], env);

         const smallData = parseJson<{ metadata: { stats: { chunkCount: number } } }>(smallOut);

         const largeData = parseJson<{ metadata: { stats: { chunkCount: number } } }>(largeOut);

         // Smaller chunks = more chunks
         expect(smallData.metadata.stats.chunkCount).toBeGreaterThan(largeData.metadata.stats.chunkCount);
      });

      it('both libraries are queryable', async () => {
         const { exitCode: exitSmall } = await runCli([
            'query', 'factorial', '-l', smallChunkLib, '-k', '1',
         ], env);

         const { exitCode: exitLarge } = await runCli([
            'query', 'factorial', '-l', largeChunkLib, '-k', '1',
         ], env);

         expect(exitSmall).toBe(0);
         expect(exitLarge).toBe(0);
      }, 120000);
   });

   describe('Update Dry Run', () => {
      let projectDir: string;

      beforeAll(async () => {
         projectDir = await createProjectDir(env, 'update-test-project');

         const libPath = await buildTestLibrary(env, {
            name: 'update-test-lib',
            output: 'update-test.libragen',
         });

         await runCli([ 'install', libPath, '-p', getProjectLibDir(projectDir) ], env);
      }, 180000);

      it('update --dry-run reports status', async () => {
         const { exitCode, stdout, stderr } = await runCli([
            'update', '--dry-run',
            '-p', getProjectLibDir(projectDir),
         ], env);

         expect(exitCode).toBe(0);

         const output = stdout + stderr;

         // Should indicate no updates available (library installed from file, not
         // collection)
         expect(output).toMatch(/up to date|no.*(update|collection)/i);
      });
   });

   describe('Verbose List Output', () => {
      let projectDir: string;

      beforeAll(async () => {
         projectDir = await createProjectDir(env, 'verbose-test-project');

         const libPath = await buildTestLibrary(env, {
            name: 'verbose-test-lib',
            version: '3.2.1',
            description: 'A library for testing verbose output',
            output: 'verbose-test.libragen',
         });

         await runCli([ 'install', libPath, '-p', getProjectLibDir(projectDir) ], env);
      }, 180000);

      it('list --verbose shows detailed info', async () => {
         const { exitCode, stdout } = await runCli([
            'list', '--verbose',
            '-p', getProjectLibDir(projectDir),
         ], env);

         expect(exitCode).toBe(0);
         expect(stdout).toContain('verbose-test-lib');
         expect(stdout).toContain('3.2.1');
         // Verbose should show more details
         expect(stdout).toMatch(/chunk|size|description/i);
      });
   });
});

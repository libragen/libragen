/**
 * E2E Tests: Error Handling
 *
 * Tests graceful error handling and recovery scenarios.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
   createTestEnv,
   cleanupTestEnv,
   runCli,
   buildTestLibrary,
   createProjectDir,
   getProjectLibDir,
   type TestEnv,
} from './helpers.ts';

describe('E2E: Error Handling', () => {
   let env: TestEnv;

   beforeAll(async () => {
      env = await createTestEnv();
   }, 30000);

   afterAll(async () => {
      await cleanupTestEnv(env);
   });

   describe('Build Errors', () => {
      it('fails for non-existent source path', async () => {
         const { exitCode, stderr } = await runCli([
            'build', '/nonexistent/path/to/source',
            '-o', path.join(env.workDir, 'should-fail.libragen'),
         ], env);

         expect(exitCode).toBe(1);
         expect(stderr.toLowerCase()).toMatch(/error|not found|does not exist/);
      });

      it('handles empty source directory', async () => {
         const emptyDir = path.join(env.workDir, 'empty-source');

         await fs.mkdir(emptyDir, { recursive: true });

         const { exitCode, stderr, stdout } = await runCli([
            'build', emptyDir,
            '-o', path.join(env.workDir, 'empty-result.libragen'),
         ], env);

         // CLI may succeed with 0 files or fail - both are acceptable
         // What matters is it doesn't crash unexpectedly
         const output = (stderr + stdout).toLowerCase();

         if (exitCode === 1) {
            expect(output).toMatch(/error|no files|empty/);
         } else {
            // It succeeded, possibly with 0 chunks
            expect(exitCode).toBe(0);
         }
      });

      it('fails for invalid output path', async () => {
         const { exitCode, stderr } = await runCli([
            'build', path.join(env.workDir, '..', '..', 'core/src/__tests__/fixtures'),
            '-o', '/nonexistent/directory/output.libragen',
         ], env);

         // Should fail due to invalid output directory
         expect(exitCode).toBe(1);
         expect(stderr.toLowerCase()).toMatch(/error/);
      });
   });

   describe('Install Errors', () => {
      it('fails for non-existent library file', async () => {
         const { exitCode, stderr } = await runCli([
            'install', '/nonexistent/library.libragen',
         ], env);

         expect(exitCode).toBe(1);
         expect(stderr.toLowerCase()).toMatch(/error|not found|does not exist/);
      });

      it('fails for invalid library file', async () => {
         const invalidFile = path.join(env.workDir, 'invalid.libragen');

         await fs.writeFile(invalidFile, 'not a valid library file');

         const { exitCode, stderr } = await runCli([
            'install', invalidFile,
         ], env);

         expect(exitCode).toBe(1);
         expect(stderr.toLowerCase()).toMatch(/error|invalid|corrupt/);
      });

      it('fails for non-existent install path', async () => {
         const libPath = await buildTestLibrary(env, {
            name: 'install-error-test',
            output: 'install-error-test.libragen',
         });

         const { exitCode, stderr } = await runCli([
            'install', libPath,
            '-p', '/nonexistent/install/path',
         ], env);

         // Should fail or warn about path
         expect(exitCode).toBe(1);
         expect(stderr.toLowerCase()).toMatch(/error/);
      }, 120000);
   });

   describe('Uninstall Errors', () => {
      it('fails for non-existent library name', async () => {
         const { exitCode, stderr } = await runCli([
            'uninstall', 'nonexistent-library-name-12345',
         ], env);

         expect(exitCode).toBe(1);
         expect(stderr.toLowerCase()).toMatch(/not found|error/);
      });

      it('fails for non-existent path', async () => {
         const { exitCode, stderr } = await runCli([
            'uninstall', 'some-lib',
            '-p', '/nonexistent/path',
         ], env);

         expect(exitCode).toBe(1);
         expect(stderr.toLowerCase()).toMatch(/error|not found/);
      });
   });

   describe('Query Errors', () => {
      it('fails without --library option', async () => {
         const { exitCode, stderr } = await runCli([
            'query', 'test query',
         ], env);

         expect(exitCode).toBe(1);
         expect(stderr).toMatch(/--library|-l/);
      });

      it('fails for non-existent library file', async () => {
         const { exitCode, stderr } = await runCli([
            'query', 'test query',
            '-l', '/nonexistent/library.libragen',
         ], env);

         expect(exitCode).toBe(1);
         expect(stderr.toLowerCase()).toMatch(/error|not found/);
      });

      it('fails for invalid library file', async () => {
         const invalidFile = path.join(env.workDir, 'invalid-query.libragen');

         await fs.writeFile(invalidFile, 'not a valid library');

         const { exitCode, stderr, stdout } = await runCli([
            'query', 'test',
            '-l', invalidFile,
         ], env);

         // Should either fail with exit code 1 or output an error
         const output = (stderr + stdout).toLowerCase();

         expect(exitCode === 1 || output.includes('error') || output.includes('invalid')).toBe(true);
      });
   });

   describe('Inspect Errors', () => {
      it('fails for non-existent file', async () => {
         const { exitCode, stderr } = await runCli([
            'inspect', '/nonexistent/file.libragen',
         ], env);

         expect(exitCode).toBe(1);
         expect(stderr.toLowerCase()).toMatch(/not found|error/);
      });

      it('fails for invalid file format', async () => {
         const invalidFile = path.join(env.workDir, 'invalid-inspect.libragen');

         await fs.writeFile(invalidFile, 'not a valid format');

         const { exitCode, stderr } = await runCli([
            'inspect', invalidFile,
         ], env);

         expect(exitCode).toBe(1);
         expect(stderr.toLowerCase()).toMatch(/error|invalid/);
      });
   });

   describe('Collection Errors', () => {
      it('fails to pack non-existent collection', async () => {
         const { exitCode, stderr } = await runCli([
            'collection', 'pack', '/nonexistent/collection.json',
         ], env);

         expect(exitCode).toBe(1);
         expect(stderr.toLowerCase()).toMatch(/error|not found/);
      });

      it('fails to pack collection with missing library', async () => {
         const collectionPath = path.join(env.workDir, 'bad-collection.json');

         await fs.writeFile(collectionPath, JSON.stringify({
            name: 'bad-collection',
            version: '1.0.0',
            items: [
               { library: '/nonexistent/library.libragen' },
            ],
         }));

         const { exitCode, stderr } = await runCli([
            'collection', 'pack', collectionPath,
         ], env);

         expect(exitCode).toBe(1);
         expect(stderr.toLowerCase()).toMatch(/not found|error/);
      });

      it('fails to unpack non-existent file', async () => {
         const { exitCode, stderr } = await runCli([
            'collection', 'unpack', '/nonexistent/file.libragen-collection',
         ], env);

         expect(exitCode).toBe(1);
         expect(stderr.toLowerCase()).toMatch(/error|not found/);
      });

      it('fails to remove non-existent collection', async () => {
         const { exitCode, stderr } = await runCli([
            'collection', 'remove', 'nonexistent-collection-name',
         ], env);

         expect(exitCode).toBe(1);
         expect(stderr.toLowerCase()).toMatch(/not found|error/);
      });

      it('fails to install invalid JSON as collection', async () => {
         const invalidJson = path.join(env.workDir, 'invalid.json');

         await fs.writeFile(invalidJson, 'not valid json {{{');

         const { exitCode, stderr } = await runCli([
            'install', invalidJson,
         ], env);

         expect(exitCode).toBe(1);
         expect(stderr.toLowerCase()).toMatch(/error|invalid|parse/);
      });
   });

   describe('Update Errors', () => {
      it('handles update with no libraries gracefully', async () => {
         const projectDir = await createProjectDir(env, 'empty-update-project');

         const { exitCode, stdout, stderr } = await runCli([
            'update',
            '-p', getProjectLibDir(projectDir),
         ], env);

         // Should succeed but indicate nothing to update
         expect(exitCode).toBe(0);

         const output = stdout + stderr;

         expect(output.toLowerCase()).toMatch(/no libraries|up to date/);
      });

      it('handles update for non-existent specific library', async () => {
         const { exitCode, stderr, stdout } = await runCli([
            'update', 'nonexistent-lib-to-update',
         ], env);

         const output = (stderr + stdout).toLowerCase();

         // CLI may return 0 with "not found" message or 1 with error
         // Both behaviors are acceptable
         const isExpected = exitCode === 1 ||
            output.includes('not found') ||
            output.includes('no libraries') ||
            output.includes('up to date');

         expect(isExpected).toBe(true);
      });
   });

   describe('Cleanup After Errors', () => {
      it('does not leave temp files after failed build', async () => {
         const outputPath = path.join(env.workDir, 'cleanup-test.libragen');

         // This should fail
         await runCli([
            'build', '/nonexistent/source',
            '-o', outputPath,
         ], env);

         // Output file should not exist
         await expect(fs.access(outputPath)).rejects.toThrow();
      });

      it('partial install does not corrupt state', async () => {
         const projectDir = await createProjectDir(env, 'partial-install-test');

         const libDir = getProjectLibDir(projectDir);

         // Install a valid library first
         const validLib = await buildTestLibrary(env, {
            name: 'valid-lib',
            output: 'valid.libragen',
         });

         await runCli([ 'install', validLib, '-p', libDir ], env);

         // Try to install an invalid file (should fail)
         const invalidFile = path.join(env.workDir, 'invalid-partial.libragen');

         await fs.writeFile(invalidFile, 'invalid content');

         await runCli([ 'install', invalidFile, '-p', libDir ], env);

         // Original library should still be intact
         const { exitCode, stdout } = await runCli([
            'list', '--json',
            '-p', libDir,
         ], env);

         expect(exitCode).toBe(0);

         const data = JSON.parse(stdout);

         expect(data.libraries.some((l: { name: string }) => { return l.name === 'valid-lib'; })).toBe(true);
      }, 180000);
   });
});

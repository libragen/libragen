/**
 * E2E Tests: Library Lifecycle
 *
 * Tests the complete journey of a library from creation to removal.
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
   FIXTURES_DIR,
   type TestEnv,
} from './helpers.ts';

describe('E2E: Library Lifecycle', () => {
   let env: TestEnv;

   beforeAll(async () => {
      env = await createTestEnv();
   }, 30000);

   afterAll(async () => {
      await cleanupTestEnv(env);
   });

   describe('First-Time User Journey', () => {
      const libraryName = 'my-docs';

      let libraryPath: string;

      it('builds a library from source', async () => {
         libraryPath = await buildTestLibrary(env, {
            name: libraryName,
            version: '1.0.0',
            description: 'My documentation library',
         });

         // Verify file was created
         const stats = await fs.stat(libraryPath);

         expect(stats.size).toBeGreaterThan(0);
      }, 120000);

      it('inspects the built library', async () => {
         const { stdout, exitCode } = await runCli([ 'inspect', libraryPath ], env);

         expect(exitCode).toBe(0);
         expect(stdout).toContain('Library Contents');
         expect(stdout).toContain(libraryName);
         expect(stdout).toContain('Chunks:');
      });

      it('inspects with JSON output', async () => {
         const { stdout, exitCode } = await runCli([ 'inspect', libraryPath, '--json' ], env);

         expect(exitCode).toBe(0);

         type InspectResult = {
            type: string;
            metadata: {
               name: string;
               version: string;
               stats: { chunkCount: number };
            };
         };

         const data = parseJson<InspectResult>(stdout);

         expect(data.type).toBe('library');
         expect(data.metadata.name).toBe(libraryName);
         expect(data.metadata.version).toBe('1.0.0');
         expect(data.metadata.stats.chunkCount).toBeGreaterThan(0);
      });

      it('installs the library', async () => {
         const { stdout, exitCode } = await runCli([ 'install', libraryPath ], env);

         expect(exitCode).toBe(0);
         expect(stdout).toContain('Location:');
      });

      it('lists installed libraries', async () => {
         const { stdout, exitCode } = await runCli([ 'list' ], env);

         expect(exitCode).toBe(0);
         expect(stdout).toContain(libraryName);
      });

      it('lists with JSON output', async () => {
         const { stdout, exitCode } = await runCli([ 'list', '--json' ], env);

         expect(exitCode).toBe(0);

         const data = parseJson<{ libraries: Array<{ name: string }> }>(stdout);

         expect(data.libraries.some((lib) => { return lib.name === libraryName; })).toBe(true);
      });

      it('queries the library for content', async () => {
         // The fixtures contain factorial function
         const { stdout, exitCode } = await runCli(
            [ 'query', 'factorial', '-l', libraryPath, '-k', '3' ],
            env
         );

         expect(exitCode).toBe(0);
         expect(stdout).toContain('Found');
         expect(stdout).toContain('results');
      }, 60000);

      it('queries with JSON output', async () => {
         const { stdout, exitCode } = await runCli(
            [ 'query', 'factorial', '-l', libraryPath, '-k', '2', '--json' ],
            env
         );

         expect(exitCode).toBe(0);

         const results = parseJson<Array<{ content: string; score: number }>>(stdout);

         expect(Array.isArray(results)).toBe(true);
         expect(results.length).toBeGreaterThan(0);
         expect(results[0]).toHaveProperty('content');
         expect(results[0]).toHaveProperty('score');
      }, 60000);

      it('uninstalls the library', async () => {
         const { stdout, exitCode } = await runCli([ 'uninstall', libraryName ], env);

         expect(exitCode).toBe(0);
         expect(stdout.toLowerCase()).toMatch(/removed|uninstalled/);
      });

      it('confirms library is removed from list', async () => {
         const { stdout, exitCode } = await runCli([ 'list', '--json' ], env);

         expect(exitCode).toBe(0);

         const data = parseJson<{ libraries: Array<{ name: string }> }>(stdout);

         expect(data.libraries.some((lib) => { return lib.name === libraryName; })).toBe(false);
      });
   });

   describe('Build with All Metadata Options', () => {
      let libraryPath: string;

      it('builds with all metadata fields', async () => {
         libraryPath = path.join(env.workDir, 'full-metadata.libragen');

         const { exitCode } = await runCli([
            'build', FIXTURES_DIR,
            '-o', libraryPath,
            '-n', 'full-metadata-lib',
            '-v', '2.5.0',
            '-d', 'A library with full metadata',
            '--content-version', 'v3.0.0',
            '--agent-description', 'Use this library for testing metadata',
         ], env);

         expect(exitCode).toBe(0);
      }, 120000);

      it('inspect shows all metadata', async () => {
         const { stdout, exitCode } = await runCli([ 'inspect', libraryPath, '--json' ], env);

         expect(exitCode).toBe(0);

         type MetadataResult = {
            metadata: {
               name: string;
               version: string;
               description: string;
               contentVersion: string;
               agentDescription: string;
            };
         };

         const data = parseJson<MetadataResult>(stdout);

         expect(data.metadata.name).toBe('full-metadata-lib');
         expect(data.metadata.version).toBe('2.5.0');
         expect(data.metadata.description).toBe('A library with full metadata');
         expect(data.metadata.contentVersion).toBe('v3.0.0');
         expect(data.metadata.agentDescription).toBe('Use this library for testing metadata');
      });
   });

   describe('Rebuild and Force Install', () => {
      const libName = 'force-install-lib';

      it('allows force reinstall of existing library', async () => {
         // Build and install a library
         const libraryPath = await buildTestLibrary(env, {
            name: libName,
            output: `${libName}.libragen`,
         });

         const { exitCode: installCode } = await runCli([ 'install', libraryPath ], env);

         expect(installCode).toBe(0);

         // Verify installed
         const { stdout: listOut1 } = await runCli([ 'list', '--json' ], env);

         const data1 = parseJson<{ libraries: Array<{ name: string }> }>(listOut1);

         expect(data1.libraries.some((l) => { return l.name === libName; })).toBe(true);

         // Try to reinstall without force - should warn/fail
         const { stdout: noForceOut, stderr: noForceErr } = await runCli([ 'install', libraryPath ], env);

         const noForceOutput = noForceOut + noForceErr;

         // Should mention the library already exists
         expect(noForceOutput.toLowerCase()).toMatch(/already|exists|skip/);

         // Reinstall with force - should succeed
         const { exitCode: forceCode } = await runCli([ 'install', libraryPath, '--force' ], env);

         expect(forceCode).toBe(0);

         // Library should still be installed
         const { stdout: listOut2 } = await runCli([ 'list', '--json' ], env);

         const data2 = parseJson<{ libraries: Array<{ name: string }> }>(listOut2);

         expect(data2.libraries.some((l) => { return l.name === libName; })).toBe(true);
      }, 180000);
   });

   describe('Config Command', () => {
      it('shows configuration', async () => {
         const { stdout, exitCode } = await runCli([ 'config' ], env);

         expect(exitCode).toBe(0);
         expect(stdout).toContain('Configuration');
         expect(stdout).toContain('Libraries:');
      });

      it('shows config as JSON', async () => {
         const { stdout, exitCode } = await runCli([ 'config', '--json' ], env);

         expect(exitCode).toBe(0);

         const data = parseJson<{ paths: { home: string; libraries: string } }>(stdout);

         expect(data.paths.home).toBe(env.home);
         expect(data.paths.libraries).toContain('libraries');
      });
   });
});

/**
 * E2E Tests: Project Isolation
 *
 * Tests that the -p flag properly isolates library paths between projects.
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
   type TestEnv,
} from './helpers.ts';

describe('E2E: Project Isolation', () => {
   let env: TestEnv;

   beforeAll(async () => {
      env = await createTestEnv();
   }, 30000);

   afterAll(async () => {
      await cleanupTestEnv(env);
   });

   describe('Project-Local vs Global Isolation', () => {
      let projectA: string,
          projectB: string,
          libAPath: string,
          libBPath: string;

      beforeAll(async () => {
         // Create project directories
         projectA = await createProjectDir(env, 'project-a');
         projectB = await createProjectDir(env, 'project-b');

         // Build libraries
         libAPath = await buildTestLibrary(env, {
            name: 'lib-a',
            description: 'Library for project A',
            output: 'lib-a.libragen',
         });

         libBPath = await buildTestLibrary(env, {
            name: 'lib-b',
            description: 'Library for project B',
            output: 'lib-b.libragen',
         });
      }, 240000);

      it('installs lib-a to project-a', async () => {
         const libDir = getProjectLibDir(projectA);

         const { exitCode, stdout } = await runCli([
            'install', libAPath,
            '-p', libDir,
         ], env);

         expect(exitCode).toBe(0);
         expect(stdout).toContain('Location:');

         // Verify file exists in project directory
         const files = await fs.readdir(libDir);

         expect(files.some((f) => { return f.includes('lib-a'); })).toBe(true);
      });

      it('installs lib-b to project-b', async () => {
         const libDir = getProjectLibDir(projectB);

         const { exitCode } = await runCli([
            'install', libBPath,
            '-p', libDir,
         ], env);

         expect(exitCode).toBe(0);

         // Verify file exists in project directory
         const files = await fs.readdir(libDir);

         expect(files.some((f) => { return f.includes('lib-b'); })).toBe(true);
      });

      it('list with -p project-a shows only lib-a', async () => {
         const { exitCode, stdout } = await runCli([
            'list', '--json',
            '-p', getProjectLibDir(projectA),
         ], env);

         expect(exitCode).toBe(0);

         const data = parseJson<{ libraries: Array<{ name: string }> }>(stdout);

         const names = data.libraries.map((l) => { return l.name; });

         expect(names).toContain('lib-a');
         expect(names).not.toContain('lib-b');
      });

      it('list with -p project-b shows only lib-b', async () => {
         const { exitCode, stdout } = await runCli([
            'list', '--json',
            '-p', getProjectLibDir(projectB),
         ], env);

         expect(exitCode).toBe(0);

         const data = parseJson<{ libraries: Array<{ name: string }> }>(stdout);

         const names = data.libraries.map((l) => { return l.name; });

         expect(names).toContain('lib-b');
         expect(names).not.toContain('lib-a');
      });

      it('list without -p shows global libraries (neither project lib)', async () => {
         // Global directory should be empty since we installed to project dirs
         const { exitCode, stdout } = await runCli([ 'list', '--json' ], env);

         expect(exitCode).toBe(0);

         const data = parseJson<{ libraries: Array<{ name: string }> }>(stdout);

         const names = data.libraries.map((l) => { return l.name; });

         // These were installed to project dirs, not global
         expect(names).not.toContain('lib-a');
         expect(names).not.toContain('lib-b');
      });
   });

   describe('Query Respects Library Path', () => {
      let projectDir: string,
          installedLibPath: string;

      beforeAll(async () => {
         projectDir = await createProjectDir(env, 'query-project');

         const libPath = await buildTestLibrary(env, {
            name: 'query-test-lib',
            output: 'query-test.libragen',
         });

         // Install to project
         await runCli([
            'install', libPath,
            '-p', getProjectLibDir(projectDir),
         ], env);

         // Get the installed library path
         const libDir = getProjectLibDir(projectDir);

         const files = await fs.readdir(libDir);

         const libFile = files.find((f) => { return f.endsWith('.libragen'); });

         installedLibPath = path.join(libDir, libFile || '');
      }, 180000);

      it('queries installed library by path', async () => {
         const { exitCode, stdout } = await runCli([
            'query', 'factorial',
            '-l', installedLibPath,
         ], env);

         expect(exitCode).toBe(0);
         expect(stdout).toContain('Found');
      }, 60000);

      it('fails gracefully for non-existent library path', async () => {
         const { exitCode, stderr } = await runCli([
            'query', 'factorial',
            '-l', '/nonexistent/path.libragen',
         ], env);

         expect(exitCode).toBe(1);
         expect(stderr).toContain('Error');
      });
   });

   describe('Uninstall Respects Path Flag', () => {
      let projectC: string,
          projectD: string;

      beforeAll(async () => {
         projectC = await createProjectDir(env, 'project-c');
         projectD = await createProjectDir(env, 'project-d');

         // Build a library
         const libPath = await buildTestLibrary(env, {
            name: 'shared-name-lib',
            output: 'shared-name.libragen',
         });

         // Install to both projects
         await runCli([ 'install', libPath, '-p', getProjectLibDir(projectC) ], env);
         await runCli([ 'install', libPath, '-p', getProjectLibDir(projectD) ], env);
      }, 180000);

      it('uninstalls from project-c only', async () => {
         const { exitCode } = await runCli([
            'uninstall', 'shared-name-lib',
            '-p', getProjectLibDir(projectC),
         ], env);

         expect(exitCode).toBe(0);
      });

      it('library still exists in project-d', async () => {
         const { exitCode, stdout } = await runCli([
            'list', '--json',
            '-p', getProjectLibDir(projectD),
         ], env);

         expect(exitCode).toBe(0);

         const data = parseJson<{ libraries: Array<{ name: string }> }>(stdout);

         const names = data.libraries.map((l) => { return l.name; });

         expect(names).toContain('shared-name-lib');
      });

      it('library removed from project-c', async () => {
         const { exitCode, stdout } = await runCli([
            'list', '--json',
            '-p', getProjectLibDir(projectC),
         ], env);

         expect(exitCode).toBe(0);

         const data = parseJson<{ libraries: Array<{ name: string }> }>(stdout);

         const names = data.libraries.map((l) => { return l.name; });

         expect(names).not.toContain('shared-name-lib');
      });
   });

   describe('Multiple Path Flags', () => {
      let projectE: string,
          projectF: string;

      beforeAll(async () => {
         projectE = await createProjectDir(env, 'project-e');
         projectF = await createProjectDir(env, 'project-f');

         const libE = await buildTestLibrary(env, {
            name: 'lib-e',
            output: 'lib-e.libragen',
         });

         const libF = await buildTestLibrary(env, {
            name: 'lib-f',
            output: 'lib-f.libragen',
         });

         await runCli([ 'install', libE, '-p', getProjectLibDir(projectE) ], env);
         await runCli([ 'install', libF, '-p', getProjectLibDir(projectF) ], env);
      }, 240000);

      it('list with multiple -p flags shows libraries from both', async () => {
         const { exitCode, stdout } = await runCli([
            'list', '--json',
            '-p', getProjectLibDir(projectE),
            '-p', getProjectLibDir(projectF),
         ], env);

         expect(exitCode).toBe(0);

         const data = parseJson<{ libraries: Array<{ name: string }> }>(stdout);

         const names = data.libraries.map((l) => { return l.name; });

         expect(names).toContain('lib-e');
         expect(names).toContain('lib-f');
      });
   });
});

/**
 * CLI integration tests
 *
 * Tests the CLI commands by spawning child processes.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { fileURLToPath } from 'url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

const CLI_PATH = path.resolve(currentDir, '../../dist/index.js');

const FIXTURES_DIR = path.resolve(currentDir, '../../../core/src/__tests__/fixtures');

/**
 * Run CLI command and return output
 */
function runCli(args: string[], options: { cwd?: string } = {}): Promise<{ stdout: string; stderr: string; exitCode: number }> {
   return new Promise((resolve) => {
      const proc = spawn('node', [ CLI_PATH, ...args ], {
         cwd: options.cwd || process.cwd(),
         // eslint-disable-next-line no-process-env
         env: { ...process.env, NO_COLOR: '1' },
      });

      let stdout = '',
          stderr = '';

      proc.stdout.on('data', (data) => {
         stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
         stderr += data.toString();
      });

      proc.on('close', (code) => {
         resolve({ stdout, stderr, exitCode: code ?? 0 });
      });
   });
}

describe('CLI', () => {
   let tempDir: string;

   beforeAll(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'libragen-cli-test-'));
   });

   afterAll(async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
   });

   describe('--help', () => {
      it('shows help message', async () => {
         const { stdout, exitCode } = await runCli([ '--help' ]);

         expect(exitCode).toBe(0);
         expect(stdout).toContain('Usage: libragen');
         expect(stdout).toContain('build');
         expect(stdout).toContain('query');
         expect(stdout).toContain('inspect');
         expect(stdout).toContain('list');
      });
   });

   describe('--cli-version', () => {
      it('shows version', async () => {
         const { stdout, exitCode } = await runCli([ '--cli-version' ]);

         expect(exitCode).toBe(0);
         expect(stdout).toMatch(/\d+\.\d+\.\d+/);
      });
   });

   describe('build command', () => {
      it('shows help for build', async () => {
         const { stdout, exitCode } = await runCli([ 'build', '--help' ]);

         expect(exitCode).toBe(0);
         expect(stdout).toContain('Build a .libragen library');
         expect(stdout).toContain('--output');
         expect(stdout).toContain('--name');
      });

      it('builds a library from fixtures', async () => {
         const outputPath = path.join(tempDir, 'test.libragen');

         const { stdout, exitCode } = await runCli([
            'build',
            FIXTURES_DIR,
            '-o', outputPath,
            '-n', 'test-lib',
         ]);

         expect(exitCode).toBe(0);
         expect(stdout).toContain('Library built successfully');

         // Verify file was created
         const stats = await fs.stat(outputPath);

         expect(stats.size).toBeGreaterThan(0);
      }, 60000); // 1 minute timeout for embedding

      it('fails for non-existent source', async () => {
         const { stderr, exitCode } = await runCli([
            'build',
            '/nonexistent/path',
         ]);

         expect(exitCode).toBe(1);
         expect(stderr).toContain('Error');
      });
   });


   describe('query command', () => {
      let libraryPath: string;

      beforeAll(async () => {
         libraryPath = path.join(tempDir, 'query-test.libragen');

         // Build a library for testing
         await runCli([
            'build',
            FIXTURES_DIR,
            '-o', libraryPath,
         ]);
      }, 60000);

      it('shows help for query', async () => {
         const { stdout, exitCode } = await runCli([ 'query', '--help' ]);

         expect(exitCode).toBe(0);
         expect(stdout).toContain('Search a .libragen library');
         expect(stdout).toContain('--library');
      });

      it('searches library and returns results', async () => {
         const { stdout, exitCode } = await runCli([
            'query',
            'factorial',
            '-l', libraryPath,
            '-k', '3',
         ]);

         expect(exitCode).toBe(0);
         expect(stdout).toContain('Found');
         expect(stdout).toContain('results');
      }, 60000);

      it('outputs JSON with --json flag', async () => {
         const { stdout, exitCode } = await runCli([
            'query',
            'factorial',
            '-l', libraryPath,
            '-k', '2',
            '--json',
         ]);

         expect(exitCode).toBe(0);

         const results = JSON.parse(stdout);

         expect(Array.isArray(results)).toBe(true);
         expect(results.length).toBeLessThanOrEqual(2);

         if (results.length > 0) {
            expect(results[0]).toHaveProperty('content');
            expect(results[0]).toHaveProperty('score');
         }
      }, 60000);

      it('fails without --library option', async () => {
         const { stderr, exitCode } = await runCli([ 'query', 'test' ]);

         expect(exitCode).toBe(1);
         expect(stderr).toContain('--library');
      });

      it('fails for non-existent library', async () => {
         const { stderr, exitCode } = await runCli([
            'query',
            'test',
            '-l', '/nonexistent.libragen',
         ]);

         expect(exitCode).toBe(1);
         expect(stderr).toContain('Error');
      });
   });

   describe('list command', () => {
      it('shows help for list', async () => {
         const { stdout, exitCode } = await runCli([ 'list', '--help' ]);

         expect(exitCode).toBe(0);
         expect(stdout).toContain('List installed libraries');
         expect(stdout).toContain('--json');
         expect(stdout).toContain('--verbose');
      });

      it('handles empty library list', async () => {
         // Use a temp directory with no libraries
         const emptyProjectDir = path.join(tempDir, 'empty-list-test');

         await fs.mkdir(emptyProjectDir, { recursive: true });

         const { stdout, exitCode } = await runCli([
            'list',
            '-p', emptyProjectDir,
            '--libraries',
         ]);

         expect(exitCode).toBe(0);
         // The -p flag adds project libraries but still shows global ones.
         // With an empty project dir, we should see either:
         // - "No libraries" if no global libraries exist
         // - "Installed Libraries" with only [global] entries (no [project] entries)
         const hasNoLibraries = stdout.includes('No libraries or collections installed');

         const hasOnlyGlobalLibraries = stdout.includes('Installed Libraries') &&
            !stdout.includes('[project]');

         expect(hasNoLibraries || hasOnlyGlobalLibraries).toBe(true);
      });

      it('outputs JSON with --json flag', async () => {
         const { stdout, exitCode } = await runCli([
            'list',
            '-p', tempDir,
            '--json',
         ]);

         expect(exitCode).toBe(0);

         const data = JSON.parse(stdout);

         expect(data).toHaveProperty('libraries');
         expect(data).toHaveProperty('collections');
         expect(Array.isArray(data.libraries)).toBe(true);
         expect(Array.isArray(data.collections)).toBe(true);
      });
   });

   describe('install command', () => {
      let libraryPath: string;

      beforeAll(async () => {
         libraryPath = path.join(tempDir, 'install-test.libragen');

         // Build a library for testing
         await runCli([
            'build',
            FIXTURES_DIR,
            '-o', libraryPath,
         ]);
      }, 60000);

      it('shows help for install', async () => {
         const { stdout, exitCode } = await runCli([ 'install', '--help' ]);

         expect(exitCode).toBe(0);
         expect(stdout).toContain('Install a library');
         expect(stdout).toContain('--force');
         expect(stdout).toContain('--path');
      });

      it('installs library from file path', async () => {
         const projectDir = path.join(tempDir, 'test-project');

         const libDir = path.join(projectDir, 'libs');

         await fs.mkdir(libDir, { recursive: true });

         const { stdout, exitCode } = await runCli([
            'install',
            libraryPath,
            '-p', libDir,
         ]);

         expect(exitCode).toBe(0);
         // Check that installation succeeded - output contains location info
         expect(stdout).toContain('Location:');
      }, 30000);

      it('fails for non-existent file', async () => {
         const { stderr, exitCode } = await runCli([
            'install',
            '/nonexistent.libragen',
         ]);

         expect(exitCode).toBe(1);
         expect(stderr).toContain('Error');
      });
   });

   describe('uninstall command', () => {
      it('shows help for uninstall', async () => {
         const { stdout, exitCode } = await runCli([ 'uninstall', '--help' ]);

         expect(exitCode).toBe(0);
         expect(stdout).toContain('Remove an installed library');
         expect(stdout).toContain('--path');
      });

      it('fails for non-existent library', async () => {
         const { stderr, exitCode } = await runCli([
            'uninstall',
            'nonexistent-lib',
         ]);

         expect(exitCode).toBe(1);
         expect(stderr).toContain('not found');
      });
   });

   describe('update command', () => {
      it('shows help for update', async () => {
         const { stdout, exitCode } = await runCli([ 'update', '--help' ]);

         expect(exitCode).toBe(0);
         expect(stdout).toContain('Update libraries from their collections');
         expect(stdout).toContain('--force');
         expect(stdout).toContain('--dry-run');
      });

      it('reports up to date when no libraries installed', async () => {
         // Use a temp dir with no libraries and -p flag to use only that path
         const emptyDir = path.join(tempDir, 'empty-update-test');

         const libDir = path.join(emptyDir, 'libs');

         await fs.mkdir(libDir, { recursive: true });

         const { stdout, stderr, exitCode } = await runCli([ 'update', '-p', libDir ]);

         expect(exitCode).toBe(0);
         // Output may go to stdout or stderr depending on ora spinner behavior
         const output = stdout + stderr;

         // With -p and empty dir, should report no libraries or up to date
         const isExpected = output.includes('No libraries installed') ||
            output.includes('All libraries are up to date');

         expect(isExpected).toBe(true);
      });
   });

   describe('inspect command', () => {
      it('shows help for inspect', async () => {
         const { stdout, exitCode } = await runCli([ 'inspect', '--help' ]);

         expect(exitCode).toBe(0);
         expect(stdout).toContain('Inspect the contents');
         expect(stdout).toContain('.libragen');
         expect(stdout).toContain('.libragen-collection');
         expect(stdout).toContain('--json');
      });

      it('inspects a library file', async () => {
         // First build a library
         const outputPath = path.join(tempDir, 'inspect-test.libragen');

         await runCli([
            'build',
            FIXTURES_DIR,
            '-o', outputPath,
            '-n', 'inspect-test-lib',
         ]);

         // Then inspect it
         const { stdout, exitCode } = await runCli([ 'inspect', outputPath ]);

         expect(exitCode).toBe(0);
         expect(stdout).toContain('Library Contents');
         expect(stdout).toContain('inspect-test-lib');
         expect(stdout).toContain('Chunks:');
      });

      it('outputs JSON with --json flag', async () => {
         const outputPath = path.join(tempDir, 'inspect-json-test.libragen');

         await runCli([
            'build',
            FIXTURES_DIR,
            '-o', outputPath,
            '-n', 'inspect-json-lib',
         ]);

         const { stdout, exitCode } = await runCli([ 'inspect', outputPath, '--json' ]);

         expect(exitCode).toBe(0);

         const data = JSON.parse(stdout);

         expect(data.type).toBe('library');
         expect(data.metadata.name).toBe('inspect-json-lib');
      });

      it('fails for non-existent file', async () => {
         const { stderr, exitCode } = await runCli([ 'inspect', '/nonexistent/file.libragen' ]);

         expect(exitCode).toBe(1);
         expect(stderr).toContain('not found');
      });
   });

   describe('collection command', () => {
      it('shows help for collection', async () => {
         const { stdout, exitCode } = await runCli([ 'collection', '--help' ]);

         expect(exitCode).toBe(0);
         expect(stdout).toContain('Manage library collections');
         expect(stdout).toContain('list');
         expect(stdout).toContain('add');
         expect(stdout).toContain('remove');
         expect(stdout).toContain('search');
         expect(stdout).toContain('pack');
         expect(stdout).toContain('unpack');
         // Note: 'inspect' was moved to top-level command
      });

      it('lists collections (empty)', async () => {
         const { stdout, exitCode } = await runCli([ 'collection', 'list' ]);

         expect(exitCode).toBe(0);
         // Either shows collections or "No collections configured"
         expect(stdout.length).toBeGreaterThan(0);
      });

      it('outputs JSON with --json flag', async () => {
         const { stdout, exitCode } = await runCli([ 'collection', 'list', '--json' ]);

         expect(exitCode).toBe(0);

         const data = JSON.parse(stdout);

         expect(Array.isArray(data)).toBe(true);
      });
   });
});

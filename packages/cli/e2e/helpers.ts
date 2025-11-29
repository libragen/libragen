/**
 * E2E Test Helpers
 *
 * Shared utilities for end-to-end CLI tests.
 * All tests run in isolated environments via LIBRAGEN_HOME.
 */

import { spawn } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { fileURLToPath } from 'url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));

/** Path to built CLI entry point */
export const CLI_PATH = path.resolve(currentDir, '../dist/index.js');

/** Path to core test fixtures */
export const FIXTURES_DIR = path.resolve(currentDir, '../../core/src/__tests__/fixtures');

/**
 * Isolated test environment configuration.
 */
export interface TestEnv {

   /** LIBRAGEN_HOME - isolated config/libraries/cache */
   home: string;

   /** LIBRAGEN_MODEL_CACHE - shared to avoid re-downloads */
   modelCache: string;

   /** Working directory for test files */
   workDir: string;
}

/**
 * Result from running a CLI command.
 */
export interface CliResult {
   stdout: string;
   stderr: string;
   exitCode: number;
}

/**
 * Options for running CLI commands.
 */
export interface RunOptions {

   /** Working directory for the command */
   cwd?: string;

   /** Additional environment variables */
   env?: Record<string, string>;

   /** Timeout in milliseconds (default: 120000) */
   timeout?: number;
}

/**
 * Options for building a test library.
 */
export interface BuildOptions {

   /** Library name */
   name?: string;

   /** Library version */
   version?: string;

   /** Description */
   description?: string;

   /** Content version */
   contentVersion?: string;

   /** Agent description */
   agentDescription?: string;

   /** Include patterns */
   patterns?: string[];

   /** Output path (relative to workDir) */
   output?: string;
}

/**
 * Create an isolated test environment.
 *
 * Creates temp directories and returns config for isolated CLI execution.
 * Call cleanupTestEnv() when done.
 */
export async function createTestEnv(): Promise<TestEnv> {
   const home = await fs.mkdtemp(path.join(os.tmpdir(), 'libragen-e2e-'));

   const workDir = path.join(home, 'workspace');

   const librariesDir = path.join(home, 'libraries');

   await fs.mkdir(workDir, { recursive: true });
   await fs.mkdir(librariesDir, { recursive: true });

   // Share model cache to avoid re-downloads during tests
   // Falls back to a shared temp location if not set
   const modelCache =
      // eslint-disable-next-line no-process-env
      process.env.LIBRAGEN_MODEL_CACHE ||
      path.join(os.tmpdir(), 'libragen-model-cache');

   await fs.mkdir(modelCache, { recursive: true });

   return { home, modelCache, workDir };
}

/**
 * Clean up test environment.
 */
export async function cleanupTestEnv(env: TestEnv): Promise<void> {
   try {
      await fs.rm(env.home, { recursive: true, force: true });
   } catch{
      // Ignore cleanup errors
   }
}

/**
 * Run a CLI command in an isolated environment.
 */
export function runCli(
   args: string[],
   env: TestEnv,
   options: RunOptions = {}
): Promise<CliResult> {
   const timeout = options.timeout ?? 120000;

   const cwd = options.cwd ?? env.workDir;

   return new Promise((resolve, reject) => {
      const proc = spawn('node', [ CLI_PATH, ...args ], {
         cwd,
         env: {
            // eslint-disable-next-line no-process-env
            ...process.env,
            NO_COLOR: '1',
            LIBRAGEN_HOME: env.home,
            LIBRAGEN_MODEL_CACHE: env.modelCache,
            ...options.env,
         },
      });

      let stdout = '',
          stderr = '';

      proc.stdout.on('data', (data) => {
         stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
         stderr += data.toString();
      });

      const timer = setTimeout(() => {
         proc.kill('SIGTERM');
         reject(new Error(`CLI command timed out after ${timeout}ms: ${args.join(' ')}`));
      }, timeout);

      proc.on('close', (code) => {
         clearTimeout(timer);
         resolve({ stdout, stderr, exitCode: code ?? 0 });
      });

      proc.on('error', (err) => {
         clearTimeout(timer);
         reject(err);
      });
   });
}

/**
 * Parse JSON from CLI stdout.
 */
export function parseJson<T>(stdout: string): T {
   // Strip any non-JSON prefix (e.g., spinner output)
   const jsonStart = stdout.indexOf('{');

   const jsonArrayStart = stdout.indexOf('[');

   let start = -1;

   if (jsonStart >= 0 && jsonArrayStart >= 0) {
      start = Math.min(jsonStart, jsonArrayStart);
   } else if (jsonStart >= 0) {
      start = jsonStart;
   } else if (jsonArrayStart >= 0) {
      start = jsonArrayStart;
   }

   if (start < 0) {
      throw new Error(`No JSON found in output: ${stdout.slice(0, 200)}`);
   }

   return JSON.parse(stdout.slice(start)) as T;
}

/**
 * Build a test library from fixtures.
 *
 * @returns Path to the built library file
 */
export async function buildTestLibrary(
   env: TestEnv,
   options: BuildOptions = {}
): Promise<string> {
   const name = options.name ?? 'test-lib';

   const output = options.output ?? `${name}.libragen`;

   const outputPath = path.join(env.workDir, output);

   const args = [ 'build', FIXTURES_DIR, '-o', outputPath ];

   if (options.name) {
      args.push('-n', options.name);
   }

   if (options.version) {
      args.push('-v', options.version);
   }

   if (options.description) {
      args.push('-d', options.description);
   }

   if (options.contentVersion) {
      args.push('--content-version', options.contentVersion);
   }

   if (options.agentDescription) {
      args.push('--agent-description', options.agentDescription);
   }

   if (options.patterns) {
      args.push('-p', ...options.patterns);
   }

   const result = await runCli(args, env);

   if (result.exitCode !== 0) {
      throw new Error(`Failed to build library: ${result.stderr}\n${result.stdout}`);
   }

   return outputPath;
}

/**
 * Check if remote tests should run.
 *
 * Controlled by RUN_REMOTE_TESTS env var (default: true).
 */
export function shouldRunRemoteTests(): boolean {
   // eslint-disable-next-line no-process-env
   const envValue = process.env.RUN_REMOTE_TESTS;

   if (envValue === undefined) {
      return true; // Default to running remote tests
   }

   return envValue.toLowerCase() !== 'false' && envValue !== '0';
}

/**
 * Wait for a file to exist.
 */
export async function waitForFile(filePath: string, timeoutMs: number = 5000): Promise<void> {
   const start = Date.now();

   while (Date.now() - start < timeoutMs) {
      try {
         await fs.access(filePath);
         return;
      } catch{
         await new Promise((r) => { return setTimeout(r, 100); });
      }
   }

   throw new Error(`File not found after ${timeoutMs}ms: ${filePath}`);
}

/**
 * Create a project directory with .libragen/libraries structure.
 */
export async function createProjectDir(env: TestEnv, name: string): Promise<string> {
   const projectDir = path.join(env.workDir, name);

   const libDir = path.join(projectDir, '.libragen', 'libraries');

   await fs.mkdir(libDir, { recursive: true });

   return projectDir;
}

/**
 * Get the libraries directory for a project.
 */
export function getProjectLibDir(projectDir: string): string {
   return path.join(projectDir, '.libragen', 'libraries');
}

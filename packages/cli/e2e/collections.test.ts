/**
 * E2E Tests: Collection Workflows
 *
 * Tests collection management including create, pack, unpack, and install.
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
   type TestEnv,
} from './helpers.ts';

describe('E2E: Collection Workflows', () => {
   let env: TestEnv;

   beforeAll(async () => {
      env = await createTestEnv();
   }, 30000);

   afterAll(async () => {
      await cleanupTestEnv(env);
   });

   describe('Pack and Share Collection', () => {
      let apiDocsPath: string,
          tutorialsPath: string,
          collectionPath: string,
          packedPath: string;

      it('builds two libraries', async () => {
         apiDocsPath = await buildTestLibrary(env, {
            name: 'api-docs',
            version: '1.0.0',
            description: 'API documentation',
            output: 'api-docs.libragen',
         });

         tutorialsPath = await buildTestLibrary(env, {
            name: 'tutorials',
            version: '1.0.0',
            description: 'Tutorial guides',
            output: 'tutorials.libragen',
         });

         expect(await fs.stat(apiDocsPath)).toBeDefined();
         expect(await fs.stat(tutorialsPath)).toBeDefined();
      }, 240000);

      it('creates a collection file', async () => {
         collectionPath = path.join(env.workDir, 'my-collection.json');

         const { exitCode, stdout } = await runCli([
            'collection', 'create', collectionPath,
            '--name', 'My Collection',
            '--description', 'API docs and tutorials',
            '--library', apiDocsPath,
            '--library', tutorialsPath,
         ], env);

         expect(exitCode).toBe(0);
         expect(stdout).toContain('Created collection');

         // Verify file contents
         const content = await fs.readFile(collectionPath, 'utf-8');

         const collection = JSON.parse(content);

         expect(collection.name).toBe('My Collection');
         expect(collection.items.length).toBe(2);
      });

      it('packs the collection', async () => {
         packedPath = path.join(env.workDir, 'my-collection.libragen-collection');

         const { exitCode, stdout } = await runCli([
            'collection', 'pack', collectionPath,
            '-o', packedPath,
         ], env);

         expect(exitCode).toBe(0);
         expect(stdout).toContain('Packed collection');

         // Verify packed file exists
         const stats = await fs.stat(packedPath);

         expect(stats.size).toBeGreaterThan(0);
      });

      it('inspects the packed collection', async () => {
         const { exitCode, stdout } = await runCli([ 'inspect', packedPath ], env);

         expect(exitCode).toBe(0);
         expect(stdout).toContain('Collection Contents');
         expect(stdout).toContain('api-docs');
         expect(stdout).toContain('tutorials');
      });

      it('inspects packed collection with JSON', async () => {
         const { exitCode, stdout } = await runCli([ 'inspect', packedPath, '--json' ], env);

         expect(exitCode).toBe(0);

         type InspectResult = {
            type: string;
            metadata: { name: string; items?: Array<unknown> };
            libraries?: Array<{ name: string }>;
         };

         const data = parseJson<InspectResult>(stdout);

         // Type is 'collection' for packed collections too
         expect(data.type).toBe('collection');
         expect((data.libraries?.length ?? 0) || (data.metadata?.items?.length ?? 0)).toBeGreaterThan(0);
      });
   });

   describe('Receive and Install Collection', () => {
      let packedPath: string,
          unpackDir: string,
          collectionJsonPath: string;

      beforeAll(async () => {
         // Build and pack a fresh collection for this test
         const lib1 = await buildTestLibrary(env, {
            name: 'shared-lib-1',
            output: 'shared-lib-1.libragen',
         });

         const lib2 = await buildTestLibrary(env, {
            name: 'shared-lib-2',
            output: 'shared-lib-2.libragen',
         });

         const collPath = path.join(env.workDir, 'shared-collection.json');

         await runCli([
            'collection', 'create', collPath,
            '--library', lib1,
            '--library', lib2,
         ], env);

         packedPath = path.join(env.workDir, 'shared.libragen-collection');
         await runCli([ 'collection', 'pack', collPath, '-o', packedPath ], env);

         unpackDir = path.join(env.workDir, 'unpacked');
      }, 300000);

      it('unpacks the collection', async () => {
         const { exitCode, stdout } = await runCli([
            'collection', 'unpack', packedPath,
            '-o', unpackDir,
         ], env);

         expect(exitCode).toBe(0);
         expect(stdout).toContain('Unpacked collection');

         // Verify extracted files
         collectionJsonPath = path.join(unpackDir, 'collection.json');
         const content = await fs.readFile(collectionJsonPath, 'utf-8');

         const collection = JSON.parse(content);

         expect(collection.items.length).toBe(2);

         // Verify library files exist
         const files = await fs.readdir(unpackDir);

         expect(files).toContain('collection.json');
         expect(files.some((f) => { return f.endsWith('.libragen'); })).toBe(true);
      });

      it('installs the collection', async () => {
         const { exitCode, stdout } = await runCli([
            'install', collectionJsonPath,
         ], env);

         expect(exitCode).toBe(0);
         // Should install both libraries
         expect(stdout.toLowerCase()).toMatch(/shared-lib-1|installed/);
      });

      it('lists shows both libraries', async () => {
         const { exitCode, stdout } = await runCli([ 'list', '--json' ], env);

         expect(exitCode).toBe(0);

         const data = parseJson<{ libraries: Array<{ name: string }> }>(stdout);

         const names = data.libraries.map((l) => { return l.name; });

         expect(names).toContain('shared-lib-1');
         expect(names).toContain('shared-lib-2');
      });
   });

   describe('Collection Config Management', () => {
      it('lists collections (initially empty)', async () => {
         const { exitCode, stdout } = await runCli([ 'collection', 'list' ], env);

         expect(exitCode).toBe(0);
         // Either shows collections or indicates none configured
         expect(stdout.length).toBeGreaterThan(0);
      });

      it('lists collections as JSON', async () => {
         const { exitCode, stdout } = await runCli([ 'collection', 'list', '--json' ], env);

         expect(exitCode).toBe(0);

         const data = parseJson<Array<{ name: string }>>(stdout);

         expect(Array.isArray(data)).toBe(true);
      });

      it('adds a collection', async () => {
         const { exitCode, stdout } = await runCli([
            'collection', 'add', 'test-collection', 'https://example.com/collection.json',
         ], env);

         expect(exitCode).toBe(0);
         expect(stdout).toContain('Added collection');
      });

      it('lists shows the added collection', async () => {
         const { exitCode, stdout } = await runCli([ 'collection', 'list', '--json' ], env);

         expect(exitCode).toBe(0);

         const data = parseJson<Array<{ name: string; url: string }>>(stdout);

         expect(data.some((c) => { return c.name === 'test-collection'; })).toBe(true);
      });

      it('removes the collection', async () => {
         const { exitCode, stdout } = await runCli([
            'collection', 'remove', 'test-collection',
         ], env);

         expect(exitCode).toBe(0);
         expect(stdout).toContain('Removed collection');
      });

      it('lists shows collection removed', async () => {
         const { exitCode, stdout } = await runCli([ 'collection', 'list', '--json' ], env);

         expect(exitCode).toBe(0);

         const data = parseJson<Array<{ name: string }>>(stdout);

         expect(data.some((c) => { return c.name === 'test-collection'; })).toBe(false);
      });
   });

   describe('Create Collection Template', () => {
      it('creates a template when no libraries specified', async () => {
         const templatePath = path.join(env.workDir, 'template-collection.json');

         const { exitCode, stdout } = await runCli([
            'collection', 'create', templatePath,
         ], env);

         expect(exitCode).toBe(0);
         expect(stdout).toContain('template');

         // Verify template content
         const content = await fs.readFile(templatePath, 'utf-8');

         const template = JSON.parse(content);

         expect(template.items).toBeDefined();
         expect(template.items.length).toBeGreaterThan(0);
         expect(template.items[0].library).toContain('example.com');
      });
   });

   describe('Collection Clear Cache', () => {
      it('clears the collection cache', async () => {
         const { exitCode, stdout } = await runCli([ 'collection', 'clear-cache' ], env);

         expect(exitCode).toBe(0);
         expect(stdout).toContain('cache cleared');
      });
   });
});

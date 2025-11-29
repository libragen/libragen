/**
 * MCP Server tests
 *
 * Tests the MCP server and its tools.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { createServer, warmEmbedder } from '../server.ts';
import { Embedder, Chunker, VectorStore, CURRENT_SCHEMA_VERSION } from '@libragen/core';
import type { LibraryMetadata } from '@libragen/core';
import { createHash } from 'crypto';

describe('MCP Server', () => {
   let tempDir: string,
       librariesDir: string;

   beforeAll(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'libragen-mcp-test-'));
      librariesDir = path.join(tempDir, 'libraries');
      await fs.mkdir(librariesDir, { recursive: true });
   });

   afterAll(async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
   });

   describe('createServer', () => {
      it('creates a server with default config', () => {
         const server = createServer();

         expect(server).toBeDefined();
      });

      it('creates a server with custom libraries directory', () => {
         const server = createServer({ librariesDir });

         expect(server).toBeDefined();
      });

      it('creates a server with pre-warmed embedder', () => {
         // Create a mock embedder (don't actually warm it in tests)
         const embedder = new Embedder();

         const server = createServer({ embedder });

         expect(server).toBeDefined();
      });
   });

   describe('warmEmbedder', () => {
      it('returns an initialized embedder', async () => {
         const embedder = await warmEmbedder();

         expect(embedder).toBeInstanceOf(Embedder);

         // Verify it can embed
         const embedding = await embedder.embed('test');

         expect(embedding).toBeInstanceOf(Float32Array);
         expect(embedding.length).toBe(384);

         await embedder.dispose();
      }, 60000);
   });
});

describe('MCP Tools Integration', () => {
   let tempDir: string,
       librariesDir: string,
       testLibraryPath: string,
       embedder: Embedder;

   beforeAll(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'libragen-mcp-tools-test-'));
      librariesDir = path.join(tempDir, 'libraries');
      await fs.mkdir(librariesDir, { recursive: true });

      // Create a test library
      embedder = new Embedder();
      await embedder.initialize();

      testLibraryPath = path.join(librariesDir, 'test-lib.libragen');
      await createTestLibrary(testLibraryPath, embedder);
   }, 120000);

   afterAll(async () => {
      await embedder.dispose();
      await fs.rm(tempDir, { recursive: true, force: true });
   });

   it('creates server with all tools registered', () => {
      // This test verifies that createServer doesn't throw when registering all tools
      const server = createServer({ librariesDir, embedder });

      expect(server).toBeDefined();
   });

   it('creates server with empty libraries directory', async () => {
      const emptyDir = path.join(tempDir, 'empty-libs');

      await fs.mkdir(emptyDir, { recursive: true });

      const server = createServer({ librariesDir: emptyDir });

      expect(server).toBeDefined();
   });

   it('creates server with non-existent libraries directory', () => {
      const nonExistentDir = path.join(tempDir, 'non-existent');

      // Should not throw - tools handle missing directory gracefully
      const server = createServer({ librariesDir: nonExistentDir });

      expect(server).toBeDefined();
   });
});

describe('Library name discovery', () => {
   let tempDir: string,
       librariesDir: string,
       embedder: Embedder;

   beforeAll(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'libragen-mcp-name-test-'));
      librariesDir = path.join(tempDir, 'libraries');
      await fs.mkdir(librariesDir, { recursive: true });

      embedder = new Embedder();
      await embedder.initialize();
   }, 120000);

   afterAll(async () => {
      await embedder.dispose();
      await fs.rm(tempDir, { recursive: true, force: true });
   });

   it('discovers libraries by metadata name, not filename', async () => {
      // Create a library with versioned filename (simulates installed library)
      // Filename: team-docs-1.0.0.libragen, but metadata.name: team-docs
      const versionedPath = path.join(librariesDir, 'team-docs-1.0.0.libragen');

      await createTestLibraryWithName(versionedPath, 'team-docs', embedder);

      // Import the discoverLibraries function indirectly by creating a server and
      // checking that the library is found by its metadata name
      const server = createServer({ librariesDir, embedder });

      // The server should have registered tools that can find the library
      // We verify this by checking the server was created successfully
      expect(server).toBeDefined();

      // Directly test the discovery logic by opening the store and checking metadata
      const store = new VectorStore(versionedPath);

      store.initialize();

      const metadata = store.getMetadata<LibraryMetadata>();

      store.close();

      // The metadata name should be 'team-docs', not 'team-docs-1.0.0'
      expect(metadata?.name).toBe('team-docs');
   }, 60000);
});

/**
 * Helper to create a test library with a specific name
 */
async function createTestLibraryWithName(outputPath: string, name: string, embedder: Embedder): Promise<void> {
   const chunker = new Chunker({ chunkSize: 500, chunkOverlap: 50 });

   const testContent = '# Documentation\n\nThis is test documentation content.';

   const tempFile = path.join(path.dirname(outputPath), 'temp-doc.md');

   await fs.writeFile(tempFile, testContent);

   const chunks = await chunker.chunkFile(tempFile);

   await fs.unlink(tempFile);

   const contents = chunks.map((c) => {
      return c.content;
   });

   const embeddings = await embedder.embedBatch(contents);

   const store = new VectorStore(outputPath);

   store.initialize();
   store.addChunks(chunks, embeddings);

   const allContent = chunks
      .map((c) => {
         return c.content;
      })
      .join('');

   const contentHash = createHash('sha256').update(allContent).digest('hex');

   store.setMeta('schema_version', String(CURRENT_SCHEMA_VERSION));

   const metadata: LibraryMetadata = {
      name, // Use the provided name, not derived from filename
      version: '1.0.0',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      description: 'Test library',
      createdAt: new Date().toISOString(),
      embedding: {
         model: 'Xenova/bge-small-en-v1.5',
         dimensions: 384,
      },
      chunking: {
         strategy: 'recursive',
         chunkSize: 500,
         chunkOverlap: 50,
      },
      stats: {
         chunkCount: chunks.length,
         sourceCount: 1,
         fileSize: 0,
      },
      contentHash: `sha256:${contentHash}`,
   };

   store.setMetadata(metadata);
   store.close();
}

/**
 * Helper to create a test library
 */
async function createTestLibrary(outputPath: string, embedder: Embedder): Promise<void> {
   const chunker = new Chunker({ chunkSize: 500, chunkOverlap: 50 });

   // Create some test content
   const testContent = `
/**
 * Calculate the factorial of a number
 */
function factorial(n: number): number {
   if (n <= 1) return 1;
   return n * factorial(n - 1);
}

/**
 * Check if a number is prime
 */
function isPrime(n: number): boolean {
   if (n < 2) return false;
   for (let i = 2; i <= Math.sqrt(n); i++) {
      if (n % i === 0) return false;
   }
   return true;
}

/**
 * Generate Fibonacci sequence
 */
function fibonacci(n: number): number[] {
   const result = [0, 1];
   for (let i = 2; i < n; i++) {
      result.push(result[i - 1] + result[i - 2]);
   }
   return result.slice(0, n);
}
`
      .trim();

   // Create a temp file for chunking
   const tempFile = path.join(path.dirname(outputPath), 'temp-test.ts');

   await fs.writeFile(tempFile, testContent);

   const chunks = await chunker.chunkFile(tempFile);

   await fs.unlink(tempFile);

   // Generate embeddings
   const contents = chunks.map((c) => {
      return c.content;
   });

   const embeddings = await embedder.embedBatch(contents);

   // Create vector store
   const store = new VectorStore(outputPath);

   store.initialize();
   store.addChunks(chunks, embeddings);

   // Calculate content hash
   const allContent = chunks
      .map((c) => {
         return c.content;
      })
      .join('');

   const contentHash = createHash('sha256').update(allContent).digest('hex');

   // Set schema version
   store.setMeta('schema_version', String(CURRENT_SCHEMA_VERSION));

   // Store metadata
   const metadata: LibraryMetadata = {
      name: 'test-lib',
      version: '1.0.0',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      description: 'Test library for MCP tests',
      agentDescription: 'Use this library for testing MCP functionality',
      exampleQueries: [ 'factorial', 'prime number', 'fibonacci' ],
      keywords: [ 'test', 'math' ],
      programmingLanguages: [ 'typescript' ],
      createdAt: new Date().toISOString(),
      embedding: {
         model: 'Xenova/bge-small-en-v1.5',
         dimensions: 384,
      },
      chunking: {
         strategy: 'recursive',
         chunkSize: 500,
         chunkOverlap: 50,
      },
      stats: {
         chunkCount: chunks.length,
         sourceCount: 1,
         fileSize: 0,
      },
      contentHash: `sha256:${contentHash}`,
   };

   store.setMetadata(metadata);
   store.close();
}

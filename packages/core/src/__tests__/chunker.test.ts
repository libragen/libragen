import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Chunker } from '../chunker.js';
import type { Chunk } from '../chunker.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

describe('Chunker', () => {
   let chunker: Chunker,
       tempDir: string;

   beforeEach(async () => {
      chunker = new Chunker();
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'chunker-test-'));
   });

   afterEach(async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
   });

   describe('constructor', () => {
      it('uses default configuration when none provided', () => {
         const c = new Chunker();

         expect(c.chunkSize).toBe(1500);
         expect(c.chunkOverlap).toBe(200);
      });

      it('accepts custom configuration', () => {
         const c = new Chunker({
            chunkSize: 1000,
            chunkOverlap: 100,
         });

         expect(c.chunkSize).toBe(1000);
         expect(c.chunkOverlap).toBe(100);
      });
   });

   describe('isSupported', () => {
      it('returns true for JavaScript files', () => {
         expect(Chunker.isSupported('test.js')).toBe(true);
         expect(Chunker.isSupported('test.ts')).toBe(true);
         expect(Chunker.isSupported('test.tsx')).toBe(true);
      });

      it('returns true for Python files', () => {
         expect(Chunker.isSupported('test.py')).toBe(true);
      });

      it('returns true for Markdown files', () => {
         expect(Chunker.isSupported('README.md')).toBe(true);
         expect(Chunker.isSupported('test.mdx')).toBe(true);
      });

      it('returns true for text files', () => {
         expect(Chunker.isSupported('test.txt')).toBe(true);
         expect(Chunker.isSupported('test.json')).toBe(true);
         expect(Chunker.isSupported('test.yaml')).toBe(true);
      });

      it('returns false for unsupported files', () => {
         expect(Chunker.isSupported('test.bin')).toBe(false);
         expect(Chunker.isSupported('test.exe')).toBe(false);
         expect(Chunker.isSupported('test.jpg')).toBe(false);
      });
   });

   describe('detectLanguage', () => {
      it('detects JavaScript for .js files', () => {
         expect(Chunker.detectLanguage('test.js')).toBe('js');
      });

      it('detects Python for .py files', () => {
         expect(Chunker.detectLanguage('test.py')).toBe('python');
      });

      it('detects Markdown for .md files', () => {
         expect(Chunker.detectLanguage('README.md')).toBe('markdown');
      });

      it('detects text for plain text extensions', () => {
         expect(Chunker.detectLanguage('test.txt')).toBe('text');
         expect(Chunker.detectLanguage('test.json')).toBe('text');
      });

      it('returns undefined for unsupported files', () => {
         expect(Chunker.detectLanguage('test.bin')).toBeUndefined();
      });
   });

   describe('chunkText', () => {
      it('returns chunks for small content', async () => {
         const content = 'Hello, world!';

         const chunks = await chunker.chunkText(content, 'test.txt');

         expect(chunks.length).toBeGreaterThan(0);
         expect(chunks[0].content).toBe(content);
      });

      it('includes source file in metadata', async () => {
         const chunks = await chunker.chunkText('test', 'src/test.js');

         expect(chunks[0].metadata.sourceFile).toBe('src/test.js');
      });

      it('detects language from extension', async () => {
         const chunks = await chunker.chunkText('const x = 1;', 'test.js');

         expect(chunks[0].metadata.language).toBe('js');
      });

      it('tracks line numbers', async () => {
         const content = 'line1\nline2\nline3';

         const chunks = await chunker.chunkText(content, 'test.txt');

         expect(chunks[0].metadata.startLine).toBe(1);
      });

      it('splits large content into multiple chunks', async () => {
         // Create content larger than default chunk size
         const lines = Array.from({ length: 200 }, (_, i) => {
            return `// This is line ${i + 1} with some additional content to make it longer`;
         });

         const content = lines.join('\n');

         const smallChunker = new Chunker({ chunkSize: 500, chunkOverlap: 50 });

         const chunks = await smallChunker.chunkText(content, 'test.js');

         expect(chunks.length).toBeGreaterThan(1);
      });
   });

   describe('chunkFile', () => {
      it('chunks a file from the filesystem', async () => {
         const filePath = path.join(tempDir, 'test.js');

         await fs.writeFile(filePath, 'const x = 1;');

         const chunks = await chunker.chunkFile(filePath);

         expect(chunks.length).toBe(1);
         expect(chunks[0].content).toBe('const x = 1;');
         expect(chunks[0].metadata.sourceFile).toBe(filePath);
      });

      it('throws for non-existent file', async () => {
         const filePath = path.join(tempDir, 'nonexistent.js');

         await expect(chunker.chunkFile(filePath)).rejects.toThrow();
      });
   });

   describe('chunkDirectory', () => {
      it('chunks all matching files in a directory', async () => {
         // Create test files
         await fs.writeFile(path.join(tempDir, 'a.js'), 'const a = 1;');
         await fs.writeFile(path.join(tempDir, 'b.ts'), 'const b = 2;');
         await fs.writeFile(path.join(tempDir, 'c.md'), '# Hello');

         const chunks = await chunker.chunkDirectory(tempDir);

         expect(chunks.length).toBe(3);

         const contents = chunks.map((c: Chunk) => {
            return c.content;
         });

         expect(contents).toContain('const a = 1;');
         expect(contents).toContain('const b = 2;');
         expect(contents).toContain('# Hello');
      });

      it('respects custom patterns', async () => {
         await fs.writeFile(path.join(tempDir, 'a.js'), 'const a = 1;');
         await fs.writeFile(path.join(tempDir, 'b.ts'), 'const b = 2;');

         const chunks = await chunker.chunkDirectory(tempDir, {
            patterns: [ '**/*.js' ],
         });

         expect(chunks.length).toBe(1);
         expect(chunks[0].content).toBe('const a = 1;');
      });

      it('respects ignore patterns', async () => {
         await fs.writeFile(path.join(tempDir, 'keep.js'), 'const keep = 1;');
         await fs.mkdir(path.join(tempDir, 'node_modules'));
         await fs.writeFile(path.join(tempDir, 'node_modules', 'ignore.js'), 'const ignore = 1;');

         const chunks = await chunker.chunkDirectory(tempDir);

         const contents = chunks.map((c: Chunk) => {
            return c.content;
         });

         expect(contents).toContain('const keep = 1;');
         expect(contents.includes('const ignore = 1;')).toBe(false);
      });

      it('handles nested directories', async () => {
         await fs.mkdir(path.join(tempDir, 'src'));
         await fs.writeFile(path.join(tempDir, 'src', 'index.js'), 'const index = 1;');

         const chunks = await chunker.chunkDirectory(tempDir);

         expect(chunks.length).toBe(1);
         expect(chunks[0].content).toBe('const index = 1;');
      });

      it('returns empty array for empty directory', async () => {
         const chunks = await chunker.chunkDirectory(tempDir);

         expect(chunks).toEqual([]);
      });
   });
});

/**
 * Tests for the FileSource class
 */

/* eslint-disable @silvermine/silvermine/fluent-chaining */
/* eslint-disable @silvermine/silvermine/call-indentation */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { FileSource } from '../../sources/files.js';

describe('FileSource', () => {
   let tempDir: string,
       fileSource: FileSource;

   beforeEach(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'libragen-filesource-test-'));
      fileSource = new FileSource();
   });

   afterEach(async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
   });

   describe('getFiles', () => {
      it('reads files from a directory', async () => {
         // Create test files
         await fs.writeFile(path.join(tempDir, 'file1.ts'), 'const x = 1;');
         await fs.writeFile(path.join(tempDir, 'file2.ts'), 'const y = 2;');

         const files = await fileSource.getFiles({
            paths: [ tempDir ],
            patterns: [ '**/*.ts' ],
         });

         expect(files).toHaveLength(2);
         expect(files.map((f) => {
            return path.basename(f.path);
         })
            .sort())
            .toEqual([ 'file1.ts', 'file2.ts' ]);
      });

      it('reads a single file', async () => {
         const filePath = path.join(tempDir, 'single.ts');

         await fs.writeFile(filePath, 'export const value = 42;');

         const files = await fileSource.getFiles({
            paths: [ filePath ],
         });

         expect(files).toHaveLength(1);
         expect(files[0].content).toBe('export const value = 42;');
         expect(files[0].path).toBe(filePath);
      });

      it('applies ignore patterns', async () => {
         await fs.mkdir(path.join(tempDir, 'node_modules'), { recursive: true });
         await fs.writeFile(path.join(tempDir, 'src.ts'), 'source');
         await fs.writeFile(path.join(tempDir, 'node_modules', 'dep.ts'), 'dependency');

         const files = await fileSource.getFiles({
            paths: [ tempDir ],
            patterns: [ '**/*.ts' ],
         });

         expect(files).toHaveLength(1);
         expect(files[0].relativePath).toBe('src.ts');
      });

      it('respects custom ignore patterns', async () => {
         await fs.mkdir(path.join(tempDir, 'generated'), { recursive: true });
         await fs.writeFile(path.join(tempDir, 'src.ts'), 'source');
         await fs.writeFile(path.join(tempDir, 'generated', 'gen.ts'), 'generated');

         const files = await fileSource.getFiles({
            paths: [ tempDir ],
            patterns: [ '**/*.ts' ],
            ignore: [ '**/generated/**' ],
         });

         expect(files).toHaveLength(1);
         expect(files[0].relativePath).toBe('src.ts');
      });

      it('skips files larger than maxFileSize', async () => {
         await fs.writeFile(path.join(tempDir, 'small.ts'), 'small');
         await fs.writeFile(path.join(tempDir, 'large.ts'), 'x'.repeat(1000));

         const files = await fileSource.getFiles({
            paths: [ tempDir ],
            patterns: [ '**/*.ts' ],
            maxFileSize: 100,
         });

         expect(files).toHaveLength(1);
         expect(files[0].relativePath).toBe('small.ts');
      });

      it('handles nested directories', async () => {
         await fs.mkdir(path.join(tempDir, 'src', 'utils'), { recursive: true });
         await fs.writeFile(path.join(tempDir, 'src', 'index.ts'), 'index');
         await fs.writeFile(path.join(tempDir, 'src', 'utils', 'helper.ts'), 'helper');

         const files = await fileSource.getFiles({
            paths: [ tempDir ],
            patterns: [ '**/*.ts' ],
         });

         expect(files).toHaveLength(2);
         expect(files.map((f) => {
            return f.relativePath;
         })
            .sort())
            .toEqual([ 'src/index.ts', 'src/utils/helper.ts' ]);
      });

      it('handles multiple input paths', async () => {
         const dir1 = path.join(tempDir, 'dir1'),
               dir2 = path.join(tempDir, 'dir2');

         await fs.mkdir(dir1);
         await fs.mkdir(dir2);
         await fs.writeFile(path.join(dir1, 'a.ts'), 'a');
         await fs.writeFile(path.join(dir2, 'b.ts'), 'b');

         const files = await fileSource.getFiles({
            paths: [ dir1, dir2 ],
            patterns: [ '**/*.ts' ],
         });

         expect(files).toHaveLength(2);
      });

      it('skips nonexistent paths', async () => {
         await fs.writeFile(path.join(tempDir, 'exists.ts'), 'exists');

         const files = await fileSource.getFiles({
            paths: [ tempDir, '/nonexistent/path' ],
            patterns: [ '**/*.ts' ],
         });

         expect(files).toHaveLength(1);
      });

      it('includes file metadata', async () => {
         const filePath = path.join(tempDir, 'meta.ts');

         await fs.writeFile(filePath, 'const meta = true;');

         const files = await fileSource.getFiles({
            paths: [ tempDir ],
            patterns: [ '**/*.ts' ],
         });

         expect(files).toHaveLength(1);
         expect(files[0].size).toBeGreaterThan(0);
         expect(files[0].modifiedAt).toBeInstanceOf(Date);
         expect(files[0].language).toBe('typescript');
      });

      it('uses default patterns when none specified', async () => {
         await fs.writeFile(path.join(tempDir, 'code.ts'), 'typescript');
         await fs.writeFile(path.join(tempDir, 'doc.md'), 'markdown');
         await fs.writeFile(path.join(tempDir, 'data.json'), '{}');
         await fs.writeFile(path.join(tempDir, 'unknown.xyz'), 'unknown');

         const files = await fileSource.getFiles({
            paths: [ tempDir ],
         });

         // Should include ts, md, json but not xyz
         expect(files).toHaveLength(3);
         expect(files.map((f) => {
            return path.extname(f.path);
         })
            .sort())
            .toEqual([ '.json', '.md', '.ts' ]);
      });
   });

   describe('getFile', () => {
      it('reads a single file', async () => {
         const filePath = path.join(tempDir, 'single.ts');

         await fs.writeFile(filePath, 'export const x = 1;');

         const file = await fileSource.getFile(filePath);

         expect(file).not.toBeNull();
         expect(file?.content).toBe('export const x = 1;');
         expect(file?.language).toBe('typescript');
      });

      it('returns null for nonexistent file', async () => {
         const file = await fileSource.getFile('/nonexistent/file.ts');

         expect(file).toBeNull();
      });
   });

   describe('exists', () => {
      it('returns true for existing file', async () => {
         const filePath = path.join(tempDir, 'exists.ts');

         await fs.writeFile(filePath, 'content');

         expect(await fileSource.exists(filePath)).toBe(true);
      });

      it('returns false for nonexistent file', async () => {
         expect(await fileSource.exists('/nonexistent/file.ts')).toBe(false);
      });

      it('returns false for directory', async () => {
         expect(await fileSource.exists(tempDir)).toBe(false);
      });
   });

   describe('detectLanguage', () => {
      it('detects TypeScript', () => {
         expect(FileSource.detectLanguage('file.ts')).toBe('typescript');
         expect(FileSource.detectLanguage('file.tsx')).toBe('typescript');
      });

      it('detects JavaScript', () => {
         expect(FileSource.detectLanguage('file.js')).toBe('javascript');
         expect(FileSource.detectLanguage('file.jsx')).toBe('javascript');
         expect(FileSource.detectLanguage('file.mjs')).toBe('javascript');
      });

      it('detects Python', () => {
         expect(FileSource.detectLanguage('file.py')).toBe('python');
      });

      it('detects Rust', () => {
         expect(FileSource.detectLanguage('file.rs')).toBe('rust');
      });

      it('detects Markdown', () => {
         expect(FileSource.detectLanguage('file.md')).toBe('markdown');
         expect(FileSource.detectLanguage('file.mdx')).toBe('markdown');
      });

      it('returns undefined for unknown extensions', () => {
         expect(FileSource.detectLanguage('file.xyz')).toBeUndefined();
      });

      it('handles case insensitivity', () => {
         expect(FileSource.detectLanguage('file.TS')).toBe('typescript');
         expect(FileSource.detectLanguage('file.PY')).toBe('python');
      });
   });
});

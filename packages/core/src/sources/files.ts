/**
 * File source handler - Read local files with glob pattern support
 *
 * Provides a unified interface for reading files from the local filesystem
 * with support for glob patterns, filtering, and metadata extraction.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import fg from 'fast-glob';

export interface SourceFile {

   /** Absolute path to the file */
   path: string;

   /** Relative path from the source root */
   relativePath: string;

   /** File content as string */
   content: string;

   /** File size in bytes */
   size: number;

   /** Last modified timestamp */
   modifiedAt: Date;

   /** Detected language/type based on extension */
   language?: string;
}

export interface FileSourceOptions {

   /** File paths or directories to include */
   paths: string[];

   /** Glob patterns to include (default: common code/doc files) */
   patterns?: string[];

   /** Glob patterns to ignore */
   ignore?: string[];

   /** Whether to use default ignore patterns (default: true) */
   useDefaultIgnore?: boolean;

   /** Maximum file size in bytes to include (default: 1MB) */
   maxFileSize?: number;
}

/**
 * Map of file extensions to language identifiers
 */
const EXTENSION_TO_LANGUAGE: Record<string, string> = {
   '.js': 'javascript',
   '.mjs': 'javascript',
   '.cjs': 'javascript',
   '.jsx': 'javascript',
   '.ts': 'typescript',
   '.tsx': 'typescript',
   '.mts': 'typescript',
   '.cts': 'typescript',
   '.py': 'python',
   '.go': 'go',
   '.java': 'java',
   '.rs': 'rust',
   '.rb': 'ruby',
   '.cpp': 'cpp',
   '.cc': 'cpp',
   '.cxx': 'cpp',
   '.c': 'c',
   '.h': 'c',
   '.hpp': 'cpp',
   '.cs': 'csharp',
   '.php': 'php',
   '.swift': 'swift',
   '.scala': 'scala',
   '.kt': 'kotlin',
   '.kts': 'kotlin',
   '.md': 'markdown',
   '.mdx': 'markdown',
   '.html': 'html',
   '.htm': 'html',
   '.xml': 'xml',
   '.json': 'json',
   '.yaml': 'yaml',
   '.yml': 'yaml',
   '.toml': 'toml',
   '.sql': 'sql',
   '.sh': 'shell',
   '.bash': 'shell',
   '.zsh': 'shell',
   '.txt': 'text',
   '.rst': 'rst',
   '.tex': 'latex',
};

const DEFAULT_PATTERNS = [
   '**/*.{js,mjs,cjs,jsx,ts,tsx,mts,cts}',
   '**/*.{py,go,java,rs,rb,cpp,cc,c,h,hpp,cs,php,swift,scala,kt,kts}',
   '**/*.{md,mdx,txt,rst}',
   '**/*.{json,yaml,yml,toml}',
   '**/*.{sh,bash,zsh,sql}',
   '**/README*',
   '**/LICENSE*',
   '**/CHANGELOG*',
];

const DEFAULT_IGNORE = [
   '**/node_modules/**',
   '**/.git/**',
   '**/dist/**',
   '**/build/**',
   '**/.next/**',
   '**/__pycache__/**',
   '**/.venv/**',
   '**/venv/**',
   '**/target/**',
   '**/vendor/**',
   '**/*.min.js',
   '**/*.bundle.js',
   '**/package-lock.json',
   '**/yarn.lock',
   '**/pnpm-lock.yaml',
   '**/.DS_Store',
];

const DEFAULT_MAX_FILE_SIZE = 1024 * 1024; // 1MB

/**
 * File source handler for reading local files.
 */
export class FileSource {

   /**
    * Detect language from file extension.
    */
   public static detectLanguage(filePath: string): string | undefined {
      const ext = path.extname(filePath).toLowerCase();

      return EXTENSION_TO_LANGUAGE[ext];
   }

   /**
    * Get files from the specified paths with optional filtering.
    *
    * @param options - File source options
    * @returns Array of source files with content and metadata
    */
   public async getFiles(options: FileSourceOptions): Promise<SourceFile[]> {
      const patterns = options.patterns ?? DEFAULT_PATTERNS,
            useDefaults = options.useDefaultIgnore ?? true,
            defaultIgnore = useDefaults ? DEFAULT_IGNORE : [],
            ignore = [ ...defaultIgnore, ...(options.ignore ?? []) ],
            maxFileSize = options.maxFileSize ?? DEFAULT_MAX_FILE_SIZE;

      const allFiles: SourceFile[] = [];

      for (const inputPath of options.paths) {
         const absolutePath = path.resolve(inputPath);

         let stats;

         try {
            stats = await fs.stat(absolutePath);
         } catch(_e) {
            // Path doesn't exist, skip it
            continue;
         }

         if (stats.isFile()) {
            await this._processFile(absolutePath, absolutePath, maxFileSize, allFiles);
         } else if (stats.isDirectory()) {
            await this._processDirectory(absolutePath, patterns, ignore, maxFileSize, allFiles);
         }
      }

      return allFiles;
   }

   /**
    * Get a single file by path.
    *
    * @param filePath - Path to the file
    * @returns Source file or null if not found/readable
    */
   public async getFile(filePath: string): Promise<SourceFile | null> {
      const absolutePath = path.resolve(filePath);

      return this._readFile(absolutePath, path.dirname(absolutePath));
   }

   /**
    * Check if a path exists and is a file.
    */
   public async exists(filePath: string): Promise<boolean> {
      try {
         const stats = await fs.stat(filePath);

         return stats.isFile();
      } catch(_e) {
         return false;
      }
   }

   private async _processFile(
      filePath: string,
      basePath: string,
      maxFileSize: number,
      results: SourceFile[]
   ): Promise<void> {
      const stats = await fs.stat(filePath);

      if (stats.size > maxFileSize) {
         return;
      }

      const file = await this._readFile(filePath, basePath);

      if (file) {
         results.push(file);
      }
   }

   private async _processDirectory(
      dirPath: string,
      patterns: string[],
      ignore: string[],
      maxFileSize: number,
      results: SourceFile[]
   ): Promise<void> {
      const files = await fg(patterns, {
         cwd: dirPath,
         absolute: true,
         ignore,
         onlyFiles: true,
         stats: true,
      });

      for (const entry of files) {
         const filePath = typeof entry === 'string' ? entry : entry.path,
               fileStats = typeof entry === 'string' ? await fs.stat(entry) : entry.stats;

         if (fileStats && fileStats.size <= maxFileSize) {
            const file = await this._readFile(filePath, dirPath);

            if (file) {
               results.push(file);
            }
         }
      }
   }

   private async _readFile(filePath: string, basePath: string): Promise<SourceFile | null> {
      try {
         const [ content, stats ] = await Promise.all([
            fs.readFile(filePath, 'utf-8'),
            fs.stat(filePath),
         ]);

         return {
            path: filePath,
            relativePath: path.relative(basePath, filePath),
            content,
            size: stats.size,
            modifiedAt: stats.mtime,
            language: FileSource.detectLanguage(filePath),
         };
      } catch(_e) {
         // File can't be read (binary, permission issues, etc.)
         return null;
      }
   }

}

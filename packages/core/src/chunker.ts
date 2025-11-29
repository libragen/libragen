/**
 * Chunking module for language-aware text splitting
 *
 * Provides intelligent text splitting for code and documentation files
 * with language-specific handling and metadata tracking.
 */

import {
   RecursiveCharacterTextSplitter,
   type SupportedTextSplitterLanguage,
} from '@langchain/textsplitters';
import * as fs from 'fs/promises';
import * as path from 'path';
import fg from 'fast-glob';
import type { SourceFile } from './sources/files.ts';

export interface ChunkMetadata {
   sourceFile: string;
   startLine?: number;
   endLine?: number;
   language?: string;
}

export interface Chunk {
   content: string;
   metadata: ChunkMetadata;
}

export interface ChunkerConfig {
   chunkSize?: number;
   chunkOverlap?: number;
}

/**
 * Map of file extensions to LangChain splitter language identifiers
 */
const EXTENSION_TO_LANGUAGE: Record<string, SupportedTextSplitterLanguage> = {
   '.js': 'js',
   '.mjs': 'js',
   '.cjs': 'js',
   '.jsx': 'js',
   '.ts': 'js',
   '.tsx': 'js',
   '.mts': 'js',
   '.cts': 'js',
   '.py': 'python',
   '.go': 'go',
   '.java': 'java',
   '.rs': 'rust',
   '.rb': 'ruby',
   '.cpp': 'cpp',
   '.cc': 'cpp',
   '.cxx': 'cpp',
   '.c': 'cpp',
   '.h': 'cpp',
   '.hpp': 'cpp',
   '.php': 'php',
   '.swift': 'swift',
   '.scala': 'scala',
   '.md': 'markdown',
   '.mdx': 'markdown',
   '.html': 'html',
   '.htm': 'html',
   '.xml': 'html',
   '.tex': 'latex',
   '.sol': 'sol',
   '.proto': 'proto',
   '.rst': 'rst',
};

/**
 * File extensions that should be treated as plain text
 */
const TEXT_EXTENSIONS = new Set([
   '.txt',
   '.json',
   '.yaml',
   '.yml',
   '.toml',
   '.ini',
   '.cfg',
   '.conf',
   '.env',
   '.sh',
   '.bash',
   '.zsh',
   '.fish',
   '.ps1',
   '.bat',
   '.cmd',
   '.sql',
   '.graphql',
   '.gql',
]);

const DEFAULT_CHUNK_SIZE = 1500;

const DEFAULT_CHUNK_OVERLAP = 200;

export class Chunker {

   private readonly _config: Required<ChunkerConfig>;

   public constructor(config: ChunkerConfig = {}) {
      this._config = {
         chunkSize: config.chunkSize ?? DEFAULT_CHUNK_SIZE,
         chunkOverlap: config.chunkOverlap ?? DEFAULT_CHUNK_OVERLAP,
      };
   }

   /**
    * Check if a file extension is supported for chunking.
    */
   public static isSupported(filePath: string): boolean {
      const ext = path.extname(filePath).toLowerCase();

      return ext in EXTENSION_TO_LANGUAGE || TEXT_EXTENSIONS.has(ext);
   }

   /**
    * Get the detected language for a file.
    */
   public static detectLanguage(filePath: string): string | undefined {
      const ext = path.extname(filePath).toLowerCase();

      return EXTENSION_TO_LANGUAGE[ext] ?? (TEXT_EXTENSIONS.has(ext) ? 'text' : undefined);
   }

   public get chunkSize(): number {
      return this._config.chunkSize;
   }

   public get chunkOverlap(): number {
      return this._config.chunkOverlap;
   }

   /**
    * Chunk a single file's content.
    */
   public async chunkText(content: string, filePath: string): Promise<Chunk[]> {
      const ext = path.extname(filePath).toLowerCase(),
            language = EXTENSION_TO_LANGUAGE[ext],
            splitter = await this._createSplitter(language);

      const documents = await splitter.createDocuments([ content ]);

      return documents.map((doc: { pageContent: string }) => {
         const startLine = this._findLineNumber(content, doc.pageContent, 0);

         let endLine: number | undefined;

         if (startLine !== undefined) {
            endLine = startLine + doc.pageContent.split('\n').length - 1;
         }

         return {
            content: doc.pageContent,
            metadata: {
               sourceFile: filePath,
               startLine,
               endLine,
               language: language ?? this._detectLanguageFromExtension(ext),
            },
         };
      });
   }

   /**
    * Chunk a file from the filesystem.
    */
   public async chunkFile(filePath: string): Promise<Chunk[]> {
      const content = await fs.readFile(filePath, 'utf-8');

      return this.chunkText(content, filePath);
   }

   /**
    * Chunk an array of SourceFile objects.
    *
    * @param files - Array of SourceFile objects to chunk
    * @returns Array of chunks from all files
    */
   public async chunkSourceFiles(files: SourceFile[]): Promise<Chunk[]> {
      const allChunks: Chunk[] = [];

      for (const file of files) {
         try {
            const chunks = await this.chunkText(file.content, file.relativePath);

            allChunks.push(...chunks);
         } catch(_e) {
            // Skip files that can't be chunked
            continue;
         }
      }

      return allChunks;
   }

   /**
    * Chunk all matching files in a directory.
    *
    * @param options.patterns - Glob patterns to include (defaults to common code/doc)
    * @param options.ignore - Additional glob patterns to ignore (merged with defaults)
    * @param options.useDefaultIgnore - Whether to use default ignores (default: true)
    */
   public async chunkDirectory(
      dirPath: string,
      options: {
         patterns?: string[];
         ignore?: string[];
         useDefaultIgnore?: boolean;
      } = {}
   ): Promise<Chunk[]> {
      const patterns = options.patterns ?? this._getDefaultPatterns(),
            useDefaults = options.useDefaultIgnore ?? true,
            defaultIgnore = useDefaults ? this._getDefaultIgnore() : [],
            ignore = [ ...defaultIgnore, ...(options.ignore ?? []) ];

      const files = await fg(patterns, {
         cwd: dirPath,
         absolute: true,
         ignore,
         onlyFiles: true,
      });

      const allChunks: Chunk[] = [];

      for (const file of files) {
         try {
            const chunks = await this.chunkFile(file);

            allChunks.push(...chunks);
         } catch(_e) {
            // Skip files that can't be read (binary, permission issues, etc.)
            continue;
         }
      }

      return allChunks;
   }

   private async _createSplitter(
      language?: SupportedTextSplitterLanguage
   ): Promise<RecursiveCharacterTextSplitter> {
      if (language) {
         return RecursiveCharacterTextSplitter.fromLanguage(language, {
            chunkSize: this._config.chunkSize,
            chunkOverlap: this._config.chunkOverlap,
         });
      }

      return new RecursiveCharacterTextSplitter({
         chunkSize: this._config.chunkSize,
         chunkOverlap: this._config.chunkOverlap,
      });
   }

   private _findLineNumber(
      fullContent: string,
      chunk: string,
      startOffset: number
   ): number | undefined {
      const index = fullContent.indexOf(chunk, startOffset);

      if (index === -1) {
         return undefined;
      }

      // Count newlines before the chunk
      const beforeChunk = fullContent.substring(0, index),
            lineNumber = beforeChunk.split('\n').length;

      return lineNumber;
   }

   private _detectLanguageFromExtension(ext: string): string | undefined {
      if (TEXT_EXTENSIONS.has(ext)) {
         return 'text';
      }
      return undefined;
   }

   private _getDefaultPatterns(): string[] {
      return [
         '**/*.{js,mjs,cjs,jsx,ts,tsx,mts,cts}',
         '**/*.{py,go,java,rs,rb,cpp,cc,c,h,hpp,cs,php,swift,scala,kt,kts}',
         '**/*.{md,mdx,txt,rst}',
         '**/*.{json,yaml,yml,toml}',
         '**/*.{sh,bash,zsh,sql}',
         '**/README*',
         '**/LICENSE*',
         '**/CHANGELOG*',
      ];
   }

   private _getDefaultIgnore(): string[] {
      return [
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
      ];
   }

}

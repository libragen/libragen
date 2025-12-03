#!/usr/bin/env npx tsx
/**
 * Generate JSON Schema from TypeScript types
 *
 * This script generates JSON schemas for libragen data formats
 * from the TypeScript type definitions in @libragen/core.
 */

/* eslint-disable no-sync, no-console, no-process-exit */

import * as TJS from 'typescript-json-schema';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const currentDir = path.dirname(fileURLToPath(import.meta.url)),
      rootDir = path.resolve(currentDir, '..'),
      schemasDir = path.join(rootDir, 'schemas'),
      coreSchemasDir = path.join(rootDir, 'packages/core/schemas');

// Ensure schemas directories exist
for (const dir of [ schemasDir, coreSchemasDir ]) {
   if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
   }
}

// TypeScript compiler options
const compilerOptions: TJS.CompilerOptions = {
   strictNullChecks: true,
   esModuleInterop: true,
   moduleResolution: 100, // NodeNext
   module: 199, // NodeNext
   target: 99, // ESNext
   allowImportingTsExtensions: true,
   noEmit: true,
   skipLibCheck: true,
};

// Schema generator settings
const settings: TJS.PartialArgs = {
   required: true,
   noExtraProps: false,
   strictNullChecks: true,
};

// Source files containing the types
const sourceFiles = [
   path.join(rootDir, 'packages/core/src/manifest.ts'),
   path.join(rootDir, 'packages/core/src/collection.ts'),
   path.join(rootDir, 'packages/core/src/types.ts'),
];

interface SchemaConfig {
   typeName: string;
   fileName: string;
   title: string;
   description: string;
}

const schemas: SchemaConfig[] = [
   {
      typeName: 'CollectionDefinition',
      fileName: 'collection.schema.json',
      title: 'Libragen Collection',
      description: 'A collection of libragen libraries that can be installed together',
   },
   {
      typeName: 'CollectionItem',
      fileName: 'collection-item.schema.json',
      title: 'Libragen Collection Item',
      description: 'An item in a libragen collection (library or nested collection)',
   },
   {
      typeName: 'CollectionIndex',
      fileName: 'collection-index.schema.json',
      title: 'Libragen Collection Index',
      description: 'Index format served by collection servers listing available libraries',
   },
   {
      typeName: 'LibraryMetadata',
      fileName: 'library-metadata.schema.json',
      title: 'Libragen Library Metadata',
      description: 'Metadata stored inside .libragen files describing the library contents',
   },
];

console.log('Generating JSON schemas from TypeScript types...\n');

// Create the program
const program = TJS.getProgramFromFiles(sourceFiles, compilerOptions);

let failed = 0;

// Generate all schemas
for (const config of schemas) {
   const schema = TJS.generateSchema(program, config.typeName, settings);

   if (schema) {
      // Add metadata
      schema.$schema = 'http://json-schema.org/draft-07/schema#';
      schema.$id = `https://libragen.dev/schemas/v1/${config.fileName}`;
      schema.title = config.title;
      schema.description = config.description;

      const schemaContent = JSON.stringify(schema, null, 2) + '\n';

      // Write to both locations
      for (const dir of [ schemasDir, coreSchemasDir ]) {
         const outputPath = path.join(dir, config.fileName);

         fs.writeFileSync(outputPath, schemaContent);
         console.log(`✓ Generated: ${path.relative(rootDir, outputPath)}`);
      }
   } else {
      console.error(`✗ Failed to generate ${config.typeName} schema`);
      failed += 1;
   }
}

if (failed > 0) {
   console.error(`\n${failed} schema(s) failed to generate`);
   process.exit(1);
}

console.log('\nDone!');

// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';
import expressiveCode from 'astro-expressive-code';
import mdx from '@astrojs/mdx';
import astroLlmsTxt from '@4hse/astro-llms-txt';
import umami from '@yeskunall/astro-umami';

// https://astro.build/config
export default defineConfig({
   site: 'https://libragen.dev',
   integrations: [
      react(),
      tailwind(),
      sitemap(),
      expressiveCode({
         themes: ['github-dark', 'github-light'],
         styleOverrides: {
            // Match site's gray-900 background
            codeBackground: '#111827',
            // Match site's gray-700 border
            borderColor: '#374151',
            borderRadius: '0.75rem',
            // Frame styling to match site
            frames: {
               // Match site's gray-800 for frame header
               editorBackground: '#1f2937',
               editorTabBarBackground: '#1f2937',
               editorActiveTabBackground: '#1f2937',
               editorActiveTabBorderColor: 'transparent',
               editorTabBarBorderBottomColor: '#374151',
               terminalBackground: '#111827',
               terminalTitlebarBackground: '#1f2937',
               terminalTitlebarBorderBottomColor: '#374151',
               // Copy button styling
               inlineButtonBackground: '#374151',
               inlineButtonBorder: '#4b5563',
               inlineButtonBorderOpacity: '0.5',
               tooltipSuccessBackground: '#6366f1',
               tooltipSuccessForeground: '#ffffff',
            },
         },
      }),
      mdx(),
      astroLlmsTxt({
         title: 'Libragen',
         description:
            'Libragen is a tool for creating portable, self-contained RAG (Retrieval-Augmented Generation) libraries. It packages documentation into single .libragen SQLite files containing vector embeddings and full-text search indexes. Libraries work offline, require no cloud services, and integrate natively with the Model Context Protocol (MCP) for AI agents like Claude.',
         details: `Key features:
- Portable: Single .libragen file contains everything—vectors, metadata, and full-text index
- Hybrid search: Combines vector similarity with BM25 keyword search using reciprocal rank fusion
- MCP native: First-class Model Context Protocol integration for AI assistants
- Offline: Runs entirely locally with no API keys or cloud accounts required
- Collections: Install curated library bundles with one command`,
         optionalLinks: [
            {
               label: 'Library Metadata Schema',
               url: 'https://libragen.dev/schemas/v1/library-metadata.schema.json',
               description: 'JSON schema for .libragen file metadata',
            },
            {
               label: 'Collection Index Schema',
               url: 'https://libragen.dev/schemas/v1/collection-index.schema.json',
               description: 'JSON schema for collection server index responses',
            },
            {
               label: 'Collection Schema',
               url: 'https://libragen.dev/schemas/v1/collection.schema.json',
               description: 'JSON schema for collection definition files',
            },
         ],
         docSet: [
            {
               title: 'Full Documentation',
               description: 'Complete libragen documentation with all content',
               url: '/llms-full.txt',
               include: ['docs/**'],
               promote: ['docs/getting-started', 'docs/cli', 'docs/building'],
            },
         ],
      }),
      ...(process.env.NODE_ENV === 'production'
         ? [
              umami({
                 id: 'cee577cf-cea4-4dc1-95d3-3ed8b92e93cb',
                 endpointUrl: 'https://cloud.umami.is/script.js',
              }),
           ]
         : []),
   ],
});

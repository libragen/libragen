// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';
import astroLlmsTxt from '@4hse/astro-llms-txt';

// https://astro.build/config
export default defineConfig({
   site: 'https://collections.libragen.dev',
   integrations: [
      react(),
      tailwind(),
      sitemap(),
      astroLlmsTxt({
         title: 'Libragen Collections',
         description:
            'Browse and install curated collections of RAG libraries for AI agents. Collections bundle related documentation libraries that can be installed with a single command.',
         details: `Libragen Collections is a directory of curated library bundles for the libragen ecosystem.

Key features:
- Curated bundles: Pre-configured sets of documentation libraries for common tech stacks
- One-command install: Install entire collections with \`libragen install <collection-url>\`
- MCP integration: All installed libraries are automatically available to AI assistants via MCP
- Community collections: Browse collections created by the community`,
         optionalLinks: [
            {
               label: 'Main Libragen Site',
               url: 'https://libragen.dev',
               description: 'Learn more about libragen and how to build your own libraries',
            },
            {
               label: 'GitHub Repository',
               url: 'https://github.com/libragen/libragen',
               description: 'Source code and issue tracker',
            },
         ],
      }),
   ],
});

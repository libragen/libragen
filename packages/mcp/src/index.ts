#!/usr/bin/env node
/**
 * @libragen/mcp - MCP server for libragen
 *
 * Entry point for the MCP server that exposes libragen functionality
 * to AI coding assistants via the Model Context Protocol.
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer, warmEmbedder, updateLibraryPathsFromRoots } from './server.ts';

async function main(): Promise<void> {
   // Pre-warm the embedding model for faster first query
   // This downloads and loads the model into memory
   const embedder = await warmEmbedder();

   const server = createServer({ embedder });

   // Connect via stdio transport (standard for MCP servers)
   const transport = new StdioServerTransport();

   await server.connect(transport);

   // Try to get roots from the client to discover project directories
   // This enables auto-detection of .libragen/libraries in workspace roots
   try {
      // The server object has a client property after connection
      // that can be used to make requests to the client
      const mcpServer = server as unknown as {
         server?: {
            listRoots?: () => Promise<{ roots: Array<{ uri: string; name?: string }> }>;
         };
      };

      if (mcpServer.server?.listRoots) {
         const rootsResult = await mcpServer.server.listRoots();

         if (rootsResult?.roots) {
            await updateLibraryPathsFromRoots(rootsResult.roots);
         }
      }
   } catch{
      // Client may not support roots - that's fine, we'll use defaults
   }
}

main().catch((error) => {
   // eslint-disable-next-line no-console
   console.error('Failed to start MCP server:', error);
   // eslint-disable-next-line no-process-exit
   process.exit(1);
});

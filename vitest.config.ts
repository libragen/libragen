import { defineConfig } from 'vitest/config';

export default defineConfig({
   test: {
      globals: true,
      environment: 'node',
      include: [
         'packages/*/src/**/*.test.ts',
         'packages/*/e2e/**/*.test.ts',
      ],
      testTimeout: 120000, // 2 minutes for E2E tests with embedding
      hookTimeout: 300000, // 5 minutes for beforeAll hooks that build libraries
      coverage: {
         provider: 'v8',
         reporter: [ 'text', 'json', 'html' ],
         include: [ 'packages/*/src/**/*.ts' ],
         exclude: [ '**/*.test.ts', '**/*.d.ts' ],
      },
   },
});

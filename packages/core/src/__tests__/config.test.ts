/**
 * Tests for configuration module
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// We need to reset modules between tests to pick up env changes
let configModule: typeof import('../config.ts');

describe('config', () => {
   // eslint-disable-next-line no-process-env
   const originalEnv = process.env;

   beforeEach(async () => {
      // Reset environment
      // eslint-disable-next-line no-process-env
      process.env = { ...originalEnv };
      // eslint-disable-next-line no-process-env
      delete process.env.LIBRAGEN_HOME;

      // Re-import the module to pick up env changes
      vi.resetModules();
      configModule = await import('../config.ts');
   });

   afterEach(() => {
      // eslint-disable-next-line no-process-env
      process.env = originalEnv;
   });

   describe('getLibragenHome', () => {
      it('should use LIBRAGEN_HOME when set', async () => {
         // eslint-disable-next-line no-process-env
         process.env.LIBRAGEN_HOME = '/custom/libragen';
         vi.resetModules();
         configModule = await import('../config.ts');

         expect(configModule.getLibragenHome()).toBe('/custom/libragen');
      });

      it('should return a platform-specific default when LIBRAGEN_HOME not set', async () => {
         // Just verify it returns a non-empty string containing 'libragen'
         const home = configModule.getLibragenHome();

         expect(home).toBeTruthy();
         expect(home).toContain('libragen');
      });
   });

   describe('getDefaultLibraryDir', () => {
      it('should return libraries subdirectory of libragen home', async () => {
         // eslint-disable-next-line no-process-env
         process.env.LIBRAGEN_HOME = '/custom/libragen';
         vi.resetModules();
         configModule = await import('../config.ts');

         expect(configModule.getDefaultLibraryDir()).toBe('/custom/libragen/libraries');
      });

      it('should end with /libraries', async () => {
         const dir = configModule.getDefaultLibraryDir();

         expect(dir).toMatch(/[/\\]libraries$/);
      });
   });

   describe('getDefaultManifestDir', () => {
      it('should return libragen home directory', async () => {
         // eslint-disable-next-line no-process-env
         process.env.LIBRAGEN_HOME = '/custom/libragen';
         vi.resetModules();
         configModule = await import('../config.ts');

         expect(configModule.getDefaultManifestDir()).toBe('/custom/libragen');
      });

      it('should equal getLibragenHome', async () => {
         expect(configModule.getDefaultManifestDir()).toBe(configModule.getLibragenHome());
      });
   });

   describe('getDefaultCollectionConfigDir', () => {
      it('should return libragen home directory', async () => {
         // eslint-disable-next-line no-process-env
         process.env.LIBRAGEN_HOME = '/custom/libragen';
         vi.resetModules();
         configModule = await import('../config.ts');

         expect(configModule.getDefaultCollectionConfigDir()).toBe('/custom/libragen');
      });

      it('should equal getLibragenHome', async () => {
         expect(configModule.getDefaultCollectionConfigDir()).toBe(configModule.getLibragenHome());
      });
   });

   describe('getModelCacheDir', () => {
      it('should return models subdirectory by default', async () => {
         // eslint-disable-next-line no-process-env
         process.env.LIBRAGEN_HOME = '/custom/libragen';
         vi.resetModules();
         configModule = await import('../config.ts');

         expect(configModule.getModelCacheDir()).toBe('/custom/libragen/models');
      });

      it('should use LIBRAGEN_MODEL_CACHE when set', async () => {
         // eslint-disable-next-line no-process-env
         process.env.LIBRAGEN_MODEL_CACHE = '/custom/models';
         vi.resetModules();
         configModule = await import('../config.ts');

         expect(configModule.getModelCacheDir()).toBe('/custom/models');
      });

      it('should prefer LIBRAGEN_MODEL_CACHE over LIBRAGEN_HOME', async () => {
         // eslint-disable-next-line no-process-env
         process.env.LIBRAGEN_HOME = '/custom/libragen';
         // eslint-disable-next-line no-process-env
         process.env.LIBRAGEN_MODEL_CACHE = '/separate/models';
         vi.resetModules();
         configModule = await import('../config.ts');

         expect(configModule.getModelCacheDir()).toBe('/separate/models');
      });

      it('should end with /models when using default', async () => {
         const dir = configModule.getModelCacheDir();

         expect(dir).toMatch(/[/\\]models$/);
      });
   });
});

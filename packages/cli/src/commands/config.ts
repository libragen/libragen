/**
 * Config command - Display current libragen configuration
 */

/* eslint-disable no-console, no-process-env */

import { Command } from 'commander';
import chalk from 'chalk';
import {
   getLibragenHome,
   getDefaultLibraryDir,
   getModelCacheDir,
   VERSION,
} from '@libragen/core';

interface ConfigOptions {
   json?: boolean;
}

export const configCommand = new Command('config')
   .description('Display current libragen configuration and paths')
   .option('--json', 'Output as JSON')
   .action((options: ConfigOptions) => {
      const home = getLibragenHome(),
            libraryDir = getDefaultLibraryDir(),
            modelCacheDir = getModelCacheDir();

      // Check which values are from env vars
      const homeFromEnv = !!process.env.LIBRAGEN_HOME,
            modelCacheFromEnv = !!process.env.LIBRAGEN_MODEL_CACHE;

      const config = {
         version: VERSION,
         paths: {
            home,
            libraries: libraryDir,
            models: modelCacheDir,
         },
         environment: {
            LIBRAGEN_HOME: process.env.LIBRAGEN_HOME || null,
            LIBRAGEN_MODEL_CACHE: process.env.LIBRAGEN_MODEL_CACHE || null,
         },
      };

      if (options.json) {
         console.log(JSON.stringify(config, null, 2));
         return;
      }

      console.log(chalk.bold('\n⚙️  Libragen Configuration\n'));
      console.log(`  ${chalk.dim('Version:')}  ${VERSION}`);

      console.log(chalk.bold('\n  Paths:'));
      console.log(`    ${chalk.dim('Home:')}       ${home}${homeFromEnv ? chalk.yellow(' (from LIBRAGEN_HOME)') : ''}`);
      console.log(`    ${chalk.dim('Libraries:')}  ${libraryDir}`);
      // eslint-disable-next-line max-len
      console.log(`    ${chalk.dim('Models:')}     ${modelCacheDir}${modelCacheFromEnv ? chalk.yellow(' (from LIBRAGEN_MODEL_CACHE)') : ''}`);

      console.log(chalk.bold('\n  Environment Variables:'));

      if (homeFromEnv || modelCacheFromEnv) {
         if (homeFromEnv) {
            console.log(`    ${chalk.green('LIBRAGEN_HOME')}=${process.env.LIBRAGEN_HOME}`);
         }

         if (modelCacheFromEnv) {
            console.log(`    ${chalk.green('LIBRAGEN_MODEL_CACHE')}=${process.env.LIBRAGEN_MODEL_CACHE}`);
         }
      } else {
         console.log(chalk.dim('    (none set, using defaults)'));
      }

      console.log('');
   });

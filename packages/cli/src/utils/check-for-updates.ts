import https from 'https';
import semver from 'semver';
import chalk from 'chalk';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';


const FILE_NAME = fileURLToPath(import.meta.url);

const DIR_NAME = path.dirname(FILE_NAME);

// Assuming the compiled code is in dist/utils/ and package.json is in ../../
// packages/cli/src/utils/check-for-updates.ts ->
//    packages/cli/dist/utils/check-for-updates.js
// package.json is at packages/cli/package.json
// So from src/utils, it is ../../package.json.
// From dist/utils, it is ../../package.json.
const PACKAGE_JSON_PATH = path.resolve(DIR_NAME, '../../package.json');

const REGISTRY_URL = 'https://registry.npmjs.org/@libragen/cli/latest';

export async function checkForUpdate(): Promise<void> {
   try {
      const pkgContent = await fs.readFile(PACKAGE_JSON_PATH, 'utf-8');

      const pkg = JSON.parse(pkgContent);

      const currentVersion = pkg.version;

      // Fetch latest version
      const latestVersion = await fetchLatestVersion();

      if (latestVersion && semver.gt(latestVersion, currentVersion)) {
         displayUpdateBanner(currentVersion, latestVersion);
      }
   } catch(error) {
      // Ignore errors (network, file access, parse) to not break CLI
   }
}

function fetchLatestVersion(): Promise<string | null> {
   return new Promise((resolve) => {
      const req = https.get(REGISTRY_URL, { timeout: 1500 }, (res) => {

         if (res.statusCode !== 200) {
            resolve(null);
            return;
         }

         let data = '';

         res.on('data', (chunk) => { data += chunk; });
         res.on('end', () => {
            try {
               const json = JSON.parse(data);

               if (typeof json.version === 'string') {
                  resolve(json.version);
               } else {
                  resolve(null);
               }
            } catch(_e) {
               resolve(null);
            }
         });
      });

      req.on('error', () => { resolve(null); });
      req.on('timeout', () => {
         req.destroy();
         resolve(null);
      });
   });
}

function displayUpdateBanner(current: string, latest: string): void {
   // eslint-disable-next-line no-control-regex
   const stripAnsi = (str: string): string => { return str.replace(/\x1B\[\d+m/g, ''); };

   const line1 = `New version available! ${chalk.dim(current)} → ${chalk.green(latest)}`;

   const line2 = `Run ${chalk.cyan('npm i -g @libragen/cli')} to update`;

   const len1 = stripAnsi(line1).length;

   const len2 = stripAnsi(line2).length;

   const maxLen = Math.max(len1, len2);

   // Add nice box
   const border = '─'.repeat(maxLen + 4);

   console.log();
   console.log(chalk.yellow('╭' + border + '╮'));
   console.log(chalk.yellow('│  ') + line1 + ' '.repeat(maxLen - len1) + chalk.yellow('  │'));
   console.log(chalk.yellow('│  ') + line2 + ' '.repeat(maxLen - len2) + chalk.yellow('  │'));
   console.log(chalk.yellow('╰' + border + '╯'));
   console.log();
}

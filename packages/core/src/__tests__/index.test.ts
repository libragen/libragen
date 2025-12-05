import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { VERSION } from '../index.js';

// Read expected version from package.json
const packageJsonPath = join(dirname(fileURLToPath(import.meta.url)), '../../package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
const expectedVersion = packageJson.version;

describe('@libragen/core', () => {
   it('exports VERSION that matches package.json', () => {
      expect(VERSION).toBe(expectedVersion);
   });
});

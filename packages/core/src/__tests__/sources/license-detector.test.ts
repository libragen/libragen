/**
 * Tests for the LicenseDetector class
 */

/* eslint-disable @silvermine/silvermine/fluent-chaining */
/* eslint-disable @silvermine/silvermine/call-indentation */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { LicenseDetector } from '../../sources/license-detector.js';

// Sample license texts for testing
const MIT_LICENSE = `MIT License

Copyright (c) 2024 Test Author

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

const APACHE_LICENSE = `                                 Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.

      "License" shall mean the terms and conditions for use, reproduction,
      and distribution as defined by Sections 1 through 9 of this document.

      "Licensor" shall mean the copyright owner or entity authorized by
      the copyright owner that is granting the License.`;

const GPL3_LICENSE = `                    GNU GENERAL PUBLIC LICENSE
                       Version 3, 29 June 2007

 Copyright (C) 2007 Free Software Foundation, Inc. <https://fsf.org/>
 Everyone is permitted to copy and distribute verbatim copies
 of this license document, but changing it is not allowed.

                            Preamble

  The GNU General Public License is a free, copyleft license for
software and other kinds of works.`;

const BSD3_LICENSE = `BSD 3-Clause License

Copyright (c) 2024, Test Author

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its
   contributors may be used to endorse or promote products derived from
   this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED.`;

const ISC_LICENSE = `ISC License

Copyright (c) 2024, Test Author

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.`;

const UNLICENSE = `This is free and unencumbered software released into the public domain.

Anyone is free to copy, modify, publish, use, compile, sell, or
distribute this software, either in source code form or as a compiled
binary, for any purpose, commercial or non-commercial, and by any
means.`;

const UNKNOWN_LICENSE = `Some Custom License

This is a custom license that doesn't match any known patterns.
You can use this software however you want, maybe.`;

describe('LicenseDetector', () => {
   let tempDir: string,
       detector: LicenseDetector;

   beforeEach(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'libragen-license-test-'));
      detector = new LicenseDetector();
   });

   afterEach(async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
   });

   describe('detectFromContent', () => {
      it('detects MIT license', () => {
         const result = detector.detectFromContent(MIT_LICENSE);

         expect(result).not.toBeNull();
         expect(result?.identifier).toBe('MIT');
         expect(result?.confidence).toBe('high');
      });

      it('detects Apache-2.0 license', () => {
         const result = detector.detectFromContent(APACHE_LICENSE);

         expect(result).not.toBeNull();
         expect(result?.identifier).toBe('Apache-2.0');
         expect(result?.confidence).toBe('high');
      });

      it('detects GPL-3.0 license', () => {
         const result = detector.detectFromContent(GPL3_LICENSE);

         expect(result).not.toBeNull();
         expect(result?.identifier).toBe('GPL-3.0');
         expect(result?.confidence).toBe('high');
      });

      it('detects BSD-3-Clause license', () => {
         const result = detector.detectFromContent(BSD3_LICENSE);

         expect(result).not.toBeNull();
         expect(result?.identifier).toBe('BSD-3-Clause');
         expect(result?.confidence).toBe('high');
      });

      it('detects ISC license', () => {
         const result = detector.detectFromContent(ISC_LICENSE);

         expect(result).not.toBeNull();
         expect(result?.identifier).toBe('ISC');
         expect(result?.confidence).toBe('high');
      });

      it('detects Unlicense', () => {
         const result = detector.detectFromContent(UNLICENSE);

         expect(result).not.toBeNull();
         expect(result?.identifier).toBe('Unlicense');
         expect(result?.confidence).toBe('high');
      });

      it('returns null for unknown license format', () => {
         const result = detector.detectFromContent(UNKNOWN_LICENSE);

         expect(result).toBeNull();
      });

      it('returns null for empty content', () => {
         const result = detector.detectFromContent('');

         expect(result).toBeNull();
      });
   });

   describe('detectFromDirectory', () => {
      it('finds and parses LICENSE file', async () => {
         await fs.writeFile(path.join(tempDir, 'LICENSE'), MIT_LICENSE);

         const result = await detector.detectFromDirectory(tempDir);

         expect(result).not.toBeNull();
         expect(result?.identifier).toBe('MIT');
         expect(result?.file).toBe('LICENSE');
         expect(result?.confidence).toBe('high');
      });

      it('finds LICENSE.md file', async () => {
         await fs.writeFile(path.join(tempDir, 'LICENSE.md'), APACHE_LICENSE);

         const result = await detector.detectFromDirectory(tempDir);

         expect(result).not.toBeNull();
         expect(result?.identifier).toBe('Apache-2.0');
         expect(result?.file).toBe('LICENSE.md');
      });

      it('finds LICENSE.txt file', async () => {
         await fs.writeFile(path.join(tempDir, 'LICENSE.txt'), GPL3_LICENSE);

         const result = await detector.detectFromDirectory(tempDir);

         expect(result).not.toBeNull();
         expect(result?.identifier).toBe('GPL-3.0');
         expect(result?.file).toBe('LICENSE.txt');
      });

      it('finds COPYING file', async () => {
         await fs.writeFile(path.join(tempDir, 'COPYING'), BSD3_LICENSE);

         const result = await detector.detectFromDirectory(tempDir);

         expect(result).not.toBeNull();
         expect(result?.identifier).toBe('BSD-3-Clause');
         expect(result?.file).toBe('COPYING');
      });

      it('returns null when no LICENSE file exists', async () => {
         // Empty directory
         const result = await detector.detectFromDirectory(tempDir);

         expect(result).toBeNull();
      });

      it('returns Unknown for unrecognized license file', async () => {
         await fs.writeFile(path.join(tempDir, 'LICENSE'), UNKNOWN_LICENSE);

         const result = await detector.detectFromDirectory(tempDir);

         expect(result).not.toBeNull();
         expect(result?.identifier).toBe('Unknown');
         expect(result?.file).toBe('LICENSE');
         expect(result?.confidence).toBe('low');
      });

      it('checks files in priority order', async () => {
         // Create both LICENSE and LICENSE.md
         await fs.writeFile(path.join(tempDir, 'LICENSE'), MIT_LICENSE);
         await fs.writeFile(path.join(tempDir, 'LICENSE.md'), APACHE_LICENSE);

         const result = await detector.detectFromDirectory(tempDir);

         // Should find LICENSE first (higher priority)
         expect(result).not.toBeNull();
         expect(result?.identifier).toBe('MIT');
         expect(result?.file).toBe('LICENSE');
      });
   });

   describe('LICENSE_FILES constant', () => {
      it('contains expected license file names', () => {
         expect(LicenseDetector.LICENSE_FILES).toContain('LICENSE');
         expect(LicenseDetector.LICENSE_FILES).toContain('LICENSE.md');
         expect(LicenseDetector.LICENSE_FILES).toContain('LICENSE.txt');
         expect(LicenseDetector.LICENSE_FILES).toContain('COPYING');
      });

      it('has LICENSE as highest priority', () => {
         expect(LicenseDetector.LICENSE_FILES[0]).toBe('LICENSE');
      });
   });
});

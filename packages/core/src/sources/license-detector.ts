/**
 * License detection from files
 *
 * Detects SPDX license identifiers from common license files.
 */

import * as fs from 'fs/promises';
import * as path from 'path';

export interface DetectedLicense {

   /** SPDX ID or 'Unknown' */
   identifier: string;

   /** Path to license file */
   file: string;

   /** Detection confidence level */
   confidence: 'high' | 'medium' | 'low';
}

interface LicensePattern {
   identifier: string;
   patterns: RegExp[];
   confidence: 'high' | 'medium' | 'low';
}

/** License patterns for detection */
const LICENSE_PATTERNS: LicensePattern[] = [
   {
      identifier: 'MIT',
      patterns: [
         /\bMIT License\b/i,
         /\bPermission is hereby granted, free of charge\b/i,
      ],
      confidence: 'high',
   },
   {
      identifier: 'Apache-2.0',
      patterns: [
         /\bApache License\b.*\bVersion 2\.0\b/is,
         /\bLicensed under the Apache License, Version 2\.0\b/i,
      ],
      confidence: 'high',
   },
   {
      identifier: 'GPL-3.0',
      patterns: [
         /\bGNU GENERAL PUBLIC LICENSE\b.*\bVersion 3\b/is,
         /\bGPL-3\.0\b/i,
      ],
      confidence: 'high',
   },
   {
      identifier: 'GPL-2.0',
      patterns: [
         /\bGNU GENERAL PUBLIC LICENSE\b.*\bVersion 2\b/is,
         /\bGPL-2\.0\b/i,
      ],
      confidence: 'high',
   },
   {
      identifier: 'LGPL-3.0',
      patterns: [
         /\bGNU LESSER GENERAL PUBLIC LICENSE\b.*\bVersion 3\b/is,
         /\bLGPL-3\.0\b/i,
      ],
      confidence: 'high',
   },
   {
      identifier: 'LGPL-2.1',
      patterns: [
         /\bGNU LESSER GENERAL PUBLIC LICENSE\b.*\bVersion 2\.1\b/is,
         /\bLGPL-2\.1\b/i,
      ],
      confidence: 'high',
   },
   {
      identifier: 'BSD-3-Clause',
      patterns: [
         /\bBSD 3-Clause\b/i,
         /\bRedistribution and use in source and binary forms\b.*\bneither the name\b/is,
      ],
      confidence: 'high',
   },
   {
      identifier: 'BSD-2-Clause',
      patterns: [
         /\bBSD 2-Clause\b/i,
      ],
      confidence: 'high',
   },
   {
      identifier: 'ISC',
      patterns: [
         /\bISC License\b/i,
         /\bPermission to use, copy, modify, and\/or distribute this software\b/i,
      ],
      confidence: 'high',
   },
   {
      identifier: 'Unlicense',
      patterns: [
         /\bThis is free and unencumbered software released into the public domain\b/i,
         /\bUnlicense\b/i,
      ],
      confidence: 'high',
   },
   {
      identifier: 'MPL-2.0',
      patterns: [
         /\bMozilla Public License\b.*\bVersion 2\.0\b/is,
         /\bMPL-2\.0\b/i,
      ],
      confidence: 'high',
   },
   {
      identifier: 'CC0-1.0',
      patterns: [
         /\bCC0 1\.0 Universal\b/i,
         /\bCreative Commons Zero\b/i,
      ],
      confidence: 'high',
   },
   {
      identifier: 'AGPL-3.0',
      patterns: [
         /\bGNU AFFERO GENERAL PUBLIC LICENSE\b.*\bVersion 3\b/is,
         /\bAGPL-3\.0\b/i,
      ],
      confidence: 'high',
   },
   // Medium confidence patterns (less specific)
   {
      identifier: 'BSD-3-Clause',
      patterns: [
         /\bRedistribution and use in source and binary forms\b/i,
      ],
      confidence: 'medium',
   },
];

/**
 * License detector for identifying licenses from file content.
 */
export class LicenseDetector {

   /** License file names to check, in priority order */
   public static readonly LICENSE_FILES = [
      'LICENSE',
      'LICENSE.md',
      'LICENSE.txt',
      'COPYING',
      'COPYING.md',
      'COPYING.txt',
      'LICENSE-MIT',
      'LICENSE-APACHE',
      'LICENSE.MIT',
      'LICENSE.APACHE',
   ];

   /**
    * Detect license from file content.
    *
    * @param content - License file content
    * @returns Detected license or null if not recognized
    */
   public detectFromContent(content: string): Omit<DetectedLicense, 'file'> | null {
      // Try high confidence patterns first
      for (const licensePattern of LICENSE_PATTERNS) {
         if (licensePattern.confidence !== 'high') {
            continue;
         }

         for (const pattern of licensePattern.patterns) {
            if (pattern.test(content)) {
               return {
                  identifier: licensePattern.identifier,
                  confidence: 'high',
               };
            }
         }
      }

      // Try medium confidence patterns
      for (const licensePattern of LICENSE_PATTERNS) {
         if (licensePattern.confidence !== 'medium') {
            continue;
         }

         for (const pattern of licensePattern.patterns) {
            if (pattern.test(content)) {
               return {
                  identifier: licensePattern.identifier,
                  confidence: 'medium',
               };
            }
         }
      }

      return null;
   }

   /**
    * Detect license from a directory by checking common license files.
    *
    * @param dirPath - Directory path to search
    * @returns Detected license or null if not found
    */
   public async detectFromDirectory(dirPath: string): Promise<DetectedLicense | null> {
      for (const licenseFile of LicenseDetector.LICENSE_FILES) {
         const filePath = path.join(dirPath, licenseFile);

         try {
            const content = await fs.readFile(filePath, 'utf-8');

            const result = this.detectFromContent(content);

            if (result) {
               return {
                  ...result,
                  file: licenseFile,
               };
            }

            // File exists but license not recognized
            return {
               identifier: 'Unknown',
               file: licenseFile,
               confidence: 'low',
            };
         } catch{
            // File doesn't exist, try next
            continue;
         }
      }

      return null;
   }

}

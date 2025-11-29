/**
 * Tests for shared utility functions
 */

import { describe, it, expect } from 'vitest';
import { formatBytes, deriveGitLibraryName } from '../utils.ts';

describe('formatBytes', () => {
   it('formats 0 bytes', () => {
      expect(formatBytes(0)).toBe('0 Bytes');
   });

   it('formats bytes', () => {
      expect(formatBytes(512)).toBe('512 Bytes');
      expect(formatBytes(1023)).toBe('1023 Bytes');
   });

   it('formats kilobytes', () => {
      expect(formatBytes(1024)).toBe('1 KB');
      expect(formatBytes(1536)).toBe('1.5 KB');
      expect(formatBytes(10240)).toBe('10 KB');
   });

   it('formats megabytes', () => {
      expect(formatBytes(1048576)).toBe('1 MB');
      expect(formatBytes(1572864)).toBe('1.5 MB');
      expect(formatBytes(10485760)).toBe('10 MB');
   });

   it('formats gigabytes', () => {
      expect(formatBytes(1073741824)).toBe('1 GB');
      expect(formatBytes(1610612736)).toBe('1.5 GB');
   });
});

describe('deriveGitLibraryName', () => {
   it('derives name from GitHub URL with .git suffix', () => {
      expect(deriveGitLibraryName('https://github.com/vercel/next.js.git'))
         .toBe('vercel-next.js');
   });

   it('derives name from GitHub URL without .git suffix', () => {
      expect(deriveGitLibraryName('https://github.com/vercel/next.js'))
         .toBe('vercel-next.js');
   });

   it('handles org and repo correctly', () => {
      expect(deriveGitLibraryName('https://github.com/microsoft/typescript'))
         .toBe('microsoft-typescript');
   });

   it('handles GitLab URLs', () => {
      expect(deriveGitLibraryName('https://gitlab.com/gitlab-org/gitlab.git'))
         .toBe('gitlab-org-gitlab');
   });

   it('handles URLs without org', () => {
      expect(deriveGitLibraryName('https://example.com/repo.git'))
         .toBe('example.com-repo');
   });

   it('handles simple repo URL', () => {
      expect(deriveGitLibraryName('/some/path/repo.git'))
         .toBe('path-repo');
   });

   it('returns "library" for empty URL', () => {
      expect(deriveGitLibraryName(''))
         .toBe('library');
   });
});

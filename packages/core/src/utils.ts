/**
 * Shared utility functions
 */

/**
 * Format bytes into a human-readable string.
 *
 * @param bytes - Number of bytes
 * @returns Formatted string (e.g., "1.5 MB")
 */
export function formatBytes(bytes: number): string {
   if (bytes === 0) {
      return '0 Bytes';
   }

   const k = 1024,
         sizes = [ 'Bytes', 'KB', 'MB', 'GB' ],
         i = Math.floor(Math.log(bytes) / Math.log(k));

   return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Derives a library name from a git repository URL, including org/owner.
 *
 * @param repoUrl - Git repository URL
 * @returns Library name (e.g., "vercel-next.js")
 *
 * @example
 * deriveGitLibraryName("https://github.com/vercel/next.js.git") // → "vercel-next.js"
 * deriveGitLibraryName("https://github.com/vercel/next.js") // → "vercel-next.js"
 */
export function deriveGitLibraryName(repoUrl: string): string {
   const urlWithoutGit = repoUrl.replace(/\.git$/, '');

   const parts = urlWithoutGit.split('/');

   const repo = parts.pop() || 'library';

   const org = parts.pop();

   return org ? `${org}-${repo}` : repo;
}

/**
 * Format seconds into a human-readable duration string.
 *
 * @param seconds - Duration in seconds
 * @returns Formatted string (e.g., "1m 30s", "45.2s")
 *
 * @example
 * formatDuration(45.5) // → "45.5s"
 * formatDuration(90) // → "1m 30s"
 * formatDuration(120) // → "2m"
 */
export function formatDuration(seconds: number): string {
   if (seconds < 60) {
      return `${seconds.toFixed(1)}s`;
   }

   const minutes = Math.floor(seconds / 60),
         remainingSeconds = Math.round(seconds % 60);

   return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
}

/**
 * Time estimation utilities for the build command
 */

import * as os from 'os';

export interface SystemInfo {
   cpuModel: string;
   cpuCores: number;
   totalMemoryGB: number;
   platform: NodeJS.Platform;
   arch: string;
}

export interface TimeEstimate {
   estimatedSeconds: number;
   formattedTime: string;
   chunksPerSecond: number;
   systemInfo: SystemInfo;
}

/**
 * Get system information for time estimation
 */
export function getSystemInfo(): SystemInfo {
   const cpus = os.cpus();

   return {
      cpuModel: cpus[0]?.model || 'Unknown CPU',
      cpuCores: cpus.length,
      totalMemoryGB: Math.round(os.totalmem() / (1024 * 1024 * 1024) * 10) / 10,
      platform: os.platform(),
      arch: os.arch(),
   };
}

/**
 * Baseline embedding rates (chunks per second) for different CPU types.
 * These are conservative estimates for the BGE-small model with q8 quantization.
 *
 * Rates are based on batch size of 32 and typical chunk sizes (~1000 chars).
 * Estimates account for model warmup overhead on first batch.
 */
function getBaselineChunksPerSecond(systemInfo: SystemInfo): number {
   const { cpuModel, cpuCores, arch } = systemInfo;

   // Apple Silicon (M1/M2/M3/M4) - fast due to unified memory architecture
   if (arch === 'arm64' && systemInfo.platform === 'darwin') {
      if (cpuModel.includes('M4')) {
         return 55; // M4 chips
      }
      if (cpuModel.includes('M3')) {
         return 50; // M3 chips
      }
      if (cpuModel.includes('M2')) {
         return 45; // M2 chips
      }
      if (cpuModel.includes('M1')) {
         return 35; // M1 chips
      }
      return 40; // Unknown Apple Silicon
   }

   // Intel/AMD x64 - scale by core count
   if (arch === 'x64') {
      // High-end desktop/server CPUs
      if (cpuCores >= 16) {
         return 30;
      }
      if (cpuCores >= 8) {
         return 22;
      }
      if (cpuCores >= 4) {
         return 15;
      }
      return 10; // Low-end CPUs
   }

   // ARM Linux (e.g., Raspberry Pi, AWS Graviton)
   if (arch === 'arm64') {
      if (cpuCores >= 8) {
         return 20; // AWS Graviton or similar
      }
      return 8; // Raspberry Pi or similar
   }

   // Fallback for unknown architectures
   return 15;
}

/**
 * Format seconds into a human-readable time string
 */
function formatTime(seconds: number): string {
   if (seconds < 60) {
      return `${Math.round(seconds)}s`;
   }

   const minutes = Math.floor(seconds / 60),
         remainingSeconds = Math.round(seconds % 60);

   if (minutes < 60) {
      return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
   }

   const hours = Math.floor(minutes / 60),
         remainingMinutes = minutes % 60;

   if (remainingMinutes > 0) {
      return `${hours}h ${remainingMinutes}m`;
   }
   return `${hours}h`;
}

/**
 * Estimate the time to embed a given number of chunks
 */
export function estimateEmbeddingTime(chunkCount: number): TimeEstimate {
   const systemInfo = getSystemInfo(),
         chunksPerSecond = getBaselineChunksPerSecond(systemInfo),
         estimatedSeconds = chunkCount / chunksPerSecond;

   return {
      estimatedSeconds,
      formattedTime: formatTime(estimatedSeconds),
      chunksPerSecond,
      systemInfo,
   };
}

/**
 * Format system info for display
 */
export function formatSystemInfo(info: SystemInfo): string {
   // Shorten CPU model name for display
   let cpuName = info.cpuModel;

   cpuName = cpuName
      .replace(/\(R\)/g, '')
      .replace(/\(TM\)/g, '')
      .replace(/CPU\s*@.*$/i, '')
      .replace(/\s+/g, ' ')
      .trim();

   // Truncate if too long
   if (cpuName.length > 40) {
      cpuName = cpuName.substring(0, 37) + '...';
   }

   return `${cpuName} (${info.cpuCores} cores)`;
}

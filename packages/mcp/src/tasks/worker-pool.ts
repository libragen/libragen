/**
 * WorkerPool - Manages worker threads for build operations
 *
 * Spawns worker threads up to the concurrency limit and routes
 * messages between workers and the TaskManager.
 */

import { Worker } from 'worker_threads';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type { BuildTask } from './task-manager.ts';
import { getTaskManager } from './task-manager.ts';
import type { WorkerOutMessage } from './build-worker.ts';

const currentFilename = fileURLToPath(import.meta.url);

const currentDirname = path.dirname(currentFilename);

/** Map of task ID to worker */
const workers = new Map<string, Worker>();

/**
 * Get the path to the build worker script.
 * Handles both development (.ts) and production (.js) environments.
 */
function getWorkerPath(): string {
   // In production, use the compiled .js file
   // In development with ts-node or tsx, use the .ts file
   const jsPath = path.join(currentDirname, 'build-worker.js'),
         tsPath = path.join(currentDirname, 'build-worker.ts');

   // Check if we're running in a TypeScript environment
   // by checking if the current file is .ts
   if (currentFilename.endsWith('.ts')) {
      return tsPath;
   }

   return jsPath;
}

/**
 * Start a worker for the given task.
 */
export function startWorker(task: BuildTask): void {
   const taskManager = getTaskManager(),
         workerPath = getWorkerPath();

   // Mark task as running
   taskManager.markRunning(task.id);

   // Create worker with task params
   const worker = new Worker(workerPath, {
      workerData: { params: task.params },
   });

   workers.set(task.id, worker);

   // Handle messages from worker
   worker.on('message', (msg: WorkerOutMessage) => {
      const currentTask = taskManager.getTask(task.id);

      if (!currentTask) {
         return;
      }

      switch (msg.type) {
         case 'progress': {
            taskManager.updateTask(task.id, {
               progress: msg.progress ?? currentTask.progress,
               currentStep: msg.step ?? currentTask.currentStep,
            });
            break;
         }

         case 'complete': {
            taskManager.markCompleted(task.id, msg.result ?? 'Build completed');
            cleanupWorker(task.id);
            break;
         }

         case 'error': {
            taskManager.markFailed(task.id, msg.error ?? 'Unknown error');
            cleanupWorker(task.id);
            break;
         }

         default: {
            // Unknown message type, ignore
            break;
         }
      }
   });

   // Handle worker errors
   worker.on('error', (error) => {
      taskManager.markFailed(task.id, error.message);
      cleanupWorker(task.id);
   });

   // Handle worker exit
   worker.on('exit', (code) => {
      const currentTask = taskManager.getTask(task.id);

      // If task is still running when worker exits, mark as failed
      if (currentTask && currentTask.status === 'running') {
         taskManager.markFailed(task.id, `Worker exited with code ${code}`);
      }

      cleanupWorker(task.id);
   });
}

/**
 * Cancel a running worker.
 */
export function cancelWorker(taskId: string): boolean {
   const worker = workers.get(taskId);

   if (worker) {
      // Send cancel message to worker
      worker.postMessage({ type: 'cancel' });

      // Give worker a chance to clean up, then terminate
      setTimeout(() => {
         const w = workers.get(taskId);

         if (w) {
            w.terminate();
            cleanupWorker(taskId);
         }
      }, 5000);

      return true;
   }

   return false;
}

/**
 * Clean up worker reference.
 */
function cleanupWorker(taskId: string): void {
   workers.delete(taskId);
}

/**
 * Initialize the worker pool by setting up the TaskManager callback.
 */
export function initializeWorkerPool(): void {
   const taskManager = getTaskManager();

   // Set callback for when tasks are ready to run
   taskManager.onTaskReady = (task: BuildTask) => {
      startWorker(task);
   };
}

/**
 * Get the number of active workers.
 */
export function getActiveWorkerCount(): number {
   return workers.size;
}

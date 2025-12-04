/**
 * TaskManager - Manages async build tasks with queuing and concurrency control
 */

import * as os from 'os';
import { randomUUID } from 'crypto';

/** Parameters for starting a build task */
export interface BuildParams {
   source: string;
   output?: string;
   name?: string;
   version?: string;
   contentVersion?: string;
   description?: string;
   agentDescription?: string;
   exampleQueries?: string[];
   keywords?: string[];
   programmingLanguages?: string[];
   textLanguages?: string[];
   frameworks?: string[];
   chunkSize?: number;
   chunkOverlap?: number;
   include?: string[];
   exclude?: string[];
   gitRef?: string;
   gitRepoAuthToken?: string;
   license?: string[];
   install?: boolean;
}

/** Build task status */
export type TaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

/** A build task tracked by the TaskManager */
export interface BuildTask {
   id: string;
   status: TaskStatus;
   progress: number;
   currentStep: string;
   params: BuildParams;
   result?: string;
   error?: string;
   createdAt: Date;
   completedAt?: Date;

   /** Callback to send MCP progress notifications */
   sendProgress?: (notification: { progress: number; total: number; message: string }) => void;
}

/** Configuration for TaskManager */
export interface TaskManagerConfig {

   /** Maximum concurrent builds (default: os.cpus().length - 1, minimum 1) */
   maxConcurrent?: number;

   /** Task expiry time in milliseconds (default: 1 hour) */
   taskExpiryMs?: number;
}

const DEFAULT_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

/**
 * Manages build tasks with queuing and concurrency control.
 */
export class TaskManager {

   public readonly maxConcurrent: number;
   public readonly taskExpiryMs: number;

   /** Callback invoked when a queued task should start */
   public onTaskReady?: (task: BuildTask) => void;

   private _tasks = new Map<string, BuildTask>();
   private _queue: string[] = []; // Task IDs in queue order
   private _runningCount = 0;
   private _cleanupInterval: ReturnType<typeof setInterval> | null = null;

   public constructor(config: TaskManagerConfig = {}) {
      // Default to n-1 cores, minimum 1
      const cpuCount = os.cpus().length;

      this.maxConcurrent = config.maxConcurrent ?? Math.max(1, cpuCount - 1);

      // Read expiry from env or use default
      const envExpiry = process.env.LIBRAGEN_TASK_EXPIRY_MS;

      this.taskExpiryMs = config.taskExpiryMs
         ?? (envExpiry ? parseInt(envExpiry, 10) : DEFAULT_EXPIRY_MS);

      // Start cleanup interval (every 5 minutes)
      this._cleanupInterval = setInterval(() => {
         this.cleanupExpiredTasks();
      }, 5 * 60 * 1000);

      // Don't keep process alive just for cleanup
      this._cleanupInterval.unref();
   }

   /**
    * Create a new build task and add it to the queue.
    */
   public createTask(
      params: BuildParams,
      sendProgress?: BuildTask['sendProgress']
   ): BuildTask {
      const task: BuildTask = {
         id: randomUUID(),
         status: 'queued',
         progress: 0,
         currentStep: 'Queued',
         params,
         createdAt: new Date(),
         sendProgress,
      };

      this._tasks.set(task.id, task);
      this._queue.push(task.id);

      return task;
   }

   /**
    * Get a task by ID.
    */
   public getTask(id: string): BuildTask | undefined {
      return this._tasks.get(id);
   }

   /**
    * Update a task's properties.
    */
   public updateTask(id: string, updates: Partial<BuildTask>): void {
      const task = this._tasks.get(id);

      if (task) {
         Object.assign(task, updates);

         // Send progress notification if available
         if (updates.progress !== undefined && task.sendProgress) {
            task.sendProgress({
               progress: updates.progress,
               total: 100,
               message: updates.currentStep ?? task.currentStep,
            });
         }
      }
   }

   /**
    * Mark a task as started (running).
    */
   public markRunning(id: string): void {
      const task = this._tasks.get(id);

      if (task && task.status === 'queued') {
         task.status = 'running';
         task.currentStep = 'Starting...';
         this._runningCount += 1;

         // Remove from queue
         const queueIndex = this._queue.indexOf(id);

         if (queueIndex !== -1) {
            this._queue.splice(queueIndex, 1);
         }
      }
   }

   /**
    * Mark a task as completed with result.
    */
   public markCompleted(id: string, result: string): void {
      const task = this._tasks.get(id);

      if (task && task.status === 'running') {
         task.status = 'completed';
         task.progress = 100;
         task.currentStep = 'Completed';
         task.result = result;
         task.completedAt = new Date();
         this._runningCount -= 1;
         this.processQueue();
      }
   }

   /**
    * Mark a task as failed with error.
    */
   public markFailed(id: string, error: string): void {
      const task = this._tasks.get(id);

      if (task && (task.status === 'running' || task.status === 'queued')) {
         const wasRunning = task.status === 'running';

         task.status = 'failed';
         task.currentStep = 'Failed';
         task.error = error;
         task.completedAt = new Date();

         if (wasRunning) {
            this._runningCount -= 1;
         } else {
            // Remove from queue
            const queueIndex = this._queue.indexOf(id);

            if (queueIndex !== -1) {
               this._queue.splice(queueIndex, 1);
            }
         }

         this.processQueue();
      }
   }

   /**
    * Cancel a task. Returns true if cancelled, false if not found or already completed.
    */
   public cancelTask(id: string): boolean {
      const task = this._tasks.get(id);

      if (!task) {
         return false;
      }

      if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
         return false;
      }

      const wasRunning = task.status === 'running';

      task.status = 'cancelled';
      task.currentStep = 'Cancelled';
      task.completedAt = new Date();

      if (wasRunning) {
         this._runningCount -= 1;
      } else {
         // Remove from queue
         const queueIndex = this._queue.indexOf(id);

         if (queueIndex !== -1) {
            this._queue.splice(queueIndex, 1);
         }
      }

      this.processQueue();

      return true;
   }

   /**
    * Get the number of currently running tasks.
    */
   public getRunningCount(): number {
      return this._runningCount;
   }

   /**
    * Get the number of queued tasks.
    */
   public getQueueLength(): number {
      return this._queue.length;
   }

   /**
    * Check if we can start more tasks and trigger onTaskReady for next queued task.
    */
   public processQueue(): void {
      while (this._runningCount < this.maxConcurrent && this._queue.length > 0) {
         const taskId = this._queue[0],
               task = this._tasks.get(taskId);

         if (task && task.status === 'queued' && this.onTaskReady) {
            this.onTaskReady(task);
         } else {
            // Task was removed or invalid, skip it
            this._queue.shift();
         }

         // Only process one at a time - onTaskReady should call markRunning
         // which will remove from queue and allow next iteration
         break;
      }
   }

   /**
    * Remove expired completed/failed/cancelled tasks.
    */
   public cleanupExpiredTasks(): void {
      const now = Date.now();

      for (const [ id, task ] of this._tasks) {
         if (task.completedAt) {
            const age = now - task.completedAt.getTime();

            if (age > this.taskExpiryMs) {
               this._tasks.delete(id);
            }
         }
      }
   }

   /**
    * Get all tasks (for debugging/monitoring).
    */
   public getAllTasks(): BuildTask[] {
      return Array.from(this._tasks.values());
   }

   /**
    * Shutdown the task manager.
    */
   public shutdown(): void {
      if (this._cleanupInterval) {
         clearInterval(this._cleanupInterval);
         this._cleanupInterval = null;
      }
   }
}

/** Singleton instance */
let instance: TaskManager | null = null;

/**
 * Get the singleton TaskManager instance.
 */
export function getTaskManager(config?: TaskManagerConfig): TaskManager {
   if (!instance) {
      instance = new TaskManager(config);
   }

   return instance;
}

/**
 * Reset the singleton (for testing).
 */
export function resetTaskManager(): void {
   if (instance) {
      instance.shutdown();
      instance = null;
   }
}

/**
 * Tests for TaskManager
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
   TaskManager,
   getTaskManager,
   resetTaskManager,
   type BuildParams,
} from '../tasks/task-manager.ts';

describe('TaskManager', () => {
   let manager: TaskManager;

   beforeEach(() => {
      resetTaskManager();
      manager = new TaskManager({ maxConcurrent: 2, taskExpiryMs: 1000 });
   });

   afterEach(() => {
      manager.shutdown();
   });

   describe('createTask', () => {
      it('creates a task with queued status', () => {
         const params: BuildParams = { source: '/test/path' },
               task = manager.createTask(params);

         expect(task.id).toBeDefined();
         expect(task.status).toBe('queued');
         expect(task.progress).toBe(0);
         expect(task.currentStep).toBe('Queued');
         expect(task.params).toEqual(params);
         expect(task.createdAt).toBeInstanceOf(Date);
      });

      it('generates unique task IDs', () => {
         const task1 = manager.createTask({ source: '/test/1' }),
               task2 = manager.createTask({ source: '/test/2' });

         expect(task1.id).not.toBe(task2.id);
      });

      it('adds task to queue', () => {
         manager.createTask({ source: '/test/1' });
         manager.createTask({ source: '/test/2' });

         expect(manager.getQueueLength()).toBe(2);
      });
   });

   describe('getTask', () => {
      it('returns task by ID', () => {
         const created = manager.createTask({ source: '/test' }),
               retrieved = manager.getTask(created.id);

         expect(retrieved).toBe(created);
      });

      it('returns undefined for unknown ID', () => {
         const task = manager.getTask('nonexistent');

         expect(task).toBeUndefined();
      });
   });

   describe('updateTask', () => {
      it('updates task properties', () => {
         const task = manager.createTask({ source: '/test' });

         manager.updateTask(task.id, {
            progress: 50,
            currentStep: 'Processing...',
         });

         expect(task.progress).toBe(50);
         expect(task.currentStep).toBe('Processing...');
      });

      it('calls sendProgress callback when progress updates', () => {
         const sendProgress = vi.fn(),
               task = manager.createTask({ source: '/test' }, sendProgress);

         manager.updateTask(task.id, {
            progress: 75,
            currentStep: 'Almost done',
         });

         expect(sendProgress).toHaveBeenCalledWith({
            progress: 75,
            total: 100,
            message: 'Almost done',
         });
      });

      it('does nothing for unknown task ID', () => {
         // Should not throw
         manager.updateTask('nonexistent', { progress: 50 });
      });
   });

   describe('markRunning', () => {
      it('changes status from queued to running', () => {
         const task = manager.createTask({ source: '/test' });

         manager.markRunning(task.id);

         expect(task.status).toBe('running');
         expect(manager.getRunningCount()).toBe(1);
         expect(manager.getQueueLength()).toBe(0);
      });

      it('does not change non-queued tasks', () => {
         const task = manager.createTask({ source: '/test' });

         manager.markRunning(task.id);
         manager.markCompleted(task.id, 'Done');

         // Try to mark running again
         manager.markRunning(task.id);

         expect(task.status).toBe('completed');
      });
   });

   describe('markCompleted', () => {
      it('changes status to completed with result', () => {
         const task = manager.createTask({ source: '/test' });

         manager.markRunning(task.id);
         manager.markCompleted(task.id, 'Build successful');

         expect(task.status).toBe('completed');
         expect(task.progress).toBe(100);
         expect(task.result).toBe('Build successful');
         expect(task.completedAt).toBeInstanceOf(Date);
         expect(manager.getRunningCount()).toBe(0);
      });
   });

   describe('markFailed', () => {
      it('changes status to failed with error', () => {
         const task = manager.createTask({ source: '/test' });

         manager.markRunning(task.id);
         manager.markFailed(task.id, 'Something went wrong');

         expect(task.status).toBe('failed');
         expect(task.error).toBe('Something went wrong');
         expect(task.completedAt).toBeInstanceOf(Date);
         expect(manager.getRunningCount()).toBe(0);
      });

      it('can fail queued tasks', () => {
         const task = manager.createTask({ source: '/test' });

         manager.markFailed(task.id, 'Cancelled before start');

         expect(task.status).toBe('failed');
         expect(manager.getQueueLength()).toBe(0);
      });
   });

   describe('cancelTask', () => {
      it('cancels queued task', () => {
         const task = manager.createTask({ source: '/test' });

         const result = manager.cancelTask(task.id);

         expect(result).toBe(true);
         expect(task.status).toBe('cancelled');
         expect(manager.getQueueLength()).toBe(0);
      });

      it('cancels running task', () => {
         const task = manager.createTask({ source: '/test' });

         manager.markRunning(task.id);
         const result = manager.cancelTask(task.id);

         expect(result).toBe(true);
         expect(task.status).toBe('cancelled');
         expect(manager.getRunningCount()).toBe(0);
      });

      it('returns false for completed task', () => {
         const task = manager.createTask({ source: '/test' });

         manager.markRunning(task.id);
         manager.markCompleted(task.id, 'Done');

         const result = manager.cancelTask(task.id);

         expect(result).toBe(false);
         expect(task.status).toBe('completed');
      });

      it('returns false for unknown task', () => {
         const result = manager.cancelTask('nonexistent');

         expect(result).toBe(false);
      });
   });

   describe('processQueue', () => {
      it('triggers onTaskReady for queued tasks', () => {
         const onTaskReady = vi.fn();

         manager.onTaskReady = onTaskReady;

         const task = manager.createTask({ source: '/test' });

         manager.processQueue();

         expect(onTaskReady).toHaveBeenCalledWith(task);
      });

      it('respects maxConcurrent limit', () => {
         const onTaskReady = vi.fn((task) => {
            manager.markRunning(task.id);
         });

         manager.onTaskReady = onTaskReady;

         manager.createTask({ source: '/test/1' });
         manager.createTask({ source: '/test/2' });
         manager.createTask({ source: '/test/3' });

         manager.processQueue();
         manager.processQueue();
         manager.processQueue();

         // Only 2 should be running (maxConcurrent = 2)
         expect(manager.getRunningCount()).toBe(2);
         expect(manager.getQueueLength()).toBe(1);
      });

      it('processes queue when task completes', () => {
         const startedTasks: string[] = [];

         const onTaskReady = vi.fn((task) => {
            startedTasks.push(task.id);
            manager.markRunning(task.id);
         });

         manager.onTaskReady = onTaskReady;

         const task1 = manager.createTask({ source: '/test/1' });

         manager.createTask({ source: '/test/2' });
         manager.createTask({ source: '/test/3' });

         manager.processQueue();
         manager.processQueue();

         // Complete first task
         manager.markCompleted(task1.id, 'Done');

         // Third task should now be started
         expect(manager.getRunningCount()).toBe(2);
         expect(manager.getQueueLength()).toBe(0);
         expect(startedTasks.length).toBe(3);
      });
   });

   describe('cleanupExpiredTasks', () => {
      it('removes expired completed tasks', async () => {
         const task = manager.createTask({ source: '/test' });

         manager.markRunning(task.id);
         manager.markCompleted(task.id, 'Done');

         // Wait for expiry (taskExpiryMs = 1000)
         await new Promise((resolve) => {
            return setTimeout(resolve, 1100);
         });

         manager.cleanupExpiredTasks();

         expect(manager.getTask(task.id)).toBeUndefined();
      });

      it('keeps non-expired tasks', () => {
         const task = manager.createTask({ source: '/test' });

         manager.markRunning(task.id);
         manager.markCompleted(task.id, 'Done');

         manager.cleanupExpiredTasks();

         expect(manager.getTask(task.id)).toBeDefined();
      });

      it('keeps running tasks', async () => {
         const task = manager.createTask({ source: '/test' });

         manager.markRunning(task.id);

         await new Promise((resolve) => {
            return setTimeout(resolve, 1100);
         });

         manager.cleanupExpiredTasks();

         // Running tasks should not be cleaned up
         expect(manager.getTask(task.id)).toBeDefined();
      });
   });

   describe('singleton', () => {
      it('returns same instance', () => {
         resetTaskManager();

         const instance1 = getTaskManager(),
               instance2 = getTaskManager();

         expect(instance1).toBe(instance2);

         instance1.shutdown();
      });

      it('respects config on first call', () => {
         resetTaskManager();
         const instance = getTaskManager({ maxConcurrent: 5 });

         expect(instance.maxConcurrent).toBe(5);

         instance.shutdown();
      });
   });

   describe('concurrency defaults', () => {
      it('defaults maxConcurrent to cpus - 1', () => {
         const defaultManager = new TaskManager();

         // Should be at least 1
         expect(defaultManager.maxConcurrent).toBeGreaterThanOrEqual(1);

         defaultManager.shutdown();
      });
   });
});

/**
 * Task Manager
 *
 * Manages the task lifecycle with dependency-aware scheduling.
 * Combines GSD-2's hierarchical breakdown (milestones > slices > tasks)
 * with Paperclip's atomic checkout and goal ancestry.
 *
 * Tasks flow through: pending → queued → in_progress → review → completed
 *                                                    ↘ failed
 *                                        blocked ↗
 */

import type { Task, TaskStatus, TaskPriority, TaskResult, Wave, CoordinationStrategy } from './types.js';

let taskCounter = 0;
function generateId(): string {
  return `task_${Date.now()}_${++taskCounter}`;
}

export class TaskManager {
  private tasks = new Map<string, Task>();

  /** Create a new task */
  create(params: {
    title: string;
    description: string;
    priority?: TaskPriority;
    parentId?: string;
    dependsOn?: string[];
    goalChain?: string[];
    contextFiles?: string[];
    tags?: string[];
  }): Task {
    const now = new Date();

    // Inherit goal chain from parent if not provided
    let goalChain = params.goalChain || [];
    if (params.parentId) {
      const parent = this.get(params.parentId);
      goalChain = [...parent.goalChain, parent.title];
    }

    const task: Task = {
      id: generateId(),
      title: params.title,
      description: params.description,
      status: 'pending',
      priority: params.priority || 'normal',
      dependsOn: params.dependsOn || [],
      goalChain,
      contextFiles: params.contextFiles || [],
      tags: params.tags || [],
      createdAt: now,
      updatedAt: now,
    };

    // Validate dependencies exist
    for (const depId of task.dependsOn) {
      if (!this.tasks.has(depId)) {
        throw new Error(`Dependency task "${depId}" not found`);
      }
    }

    this.tasks.set(task.id, task);
    return task;
  }

  /** Get a task by ID */
  get(taskId: string): Task {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`Task "${taskId}" not found`);
    return task;
  }

  /** List tasks with optional filters */
  list(filter?: {
    status?: TaskStatus;
    assigneeId?: string;
    parentId?: string;
    tags?: string[];
  }): Task[] {
    let tasks = Array.from(this.tasks.values());
    if (filter?.status) tasks = tasks.filter(t => t.status === filter.status);
    if (filter?.assigneeId) tasks = tasks.filter(t => t.assigneeId === filter.assigneeId);
    if (filter?.parentId) tasks = tasks.filter(t => t.parentId === filter.parentId);
    if (filter?.tags?.length) {
      tasks = tasks.filter(t => filter.tags!.some(tag => t.tags.includes(tag)));
    }
    return tasks;
  }

  /** Transition a task to a new status */
  transition(taskId: string, newStatus: TaskStatus): Task {
    const task = this.get(taskId);
    const validTransitions: Record<TaskStatus, TaskStatus[]> = {
      pending: ['queued', 'blocked'],
      queued: ['in_progress', 'blocked'],
      blocked: ['queued', 'pending'],
      in_progress: ['review', 'completed', 'failed'],
      review: ['completed', 'in_progress', 'failed'],
      completed: [],
      failed: ['pending', 'queued'],
    };

    if (!validTransitions[task.status]?.includes(newStatus)) {
      throw new Error(`Invalid transition: ${task.status} → ${newStatus} for task "${taskId}"`);
    }

    task.status = newStatus;
    task.updatedAt = new Date();

    if (newStatus === 'in_progress' && !task.startedAt) {
      task.startedAt = new Date();
    }
    if (newStatus === 'completed' || newStatus === 'failed') {
      task.completedAt = new Date();
    }

    return task;
  }

  /** Assign a task to an agent (atomic — clears any previous assignee) */
  assign(taskId: string, agentId: string): Task {
    const task = this.get(taskId);
    if (task.assigneeId && task.status === 'in_progress') {
      throw new Error(`Task "${taskId}" is already checked out by agent "${task.assigneeId}"`);
    }
    task.assigneeId = agentId;
    task.updatedAt = new Date();
    return task;
  }

  /** Complete a task with a result */
  complete(taskId: string, result: TaskResult): Task {
    const task = this.get(taskId);
    task.result = result;
    return this.transition(taskId, 'completed');
  }

  /** Check if all dependencies of a task are completed */
  isReady(taskId: string): boolean {
    const task = this.get(taskId);
    return task.dependsOn.every(depId => {
      const dep = this.tasks.get(depId);
      return dep?.status === 'completed';
    });
  }

  /** Get all tasks that are ready to be worked on (dependencies met, not assigned) */
  getReady(): Task[] {
    return this.list({ status: 'pending' })
      .filter(task => this.isReady(task.id))
      .sort((a, b) => {
        const priorityOrder: Record<TaskPriority, number> = { critical: 0, high: 1, normal: 2, low: 3 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });
  }

  /**
   * Compute execution waves — groups of tasks that can run in parallel.
   * Inspired by GSD-2's wave-based scheduling.
   *
   * Wave 0: tasks with no dependencies
   * Wave 1: tasks whose dependencies are all in wave 0
   * Wave N: tasks whose dependencies are all in waves < N
   */
  computeWaves(): Wave[] {
    const waves: Wave[] = [];
    const assigned = new Set<string>();
    const pending = new Set(
      this.list()
        .filter(t => t.status !== 'completed' && t.status !== 'failed')
        .map(t => t.id)
    );

    let order = 0;
    while (pending.size > 0) {
      const waveTaskIds: string[] = [];

      for (const taskId of pending) {
        const task = this.get(taskId);
        const depsResolved = task.dependsOn.every(
          depId => assigned.has(depId) || this.get(depId).status === 'completed'
        );
        if (depsResolved) {
          waveTaskIds.push(taskId);
        }
      }

      if (waveTaskIds.length === 0) {
        // Circular dependency or all remaining tasks are blocked
        break;
      }

      waves.push({ order, taskIds: waveTaskIds });
      for (const id of waveTaskIds) {
        assigned.add(id);
        pending.delete(id);
      }
      order++;
    }

    return waves;
  }

  /** Get subtasks of a parent task */
  getChildren(parentId: string): Task[] {
    return this.list({ parentId });
  }
}

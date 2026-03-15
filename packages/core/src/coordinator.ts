/**
 * Coordinator
 *
 * Orchestrates (via Jacbot) the interaction between agents and tasks.
 * Uses git-based coordination: agents work on branches, changes get diffed,
 * merge conflicts become first-class events.
 *
 * Supports three strategies:
 * - sequential: one task at a time
 * - parallel: all ready tasks dispatched simultaneously
 * - wave: dependency-aware batching (GSD-2 style)
 */

import type { AgentConfig, CoordinationEvent, CoordinationStrategy, Task, TaskResult, Wave } from './types.js';
import { AgentManager } from './agent.js';
import { TaskManager } from './task.js';

export interface DispatchResult {
  taskId: string;
  agentId: string;
  branch: string;
}

export type EventHandler = (event: CoordinationEvent) => void | Promise<void>;

export class Coordinator {
  private strategy: CoordinationStrategy;
  private eventHandlers: EventHandler[] = [];
  private agentManager: AgentManager;
  private taskManager: TaskManager;

  constructor(
    agentManager: AgentManager,
    taskManager: TaskManager,
    strategy: CoordinationStrategy = 'wave',
  ) {
    this.agentManager = agentManager;
    this.taskManager = taskManager;
    this.strategy = strategy;
  }

  /** Subscribe to coordination events */
  on(handler: EventHandler): void {
    this.eventHandlers.push(handler);
  }

  /** Emit a coordination event */
  private async emit(event: CoordinationEvent): Promise<void> {
    for (const handler of this.eventHandlers) {
      await handler(event);
    }
  }

  /**
   * Run the next dispatch cycle.
   * Returns the tasks that were dispatched to agents.
   */
  async dispatch(): Promise<DispatchResult[]> {
    const results: DispatchResult[] = [];

    switch (this.strategy) {
      case 'sequential': {
        const ready = this.taskManager.getReady();
        if (ready.length > 0) {
          const result = await this.dispatchTask(ready[0]);
          if (result) results.push(result);
        }
        break;
      }

      case 'parallel': {
        const ready = this.taskManager.getReady();
        for (const task of ready) {
          const result = await this.dispatchTask(task);
          if (result) results.push(result);
        }
        break;
      }

      case 'wave': {
        const waves = this.taskManager.computeWaves();
        const currentWave = waves[0];
        if (currentWave) {
          for (const taskId of currentWave.taskIds) {
            const task = this.taskManager.get(taskId);
            if (task.status === 'pending') {
              const result = await this.dispatchTask(task);
              if (result) results.push(result);
            }
          }
        }
        break;
      }
    }

    return results;
  }

  /** Dispatch a single task to the best available agent */
  private async dispatchTask(task: Task): Promise<DispatchResult | null> {
    // Find available agents with matching capabilities
    const available = this.agentManager.findAvailable(
      task.tags.length > 0 ? task.tags : undefined
    );

    if (available.length === 0) return null;

    // Simple strategy: pick the first available agent
    // Future: smarter matching based on agent specialization, load, cost
    const agent = available[0];

    // Atomic checkout
    const success = this.agentManager.checkout(agent.id, task);
    if (!success) return null;

    // Assign task
    this.taskManager.assign(task.id, agent.id);
    this.taskManager.transition(task.id, 'queued');
    this.taskManager.transition(task.id, 'in_progress');

    // Generate branch name
    const branch = this.generateBranchName(task);
    task.branch = branch;

    await this.emit({
      type: 'task_assigned',
      taskId: task.id,
      agentId: agent.id,
      payload: { branch },
      timestamp: new Date(),
    });

    return {
      taskId: task.id,
      agentId: agent.id,
      branch,
    };
  }

  /** Mark a task as completed and release the agent */
  async completeTask(taskId: string, result: TaskResult): Promise<void> {
    const task = this.taskManager.get(taskId);
    const agentId = task.assigneeId;

    this.taskManager.complete(taskId, result);

    if (agentId) {
      this.agentManager.release(agentId);

      await this.emit({
        type: 'task_completed',
        taskId,
        agentId,
        payload: { result },
        timestamp: new Date(),
      });
    }
  }

  /** Mark a task as failed and release the agent */
  async failTask(taskId: string, error: Error): Promise<void> {
    const task = this.taskManager.get(taskId);
    const agentId = task.assigneeId;

    this.taskManager.transition(taskId, 'failed');

    if (agentId) {
      this.agentManager.release(agentId);

      await this.emit({
        type: 'task_failed',
        taskId,
        agentId,
        payload: { error: error.message },
        timestamp: new Date(),
      });
    }
  }

  /** Generate a git branch name for a task */
  private generateBranchName(task: Task): string {
    const slug = task.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40);
    return `jacbot/${task.id.split('_')[1]}-${slug}`;
  }

  /** Get current waves for visibility */
  getWaves(): Wave[] {
    return this.taskManager.computeWaves();
  }

  /** Set coordination strategy */
  setStrategy(strategy: CoordinationStrategy): void {
    this.strategy = strategy;
  }
}

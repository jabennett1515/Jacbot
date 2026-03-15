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
    // Try to find agents whose capabilities overlap with task tags (preference, not hard filter)
    let available = this.agentManager.findAvailable(
      task.tags.length > 0 ? task.tags : undefined
    );

    // If no agents match capabilities, fall back to any idle agent
    if (available.length === 0) {
      available = this.agentManager.findAvailable();
    }

    if (available.length === 0) return null;

    // Pick the best match: prefer agents with more overlapping capabilities
    const agent = this.pickBestAgent(available, task);

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
    return `jacbot/${task.id}`;
  }

  /** Pick the best agent for a task based on capability overlap */
  private pickBestAgent(agents: AgentConfig[], task: Task): AgentConfig {
    if (task.tags.length === 0 || agents.length === 1) return agents[0];

    // Score by how many task tags match agent capabilities
    let best = agents[0];
    let bestScore = 0;

    for (const agent of agents) {
      const caps = agent.capabilities || [];
      const score = task.tags.filter(t => caps.includes(t)).length;
      // Prefer lead agents for higher-priority tasks
      const roleBonus = agent.role === 'lead' && task.priority === 'high' ? 1 : 0;
      if (score + roleBonus > bestScore) {
        bestScore = score + roleBonus;
        best = agent;
      }
    }

    return best;
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

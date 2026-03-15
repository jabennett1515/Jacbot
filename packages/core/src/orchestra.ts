/**
 * Jacbot — The Main Entrypoint
 *
 * This is the high-level API that ties together agents, tasks,
 * memory, coordination, and state persistence.
 *
 * Designed for simplicity: 4 core methods cover 90% of use cases.
 */

import type {
  AgentConfig,
  Task,
  TaskPriority,
  TaskResult,
  CoordinationStrategy,
  CoordinationEvent,
  ProjectConfig,
} from './types.js';
import { AgentManager } from './agent.js';
import { TaskManager } from './task.js';
import { Coordinator, type DispatchResult, type EventHandler } from './coordinator.js';
import { StateStore } from './state.js';

export interface JacbotOptions {
  /** Project name */
  name: string;
  /** High-level mission (top of goal chain for all tasks) */
  mission: string;
  /** Coordination strategy (default: 'wave') */
  strategy?: CoordinationStrategy;
  /** Path to state directory (default: '.jacbot') */
  statePath?: string;
  /** Global budget ceiling in USD */
  budgetCeiling?: number;
}

export class Jacbot {
  readonly agents: AgentManager;
  readonly tasks: TaskManager;
  readonly coordinator: Coordinator;
  readonly state: StateStore;
  readonly config: ProjectConfig;

  constructor(options: JacbotOptions) {
    this.agents = new AgentManager();
    this.tasks = new TaskManager();
    this.coordinator = new Coordinator(
      this.agents,
      this.tasks,
      options.strategy || 'wave',
    );
    this.state = new StateStore(options.statePath || '.jacbot');

    this.config = {
      name: options.name,
      mission: options.mission,
      agents: [],
      coordination: options.strategy || 'wave',
      budgetCeiling: options.budgetCeiling,
      statePath: options.statePath || '.jacbot',
    };

    // Auto-persist events
    this.coordinator.on(async (event) => {
      this.state.appendEvent(event);
    });

    // Save project config
    this.state.saveProject(this.config);
  }

  // ─── Core API ───────────────────────────────────────────────────────────

  /**
   * Define and register an agent.
   *
   * @example
   * jacbot.defineAgent({
   *   id: 'claude',
   *   name: 'Claude Code',
   *   role: 'lead',
   *   runtime: 'claude-code',
   *   capabilities: ['typescript', 'testing'],
   *   budgetLimit: 50,
   * });
   */
  defineAgent(config: AgentConfig): void {
    this.agents.register(config);
    this.config.agents.push(config);
    this.state.saveProject(this.config);
    this.state.saveAgent(config, this.agents.getState(config.id));
  }

  /**
   * Create a task with optional dependencies, context files, and goal ancestry.
   *
   * @example
   * const task = jacbot.createTask({
   *   title: 'Set up database schema',
   *   description: 'Create PostgreSQL schema with users and sessions tables',
   *   contextFiles: ['schema.sql', 'src/db.ts'],
   *   tags: ['database'],
   * });
   */
  createTask(params: {
    title: string;
    description: string;
    priority?: TaskPriority;
    parentId?: string;
    dependsOn?: string[];
    contextFiles?: string[];
    tags?: string[];
  }): Task {
    const task = this.tasks.create({
      ...params,
      goalChain: [this.config.mission],
    });
    this.state.saveTask(task);
    return task;
  }

  /**
   * Dispatch ready tasks to available agents.
   * Returns which tasks were assigned to which agents.
   *
   * @example
   * const dispatched = await jacbot.dispatch();
   * for (const { taskId, agentId, branch } of dispatched) {
   *   console.log(`Task ${taskId} → Agent ${agentId} on branch ${branch}`);
   * }
   */
  async dispatch(): Promise<DispatchResult[]> {
    const results = await this.coordinator.dispatch();

    // Persist updated state
    for (const result of results) {
      const task = this.tasks.get(result.taskId);
      const agent = this.agents.get(result.agentId);
      this.state.saveTask(task);
      this.state.saveAgent(agent, this.agents.getState(agent.id));
    }

    return results;
  }

  /**
   * Complete a task with results.
   */
  async completeTask(taskId: string, result: TaskResult): Promise<void> {
    await this.coordinator.completeTask(taskId, result);
    const task = this.tasks.get(taskId);
    this.state.saveTask(task);

    // Persist decisions to the decisions log
    for (const decision of result.decisions) {
      this.state.appendDecision(decision);
    }
  }

  /**
   * Fail a task with an error.
   */
  async failTask(taskId: string, error: Error): Promise<void> {
    await this.coordinator.failTask(taskId, error);
    const task = this.tasks.get(taskId);
    this.state.saveTask(task);
  }

  /** Subscribe to coordination events */
  on(handler: EventHandler): void {
    this.coordinator.on(handler);
  }

  /** Get a status overview */
  status(): {
    agents: { total: number; idle: number; working: number };
    tasks: { total: number; pending: number; inProgress: number; completed: number; failed: number };
    waves: number;
    totalCost: number;
  } {
    const allAgents = this.agents.list();
    const allTasks = this.tasks.list();
    const waves = this.coordinator.getWaves();

    let totalCost = 0;
    for (const agent of allAgents) {
      totalCost += this.agents.getState(agent.id).tokenUsage.estimatedCostUsd;
    }

    return {
      agents: {
        total: allAgents.length,
        idle: allAgents.filter(a => this.agents.getState(a.id).status === 'idle').length,
        working: allAgents.filter(a => this.agents.getState(a.id).status === 'working').length,
      },
      tasks: {
        total: allTasks.length,
        pending: allTasks.filter(t => t.status === 'pending').length,
        inProgress: allTasks.filter(t => t.status === 'in_progress').length,
        completed: allTasks.filter(t => t.status === 'completed').length,
        failed: allTasks.filter(t => t.status === 'failed').length,
      },
      waves: waves.length,
      totalCost,
    };
  }
}

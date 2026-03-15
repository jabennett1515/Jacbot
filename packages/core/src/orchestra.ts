/**
 * Jacbot — The Main Entrypoint
 *
 * This is the high-level API that ties together agents, tasks,
 * memory, coordination, runtime execution, and state persistence.
 *
 * Core API:
 *   defineAgent()     — register an agent with its runtime
 *   createTask()      — create a task with dependencies and context
 *   dispatch()        — assign ready tasks to agents (scheduling only)
 *   run()             — dispatch AND execute tasks via runtime adapters
 *   completeTask()    — mark a task as completed with results
 */

import type {
  AgentConfig,
  Task,
  TaskPriority,
  TaskResult,
  CoordinationStrategy,
  CoordinationEvent,
  MemoryEntry,
  ProjectConfig,
} from './types.js';
import { AgentManager } from './agent.js';
import { TaskManager } from './task.js';
import { Coordinator, type DispatchResult, type EventHandler } from './coordinator.js';
import { StateStore } from './state.js';
import { RuntimeRegistry, type RuntimeAdapter, type RuntimeContext, type RuntimeResult } from './runtime.js';
import type { ObsidianStore } from './obsidian-store.js';

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
  /** Working directory for agent execution (default: process.cwd()) */
  workingDir?: string;
  /** Optional Obsidian vault store — mirrors all state to Obsidian */
  obsidianStore?: ObsidianStore;
}

/** Result of a full run() execution */
export interface RunResult {
  /** Tasks that were dispatched */
  dispatched: DispatchResult[];
  /** Results for each executed task (keyed by task ID) */
  results: Map<string, RuntimeResult>;
  /** Tasks that failed to execute */
  errors: Map<string, Error>;
  /** Total duration in milliseconds */
  durationMs: number;
}

export class Jacbot {
  readonly agents: AgentManager;
  readonly tasks: TaskManager;
  readonly coordinator: Coordinator;
  readonly state: StateStore;
  readonly runtimes: RuntimeRegistry;
  readonly config: ProjectConfig;

  private workingDir: string;
  private obsidian?: ObsidianStore;
  private memoryContextBuilder?: (taskId: string, taskDescription: string, tags: string[]) => Promise<string>;

  constructor(options: JacbotOptions) {
    this.agents = new AgentManager();
    this.tasks = new TaskManager();
    this.coordinator = new Coordinator(
      this.agents,
      this.tasks,
      options.strategy || 'wave',
    );
    this.state = new StateStore(options.statePath || '.jacbot');
    this.runtimes = new RuntimeRegistry();
    this.workingDir = options.workingDir || process.cwd();
    this.obsidian = options.obsidianStore;

    this.config = {
      name: options.name,
      mission: options.mission,
      agents: [],
      coordination: options.strategy || 'wave',
      budgetCeiling: options.budgetCeiling,
      statePath: options.statePath || '.jacbot',
    };

    // Auto-persist events to both stores
    this.coordinator.on(async (event) => {
      this.state.appendEvent(event);
      this.obsidian?.appendEvent(event);
    });
  }

  /** Persist the current project config to disk. Called after mutations (defineAgent, etc.) */
  save(): void {
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
    this.save();
    this.state.saveAgent(config, this.agents.getState(config.id));
    this.obsidian?.saveAgent(config, this.agents.getState(config.id));
  }

  /**
   * Register a runtime adapter for agent execution.
   *
   * @example
   * jacbot.registerRuntime(new ClaudeCodeAdapter({ maxTurns: 20 }));
   */
  registerRuntime(adapter: RuntimeAdapter): void {
    this.runtimes.register(adapter);
  }

  /**
   * Set a memory context builder function.
   * Called before each task execution to pre-load relevant memories.
   *
   * @example
   * jacbot.setMemoryBuilder(async (taskId, desc, tags) => {
   *   return await memoryManager.buildContext(taskId, desc, tags);
   * });
   */
  setMemoryBuilder(builder: (taskId: string, taskDescription: string, tags: string[]) => Promise<string>): void {
    this.memoryContextBuilder = builder;
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
    id?: string;
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
    this.obsidian?.saveTask(task);
    return task;
  }

  /**
   * Dispatch ready tasks to available agents (scheduling only — does NOT execute).
   * Returns which tasks were assigned to which agents.
   *
   * Use `run()` instead if you want tasks to actually be executed.
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
   * Dispatch AND execute tasks via runtime adapters.
   * This is the main method that actually makes agents do work.
   *
   * For wave strategy: executes one wave at a time, all tasks in a wave run in parallel.
   * For sequential: executes one task, waits for completion.
   * For parallel: executes all ready tasks in parallel.
   *
   * @example
   * const run = await jacbot.run();
   * console.log(`Executed ${run.results.size} tasks in ${run.durationMs}ms`);
   * for (const [taskId, result] of run.results) {
   *   console.log(`  ${taskId}: ${result.exitCode} — ${result.summary}`);
   * }
   */
  async run(): Promise<RunResult> {
    const startTime = Date.now();
    const allResults = new Map<string, RuntimeResult>();
    const allErrors = new Map<string, Error>();
    const allDispatched: DispatchResult[] = [];

    // Start an Obsidian run if configured
    let obsidianRunId: string | undefined;
    if (this.obsidian) {
      const taskTitles = this.tasks.list()
        .filter(t => t.status === 'pending' || t.status === 'queued')
        .map(t => t.title);
      const taskIds = this.tasks.list()
        .filter(t => t.status === 'pending' || t.status === 'queued')
        .map(t => t.id);
      obsidianRunId = await this.obsidian.startRun(this.config, taskIds, taskTitles);

      // Save waves to Obsidian
      const waves = this.coordinator.getWaves();
      if (waves.length > 0) {
        await this.obsidian.saveWaves(waves, this.tasks.list());
      }
    }

    // Keep running waves until nothing more can be dispatched
    let keepGoing = true;
    while (keepGoing) {
      const dispatched = await this.dispatch();

      if (dispatched.length === 0) {
        keepGoing = false;
        break;
      }

      allDispatched.push(...dispatched);

      // Execute all dispatched tasks in parallel
      const executions = dispatched.map(async (d) => {
        const task = this.tasks.get(d.taskId);
        const agent = this.agents.get(d.agentId);

        try {
          // Build runtime context
          const context = await this.buildRuntimeContext(task, agent, d.branch);

          // Get the right adapter
          const adapter = this.runtimes.get(agent.runtime);

          // Execute
          const result = await adapter.execute(task, agent, context);

          // Record usage
          this.agents.recordUsage(agent.id, result.usage);

          // Complete or partially complete
          const taskResult: TaskResult = {
            summary: result.summary,
            filesChanged: result.filesChanged,
            decisions: result.decisions,
            exitCode: result.exitCode,
          };

          if (result.exitCode === 'failed') {
            await this.failTask(d.taskId, new Error(result.summary));
          } else {
            await this.completeTask(d.taskId, taskResult);

            // Auto-store memories: persist task summary and decisions
            this.storeTaskMemory(d.taskId, taskResult);
          }

          allResults.set(d.taskId, result);
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          allErrors.set(d.taskId, error);
          await this.failTask(d.taskId, error);
        }
      });

      // Wait for all tasks in this batch to complete
      await Promise.allSettled(executions);

      // Check global budget
      if (this.config.budgetCeiling) {
        const currentCost = this.getTotalCost();
        if (currentCost >= this.config.budgetCeiling) {
          keepGoing = false;
        }
      }
    }

    // Complete the Obsidian run
    if (this.obsidian && obsidianRunId) {
      await this.obsidian.completeRun(obsidianRunId, this.getTotalCost());
    }

    return {
      dispatched: allDispatched,
      results: allResults,
      errors: allErrors,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Complete a task with results.
   */
  async completeTask(taskId: string, result: TaskResult): Promise<void> {
    await this.coordinator.completeTask(taskId, result);
    const task = this.tasks.get(taskId);
    this.state.saveTask(task);
    this.obsidian?.saveTask(task);

    // Persist decisions to the decisions log
    for (const decision of result.decisions) {
      this.state.appendDecision(decision);
      this.obsidian?.saveDecision(decision, {
        sourceTaskId: taskId,
        sourceTaskTitle: task.title,
        agentId: task.assigneeId,
      });
    }
  }

  /**
   * Fail a task with an error.
   */
  async failTask(taskId: string, error: Error): Promise<void> {
    await this.coordinator.failTask(taskId, error);
    const task = this.tasks.get(taskId);
    this.state.saveTask(task);
    this.obsidian?.saveTask(task);
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
      totalCost: this.getTotalCost(),
    };
  }

  /** Check which registered runtime adapters are actually available */
  async checkRuntimes(): Promise<Record<string, boolean>> {
    return this.runtimes.checkAvailability();
  }

  /**
   * Initialize the Obsidian vault structure.
   * Creates the full directory tree, dashboard, MOCs, templates, etc.
   * Call this once when setting up a new project with --obsidian.
   */
  async initObsidianVault(): Promise<void> {
    if (!this.obsidian) return;
    await this.obsidian.initVault(this.config);

    // Save current agents and tasks to vault
    for (const agent of this.agents.list()) {
      await this.obsidian.saveAgent(agent, this.agents.getState(agent.id));
    }
    for (const task of this.tasks.list()) {
      await this.obsidian.saveTask(task);
    }

    // Save waves
    const waves = this.coordinator.getWaves();
    if (waves.length > 0) {
      await this.obsidian.saveWaves(waves, this.tasks.list());
    }
  }

  /** Get the Obsidian store (or undefined if not configured) */
  getObsidianStore(): ObsidianStore | undefined {
    return this.obsidian;
  }

  // ─── Internal ─────────────────────────────────────────────────────────

  private async buildRuntimeContext(task: Task, agent: AgentConfig, branch: string): Promise<RuntimeContext> {
    let memoryContext = '';
    if (this.memoryContextBuilder) {
      try {
        memoryContext = await this.memoryContextBuilder(task.id, task.description, task.tags);
      } catch {
        // Memory recall failure shouldn't block execution
        memoryContext = '';
      }
    }

    return {
      memoryContext,
      workingDir: this.workingDir,
      branch,
      mission: this.config.mission,
      agentInstructions: agent.instructions,
    };
  }

  /**
   * Persist task results as memory entries to the state store.
   * Stores the task summary as a session-scoped memory,
   * and each decision as a project-scoped memory (decisions persist long-term).
   */
  private storeTaskMemory(taskId: string, result: TaskResult): void {
    let memCounter = Date.now();

    // Look up task title for Obsidian context
    let taskTitle = taskId;
    try { taskTitle = this.tasks.get(taskId).title; } catch { /* ok */ }
    const assigneeId = (() => { try { return this.tasks.get(taskId).assigneeId; } catch { return undefined; } })();

    // Store task summary as session-scoped memory
    const summaryEntry: MemoryEntry = {
      id: `mem_${taskId}_summary`,
      scope: 'session',
      content: `Task ${taskId} completed: ${result.summary}`,
      sourceId: taskId,
      tags: ['task-summary'],
      createdAt: new Date(),
    };
    this.state.saveMemory(summaryEntry);
    this.obsidian?.saveMemory(summaryEntry, { sourceTaskTitle: taskTitle, createdByAgent: assigneeId });

    // Store each decision as project-scoped memory (long-lived)
    for (const decision of result.decisions) {
      const decisionEntry: MemoryEntry = {
        id: `mem_${taskId}_dec_${++memCounter}`,
        scope: 'project',
        content: `Decision: ${decision.description}. Rationale: ${decision.rationale}`,
        sourceId: taskId,
        tags: ['decision'],
        createdAt: new Date(),
      };
      this.state.saveMemory(decisionEntry);
      this.obsidian?.saveMemory(decisionEntry, { sourceTaskTitle: taskTitle, createdByAgent: assigneeId });
    }
  }

  private getTotalCost(): number {
    let totalCost = 0;
    for (const agent of this.agents.list()) {
      totalCost += this.agents.getState(agent.id).tokenUsage.estimatedCostUsd;
    }
    return totalCost;
  }
}

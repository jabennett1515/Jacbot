/**
 * Runtime Adapter
 *
 * The bridge between Jacbot's task orchestration and actual AI agent execution.
 * Each adapter knows how to spawn a specific AI coding agent (Claude Code, Cursor, etc.),
 * feed it a task prompt with context, and collect the result.
 *
 * Adapters are registered on the Jacbot instance and matched to agents by their
 * `runtime` field in AgentConfig.
 */

import type { AgentConfig, Task, TaskResult, TokenUsage, Decision } from './types.js';

// ─── Runtime Adapter Interface ──────────────────────────────────────────────

export interface RuntimeAdapter {
  /** Which runtime this adapter handles (must match AgentConfig.runtime) */
  readonly runtime: string;

  /**
   * Execute a task using this runtime.
   * Called by the coordinator after dispatch assigns a task to an agent.
   *
   * @param task       - The task to execute
   * @param agent      - The agent config (for budget, instructions, etc.)
   * @param context    - Pre-built context string from memory recall
   * @returns          - The result of execution
   */
  execute(task: Task, agent: AgentConfig, context: RuntimeContext): Promise<RuntimeResult>;

  /** Check if this runtime is available (e.g., is `claude` CLI installed?) */
  isAvailable(): Promise<boolean>;

  /** Optional: abort a running task */
  abort?(taskId: string): Promise<void>;
}

/** Context passed to the runtime adapter before execution */
export interface RuntimeContext {
  /** Pre-built memory context string (from recall) */
  memoryContext: string;
  /** The project's working directory */
  workingDir: string;
  /** The git branch to work on */
  branch: string;
  /** Project mission (top of goal chain) */
  mission: string;
  /** Additional instructions from the agent config */
  agentInstructions?: string;
}

/** What the runtime adapter returns after execution */
export interface RuntimeResult {
  /** Exit status */
  exitCode: 'success' | 'partial' | 'failed';
  /** One-line summary of what was accomplished */
  summary: string;
  /** Files that were created or modified */
  filesChanged: string[];
  /** Decisions made during execution */
  decisions: Decision[];
  /** Token usage for cost tracking */
  usage: TokenUsage;
  /** Raw output from the agent (for debugging) */
  rawOutput: string;
  /** Duration in milliseconds */
  durationMs: number;
}

// ─── Runtime Registry ───────────────────────────────────────────────────────

export class RuntimeRegistry {
  private adapters = new Map<string, RuntimeAdapter>();

  /** Register a runtime adapter */
  register(adapter: RuntimeAdapter): void {
    this.adapters.set(adapter.runtime, adapter);
  }

  /** Get the adapter for a given runtime */
  get(runtime: string): RuntimeAdapter {
    const adapter = this.adapters.get(runtime);
    if (!adapter) {
      throw new Error(
        `No runtime adapter registered for "${runtime}". ` +
        `Available: ${Array.from(this.adapters.keys()).join(', ') || 'none'}`,
      );
    }
    return adapter;
  }

  /** Check if an adapter exists */
  has(runtime: string): boolean {
    return this.adapters.has(runtime);
  }

  /** List all registered runtimes */
  list(): string[] {
    return Array.from(this.adapters.keys());
  }

  /** Check which registered runtimes are actually available */
  async checkAvailability(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};
    for (const [name, adapter] of this.adapters) {
      results[name] = await adapter.isAvailable();
    }
    return results;
  }
}

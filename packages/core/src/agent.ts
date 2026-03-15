/**
 * Agent Manager
 *
 * Handles agent lifecycle: registration, state tracking, heartbeat monitoring,
 * and budget enforcement. Inspired by Paperclip's atomic checkout model
 * and GSD-2's subagent specialization.
 */

import type { AgentConfig, AgentState, TokenUsage, Task } from './types.js';

export class AgentManager {
  private agents = new Map<string, AgentConfig>();
  private states = new Map<string, AgentState>();

  /** Register a new agent */
  register(config: AgentConfig): void {
    if (this.agents.has(config.id)) {
      throw new Error(`Agent "${config.id}" is already registered`);
    }
    this.agents.set(config.id, config);
    this.states.set(config.id, {
      id: config.id,
      status: 'idle',
      tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 },
    });
  }

  /** Unregister an agent */
  unregister(agentId: string): void {
    const state = this.getState(agentId);
    if (state.status === 'working') {
      throw new Error(`Cannot unregister agent "${agentId}" while it is working on task "${state.currentTaskId}"`);
    }
    this.agents.delete(agentId);
    this.states.delete(agentId);
  }

  /** Get agent config */
  get(agentId: string): AgentConfig {
    const agent = this.agents.get(agentId);
    if (!agent) throw new Error(`Agent "${agentId}" not found`);
    return agent;
  }

  /** Get agent state */
  getState(agentId: string): AgentState {
    const state = this.states.get(agentId);
    if (!state) throw new Error(`Agent "${agentId}" not found`);
    return state;
  }

  /** List all agents, optionally filtered by role or status */
  list(filter?: { role?: string; status?: string }): AgentConfig[] {
    let agents = Array.from(this.agents.values());
    if (filter?.role) agents = agents.filter(a => a.role === filter.role);
    if (filter?.status) {
      const states = this.states;
      agents = agents.filter(a => states.get(a.id)?.status === filter.status);
    }
    return agents;
  }

  /**
   * Atomic task checkout — assigns a task to an agent.
   * Only one agent can own a task at a time.
   * Returns false if the agent is unavailable (busy, paused, over budget).
   */
  checkout(agentId: string, task: Task): boolean {
    const agent = this.get(agentId);
    const state = this.getState(agentId);

    // Check agent availability
    if (state.status !== 'idle') {
      return false;
    }

    // Check budget
    if (agent.budgetLimit && state.tokenUsage.estimatedCostUsd >= agent.budgetLimit) {
      state.status = 'budget_exceeded';
      return false;
    }

    // Atomic checkout
    state.status = 'working';
    state.currentTaskId = task.id;
    state.lastHeartbeat = new Date();
    return true;
  }

  /** Release a task — agent is done working */
  release(agentId: string): void {
    const state = this.getState(agentId);
    state.status = 'idle';
    state.currentTaskId = undefined;
    state.lastHeartbeat = new Date();
  }

  /** Record token usage for an agent */
  recordUsage(agentId: string, usage: TokenUsage): void {
    const state = this.getState(agentId);
    state.tokenUsage.inputTokens += usage.inputTokens;
    state.tokenUsage.outputTokens += usage.outputTokens;
    state.tokenUsage.totalTokens += usage.totalTokens;
    state.tokenUsage.estimatedCostUsd += usage.estimatedCostUsd;

    // Check budget warning threshold (80%)
    const agent = this.get(agentId);
    if (agent.budgetLimit) {
      const ratio = state.tokenUsage.estimatedCostUsd / agent.budgetLimit;
      if (ratio >= 1.0) {
        state.status = 'budget_exceeded';
      }
    }
  }

  /** Update heartbeat timestamp */
  heartbeat(agentId: string): void {
    const state = this.getState(agentId);
    state.lastHeartbeat = new Date();
  }

  /** Find idle agents that match required capabilities */
  findAvailable(capabilities?: string[]): AgentConfig[] {
    return this.list({ status: 'idle' }).filter(agent => {
      if (!capabilities || capabilities.length === 0) return true;
      return capabilities.every(cap => agent.capabilities?.includes(cap));
    });
  }
}

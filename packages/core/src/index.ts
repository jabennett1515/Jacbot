/**
 * @jacbot/core
 *
 * Lightweight agent orchestration for AI coding agents.
 *
 * Core API:
 *   defineAgent()   — register an agent with its runtime and capabilities
 *   createTask()    — create a task with dependencies and goal context
 *   recall()        — query agent memory (short/medium/long-term)
 *   dispatch()      — coordinate and assign ready tasks to available agents
 *
 * @example
 * ```ts
 * import { Jacbot } from '@jacbot/core';
 *
 * const jacbot = new Jacbot({
 *   name: 'my-project',
 *   mission: 'Build a REST API with authentication',
 * });
 *
 * jacbot.defineAgent({
 *   id: 'claude',
 *   name: 'Claude Code',
 *   role: 'lead',
 *   runtime: 'claude-code',
 *   capabilities: ['typescript', 'api-design'],
 * });
 *
 * const task = jacbot.createTask({
 *   title: 'Implement auth middleware',
 *   description: 'Create JWT-based auth middleware for Express',
 *   contextFiles: ['src/server.ts', 'src/routes/index.ts'],
 * });
 *
 * const dispatched = await jacbot.dispatch();
 * ```
 */

export { Jacbot } from './orchestra.js';
export { AgentManager } from './agent.js';
export { TaskManager } from './task.js';
export { Coordinator } from './coordinator.js';
export { StateStore } from './state.js';
export { ObsidianStore } from './obsidian-store.js';
export type { ObsidianMCPClient } from './obsidian-store.js';

export type {
  AgentConfig,
  AgentRole,
  AgentRuntime,
  AgentState,
  Task,
  TaskStatus,
  TaskPriority,
  TaskResult,
  Decision,
  MemoryEntry,
  MemoryScope,
  RecallQuery,
  RecallResult,
  CoordinationEvent,
  CoordinationStrategy,
  Wave,
  TokenUsage,
  ProjectConfig,
  JacbotEvents,
} from './types.js';

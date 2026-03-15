/**
 * @jacbot/core
 *
 * Lightweight agent orchestration for AI coding agents.
 *
 * Core API:
 *   defineAgent()       — register an agent with its runtime and capabilities
 *   registerRuntime()   — plug in a runtime adapter (e.g., ClaudeCodeAdapter)
 *   createTask()        — create a task with dependencies and goal context
 *   run()               — dispatch and execute all ready tasks
 *   dispatch()          — assign tasks to agents (scheduling only)
 *
 * @example
 * ```ts
 * import { Jacbot } from '@jacbot/core';
 * import { ClaudeCodeAdapter } from '@jacbot/core/adapters/claude-code';
 *
 * const jacbot = new Jacbot({
 *   name: 'my-project',
 *   mission: 'Build a REST API with authentication',
 * });
 *
 * jacbot.registerRuntime(new ClaudeCodeAdapter());
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
 * const run = await jacbot.run();
 * console.log(`Done! ${run.results.size} tasks completed.`);
 * ```
 */

export { Jacbot } from './orchestra.js';
export type { JacbotOptions, RunResult } from './orchestra.js';
export { AgentManager } from './agent.js';
export { TaskManager } from './task.js';
export { Coordinator } from './coordinator.js';
export type { DispatchResult, EventHandler } from './coordinator.js';
export { StateStore } from './state.js';
export { ObsidianStore } from './obsidian-store.js';
export type { ObsidianMCPClient } from './obsidian-store.js';
export { FilesystemObsidianClient } from './obsidian-client.js';
export type { ObsidianClientOptions } from './obsidian-client.js';
export { RuntimeRegistry } from './runtime.js';
export type { RuntimeAdapter, RuntimeContext, RuntimeResult } from './runtime.js';
export { ClaudeCodeAdapter } from './adapters/claude-code.js';
export type { ClaudeCodeOptions } from './adapters/claude-code.js';
export { defineConfig, normalizeAgentConfig, CONFIG_FILE_NAMES } from './config-loader.js';
export type { JacbotConfig, AgentConfigInput, TaskConfigInput } from './config-loader.js';

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

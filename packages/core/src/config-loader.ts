/**
 * Config File Loader
 *
 * Loads a `jacbot.config.ts` (or .js/.mjs) file and returns a fully
 * configured Jacbot instance ready to run.
 *
 * This lets users define everything declaratively:
 *
 * ```ts
 * // jacbot.config.ts
 * import { defineConfig } from '@jacbot/core';
 *
 * export default defineConfig({
 *   name: 'my-project',
 *   mission: 'Build a REST API',
 *   agents: [
 *     { id: 'claude', name: 'Claude', role: 'lead', runtime: 'claude-code' },
 *   ],
 *   tasks: [
 *     { title: 'Set up project', description: '...' },
 *     { title: 'Add auth', description: '...', dependsOn: ['set-up-project'] },
 *   ],
 * });
 * ```
 *
 * Then run: `jacbot run` (auto-detects config file)
 */

import type {
  AgentConfig,
  AgentRole,
  AgentRuntime,
  TaskPriority,
  CoordinationStrategy,
} from './types.js';

// ─── Config Schema ──────────────────────────────────────────────────────────

export interface JacbotConfig {
  /** Project name */
  name: string;
  /** High-level mission (top of goal chain) */
  mission: string;
  /** Coordination strategy (default: 'wave') */
  strategy?: CoordinationStrategy;
  /** Global budget ceiling in USD */
  budgetCeiling?: number;

  /** Agent definitions */
  agents: AgentConfigInput[];
  /** Task definitions */
  tasks?: TaskConfigInput[];

  /** Runtime-specific options */
  runtimes?: {
    'claude-code'?: {
      maxTurns?: number;
      timeoutMs?: number;
      model?: string;
      verbose?: boolean;
    };
  };
}

export interface AgentConfigInput {
  id: string;
  name?: string;
  role?: AgentRole;
  runtime?: AgentRuntime;
  capabilities?: string[];
  budgetLimit?: number;
  instructions?: string;
}

export interface TaskConfigInput {
  id?: string;
  title: string;
  description: string;
  priority?: TaskPriority;
  dependsOn?: string[];
  contextFiles?: string[];
  tags?: string[];
}

/**
 * Helper for type-safe config files.
 * Just returns the config as-is — the real work happens at load time.
 *
 * @example
 * export default defineConfig({ name: 'my-project', mission: '...', agents: [...] });
 */
export function defineConfig(config: JacbotConfig): JacbotConfig {
  return config;
}

/**
 * Normalize agent config input — fill in defaults for optional fields.
 */
export function normalizeAgentConfig(input: AgentConfigInput): AgentConfig {
  return {
    id: input.id,
    name: input.name || input.id,
    role: input.role || 'worker',
    runtime: input.runtime || 'claude-code',
    capabilities: input.capabilities,
    budgetLimit: input.budgetLimit,
    instructions: input.instructions,
  };
}

/** Known config file names, in order of preference */
export const CONFIG_FILE_NAMES = [
  'jacbot.config.ts',
  'jacbot.config.js',
  'jacbot.config.mjs',
];

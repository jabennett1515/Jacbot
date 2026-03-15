/**
 * Jacbot Core Types
 *
 * The type system is designed around three pillars:
 * 1. Agents — who does the work
 * 2. Tasks — what work needs doing
 * 3. Memory — what agents remember across sessions
 */

// ─── Agent Types ────────────────────────────────────────────────────────────

export type AgentRole = 'lead' | 'worker' | 'scout' | 'reviewer' | 'custom';

export type AgentRuntime = 'claude-code' | 'cursor' | 'opencode' | 'gemini-cli' | 'shell' | 'custom';

export interface AgentConfig {
  /** Unique identifier for this agent */
  id: string;
  /** Human-readable name */
  name: string;
  /** Agent's specialization */
  role: AgentRole;
  /** Which runtime executes this agent */
  runtime: AgentRuntime;
  /** Custom runtime command (when runtime is 'custom' or 'shell') */
  command?: string;
  /** System prompt or instructions injected at task start */
  instructions?: string;
  /** Maximum tokens per task context window */
  maxContextTokens?: number;
  /** Monthly budget cap in USD (hard limit, Paperclip-inspired) */
  budgetLimit?: number;
  /** Skills/capabilities this agent has */
  capabilities?: string[];
  /** Metadata */
  meta?: Record<string, unknown>;
}

export interface AgentState {
  id: string;
  status: 'idle' | 'working' | 'paused' | 'error' | 'budget_exceeded';
  currentTaskId?: string;
  tokenUsage: TokenUsage;
  lastHeartbeat?: Date;
}

// ─── Task Types ─────────────────────────────────────────────────────────────

export type TaskStatus =
  | 'pending'
  | 'queued'
  | 'in_progress'
  | 'review'
  | 'completed'
  | 'failed'
  | 'blocked';

export type TaskPriority = 'critical' | 'high' | 'normal' | 'low';

export interface Task {
  /** Unique task identifier */
  id: string;
  /** Short description */
  title: string;
  /** Detailed specification of what needs to be done */
  description: string;
  /** Current lifecycle state */
  status: TaskStatus;
  /** Priority level */
  priority: TaskPriority;
  /** Agent assigned to this task (atomic checkout — only one agent at a time) */
  assigneeId?: string;
  /** Parent task ID (enables hierarchical breakdown like GSD-2) */
  parentId?: string;
  /** Task IDs that must complete before this one can start */
  dependsOn: string[];
  /** Git branch this task operates on */
  branch?: string;
  /** Goal ancestry — traces back to project mission (Paperclip-inspired) */
  goalChain: string[];
  /** Files relevant to this task (pre-loaded into context, GSD-2-inspired) */
  contextFiles: string[];
  /** Tags for filtering and grouping */
  tags: string[];
  /** Token/cost tracking for this task */
  usage?: TokenUsage;
  /** Result summary written by the agent on completion */
  result?: TaskResult;
  /** Timestamps */
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

export interface TaskResult {
  /** One-line summary of what was accomplished */
  summary: string;
  /** Files that were created or modified */
  filesChanged: string[];
  /** Decisions made during execution (persisted to memory) */
  decisions: Decision[];
  /** Exit status */
  exitCode: 'success' | 'partial' | 'failed';
}

export interface Decision {
  /** What was decided */
  description: string;
  /** Why this choice was made */
  rationale: string;
  /** What alternatives were considered */
  alternatives?: string[];
  /** Timestamp */
  madeAt: Date;
}

// ─── Memory Types ───────────────────────────────────────────────────────────

export type MemoryScope = 'task' | 'session' | 'project';

export interface MemoryEntry {
  /** Unique ID */
  id: string;
  /** What scope this memory belongs to */
  scope: MemoryScope;
  /** The content to remember */
  content: string;
  /** Embedding vector for semantic search (populated by memory layer) */
  embedding?: number[];
  /** Source task or session that produced this memory */
  sourceId: string;
  /** Tags for categorical filtering */
  tags: string[];
  /** Relevance score (set during recall queries) */
  relevance?: number;
  /** Timestamps */
  createdAt: Date;
  /** TTL — memories can expire (e.g., task-scoped memories after task completion) */
  expiresAt?: Date;
}

export interface RecallQuery {
  /** Natural language query for semantic search */
  query: string;
  /** Filter by scope */
  scope?: MemoryScope;
  /** Filter by tags */
  tags?: string[];
  /** Max results */
  limit?: number;
  /** Minimum relevance threshold (0-1) */
  minRelevance?: number;
}

export interface RecallResult {
  entries: MemoryEntry[];
  /** Total matching entries (before limit) */
  totalMatches: number;
}

// ─── Coordination Types ─────────────────────────────────────────────────────

export interface CoordinationEvent {
  type: 'task_assigned' | 'task_completed' | 'task_failed' | 'branch_conflict' | 'review_requested' | 'budget_warning';
  taskId: string;
  agentId: string;
  payload: Record<string, unknown>;
  timestamp: Date;
}

export type CoordinationStrategy = 'sequential' | 'parallel' | 'wave';

export interface Wave {
  /** Wave number (sequential ordering) */
  order: number;
  /** Tasks in this wave run in parallel */
  taskIds: string[];
}

// ─── Budget / Usage Types ───────────────────────────────────────────────────

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
}

// ─── Project Types ──────────────────────────────────────────────────────────

export interface ProjectConfig {
  /** Project name */
  name: string;
  /** High-level mission statement (top of goal chain) */
  mission: string;
  /** Registered agents */
  agents: AgentConfig[];
  /** Coordination strategy */
  coordination: CoordinationStrategy;
  /** Global budget ceiling in USD */
  budgetCeiling?: number;
  /** State storage path (defaults to .jacbot/) */
  statePath?: string;
}

// ─── Event Emitter ──────────────────────────────────────────────────────────

export interface JacbotEvents {
  'task:created': (task: Task) => void;
  'task:assigned': (task: Task, agent: AgentConfig) => void;
  'task:completed': (task: Task, result: TaskResult) => void;
  'task:failed': (task: Task, error: Error) => void;
  'agent:heartbeat': (agent: AgentState) => void;
  'agent:budget_warning': (agent: AgentConfig, usage: TokenUsage) => void;
  'memory:stored': (entry: MemoryEntry) => void;
  'coordination:conflict': (event: CoordinationEvent) => void;
}

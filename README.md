# Jacbot

**Agent orchestration with persistent memory and dependency-aware scheduling.**

Jacbot coordinates multiple AI coding agents in parallel, gives them shared memory so they don't lose context between tasks, and persists everything to an Obsidian vault you can actually read.

![Jacbot wave execution](docs/gifs/wave-execution.gif)

---

## The Problem: Agents Forget Everything

AI coding agents are stateless. Every time you spawn one, it starts from zero. This creates three concrete problems when you try to run multiple agents on a real project:

1. **Context evaporates between tasks.** Agent A sets up the database schema with specific column names and constraints. Agent B starts the auth middleware 30 seconds later with zero knowledge of what Agent A decided. It hallucinates a schema, writes code against it, and the whole thing fails at integration.

2. **Decisions are invisible.** Agent A chose bcrypt with 12 salt rounds over argon2 for a specific reason (library compatibility with the deployment target). That rationale exists nowhere. When Agent C touches auth six tasks later, it has no way to know *why* bcrypt was chosen, so it "improves" it to argon2 and breaks the deployment.

3. **There's no shared state layer.** Git branches solve code isolation but not knowledge sharing. Agents working in parallel on different branches can't see each other's architectural decisions, API contracts, or conventions without manually copying context between them.

Jacbot solves this with a three-tier memory system backed by an Obsidian vault — every decision, convention, and task result is stored as a markdown note that agents can query before starting work.

---

## How It Works

![Jacbot architecture overview](docs/gifs/architecture-overview.gif)

### The Run Loop

```
1. Parse task DAG → compute dependency waves
2. For each wave:
   a. Find idle agents with matching capabilities
   b. For each dispatch:
      - memory.buildContext(task) → recall relevant memories
      - adapter.execute(task, agent, context) → spawn subprocess
      - Parse structured result (JACBOT_RESULT block)
      - Store task summary + decisions back into memory
   c. All tasks in wave complete → advance to next wave
3. Write run summary to Obsidian vault
```

Tasks form a directed acyclic graph. Jacbot resolves the DAG into **waves** — groups of tasks whose dependencies are all satisfied. Tasks within a wave execute in parallel. Waves execute sequentially.

```
Wave 0: [project-setup]
Wave 1: [database-schema]
Wave 2: [auth-middleware, crud-endpoints]  ← parallel
Wave 3: [integration-tests]
```

Agents are matched to tasks by capability tags. A task tagged `['auth', 'security']` prefers an agent with those capabilities, but falls back to any idle agent. Assignment is atomic — one agent per task, no contention.

### Runtime Adapters

Jacbot doesn't run your code. It spawns coding agents as subprocesses and collects their output. The `ClaudeCodeAdapter` calls `claude --print --output-format json`, injects the task prompt with memory context, and parses the structured result.

```typescript
// The adapter builds a prompt like this:
`You are an AI coding agent working as part of a coordinated team.
Project mission: ${mission}
Your role: ${agent.role} (${agent.name})

## Task: ${task.title}
${task.description}

## Goal Chain
1. ${mission}
2. ${parentGoal}
3. ${task.title}

## Key Files
${task.contextFiles.map(f => `- ${f}`).join('\n')}

## Relevant Context from Previous Work
${memoryContext}  // ← this is where recalled memories go

## Branch
Work on branch: jacbot/${task.id}

When done, output:
JACBOT_RESULT_START
summary: <one line>
exit_code: success|partial|failed
files_changed:
- <file>
decisions:
- decision: <what>
  rationale: <why>
JACBOT_RESULT_END`
```

The adapter interface is intentionally minimal — implement `execute()` and `abort()` to support any agent runtime.

---

## Memory Architecture

![Memory recall in action](docs/gifs/memory-recall.gif)

This is the core of what Jacbot does differently. The memory system has three scopes, each with different lifetimes and visibility:

### Three-Tier Memory

| Scope | Lifetime | What it stores | Example |
|-------|----------|---------------|---------|
| **Task** | Dies when task completes | Ephemeral working notes | "Tried using pg-promise but switched to Knex for migration support" |
| **Session** | Carries across tasks in a run | Cross-task summaries, contracts | "Auth middleware exports `verifyToken()` that returns `{ userId, role }`" |
| **Project** | Persists indefinitely | Codebase knowledge, conventions | "All API responses use `{ data, error, meta }` envelope format" |

When an agent finishes a task, Jacbot automatically extracts its summary and decisions and stores them as session-scoped memories. Architectural decisions get promoted to project scope.

### How Recall Works Before Each Task

Before dispatching a task, Jacbot calls `memory.buildContext()` which:

1. **Queries by relevance** — bag-of-words embedding + cosine similarity against the task description
2. **Filters by scope** — project memories always included, session memories for current run, task memories only for retries
3. **Filters by tags** — task tagged `['auth']` pulls memories tagged `['auth']` first
4. **Assembles markdown context** — grouped by scope, injected into the agent's prompt

```typescript
// What the agent actually receives:
`## Relevant Context from Previous Work

### Project Knowledge
- All API responses use { data, error, meta } envelope format
- Database uses Knex with PostgreSQL, migrations in src/db/migrations/
- Auth uses bcrypt (12 rounds) — chosen for deployment target compatibility

### Recent Session Context
- Task "database-schema": Created users, sessions, and api_keys tables.
  Key decision: used UUID primary keys instead of auto-increment for
  distributed ID generation.
- Task "auth-middleware": Implemented JWT verification middleware.
  Exports verifyToken() returning { userId, role }.`
```

This is how Agent C knows *why* bcrypt was chosen and *what* the database schema looks like — without reading Agent A's branch or parsing git diffs.

### Memory Backends

**SimpleVectorStore (default):** In-memory bag-of-words embeddings with cosine similarity. No external dependencies. Vocabulary builds incrementally as memories are stored. Good enough for projects with < 1000 memories.

**ObsidianMemoryManager:** Stores memories as `.md` files in the vault. Uses tag-based filtering + full-text search for recall. Tracks which task retrieved which memory (recall provenance). Memories are human-readable and show up in Obsidian's graph view.

---

## Obsidian as the State Layer

![Obsidian graph view](docs/gifs/obsidian-graph.gif)

Most orchestration tools store state in databases or JSON blobs that are opaque to humans. Jacbot stores *everything* as markdown notes in an Obsidian vault. This isn't a nice-to-have visualization layer — it's the primary state store.

### Why Obsidian?

The memory problem with parallel agents is fundamentally a **knowledge graph** problem. You need:

- Typed relationships between entities (agent → task → memory → decision)
- Fast full-text search across all stored knowledge
- A way for humans to inspect, edit, and curate agent memory
- Version control (it's markdown, so `git` works)

Obsidian gives you all of this for free. No database to run, no migrations, no query language to learn. Open the vault and you can see exactly what your agents know, what they decided, and why.

### Vault Structure

```
Jacbot/
├── 00 Dashboard.md                    # Dataview queries — live agent/task/budget tables
├── 01 Tag Index.md                    # Tag taxonomy reference
│
├── Agents/
│   ├── _Agents MOC.md                 # Map of Content — all agents at a glance
│   └── Agent · Claude Lead.md         # Config, status, activity log, token usage
│
├── Tasks/
│   ├── _Tasks MOC.md                  # Task board view (kanban-style via Dataview)
│   └── Task · Auth Middleware.md      # Description, deps, result, files changed
│
├── Memory/
│   ├── _Memory MOC.md
│   ├── Project/                       # Persistent codebase knowledge
│   │   └── API envelope format.md
│   ├── Session/                       # Cross-task summaries (TTL-based)
│   │   └── Auth middleware exports.md
│   └── Task/                          # Ephemeral notes (auto-expire)
│       └── Knex vs pg-promise.md
│
├── Decisions/
│   ├── _Decisions MOC.md              # Architectural decision log
│   └── DEC-001 Use bcrypt.md          # Decision + rationale + alternatives considered
│
├── Runs/
│   └── Run 2026-03-15T14-30.md        # All tasks, events, and costs for one execution
│
├── Waves/
│   └── Wave 0.md                      # Which tasks, which agents, dependency viz
│
├── Events/
│   └── EVT 2026-03-15 task_completed.md
│
├── Canvas/
│   └── Pipeline.canvas                # Visual wave pipeline (Obsidian Canvas)
│
└── Templates/                         # Note templates for all entity types
```

Every note uses consistent YAML frontmatter:

```yaml
---
type: task
id: auth-middleware
status: completed
created: 2026-03-15T14:32:00Z
updated: 2026-03-15T14:45:12Z
tags: [jb/task/completed, jb/priority/high, jb/topic/auth]
assignee: "[[Agent · Claude Lead]]"
depends_on: ["[[Task · Database Schema]]"]
wave: 2
---
```

### Tag Taxonomy

All notes use a strict hierarchical tag system under `#jb/`:

```
#jb/agent          — agent notes (sub-tags by role)
#jb/task/pending   — task status tracking
#jb/task/completed
#jb/memory/project — memory by scope
#jb/memory/session
#jb/memory/task
#jb/decision       — architectural decisions
#jb/run            — execution runs
#jb/wave           — dependency waves
#jb/topic/auth     — domain tags (auth, database, testing, etc.)
```

Tags drive Dataview queries in the dashboard — you get live tables of agent status, task progress, budget burn, and memory distribution without writing any code.

### What You Actually See

The **Dashboard** (`00 Dashboard.md`) runs Dataview queries that produce:

- Agent status table (idle/working/budget_exceeded, current task, token spend)
- Task progress board (grouped by status, with assignee and wave)
- Budget burndown (per-agent and total, with ceiling)
- Recent decisions (last 10, with rationale)
- Memory stats (count by scope, last recall timestamps)

The **Graph View** shows the full knowledge graph — agents connected to their tasks, tasks connected to their memories and decisions, memories connected to other memories by tag. You can visually trace *why* an agent made a specific choice by following the backlinks.

![Obsidian dashboard](docs/gifs/obsidian-dashboard.gif)

---

## Coordination Strategies

### Wave (default, recommended)

Computes a DAG from task dependencies, extracts parallel execution waves:

```typescript
// coordinator.ts — simplified wave computation
computeWaves(tasks: Task[]): Wave[] {
  const waves: Wave[] = [];
  const completed = new Set<string>();

  while (completed.size < tasks.length) {
    const ready = tasks.filter(t =>
      !completed.has(t.id) &&
      t.dependsOn.every(dep => completed.has(dep))
    );
    waves.push({ order: waves.length, taskIds: ready.map(t => t.id) });
    ready.forEach(t => completed.add(t.id));
  }

  return waves;
}
```

Agent-task matching scores by capability overlap, with role bonuses (lead agents prefer high-priority tasks). Assignment is atomic — `AgentManager.checkout(agentId, taskId)` sets the agent to `working` and the task to `in_progress` in one operation.

### Sequential

One task at a time. Useful for debugging or when tasks have implicit ordering that isn't captured in `dependsOn`.

### Parallel

All ready tasks dispatched simultaneously. Fastest, but no dependency awareness — use only when tasks are truly independent.

---

## Budget Enforcement

Every agent has a `budgetLimit` in USD. Every task execution tracks `TokenUsage`:

```typescript
interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
}
```

After each task completes, the agent's cumulative cost is checked. If it exceeds the limit, the agent transitions to `budget_exceeded` and is removed from the dispatch pool. There's also a project-level `budgetCeiling` — if total spend across all agents exceeds this, the entire run halts.

The Claude Code adapter extracts token usage from `--output-format json` responses. For other runtimes, usage is estimated from output length.

---

## Config File

Jacbot supports declarative configuration via `jacbot.config.ts`:

```typescript
import { defineConfig } from '@jacbot/core';

export default defineConfig({
  name: 'rest-api',
  mission: 'Build a production-ready REST API with auth, CRUD, and tests',
  strategy: 'wave',
  budgetCeiling: 100,

  runtimes: {
    'claude-code': { maxTurns: 20, timeoutMs: 300_000 },
  },

  agents: [
    {
      id: 'architect',
      name: 'Architect',
      role: 'lead',
      runtime: 'claude-code',
      capabilities: ['typescript', 'api-design', 'architecture'],
      budgetLimit: 60,
      instructions: 'Focus on clean abstractions and consistent patterns.',
    },
    {
      id: 'implementer',
      name: 'Implementer',
      role: 'worker',
      runtime: 'claude-code',
      capabilities: ['typescript', 'testing', 'database'],
      budgetLimit: 40,
    },
  ],

  tasks: [
    { id: 'setup', title: 'Project setup', priority: 'high', tags: ['typescript'] },
    { id: 'schema', title: 'Database schema', dependsOn: ['setup'], tags: ['database'] },
    { id: 'auth', title: 'Auth middleware', dependsOn: ['schema'], tags: ['auth'] },
    { id: 'crud', title: 'CRUD endpoints', dependsOn: ['schema'], tags: ['typescript'] },
    { id: 'tests', title: 'Integration tests', dependsOn: ['auth', 'crud'], tags: ['testing'] },
  ],
});
```

The config loader uses dynamic `import()` and supports `.ts`, `.js`, and `.mjs` extensions.

---

## Packages

| Package | What it does |
|---------|-------------|
| **`@jacbot/core`** | Runtime engine — `Jacbot` class, `Coordinator`, `AgentManager`, `TaskManager`, `StateStore`, `ObsidianStore`, runtime adapter registry |
| **`@jacbot/memory`** | `MemoryManager` (store/recall/buildContext), `SimpleVectorStore` (bag-of-words embeddings), `ObsidianMemoryManager` (vault-backed recall with provenance tracking) |
| **`@jacbot/cli`** | CLI commands — `init`, `agent add`, `task create`, `run`, `status`, `waves`, `recall`, `check runtime` |

---

## State Persistence

Jacbot maintains a `.jacbot/` directory with JSON-based state:

```
.jacbot/
├── project.json          # Name, mission, strategy, agent roster
├── agents/{id}.json      # AgentConfig + AgentState (status, token usage, heartbeat)
├── tasks/{id}.json       # Full Task object (status, result, usage, decisions)
├── memory/{id}.json      # MemoryEntry (content, embedding, scope, tags, expiry)
├── decisions.jsonl       # Append-only decision log
├── events.jsonl          # Append-only coordination event stream
└── sessions/{id}.json    # Session recovery data
```

This is the source of truth. The Obsidian vault is a formatted projection of this state — human-readable, browsable, and queryable, but derived from the JSON layer. Both stay in sync via event subscriptions.

---

## Design Lineage

| Concept | Origin |
|---------|--------|
| Wave-based scheduling, context engineering, goal chains | [GSD-2](https://github.com/gsd-build/gsd-2) |
| Local-first state, workflow templates | [Cognetivy](https://github.com/meitarbe/cognetivy) |
| Budget enforcement, atomic task checkout, goal ancestry | [Paperclip](https://github.com/paperclipai/paperclip) |

---

## License

MIT

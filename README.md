# Jacbot

**Lightweight agent orchestration for AI coding agents.**

Jacbot coordinates multiple AI coding agents (Claude Code, Cursor, OpenCode, Gemini CLI) with built-in memory, git-based coordination, and dependency-aware scheduling. It's designed to be simple enough to adopt in an afternoon but powerful enough to run multi-agent dev projects.

## Why Jacbot?

Existing frameworks are either too complex (full "company OS" abstractions) or too narrow (single-agent task runners). Jacbot sits in the middle:

- **Memory that persists** — Three-tier memory (task → session → project) so agents don't start every task from scratch
- **Git-native coordination** — Agents work on branches. Conflicts are first-class events, not surprises
- **Dependency-aware waves** — Tasks are scheduled in parallel waves based on their dependency graph
- **Budget enforcement** — Hard per-agent and per-project cost limits with automatic pausing
- **Bring your own agent** — Works with any coding agent that can receive a prompt and produce output

## Quick Start

```bash
# Initialize a project
npx jacbot init my-api "Build a REST API with auth and tests"

# Register agents
npx jacbot agent add lead --runtime claude-code --role lead --budget 60
npx jacbot agent add worker --runtime claude-code --role worker --budget 40

# Create tasks with dependencies
npx jacbot task create "Project setup" --tag typescript
npx jacbot task create "Database schema" --depends task_1 --tag database
npx jacbot task create "Auth middleware" --depends task_2 --tag auth
npx jacbot task create "CRUD endpoints" --depends task_2 --depends task_3
npx jacbot task create "Integration tests" --depends task_3 --depends task_4

# View the execution plan
npx jacbot waves
# Wave 0: Project setup
# Wave 1: Database schema
# Wave 2: Auth middleware
# Wave 3: CRUD endpoints
# Wave 4: Integration tests

# Dispatch
npx jacbot run
```

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                    Jacbot CLI                      │
├──────────────────────────────────────────────────────┤
│                                                      │
│  ┌─────────┐  ┌──────────┐  ┌────────────────────┐  │
│  │  Agent   │  │   Task   │  │    Coordinator     │  │
│  │ Manager  │  │ Manager  │  │  (wave/seq/par)    │  │
│  └────┬─────┘  └────┬─────┘  └────────┬───────────┘  │
│       │             │                 │              │
│  ┌────┴─────────────┴─────────────────┴───────────┐  │
│  │              State Store (.jacbot/)          │  │
│  │  agents/ tasks/ memory/ decisions.jsonl events/ │  │
│  └────────────────────┬───────────────────────────┘  │
│                       │                              │
│  ┌────────────────────┴───────────────────────────┐  │
│  │            Memory Manager                      │  │
│  │  short-term (task) │ medium (session) │ long   │  │
│  │  (project)  ←── Vector Store (semantic search) │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
└──────────────────────────────────────────────────────┘
```

## Packages

| Package | Description |
|---------|-------------|
| `@jacbot/core` | Runtime engine — agents, tasks, coordination, state persistence |
| `@jacbot/memory` | Three-tier memory with local vector store for semantic recall |
| `@jacbot/cli` | Command-line interface for project management |

## Core Concepts

### Agents

Agents are the workers. Each agent has a runtime (how it executes), a role (what it specializes in), capabilities (what it's good at), and a budget limit.

```typescript
orch.defineAgent({
  id: 'claude',
  name: 'Claude Code',
  role: 'lead',
  runtime: 'claude-code',
  capabilities: ['typescript', 'api-design'],
  budgetLimit: 50, // USD
});
```

Supported runtimes: `claude-code`, `cursor`, `opencode`, `gemini-cli`, `shell`, `custom`

### Tasks

Tasks are units of work with explicit dependencies. They form a DAG (directed acyclic graph) that Jacbot resolves into execution waves.

```typescript
const auth = orch.createTask({
  title: 'Auth middleware',
  description: 'JWT-based auth with bcrypt',
  dependsOn: [schemaTask.id],
  contextFiles: ['src/middleware/auth.ts'],
  tags: ['auth', 'security'],
});
```

Task lifecycle: `pending → queued → in_progress → review → completed`

### Memory

The memory system has three tiers:

- **Task scope** — ephemeral notes within a single task's context window
- **Session scope** — summaries and decisions that carry across tasks in a session
- **Project scope** — codebase knowledge, patterns, and preferences that persist forever

```typescript
// Store a memory
await memory.store({
  content: 'Auth module uses bcrypt with 12 salt rounds',
  scope: 'project',
  sourceId: task.id,
  tags: ['auth'],
});

// Recall relevant memories before starting a new task
const context = await memory.buildContext(
  'implement password reset endpoint',
  ['auth']
);
// Returns: relevant project knowledge, recent session context, related task notes
```

### Coordination

Three strategies for dispatching tasks to agents:

- **sequential** — one task at a time (safest)
- **parallel** — all ready tasks dispatched at once (fastest)
- **wave** — dependency-aware batches (recommended, default)

Waves are computed from the task dependency graph. Tasks in the same wave run in parallel; waves execute sequentially.

### State

All state lives on disk in `.jacbot/` as JSON files. This means:

- Full git-versionability (track how your project evolves)
- Crash recovery (resume from where you left off)
- Human-inspectable (just open the files)
- No database required

## Roadmap

- [ ] Real embedding model support (OpenAI, Cohere, local transformers)
- [ ] SQLite persistence for vector store
- [ ] Git integration (auto-create branches, detect conflicts, merge)
- [ ] Runtime adapters (actually execute agents, not just coordinate)
- [ ] Web dashboard for real-time monitoring
- [ ] MCP integration for tool-use agents
- [ ] Plugin system for custom extensions
- [ ] Crash recovery with session forensics
- [ ] Multi-project Jacbot orchestration

## Inspired By

Jacbot takes ideas from several excellent projects:

- **[GSD-2](https://github.com/gsd-build/gsd-2)** — Context engineering, wave-based scheduling, subagent specialization
- **[Cognetivy](https://github.com/meitarbe/cognetivy)** — Local-first state, workflow templates, MCP integration
- **[Paperclip](https://github.com/paperclipai/paperclip)** — Budget enforcement, atomic task checkout, goal ancestry

## License

MIT

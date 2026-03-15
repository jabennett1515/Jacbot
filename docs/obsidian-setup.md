# Obsidian Integration Setup

Jacbot uses an Obsidian vault as its memory and state layer. Every agent, task, memory, and decision becomes a linked markdown note with structured frontmatter, hierarchical tags, and backlinks — giving you a visual knowledge graph, live dashboards, and full-text search for free.

## What You Get

- **Graph View** — visualize how agents, tasks, memories, and decisions connect
- **Dataview Dashboard** — live tables for agent status, task progress, budget, execution waves
- **Knowledge Graph Memory** — three-tier memory (project/session/task) with cross-linked notes
- **Recall Tracking** — every time a memory is surfaced for a task, the retrieval is logged
- **Decision Log** — architectural decisions with rationale, alternatives, and source links
- **Execution Runs** — grouped task batches with timeline and cost tracking
- **Pipeline Canvas** — visual wave pipeline using Obsidian Canvas
- **Tag Taxonomy** — strict `#jb/*` namespace for precise graph filtering
- **Templates** — Templater-ready templates for all note types
- **Git-versionable** — it's just markdown files

## Prerequisites

- [Obsidian](https://obsidian.md) installed
- [Dataview](https://github.com/blacksmithgu/obsidian-dataview) community plugin (for dashboard queries)
- [Local REST API](https://github.com/coddingtonbear/obsidian-local-rest-api) community plugin (for MCP connection)
- Node.js 18+
- Optional: [Templater](https://github.com/SilentVoid13/Templater) for dynamic template fields

## Step 1: Create or Open an Obsidian Vault

Create a new vault or use an existing one. Jacbot creates its own `Jacbot/` folder inside the vault, so it won't interfere with your other notes.

## Step 2: Install Community Plugins

In Obsidian:

1. Go to **Settings → Community Plugins → Browse**
2. Search for and install **Dataview** by Michael Brenan — enable it
3. Search for and install **Local REST API** by Adam Coddington — enable it
4. In the Local REST API settings, copy your **API Key**
5. Optional: Install **Templater** for dynamic date fields in templates

## Step 3: Configure the MCP Server

Add the Obsidian MCP server to your Claude Desktop config:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "obsidian": {
      "command": "uvx",
      "args": ["mcp-obsidian"],
      "env": {
        "OBSIDIAN_API_KEY": "your_api_key_here",
        "OBSIDIAN_HOST": "127.0.0.1",
        "OBSIDIAN_PORT": "27124"
      }
    }
  }
}
```

You'll need `uv` installed for `uvx`. Install from [astral.sh/uv](https://docs.astral.sh/uv/).

## Step 4: Initialize Jacbot

```bash
npx jacbot init my-project "Build a REST API with auth"
```

This creates the full vault structure:

```
Jacbot/
├── 00 Dashboard.md               ← Command center with all Dataview queries
├── 01 Tag Index.md                ← Complete tag taxonomy reference
│
├── Agents/
│   ├── _Agents MOC.md             ← Map of Content — all agents overview
│   ├── Agent · Lead Agent.md      ← Per-agent: status, budget, activity log
│   └── Agent · Worker Alpha.md
│
├── Tasks/
│   ├── _Tasks MOC.md              ← Task board view (active/completed/failed)
│   ├── Task · Project setup.md    ← Per-task: desc, deps, memories, events
│   └── Task · Auth middleware.md
│
├── Memory/
│   ├── _Memory MOC.md             ← Memory overview with stats
│   ├── Project/                   ← Tier 1: Persistent codebase knowledge
│   │   ├── _Project Knowledge.md  ←   Scope index
│   │   └── Auth uses bcrypt 12 rounds.md
│   ├── Session/                   ← Tier 2: Cross-task session context
│   │   ├── _Session Context.md    ←   Scope index
│   │   └── Setup completed Express TS54.md
│   └── Task/                      ← Tier 3: Ephemeral task notes
│       ├── _Task Notes.md         ←   Scope index
│       └── Found deprecated API usage.md
│
├── Decisions/
│   ├── _Decisions MOC.md          ← Decision log with dates and sources
│   └── DEC-001 Chose Drizzle over Prisma.md
│
├── Runs/
│   ├── _Runs MOC.md               ← Execution history
│   └── Run 2026-03-14 1430.md     ← Per-run: tasks, timeline, cost
│
├── Waves/
│   └── Wave 0.md                  ← Per-wave: parallel task group
│
├── Events/
│   ├── _Event Log.md              ← Structured event index
│   └── EVT 2026-03-14 1430 dispatch.md
│
├── Canvas/
│   └── Pipeline.canvas            ← Visual wave pipeline
│
└── Templates/
    ├── Agent Template.md
    ├── Task Template.md
    ├── Memory Template.md
    ├── Decision Template.md
    ├── Run Template.md
    └── Event Template.md
```

## Step 5: Open the Dashboard

Open `Jacbot/00 Dashboard.md` in Obsidian. With Dataview installed, you'll see live tables for agents, tasks, waves, memories, decisions, and cost — all auto-updating as Jacbot runs.

## Tag Taxonomy

All tags use the `#jb/` namespace. Open `01 Tag Index.md` for the full reference.

| Root | Children | Description |
|------|----------|-------------|
| `#jb/agent` | `/lead`, `/worker`, `/scout`, `/reviewer` | Agent roles |
| `#jb/task` | `/pending`, `/in-progress`, `/completed`, `/failed` | Task status |
| `#jb/priority` | `/critical`, `/high`, `/normal`, `/low` | Task priority |
| `#jb/memory` | `/project`, `/session`, `/task` | Memory tiers |
| `#jb/decision` | — | Decisions |
| `#jb/event` | `/dispatch`, `/complete`, `/fail`, `/budget` | Events |
| `#jb/topic` | `/{user-defined}` | Domain knowledge topics |

**Graph View filtering examples:**

- Agent + Task connections: `#jb/agent OR #jb/task`
- Knowledge graph only: `#jb/memory OR #jb/decision`
- Execution timeline: `#jb/run OR #jb/event`
- Specific domain: `#jb/topic/auth`

## Frontmatter Schema

Every note includes a `type` field for reliable Dataview queries:

| Type | Fields |
|------|--------|
| `agent` | id, name, role, runtime, status, budget_limit, cost_spent, tokens_used, budget_pct, current_task, capabilities |
| `task` | id, title, status, priority, assignee, branch, wave, depends_on, context_files, goal_chain, started, completed |
| `memory` | id, scope, source_task, source_task_title, created_by, recalled_by, relevance_tags, expires |
| `decision` | id, description, source_task, decided_by, made_at, alternatives_count |
| `run` | id, project, strategy, task_count, status, started, completed, total_cost |
| `event` | event_type, task, agent, run, timestamp, summary |
| `wave` | wave, status, task_count |

## How Memory Works

### Three Tiers

**Project memories** (`Memory/Project/`) are persistent codebase knowledge. Things like "the auth module uses bcrypt with 12 salt rounds." These never expire and are available to all future tasks.

**Session memories** (`Memory/Session/`) summarize task completions. Things like "Setup completed: Express server bootstrapped with TS 5.4." These carry context across tasks in a session.

**Task memories** (`Memory/Task/`) are short-term notes within a single task. They can expire when the task completes.

### Recall Tracking

When Jacbot retrieves memories for a new task, it updates the `recalled_by` field in each memory's frontmatter. This creates a bidirectional audit trail:

- **Task notes** show "Memory Context Retrieved" — what memories were surfaced
- **Memory notes** show "Recall History" — which tasks accessed this knowledge

This lets you trace exactly how knowledge flows between tasks.

### Human-Readable Filenames

Memory files use content-based slugs, not machine IDs:

- `Auth uses bcrypt 12 rounds.md` (not `mem_1709234_1.md`)
- `Chose Drizzle over Prisma.md` (not `mem_1709234_2.md`)
- `Setup completed Express TS54.md` (not `mem_1709234_3.md`)

### Manual Memory Creation

Create memory notes manually by adding them to the right `Memory/` subfolder with the correct frontmatter. Use the template in `Templates/Memory Template.md` or create from scratch:

```yaml
---
type: memory
id: "custom_1"
scope: project
source_task: "manual"
source_task_title: ""
created_by: ""
recalled_by: []
relevance_tags:
  - "auth"
  - "security"
tags:
  - jb
  - jb/memory
  - jb/memory/project
  - jb/topic/auth
  - jb/topic/security
cssclasses:
  - jacbot-memory
---

# 🏗️ Auth tokens include custom org_id claim

> [!abstract] Project Knowledge
> **Source:** Manual entry
> **Topics:** `auth` · `security`

---

We embed the organization ID directly in the JWT payload so that
middleware can check org-level permissions without a database lookup.
```

These are picked up by Jacbot's recall system like any auto-generated memory.

## CSS Snippets (Optional)

Create `.obsidian/snippets/jacbot.css` to style Jacbot notes:

```css
/* Dashboard */
.jacbot-dashboard { --inline-title-color: #6366f1; }

/* Agents */
.jacbot-agent .callout[data-callout="info"] { --callout-color: 99, 102, 241; }

/* Tasks */
.jacbot-task .callout[data-callout="info"] { --callout-color: 59, 130, 246; }

/* Memory tiers */
.jacbot-memory .callout[data-callout="abstract"] { --callout-color: 52, 211, 153; }

/* Decisions */
.jacbot-decision .callout[data-callout="important"] { --callout-color: 245, 158, 11; }

/* MOC notes */
.jacbot-moc { border-left: 3px solid #6366f1; }
```

Enable it in **Settings → Appearance → CSS Snippets**.

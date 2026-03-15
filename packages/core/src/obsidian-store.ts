/**
 * Obsidian Vault State Store — v2
 *
 * A meticulously organized Obsidian vault that serves as both the state
 * persistence layer and a living knowledge graph for your project.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * VAULT STRUCTURE
 * ═══════════════════════════════════════════════════════════════════════
 *
 *   Jacbot/
 *   ├── 00 Dashboard.md                    # Command center — all Dataview queries
 *   ├── 01 Tag Index.md                    # Tag taxonomy reference
 *   │
 *   ├── Agents/
 *   │   ├── _Agents MOC.md                 # Map of Content — all agents overview
 *   │   ├── Agent · Lead Agent.md          # Per-agent note with activity log
 *   │   └── Agent · Worker Alpha.md
 *   │
 *   ├── Tasks/
 *   │   ├── _Tasks MOC.md                  # Map of Content — task board view
 *   │   ├── Task · Project setup.md        # Per-task note with full context
 *   │   └── Task · Auth middleware.md
 *   │
 *   ├── Memory/
 *   │   ├── _Memory MOC.md                 # Map of Content — memory overview
 *   │   ├── Project/                       # Tier 1: Persistent codebase knowledge
 *   │   │   ├── _Project Knowledge.md      #   Index for project memories
 *   │   │   └── Auth uses bcrypt 12 rounds.md
 *   │   ├── Session/                       # Tier 2: Cross-task session context
 *   │   │   ├── _Session Context.md        #   Index for session memories
 *   │   │   └── Setup completed Express TS54.md
 *   │   └── Task/                          # Tier 3: Ephemeral task notes
 *   │       ├── _Task Notes.md             #   Index for task memories
 *   │       └── Found deprecated API usage.md
 *   │
 *   ├── Decisions/
 *   │   ├── _Decisions MOC.md              # Map of Content — decision log
 *   │   └── DEC-001 Chose Drizzle over Prisma.md
 *   │
 *   ├── Runs/
 *   │   ├── _Runs MOC.md                   # Map of Content — execution history
 *   │   └── Run 2026-03-14 1430.md         # Per-run note grouping tasks + events
 *   │
 *   ├── Waves/
 *   │   └── Wave 0.md                      # Execution wave with task links
 *   │
 *   ├── Events/
 *   │   ├── _Event Log.md                  # Structured event index
 *   │   └── EVT 2026-03-14 1430 dispatch.md  # Individual event notes
 *   │
 *   ├── Canvas/
 *   │   └── Pipeline.canvas                # Visual wave pipeline
 *   │
 *   └── Templates/
 *       ├── Agent Template.md
 *       ├── Task Template.md
 *       ├── Memory Template.md
 *       ├── Decision Template.md
 *       ├── Run Template.md
 *       └── Event Template.md
 *
 * ═══════════════════════════════════════════════════════════════════════
 * TAG TAXONOMY
 * ═══════════════════════════════════════════════════════════════════════
 *
 * All tags use a strict hierarchical namespace:
 *
 *   #jb                         (root — all Jacbot notes)
 *   ├── #jb/agent               (agent notes)
 *   │   ├── #jb/agent/lead
 *   │   ├── #jb/agent/worker
 *   │   ├── #jb/agent/scout
 *   │   └── #jb/agent/reviewer
 *   ├── #jb/task                (task notes)
 *   │   ├── #jb/task/pending
 *   │   ├── #jb/task/in-progress
 *   │   ├── #jb/task/review
 *   │   ├── #jb/task/completed
 *   │   └── #jb/task/failed
 *   ├── #jb/priority            (task priority)
 *   │   ├── #jb/priority/critical
 *   │   ├── #jb/priority/high
 *   │   ├── #jb/priority/normal
 *   │   └── #jb/priority/low
 *   ├── #jb/memory              (memory notes)
 *   │   ├── #jb/memory/project
 *   │   ├── #jb/memory/session
 *   │   └── #jb/memory/task
 *   ├── #jb/decision            (decision notes)
 *   ├── #jb/run                 (execution run notes)
 *   ├── #jb/wave                (wave notes)
 *   ├── #jb/event               (event notes)
 *   │   ├── #jb/event/dispatch
 *   │   ├── #jb/event/complete
 *   │   ├── #jb/event/fail
 *   │   ├── #jb/event/memory
 *   │   └── #jb/event/budget
 *   └── #jb/topic               (domain-specific knowledge tags)
 *       ├── #jb/topic/auth
 *       ├── #jb/topic/database
 *       ├── #jb/topic/testing
 *       └── ... (user-defined)
 *
 * ═══════════════════════════════════════════════════════════════════════
 * FRONTMATTER SCHEMA
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Every note type has a consistent frontmatter schema:
 *
 *   type:         string    — note type (agent | task | memory | decision | run | event | wave)
 *   id:           string    — unique identifier
 *   status:       string    — current state
 *   created:      datetime  — ISO 8601 creation timestamp
 *   updated:      datetime  — ISO 8601 last update timestamp
 *   aliases:      string[]  — alternative names for linking
 *   tags:         string[]  — hierarchical tags (see taxonomy)
 *   cssclasses:   string[]  — Obsidian CSS classes for styling
 *
 *   + type-specific fields documented in each formatter below
 */

import type {
  AgentConfig,
  AgentRole,
  AgentRuntime,
  AgentState,
  Task,
  TaskStatus,
  TaskPriority,
  TaskResult,
  MemoryEntry,
  MemoryScope,
  Decision,
  CoordinationEvent,
  ProjectConfig,
  Wave,
} from './types.js';

// ─── MCP Client Interface ──────────────────────────────────────────────────

export interface ObsidianMCPClient {
  readNote(path: string): Promise<{ content: string; frontmatter: Record<string, unknown> } | null>;
  writeNote(path: string, content: string, mode?: 'overwrite' | 'append' | 'prepend'): Promise<void>;
  getFrontmatter(path: string): Promise<Record<string, unknown> | null>;
  setFrontmatter(path: string, fields: Record<string, unknown>): Promise<void>;
  addTags(path: string, tags: string[]): Promise<void>;
  search(query: string, options?: { path?: string }): Promise<Array<{ path: string; matches: string[] }>>;
  listNotes(path: string): Promise<string[]>;
  deleteNote?(path: string): Promise<void>;
}

// ─── Path Helpers ───────────────────────────────────────────────────────────

const VAULT_ROOT = 'Jacbot';

function slugify(text: string, maxLen: number = 50): string {
  return text
    .replace(/[^a-zA-Z0-9 -]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, maxLen)
    .trim();
}

const paths = {
  dashboard: () => `${VAULT_ROOT}/00 Dashboard.md`,
  tagIndex: () => `${VAULT_ROOT}/01 Tag Index.md`,

  agentsMOC: () => `${VAULT_ROOT}/Agents/_Agents MOC.md`,
  agent: (name: string) => `${VAULT_ROOT}/Agents/Agent · ${slugify(name)}.md`,

  tasksMOC: () => `${VAULT_ROOT}/Tasks/_Tasks MOC.md`,
  task: (title: string) => `${VAULT_ROOT}/Tasks/Task · ${slugify(title)}.md`,

  memoryMOC: () => `${VAULT_ROOT}/Memory/_Memory MOC.md`,
  memoryScopeMOC: (scope: MemoryScope) => {
    const labels: Record<MemoryScope, string> = { project: 'Project Knowledge', session: 'Session Context', task: 'Task Notes' };
    const folder = scope.charAt(0).toUpperCase() + scope.slice(1);
    return `${VAULT_ROOT}/Memory/${folder}/_${labels[scope]}.md`;
  },
  memory: (scope: MemoryScope, slug: string) => {
    const folder = scope.charAt(0).toUpperCase() + scope.slice(1);
    return `${VAULT_ROOT}/Memory/${folder}/${slugify(slug)}.md`;
  },

  decisionsMOC: () => `${VAULT_ROOT}/Decisions/_Decisions MOC.md`,
  decision: (index: number, title: string) =>
    `${VAULT_ROOT}/Decisions/DEC-${String(index).padStart(3, '0')} ${slugify(title)}.md`,

  runsMOC: () => `${VAULT_ROOT}/Runs/_Runs MOC.md`,
  run: (timestamp: string) => `${VAULT_ROOT}/Runs/Run ${timestamp}.md`,

  wave: (order: number) => `${VAULT_ROOT}/Waves/Wave ${order}.md`,

  eventLog: () => `${VAULT_ROOT}/Events/_Event Log.md`,
  event: (timestamp: string, type: string) =>
    `${VAULT_ROOT}/Events/EVT ${timestamp} ${type}.md`,

  canvas: () => `${VAULT_ROOT}/Canvas/Pipeline.canvas`,

  template: (name: string) => `${VAULT_ROOT}/Templates/${name} Template.md`,
};

// ─── Timestamp Helpers ──────────────────────────────────────────────────────

function now(): string {
  return new Date().toISOString();
}

function shortTimestamp(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
}

// ─── YAML Frontmatter Builder ───────────────────────────────────────────────

function yaml(fields: Record<string, unknown>): string {
  const lines: string[] = ['---'];
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${key}: []`);
      } else {
        lines.push(`${key}:`);
        for (const item of value) {
          lines.push(`  - ${typeof item === 'string' && item.includes(' ') ? `"${item}"` : item}`);
        }
      }
    } else if (typeof value === 'string' && (value.includes(':') || value.includes('"') || value.includes('\n'))) {
      lines.push(`${key}: "${value.replace(/"/g, '\\"')}"`);
    } else {
      lines.push(`${key}: ${value}`);
    }
  }
  lines.push('---');
  return lines.join('\n');
}

// ─── Note Formatters ────────────────────────────────────────────────────────

function formatAgentNote(agent: AgentConfig, state: AgentState): string {
  const budgetPct = agent.budgetLimit
    ? Math.round((state.tokenUsage.estimatedCostUsd / agent.budgetLimit) * 100)
    : 0;
  const budgetBar = agent.budgetLimit
    ? `${'█'.repeat(Math.min(Math.floor(budgetPct / 5), 20))}${'░'.repeat(Math.max(20 - Math.floor(budgetPct / 5), 0))} ${budgetPct}%`
    : 'No limit set';

  const fm = yaml({
    type: 'agent',
    id: agent.id,
    name: agent.name,
    role: agent.role,
    runtime: agent.runtime,
    status: state.status,
    budget_limit: agent.budgetLimit || 0,
    cost_spent: Number(state.tokenUsage.estimatedCostUsd.toFixed(4)),
    tokens_used: state.tokenUsage.totalTokens,
    budget_pct: budgetPct,
    current_task: state.currentTaskId || '',
    tasks_completed: 0,
    capabilities: agent.capabilities || [],
    created: now(),
    updated: now(),
    aliases: [agent.id, agent.name],
    tags: ['jb', 'jb/agent', `jb/agent/${agent.role}`],
    cssclasses: ['jacbot-agent'],
  });

  return `${fm}

# ${agent.name}

> [!info] Agent Profile
> **ID:** \`${agent.id}\` · **Role:** \`${agent.role}\` · **Runtime:** \`${agent.runtime}\` · **Status:** \`${state.status}\`

## Budget

\`\`\`
${budgetBar}
Spent: $${state.tokenUsage.estimatedCostUsd.toFixed(2)} / $${agent.budgetLimit || '∞'}
Tokens: ${state.tokenUsage.totalTokens.toLocaleString()}
\`\`\`

## Capabilities

${(agent.capabilities || []).map(c => `- \`${c}\``).join('\n') || '_No capabilities defined._'}

## Current Assignment

${state.currentTaskId
    ? `> [!warning] Active\n> Working on: [[Task · ${state.currentTaskId}]]`
    : '> [!success] Idle\n> No active task — available for assignment.'}

## Task History

\`\`\`dataview
TABLE WITHOUT ID
  file.link as "Task",
  status as "Status",
  dateformat(completed, "yyyy-MM-dd HH:mm") as "Completed"
FROM "${VAULT_ROOT}/Tasks"
WHERE assignee = "${agent.id}"
SORT completed DESC
\`\`\`

## Activity Timeline

\`\`\`dataview
TABLE WITHOUT ID
  dateformat(timestamp, "HH:mm") as "Time",
  event_type as "Event",
  summary as "Details"
FROM "${VAULT_ROOT}/Events"
WHERE agent = "${agent.id}"
SORT timestamp DESC
LIMIT 20
\`\`\`

## Memories Created

\`\`\`dataview
LIST
FROM "${VAULT_ROOT}/Memory"
WHERE contains(created_by, "${agent.id}")
SORT file.ctime DESC
LIMIT 10
\`\`\`
`;
}

function formatTaskNote(task: Task): string {
  const statusIcon: Record<string, string> = {
    pending: '⏳', queued: '📋', in_progress: '🔨', review: '👀', completed: '✅', failed: '❌', blocked: '🚫',
  };

  const depLinks = task.dependsOn.length > 0
    ? task.dependsOn.map(d => `- [[Task · ${d}]]`).join('\n')
    : '_None — this task can start immediately._';

  const fm = yaml({
    type: 'task',
    id: task.id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    assignee: task.assigneeId || '',
    parent_id: task.parentId || '',
    branch: task.branch || '',
    wave: (task as any).wave ?? -1,
    depends_on: task.dependsOn,
    context_files: task.contextFiles,
    goal_chain: task.goalChain,
    created: task.createdAt.toISOString(),
    updated: task.updatedAt.toISOString(),
    started: task.startedAt?.toISOString() || '',
    completed: task.completedAt?.toISOString() || '',
    aliases: [task.id, task.title],
    tags: [
      'jb', 'jb/task',
      `jb/task/${task.status.replace('_', '-')}`,
      `jb/priority/${task.priority}`,
      ...task.tags.map(t => `jb/topic/${t}`),
    ],
    cssclasses: ['jacbot-task'],
  });

  return `${fm}

# ${statusIcon[task.status] || '•'} ${task.title}

> [!info] Task Details
> **Status:** \`${task.status}\` · **Priority:** \`${task.priority}\` · **Wave:** ${(task as any).wave ?? '—'}
${task.assigneeId ? `> **Assignee:** [[Agent · ${task.assigneeId}]]` : '> **Assignee:** _Unassigned_'}
${task.branch ? `> **Branch:** \`${task.branch}\`` : ''}

## Description

${task.description}

## Goal Chain

${task.goalChain.length > 0
    ? '> [!quote] Why this task exists\n' + task.goalChain.map((g, i) => `> ${i + 1}. ${g}`).join('\n')
    : '_No goal chain defined._'}

## Dependencies

${depLinks}

### Blocked By (live)

\`\`\`dataview
LIST WITHOUT ID file.link + " — " + status
FROM "${VAULT_ROOT}/Tasks"
WHERE contains(this.depends_on, id) AND status != "completed"
\`\`\`

## Context Files

${task.contextFiles.length > 0
    ? task.contextFiles.map(f => `- \`${f}\``).join('\n')
    : '_No context files specified._'}

## Memory Context Retrieved

\`\`\`dataview
TABLE WITHOUT ID
  file.link as "Memory",
  scope as "Scope",
  relevance_tags as "Tags"
FROM "${VAULT_ROOT}/Memory"
WHERE contains(recalled_by, "${task.id}")
SORT file.ctime DESC
\`\`\`

## Memories Produced

\`\`\`dataview
LIST
FROM "${VAULT_ROOT}/Memory"
WHERE source_task = "${task.id}"
SORT file.ctime DESC
\`\`\`

## Decisions Made

\`\`\`dataview
LIST
FROM "${VAULT_ROOT}/Decisions"
WHERE source_task = "${task.id}"
SORT file.ctime DESC
\`\`\`

## Events

\`\`\`dataview
TABLE WITHOUT ID
  dateformat(timestamp, "HH:mm:ss") as "Time",
  event_type as "Type",
  summary as "Details"
FROM "${VAULT_ROOT}/Events"
WHERE task = "${task.id}"
SORT timestamp ASC
\`\`\`

## Result

${task.result
    ? `> [!${task.result.exitCode === 'success' ? 'success' : 'warning'}] ${task.result.exitCode}
> ${task.result.summary}

### Files Changed
${task.result.filesChanged.map(f => `- \`${f}\``).join('\n')}

### Decisions
${task.result.decisions.map(d => `- [[DEC-${d.description.slice(0, 40)}]] — ${d.rationale.slice(0, 80)}`).join('\n')}`
    : '> [!note] Pending\n> Task has not been completed yet.'}
`;
}

function formatMemoryNote(
  entry: MemoryEntry,
  opts: { sourceTaskTitle?: string; createdByAgent?: string; recalledBy?: string[] } = {},
): string {
  const titleSlug = entry.content.slice(0, 60).replace(/[^a-zA-Z0-9 ]/g, '').trim();

  const fm = yaml({
    type: 'memory',
    id: entry.id,
    scope: entry.scope,
    source_task: entry.sourceId,
    source_task_title: opts.sourceTaskTitle || '',
    created_by: opts.createdByAgent || '',
    recalled_by: opts.recalledBy || [],
    relevance_tags: entry.tags,
    created: entry.createdAt.toISOString(),
    expires: entry.expiresAt?.toISOString() || '',
    aliases: [entry.id],
    tags: [
      'jb', 'jb/memory', `jb/memory/${entry.scope}`,
      ...entry.tags.map(t => `jb/topic/${t}`),
    ],
    cssclasses: ['jacbot-memory'],
  });

  const scopeEmoji: Record<MemoryScope, string> = { project: '🏗️', session: '📋', task: '📝' };
  const scopeLabel: Record<MemoryScope, string> = { project: 'Project Knowledge', session: 'Session Context', task: 'Task Note' };

  return `${fm}

# ${scopeEmoji[entry.scope]} ${titleSlug || 'Memory'}

> [!abstract] ${scopeLabel[entry.scope]}
> **Source:** [[Task · ${opts.sourceTaskTitle || entry.sourceId}]]
> **Topics:** ${entry.tags.map(t => `\`${t}\``).join(' · ') || '_none_'}
${entry.expiresAt ? `> **Expires:** ${entry.expiresAt.toISOString()}` : ''}

---

${entry.content}

---

## Recall History

\`\`\`dataview
LIST WITHOUT ID "Recalled by [[Task · " + item + "]]"
FROM "${VAULT_ROOT}/Memory"
WHERE id = "${entry.id}"
FLATTEN recalled_by as item
\`\`\`
`;
}

function formatDecisionNote(
  decision: Decision,
  index: number,
  opts: { sourceTaskId?: string; sourceTaskTitle?: string; agentId?: string } = {},
): string {
  const fm = yaml({
    type: 'decision',
    id: `DEC-${String(index).padStart(3, '0')}`,
    description: decision.description,
    source_task: opts.sourceTaskId || '',
    source_task_title: opts.sourceTaskTitle || '',
    decided_by: opts.agentId || '',
    made_at: decision.madeAt.toISOString(),
    alternatives_count: decision.alternatives?.length || 0,
    aliases: [`DEC-${String(index).padStart(3, '0')}`],
    tags: ['jb', 'jb/decision'],
    cssclasses: ['jacbot-decision'],
  });

  return `${fm}

# ⚡ DEC-${String(index).padStart(3, '0')}: ${decision.description}

> [!important] Decision
> **Made:** ${decision.madeAt.toISOString()}
${opts.sourceTaskTitle ? `> **During:** [[Task · ${opts.sourceTaskTitle}]]` : ''}
${opts.agentId ? `> **By:** [[Agent · ${opts.agentId}]]` : ''}

## Rationale

${decision.rationale}

## Alternatives Considered

${decision.alternatives && decision.alternatives.length > 0
    ? decision.alternatives.map((a, i) => `${i + 1}. ~~${a}~~ — not chosen`).join('\n')
    : '_No alternatives were recorded._'}

## Impact

\`\`\`dataview
LIST
FROM "${VAULT_ROOT}/Memory"
WHERE contains(file.outlinks, this.file.link)
SORT file.ctime DESC
\`\`\`
`;
}

function formatRunNote(runId: string, config: ProjectConfig, taskIds: string[], taskTitles: string[]): string {
  const timestamp = shortTimestamp();

  const fm = yaml({
    type: 'run',
    id: runId,
    project: config.name,
    strategy: config.coordination,
    task_count: taskIds.length,
    status: 'in_progress',
    started: now(),
    completed: '',
    total_cost: 0,
    aliases: [runId],
    tags: ['jb', 'jb/run'],
    cssclasses: ['jacbot-run'],
  });

  return `${fm}

# 🚀 Run: ${timestamp}

> [!info] Execution Run
> **Project:** ${config.name}
> **Strategy:** \`${config.coordination}\`
> **Tasks:** ${taskIds.length}
> **Started:** ${now()}

## Mission

> ${config.mission}

## Tasks in this Run

${taskTitles.map(t => `- [ ] [[Task · ${t}]]`).join('\n')}

## Progress

\`\`\`dataview
TABLE WITHOUT ID
  file.link as "Task",
  status as "Status",
  assignee as "Agent",
  wave as "Wave"
FROM "${VAULT_ROOT}/Tasks"
WHERE type = "task"
SORT wave ASC, priority ASC
\`\`\`

## Timeline

\`\`\`dataview
TABLE WITHOUT ID
  dateformat(timestamp, "HH:mm:ss") as "Time",
  event_type as "Event",
  agent as "Agent",
  summary as "Details"
FROM "${VAULT_ROOT}/Events"
WHERE run = "${runId}"
SORT timestamp ASC
\`\`\`

## Cost Breakdown

\`\`\`dataview
TABLE WITHOUT ID
  file.link as "Agent",
  cost_spent as "Cost",
  tokens_used as "Tokens"
FROM "${VAULT_ROOT}/Agents"
SORT cost_spent DESC
\`\`\`
`;
}

function formatEventNote(event: CoordinationEvent, opts: { runId?: string; summary?: string } = {}): string {
  const timestamp = shortTimestamp();
  const typeEmoji: Record<string, string> = {
    task_assigned: '▶️', task_completed: '✅', task_failed: '❌',
    branch_conflict: '⚠️', review_requested: '👀', budget_warning: '💰',
  };

  const fm = yaml({
    type: 'event',
    event_type: event.type,
    task: event.taskId,
    agent: event.agentId,
    run: opts.runId || '',
    timestamp: event.timestamp.toISOString(),
    summary: opts.summary || `${event.type} — ${event.agentId} on ${event.taskId}`,
    tags: ['jb', 'jb/event', `jb/event/${event.type.replace('_', '-').split('_')[0]}`],
    cssclasses: ['jacbot-event'],
  });

  return `${fm}

# ${typeEmoji[event.type] || '•'} ${event.type.replace(/_/g, ' ')}

> **Time:** ${event.timestamp.toISOString()}
> **Agent:** [[Agent · ${event.agentId}]]
> **Task:** [[Task · ${event.taskId}]]
${opts.runId ? `> **Run:** [[Run ${opts.runId}]]` : ''}

## Details

${opts.summary || JSON.stringify(event.payload, null, 2)}
`;
}

function formatWaveNote(wave: Wave, tasks: Task[]): string {
  const waveTasks = wave.taskIds
    .map(id => tasks.find(t => t.id === id))
    .filter((t): t is Task => t !== null);

  const allCompleted = waveTasks.every(t => t.status === 'completed');
  const anyInProgress = waveTasks.some(t => t.status === 'in_progress');
  const waveStatus = allCompleted ? 'completed' : anyInProgress ? 'in_progress' : 'pending';

  const statusIcon: Record<string, string> = { completed: '✅', in_progress: '🔨', pending: '⏳' };

  const fm = yaml({
    type: 'wave',
    wave: wave.order,
    status: waveStatus,
    task_count: wave.taskIds.length,
    tags: ['jb', 'jb/wave'],
    cssclasses: ['jacbot-wave'],
  });

  return `${fm}

# ${statusIcon[waveStatus]} Wave ${wave.order}

> [!info] Execution Wave
> **Status:** \`${waveStatus}\` · **Tasks:** ${wave.taskIds.length}
> _Tasks in this wave run in parallel. The next wave starts when all complete._

## Tasks

| Status | Task | Assignee | Priority |
|--------|------|----------|----------|
${waveTasks.map(t =>
    `| \`${t.status}\` | [[Task · ${slugify(t.title)}]] | ${t.assigneeId ? `[[Agent · ${t.assigneeId}]]` : '—'} | \`${t.priority}\` |`
  ).join('\n')}

## Live Status

\`\`\`dataview
TABLE WITHOUT ID
  file.link as "Task",
  status as "Status",
  assignee as "Agent"
FROM "${VAULT_ROOT}/Tasks"
WHERE wave = ${wave.order}
SORT priority ASC
\`\`\`
`;
}

// ─── MOC (Map of Content) Generators ────────────────────────────────────────

function formatAgentsMOC(): string {
  return `---
type: moc
tags: [jb, jb/agent]
cssclasses: [jacbot-moc]
---

# 🤖 Agents

> All registered agents and their current status.

## Overview

\`\`\`dataview
TABLE WITHOUT ID
  file.link as "Agent",
  status as "Status",
  role as "Role",
  runtime as "Runtime",
  "$" + round(cost_spent, 2) + " / $" + budget_limit as "Budget",
  budget_pct + "%" as "Used"
FROM "${VAULT_ROOT}/Agents"
WHERE type = "agent"
SORT status ASC, name ASC
\`\`\`

## By Role

\`\`\`dataview
TABLE WITHOUT ID
  file.link as "Agent",
  status as "Status",
  capabilities as "Capabilities"
FROM "${VAULT_ROOT}/Agents"
WHERE type = "agent"
GROUP BY role
\`\`\`

## Budget Summary

\`\`\`dataview
TABLE WITHOUT ID
  file.link as "Agent",
  "$" + round(cost_spent, 2) as "Spent",
  "$" + budget_limit as "Limit",
  budget_pct + "%" as "% Used",
  tokens_used as "Tokens"
FROM "${VAULT_ROOT}/Agents"
WHERE type = "agent"
SORT cost_spent DESC
\`\`\`
`;
}

function formatTasksMOC(): string {
  return `---
type: moc
tags: [jb, jb/task]
cssclasses: [jacbot-moc]
---

# 📋 Task Board

> All tasks organized by status and wave.

## Active Tasks

\`\`\`dataview
TABLE WITHOUT ID
  file.link as "Task",
  status as "Status",
  priority as "Priority",
  assignee as "Agent",
  wave as "Wave"
FROM "${VAULT_ROOT}/Tasks"
WHERE type = "task" AND status != "completed" AND status != "failed"
SORT wave ASC, priority ASC
\`\`\`

## Completed

\`\`\`dataview
TABLE WITHOUT ID
  file.link as "Task",
  assignee as "Agent",
  dateformat(date(completed), "yyyy-MM-dd HH:mm") as "Completed"
FROM "${VAULT_ROOT}/Tasks"
WHERE type = "task" AND status = "completed"
SORT completed DESC
\`\`\`

## Failed

\`\`\`dataview
TABLE WITHOUT ID
  file.link as "Task",
  assignee as "Agent",
  priority as "Priority"
FROM "${VAULT_ROOT}/Tasks"
WHERE type = "task" AND status = "failed"
SORT file.ctime DESC
\`\`\`

## By Wave

\`\`\`dataview
TABLE WITHOUT ID
  file.link as "Task",
  status as "Status",
  assignee as "Agent"
FROM "${VAULT_ROOT}/Tasks"
WHERE type = "task"
SORT wave ASC, priority ASC
GROUP BY wave
\`\`\`
`;
}

function formatMemoryMOC(): string {
  return `---
type: moc
tags: [jb, jb/memory]
cssclasses: [jacbot-moc]
---

# 🧠 Memory Store

> Three-tier knowledge graph powering agent context.

## Stats

\`\`\`dataview
TABLE WITHOUT ID
  scope as "Tier",
  length(rows) as "Count"
FROM "${VAULT_ROOT}/Memory"
WHERE type = "memory"
GROUP BY scope
\`\`\`

## Recent Memories

\`\`\`dataview
TABLE WITHOUT ID
  file.link as "Memory",
  scope as "Scope",
  relevance_tags as "Topics",
  source_task_title as "Source Task"
FROM "${VAULT_ROOT}/Memory"
WHERE type = "memory"
SORT file.ctime DESC
LIMIT 20
\`\`\`

## By Topic

\`\`\`dataview
TABLE WITHOUT ID
  file.link as "Memory",
  scope as "Scope",
  source_task_title as "Source"
FROM "${VAULT_ROOT}/Memory"
WHERE type = "memory"
SORT file.ctime DESC
GROUP BY relevance_tags
\`\`\`

## Sub-Indexes

- [[_Project Knowledge]] — Persistent codebase knowledge
- [[_Session Context]] — Cross-task session summaries
- [[_Task Notes]] — Ephemeral task-scoped notes
`;
}

function formatDecisionsMOC(): string {
  return `---
type: moc
tags: [jb, jb/decision]
cssclasses: [jacbot-moc]
---

# ⚡ Decision Log

> Architectural and implementation decisions made during execution.

## All Decisions

\`\`\`dataview
TABLE WITHOUT ID
  file.link as "Decision",
  source_task_title as "During Task",
  decided_by as "By",
  dateformat(date(made_at), "yyyy-MM-dd") as "Date",
  alternatives_count as "Alternatives"
FROM "${VAULT_ROOT}/Decisions"
WHERE type = "decision"
SORT made_at DESC
\`\`\`
`;
}

function formatRunsMOC(): string {
  return `---
type: moc
tags: [jb, jb/run]
cssclasses: [jacbot-moc]
---

# 🚀 Execution History

> All Jacbot runs and their outcomes.

## Runs

\`\`\`dataview
TABLE WITHOUT ID
  file.link as "Run",
  status as "Status",
  task_count as "Tasks",
  "$" + round(total_cost, 2) as "Cost",
  dateformat(date(started), "yyyy-MM-dd HH:mm") as "Started"
FROM "${VAULT_ROOT}/Runs"
WHERE type = "run"
SORT started DESC
\`\`\`
`;
}

function formatScopeIndex(scope: MemoryScope): string {
  const labels: Record<MemoryScope, { title: string; emoji: string; desc: string }> = {
    project: { title: 'Project Knowledge', emoji: '🏗️', desc: 'Persistent knowledge about your codebase. Never expires.' },
    session: { title: 'Session Context', emoji: '📋', desc: 'Summaries and context from task executions. Carries across tasks.' },
    task: { title: 'Task Notes', emoji: '📝', desc: 'Ephemeral notes created within a single task. May expire on completion.' },
  };
  const l = labels[scope];

  return `---
type: moc
tags: [jb, jb/memory, jb/memory/${scope}]
cssclasses: [jacbot-moc]
---

# ${l.emoji} ${l.title}

> ${l.desc}

## Entries

\`\`\`dataview
TABLE WITHOUT ID
  file.link as "Memory",
  relevance_tags as "Topics",
  source_task_title as "Source Task",
  dateformat(file.ctime, "yyyy-MM-dd") as "Created"
FROM "${VAULT_ROOT}/Memory/${scope.charAt(0).toUpperCase() + scope.slice(1)}"
WHERE type = "memory"
SORT file.ctime DESC
\`\`\`
`;
}

// ─── Dashboard ──────────────────────────────────────────────────────────────

function formatDashboard(config: ProjectConfig): string {
  return `---
type: dashboard
project: ${config.name}
mission: "${config.mission}"
strategy: ${config.coordination}
budget_ceiling: ${config.budgetCeiling || 0}
tags: [jb]
cssclasses: [jacbot-dashboard]
---

# 🎯 Jacbot Dashboard

> [!quote] Mission
> ${config.mission}

---

## 🤖 Agents

\`\`\`dataview
TABLE WITHOUT ID
  file.link as "Agent",
  status as "Status",
  role as "Role",
  "$" + round(cost_spent, 2) + " / $" + budget_limit as "Budget",
  budget_pct + "%" as "Used"
FROM "${VAULT_ROOT}/Agents"
WHERE type = "agent"
SORT status ASC
\`\`\`

## 📋 Active Tasks

\`\`\`dataview
TABLE WITHOUT ID
  file.link as "Task",
  status as "Status",
  priority as "Priority",
  assignee as "Agent",
  wave as "Wave"
FROM "${VAULT_ROOT}/Tasks"
WHERE type = "task" AND status != "completed" AND status != "failed"
SORT wave ASC, priority ASC
\`\`\`

## ✅ Recently Completed

\`\`\`dataview
TABLE WITHOUT ID
  file.link as "Task",
  assignee as "Agent",
  dateformat(date(completed), "yyyy-MM-dd HH:mm") as "Completed At"
FROM "${VAULT_ROOT}/Tasks"
WHERE type = "task" AND status = "completed"
SORT completed DESC
LIMIT 10
\`\`\`

## 🌊 Execution Waves

\`\`\`dataview
TABLE WITHOUT ID
  file.link as "Wave",
  status as "Status",
  task_count as "Tasks"
FROM "${VAULT_ROOT}/Waves"
WHERE type = "wave"
SORT wave ASC
\`\`\`

## 🧠 Recent Memories

\`\`\`dataview
TABLE WITHOUT ID
  file.link as "Memory",
  scope as "Tier",
  relevance_tags as "Topics"
FROM "${VAULT_ROOT}/Memory"
WHERE type = "memory"
SORT file.ctime DESC
LIMIT 10
\`\`\`

## ⚡ Recent Decisions

\`\`\`dataview
TABLE WITHOUT ID
  file.link as "Decision",
  source_task_title as "Task",
  dateformat(date(made_at), "yyyy-MM-dd") as "Date"
FROM "${VAULT_ROOT}/Decisions"
WHERE type = "decision"
SORT made_at DESC
LIMIT 8
\`\`\`

## 💰 Cost Summary

\`\`\`dataview
TABLE WITHOUT ID
  file.link as "Agent",
  role as "Role",
  "$" + round(cost_spent, 2) as "Spent",
  "$" + budget_limit as "Limit",
  tokens_used as "Tokens"
FROM "${VAULT_ROOT}/Agents"
WHERE type = "agent"
SORT cost_spent DESC
\`\`\`

${config.budgetCeiling ? `> [!warning] Budget Ceiling: $${config.budgetCeiling}` : ''}

## 📊 Quick Links

| Section | Link |
|---------|------|
| All Agents | [[_Agents MOC]] |
| Task Board | [[_Tasks MOC]] |
| Memory Store | [[_Memory MOC]] |
| Decision Log | [[_Decisions MOC]] |
| Run History | [[_Runs MOC]] |
| Tag Index | [[01 Tag Index]] |
`;
}

// ─── Tag Index ──────────────────────────────────────────────────────────────

function formatTagIndex(): string {
  return `---
type: index
tags: [jb]
cssclasses: [jacbot-index]
---

# 🏷️ Tag Index

> Complete tag taxonomy for the Jacbot vault. Use these tags to filter the graph view and search.

## Core Tags

| Tag | Description | Usage |
|-----|-------------|-------|
| \`#jb\` | Root tag — every Jacbot note | All notes |
| \`#jb/agent\` | Agent profiles | Agents/ |
| \`#jb/task\` | Task specifications | Tasks/ |
| \`#jb/memory\` | Memory entries | Memory/ |
| \`#jb/decision\` | Architectural decisions | Decisions/ |
| \`#jb/run\` | Execution runs | Runs/ |
| \`#jb/wave\` | Execution waves | Waves/ |
| \`#jb/event\` | Coordination events | Events/ |

## Agent Roles

| Tag | Description |
|-----|-------------|
| \`#jb/agent/lead\` | Lead/architect agents |
| \`#jb/agent/worker\` | General worker agents |
| \`#jb/agent/scout\` | Reconnaissance/research agents |
| \`#jb/agent/reviewer\` | Code review agents |

## Task Status

| Tag | Description |
|-----|-------------|
| \`#jb/task/pending\` | Not yet started |
| \`#jb/task/in-progress\` | Currently being worked on |
| \`#jb/task/review\` | Awaiting review |
| \`#jb/task/completed\` | Successfully finished |
| \`#jb/task/failed\` | Failed during execution |

## Priority Levels

| Tag | Description |
|-----|-------------|
| \`#jb/priority/critical\` | Must be done immediately |
| \`#jb/priority/high\` | Important, do soon |
| \`#jb/priority/normal\` | Standard priority |
| \`#jb/priority/low\` | Can wait |

## Memory Tiers

| Tag | Folder | Lifespan |
|-----|--------|----------|
| \`#jb/memory/project\` | Memory/Project/ | Permanent |
| \`#jb/memory/session\` | Memory/Session/ | Session duration |
| \`#jb/memory/task\` | Memory/Task/ | Until task completes |

## Event Types

| Tag | Trigger |
|-----|---------|
| \`#jb/event/dispatch\` | Task assigned to agent |
| \`#jb/event/complete\` | Task completed |
| \`#jb/event/fail\` | Task failed |
| \`#jb/event/memory\` | Memory stored |
| \`#jb/event/budget\` | Budget warning/exceeded |

## Topic Tags

Topic tags are user-defined and represent domain knowledge areas:

\`\`\`
#jb/topic/{topic-name}
\`\`\`

Examples: \`#jb/topic/auth\`, \`#jb/topic/database\`, \`#jb/topic/testing\`

These are applied to tasks, memories, and decisions to create cross-cutting knowledge connections in the graph.

## Graph View Filters

To focus the graph view on specific aspects:

- **Just agents and tasks:** Filter to \`#jb/agent OR #jb/task\`
- **Knowledge graph:** Filter to \`#jb/memory OR #jb/decision\`
- **Execution timeline:** Filter to \`#jb/run OR #jb/event\`
- **Specific topic:** Filter to \`#jb/topic/auth\` (or any topic)
`;
}

// ─── Canvas Generator ───────────────────────────────────────────────────────

function formatPipelineCanvas(waves: Wave[], tasks: Task[]): string {
  const nodes: any[] = [];
  const edges: any[] = [];
  let x = 0;

  for (const wave of waves) {
    const waveTasks = wave.taskIds
      .map(id => tasks.find(t => t.id === id))
      .filter((t): t is Task => t !== null);

    // Wave label node
    nodes.push({
      id: `wave_${wave.order}`,
      type: 'text',
      x: x,
      y: -80,
      width: 200,
      height: 40,
      text: `**Wave ${wave.order}**`,
      color: '4',
    });

    // Task nodes
    let y = 0;
    for (const task of waveTasks) {
      const color = task.status === 'completed' ? '4' : task.status === 'in_progress' ? '5' : '0';
      const nodeId = `task_${task.id}`;

      nodes.push({
        id: nodeId,
        type: 'file',
        file: `${VAULT_ROOT}/Tasks/Task · ${slugify(task.title)}.md`,
        x: x,
        y: y,
        width: 200,
        height: 60,
        color,
      });

      // Edges from dependencies
      for (const depId of task.dependsOn) {
        edges.push({
          id: `edge_${depId}_${task.id}`,
          fromNode: `task_${depId}`,
          toNode: nodeId,
          fromSide: 'right',
          toSide: 'left',
        });
      }

      y += 80;
    }

    x += 280;
  }

  return JSON.stringify({ nodes, edges }, null, 2);
}

// ─── Templates ──────────────────────────────────────────────────────────────

const TEMPLATES = {
  agent: `---
type: agent
id: ""
name: ""
role: worker
runtime: claude-code
status: idle
budget_limit: 0
cost_spent: 0
tokens_used: 0
budget_pct: 0
current_task: ""
capabilities: []
created: "{{date:YYYY-MM-DDTHH:mm:ss}}Z"
updated: "{{date:YYYY-MM-DDTHH:mm:ss}}Z"
aliases: []
tags: [jb, jb/agent]
cssclasses: [jacbot-agent]
---

# {{name}}

> [!info] Agent Profile
> **Role:** \`{{role}}\` · **Runtime:** \`{{runtime}}\`
`,

  task: `---
type: task
id: ""
title: ""
status: pending
priority: normal
assignee: ""
branch: ""
wave: 0
depends_on: []
context_files: []
goal_chain: []
created: "{{date:YYYY-MM-DDTHH:mm:ss}}Z"
updated: "{{date:YYYY-MM-DDTHH:mm:ss}}Z"
aliases: []
tags: [jb, jb/task, jb/task/pending]
cssclasses: [jacbot-task]
---

# ⏳ {{title}}

## Description

## Dependencies

## Context Files
`,

  memory: `---
type: memory
id: ""
scope: project
source_task: ""
source_task_title: ""
created_by: ""
recalled_by: []
relevance_tags: []
created: "{{date:YYYY-MM-DDTHH:mm:ss}}Z"
expires: ""
aliases: []
tags: [jb, jb/memory, jb/memory/project]
cssclasses: [jacbot-memory]
---

# 🏗️ Memory Title

> [!abstract] Project Knowledge
> **Source:** [[Task · ...]]
> **Topics:** ...

---

Content here.
`,

  decision: `---
type: decision
id: ""
description: ""
source_task: ""
decided_by: ""
made_at: "{{date:YYYY-MM-DDTHH:mm:ss}}Z"
alternatives_count: 0
aliases: []
tags: [jb, jb/decision]
cssclasses: [jacbot-decision]
---

# ⚡ Decision

## Rationale

## Alternatives Considered
`,

  run: `---
type: run
id: ""
project: ""
strategy: wave
task_count: 0
status: pending
started: "{{date:YYYY-MM-DDTHH:mm:ss}}Z"
completed: ""
total_cost: 0
aliases: []
tags: [jb, jb/run]
cssclasses: [jacbot-run]
---

# 🚀 Run

## Tasks

## Timeline
`,

  event: `---
type: event
event_type: ""
task: ""
agent: ""
run: ""
timestamp: "{{date:YYYY-MM-DDTHH:mm:ss}}Z"
summary: ""
tags: [jb, jb/event]
cssclasses: [jacbot-event]
---

# Event

## Details
`,
};

// ─── Obsidian State Store ───────────────────────────────────────────────────

export class ObsidianStore {
  private client: ObsidianMCPClient;
  private decisionCount = 0;
  private currentRunId: string | null = null;

  constructor(client: ObsidianMCPClient) {
    this.client = client;
  }

  /** Initialize the full vault structure */
  async initVault(config: ProjectConfig): Promise<void> {
    // Dashboard and index
    await Promise.all([
      this.client.writeNote(paths.dashboard(), formatDashboard(config), 'overwrite'),
      this.client.writeNote(paths.tagIndex(), formatTagIndex(), 'overwrite'),
    ]);

    // MOC notes
    await Promise.all([
      this.client.writeNote(paths.agentsMOC(), formatAgentsMOC(), 'overwrite'),
      this.client.writeNote(paths.tasksMOC(), formatTasksMOC(), 'overwrite'),
      this.client.writeNote(paths.memoryMOC(), formatMemoryMOC(), 'overwrite'),
      this.client.writeNote(paths.decisionsMOC(), formatDecisionsMOC(), 'overwrite'),
      this.client.writeNote(paths.runsMOC(), formatRunsMOC(), 'overwrite'),
    ]);

    // Memory scope indexes
    await Promise.all([
      this.client.writeNote(paths.memoryScopeMOC('project'), formatScopeIndex('project'), 'overwrite'),
      this.client.writeNote(paths.memoryScopeMOC('session'), formatScopeIndex('session'), 'overwrite'),
      this.client.writeNote(paths.memoryScopeMOC('task'), formatScopeIndex('task'), 'overwrite'),
    ]);

    // Event log index
    await this.client.writeNote(paths.eventLog(), `---
type: moc
tags: [jb, jb/event]
cssclasses: [jacbot-moc]
---

# 📡 Event Log

\`\`\`dataview
TABLE WITHOUT ID
  dateformat(date(timestamp), "HH:mm:ss") as "Time",
  event_type as "Type",
  agent as "Agent",
  task as "Task",
  summary as "Details"
FROM "${VAULT_ROOT}/Events"
WHERE type = "event"
SORT timestamp DESC
LIMIT 50
\`\`\`
`, 'overwrite');

    // Templates
    await Promise.all(
      Object.entries(TEMPLATES).map(([name, content]) =>
        this.client.writeNote(paths.template(name.charAt(0).toUpperCase() + name.slice(1)), content, 'overwrite')
      ),
    );
  }

  // ─── Agents ─────────────────────────────────────────────────────────────

  async saveAgent(agent: AgentConfig, state: AgentState): Promise<void> {
    await this.client.writeNote(paths.agent(agent.name), formatAgentNote(agent, state), 'overwrite');
  }

  async loadAgent(agentId: string): Promise<{ config: AgentConfig; state: AgentState } | null> {
    // Search by ID since filename uses name
    const results = await this.client.search(`id: "${agentId}"`, { path: `${VAULT_ROOT}/Agents` });
    if (results.length === 0) return null;
    const note = await this.client.readNote(results[0].path);
    if (!note) return null;
    const fm = note.frontmatter;
    return {
      config: {
        id: fm.id as string,
        name: fm.name as string,
        role: fm.role as AgentRole,
        runtime: fm.runtime as AgentRuntime,
        budgetLimit: fm.budget_limit as number,
        capabilities: (fm.capabilities as string[]) || [],
      },
      state: {
        id: fm.id as string,
        status: fm.status as AgentState['status'],
        currentTaskId: (fm.current_task as string) || undefined,
        tokenUsage: {
          inputTokens: 0,
          outputTokens: 0,
          totalTokens: (fm.tokens_used as number) || 0,
          estimatedCostUsd: (fm.cost_spent as number) || 0,
        },
      },
    };
  }

  // ─── Tasks ──────────────────────────────────────────────────────────────

  async saveTask(task: Task): Promise<void> {
    await this.client.writeNote(paths.task(task.title), formatTaskNote(task), 'overwrite');
  }

  async loadTask(taskId: string): Promise<Task | null> {
    const results = await this.client.search(`id: "${taskId}"`, { path: `${VAULT_ROOT}/Tasks` });
    if (results.length === 0) return null;
    const note = await this.client.readNote(results[0].path);
    if (!note) return null;
    const fm = note.frontmatter;

    // Extract description from markdown body (between ## Description and next ##)
    const descMatch = note.content.match(/## Description\s*\n([\s\S]*?)(?=\n## |\n---\s*$)/);
    const description = descMatch ? descMatch[1].trim() : (fm.title as string) || '';

    // Extract user tags from frontmatter — tags stored as jb/topic/<tag>
    const fmTags = (fm.tags as string[]) || [];
    const userTags = fmTags
      .filter(t => t.startsWith('jb/topic/'))
      .map(t => t.replace('jb/topic/', ''));

    // Recover result from markdown body if task is completed
    let result: Task['result'] | undefined;
    const resultMatch = note.content.match(/## Result\s*\n([\s\S]*?)(?=\n## |\s*$)/);
    if (resultMatch && fm.status === 'completed') {
      const resultBlock = resultMatch[1];
      const summaryMatch = resultBlock.match(/> (.+?)$/m);
      const filesChanged: string[] = [];
      const filesSection = resultBlock.match(/### Files Changed\s*\n([\s\S]*?)(?=\n### |\n## |\s*$)/);
      if (filesSection) {
        for (const line of filesSection[1].split('\n')) {
          const fileMatch = line.match(/^- `(.+?)`$/);
          if (fileMatch) filesChanged.push(fileMatch[1]);
        }
      }
      if (summaryMatch) {
        result = {
          exitCode: resultBlock.includes('[!success]') ? 'success' : 'failed',
          summary: summaryMatch[1],
          filesChanged,
          decisions: [],
        };
      }
    }

    return {
      id: fm.id as string,
      title: fm.title as string,
      description,
      status: fm.status as TaskStatus,
      priority: fm.priority as TaskPriority,
      assigneeId: (fm.assignee as string) || undefined,
      parentId: (fm.parent_id as string) || undefined,
      branch: (fm.branch as string) || undefined,
      dependsOn: (fm.depends_on as string[]) || [],
      goalChain: (fm.goal_chain as string[]) || [],
      contextFiles: (fm.context_files as string[]) || [],
      tags: userTags,
      result,
      createdAt: new Date(fm.created as string),
      updatedAt: new Date(fm.updated as string),
      startedAt: fm.started ? new Date(fm.started as string) : undefined,
      completedAt: fm.completed ? new Date(fm.completed as string) : undefined,
    };
  }

  // ─── Memory ─────────────────────────────────────────────────────────────

  async saveMemory(
    entry: MemoryEntry,
    opts: { sourceTaskTitle?: string; createdByAgent?: string } = {},
  ): Promise<void> {
    const slug = entry.content.slice(0, 50).replace(/[^a-zA-Z0-9 ]/g, '').trim() || entry.id;
    const content = formatMemoryNote(entry, opts);
    await this.client.writeNote(paths.memory(entry.scope, slug), content, 'overwrite');
  }

  async recallMemories(query: string, options?: {
    scope?: MemoryScope;
    tags?: string[];
    limit?: number;
  }): Promise<Array<{ path: string; content: string; scope: string }>> {
    const scopeFolder = options?.scope
      ? `${VAULT_ROOT}/Memory/${options.scope.charAt(0).toUpperCase() + options.scope.slice(1)}`
      : `${VAULT_ROOT}/Memory`;

    const results = await this.client.search(query, { path: scopeFolder });

    return results.slice(0, options?.limit || 10).map(r => ({
      path: r.path,
      content: r.matches.join(' '),
      scope: r.path.includes('/Project/') ? 'project' : r.path.includes('/Session/') ? 'session' : 'task',
    }));
  }

  /** Track that a memory was recalled for a specific task */
  async trackRecall(memoryPath: string, taskId: string): Promise<void> {
    const note = await this.client.readNote(memoryPath);
    if (!note) return;
    const recalledBy = (note.frontmatter.recalled_by as string[]) || [];
    if (!recalledBy.includes(taskId)) {
      recalledBy.push(taskId);
      await this.client.setFrontmatter(memoryPath, { recalled_by: recalledBy });
    }
  }

  // ─── Decisions ──────────────────────────────────────────────────────────

  async saveDecision(
    decision: Decision,
    opts: { sourceTaskId?: string; sourceTaskTitle?: string; agentId?: string } = {},
  ): Promise<void> {
    this.decisionCount++;
    const content = formatDecisionNote(decision, this.decisionCount, opts);
    await this.client.writeNote(
      paths.decision(this.decisionCount, decision.description),
      content,
      'overwrite',
    );
  }

  // ─── Runs ───────────────────────────────────────────────────────────────

  async startRun(config: ProjectConfig, taskIds: string[], taskTitles: string[]): Promise<string> {
    const runId = shortTimestamp();
    this.currentRunId = runId;
    const content = formatRunNote(runId, config, taskIds, taskTitles);
    await this.client.writeNote(paths.run(runId), content, 'overwrite');
    return runId;
  }

  async completeRun(runId: string, totalCost: number): Promise<void> {
    await this.client.setFrontmatter(paths.run(runId), {
      status: 'completed',
      completed: now(),
      total_cost: totalCost,
    });
    this.currentRunId = null;
  }

  // ─── Events ─────────────────────────────────────────────────────────────

  async appendEvent(event: CoordinationEvent, summary?: string): Promise<void> {
    const content = formatEventNote(event, {
      runId: this.currentRunId || undefined,
      summary,
    });
    const timestamp = shortTimestamp();
    await this.client.writeNote(paths.event(timestamp, event.type), content, 'overwrite');
  }

  // ─── Waves ──────────────────────────────────────────────────────────────

  async saveWaves(waves: Wave[], tasks: Task[]): Promise<void> {
    for (const wave of waves) {
      await this.client.writeNote(paths.wave(wave.order), formatWaveNote(wave, tasks), 'overwrite');
    }
    // Also update the Canvas
    await this.client.writeNote(paths.canvas(), formatPipelineCanvas(waves, tasks), 'overwrite');
  }

  // ─── Getters ────────────────────────────────────────────────────────────

  getCurrentRunId(): string | null {
    return this.currentRunId;
  }

  getVaultRoot(): string {
    return VAULT_ROOT;
  }
}

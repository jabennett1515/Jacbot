/**
 * CLI Command Router
 *
 * Minimal CLI framework — no external dependencies.
 * Each command is a simple async function.
 */

import { Jacbot } from '@jacbot/core';
import type { AgentRole, AgentRuntime, CoordinationStrategy } from '@jacbot/core';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// ─── Helpers ──────────────────────────────────────────────────────────────

function log(msg: string): void {
  console.log(msg);
}

function logTable(headers: string[], rows: string[][]): void {
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map(r => (r[i] || '').length))
  );
  const divider = widths.map(w => '─'.repeat(w + 2)).join('┼');

  log(headers.map((h, i) => ` ${h.padEnd(widths[i])} `).join('│'));
  log(divider);
  for (const row of rows) {
    log(row.map((c, i) => ` ${(c || '').padEnd(widths[i])} `).join('│'));
  }
}

function loadJacbot(): Jacbot {
  const configPath = join(process.cwd(), '.jacbot', 'project.json');
  if (!existsSync(configPath)) {
    throw new Error('No Jacbot project found. Run "jacbot init" first.');
  }
  const config = JSON.parse(readFileSync(configPath, 'utf-8'));
  return new Jacbot({
    name: config.name,
    mission: config.mission,
    strategy: config.coordination,
    budgetCeiling: config.budgetCeiling,
  });
}

// ─── Commands ─────────────────────────────────────────────────────────────

async function init(args: string[]): Promise<void> {
  const name = args[0] || 'my-project';
  const mission = args.slice(1).join(' ') || 'Build something great';

  const jacbot = new Jacbot({ name, mission });
  log(`\n  Initialized Jacbot project: ${name}`);
  log(`  Mission: ${mission}`);
  log(`  State: .jacbot/\n`);
  log('  Next steps:');
  log('    jacbot agent add <id> --runtime claude-code --role lead');
  log('    jacbot task create "My first task" --description "..."');
  log('    jacbot run\n');
}

async function agentAdd(args: string[]): Promise<void> {
  const jacbot = loadJacbot();

  const id = args[0];
  if (!id) throw new Error('Usage: jacbot agent add <id> [--runtime <runtime>] [--role <role>]');

  let runtime: AgentRuntime = 'claude-code';
  let role: AgentRole = 'worker';
  let budget: number | undefined;

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--runtime' && args[i + 1]) { runtime = args[++i] as AgentRuntime; }
    if (args[i] === '--role' && args[i + 1]) { role = args[++i] as AgentRole; }
    if (args[i] === '--budget' && args[i + 1]) { budget = parseFloat(args[++i]); }
  }

  jacbot.defineAgent({ id, name: id, role, runtime, budgetLimit: budget });
  log(`  Agent "${id}" registered (${role}, ${runtime})`);
}

async function taskCreate(args: string[]): Promise<void> {
  const jacbot = loadJacbot();

  const title = args[0];
  if (!title) throw new Error('Usage: jacbot task create "<title>" [--description "..."] [--depends <id>]');

  let description = title;
  const dependsOn: string[] = [];
  const tags: string[] = [];
  const contextFiles: string[] = [];

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--description' && args[i + 1]) { description = args[++i]; }
    if (args[i] === '--depends' && args[i + 1]) { dependsOn.push(args[++i]); }
    if (args[i] === '--tag' && args[i + 1]) { tags.push(args[++i]); }
    if (args[i] === '--context' && args[i + 1]) { contextFiles.push(args[++i]); }
  }

  const task = jacbot.createTask({ title, description, dependsOn, tags, contextFiles });
  log(`  Task created: ${task.id}`);
  log(`  Title: ${task.title}`);
  if (dependsOn.length) log(`  Depends on: ${dependsOn.join(', ')}`);
}

async function taskList(_args: string[]): Promise<void> {
  const jacbot = loadJacbot();
  const tasks = jacbot.tasks.list();

  if (tasks.length === 0) {
    log('  No tasks found.');
    return;
  }

  logTable(
    ['ID', 'Title', 'Status', 'Assignee', 'Priority'],
    tasks.map(t => [t.id, t.title.slice(0, 40), t.status, t.assigneeId || '-', t.priority]),
  );
}

async function runDispatch(_args: string[]): Promise<void> {
  const jacbot = loadJacbot();
  const results = await jacbot.dispatch();

  if (results.length === 0) {
    log('  No tasks ready to dispatch (check dependencies or agent availability).');
    return;
  }

  log(`  Dispatched ${results.length} task(s):\n`);
  for (const r of results) {
    log(`    ${r.taskId} → agent "${r.agentId}" on branch "${r.branch}"`);
  }
}

async function status(_args: string[]): Promise<void> {
  const jacbot = loadJacbot();
  const s = jacbot.status();

  log(`\n  Jacbot Status`);
  log(`  ──────────────`);
  log(`  Agents: ${s.agents.total} total (${s.agents.idle} idle, ${s.agents.working} working)`);
  log(`  Tasks:  ${s.tasks.total} total (${s.tasks.pending} pending, ${s.tasks.inProgress} in-progress, ${s.tasks.completed} completed, ${s.tasks.failed} failed)`);
  log(`  Waves:  ${s.waves}`);
  log(`  Cost:   $${s.totalCost.toFixed(4)}\n`);
}

async function waves(_args: string[]): Promise<void> {
  const jacbot = loadJacbot();
  const w = jacbot.coordinator.getWaves();

  if (w.length === 0) {
    log('  No waves computed (no pending tasks).');
    return;
  }

  for (const wave of w) {
    const tasks = wave.taskIds.map(id => {
      const task = orch.tasks.get(id);
      return `${task.id} (${task.title.slice(0, 30)})`;
    });
    log(`  Wave ${wave.order}: ${tasks.join(', ')}`);
  }
}

async function help(): Promise<void> {
  log(`
  Jacbot — Agent Orchestration Framework

  Commands:
    init <name> <mission>         Initialize a new project
    agent add <id> [options]      Register an agent
    task create "<title>" [opts]  Create a task
    task list                     List all tasks
    run                           Dispatch ready tasks to agents
    status                        Show project overview
    waves                         Show dependency waves

  Agent options:
    --runtime <runtime>   claude-code | cursor | opencode | gemini-cli | shell | custom
    --role <role>         lead | worker | scout | reviewer | custom
    --budget <usd>        Monthly budget cap in USD

  Task options:
    --description "..."   Detailed task description
    --depends <taskId>    Add a dependency (can repeat)
    --tag <tag>           Add a tag (can repeat)
    --context <file>      Add a context file (can repeat)
  `);
}

// ─── Router ───────────────────────────────────────────────────────────────

const commands: Record<string, (args: string[]) => Promise<void>> = {
  init,
  'agent add': agentAdd,
  'task create': taskCreate,
  'task list': taskList,
  run: runDispatch,
  status,
  waves,
  help,
};

export async function run(argv: string[]): Promise<void> {
  // Try two-word commands first, then single-word
  const twoWord = `${argv[0]} ${argv[1]}`;
  if (commands[twoWord]) {
    return commands[twoWord](argv.slice(2));
  }

  const oneWord = argv[0];
  if (oneWord && commands[oneWord]) {
    return commands[oneWord](argv.slice(1));
  }

  return help();
}

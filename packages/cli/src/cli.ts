/**
 * CLI Command Router
 *
 * Minimal CLI framework — no external dependencies.
 * Each command is a simple async function.
 */

import { Jacbot, StateStore, ClaudeCodeAdapter, normalizeAgentConfig, CONFIG_FILE_NAMES, ObsidianStore, FilesystemObsidianClient } from '@jacbot/core';
import type { AgentRole, AgentRuntime, CoordinationStrategy, JacbotConfig } from '@jacbot/core';
import { MemoryManager, ObsidianMemoryManager } from '@jacbot/memory';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

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
  const statePath = join(process.cwd(), '.jacbot');
  const configPath = join(statePath, 'project.json');
  if (!existsSync(configPath)) {
    throw new Error('No Jacbot project found. Run "jacbot init" first.');
  }
  const config = JSON.parse(readFileSync(configPath, 'utf-8'));

  // Connect to Obsidian vault if configured
  let obsidianStore: ObsidianStore | undefined;
  if (config.obsidianVault) {
    const vaultPath = resolve(config.obsidianVault);
    const client = new FilesystemObsidianClient({ vaultPath });
    obsidianStore = new ObsidianStore(client);
  }

  const jacbot = new Jacbot({
    name: config.name,
    mission: config.mission,
    strategy: config.coordination,
    budgetCeiling: config.budgetCeiling,
    workingDir: process.cwd(),
    obsidianStore,
  });

  // Register the Claude Code runtime adapter
  jacbot.registerRuntime(new ClaudeCodeAdapter());

  // Wire Obsidian memory as the context builder for task execution
  if (config.obsidianVault && obsidianStore) {
    const vaultPath = resolve(config.obsidianVault);
    const memClient = new FilesystemObsidianClient({ vaultPath });
    const obsidianMemory = new ObsidianMemoryManager(memClient);
    jacbot.setMemoryBuilder(async (taskId, desc, tags) => {
      return obsidianMemory.buildContext(taskId, desc, tags);
    });
  }

  // Rehydrate agents from state
  const store = new StateStore(statePath);
  for (const agentId of store.listAgents()) {
    const saved = store.loadAgent(agentId);
    if (saved) {
      try { jacbot.agents.register(saved.config); } catch { /* already registered */ }
    }
  }

  // Rehydrate tasks from state (restore preserves original IDs and status)
  for (const task of store.loadAllTasks()) {
    // Restore dates from JSON (they come back as strings)
    task.createdAt = new Date(task.createdAt);
    task.updatedAt = new Date(task.updatedAt);
    if (task.startedAt) task.startedAt = new Date(task.startedAt);
    if (task.completedAt) task.completedAt = new Date(task.completedAt);
    jacbot.tasks.restore(task);
  }

  return jacbot;
}

/**
 * Try to find and load a jacbot.config.ts/js/mjs file in the current directory.
 * Returns null if no config file found.
 */
function findConfigFile(): string | null {
  for (const name of CONFIG_FILE_NAMES) {
    const fullPath = join(process.cwd(), name);
    if (existsSync(fullPath)) return fullPath;
  }
  return null;
}

/**
 * Load a Jacbot instance from a config file (jacbot.config.ts).
 * Uses dynamic import() so TypeScript files need tsx/ts-node or pre-compilation.
 */
async function loadFromConfig(configPath: string): Promise<Jacbot> {
  // Dynamic import — works with .js/.mjs natively, .ts needs a loader like tsx
  const fileUrl = pathToFileURL(configPath).href;
  const mod = await import(fileUrl);
  const config: JacbotConfig = mod.default || mod;

  if (!config.name || !config.mission || !config.agents) {
    throw new Error(`Invalid config file: must export { name, mission, agents }`);
  }

  const jacbot = new Jacbot({
    name: config.name,
    mission: config.mission,
    strategy: config.strategy,
    budgetCeiling: config.budgetCeiling,
    workingDir: process.cwd(),
  });

  // Register runtime adapters
  const ccOptions = config.runtimes?.['claude-code'] || {};
  jacbot.registerRuntime(new ClaudeCodeAdapter(ccOptions));

  // Register agents
  for (const agentInput of config.agents) {
    jacbot.defineAgent(normalizeAgentConfig(agentInput));
  }

  // Create tasks (if defined in config)
  if (config.tasks) {
    for (const taskInput of config.tasks) {
      jacbot.createTask(taskInput);
    }
  }

  return jacbot;
}

// ─── Commands ─────────────────────────────────────────────────────────────

async function init(args: string[]): Promise<void> {
  // Parse --obsidian flag
  let vaultPath: string | undefined;
  const filteredArgs: string[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--obsidian' && args[i + 1]) {
      vaultPath = resolve(args[++i]);
    } else {
      filteredArgs.push(args[i]);
    }
  }

  const name = filteredArgs[0] || 'my-project';
  const mission = filteredArgs.slice(1).join(' ') || 'Build something great';

  // Set up Obsidian if requested
  let obsidianStore: ObsidianStore | undefined;
  if (vaultPath) {
    const client = new FilesystemObsidianClient({ vaultPath });
    obsidianStore = new ObsidianStore(client);
  }

  const jacbot = new Jacbot({ name, mission, obsidianStore });
  jacbot.save(); // Persist project.json to disk

  // Store vault path in project.json so loadJacbot() can reconnect
  if (vaultPath) {
    const statePath = join(process.cwd(), '.jacbot');
    const configPath = join(statePath, 'project.json');
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    config.obsidianVault = vaultPath;
    writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

    // Initialize the vault structure (dashboard, MOCs, templates, etc.)
    await jacbot.initObsidianVault();
    log(`\n  Initialized Jacbot project: ${name}`);
    log(`  Mission: ${mission}`);
    log(`  State: .jacbot/`);
    log(`  Obsidian vault: ${vaultPath}`);
    log(`  Vault structure: ${vaultPath}/Jacbot/\n`);
  } else {
    log(`\n  Initialized Jacbot project: ${name}`);
    log(`  Mission: ${mission}`);
    log(`  State: .jacbot/\n`);
    log('  Tip: Add --obsidian <vault-path> to sync state to your Obsidian vault.\n');
  }

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
  let instructions: string | undefined;

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--runtime' && args[i + 1]) { runtime = args[++i] as AgentRuntime; }
    if (args[i] === '--role' && args[i + 1]) { role = args[++i] as AgentRole; }
    if (args[i] === '--budget' && args[i + 1]) { budget = parseFloat(args[++i]); }
    if (args[i] === '--instructions' && args[i + 1]) { instructions = args[++i]; }
  }

  jacbot.defineAgent({ id, name: id, role, runtime, budgetLimit: budget, instructions });
  log(`  Agent "${id}" registered (${role}, ${runtime})`);
}

async function taskCreate(args: string[]): Promise<void> {
  const jacbot = loadJacbot();

  const title = args[0];
  if (!title) throw new Error('Usage: jacbot task create "<title>" [--description "..."] [--depends <id>]');

  let description = title;
  let id: string | undefined;
  let priority: string | undefined;
  const dependsOn: string[] = [];
  const tags: string[] = [];
  const contextFiles: string[] = [];

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--description' && args[i + 1]) { description = args[++i]; }
    if (args[i] === '--id' && args[i + 1]) { id = args[++i]; }
    if (args[i] === '--priority' && args[i + 1]) { priority = args[++i]; }
    if (args[i] === '--depends' && args[i + 1]) { dependsOn.push(args[++i]); }
    if (args[i] === '--tag' && args[i + 1]) { tags.push(args[++i]); }
    if (args[i] === '--context' && args[i + 1]) { contextFiles.push(args[++i]); }
  }

  const task = jacbot.createTask({
    id,
    title,
    description,
    priority: priority as any,
    dependsOn,
    tags,
    contextFiles,
  });
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

async function runDispatch(args: string[]): Promise<void> {
  // Try config file first (jacbot.config.ts), fall back to .jacbot/ state
  const configFile = findConfigFile();
  let jacbot: Jacbot;

  if (configFile && !args.includes('--no-config')) {
    log(`\n  Loading config from ${configFile.split('/').pop()}...`);
    jacbot = await loadFromConfig(configFile);
  } else {
    jacbot = loadJacbot();
  }

  // Check if --dry-run flag is passed
  const dryRun = args.includes('--dry-run');

  if (dryRun) {
    // Just dispatch (assign tasks to agents) without executing
    const results = await jacbot.dispatch();

    if (results.length === 0) {
      log('  No tasks ready to dispatch (check dependencies or agent availability).');
      return;
    }

    log(`  [DRY RUN] Would dispatch ${results.length} task(s):\n`);
    for (const r of results) {
      log(`    ${r.taskId} → agent "${r.agentId}" on branch "${r.branch}"`);
    }
    return;
  }

  // Full execution — dispatch AND run tasks via runtime adapters
  log('\n  Checking runtime availability...');
  const availability = await jacbot.checkRuntimes();
  for (const [runtime, available] of Object.entries(availability)) {
    log(`    ${available ? '✓' : '✗'} ${runtime}`);
  }

  const unavailable = Object.entries(availability).filter(([, ok]) => !ok);
  if (unavailable.length > 0) {
    log(`\n  Warning: ${unavailable.map(([r]) => r).join(', ')} not available.`);
    log('  Agents using unavailable runtimes will be skipped.\n');
  }

  log('\n  Dispatching and executing tasks...\n');

  // Subscribe to events for live output
  jacbot.on(async (event) => {
    const time = event.timestamp.toLocaleTimeString();
    switch (event.type) {
      case 'task_assigned':
        log(`  [${time}] 🔨 ${event.taskId} → ${event.agentId} (branch: ${(event.payload as any).branch})`);
        break;
      case 'task_completed':
        log(`  [${time}] ✅ ${event.taskId} completed`);
        break;
      case 'task_failed':
        log(`  [${time}] ❌ ${event.taskId} failed: ${(event.payload as any).error}`);
        break;
      case 'budget_warning':
        log(`  [${time}] ⚠️  Budget warning: ${event.agentId}`);
        break;
    }
  });

  const run = await jacbot.run();

  // Summary
  log(`\n  ────────────────────────────`);
  log(`  Run complete in ${(run.durationMs / 1000).toFixed(1)}s`);
  log(`  Dispatched: ${run.dispatched.length} tasks`);
  log(`  Succeeded:  ${run.results.size} tasks`);
  log(`  Failed:     ${run.errors.size} tasks`);

  if (run.results.size > 0) {
    log(`\n  Results:`);
    for (const [taskId, result] of run.results) {
      log(`    ${taskId}: ${result.exitCode} — ${result.summary.slice(0, 80)}`);
      if (result.filesChanged.length > 0) {
        log(`      Files: ${result.filesChanged.slice(0, 5).join(', ')}${result.filesChanged.length > 5 ? '...' : ''}`);
      }
      if (result.usage.estimatedCostUsd > 0) {
        log(`      Cost: $${result.usage.estimatedCostUsd.toFixed(4)}`);
      }
    }
  }

  if (run.errors.size > 0) {
    log(`\n  Errors:`);
    for (const [taskId, error] of run.errors) {
      log(`    ${taskId}: ${error.message}`);
    }
  }

  const s = jacbot.status();
  log(`\n  Total cost: $${s.totalCost.toFixed(4)}`);
  log('');
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
      const task = jacbot.tasks.get(id);
      return `${task.id} (${task.title.slice(0, 30)})`;
    });
    log(`  Wave ${wave.order}: ${tasks.join(', ')}`);
  }
}

async function recall(args: string[]): Promise<void> {
  const query = args.join(' ');
  if (!query) throw new Error('Usage: jacbot recall "<query>" [--scope project|session|task] [--limit N]');

  let scope: string | undefined;
  let limit = 10;
  const queryParts: string[] = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--scope' && args[i + 1]) { scope = args[++i]; }
    else if (args[i] === '--limit' && args[i + 1]) { limit = parseInt(args[++i]); }
    else { queryParts.push(args[i]); }
  }

  // Rehydrate memory from StateStore so recall actually has data
  const statePath = join(process.cwd(), '.jacbot');
  const store = new StateStore(statePath);
  const memory = new MemoryManager();

  const memoryIds = store.listMemory();
  for (const memId of memoryIds) {
    const entry = store.loadMemory(memId);
    if (entry) {
      entry.createdAt = new Date(entry.createdAt);
      if (entry.expiresAt) entry.expiresAt = new Date(entry.expiresAt);
      memory.restore(entry);
    }
  }

  if (memory.size() === 0) {
    log('  No memories stored yet. Memories are created after tasks complete.');
    return;
  }

  const results = await memory.recall({
    query: queryParts.join(' '),
    scope: scope as any,
    limit,
  });

  if (results.entries.length === 0) {
    log('  No matching memories found.');
    return;
  }

  log(`  Found ${results.totalMatches} memories (showing ${results.entries.length}):\n`);
  for (const entry of results.entries) {
    log(`  [${entry.scope}] ${entry.content.slice(0, 80)}`);
    if (entry.tags.length > 0) log(`    Tags: ${entry.tags.join(', ')}`);
    log('');
  }
}

async function checkRuntime(_args: string[]): Promise<void> {
  const jacbot = loadJacbot();
  log('\n  Runtime availability:\n');
  const availability = await jacbot.checkRuntimes();
  for (const [runtime, available] of Object.entries(availability)) {
    log(`    ${available ? '✓' : '✗'} ${runtime}`);
  }
  if (Object.keys(availability).length === 0) {
    log('    No runtimes registered. The Claude Code adapter is registered by default.');
  }
  log('');
}

async function help(): Promise<void> {
  log(`
  Jacbot — Agent Orchestration Framework

  Commands:
    init <name> <mission>         Initialize a new project (add --obsidian <path> for vault sync)
    agent add <id> [options]      Register an agent
    task create "<title>" [opts]  Create a task
    task list                     List all tasks
    run [--dry-run]               Execute tasks via runtime adapters
    status                        Show project overview
    waves                         Show dependency waves
    recall "<query>" [options]    Query agent memory
    check runtime                 Check runtime adapter availability

  Agent options:
    --runtime <runtime>        claude-code | cursor | opencode | gemini-cli | shell | custom
    --role <role>              lead | worker | scout | reviewer | custom
    --budget <usd>             Monthly budget cap in USD
    --instructions "..."       System instructions for this agent

  Task options:
    --description "..."        Detailed task description
    --depends <taskId>         Add a dependency (can repeat)
    --tag <tag>                Add a tag (can repeat)
    --context <file>           Add a context file (can repeat)

  Run options:
    --dry-run                  Show what would be dispatched without executing
    --no-config                Skip jacbot.config.ts and use .jacbot/ state only

  Recall options:
    --scope <scope>            Filter by: project | session | task
    --limit <N>                Max results (default: 10)
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
  recall,
  'check runtime': checkRuntime,
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

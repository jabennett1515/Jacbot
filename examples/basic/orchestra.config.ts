/**
 * Example: Basic Jacbot Configuration
 *
 * This demonstrates setting up a project with two agents
 * working on a REST API with dependency-aware task scheduling
 * and actual execution via the Claude Code runtime adapter.
 */

import { Jacbot, ClaudeCodeAdapter } from '@jacbot/core';

async function main() {
  // ─── Initialize Project ───────────────────────────────────────────────

  const jacbot = new Jacbot({
    name: 'rest-api',
    mission: 'Build a production-ready REST API with auth, CRUD, and tests',
    strategy: 'wave',
    budgetCeiling: 100,
  });

  // ─── Register Runtime Adapter ────────────────────────────────────────

  jacbot.registerRuntime(new ClaudeCodeAdapter({
    maxTurns: 20,
    timeoutMs: 5 * 60 * 1000, // 5 minutes per task
  }));

  // ─── Register Agents ──────────────────────────────────────────────────

  jacbot.defineAgent({
    id: 'lead',
    name: 'Lead Agent',
    role: 'lead',
    runtime: 'claude-code',
    capabilities: ['typescript', 'api-design', 'architecture'],
    budgetLimit: 60,
    instructions: 'You are the lead architect. Focus on clean, well-structured code.',
  });

  jacbot.defineAgent({
    id: 'worker-1',
    name: 'Worker Agent',
    role: 'worker',
    runtime: 'claude-code',
    capabilities: ['typescript', 'testing'],
    budgetLimit: 40,
    instructions: 'You are a worker agent. Follow the patterns set by the lead.',
  });

  // ─── Create Tasks with Dependencies ───────────────────────────────────

  const setup = jacbot.createTask({
    title: 'Project setup',
    description: 'Initialize Express project with TypeScript, ESLint, and project structure',
    priority: 'high',
    tags: ['typescript', 'setup'],
    contextFiles: ['package.json', 'tsconfig.json'],
  });

  const schema = jacbot.createTask({
    title: 'Database schema',
    description: 'Create PostgreSQL schema with users, sessions, and posts tables using Drizzle ORM',
    priority: 'high',
    dependsOn: [setup.id],
    tags: ['database'],
    contextFiles: ['src/db/schema.ts'],
  });

  const auth = jacbot.createTask({
    title: 'Auth middleware',
    description: 'Implement JWT-based authentication with bcrypt password hashing, login, register, and refresh token endpoints',
    priority: 'high',
    dependsOn: [schema.id],
    tags: ['typescript', 'auth'],
    contextFiles: ['src/middleware/auth.ts', 'src/routes/auth.ts'],
  });

  const crud = jacbot.createTask({
    title: 'CRUD endpoints',
    description: 'Build RESTful CRUD endpoints for posts with pagination, filtering, and validation',
    priority: 'normal',
    dependsOn: [schema.id, auth.id],
    tags: ['typescript', 'api-design'],
    contextFiles: ['src/routes/posts.ts'],
  });

  const tests = jacbot.createTask({
    title: 'Integration tests',
    description: 'Write integration tests for all endpoints using Vitest and Supertest',
    priority: 'normal',
    dependsOn: [auth.id, crud.id],
    tags: ['testing'],
    contextFiles: ['tests/'],
  });

  // ─── View the Execution Plan ──────────────────────────────────────────

  console.log('\nExecution Waves:');
  const waves = jacbot.coordinator.getWaves();
  for (const wave of waves) {
    const tasks = wave.taskIds.map(id => jacbot.tasks.get(id).title);
    console.log(`  Wave ${wave.order}: ${tasks.join(', ')}`);
  }

  // Output:
  //   Wave 0: Project setup
  //   Wave 1: Database schema
  //   Wave 2: Auth middleware
  //   Wave 3: CRUD endpoints
  //   Wave 4: Integration tests

  // ─── Subscribe to Events (optional) ──────────────────────────────────

  jacbot.on(async (event) => {
    const time = event.timestamp.toLocaleTimeString();
    console.log(`  [${time}] ${event.type}: ${event.taskId} → ${event.agentId}`);
  });

  // ─── Run Everything ────────────────────────────────────────────────────

  console.log('\nRunning...');
  const run = await jacbot.run();

  console.log(`\nDone in ${(run.durationMs / 1000).toFixed(1)}s`);
  console.log(`  Completed: ${run.results.size}`);
  console.log(`  Failed: ${run.errors.size}`);
  console.log(`  Total cost: $${jacbot.status().totalCost.toFixed(4)}`);

  for (const [taskId, result] of run.results) {
    console.log(`\n  ${taskId}: ${result.exitCode}`);
    console.log(`    ${result.summary}`);
    if (result.filesChanged.length > 0) {
      console.log(`    Files: ${result.filesChanged.join(', ')}`);
    }
  }
}

main().catch(console.error);

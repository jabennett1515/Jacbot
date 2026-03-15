/**
 * Example: Basic Jacbot Configuration
 *
 * This demonstrates setting up a project with two agents
 * working on a REST API with dependency-aware task scheduling.
 */

import { Jacbot } from '@jacbot/core';

async function main() {
  // ─── Initialize Project ───────────────────────────────────────────────

  const jacbot = new Jacbot({
    name: 'rest-api',
    mission: 'Build a production-ready REST API with auth, CRUD, and tests',
    strategy: 'wave',
    budgetCeiling: 100,
  });

  // ─── Register Agents ──────────────────────────────────────────────────

  jacbot.defineAgent({
    id: 'lead',
    name: 'Lead Agent',
    role: 'lead',
    runtime: 'claude-code',
    capabilities: ['typescript', 'api-design', 'architecture'],
    budgetLimit: 60,
  });

  jacbot.defineAgent({
    id: 'worker-1',
    name: 'Worker Agent',
    role: 'worker',
    runtime: 'claude-code',
    capabilities: ['typescript', 'testing'],
    budgetLimit: 40,
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

  // ─── Dispatch ─────────────────────────────────────────────────────────

  console.log('\nDispatching...');
  const dispatched = await jacbot.dispatch();

  for (const d of dispatched) {
    console.log(`  ${d.taskId} → ${d.agentId} (branch: ${d.branch})`);
  }

  // ─── Status ───────────────────────────────────────────────────────────

  console.log('\nStatus:', jacbot.status());
}

main().catch(console.error);

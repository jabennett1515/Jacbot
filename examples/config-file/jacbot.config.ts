/**
 * Example: Declarative Jacbot Configuration
 *
 * Instead of writing imperative code, define your project
 * in a config file and run it with `jacbot run`.
 *
 * Usage:
 *   cd examples/config-file
 *   npx tsx ../../packages/cli/src/bin.ts run
 *
 * Or with jacbot installed globally:
 *   jacbot run
 */

import { defineConfig } from '@jacbot/core';

export default defineConfig({
  name: 'rest-api',
  mission: 'Build a production-ready REST API with auth, CRUD, and tests',
  strategy: 'wave',
  budgetCeiling: 100,

  runtimes: {
    'claude-code': {
      maxTurns: 20,
      timeoutMs: 5 * 60 * 1000, // 5 minutes per task
    },
  },

  agents: [
    {
      id: 'lead',
      name: 'Lead Agent',
      role: 'lead',
      runtime: 'claude-code',
      capabilities: ['typescript', 'api-design', 'architecture'],
      budgetLimit: 60,
      instructions: 'You are the lead architect. Focus on clean, well-structured code.',
    },
    {
      id: 'worker-1',
      name: 'Worker Agent',
      role: 'worker',
      runtime: 'claude-code',
      capabilities: ['typescript', 'testing'],
      budgetLimit: 40,
      instructions: 'You are a worker agent. Follow the patterns set by the lead.',
    },
  ],

  tasks: [
    {
      id: 'project-setup',
      title: 'Project setup',
      description: 'Initialize Express project with TypeScript, ESLint, and project structure',
      priority: 'high',
      tags: ['typescript', 'setup'],
      contextFiles: ['package.json', 'tsconfig.json'],
    },
    {
      id: 'database-schema',
      title: 'Database schema',
      description: 'Create PostgreSQL schema with users, sessions, and posts tables using Drizzle ORM',
      priority: 'high',
      dependsOn: ['project-setup'],
      tags: ['database'],
      contextFiles: ['src/db/schema.ts'],
    },
    {
      id: 'auth-middleware',
      title: 'Auth middleware',
      description: 'Implement JWT-based authentication with bcrypt password hashing',
      priority: 'high',
      dependsOn: ['database-schema'],
      tags: ['typescript', 'auth'],
      contextFiles: ['src/middleware/auth.ts', 'src/routes/auth.ts'],
    },
    {
      id: 'crud-endpoints',
      title: 'CRUD endpoints',
      description: 'Build RESTful CRUD endpoints for posts with pagination, filtering, and validation',
      priority: 'normal',
      dependsOn: ['database-schema', 'auth-middleware'],
      tags: ['typescript', 'api-design'],
      contextFiles: ['src/routes/posts.ts'],
    },
    {
      id: 'integration-tests',
      title: 'Integration tests',
      description: 'Write integration tests for all endpoints using Vitest and Supertest',
      priority: 'normal',
      dependsOn: ['auth-middleware', 'crud-endpoints'],
      tags: ['testing'],
      contextFiles: ['tests/'],
    },
  ],
});

/**
 * State Persistence
 *
 * File-driven state machine inspired by GSD-2's .gsd/ directory.
 * All state lives on disk as JSON files in .jacbot/
 * This makes state git-versionable, inspectable, and crash-recoverable.
 *
 * Directory structure:
 *   .jacbot/
 *   ├── project.json        # Project config
 *   ├── agents/              # Agent state files
 *   │   └── {agentId}.json
 *   ├── tasks/               # Task state files
 *   │   └── {taskId}.json
 *   ├── memory/              # Memory entries
 *   │   └── {entryId}.json
 *   ├── decisions.jsonl      # Append-only decisions log
 *   ├── events.jsonl         # Append-only event log
 *   └── sessions/            # Session recovery files
 *       └── {sessionId}.json
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AgentConfig, AgentState, Task, MemoryEntry, Decision, CoordinationEvent, ProjectConfig } from './types.js';

export class StateStore {
  private basePath: string;

  constructor(basePath: string = '.jacbot') {
    this.basePath = basePath;
    this.ensureDirectories();
  }

  // ─── Directory Management ───────────────────────────────────────────────

  private ensureDirectories(): void {
    const dirs = ['agents', 'tasks', 'memory', 'sessions'];
    for (const dir of dirs) {
      const dirPath = join(this.basePath, dir);
      if (!existsSync(dirPath)) {
        mkdirSync(dirPath, { recursive: true });
      }
    }
  }

  // ─── Generic Read/Write ─────────────────────────────────────────────────

  private readJson<T>(filePath: string): T | null {
    const fullPath = join(this.basePath, filePath);
    if (!existsSync(fullPath)) return null;
    const raw = readFileSync(fullPath, 'utf-8');
    return JSON.parse(raw) as T;
  }

  private writeJson<T>(filePath: string, data: T): void {
    const fullPath = join(this.basePath, filePath);
    writeFileSync(fullPath, JSON.stringify(data, null, 2), 'utf-8');
  }

  private appendJsonl<T>(filePath: string, entry: T): void {
    const fullPath = join(this.basePath, filePath);
    appendFileSync(fullPath, JSON.stringify(entry) + '\n', 'utf-8');
  }

  private listDir(dirPath: string): string[] {
    const fullPath = join(this.basePath, dirPath);
    if (!existsSync(fullPath)) return [];
    return readdirSync(fullPath).filter(f => f.endsWith('.json')).map(f => f.replace('.json', ''));
  }

  // ─── Project Config ─────────────────────────────────────────────────────

  saveProject(config: ProjectConfig): void {
    this.writeJson('project.json', config);
  }

  loadProject(): ProjectConfig | null {
    return this.readJson<ProjectConfig>('project.json');
  }

  // ─── Agents ─────────────────────────────────────────────────────────────

  saveAgent(agent: AgentConfig, state: AgentState): void {
    this.writeJson(`agents/${agent.id}.json`, { config: agent, state });
  }

  loadAgent(agentId: string): { config: AgentConfig; state: AgentState } | null {
    return this.readJson(`agents/${agentId}.json`);
  }

  listAgents(): string[] {
    return this.listDir('agents');
  }

  // ─── Tasks ──────────────────────────────────────────────────────────────

  saveTask(task: Task): void {
    this.writeJson(`tasks/${task.id}.json`, task);
  }

  loadTask(taskId: string): Task | null {
    return this.readJson<Task>(`tasks/${taskId}.json`);
  }

  listTasks(): string[] {
    return this.listDir('tasks');
  }

  loadAllTasks(): Task[] {
    return this.listTasks()
      .map(id => this.loadTask(id))
      .filter((t): t is Task => t !== null);
  }

  // ─── Memory ─────────────────────────────────────────────────────────────

  saveMemory(entry: MemoryEntry): void {
    this.writeJson(`memory/${entry.id}.json`, entry);
  }

  loadMemory(entryId: string): MemoryEntry | null {
    return this.readJson<MemoryEntry>(`memory/${entryId}.json`);
  }

  listMemory(): string[] {
    return this.listDir('memory');
  }

  // ─── Append-Only Logs ───────────────────────────────────────────────────

  appendDecision(decision: Decision): void {
    this.appendJsonl('decisions.jsonl', decision);
  }

  appendEvent(event: CoordinationEvent): void {
    this.appendJsonl('events.jsonl', event);
  }

  // ─── Session Recovery ───────────────────────────────────────────────────

  saveSession(sessionId: string, data: Record<string, unknown>): void {
    this.writeJson(`sessions/${sessionId}.json`, {
      ...data,
      savedAt: new Date().toISOString(),
    });
  }

  loadSession(sessionId: string): Record<string, unknown> | null {
    return this.readJson(`sessions/${sessionId}.json`);
  }

  /** Get the state directory path */
  getPath(): string {
    return this.basePath;
  }
}

/**
 * Memory Manager
 *
 * High-level API for storing and recalling agent memories.
 * Manages the three tiers: task → session → project.
 *
 * Key design decisions:
 * - Memories are automatically tagged with scope and source
 * - Task-scoped memories expire when the task completes
 * - Session-scoped memories summarize task results
 * - Project-scoped memories persist indefinitely (codebase knowledge)
 * - Recall uses both keyword matching and semantic similarity
 */

import type { MemoryEntry, MemoryScope, RecallQuery, RecallResult } from '@jacbot/core';
import { SimpleVectorStore } from './vector-store.js';

let memoryCounter = 0;
function generateId(): string {
  return `mem_${Date.now()}_${++memoryCounter}`;
}

export class MemoryManager {
  private store: SimpleVectorStore;
  private entries = new Map<string, MemoryEntry>();

  constructor(persistPath?: string) {
    this.store = new SimpleVectorStore(persistPath);
  }

  /**
   * Store a new memory.
   *
   * @example
   * memory.store({
   *   content: 'The auth module uses bcrypt for password hashing',
   *   scope: 'project',
   *   sourceId: 'task_123',
   *   tags: ['auth', 'security'],
   * });
   */
  async store(params: {
    content: string;
    scope: MemoryScope;
    sourceId: string;
    tags?: string[];
    expiresAt?: Date;
  }): Promise<MemoryEntry> {
    const entry: MemoryEntry = {
      id: generateId(),
      scope: params.scope,
      content: params.content,
      sourceId: params.sourceId,
      tags: params.tags || [],
      createdAt: new Date(),
      expiresAt: params.expiresAt,
    };

    // Generate embedding for semantic search
    entry.embedding = this.store.embed(entry.content);

    this.entries.set(entry.id, entry);
    this.store.add(entry.id, entry.embedding, {
      scope: entry.scope,
      tags: entry.tags,
      content: entry.content,
    });

    return entry;
  }

  /**
   * Recall memories relevant to a query.
   * Combines semantic similarity with scope/tag filtering.
   *
   * @example
   * const results = await memory.recall({
   *   query: 'how does authentication work',
   *   scope: 'project',
   *   limit: 5,
   *   minRelevance: 0.7,
   * });
   */
  async recall(query: RecallQuery): Promise<RecallResult> {
    const queryEmbedding = this.store.embed(query.query);
    const limit = query.limit || 10;
    const minRelevance = query.minRelevance || 0.3;

    // Search by semantic similarity
    let results = this.store.search(queryEmbedding, limit * 2); // oversample for filtering

    // Filter by scope
    if (query.scope) {
      results = results.filter(r => r.metadata.scope === query.scope);
    }

    // Filter by tags
    if (query.tags && query.tags.length > 0) {
      results = results.filter(r => {
        const entryTags = r.metadata.tags as string[];
        return query.tags!.some(tag => entryTags.includes(tag));
      });
    }

    // Filter by relevance threshold
    results = results.filter(r => r.similarity >= minRelevance);

    // Filter expired memories
    const now = new Date();
    results = results.filter(r => {
      const entry = this.entries.get(r.id);
      if (!entry?.expiresAt) return true;
      return entry.expiresAt > now;
    });

    // Limit and map to MemoryEntry
    const entries = results
      .slice(0, limit)
      .map(r => {
        const entry = this.entries.get(r.id);
        if (!entry) return null;
        return { ...entry, relevance: r.similarity };
      })
      .filter((e): e is MemoryEntry => e !== null);

    return {
      entries,
      totalMatches: results.length,
    };
  }

  /**
   * Store a task completion summary as a session-scoped memory.
   * This is the bridge between short-term and medium-term memory.
   */
  async summarizeTask(taskId: string, summary: string, decisions: string[]): Promise<void> {
    // Store the summary
    await this.store({
      content: `Task ${taskId} completed: ${summary}`,
      scope: 'session',
      sourceId: taskId,
      tags: ['task-summary'],
    });

    // Store each decision as a project-scoped memory (decisions persist)
    for (const decision of decisions) {
      await this.store({
        content: decision,
        scope: 'project',
        sourceId: taskId,
        tags: ['decision'],
      });
    }
  }

  /**
   * Build a context briefing for a new task.
   * Recalls relevant memories across all scopes to pre-load the agent's context.
   * Inspired by GSD-2's context engineering approach.
   */
  async buildContext(taskDescription: string, tags: string[] = []): Promise<string> {
    const relevant = await this.recall({
      query: taskDescription,
      limit: 10,
      minRelevance: 0.4,
      tags: tags.length > 0 ? tags : undefined,
    });

    if (relevant.entries.length === 0) {
      return '';
    }

    const sections: string[] = ['## Relevant Context from Memory\n'];

    // Group by scope
    const byScope = new Map<MemoryScope, MemoryEntry[]>();
    for (const entry of relevant.entries) {
      const existing = byScope.get(entry.scope) || [];
      existing.push(entry);
      byScope.set(entry.scope, existing);
    }

    if (byScope.has('project')) {
      sections.push('### Project Knowledge');
      for (const entry of byScope.get('project')!) {
        sections.push(`- ${entry.content}`);
      }
      sections.push('');
    }

    if (byScope.has('session')) {
      sections.push('### Recent Session Context');
      for (const entry of byScope.get('session')!) {
        sections.push(`- ${entry.content}`);
      }
      sections.push('');
    }

    if (byScope.has('task')) {
      sections.push('### Related Task Notes');
      for (const entry of byScope.get('task')!) {
        sections.push(`- ${entry.content}`);
      }
      sections.push('');
    }

    return sections.join('\n');
  }

  /** Get total memory count */
  size(): number {
    return this.entries.size;
  }

  /** Clear expired memories */
  gc(): number {
    const now = new Date();
    let cleared = 0;
    for (const [id, entry] of this.entries) {
      if (entry.expiresAt && entry.expiresAt <= now) {
        this.entries.delete(id);
        cleared++;
      }
    }
    return cleared;
  }
}

/**
 * Obsidian-Backed Memory Manager — v2
 *
 * Uses the Obsidian vault as a knowledge graph for agent memory.
 * Every memory is a human-readable markdown note with:
 *   - Descriptive filename (not machine IDs)
 *   - YAML frontmatter for structured queries
 *   - Backlinks to source tasks and agents
 *   - Topic tags from the #jb/topic/* namespace
 *   - Recall tracking (which tasks retrieved this memory)
 *
 * Recall strategy:
 *   1. Tag-based filtering (fast — uses Obsidian's tag index)
 *   2. Full-text search (broad — searches memory note content)
 *   3. Recall tracking (auditable — records what was surfaced per task)
 */

import type { MemoryEntry, MemoryScope, RecallQuery, RecallResult } from '@jacbot/core';
import type { ObsidianMCPClient } from '@jacbot/core';

let memoryCounter = 0;
function generateId(): string {
  return `mem_${Date.now()}_${++memoryCounter}`;
}

function slugify(text: string, maxLen: number = 50): string {
  return text
    .replace(/[^a-zA-Z0-9 -]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, maxLen)
    .trim();
}

export class ObsidianMemoryManager {
  private client: ObsidianMCPClient;
  private vaultRoot: string;

  constructor(client: ObsidianMCPClient, vaultRoot: string = 'Jacbot') {
    this.client = client;
    this.vaultRoot = vaultRoot;
  }

  /**
   * Store a memory as a human-readable note in the vault.
   */
  async store(params: {
    content: string;
    scope: MemoryScope;
    sourceId: string;
    sourceTitle?: string;
    createdByAgent?: string;
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

    const scopeFolder = params.scope.charAt(0).toUpperCase() + params.scope.slice(1);
    const slug = slugify(params.content.slice(0, 50)) || entry.id;
    const path = `${this.vaultRoot}/Memory/${scopeFolder}/${slug}.md`;

    const scopeEmoji: Record<MemoryScope, string> = { project: '🏗️', session: '📋', task: '📝' };
    const scopeLabel: Record<MemoryScope, string> = { project: 'Project Knowledge', session: 'Session Context', task: 'Task Note' };

    const frontmatter = [
      '---',
      `type: memory`,
      `id: "${entry.id}"`,
      `scope: ${entry.scope}`,
      `source_task: "${entry.sourceId}"`,
      `source_task_title: "${params.sourceTitle || ''}"`,
      `created_by: "${params.createdByAgent || ''}"`,
      `recalled_by: []`,
      `relevance_tags:`,
      ...entry.tags.map(t => `  - "${t}"`),
      `created: ${entry.createdAt.toISOString()}`,
      entry.expiresAt ? `expires: ${entry.expiresAt.toISOString()}` : null,
      `aliases:`,
      `  - "${entry.id}"`,
      `tags:`,
      `  - jb`,
      `  - jb/memory`,
      `  - jb/memory/${entry.scope}`,
      ...entry.tags.map(t => `  - jb/topic/${t}`),
      `cssclasses:`,
      `  - jacbot-memory`,
      '---',
    ].filter(Boolean).join('\n');

    const body = `
# ${scopeEmoji[entry.scope]} ${slug}

> [!abstract] ${scopeLabel[entry.scope]}
> **Source:** [[Task · ${params.sourceTitle || entry.sourceId}]]
${params.createdByAgent ? `> **Agent:** [[Agent · ${params.createdByAgent}]]` : ''}
> **Topics:** ${entry.tags.map(t => `\`${t}\``).join(' · ') || '_none_'}
${entry.expiresAt ? `> **Expires:** ${entry.expiresAt.toISOString()}` : ''}

---

${entry.content}

---

## Recall History

\`\`\`dataview
LIST WITHOUT ID "Retrieved for [[Task · " + item + "]]"
FLATTEN this.recalled_by as item
WHERE file.path = this.file.path
\`\`\`
`;

    await this.client.writeNote(path, frontmatter + '\n' + body, 'overwrite');
    return entry;
  }

  /**
   * Recall memories using Obsidian search with tag filtering.
   * Tracks which task triggered the recall for auditability.
   */
  async recall(query: RecallQuery, requestingTaskId?: string): Promise<RecallResult> {
    const searchPath = query.scope
      ? `${this.vaultRoot}/Memory/${query.scope.charAt(0).toUpperCase() + query.scope.slice(1)}`
      : `${this.vaultRoot}/Memory`;

    let searchText = query.query;
    if (query.tags && query.tags.length > 0) {
      searchText = `${searchText} ${query.tags.map(t => `tag:jb/topic/${t}`).join(' ')}`;
    }

    const results = await this.client.search(searchText, { path: searchPath });
    const limit = query.limit || 10;
    const entries: MemoryEntry[] = [];

    for (const result of results.slice(0, limit)) {
      const note = await this.client.readNote(result.path);
      if (!note) continue;

      const fm = note.frontmatter;
      if (fm.type !== 'memory') continue;

      // Track recall
      if (requestingTaskId) {
        const recalledBy = (fm.recalled_by as string[]) || [];
        if (!recalledBy.includes(requestingTaskId)) {
          recalledBy.push(requestingTaskId);
          await this.client.setFrontmatter(result.path, { recalled_by: recalledBy });
        }
      }

      entries.push({
        id: (fm.id as string) || result.path,
        scope: (fm.scope as MemoryScope) || 'project',
        content: result.matches.join(' ').slice(0, 500),
        sourceId: (fm.source_task as string) || '',
        tags: (fm.relevance_tags as string[]) || [],
        createdAt: new Date((fm.created as string) || Date.now()),
        expiresAt: fm.expires ? new Date(fm.expires as string) : undefined,
      });
    }

    return { entries, totalMatches: results.length };
  }

  /**
   * Build a context briefing for a new task.
   * Searches project and session memories, formats as injectable markdown.
   * Tracks all recalls against the requesting task.
   */
  async buildContext(
    taskId: string,
    taskDescription: string,
    tags: string[] = [],
  ): Promise<string> {
    const [projectMemories, sessionMemories] = await Promise.all([
      this.recall({ query: taskDescription, scope: 'project', tags, limit: 8 }, taskId),
      this.recall({ query: taskDescription, scope: 'session', tags, limit: 5 }, taskId),
    ]);

    if (projectMemories.entries.length === 0 && sessionMemories.entries.length === 0) {
      return '';
    }

    const sections: string[] = ['## Context from Memory\n'];
    sections.push(`_${projectMemories.entries.length + sessionMemories.entries.length} memories recalled for this task._\n`);

    if (projectMemories.entries.length > 0) {
      sections.push('### Project Knowledge');
      for (const entry of projectMemories.entries) {
        sections.push(`- ${entry.content}`);
      }
      sections.push('');
    }

    if (sessionMemories.entries.length > 0) {
      sections.push('### Recent Session Context');
      for (const entry of sessionMemories.entries) {
        sections.push(`- ${entry.content}`);
      }
      sections.push('');
    }

    return sections.join('\n');
  }

  /**
   * Store task completion summary and decisions.
   */
  async summarizeTask(
    taskId: string,
    taskTitle: string,
    agentId: string,
    summary: string,
    decisions: string[],
  ): Promise<void> {
    await this.store({
      content: `Task "${taskTitle}" completed: ${summary}`,
      scope: 'session',
      sourceId: taskId,
      sourceTitle: taskTitle,
      createdByAgent: agentId,
      tags: ['task-summary'],
    });

    for (const decision of decisions) {
      await this.store({
        content: decision,
        scope: 'project',
        sourceId: taskId,
        sourceTitle: taskTitle,
        createdByAgent: agentId,
        tags: ['decision'],
      });
    }
  }

  /**
   * Clean up expired task-scoped memories.
   */
  async gc(): Promise<number> {
    const results = await this.client.search('expires:', {
      path: `${this.vaultRoot}/Memory/Task`,
    });
    let cleared = 0;

    for (const result of results) {
      const note = await this.client.readNote(result.path);
      if (!note?.frontmatter.expires) continue;

      const expiresAt = new Date(note.frontmatter.expires as string);
      if (expiresAt <= new Date() && this.client.deleteNote) {
        await this.client.deleteNote(result.path);
        cleared++;
      }
    }

    return cleared;
  }
}

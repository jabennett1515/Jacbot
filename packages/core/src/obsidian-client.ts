/**
 * Filesystem-based Obsidian MCP Client
 *
 * Implements the ObsidianMCPClient interface by reading and writing
 * markdown files directly to an Obsidian vault on disk.
 *
 * This is the simplest approach — no plugins, no REST API, no MCP server.
 * Your vault is just a folder of .md files, and we read/write them directly.
 *
 * YAML frontmatter is parsed manually (no dependencies) and search
 * uses basic text matching across file contents.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { join, dirname, relative, extname } from 'node:path';
import type { ObsidianMCPClient } from './obsidian-store.js';

export interface ObsidianClientOptions {
  /** Absolute path to the Obsidian vault root (e.g., ~/Documents/MyVault) */
  vaultPath: string;
}

export class FilesystemObsidianClient implements ObsidianMCPClient {
  private vaultPath: string;

  constructor(options: ObsidianClientOptions) {
    this.vaultPath = options.vaultPath;
    if (!existsSync(this.vaultPath)) {
      mkdirSync(this.vaultPath, { recursive: true });
    }
  }

  private resolvePath(notePath: string): string {
    // Ensure .md extension
    const withExt = notePath.endsWith('.md') || notePath.endsWith('.canvas')
      ? notePath
      : notePath + '.md';
    return join(this.vaultPath, withExt);
  }

  private ensureDir(filePath: string): void {
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  // ─── Core MCP Interface ──────────────────────────────────────────────────

  async readNote(path: string): Promise<{ content: string; frontmatter: Record<string, unknown> } | null> {
    const fullPath = this.resolvePath(path);
    if (!existsSync(fullPath)) return null;

    const raw = readFileSync(fullPath, 'utf-8');
    const { frontmatter, content } = parseFrontmatter(raw);

    return { content, frontmatter };
  }

  async writeNote(path: string, content: string, mode: 'overwrite' | 'append' | 'prepend' = 'overwrite'): Promise<void> {
    const fullPath = this.resolvePath(path);
    this.ensureDir(fullPath);

    if (mode === 'overwrite' || !existsSync(fullPath)) {
      writeFileSync(fullPath, content, 'utf-8');
      return;
    }

    const existing = readFileSync(fullPath, 'utf-8');
    if (mode === 'append') {
      writeFileSync(fullPath, existing + '\n' + content, 'utf-8');
    } else if (mode === 'prepend') {
      writeFileSync(fullPath, content + '\n' + existing, 'utf-8');
    }
  }

  async getFrontmatter(path: string): Promise<Record<string, unknown> | null> {
    const note = await this.readNote(path);
    return note?.frontmatter || null;
  }

  async setFrontmatter(path: string, fields: Record<string, unknown>): Promise<void> {
    const fullPath = this.resolvePath(path);
    if (!existsSync(fullPath)) return;

    const raw = readFileSync(fullPath, 'utf-8');
    const { frontmatter, content } = parseFrontmatter(raw);

    // Merge new fields into existing frontmatter
    const merged = { ...frontmatter, ...fields };

    // Rebuild the file
    const newFm = serializeFrontmatter(merged);
    writeFileSync(fullPath, newFm + '\n' + content, 'utf-8');
  }

  async addTags(path: string, tags: string[]): Promise<void> {
    const fullPath = this.resolvePath(path);
    if (!existsSync(fullPath)) return;

    const raw = readFileSync(fullPath, 'utf-8');
    const { frontmatter, content } = parseFrontmatter(raw);

    const existing = (frontmatter.tags as string[]) || [];
    const merged = [...new Set([...existing, ...tags])];
    frontmatter.tags = merged;

    const newFm = serializeFrontmatter(frontmatter);
    writeFileSync(fullPath, newFm + '\n' + content, 'utf-8');
  }

  async search(query: string, options?: { path?: string }): Promise<Array<{ path: string; matches: string[] }>> {
    const searchRoot = options?.path
      ? join(this.vaultPath, options.path)
      : this.vaultPath;

    if (!existsSync(searchRoot)) return [];

    const results: Array<{ path: string; matches: string[] }> = [];
    const queryLower = query.toLowerCase();

    // Extract tag: filters from query
    const tagFilters: string[] = [];
    const textQuery = query.replace(/tag:(\S+)/g, (_match, tag) => {
      tagFilters.push(tag);
      return '';
    }).trim().toLowerCase();

    walkDir(searchRoot, (filePath) => {
      if (!filePath.endsWith('.md')) return;

      const raw = readFileSync(filePath, 'utf-8');
      const { frontmatter, content } = parseFrontmatter(raw);

      // Check tag filters
      if (tagFilters.length > 0) {
        const fileTags = (frontmatter.tags as string[]) || [];
        const hasAllTags = tagFilters.every(t => fileTags.some(ft => ft === t || ft.startsWith(t + '/')));
        if (!hasAllTags) return;
      }

      // Text search
      if (textQuery) {
        const fullText = raw.toLowerCase();
        if (!fullText.includes(textQuery)) return;
      }

      // Collect matching lines as snippets
      const matches: string[] = [];
      const lines = content.split('\n');
      for (const line of lines) {
        if (textQuery && line.toLowerCase().includes(textQuery)) {
          matches.push(line.trim());
        }
      }

      // If we matched on tags but no text lines, include the first non-empty line
      if (matches.length === 0 && tagFilters.length > 0) {
        const firstLine = lines.find(l => l.trim().length > 0 && !l.startsWith('#'));
        if (firstLine) matches.push(firstLine.trim());
      }

      // If we matched on the frontmatter text but not body
      if (matches.length === 0 && textQuery) {
        matches.push(content.slice(0, 200).trim());
      }

      const relativePath = relative(this.vaultPath, filePath);
      results.push({ path: relativePath, matches });
    });

    return results;
  }

  async listNotes(path: string): Promise<string[]> {
    const fullPath = join(this.vaultPath, path);
    if (!existsSync(fullPath)) return [];

    const notes: string[] = [];
    walkDir(fullPath, (filePath) => {
      if (filePath.endsWith('.md')) {
        notes.push(relative(this.vaultPath, filePath));
      }
    });

    return notes;
  }

  async deleteNote(path: string): Promise<void> {
    const fullPath = this.resolvePath(path);
    if (existsSync(fullPath)) {
      unlinkSync(fullPath);
    }
  }

  /** Get the vault path */
  getVaultPath(): string {
    return this.vaultPath;
  }
}

// ─── Frontmatter Parser (zero dependencies) ─────────────────────────────────

function parseFrontmatter(raw: string): { frontmatter: Record<string, unknown>; content: string } {
  if (!raw.startsWith('---')) {
    return { frontmatter: {}, content: raw };
  }

  const endIndex = raw.indexOf('\n---', 3);
  if (endIndex === -1) {
    return { frontmatter: {}, content: raw };
  }

  const fmBlock = raw.slice(4, endIndex).trim();
  const content = raw.slice(endIndex + 4).trim();

  const frontmatter: Record<string, unknown> = {};
  let currentKey = '';
  let currentArray: string[] | null = null;

  for (const line of fmBlock.split('\n')) {
    // Array item
    if (line.match(/^\s+-\s/) && currentKey) {
      if (!currentArray) currentArray = [];
      const value = line.replace(/^\s+-\s+/, '').replace(/^"(.*)"$/, '$1').trim();
      currentArray.push(value);
      frontmatter[currentKey] = currentArray;
      continue;
    }

    // If we were building an array and hit a non-array line, close it
    if (currentArray) {
      currentArray = null;
    }

    // Key: value pair
    const kvMatch = line.match(/^(\w[\w_-]*):\s*(.*)/);
    if (kvMatch) {
      currentKey = kvMatch[1];
      const rawValue = kvMatch[2].trim();

      if (rawValue === '' || rawValue === '[]') {
        // Could be start of array or empty value
        if (rawValue === '[]') {
          frontmatter[currentKey] = [];
          currentArray = null;
        } else {
          // Might be start of array — peek at next lines handled by the loop
          frontmatter[currentKey] = '';
          currentArray = null;
        }
      } else {
        frontmatter[currentKey] = parseYamlValue(rawValue);
        currentArray = null;
      }
    }
  }

  return { frontmatter, content };
}

function parseYamlValue(raw: string): unknown {
  // Remove surrounding quotes
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1);
  }

  // Boolean
  if (raw === 'true') return true;
  if (raw === 'false') return false;

  // Number
  if (/^-?\d+(\.\d+)?$/.test(raw)) return parseFloat(raw);

  // Inline array [a, b, c]
  if (raw.startsWith('[') && raw.endsWith(']')) {
    return raw.slice(1, -1).split(',').map(s => {
      const trimmed = s.trim();
      return parseYamlValue(trimmed) as string;
    });
  }

  return raw;
}

function serializeFrontmatter(fm: Record<string, unknown>): string {
  const lines: string[] = ['---'];

  for (const [key, value] of Object.entries(fm)) {
    if (value === undefined || value === null) continue;

    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${key}: []`);
      } else {
        lines.push(`${key}:`);
        for (const item of value) {
          const str = String(item);
          lines.push(`  - ${str.includes(' ') || str.includes(':') ? `"${str}"` : str}`);
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

// ─── Filesystem Walker ───────────────────────────────────────────────────────

function walkDir(dir: string, callback: (filePath: string) => void): void {
  if (!existsSync(dir)) return;

  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(fullPath, callback);
    } else {
      callback(fullPath);
    }
  }
}

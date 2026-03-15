/**
 * @jacbot/memory
 *
 * Three-tier memory system for AI coding agents:
 *
 * 1. Short-term (task scope)  — lives within a single task's context window
 * 2. Medium-term (session scope) — summaries, decisions, and diffs across tasks in a session
 * 3. Long-term (project scope) — codebase knowledge, patterns, developer preferences
 *
 * Two storage backends:
 * - ObsidianMemoryManager — uses an Obsidian vault as a knowledge graph (recommended)
 * - MemoryManager — in-memory with simple vector store (fallback)
 */

export { MemoryManager } from './memory-manager.js';
export { ObsidianMemoryManager } from './obsidian-memory.js';
export { SimpleVectorStore } from './vector-store.js';

/**
 * @jacbot/memory
 *
 * Three-tier memory system for AI coding agents:
 *
 * 1. Short-term (task scope)  — lives within a single task's context window
 * 2. Medium-term (session scope) — summaries, decisions, and diffs across tasks in a session
 * 3. Long-term (project scope) — codebase knowledge, patterns, developer preferences
 *
 * Uses a local SQLite-backed vector store for semantic search.
 * No external dependencies — everything runs locally.
 */

export { MemoryManager } from './memory-manager.js';
export { SimpleVectorStore } from './vector-store.js';

/**
 * Simple Vector Store
 *
 * A lightweight, dependency-free vector store for semantic search.
 * Uses TF-IDF-like bag-of-words embeddings with cosine similarity.
 *
 * This is intentionally simple — good enough for local dev use.
 * For production, swap this out with a proper embedding model
 * (OpenAI, Cohere, local sentence-transformers, etc.)
 *
 * Future: Add SQLite persistence and real embedding support.
 */

export interface VectorEntry {
  id: string;
  vector: number[];
  metadata: Record<string, unknown>;
}

export interface SearchResult {
  id: string;
  similarity: number;
  metadata: Record<string, unknown>;
}

export class SimpleVectorStore {
  private entries: VectorEntry[] = [];
  private vocabulary = new Map<string, number>();
  private persistPath?: string;

  constructor(persistPath?: string) {
    this.persistPath = persistPath;
    // TODO: Load from disk if persistPath exists
  }

  /**
   * Generate a simple bag-of-words embedding.
   * Tokenizes text, builds vocabulary incrementally, returns sparse vector.
   */
  embed(text: string): number[] {
    const tokens = this.tokenize(text);

    // Build vocabulary
    for (const token of tokens) {
      if (!this.vocabulary.has(token)) {
        this.vocabulary.set(token, this.vocabulary.size);
      }
    }

    // Create vector
    const vector = new Array(this.vocabulary.size).fill(0);
    for (const token of tokens) {
      const idx = this.vocabulary.get(token)!;
      vector[idx] += 1;
    }

    // Normalize
    const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    if (magnitude > 0) {
      for (let i = 0; i < vector.length; i++) {
        vector[i] /= magnitude;
      }
    }

    return vector;
  }

  /** Add an entry to the store */
  add(id: string, vector: number[], metadata: Record<string, unknown> = {}): void {
    this.entries.push({ id, vector, metadata });
  }

  /** Search for similar vectors using cosine similarity */
  search(queryVector: number[], limit: number = 10): SearchResult[] {
    const results: SearchResult[] = [];

    for (const entry of this.entries) {
      const similarity = this.cosineSimilarity(queryVector, entry.vector);
      results.push({
        id: entry.id,
        similarity,
        metadata: entry.metadata,
      });
    }

    return results
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }

  /** Cosine similarity between two vectors (handles different lengths) */
  private cosineSimilarity(a: number[], b: number[]): number {
    const len = Math.max(a.length, b.length);
    let dotProduct = 0;
    let magA = 0;
    let magB = 0;

    for (let i = 0; i < len; i++) {
      const va = a[i] || 0;
      const vb = b[i] || 0;
      dotProduct += va * vb;
      magA += va * va;
      magB += vb * vb;
    }

    const magnitude = Math.sqrt(magA) * Math.sqrt(magB);
    if (magnitude === 0) return 0;
    return dotProduct / magnitude;
  }

  /** Simple tokenizer: lowercase, split on non-alphanumeric, filter short tokens */
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(token => token.length > 2);
  }

  /** Get store size */
  get size(): number {
    return this.entries.length;
  }
}

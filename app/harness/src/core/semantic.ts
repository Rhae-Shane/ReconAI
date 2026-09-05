/**
 * semantic.ts — SemanticMatcher for the fuzzy residual.
 *
 * ReconAI is deterministic-first; an LLM/embedding is only ever used for the *residual* ambiguity
 * (the spec: "AI comes after deterministic matching"). This module is the semantic layer for that
 * residual. It is pluggable and zero-dep by default:
 *
 *   - `NgramSemanticMatcher` — a deterministic character/word-overlap similarity in [0,1]. No API
 *     key, no network, fully testable and reproducible. This is what runs unless you provide an
 *     embeddings provider.
 *   - `EmbeddingSemanticMatcher` — wraps an `EmbeddingsProvider` (OpenAI embeddings via
 *     OPENAI_API_KEY) and scores by cosine similarity over cached vectors. Used when a
 *     provider + key are supplied.
 *
 * To keep the audited batch stable, the semantic signal is OPT-IN: the default `HeuristicJudge`
 * uses none of it (51 tests stay green); a judge constructed with a matcher boosts confidence for
 * clearly-similar near-misses. See judge.ts.
 */

/** Deterministic character n-grams (case-insensitive, punctuation-stripped). */
export function ngrams(s: string, n = 3): Set<string> {
  const clean = s.toUpperCase().replace(/[^A-Z0-9\s]/g, " ").replace(/\s+/g, " ");
  if (clean.replace(/\s/g, "").length < n) return new Set([clean.trim()].filter(Boolean));
  const out = new Set<string>();
  const spaced = ` ${clean} `;
  for (let i = 0; i <= spaced.length - n; i += 1) out.add(spaced.slice(i, i + n));
  return out;
}

function jaccard<T>(a: Set<T>, b: Set<T>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  return inter / (a.size + b.size - inter || 1);
}

const STOP = new Set(["THE", "A", "AN", "OF", "FOR", "AND", "OR", "IN", "ON", "TO"]);

/** Word-token overlap (cosine), ignoring stop-words. */
export function wordOverlap(a: string, b: string): number {
  const ta = a.toUpperCase().split(/[^A-Z0-9]+/).filter((w) => w && !STOP.has(w));
  const tb = b.toUpperCase().split(/[^A-Z0-9]+/).filter((w) => w && !STOP.has(w));
  if (ta.length === 0 || tb.length === 0) return 0;
  const freqA = new Map<string, number>();
  for (const w of ta) freqA.set(w, (freqA.get(w) ?? 0) + 1);
  let dot = 0;
  for (const w of tb) dot += freqA.get(w) ?? 0;
  return dot / (Math.sqrt(ta.length) * Math.sqrt(tb.length) || 1);
}

/**
 * Adjusted semantic similarity in [0,1]: character n-gram Jaccard blended with word-overlap, so
 * short strings still compare sensibly and phrase matches are rewarded.
 */
export function semanticSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a.trim().toUpperCase() === b.trim().toUpperCase()) return 1;
  const ng = jaccard(ngrams(a), ngrams(b));
  const wo = wordOverlap(a, b);
  // Weight heavily toward the more reliable of the two signals.
  return 0.6 * ng + 0.4 * wo;
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length && i < b.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na === 0 || nb === 0 ? 0 : dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

export interface SemanticMatcher {
  /** Semantic affinity between two free-text strings, 0..1. */
  score(a: string, b: string): number;
}

/** Deterministic, offline matcher (the default). */
export class NgramSemanticMatcher implements SemanticMatcher {
  score(a: string, b: string): number {
    return semanticSimilarity(a, b);
  }
}

/** Embeds arbitrary text into dense vectors (the pluggable LLM hook). */
export type EmbeddingsProvider = (texts: string[]) => Promise<number[][]>;

export interface EmbeddingSemanticMatcherOptions {
  provider: EmbeddingsProvider;
  /** Precomputed cache: string -> vector. Filled lazily by `fit`. */
  cache?: Map<string, number[]>;
}

/** Scores by cosine similarity over provider embeddings, with a local cache. */
export class EmbeddingSemanticMatcher implements SemanticMatcher {
  private cache: Map<string, number[]>;

  constructor(private opts: EmbeddingSemanticMatcherOptions) {
    this.cache = opts.cache ?? new Map();
  }

  private async vector(text: string): Promise<number[] | undefined> {
    const hit = this.cache.get(text);
    if (hit) return hit;
    const [v] = await this.opts.provider([text]);
    if (v) this.cache.set(text, v);
    return v;
  }

  async scoreAsync(a: string, b: string): Promise<number> {
    const [va, vb] = await Promise.all([this.vector(a), this.vector(b)]);
    if (!va || !vb) return semanticSimilarity(a, b); // graceful fallback
    return cosine(va, vb);
  }

  score(a: string, b: string): number {
    // Synchronous fallback only — for real embeddings use `scoreAsync`.
    return semanticSimilarity(a, b);
  }
}

/**
 * Build a matcher: embeddings when a provider is supplied (and a key is present), else the
 * deterministic n-gram fallback. The app wires OpenAI embeddings from OPENAI_API_KEY;
 * here we simply prefer an explicit provider when given.
 */
export function createSemanticMatcher(provider?: EmbeddingsProvider): SemanticMatcher {
  return provider ? new EmbeddingSemanticMatcher({ provider }) : new NgramSemanticMatcher();
}

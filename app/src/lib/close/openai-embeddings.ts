/**
 * OpenAI embeddings for the residual semantic matcher.
 *
 * One key only: OPENAI_API_KEY (or CHATGPT_API_KEY). There is no separate
 * Anthropic or EMBEDDINGS_API_KEY — those names are accepted as aliases so old
 * env files keep working, but they are never required.
 */

export function openaiKey(explicit?: string): string {
  return explicit ?? process.env.OPENAI_API_KEY ?? process.env.CHATGPT_API_KEY ?? process.env.EMBEDDINGS_API_KEY ?? "";
}

export const OPENAI_EMBEDDING_MODEL = "text-embedding-3-small";

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na === 0 || nb === 0 ? 0 : dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

export async function embedTexts(texts: string[], apiKey?: string): Promise<number[][] | null> {
  const key = openaiKey(apiKey);
  const input = texts.map((t) => t.trim()).filter(Boolean);
  if (!key || input.length === 0) return null;
  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ model: OPENAI_EMBEDDING_MODEL, input }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { data?: Array<{ index: number; embedding: number[] }> };
    const rows = Array.isArray(data.data) ? [...data.data].sort((a, b) => a.index - b.index) : [];
    const vectors = rows.map((row) => row.embedding).filter((v) => Array.isArray(v) && v.length > 0);
    return vectors.length === input.length ? vectors : null;
  } catch {
    return null;
  }
}

/** Cosine similarity of two free-text strings via OpenAI embeddings, or null if unavailable. */
export async function embeddingSimilarity(a: string, b: string, apiKey?: string): Promise<number | null> {
  if (!a.trim() || !b.trim()) return null;
  const vectors = await embedTexts([a, b], apiKey);
  if (!vectors || vectors.length < 2) return null;
  return cosine(vectors[0], vectors[1]);
}

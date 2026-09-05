import { describe, expect, it } from "vitest";

import { cosine, embedTexts, openaiKey } from "./openai-embeddings";

describe("openai embeddings helpers", () => {
  it("cosine is 1 for identical vectors and 0 for orthogonal", () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("embedTexts is a no-op without a key (never hits the network)", async () => {
    const prev = process.env.OPENAI_API_KEY;
    const prevChat = process.env.CHATGPT_API_KEY;
    const prevEmb = process.env.EMBEDDINGS_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.CHATGPT_API_KEY;
    delete process.env.EMBEDDINGS_API_KEY;
    try {
      expect(openaiKey()).toBe("");
      await expect(embedTexts(["hello"])).resolves.toBeNull();
    } finally {
      if (prev !== undefined) process.env.OPENAI_API_KEY = prev;
      if (prevChat !== undefined) process.env.CHATGPT_API_KEY = prevChat;
      if (prevEmb !== undefined) process.env.EMBEDDINGS_API_KEY = prevEmb;
    }
  });
});

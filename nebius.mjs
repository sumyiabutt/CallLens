// Nebius Token Factory client (OpenAI-compatible chat completions).
// One place decides whether we talk to a real model or to the offline mock.

const BASE = (process.env.NEBIUS_BASE_URL || 'https://api.tokenfactory.nebius.com/v1').replace(/\/+$/, '');
const KEY = process.env.NEBIUS_API_KEY || '';
const TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 25000);

export const MODELS = {
  fast: process.env.NEBIUS_MODEL_FAST || 'nvidia/nemotron-3-nano',
  main: process.env.NEBIUS_MODEL_MAIN || 'nvidia/nemotron-3-super',
  deep: process.env.NEBIUS_MODEL_DEEP || 'nvidia/nemotron-3-ultra',
};

export const MOCK = process.env.MOCK_MODELS === '1' || !KEY;

export function modeLabel() {
  if (MOCK && process.env.MOCK_MODELS === '1') return 'mock-forced';
  if (MOCK) return 'mock-no-key';
  return 'live';
}

class ModelError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(body, { stream }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${KEY}`,
      },
      body: JSON.stringify({ ...body, stream }),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      throw new ModelError(`Model ${body.model} timed out after ${TIMEOUT_MS}ms`, 504);
    }
    throw new ModelError(`Could not reach Token Factory: ${err.message}`, 502);
  }
  if (!res.ok) {
    clearTimeout(timer);
    const detail = await res.text().catch(() => '');
    throw new ModelError(
      `Token Factory returned ${res.status} for ${body.model}: ${detail.slice(0, 300)}`,
      res.status,
    );
  }
  return { res, timer };
}

/** Single non-streamed completion. Returns the assistant text. */
export async function chat(model, messages, { temperature = 0.2, maxTokens = 400 } = {}) {
  const { res, timer } = await request(
    { model, messages, temperature, max_tokens: maxTokens },
    { stream: false },
  );
  try {
    const json = await res.json();
    return json?.choices?.[0]?.message?.content?.trim() || '';
  } finally {
    clearTimeout(timer);
  }
}

/** Streamed completion. Yields text deltas as they arrive. */
export async function* chatStream(model, messages, { temperature = 0.4, maxTokens = 300 } = {}) {
  const { res, timer } = await request(
    { model, messages, temperature, max_tokens: maxTokens },
    { stream: true },
  );
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let newline;
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          const delta = JSON.parse(payload)?.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch {
          // Keep-alive or vendor-specific frame; ignore it.
        }
      }
    }
  } finally {
    clearTimeout(timer);
    reader.releaseLock?.();
  }
}

/** Parse a JSON object out of a model reply, tolerating fences and preamble. */
export function parseJSON(raw, fallback) {
  if (!raw) return fallback;
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) return fallback;
  try {
    return { ...fallback, ...JSON.parse(cleaned.slice(start, end + 1)) };
  } catch {
    return fallback;
  }
}

export async function health() {
  return {
    mode: modeLabel(),
    models: MODELS,
    tavily: Boolean(process.env.TAVILY_API_KEY),
    base: BASE,
  };
}

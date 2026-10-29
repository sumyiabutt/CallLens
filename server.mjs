import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

import { MOCK, MODELS, chat, chatStream, health, parseJSON } from './lib/nebius.mjs';
import { mockClassify, mockReplyStream, mockSummary } from './lib/mock.mjs';
import { classifyMessages, replyMessages, summaryMessages } from './lib/prompts.mjs';
import { tavilyEnabled, webContext } from './lib/tavily.mjs';

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = fileURLToPath(new URL('./public/', import.meta.url));

const EMPTY_ANALYSIS = {
  intent: 'unclear',
  sentiment: 'calm',
  urgency: 2,
  order_id: null,
  company: null,
  next_action: 'Ask the caller to repeat',
  escalate: false,
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

async function readBody(req, limit = 1_000_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('Request body too large');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function sanitizeHistory(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((m) => m && typeof m.text === 'string' && m.text.trim())
    .slice(-24)
    .map((m) => ({
      role: m.role === 'caller' ? 'caller' : 'agent',
      text: m.text.trim().slice(0, 2000),
    }));
}

/* ------------------------------- live turn ------------------------------- */

async function handleTurn(req, res) {
  const body = await readBody(req);
  const caller = String(body.caller || '').trim().slice(0, 2000);
  if (!caller) return json(res, 400, { error: 'caller text is required' });

  const history = sanitizeHistory(body.history);
  const turnHistory = [...history, { role: 'caller', text: caller }];

  res.writeHead(200, {
    'Content-Type': 'application/x-ndjson; charset=utf-8',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const send = (event) => res.write(`${JSON.stringify(event)}\n`);

  try {
    // Tier 1 — Nano. Runs on every turn, so it must stay small and fast.
    const t0 = Date.now();
    const analysis = MOCK
      ? await mockClassify(caller, history)
      : parseJSON(
          await chat(MODELS.fast, classifyMessages(caller, history), {
            temperature: 0,
            maxTokens: 220,
          }),
          EMPTY_ANALYSIS,
        );
    send({ type: 'analysis', model: MODELS.fast, ms: Date.now() - t0, data: analysis });

    // Optional web context, started before the reply so it can land early.
    let context = [];
    if (tavilyEnabled && analysis.company) {
      const tc = Date.now();
      context = await webContext(`${analysis.company} company overview customer support`);
      if (context.length) send({ type: 'context', ms: Date.now() - tc, query: analysis.company, items: context });
    }

    // Tier 2 — Super. Streams the words the caller actually hears.
    const t1 = Date.now();
    send({ type: 'speaking', model: MODELS.main });
    if (MOCK) {
      for await (const delta of mockReplyStream(caller, analysis)) send({ type: 'delta', text: delta });
    } else {
      for await (const delta of chatStream(MODELS.main, replyMessages(turnHistory, analysis, context))) {
        send({ type: 'delta', text: delta });
      }
    }
    send({ type: 'done', model: MODELS.main, ms: Date.now() - t1, analysis });
  } catch (err) {
    send({ type: 'error', message: err.message || 'Model call failed' });
    send({ type: 'done', ms: 0, analysis: EMPTY_ANALYSIS });
  } finally {
    res.end();
  }
}

/* ------------------------------ post-call ------------------------------- */

async function handleSummary(req, res) {
  const body = await readBody(req);
  const history = sanitizeHistory(body.history);
  const analysisLog = Array.isArray(body.analysis) ? body.analysis.slice(-24) : [];
  if (!history.length) return json(res, 400, { error: 'history is required' });

  // Tier 3 — Ultra. One deliberate call after the line goes quiet.
  const t0 = Date.now();
  try {
    const summary = MOCK
      ? await mockSummary(history)
      : parseJSON(
          await chat(MODELS.deep, summaryMessages(history, analysisLog), {
            temperature: 0.2,
            maxTokens: 700,
          }),
          await mockSummary(history),
        );
    json(res, 200, { model: MODELS.deep, ms: Date.now() - t0, summary, mock: MOCK });
  } catch (err) {
    json(res, 502, { error: err.message || 'Summary failed' });
  }
}

/* -------------------------------- static -------------------------------- */

async function serveStatic(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
  const safePath = normalize(pathname).replace(/^(\.\.[/\\])+/, '');
  const filePath = join(PUBLIC_DIR, safePath);
  if (!filePath.startsWith(PUBLIC_DIR)) return json(res, 403, { error: 'forbidden' });
  try {
    const file = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(file);
  } catch {
    json(res, 404, { error: 'not found' });
  }
}

/* --------------------------------- server -------------------------------- */

const server = createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  try {
    if (req.method === 'POST' && pathname === '/api/turn') return await handleTurn(req, res);
    if (req.method === 'POST' && pathname === '/api/summary') return await handleSummary(req, res);
    if (req.method === 'GET' && pathname === '/health') return json(res, 200, await health());
    if (req.method === 'GET') return await serveStatic(req, res);
    json(res, 405, { error: 'method not allowed' });
  } catch (err) {
    if (!res.headersSent) json(res, 500, { error: err.message || 'server error' });
    else res.end();
  }
});

server.listen(PORT, () => {
  const mode = MOCK ? 'MOCK (no API key)' : 'LIVE Token Factory';
  console.log(`\n  CallLens  →  http://localhost:${PORT}`);
  console.log(`  mode      →  ${mode}`);
  console.log(`  nano      →  ${MODELS.fast}`);
  console.log(`  super     →  ${MODELS.main}`);
  console.log(`  ultra     →  ${MODELS.deep}`);
  console.log(`  tavily    →  ${tavilyEnabled ? 'on' : 'off'}\n`);
});

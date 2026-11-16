// Static demo shim. When the page is served without the Node backend
// (plain static host such as Vercel), /health and /api/* are answered in the
// browser by the same offline mock tier, so the console, the rail and the
// record all still work. When a real backend answers, it is always preferred,
// so the same index.html works for both deployments.
(function () {
  const nativeFetch = window.fetch.bind(window);
  const json = (obj) =>
    new Response(JSON.stringify(obj), { status: 200, headers: { 'Content-Type': 'application/json' } });

  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const isHealth = url.endsWith('/health');
    const isTurn = url.endsWith('/api/turn');
    const isSummary = url.endsWith('/api/summary');
    if (!isHealth && !isTurn && !isSummary) return nativeFetch(input, init);

    try {
      const real = await nativeFetch(input, init);
      if (real.ok) return real;
    } catch {}

    const { mockClassify, mockReplyStream, mockSummary } = await import('/mock.mjs');

    if (isHealth) {
      return json({
        mode: 'mock-static',
        models: {
          fast: 'nvidia/nemotron-3-nano',
          main: 'nvidia/nemotron-3-super',
          deep: 'nvidia/nemotron-3-ultra',
        },
        tavily: false,
        base: 'in-browser (static demo)',
      });
    }

    let body = {};
    try {
      body = JSON.parse((init && init.body) || '{}');
    } catch {}

    if (isTurn) {
      const history = Array.isArray(body.history) ? body.history : [];
      const caller = String(body.caller || '');
      const analysis = await mockClassify(caller, history);
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const send = (event) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
          send({ type: 'analysis', model: 'nvidia/nemotron-3-nano', ms: 120, data: analysis });
          send({ type: 'speaking', model: 'nvidia/nemotron-3-super' });
          for await (const delta of mockReplyStream(caller, analysis)) {
            send({ type: 'delta', text: delta });
          }
          send({ type: 'done', model: 'nvidia/nemotron-3-super', ms: 900, analysis });
          controller.close();
        },
      });
      return new Response(stream, {
        status: 200,
        headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' },
      });
    }

    const summary = await mockSummary(Array.isArray(body.history) ? body.history : []);
    return json({ model: 'nvidia/nemotron-3-ultra', ms: 420, summary, mock: true });
  };
})();

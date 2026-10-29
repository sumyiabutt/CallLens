// Optional live web context (Tavily). Fails soft: a lookup problem must never
// break a call that is already in progress.

const KEY = process.env.TAVILY_API_KEY || '';

export const tavilyEnabled = Boolean(KEY);

export async function webContext(query, { maxResults = 3 } = {}) {
  if (!KEY || !query) return [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: KEY,
        query,
        search_depth: 'basic',
        max_results: maxResults,
        include_answer: false,
      }),
      signal: controller.signal,
    });
    if (!res.ok) return [];
    const json = await res.json();
    return (json.results || []).map((r) => ({
      title: r.title || 'Result',
      url: r.url || '',
      snippet: String(r.content || '').replace(/\s+/g, ' ').slice(0, 240),
    }));
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

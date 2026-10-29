/* Web search, shared by both assistants. The browser calls /api/search on the AegisPlan server, which holds the
   Tavily key; the tool is added only when the server says search is configured. */
import type { Tool } from './types';

/* Asks the server whether web search is configured. Fails fast, like detectRemote. */
export async function detectSearch(endpoint = '/api/search'): Promise<boolean> {
  try {
    const res = await fetch(`${endpoint}/health`, { signal: AbortSignal.timeout(2500) });
    return res.ok && ((await res.json()) as { available?: boolean }).available === true;
  } catch {
    return false;
  }
}

export interface SearchResult {
  query: string;
  answer: string;
  results: { title: string; url: string; content: string; published_date?: string | null }[];
}

export function webSearchTool(endpoint = '/api/search'): Tool {
  return {
    name: 'web_search',
    description:
      'Search the web for facts this app does not hold: building codes and standards, equipment and prices, products, news, research. Returns a short answer and sources (title, url, snippet). Never use it for numbers about the design on screen; the other tools have those.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to look up, as a search query' },
        topic: { type: 'string', enum: ['general', 'news', 'finance'], description: 'news for recent events; default general' },
        time_range: { type: 'string', enum: ['day', 'week', 'month', 'year'], description: 'Only results this recent' },
        max_results: { type: 'integer', minimum: 1, maximum: 8, description: 'Default 5' }
      },
      required: ['query']
    },
    async run(args) {
      const query = String(args.query ?? '').trim();
      if (!query) throw new Error('Empty search query');
      const body: Record<string, unknown> = { query };
      if (args.topic) body.topic = args.topic;
      if (args.time_range) body.time_range = args.time_range;
      if (args.max_results) body.max_results = Math.min(8, Math.max(1, Math.round(Number(args.max_results)) || 5));
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(25000)
      });
      if (!res.ok) {
        const detail = ((await res.json().catch(() => null)) as { detail?: unknown } | null)?.detail;
        throw new Error(typeof detail === 'string' ? detail : `Web search answered ${res.status}`);
      }
      return (await res.json()) as SearchResult;
    },
    label: (args, result) => {
      const n = (result as SearchResult | undefined)?.results?.length;
      return `Searched the web for “${String(args.query ?? '').slice(0, 48)}”${n === undefined ? '' : ` (${n} sources)`}`;
    }
  };
}

/* One line for a system prompt, so the model knows when to search and how to cite. */
export const WEB_SEARCH_RULE =
  '- For facts outside this app (codes and standards, equipment, prices, products, news), call web_search, answer from what it returns, and cite 1–3 sources as markdown links [site](https://…). Numbers about the design on screen always come from the app tools, never the web.';

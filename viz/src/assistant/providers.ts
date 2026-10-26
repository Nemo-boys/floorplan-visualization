/* Providers. `remote` talks to /api/chat, an OpenAI-compatible proxy on the AegisPlan server that forwards to
   Nemotron (or any model the server is configured with) and streams the answer back. */
import type { ChatMessage, Provider, Reply, Tool, ToolCall } from './types';

export interface RemoteInfo {
  available: boolean;
  label: string;
  model: string;
}

/* Asks the server whether a model is configured. Fails fast: the app must never wait on it. */
export async function detectRemote(endpoint = '/api/chat'): Promise<RemoteInfo | null> {
  try {
    const res = await fetch(`${endpoint}/health`, { signal: AbortSignal.timeout(2500) });
    if (!res.ok) return null;
    const info = (await res.json()) as RemoteInfo;
    return info.available ? info : null;
  } catch {
    return null;
  }
}

/* Reasoning models may think out loud between <think> tags; people only see the answer. */
export const visibleText = (raw: string): string => raw.replace(/<think>[\s\S]*?(<\/think>|$)/g, '').replace(/^\s+/, '');

const toWire = (m: ChatMessage) =>
  m.tool_calls?.length
    ? {
        role: m.role,
        content: m.content || null,
        tool_calls: m.tool_calls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.arguments || '{}' } }))
      }
    : m.role === 'tool'
      ? { role: 'tool', tool_call_id: m.tool_call_id, content: m.content }
      : { role: m.role, content: m.content };

const toolWire = (t: Tool) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } });

interface Delta {
  content?: string | null;
  tool_calls?: { index?: number; id?: string; function?: { name?: string; arguments?: string } }[];
}

export function remoteProvider(info: RemoteInfo, endpoint = '/api/chat'): Provider {
  return {
    id: 'remote',
    label: info.label,
    detail: info.model,
    live: true,
    async chat(req, onText, signal): Promise<Reply> {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: req.messages.map(toWire), tools: req.tools.map(toolWire), stream: true }),
        signal
      });
      if (!res.ok || !res.body) throw new Error(`The model answered ${res.status}`);
      let raw = '';
      const calls: (ToolCall & { index: number })[] = [];
      const take = (delta: Delta | undefined) => {
        if (!delta) return;
        if (delta.content) {
          raw += delta.content;
          onText(visibleText(raw));
        }
        delta.tool_calls?.forEach((tc, k) => {
          const index = tc.index ?? k;
          let c = calls.find((x) => x.index === index);
          if (!c) calls.push((c = { index, id: tc.id ?? `call_${index}_${Date.now()}`, name: '', arguments: '' }));
          if (tc.id) c.id = tc.id;
          if (tc.function?.name) c.name += tc.function.name;
          if (tc.function?.arguments) c.arguments += tc.function.arguments;
        });
      };
      const type = res.headers.get('content-type') ?? '';
      if (!type.includes('event-stream')) {
        // a server that ignored stream: true
        const data = await res.json();
        const msg = data.choices?.[0]?.message;
        take({ content: msg?.content, tool_calls: msg?.tool_calls });
      } else {
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = '';
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let cut: number;
          while ((cut = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, cut).trim();
            buf = buf.slice(cut + 1);
            if (!line.startsWith('data:')) continue;
            const body = line.slice(5).trim();
            if (body === '[DONE]') continue;
            try {
              const chunk = JSON.parse(body);
              if (chunk.error) throw new Error(chunk.error.message ?? String(chunk.error));
              take(chunk.choices?.[0]?.delta);
            } catch (err) {
              if (err instanceof SyntaxError) continue; // a partial or keep-alive line
              throw err;
            }
          }
        }
      }
      return { text: visibleText(raw), toolCalls: calls.filter((c) => c.name).map(({ id, name, arguments: a }) => ({ id, name, arguments: a })) };
    }
  };
}

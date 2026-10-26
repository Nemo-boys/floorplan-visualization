/* A provider with no model: the app maps what people usually ask to the tool calls a model would make, and
   writes the answer from their results. Same shape as a real provider, so the panel, the tools and the
   activity rows behave the same either way. The clinic uses it; the data center keeps its own copy. */
import type { ChatMessage, Provider, ToolCall } from './types';

export interface IntentPlan {
  calls: { name: string; args?: Record<string, unknown> }[];
  say: (results: unknown[]) => string;
}

export function intentProvider(plan: (text: string) => IntentPlan, detail: string): Provider {
  let pending: IntentPlan | null = null;
  return {
    id: 'builtin',
    label: 'Built-in',
    detail,
    live: false,
    async chat({ messages }) {
      const last = messages[messages.length - 1];
      if (last.role === 'tool' && pending) {
        let i = messages.length - 1;
        while (i > 0 && messages[i].role === 'tool') i--;
        const results = messages.slice(i + 1).map((m: ChatMessage) => {
          try {
            return JSON.parse(m.content) as unknown;
          } catch {
            return {};
          }
        });
        const p = pending;
        pending = null;
        const err = results.find(x => x && typeof x === 'object' && 'error' in x) as { error?: string } | undefined;
        return { text: err?.error ? `I couldn’t do that: ${err.error}` : p.say(results), toolCalls: [] };
      }
      const user = [...messages].reverse().find(m => m.role === 'user');
      const p = plan(user?.content ?? '');
      if (!p.calls.length) return { text: p.say([]), toolCalls: [] };
      pending = p;
      const stamp = Date.now();
      const calls: ToolCall[] = p.calls.map((c, k) => ({ id: `local_${stamp}_${k}`, name: c.name, arguments: JSON.stringify(c.args ?? {}) }));
      return { text: '', toolCalls: calls };
    }
  };
}

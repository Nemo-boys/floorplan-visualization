import { describe, expect, it } from 'vitest';
import { parseArgs, runTurn } from '../../src/assistant/agent';
import { renderMarkdown } from '../../src/assistant/markdown';
import { visibleText } from '../../src/assistant/providers';
import type { ChatMessage, Provider, Tool } from '../../src/assistant/types';

describe('assistant agent loop', () => {
  it('runs the tools a provider calls, feeds the results back and returns the answer', async () => {
    const seen: ChatMessage[][] = [];
    const provider: Provider = {
      id: 'fake',
      label: 'Fake',
      detail: '',
      live: true,
      async chat({ messages }) {
        seen.push(messages);
        const last = messages[messages.length - 1];
        if (last.role === 'user') return { text: '', toolCalls: [{ id: 'c1', name: 'add', arguments: '{"a":2,"b":3}' }] };
        return { text: `It is ${JSON.parse(last.content).sum}.`, toolCalls: [] };
      }
    };
    const tools: Tool[] = [
      { name: 'add', description: '', parameters: { type: 'object', properties: {} }, run: (a) => ({ sum: Number(a.a) + Number(a.b) }), label: () => 'Added' }
    ];
    const events: string[] = [];
    const added = await runTurn({
      provider,
      tools,
      system: 'sys',
      history: [{ role: 'user', content: '2+3?' }],
      onText: () => {},
      onTool: (e) => events.push(`${e.status}:${e.label}`),
      signal: new AbortController().signal
    });
    expect(added.map((m) => m.role)).toEqual(['assistant', 'tool', 'assistant']);
    expect(added[2].content).toBe('It is 5.');
    expect(events).toEqual(['running:Added', 'done:Added']);
    expect(seen[0][0]).toEqual({ role: 'system', content: 'sys' });
  });

  it('reports a failing or unknown tool to the model instead of throwing', async () => {
    let result = '';
    const provider: Provider = {
      id: 'fake',
      label: 'Fake',
      detail: '',
      live: true,
      async chat({ messages }) {
        const last = messages[messages.length - 1];
        if (last.role === 'user') return { text: '', toolCalls: [{ id: 'c1', name: 'nope', arguments: 'not json' }] };
        result = last.content;
        return { text: 'ok', toolCalls: [] };
      }
    };
    await runTurn({ provider, tools: [], system: '', history: [{ role: 'user', content: 'x' }], onText: () => {}, onTool: () => {}, signal: new AbortController().signal });
    expect(JSON.parse(result).error).toMatch(/nope/);
    expect(parseArgs('not json')).toEqual({});
  });
});

describe('assistant text', () => {
  it('hides a reasoning model’s thinking, even mid-stream', () => {
    expect(visibleText('<think>hmm</think>\nHello')).toBe('Hello');
    expect(visibleText('<think>still thinking')).toBe('');
  });

  it('renders a safe Markdown subset with clickable part links', () => {
    const html = renderMarkdown('**Bold** <b>x</b>\n- one\n- [Cooler 1](#cdu_h1_1)');
    expect(html).toContain('<strong>Bold</strong> &lt;b&gt;x&lt;/b&gt;');
    expect(html).toContain('<ul><li>one</li><li><button type="button" class="ref" data-ref="cdu_h1_1">Cooler 1</button></li></ul>');
    expect(renderMarkdown('[x](javascript:alert(1))')).not.toContain('href="javascript');
  });
});

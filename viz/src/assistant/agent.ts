/* One turn of the conversation: ask the provider, run any tools it calls (in the browser, against live app
   state), hand back the results, and repeat until it answers in words. */
import type { ChatMessage, Provider, Tool, ToolCall, ToolEvent } from './types';

const MAX_ROUNDS = 6;
const MAX_RESULT = 6000; // characters of JSON per tool result sent back to the model

export function parseArgs(text: string): Record<string, unknown> {
  if (!text.trim()) return {};
  try {
    const v = JSON.parse(text);
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export async function runTool(tools: Tool[], call: ToolCall, onTool: (e: ToolEvent) => void): Promise<ChatMessage> {
  const tool = tools.find((t) => t.name === call.name);
  const args = parseArgs(call.arguments);
  const ev: ToolEvent = { id: call.id, name: call.name, args, status: 'running', label: tool?.label?.(args, undefined) ?? call.name };
  onTool(ev);
  let result: unknown;
  try {
    if (!tool) throw new Error(`No tool called ${call.name}`);
    result = await tool.run(args);
    onTool({ ...ev, status: 'done', label: tool.label?.(args, result) ?? call.name });
  } catch (err) {
    result = { error: err instanceof Error ? err.message : String(err) };
    onTool({ ...ev, status: 'error', label: `${ev.label} (failed)` });
  }
  let content = JSON.stringify(result ?? null);
  if (content.length > MAX_RESULT) content = content.slice(0, MAX_RESULT) + '…(truncated)';
  return { role: 'tool', tool_call_id: call.id, content };
}

/* Returns the messages this turn added (assistant text, tool calls and tool results). */
export async function runTurn(opts: {
  provider: Provider;
  tools: Tool[];
  system: string;
  history: ChatMessage[];
  onText: (visible: string) => void;
  onTool: (e: ToolEvent) => void;
  signal: AbortSignal;
}): Promise<ChatMessage[]> {
  const added: ChatMessage[] = [];
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const messages: ChatMessage[] = [{ role: 'system', content: opts.system }, ...opts.history, ...added];
    const reply = await opts.provider.chat({ messages, tools: opts.tools }, opts.onText, opts.signal);
    if (!reply.toolCalls.length) {
      added.push({ role: 'assistant', content: reply.text });
      return added;
    }
    added.push({ role: 'assistant', content: reply.text, tool_calls: reply.toolCalls });
    for (const call of reply.toolCalls) {
      if (opts.signal.aborted) return added;
      added.push(await runTool(opts.tools, call, opts.onTool));
    }
    opts.onText(''); // the next round starts a fresh answer
  }
  added.push({ role: 'assistant', content: 'That took too many steps. Could you ask it a simpler way?' });
  return added;
}

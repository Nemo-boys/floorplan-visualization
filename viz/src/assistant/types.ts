/* The assistant's building blocks, independent of any app. An app (the data center studio, later the clinic)
   supplies tools, a system prompt and suggestions; the provider (a model behind /api/chat, or the built-in
   offline one) can be swapped without touching either. Messages follow the OpenAI chat format, which
   Nemotron, vLLM, llama.cpp and NIM all speak. */

export type JsonSchema = {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
};

export interface Tool {
  name: string;
  description: string;
  parameters: JsonSchema;
  run(args: Record<string, unknown>): unknown;
  /* A short past-tense line for the activity row, e.g. "Broke Liquid cooler 1.1". */
  label?(args: Record<string, unknown>, result: unknown): string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: string; // JSON text, as the model wrote it
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface Reply {
  text: string;
  toolCalls: ToolCall[];
}

export interface Provider {
  id: string;
  label: string; // shown in the panel header, e.g. "Nemotron"
  detail: string; // tooltip, e.g. the model id
  live: boolean; // a real model (true) or the built-in assistant (false)
  chat(req: { messages: ChatMessage[]; tools: Tool[] }, onText: (visible: string) => void, signal: AbortSignal): Promise<Reply>;
}

export interface ToolEvent {
  id: string;
  name: string;
  args: Record<string, unknown>;
  status: 'running' | 'done' | 'error';
  label: string;
}

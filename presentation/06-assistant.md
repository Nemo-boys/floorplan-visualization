# The assistant: tool-calling, shared by both apps

## What it is

A chat panel docked on the right of both apps (⌘J). It **never guesses a number**: it calls tools that read the app's live state and quotes what they return, and it **acts through the same functions as the buttons**. Plain words, short answers, clickable links to rooms and parts (`[Exam 2](#exam_room_2)` flies the 3D there).

## Architecture (`viz/src/assistant/`, app-agnostic)

```
 panel.ts      chat UI: docked sheet, streaming text, tool-activity rows, suggestion chips,
               a "peek" preview when closed, unread badge, new chat, provider switcher
 agent.ts      runTurn: provider.chat → tool_calls → runTool (async tools allowed) → loop, max steps
 providers.ts  remoteProvider: OpenAI-format streaming over SSE with tool_calls aggregation;
               detectRemote via /api/chat/health; fallback chain to the built-in provider
 intent.ts     intentProvider: no model; maps common requests to the same tool calls a model makes
 markdown.ts   a safe Markdown subset; [label](#id) becomes a fly-to button
 types.ts      Tool {name, description, JSON-schema parameters, run, label}, Provider, ChatMessage
```

- Each app supplies only **tools, a system prompt with live context (JSON), suggestions and its first words**. The clinic reused the data center's panel unchanged; the clinic's look restyles it with its own colour tokens.
- **Messages follow the OpenAI chat format**, which Nemotron, vLLM, llama.cpp, NIM and OpenRouter all speak.

## Providers

- **Nemotron through the server** (`aegis/aegisplan/chat.py`, `/api/chat`): forwards to the NVIDIA API catalog (`NVIDIA_API_KEY`, default `nvidia/nvidia-nemotron-nano-9b-v2`), any OpenAI-compatible URL (`AEGIS_CHAT_URL`: your vLLM, NIM or llama.cpp server), or OpenRouter. Adds `/no_think` for Nemotron so it answers fast. Streams back with Server-Sent Events. **The key never reaches the browser.**
- **Built-in** (no model, instant): pattern-matches the common questions and actions to tool calls and writes the answer from the results. The app is fully usable offline.
- The header pill shows which one is answering; it falls back automatically if the model fails.

## It speaks first

- **Data center:** after designs appear, it recommends one and says why ("here are three ways to build your 20 MW site; I recommend …", with its build cost, PUE and how many checks pass); on Test it explains what to try; on Cost it summarises build vs. running cost; when something the person broke takes rows down, it explains why.
- **Clinic:** when a plan opens, it summarises it (rooms, exam rooms, area, patient path length); on Simulate it explains the quick setup; after every run it reports the verdict, waits and bottleneck.

## Tools

**Data center (~20):** overview, list options, select option, costs, status, checks, find parts by everyday names ("cooler 2", "UPS B1"), break parts, fix everything, run a what-if, set load, set outdoor temperature, test every part, show a lens, focus a part, change a cost assumption, compare options, new design from a brief, explain a term, **prove layout (CP-SAT)**, **export design (USD / JSON)**.

**Clinic (12):** `get_overview`, `list_rooms` (with synonyms: lobby, front desk, bathroom…), `show_room` (flies the 3D there and opens its card), `get_checks`, `get_day`, `load_day` (presets), `set_day` (providers, nurses, receptionists, patients), `run_simulation` (async: runs 20 days and returns the results), `get_results`, `compare_layouts`, `go_to_step`, `set_camera` (overview, tour, follow, walk).

## Example exchanges (from the built-in mode, real outputs)

- *"What if we had 3 nurses?"* → `set_day {nurses: 3}` → `run_simulation` → "Busy, but it copes. Average wait 5.7 min (3.1 to 9.8); 1 in 10 waits over 15 min; busiest: providers at 74%."
- *"What if we only had 1 provider?"* → "Struggles. Average wait 162 min; providers at 100%; 27 patients seen."
- *"Compare the layouts"* → runs the same day on every layout and opens the table; names the shortest wait.
- *"Show me the lobby"* → flies to the waiting room: "27.7 m². Where patients sit after checking in, until a nurse calls them."
- Data center: *"What if the grid goes down?"*, *"Break cooler 2"*, *"Electricity at 15 cents"*, *"Can it survive any one failure?"*

## Why it matters

The assistant is a **controller for a verified engine**, not an oracle: every number it says came from the same deterministic code the screen shows, and every action is undoable through the normal UI.

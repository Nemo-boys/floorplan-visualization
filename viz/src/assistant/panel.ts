/* The chat panel: a docked side sheet on desktop, a full-height sheet on phones. App-agnostic: it styles
   itself with the host app's colour tokens (--surface, --ink, --accent, ...), so the clinic can reuse it
   with its own theme. */
import { runTurn } from './agent';
import { renderMarkdown } from './markdown';
import type { ChatMessage, Provider, Tool, ToolEvent } from './types';
import './assistant.css';

export interface PanelOptions {
  title: string;
  emptyTitle: string;
  emptyText: string;
  placeholder: string;
  tools: Tool[];
  system: () => string; // rebuilt every turn, so it always carries the live context
  suggestions: () => string[];
  onRef?: (id: string) => void; // a [label](#id) link in an answer was clicked
  onReset?: () => void; // "new chat"
}

export interface ChatPanel {
  el: HTMLElement;
  peek: HTMLElement;
  open(focus?: boolean): void;
  close(): void;
  toggle(): void;
  isOpen(): boolean;
  /* The assistant speaks first: shown in the chat, and as a small preview when the panel is closed. */
  say(text: string, chips?: string[], opts?: { peek?: boolean }): void;
  ask(text: string): void;
  setProviders(list: Provider[]): void;
  onChange(fn: (s: { open: boolean; unread: number; busy: boolean }) => void): void;
}

const ICON = {
  send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>',
  stop: '<svg viewBox="0 0 24 24"><rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  fresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.8 4.9L19 9.7l-5.2 1.8L12 16.5l-1.8-5L5 9.7l5.2-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>',
  tool: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

const MAX_HISTORY = 30;

export function createChatPanel(o: PanelOptions): ChatPanel {
  let providers: Provider[] = [];
  let provider: Provider | null = null;
  let history: ChatMessage[] = [];
  let open = false;
  let unread = 0;
  let busy: AbortController | null = null;
  const listeners: ((s: { open: boolean; unread: number; busy: boolean }) => void)[] = [];
  const notify = () => listeners.forEach((fn) => fn({ open, unread, busy: !!busy }));

  // ---------- structure ----------
  const root = el('aside', 'chat');
  root.setAttribute('aria-label', o.title);
  root.setAttribute('aria-hidden', 'true');
  const head = el('header', 'chat-head');
  const title = el('div', 'chat-title');
  const name = el('b');
  name.textContent = o.title;
  const pill = el('button', 'model-pill');
  pill.type = 'button';
  title.append(name, pill);
  const fresh = el('button', 'chat-icon', ICON.fresh);
  fresh.type = 'button';
  fresh.title = 'New chat';
  fresh.setAttribute('aria-label', 'New chat');
  const closeBtn = el('button', 'chat-icon', ICON.close);
  closeBtn.type = 'button';
  closeBtn.setAttribute('aria-label', 'Close the assistant');
  const acts = el('div', 'chat-head-acts');
  acts.append(fresh, closeBtn);
  head.append(title, acts);

  const log = el('div', 'chat-log');
  log.setAttribute('role', 'log');
  log.setAttribute('aria-live', 'polite');
  const chips = el('div', 'chat-chips');
  const form = el('form', 'chat-compose');
  const input = el('textarea');
  input.rows = 1;
  input.placeholder = o.placeholder;
  input.setAttribute('aria-label', 'Message');
  const send = el('button', 'chat-send', ICON.send);
  send.type = 'submit';
  send.setAttribute('aria-label', 'Send');
  form.append(input, send);
  root.append(head, log, chips, form);

  const peek = el('div', 'chat-peek');
  peek.setAttribute('role', 'status');
  let peekTimer = 0;

  // ---------- rendering ----------
  let stick = true; // follow new messages unless the person scrolled up to read
  log.addEventListener('scroll', () => (stick = log.scrollHeight - log.scrollTop - log.clientHeight < 40));
  const scroll = () => {
    if (stick) log.scrollTop = log.scrollHeight;
  };

  function empty() {
    if (log.children.length) return;
    const e = el('div', 'chat-empty');
    const ic = el('span', 'chat-empty-ic', ICON.spark);
    const t = el('b');
    t.textContent = o.emptyTitle;
    const p = el('p');
    p.textContent = o.emptyText;
    e.append(ic, t, p);
    log.append(e);
  }

  function setChips(list: string[]) {
    chips.replaceChildren(
      ...list.slice(0, 4).map((c) => {
        const b = el('button', 'chip-s');
        b.type = 'button';
        b.textContent = c;
        b.addEventListener('click', () => ask(c));
        return b;
      })
    );
  }

  function userBubble(text: string) {
    log.querySelector('.chat-empty')?.remove();
    const m = el('div', 'msg user');
    const b = el('div', 'bubble');
    b.textContent = text;
    m.append(b);
    log.append(m);
  }

  /* An assistant message with its activity rows (tools) above the text. */
  function botMessage() {
    log.querySelector('.chat-empty')?.remove();
    const m = el('div', 'msg bot');
    const activity = el('div', 'activity');
    const body = el('div', 'md');
    const dots = el('div', 'typing', '<i></i><i></i><i></i>');
    m.append(activity, body, dots);
    log.append(m);
    let frame = 0;
    let pending = '';
    const rows = new Map<string, HTMLElement>();
    return {
      m,
      text(t: string) {
        pending = t;
        if (frame) return;
        frame = requestAnimationFrame(() => {
          frame = 0;
          body.innerHTML = renderMarkdown(pending);
          dots.style.display = pending ? 'none' : '';
          scroll();
        });
      },
      tool(e: ToolEvent) {
        let row = rows.get(e.id);
        if (!row) {
          row = el('div', 'act');
          rows.set(e.id, row);
          activity.append(row);
        }
        row.className = `act ${e.status}`;
        row.innerHTML = `<span class="act-ic">${e.status === 'running' ? '' : ICON.tool}</span>`;
        const label = el('span');
        label.textContent = e.label;
        row.append(label);
        scroll();
      },
      done() {
        if (frame) cancelAnimationFrame(frame);
        body.innerHTML = renderMarkdown(pending);
        dots.remove();
        if (!activity.children.length) activity.remove();
        scroll();
      }
    };
  }

  log.addEventListener('click', (ev) => {
    const ref = (ev.target as HTMLElement).closest<HTMLElement>('[data-ref]');
    if (ref?.dataset.ref) o.onRef?.(ref.dataset.ref);
  });

  function paintPill() {
    pill.innerHTML = '';
    const dot = el('i', provider?.live ? 'live' : '');
    const label = el('span');
    label.textContent = provider ? provider.label : 'Starting…';
    pill.append(dot, label);
    pill.title = provider ? `${provider.detail}${providers.length > 1 ? ' · click to switch' : ''}` : '';
    pill.disabled = providers.length < 2;
  }
  pill.addEventListener('click', () => {
    if (providers.length < 2 || !provider) return;
    provider = providers[(providers.indexOf(provider) + 1) % providers.length];
    paintPill();
  });

  // ---------- conversation ----------
  function trimmed(): ChatMessage[] {
    if (history.length <= MAX_HISTORY) return history;
    // cut at a user message so tool calls and their results stay together
    let start = history.length - MAX_HISTORY;
    while (start < history.length && history[start].role !== 'user') start++;
    return history.slice(start);
  }

  async function ask(text: string) {
    text = text.trim();
    if (!text || busy || !provider) return;
    if (!open) openPanel(false);
    userBubble(text);
    setChips([]);
    history.push({ role: 'user', content: text });
    stick = true;
    scroll();
    const ctrl = new AbortController();
    busy = ctrl;
    paintSend();
    notify();
    let msg = botMessage();
    const chain = [provider, ...providers.filter((p) => p !== provider)];
    for (let i = 0; i < chain.length; i++) {
      try {
        const added = await runTurn({
          provider: chain[i],
          tools: o.tools,
          system: o.system(),
          history: trimmed(),
          onText: (t) => msg.text(t),
          onTool: (e) => msg.tool(e),
          signal: ctrl.signal
        });
        history.push(...added);
        const last = added[added.length - 1];
        msg.text(last?.content ?? '');
        break;
      } catch (err) {
        if (ctrl.signal.aborted) {
          msg.text('_Stopped._');
          break;
        }
        const next = chain[i + 1];
        if (!next) {
          msg.text(`Sorry, something went wrong: ${err instanceof Error ? err.message : String(err)}`);
          break;
        }
        // the model is unreachable: answer with the next provider and say so, quietly
        msg.done();
        const note = el('div', 'chat-note');
        note.textContent = `${chain[i].label} didn’t answer, so ${next.label} replied instead.`;
        log.append(note);
        msg = botMessage();
      }
    }
    msg.done();
    busy = null;
    paintSend();
    setChips(o.suggestions());
    notify();
  }

  function paintSend() {
    send.innerHTML = busy ? ICON.stop : ICON.send;
    send.setAttribute('aria-label', busy ? 'Stop' : 'Send');
    send.classList.toggle('stop', !!busy);
    send.disabled = !busy && !input.value.trim();
  }

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (busy) {
      busy.abort();
      return;
    }
    const t = input.value;
    input.value = '';
    grow();
    ask(t);
  });
  const grow = () => {
    input.style.height = 'auto';
    input.style.height = `${Math.min(140, input.scrollHeight)}px`;
    paintSend();
  };
  input.addEventListener('input', grow);
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) {
      ev.preventDefault();
      form.requestSubmit();
    }
  });
  root.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') closePanel();
  });
  document.addEventListener('keydown', (ev) => {
    if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'j') {
      ev.preventDefault();
      if (open) closePanel();
      else openPanel(true);
    }
  });

  function say(text: string, list?: string[], opts: { peek?: boolean } = {}) {
    const m = botMessage();
    m.text(text);
    m.done();
    history.push({ role: 'assistant', content: text });
    setChips(list ?? o.suggestions());
    if (!open) {
      unread++;
      if (opts.peek !== false) showPeek(text);
    }
    notify();
  }

  function showPeek(text: string) {
    const plain = text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_`#]/g, '');
    peek.replaceChildren();
    const ic = el('span', 'chat-peek-ic', ICON.spark);
    const p = el('p');
    p.textContent = plain.length > 150 ? plain.slice(0, 148).trimEnd() + '…' : plain;
    const reply = el('button', 'chat-peek-reply');
    reply.type = 'button';
    reply.textContent = 'Reply';
    const x = el('button', 'chat-peek-x', ICON.close);
    x.type = 'button';
    x.setAttribute('aria-label', 'Dismiss');
    peek.append(ic, p, reply, x);
    peek.classList.add('on');
    reply.addEventListener('click', () => openPanel(true));
    p.addEventListener('click', () => openPanel(true));
    x.addEventListener('click', hidePeek);
    clearTimeout(peekTimer);
    peekTimer = window.setTimeout(hidePeek, 14000);
  }
  const hidePeek = () => peek.classList.remove('on');

  function openPanel(focus = true) {
    open = true;
    unread = 0;
    hidePeek();
    root.classList.add('open');
    root.setAttribute('aria-hidden', 'false');
    empty();
    if (!chips.children.length && !busy) setChips(o.suggestions());
    if (focus) setTimeout(() => input.focus({ preventScroll: true }), 220);
    requestAnimationFrame(() => (log.scrollTop = log.scrollHeight));
    notify();
  }
  function closePanel() {
    open = false;
    root.classList.remove('open');
    root.setAttribute('aria-hidden', 'true');
    notify();
  }

  fresh.addEventListener('click', () => {
    busy?.abort();
    history = [];
    log.replaceChildren();
    setChips([]);
    o.onReset?.();
    empty();
    if (!chips.children.length) setChips(o.suggestions());
  });
  closeBtn.addEventListener('click', closePanel);
  paintPill();
  paintSend();

  return {
    el: root,
    peek,
    open: openPanel,
    close: closePanel,
    toggle: () => (open ? closePanel() : openPanel(true)),
    isOpen: () => open,
    say,
    ask: (t) => void ask(t),
    setProviders(list) {
      providers = list;
      // a real model, once found, takes over from the built-in assistant
      if (!provider || !list.includes(provider) || (list[0]?.live && !provider.live)) provider = list[0] ?? null;
      paintPill();
    },
    onChange: (fn) => listeners.push(fn)
  };
}

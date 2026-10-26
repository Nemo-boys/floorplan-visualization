/* A deliberately small, safe Markdown subset for chat answers: paragraphs, bullet and numbered lists, **bold**,
   *italic*, `code`, and links. A link to "#<id>" becomes a button the app handles (the data center studio uses
   it to fly to a part). Everything is escaped first, so a model can never inject HTML. */

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function inline(s: string): string {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(#([\w:.-]+)\)/g, '<button type="button" class="ref" data-ref="$2">$1</button>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}

export function renderMarkdown(text: string): string {
  const out: string[] = [];
  let list: 'ul' | 'ol' | null = null;
  const close = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };
  for (const line of text.split('\n')) {
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const num = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || num) {
      const kind = bullet ? 'ul' : 'ol';
      if (list !== kind) {
        close();
        out.push(`<${kind}>`);
        list = kind;
      }
      out.push(`<li>${inline((bullet ?? num)![1])}</li>`);
    } else if (!line.trim()) close();
    else {
      close();
      const head = /^#{1,4}\s+(.*)$/.exec(line);
      out.push(head ? `<p><strong>${inline(head[1])}</strong></p>` : `<p>${inline(line)}</p>`);
    }
  }
  close();
  return out.join('');
}

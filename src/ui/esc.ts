/* HTML escaping. Pure, so the 2D plan and the export can use it outside the browser too. */
export const esc = (s: unknown): string =>
  String(s).replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string
  );

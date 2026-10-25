/* Saving files with the browser's own download (PLAN.md, planned difference 2). In the reference, downloads went
   through the artifact viewer instead. */
export function slug(s: string): string {
  return (
    String(s)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'clinic'
  );
}
export function downloadFile(filename: string, data: string | Uint8Array, type?: string): void {
  const blob = new Blob([data as BlobPart], { type: type || 'application/octet-stream' });
  const url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.hidden = true;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

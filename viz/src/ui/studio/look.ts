/* Which look the clinic wears. "studio" (the default) is the minimal design shared with Data Center Studio
   (deviations.md #10, asked for by the user). "reference" is the approved design exactly as it was, kept for
   side-by-side checks and for the parity tests: open the page with ?look=reference, or start Vite with
   VITE_FI_LOOK=reference (the e2e config does). */
const asked = new URLSearchParams(location.search).get('look') ?? (import.meta.env.VITE_FI_LOOK as string | undefined);
export const STUDIO = asked !== 'reference';
if (STUDIO) document.documentElement.classList.add('studio');

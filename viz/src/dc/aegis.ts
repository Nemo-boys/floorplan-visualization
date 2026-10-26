/* The AegisPlan server's part in the studio: Nemotron reads the brief, CP-SAT proves the room layout. The app
   never waits on it: every call has a short timeout, and with no server everything still works locally. */
import type { ModelReading } from './engine/brief';
import type { Design } from './engine/types';

export interface AegisInfo {
  cpsat: boolean;
  briefModel: string | null;
}

let info: Promise<AegisInfo | null> | null = null;
export function aegisInfo(): Promise<AegisInfo | null> {
  info ??= fetch('/api/dc/health', { signal: AbortSignal.timeout(2500) })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => (j ? { cpsat: !!j.cpsat, briefModel: j.brief_model ?? null } : null))
    .catch(() => null);
  return info;
}

export interface BriefResult {
  reading: ModelReading;
  model: string;
  ms: number;
}

export async function readBriefWithModel(brief: string): Promise<BriefResult | null> {
  const a = await aegisInfo();
  if (!a?.briefModel) return null;
  try {
    const res = await fetch('/api/dc/brief', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brief }),
      signal: AbortSignal.timeout(15000)
    });
    return res.ok ? ((await res.json()) as BriefResult) : null;
  } catch {
    return null;
  }
}

export interface ProgramCheck {
  valid: boolean;
  proven_by: string | null;
  checks: { title: string; pass: boolean; detail: string }[];
  rooms: number;
  doors: number;
  constraints: number;
  status: string;
  ours_length_mm: number;
  best_length_mm: number | null;
  saving_pct: number | null;
  ms: number;
}

const checks = new WeakMap<Design, Promise<ProgramCheck | null>>();
/* CP-SAT on the building program: rooms, doors and the building outline. Cached per design. */
export function checkProgram(d: Design): Promise<ProgramCheck | null> {
  let p = checks.get(d);
  if (!p) {
    p = aegisInfo().then(async (a) => {
      if (!a?.cpsat) return null;
      try {
        const res = await fetch('/api/dc/check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            building: d.building,
            rooms: d.rooms.map(({ id, type, name, x, y, w, h, outdoor }) => ({ id, type, name, x, y, w, h, outdoor })),
            doors: d.doors.map(({ id, rooms, width }) => ({ id, rooms, width }))
          }),
          signal: AbortSignal.timeout(15000)
        });
        return res.ok ? ((await res.json()) as ProgramCheck) : null;
      } catch {
        return null;
      }
    });
    checks.set(d, p);
  }
  return p;
}

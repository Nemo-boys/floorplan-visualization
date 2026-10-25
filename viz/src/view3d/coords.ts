/* Plan metres (x east, y north) to world coordinates (centred, z towards the viewer), and angles. */
import { state } from '../state';

const plan = (): NonNullable<typeof state.P> => state.P as NonNullable<typeof state.P>;
export const W2 = (): number => plan().m.W,
  D2 = (): number => plan().m.D;
export const wx = (x: number): number => x - W2() / 2;
export const wz = (y: number): number => -(y - D2() / 2);
export const yawOf = (dx: number, dy: number): number => Math.atan2(dx, -dy);
export function lerpAngle(a: number, b: number, t: number): number {
  const d = ((((b - a + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
  return a + d * t;
}

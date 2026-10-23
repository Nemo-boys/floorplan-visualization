/* The three.js renderer, scene and camera, once initThree has started them (null when 3D is off). */
import type { Object3D, PerspectiveCamera, Scene, WebGLRenderer } from 'three';

export interface R3State {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  aniso: number;
  gl2: boolean;
  cache: Record<string, unknown>;
  people: Map<number, { dx: number; dy: number }>;
  routeMeshes?: Record<'journey' | 'staff' | 'egress', Object3D>;
}
export let R3: R3State | null = null;
export function setR3(r: R3State | null): void {
  R3 = r;
}

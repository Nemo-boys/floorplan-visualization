/* The three.js renderer, scene and camera, once initThree has started them (null when 3D is off). */
import type * as THREE from 'three';
import type { DoorGap, FurnItem, PlanWindow, Wall } from '../engine';

export type Mat = THREE.MeshStandardMaterial | THREE.MeshBasicMaterial;
export interface Limb {
  pivot: THREE.Group;
  knee?: THREE.Group;
}
/* A person in the 3D view, following a simulator agent. dx, dy is the drawn position in plan metres. */
export interface Person {
  root: THREE.Group;
  body: THREE.Group;
  armL: Limb;
  armR: Limb;
  legL: Required<Limb>;
  legR: Required<Limb>;
  badge: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  dx: number;
  dy: number;
  px: number;
  py: number;
  yaw: number;
  phase: number;
  swing: number;
  sit: number;
}
export interface Heat {
  small: HTMLCanvasElement;
  big: HTMLCanvasElement;
  tex: THREE.CanvasTexture;
  mesh: THREE.Mesh;
}
export interface R3State {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  aniso: number;
  gl2: boolean;
  cache: Record<string, unknown>;
  people: Map<number, Person>;
  sun: THREE.DirectionalLight;
  fill: THREE.HemisphereLight;
  root: THREE.Group;
  tex: Record<string, THREE.CanvasTexture>;
  mat: Record<string, Mat>;
  groups: Record<string, THREE.Object3D>;
  walls: Wall[];
  gaps: DoorGap[];
  windows: PlanWindow[];
  routeMeshes?: Record<string, THREE.Object3D>;
  heat?: Heat;
  selRing?: THREE.Mesh;
  hl?: THREE.Group | null;
  hlParts?: { edges: THREE.Mesh[]; tint: THREE.Mesh };
  marks?: Map<string, THREE.Group> | null;
  hoverMark?: THREE.Group | null;
  hoverKey?: string | null;
  ghost?: THREE.Group | null;
  ghostItem?: FurnItem;
}
export let R3: R3State | null = null;
export function setR3(r: R3State | null): void {
  R3 = r;
}
/* For code that only runs once 3D is on (the reference reads R3 directly there). */
export function r3(): R3State {
  return R3 as R3State;
}

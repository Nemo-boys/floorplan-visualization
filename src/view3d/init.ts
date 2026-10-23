/* ---------- Renderer, light and environment ---------- */
import * as THREE from 'three';
import { clamp } from '../engine';
import { $, isTouch } from '../ui/dom';
import { showNotice } from '../ui/toast';
import { makeMaterials } from './materials';
import { bindPointer } from './pointer';
import { R3, setR3, type R3State } from './r3';
import { chooseRenderer, type RendererChoice } from './renderer';

export async function initThree(): Promise<boolean> {
  let choice: RendererChoice;
  try {
    choice = await chooseRenderer();
  } catch {
    showNotice(
      'This browser couldn’t start WebGL, so the 3D view is off. The plan, simulation and results still work.'
    );
    return false;
  }
  const renderer = choice.renderer;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  renderer.shadowMap.enabled = true;
  // The reference asks for PCFSoftShadowMap. three r186 removed it: WebGL already uses PCFShadowMap in its place,
  // and WebGPU has no filter for it, so ask for PCFShadowMap directly (same result on WebGL, valid on WebGPU).
  renderer.shadowMap.type = THREE.PCFShadowMap;
  $('#view').appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 500);
  // The rest of R3 (sun, root, textures, materials, groups) is filled in below and by buildScene, as in the reference.
  setR3({
    renderer,
    kind: choice.kind,
    scene,
    camera,
    aniso: Math.min(8, choice.aniso),
    cache: {},
    people: new Map()
  } as unknown as R3State);
  const r = R3 as R3State;
  scene.environment = buildEnvironment(choice);
  const sun = new THREE.DirectionalLight(0xfff3e4, 2.7);
  sun.castShadow = true;
  const big = choice.maxTextureSize >= 8192 && !isTouch;
  sun.shadow.mapSize.set(big ? 4096 : 2048, big ? 4096 : 2048);
  sun.shadow.bias = -0.00035;
  sun.shadow.normalBias = 0.022;
  scene.add(sun);
  scene.add(sun.target);
  const fill = new THREE.HemisphereLight(0xe3ebf3, 0x8b8578, 0.32);
  scene.add(fill);
  r.sun = sun;
  r.fill = fill;
  r.root = new THREE.Group();
  r.groups = {};
  scene.add(r.root);
  makeMaterials();
  bindPointer(renderer.domElement);
  return true;
}
export function buildEnvironment(choice: RendererChoice): THREE.Texture {
  const env = new THREE.Scene();
  const geo = new THREE.SphereGeometry(60, 32, 16),
    pos = geo.attributes.position,
    cols: number[] = [];
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getY(i) / 60 + 1) / 2;
    cols.push(0.32 + 0.52 * t, 0.34 + 0.52 * t, 0.37 + 0.55 * t);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  env.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const panel = (w: number, h: number, x: number, y: number, z: number, k: number): void => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k, k * 0.98), side: THREE.DoubleSide })
    );
    m.position.set(x, y, z);
    m.lookAt(0, 0, 0);
    env.add(m);
  };
  panel(34, 20, 0, 48, 0, 2.4);
  panel(22, 11, -40, 20, 22, 1.5);
  panel(18, 9, 34, 16, -28, 1.1);
  return choice.pmrem(env, 0.035);
}
export function setSun(min: number): void {
  if (!R3) return;
  const h = clamp(8 + min / 60, 9, 17),
    az = ((h - 12) / 6) * (Math.PI / 2) * 0.9,
    el = Math.max(0.42, Math.sin((Math.PI * (h - 6)) / 12) * 1.02);
  const r = 40,
    ce = Math.cos(el);
  R3.sun.position.set(-Math.sin(az) * ce * r, Math.sin(el) * r, Math.cos(az) * ce * r + 6);
  R3.sun.target.position.set(0, 0, 0);
  const warm = clamp(1 - (el - 0.42) / 0.6, 0, 1);
  R3.sun.color.setRGB(1, 0.95 - warm * 0.1, 0.89 - warm * 0.2);
  R3.sun.intensity = 2.4 + (1 - warm) * 0.5;
}

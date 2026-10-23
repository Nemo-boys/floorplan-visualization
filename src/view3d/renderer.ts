/* Picks the renderer (PLAN.md, planned difference 3): WebGPU when the browser has an adapter for it, WebGL2 otherwise.
   The scene, materials and settings are the same either way. three/webgpu is loaded only when it's used. */
import * as THREE from 'three';
import type { WebGPURenderer } from 'three/webgpu';

export type RendererKind = 'webgpu' | 'webgl2';
export type AnyRenderer = THREE.WebGLRenderer | WebGPURenderer;
export interface RendererChoice {
  renderer: AnyRenderer;
  kind: RendererKind;
  aniso: number;
  maxTextureSize: number;
  /* Builds the image-based-lighting environment with the generator that matches the renderer. */
  pmrem: (scene: THREE.Scene, sigma: number) => THREE.Texture;
}
interface GpuNavigator {
  gpu?: { requestAdapter: () => Promise<unknown> };
}
const OPTIONS = { antialias: true, powerPreference: 'high-performance' as const };

export async function webgpuAvailable(): Promise<boolean> {
  try {
    const gpu = (navigator as unknown as GpuNavigator).gpu;
    return !!gpu && !!(await gpu.requestAdapter());
  } catch {
    return false;
  }
}
async function makeWebGPU(): Promise<RendererChoice | null> {
  try {
    const WG = await import('three/webgpu');
    const renderer = new WG.WebGPURenderer(OPTIONS);
    await renderer.init();
    const limits = (renderer.backend as unknown as { device?: { limits?: { maxTextureDimension2D?: number } } }).device
      ?.limits;
    return {
      renderer,
      kind: 'webgpu',
      aniso: renderer.getMaxAnisotropy(),
      maxTextureSize: (limits && limits.maxTextureDimension2D) || 8192,
      pmrem: (scene, sigma) => {
        const pm = new WG.PMREMGenerator(renderer),
          tex = pm.fromScene(scene, sigma).texture;
        pm.dispose();
        return tex;
      }
    };
  } catch {
    return null;
  }
}
function makeWebGL(): RendererChoice {
  const renderer = new THREE.WebGLRenderer(OPTIONS);
  return {
    renderer,
    kind: 'webgl2',
    aniso: renderer.capabilities.getMaxAnisotropy(),
    maxTextureSize: renderer.capabilities.maxTextureSize,
    pmrem: (scene, sigma) => {
      const pm = new THREE.PMREMGenerator(renderer),
        tex = pm.fromScene(scene, sigma).texture;
      pm.dispose();
      return tex;
    }
  };
}
/* WebGPU first; WebGL2 when there's no adapter or WebGPU fails to start. Throws when neither starts. */
export async function chooseRenderer(): Promise<RendererChoice> {
  if (await webgpuAvailable()) {
    const r = await makeWebGPU();
    if (r) return r;
  }
  return makeWebGL();
}

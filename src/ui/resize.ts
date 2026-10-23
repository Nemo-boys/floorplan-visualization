/* Keeps the 3D canvas the size of its pane. */
import { R3 } from '../view3d/r3';
import { $ } from './dom';

export function resize(): void {
  if (!R3) return;
  const st = $('#view3dBody'),
    w = st.clientWidth,
    h = st.clientHeight;
  if (!w || !h) return;
  R3.renderer.setSize(w, h);
  R3.camera.aspect = w / h;
  R3.camera.updateProjectionMatrix();
}

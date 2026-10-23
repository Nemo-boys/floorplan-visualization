/* Theme colors read from the CSS tokens, and applying them where CSS can't (the 3D scene and canvas drawings). */
import { state } from '../state';
import { R3 } from '../view3d/r3';
import { $ } from './dom';
import { drawTimeline, theme3D } from './pending';

export function css(n: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(n).trim();
}
export interface ThemeColors {
  zones: Record<'public' | 'clinical' | 'staff' | 'support' | 'circulation', string>;
  accent: string;
  staff: string;
  egress: string;
  warn: string;
  sky: string;
  horizon: string;
  ground: string;
  ink: string;
  ink2: string;
  panel: string;
  rule: string;
  roles: Record<'patient' | 'nurse' | 'provider' | 'reception', string>;
}
export function themeColors(): ThemeColors {
  const v = (n: string): string => css(n) || '#888888';
  return {
    zones: {
      public: v('--z-public'),
      clinical: v('--z-clinical'),
      staff: v('--z-staff'),
      support: v('--z-support'),
      circulation: v('--z-circulation')
    },
    accent: v('--accent'),
    staff: v('--staff'),
    egress: v('--egress'),
    warn: v('--warn'),
    sky: v('--sky'),
    horizon: v('--horizon'),
    ground: v('--ground'),
    ink: v('--ink'),
    ink2: v('--ink-2'),
    panel: v('--panel'),
    rule: v('--rule'),
    roles: {
      patient: v('--r-patient'),
      nurse: v('--r-nurse'),
      provider: v('--r-provider'),
      reception: v('--r-reception')
    }
  };
}
export function applyTheme(): void {
  const T = themeColors();
  if (R3 && state.P) theme3D(T);
  $('#swJ').style.background = T.accent;
  $('#swS').style.background = T.staff;
  $('#swE').style.background = T.egress;
  drawTimeline();
}

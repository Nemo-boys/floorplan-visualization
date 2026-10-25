# Design tokens

Generated from `reference-src/shell.html` and the reference scripts. Use these values as-is. The CSS in the reference is the source of truth; this page is a quick lookup.

## Color tokens (CSS custom properties on `:root`)

Dark values apply under `@media (prefers-color-scheme: dark)` with `:root:not([data-theme="light"])`, and again under `:root[data-theme="dark"]`. Keep both selectors.

| Token | Light | Dark |
|---|---|---|
| `--bg` | `#eef1ef` | `#11171c` |
| `--sky` | `#d9e2ea` | `#1c252e` |
| `--horizon` | `#eef1ef` | `#10161b` |
| `--ground` | `#dde2dc` | `#192026` |
| `--panel` | `#fbfcfb` | `#172027` |
| `--card` | `#ffffff` | `#1b252d` |
| `--field` | `#ffffff` | `#1b252d` |
| `--glass` | `rgba(251, 252, 251, 0.9)` | `rgba(23, 32, 39, 0.9)` |
| `--ink` | `#1f2b36` | `#e6edf1` |
| `--ink-2` | `#576673` | `#a5b3bc` |
| `--rule` | `rgba(31, 43, 54, 0.12)` | `rgba(255, 255, 255, 0.1)` |
| `--rule-2` | `rgba(31, 43, 54, 0.2)` | `rgba(255, 255, 255, 0.18)` |
| `--accent` | `#2453d6` | `#86a6ff` |
| `--accent-ink` | `#ffffff` | `#0c1633` |
| `--accent-soft` | `rgba(36, 83, 214, 0.1)` | `rgba(134, 166, 255, 0.15)` |
| `--staff` | `#11806a` | `#52c7aa` |
| `--egress` | `#c73a1f` | `#ff7f61` |
| `--warn` | `#d39417` | `#f0b445` |
| `--pass` | `#11806a` | `#52c7aa` |
| `--fail` | `#c73a1f` | `#ff7f61` |
| `--z-public` | `#c9dff1` | `#2c4b63` |
| `--z-clinical` | `#cfe8d7` | `#2d5240` |
| `--z-staff` | `#f0e3bd` | `#5b4e2b` |
| `--z-support` | `#e0d7ef` | `#463e5d` |
| `--z-circulation` | `#e8ebea` | `#2a3339` |
| `--r-patient` | `#2453d6` | `#86a6ff` |
| `--r-nurse` | `#11806a` | `#52c7aa` |
| `--r-provider` | `#8b3fb0` | `#d590f2` |
| `--r-reception` | `#5d6b78` | `#9eabb4` |
| `--focus` | `#2453d6` | `#86a6ff` |
| `--shadow` | `0 1px 2px rgba(20, 30, 40, 0.08), 0 8px 24px rgba(20, 30, 40, 0.08)` | `0 1px 2px rgba(0, 0, 0, 0.4), 0 8px 24px rgba(0, 0, 0, 0.3)` |

## Fixed colors used in scripts

These don’t change with the theme.

- 2D floor plan drawing (`PLAN_COLORS` in plan2d.js). The plan is drawn on a white sheet in both themes, like a printed drawing:

```js
sheet: '#ffffff', wall: '#27323c', text: '#1f2b36', sub: '#5d6976', dim: '#7a8591', furn: '#c3c9cf', furnFill: '#f4f5f6',
  window: '#5b9bd5', door: '#27323c', swing: '#9aa4ad', path: '#2453d6', staff: '#11806a', egress: '#c73a1f',
  zones: { public: '#e2eef8', clinical: '#e2f2e7', staff: '#f6eed8', support: '#ebe6f5', circulation: '#f2f3f3' }
```

- Edit-mode picks, in 3D and on the plan (`MARK`): `{ first: '#2453d6', second: '#e0592a', rename: '#11806a' }`. First pick blue, second pick orange, rename green. A pick that isn’t allowed previews in `#8a96a3`.
- People dots on the 2D plan (`ROLE_DOTS`): `{ patient: '#2453d6', nurse: '#11806a', provider: '#8b3fb0', reception: '#5d6b78' }`
- Scenario block accents (`TYPE_COLORS`): `{ shift: '#2453d6', break: '#7d8a96', appointments: '#11806a', walkins: '#2f9e73', out: '#c73a1f', closed: '#8b3fb0', group: '#c98a10', rule: '#e0592a', hours: '#5d6b78', run: '#5d6b78', steps: '#2453d6', visit_type: '#2453d6' }`
- Staff-shift accents by role (`ROLE_COLORS`): `{ provider: '#8b3fb0', nurse: '#11806a', reception: '#5d6b78' }`

## Type

- Font: Atkinson Hyperlegible 400 and 700 from Google Fonts, with fallbacks `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`.
- Body: 14.5px, line height 1.45. Small text 12–13px. Headings 14–24px, weight 700. Numbers in metrics use `font-variant-numeric: tabular-nums`.

## Shape and depth

- Radii: cards 14px, buttons 9px, inputs 8–9px, pills 999px, glass panels 18–20px.
- Card shadow: `var(--shadow)`.
- Glass (`.glassbox`): `var(--glass)` plus `backdrop-filter: blur(14px)`.
- Liquid glass (`.liquid`, used by the floor-plan panel and the room card): layered translucent gradient, `blur(20px) saturate(1.7)`, white inner highlight. Separate dark-mode values.

## Motion

All motion is turned off under `prefers-reduced-motion: reduce`.

| What | Duration and easing |
|---|---|
| Step tabs: highlight slides to the selected tab | 280ms `cubic-bezier(.3, .7, .2, 1)` on transform and width |
| Panels and step content appearing (`rise`) | 220ms ease, from 6px below with opacity 0 |
| Assistant drawer (`slide`) | 220ms ease from 16px to the right |
| Floor-plan panel opening and closing | 560ms `cubic-bezier(.3, 1.3, .5, 1)` (slight overshoot) on width, height and radius; content fades in after 160ms |
| Floor-plan panel snapping to a corner | 420ms `cubic-bezier(.3, 1.3, .5, 1)` on transform, animated from where it was dropped |
| Card highlight after add, move or problem click (`flash`) | 900ms |
| Guided tour | camera moves 2.4s (smoothstep), stays 6.5s per stop, with a slight drift |
| Edit picks in 3D | fill pulses, period about 1.8s |
| Toast | 4s; toasts with an action button stay 7s |

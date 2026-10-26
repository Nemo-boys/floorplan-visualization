# Design and user experience

## Principle

**Apple / OpenAI-style minimalism that a high-school student can operate.** Quiet surfaces, one accent colour, one obvious next step per screen, plain words instead of jargon (and jargon explained the first time: "PUE, the energy overhead").

## One design system, two themes

Both apps share the same visual language, with a theme difference so each domain is recognisable:

| | Data Center Studio | Clinic |
|---|---|---|
| Accent | Blue (#0071e3 / dark #0a84ff) | Teal (#0a7c74 / dark #3cc8bb), "care" |
| Type | Inter | Inter |
| Surfaces | #f5f5f7 background, white cards, 18 px radius, soft shadows | same |
| Controls | Pill buttons, segmented controls, glass overlays (saturate + blur) | same |
| Modes | Light and dark, each designed (not inverted), toggle in the top bar, remembered | same |

Shared building blocks: a glass top bar with brand mark, a numbered 1–2–3–4 step switcher, glass floating panels over the 3D, status cards (green / amber / red with an icon and a sentence, never colour alone), tiles for what-ifs, steppers and sliders, the assistant sheet.

## Interaction patterns

- **Stepper as the spine:** Import → Review → Simulate → Export; Describe → Design → Test → Cost. Each screen has one primary action ("Next: Simulate", "Run 20 days", "Test it").
- **The 3D is the hero.** Side panels collapse with edge tabs (and the `[` key in Data Center Studio); a full-view mode (`F`, Esc to leave) hides everything but the scene; the inspector card minimises to its title. The 3D keeps its framing centred in the visible area as panels open and close (camera view offset), so nothing jumps.
- **Progressive disclosure:** the clinic's Simulate opens on four questions (kind of day, providers, nurses, front desk, patients); the full block builder (breaks, staff out, closed rooms, visit types, When/Then rules) is one click away. Data Center Studio's Test shows a status card and six what-if tiles; "Show the numbers" opens the pool meters.
- **Lenses, each with a question:** "What is where?", "Where does the electricity go?", "Where does it get hot?", "What keeps running if something breaks?"
- **Click anything to learn about it:** rooms and parts open a card with numbers and a one-line explanation; links in the assistant's answers fly the camera there.
- **Speak first:** the assistant opens with what matters (the recommendation, the verdict) and suggests the next question as chips.

## Data visualisation

- A validated categorical palette (blue, orange, aqua, yellow, magenta) checked for colour-vision deficiency separation and contrast in both light and dark mode; status colours reserved for status.
- Thin marks, legends and direct labels, hover tooltips on every chart; stacked build-cost bar, energy Sankey, cost-over-time line, utilisation bars, day timelines; numbers in text tokens, not series colours.

## Accessibility

- Every control reachable by keyboard with visible focus rings; ARIA roles on tabs, groups, live regions for status and chat.
- `prefers-reduced-motion` respected (animations off, the simulated day starts paused).
- Status never relies on colour alone (icons and sentences).
- The clinic's original font choice (Atkinson Hyperlegible) remains available in the approved reference look (`?look=reference`).

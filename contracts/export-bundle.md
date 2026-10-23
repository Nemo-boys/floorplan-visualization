# Export bundle

“Download .zip” on the Export step produces `<plan-slug>-v<version>.zip`. The slug is the plan name in lower case, with every run of other characters replaced by a hyphen. For example, “Primary care clinic” version 3 becomes `primary-care-clinic-v3.zip`. The ZIP is uncompressed (stored), uses UTF-8 file names, and contains exactly these entries in this order:

| Entry | Content |
|---|---|
| `clinic.glb` | glTF 2.0 binary. Present only when 3D is available. |
| `plan.json` | The current version’s plan.json v0.1, plus `version`, `exported_at`, `furniture_added` and `checks` (see `plan.v0.1.schema.json`) |
| `plan.svg` | `planSVG(P, {})`: the full drawing with furniture, labels, dimensions and entrance |
| `build_in_blender.py` | `blenderScript(name)`, unchanged |
| `claude-skill/floorplan-to-blender/SKILL.md` | `skillMd()`, unchanged |
| `README.md` | `readmeMd(name, version, YYYY-MM-DD)` |

“Download .json” saves the same `plan.json` content as `<slug>-v<n>.json`. “Download .svg” saves `plan.svg` as `<slug>-v<n>.svg`.

## clinic.glb

- **Units and axes:** metres, Y up. This is the three.js world frame: x = plan x − W/2, z = −(plan y − D/2).
- **Node tree:**
  - `Clinic`
    - one node per room, named by its label (for example “Exam 3”). Children: `<label> floor`, then one mesh per furniture item, named `<Item name> <n>` (for example “Exam table 1”). Item names are in `ITEM_NAMES` in export.js.
    - `Walls, windows and frames`: one mesh, with primitives grouped by material
    - `Doors`: the open door leaves
  - Nodes without children have no `children` array.
- **Geometry:** non-indexed, with POSITION and NORMAL only, and world transforms baked in. Each mesh has one primitive per material.
- **Materials:** pbrMetallicRoughness with `baseColorFactor` in linear color. Transparent materials (glass) use `alphaMode: "BLEND"` and are double-sided. Floors use these fixed colors: wood `#c9a57a`, vinyl `#e6ece8`, grey `#dcdfe0`, corridor `#e4e1da`, tile `#e3eaee`, carpet `#b7ab99`.
- **People, trees and the site** aren’t exported.
- **Validation:** `gltf-validator` must report 0 errors. Warnings about unused attributes or missing UVs are acceptable.

## Blender script

Usage:

```
blender --background --python build_in_blender.py -- clinic.glb clinic.blend
```

Headless, it starts from an empty scene. In the Blender UI, it imports into the current file instead. It imports the GLB, then:

- moves each child of `Clinic` (each room plus walls and doors) into its own collection with the same name
- adds a sun (energy 3) and a camera at (16, −24, 22) with rotation (0.92, 0, 0.59)
- when headless, saves the `.blend` file

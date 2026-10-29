---
title: Floorplan Intelligence
emoji: 🏗️
colorFrom: green
colorTo: blue
sdk: docker
app_port: 7860
pinned: true
license: mit
short_description: Brief in, building out. Nemotron + CP-SAT floor plans in 3D.
---

# Floorplan Intelligence

Describe a building in a sentence. You get valid floor plans, a 3D model you can walk through, a simulation of how the building performs, and a file for Blender or NVIDIA Omniverse.

- **Clinic:** this page. Generate 3 plans, review them in 3D, simulate clinic days, edit in plain language, and export.
- **Data Center Studio:** [`/datacenter`](./datacenter). Describe, design, test and cost an AI data center.
- **Assistant (⌘J):** NVIDIA Nemotron 3 Ultra on Nebius Token Factory. It calls tools against the app's live state and can search the web.

Built for the Nebius × NVIDIA Global AI Hackathon 2026 (Best Apps and Agents) by Arunachalam, Sarvesh and Venu Arvind.

**Code, setup and full documentation:** https://github.com/Nemo-boys/floorplan-visualization

This Space is deployed from that repository with `make deploy-hf`.

"""Synthetic Clinical Curriculum Generator (Module 1C Stage 0).

Samples diverse outpatient clinic briefs, solves them to optimality via CP-SAT,
applies FMLM room permutation augmentation (LOCKED rooms first), and exports
JSONL datasets ready for QLoRA SFT and RLVR GRPO training.
"""

from typing import List, Dict, Tuple, Optional, Any
import random
import json
import os
import argparse
from pathlib import Path

from aegisplan.schemas import PlanDocument, Boundary, Room, BoundingBox, Door, Topology
from aegisplan.fml_parser import serialize_to_fml, _compute_walls_and_topology, _compute_circulation_paths
from aegisplan.cpsat_repair import repair_plan
from aegisplan.validator import validate_plan
from aegisplan.router import SYSTEM_PROMPT


def generate_synthetic_clinic_brief(rng: random.Random) -> Dict[str, Any]:
    """Sample a random, architecturally valid outpatient clinic specification."""
    # Footprint: 14m to 24m width, 10m to 16m height (on 1000mm increments)
    w_mm = rng.choice([14000, 16000, 18000, 20000, 22000])
    h_mm = rng.choice([10000, 12000, 14000])

    num_exams = rng.randint(2, 5)
    has_consult = rng.random() > 0.4
    has_procedure = rng.random() > 0.5
    has_reception = rng.random() > 0.3
    has_breakroom = rng.random() > 0.4

    # Natural language prompt brief variations
    clinic_types = [
        "Primary care outpatient clinic",
        "Community family health center",
        "Ambulatory pediatric care clinic",
        "Urgent care satellite facility",
        "General outpatient medical suite",
    ]
    clinic_name = rng.choice(clinic_types)

    brief_parts = [
        f"{clinic_name} requiring central circulation corridor",
        f"{num_exams} outpatient exam rooms (>= 11.15 m² each)",
        "single-user ADA compliant restroom",
        "clean and soiled utility support rooms with physical separation",
    ]
    if has_reception:
        brief_parts.append("reception and check-in desk")
    if has_consult:
        brief_parts.append("patient consultation office")
    if has_procedure:
        brief_parts.append("minor procedure / observation room")
    if has_breakroom:
        brief_parts.append("staff breakroom")

    natural_prompt = f"Design a {w_mm // 1000}m x {h_mm // 1000}m " + ", ".join(brief_parts) + "."

    return {
        "width_mm": w_mm,
        "height_mm": h_mm,
        "num_exams": num_exams,
        "has_consult": has_consult,
        "has_procedure": has_procedure,
        "has_reception": has_reception,
        "has_breakroom": has_breakroom,
        "brief": natural_prompt,
    }


def construct_and_solve_template(spec: Dict[str, Any], rng: random.Random) -> Optional[PlanDocument]:
    """Build a coarse clinic layout draft and solve to optimality with CP-SAT."""
    w = spec["width_mm"]
    h = spec["height_mm"]

    boundary = Boundary(
        polygon=[[0, 0], [w, 0], [w, h], [0, h]],
        area_m2=round((w * h) / 1_000_000.0, 2),
    )

    # Corridor in the middle
    corridor_y = rng.choice([4000, 5000])
    corridor_h = 2000

    rooms: List[Room] = []
    doors: List[Door] = []

    # 1. Waiting area
    wait_w = rng.choice([5000, 6000])
    rooms.append(
        Room(
            id="waiting_1",
            type="waiting",
            label="Waiting Area",
            locked=True,  # lock waiting area at main entrance
            bbox=BoundingBox(x=0, y=0, w=wait_w, h=corridor_y),
            polygon=[[0, 0], [wait_w, 0], [wait_w, corridor_y], [0, corridor_y]],
            area_actual_m2=round((wait_w * corridor_y) / 1_000_000.0, 2),
        )
    )

    # 2. Central Corridor
    rooms.append(
        Room(
            id="corridor_1",
            type="corridor",
            label="Circulation Corridor",
            locked=True,  # lock primary circulation spine
            bbox=BoundingBox(x=0, y=corridor_y, w=w, h=corridor_h),
            polygon=[[0, corridor_y], [w, corridor_y], [w, corridor_y + corridor_h], [0, corridor_y + corridor_h]],
            area_actual_m2=round((w * corridor_h) / 1_000_000.0, 2),
        )
    )

    # 3. North wing rooms (next to waiting)
    north_x = wait_w
    # Restroom
    restroom_w = 2500
    rooms.append(
        Room(
            id="restroom_1",
            type="restroom",
            label="ADA Restroom",
            locked=False,
            bbox=BoundingBox(x=north_x, y=0, w=restroom_w, h=corridor_y),
            polygon=[[north_x, 0], [north_x + restroom_w, 0], [north_x + restroom_w, corridor_y], [north_x, corridor_y]],
            area_actual_m2=round((restroom_w * corridor_y) / 1_000_000.0, 2),
        )
    )
    north_x += restroom_w

    if spec["has_reception"] and north_x + 3500 <= w:
        recep_w = 3500
        rooms.append(
            Room(
                id="reception_1",
                type="reception",
                label="Reception",
                locked=False,
                bbox=BoundingBox(x=north_x, y=0, w=recep_w, h=corridor_y),
                polygon=[[north_x, 0], [north_x + recep_w, 0], [north_x + recep_w, corridor_y], [north_x, corridor_y]],
                area_actual_m2=round((recep_w * corridor_y) / 1_000_000.0, 2),
            )
        )
        north_x += recep_w

    if spec["has_breakroom"] and north_x + 3500 <= w:
        break_w = min(w - north_x, 4000)
        rooms.append(
            Room(
                id="staff_break_1",
                type="staff_break",
                label="Staff Breakroom",
                locked=False,
                bbox=BoundingBox(x=north_x, y=0, w=break_w, h=corridor_y),
                polygon=[[north_x, 0], [north_x + break_w, 0], [north_x + break_w, corridor_y], [north_x, corridor_y]],
                area_actual_m2=round((break_w * corridor_y) / 1_000_000.0, 2),
            )
        )

    # 4. South wing rooms (Exams & Utilities)
    south_y = corridor_y + corridor_h
    south_h = h - south_y
    south_x = 0

    exam_count = spec["num_exams"]
    exam_w = 3200
    for e_idx in range(1, exam_count + 1):
        if south_x + exam_w <= w:
            rooms.append(
                Room(
                    id=f"exam_{e_idx}",
                    type="exam",
                    label=f"Exam Room {e_idx}",
                    locked=False,
                    bbox=BoundingBox(x=south_x, y=south_y, w=exam_w, h=south_h),
                    polygon=[[south_x, south_y], [south_x + exam_w, south_y], [south_x + exam_w, south_y + south_h], [south_x, south_y + south_h]],
                    area_actual_m2=round((exam_w * south_h) / 1_000_000.0, 2),
                )
            )
            south_x += exam_w

    # Clean & Soiled utilities
    util_w = 3000
    if south_x + util_w <= w:
        rooms.append(
            Room(
                id="clean_util_1",
                type="clean_util",
                label="Clean Utility",
                locked=False,
                bbox=BoundingBox(x=south_x, y=south_y, w=util_w, h=south_h),
                polygon=[[south_x, south_y], [south_x + util_w, south_y], [south_x + util_w, south_y + south_h], [south_x, south_y + south_h]],
                area_actual_m2=round((util_w * south_h) / 1_000_000.0, 2),
            )
        )
        south_x += util_w

    if south_x + util_w <= w:
        rooms.append(
            Room(
                id="soiled_util_1",
                type="soiled_util",
                label="Soiled Utility",
                locked=False,
                bbox=BoundingBox(x=south_x, y=south_y, w=util_w, h=south_h),
                polygon=[[south_x, south_y], [south_x + util_w, south_y], [south_x + util_w, south_y + south_h], [south_x, south_y + south_h]],
                area_actual_m2=round((util_w * south_h) / 1_000_000.0, 2),
            )
        )
        south_x += util_w

    # Connect doors to corridor
    door_id_cnt = 1
    doors.append(
        Door(
            id=f"door_{door_id_cnt}",
            connects=["waiting_1", "corridor_1"],
            position=[wait_w // 2, corridor_y],
            segment=[[wait_w // 2 - 500, corridor_y], [wait_w // 2 + 500, corridor_y]],
            width_mm=1065,
        )
    )
    door_id_cnt += 1

    # Exterior door
    doors.append(
        Door(
            id=f"door_{door_id_cnt}",
            connects=["waiting_1", "OUTSIDE"],
            position=[wait_w // 2, 0],
            segment=[[wait_w // 2 - 600, 0], [wait_w // 2 + 600, 0]],
            width_mm=1220,
            swing_dir="out_right",
        )
    )
    door_id_cnt += 1

    for r in rooms:
        if r.id not in ("waiting_1", "corridor_1"):
            # door connects to corridor
            d_x = r.bbox.x + r.bbox.w // 2
            d_y = corridor_y if r.bbox.y < corridor_y else (corridor_y + corridor_h)
            doors.append(
                Door(
                    id=f"door_{door_id_cnt}",
                    connects=[r.id, "corridor_1"],
                    position=[d_x, d_y],
                    segment=[[d_x - 450, d_y], [d_x + 450, d_y]],
                    width_mm=915,
                )
            )
            door_id_cnt += 1

    raw_plan = PlanDocument(
        boundary=boundary,
        rooms=rooms,
        doors=doors,
        walls=[],
        topology=Topology(),
    )

    # Solve to optimality with CP-SAT
    repair_result = repair_plan(raw_plan, max_time_seconds=1.0)
    if repair_result.status in ("OPTIMAL", "FEASIBLE"):
        return validate_plan(repair_result.plan)
    return None


def generate_curriculum_dataset(
    num_samples: int = 1000,
    output_dir: str = "dataset",
    seed: int = 42,
) -> Dict[str, str]:
    """Generate synthetic outpatient clinic plans and export SFT & GRPO JSONL files."""
    rng = random.Random(seed)
    os.makedirs(output_dir, exist_ok=True)

    sft_records: List[Dict[str, Any]] = []
    grpo_records: List[Dict[str, Any]] = []

    success_count = 0
    attempts = 0
    max_attempts = num_samples * 2

    while success_count < num_samples and attempts < max_attempts:
        attempts += 1
        spec = generate_synthetic_clinic_brief(rng)
        plan = construct_and_solve_template(spec, rng)

        if not plan:
            continue

        # Check that it passes regulatory checks
        passed_ratio = sum(1 for c in plan.validation.checks if c.status == "PASS") / max(1, len(plan.validation.checks))
        if passed_ratio < 1.0:
            continue

        # Serialize FML
        fml_string = serialize_to_fml(plan)

        # FMLM Permutation Augmentation:
        # Shuffle FREE rooms while keeping LOCKED rooms first
        locked_rooms = [r for r in plan.rooms if r.locked]
        free_rooms = [r for r in plan.rooms if not r.locked]
        rng.shuffle(free_rooms)
        augmented_plan = plan.model_copy(deep=True)
        augmented_plan.rooms = locked_rooms + free_rooms
        fml_augmented = serialize_to_fml(augmented_plan)

        # 1. SFT Chat Format (for QLoRA)
        prompt_content = (
            f"Generate an outpatient clinic floorplan for boundary RECT 0 0 {spec['width_mm']} {spec['height_mm']}.\n"
            f"Clinical Brief: {spec['brief']}\n"
            "Emit strictly valid FML-DSL:"
        )

        sft_entry = {
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt_content},
                {"role": "assistant", "content": fml_augmented},
            ],
            "metadata": {
                "boundary_w": spec["width_mm"],
                "boundary_h": spec["height_mm"],
                "rooms_count": len(plan.rooms),
                "num_exams": spec["num_exams"],
            },
        }
        sft_records.append(sft_entry)

        # 2. GRPO Prompt Format (for RLVR training with verifiable rewards)
        grpo_entry = {
            "prompt": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt_content},
            ],
            "boundary_w": spec["width_mm"],
            "boundary_h": spec["height_mm"],
            "required_rooms": [r.type for r in plan.rooms],
            "brief": spec["brief"],
        }
        grpo_records.append(grpo_entry)

        success_count += 1

    # Write files
    sft_path = os.path.join(output_dir, "sft_clinical_curriculum.jsonl")
    with open(sft_path, "w", encoding="utf-8") as f:
        for r in sft_records:
            f.write(json.dumps(r) + "\n")

    grpo_path = os.path.join(output_dir, "grpo_rlvr_prompts.jsonl")
    with open(grpo_path, "w", encoding="utf-8") as f:
        for r in grpo_records:
            f.write(json.dumps(r) + "\n")

    return {
        "sft_path": sft_path,
        "grpo_path": grpo_path,
        "samples_generated": str(success_count),
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate synthetic clinical floorplan curriculum.")
    parser.add_argument("--samples", type=int, default=500, help="Number of plans to synthesize")
    parser.add_argument("--output", type=str, default="dataset", help="Output directory")
    args = parser.parse_args()

    print(f"Synthesizing {args.samples} code-compliant outpatient clinic plans via CP-SAT...")
    res = generate_curriculum_dataset(num_samples=args.samples, output_dir=args.output)
    print(f"Generated {res['samples_generated']} samples.")
    print(f"SFT Dataset:  {res['sft_path']}")
    print(f"GRPO Prompts: {res['grpo_path']}")

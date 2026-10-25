"""Exhaustive Quality Assurance & Verification Audit for AegisPlan Training Data.

Performs 100% exhaustive mathematical, syntactic, geometric, and regulatory
audits on every sample in the training curriculum before fine-tuning.
"""

from typing import List, Dict, Any, Tuple
import json
import os
import sys
import re
from shapely.geometry import box, Polygon

from aegisplan.schemas import PlanDocument
from aegisplan.fml_parser import parse_fml
from aegisplan.validator import validate_plan


def audit_dataset_file(filepath: str) -> Dict[str, Any]:
    """Run rigorous QA checks across 100% of samples in the dataset."""
    if not os.path.exists(filepath):
        raise FileNotFoundError(f"Dataset file not found: {filepath}")

    stats = {
        "total_samples": 0,
        "valid_json": 0,
        "valid_chat_schema": 0,
        "valid_grammar": 0,
        "zero_overlap": 0,
        "full_boundary_containment": 0,
        "passed_all_regulatory_codes": 0,
        "perfect_samples": 0,
        "defects": [],
    }

    # EBNF regex patterns
    re_boundary = re.compile(r"^BOUNDARY RECT 0 0 (\d+) (\d+)$")
    re_room = re.compile(r"^ROOM ([a-z0-9_]+) TYPE ([a-z0-9_]+) RECT (\d+) (\d+) (\d+) (\d+) (LOCKED|FREE)$")
    re_door = re.compile(r"^DOOR ([a-z0-9_]+) CONNECT ([a-z0-9_]+) ([a-z0-9_]+) AT (\d+) (\d+) WIDTH (\d+)$")
    re_fdoor = re.compile(r"^FDOOR ([a-z0-9_]+) CONNECT ([a-z0-9_]+) OUTSIDE AT (\d+) (\d+) WIDTH (\d+)$")

    with open(filepath, "r", encoding="utf-8") as f:
        lines = f.readlines()

    stats["total_samples"] = len(lines)

    for idx, line in enumerate(lines):
        line_num = idx + 1
        sample_defects = []

        # 1. JSON parsing check
        try:
            record = json.loads(line)
            stats["valid_json"] += 1
        except Exception as e:
            stats["defects"].append({"line": line_num, "error": f"Invalid JSON: {e}"})
            continue

        # 2. Chat schema check
        messages = record.get("messages")
        if not messages or len(messages) != 3:
            sample_defects.append("Missing standard 3-turn messages format")
        elif (
            messages[0].get("role") != "system"
            or messages[1].get("role") != "user"
            or messages[2].get("role") != "assistant"
        ):
            sample_defects.append("Invalid roles in messages array")
        else:
            stats["valid_chat_schema"] += 1

        assistant_content = messages[2].get("content", "") if messages and len(messages) >= 3 else ""
        if not assistant_content:
            sample_defects.append("Empty assistant output")
            stats["defects"].append({"line": line_num, "errors": sample_defects})
            continue

        # 3. FML-DSL Syntax & EBNF Check
        fml_lines = [l.strip() for l in assistant_content.strip().splitlines() if l.strip()]
        if not fml_lines:
            sample_defects.append("No lines in assistant content")
        elif not re_boundary.match(fml_lines[0]):
            sample_defects.append(f"Header does not match BOUNDARY syntax: '{fml_lines[0]}'")
        elif fml_lines[-1] != "END_PLAN":
            sample_defects.append(f"Missing END_PLAN terminator (found '{fml_lines[-1]}')")

        # Check line formats
        saw_free = False
        for fml_line in fml_lines[1:-1]:
            if fml_line.startswith("ROOM "):
                m = re_room.match(fml_line)
                if not m:
                    sample_defects.append(f"Invalid ROOM syntax: '{fml_line}'")
                else:
                    is_locked = (m.group(7) == "LOCKED")
                    if is_locked and saw_free:
                        sample_defects.append(f"LOCKED room appeared after FREE room: '{fml_line}'")
                    elif not is_locked:
                        saw_free = True
            elif fml_line.startswith("DOOR "):
                if not re_door.match(fml_line):
                    sample_defects.append(f"Invalid DOOR syntax: '{fml_line}'")
            elif fml_line.startswith("FDOOR "):
                if not re_fdoor.match(fml_line):
                    sample_defects.append(f"Invalid FDOOR syntax: '{fml_line}'")
            else:
                sample_defects.append(f"Unexpected DSL line: '{fml_line}'")

        if not sample_defects:
            stats["valid_grammar"] += 1

        # 4. Geometry & Validation Check
        try:
            plan = parse_fml(assistant_content, plan_id=f"sample_{line_num}")
            validated = validate_plan(plan)

            # Check Overlap
            overlap_check = next((c for c in validated.validation.checks if c.rule_id == "GEOM-OVERLAP-02"), None)
            if overlap_check and overlap_check.status == "PASS":
                stats["zero_overlap"] += 1
            else:
                sample_defects.append(f"Overlap detected: {overlap_check.measured if overlap_check else 'Unknown'}")

            # Check Boundary Containment
            bound_check = next((c for c in validated.validation.checks if c.rule_id == "GEOM-BOUNDARY-01"), None)
            if bound_check and bound_check.status == "PASS":
                stats["full_boundary_containment"] += 1
            else:
                sample_defects.append(f"Out of boundary: {bound_check.measured if bound_check else 'Unknown'}")

            # Check All Regulatory Codes
            failed_checks = [c for c in validated.validation.checks if c.status == "FAIL"]
            if not failed_checks:
                stats["passed_all_regulatory_codes"] += 1
            else:
                for fc in failed_checks:
                    sample_defects.append(f"Failed rule {fc.rule_id}: {fc.measured}")

        except Exception as e:
            sample_defects.append(f"Parser/Validator exception: {e}")

        # Check if perfect
        if not sample_defects:
            stats["perfect_samples"] += 1
        else:
            stats["defects"].append({"line": line_num, "errors": sample_defects})

    return stats


if __name__ == "__main__":
    filepath = sys.argv[1] if len(sys.argv) > 1 else "dataset/sft_clinical_curriculum.jsonl"
    print(f"==================================================")
    print(f"AEGISPLAN TRAINING DATASET EXHAUSTIVE QA AUDIT")
    print(f"Target File: {filepath}")
    print(f"==================================================")

    audit_res = audit_dataset_file(filepath)
    tot = audit_res["total_samples"]

    print(f"Total Samples Evaluated:            {tot}")
    print(f"Valid JSON Lines:                   {audit_res['valid_json']} / {tot} ({audit_res['valid_json']/tot*100:.1f}%)")
    print(f"Valid Chat Messages Schema:         {audit_res['valid_chat_schema']} / {tot} ({audit_res['valid_chat_schema']/tot*100:.1f}%)")
    print(f"Strict EBNF Grammar Compliance:     {audit_res['valid_grammar']} / {tot} ({audit_res['valid_grammar']/tot*100:.1f}%)")
    print(f"Zero Polygon Overlap (0.0%):        {audit_res['zero_overlap']} / {tot} ({audit_res['zero_overlap']/tot*100:.1f}%)")
    print(f"100% Boundary Containment:          {audit_res['full_boundary_containment']} / {tot} ({audit_res['full_boundary_containment']/tot*100:.1f}%)")
    print(f"Passed 100% U.S. Regulatory Codes:  {audit_res['passed_all_regulatory_codes']} / {tot} ({audit_res['passed_all_regulatory_codes']/tot*100:.1f}%)")
    print(f"--------------------------------------------------")
    print(f"PERFECT 100% COMPLIANT SAMPLES:     {audit_res['perfect_samples']} / {tot} ({audit_res['perfect_samples']/tot*100:.1f}%)")
    print(f"Total Defects Found:                {len(audit_res['defects'])}")
    print(f"==================================================")

    if audit_res["defects"]:
        print("\nFIRST 3 DEFECT EXAMPLES:")
        for d in audit_res["defects"][:3]:
            print(f"Line {d['line']}: {d.get('errors') or d.get('error')}")
        sys.exit(1)
    else:
        print("\nAUDIT PASSED: Training data is 100% certified, defect-free, and ready for fine-tuning!")
        sys.exit(0)

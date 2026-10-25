"""Tests for synthetic dataset generator and verifiable reward function."""

import os
import json
import pytest
from aegisplan.dataset_generator import generate_curriculum_dataset
from aegisplan.reward_function import compute_verifiable_reward


def test_dataset_generation_and_reward(tmp_path):
    out_dir = str(tmp_path / "test_dataset")
    res = generate_curriculum_dataset(num_samples=5, output_dir=out_dir, seed=123)

    assert int(res["samples_generated"]) == 5
    assert os.path.exists(res["sft_path"])
    assert os.path.exists(res["grpo_path"])

    # Read first sample and verify reward
    with open(res["sft_path"], "r", encoding="utf-8") as f:
        first_line = json.loads(f.readline())

    fml_text = first_line["messages"][2]["content"]
    assert "BOUNDARY RECT" in fml_text
    assert "END_PLAN" in fml_text

    reward_metrics = compute_verifiable_reward(fml_text)
    assert reward_metrics["reward"] >= 0.8
    assert reward_metrics["r_syntax"] == 1.0
    assert reward_metrics["r_overlap"] == 1.0

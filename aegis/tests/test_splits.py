"""Tests for train/val/test data splits and leakage prevention."""

import json
import os
import pytest
from aegisplan.audit_dataset import audit_dataset_file


def test_dataset_splits_and_zero_leakage():
    train_file = "dataset/train.jsonl"
    val_file = "dataset/val.jsonl"
    test_file = "dataset/test.jsonl"

    assert os.path.exists(train_file)
    assert os.path.exists(val_file)
    assert os.path.exists(test_file)

    def load_lines(path):
        with open(path, "r", encoding="utf-8") as f:
            return [json.loads(line) for line in f]

    train_data = load_lines(train_file)
    val_data = load_lines(val_file)
    test_data = load_lines(test_file)

    assert len(train_data) == 400
    assert len(val_data) == 50
    assert len(test_data) == 50

    # Extract assistant outputs
    train_outputs = {d["messages"][2]["content"] for d in train_data}
    val_outputs = {d["messages"][2]["content"] for d in val_data}
    test_outputs = {d["messages"][2]["content"] for d in test_data}

    # Verify zero leakage (disjoint sets)
    assert len(train_outputs.intersection(test_outputs)) == 0, "Data leakage between train and test!"
    assert len(train_outputs.intersection(val_outputs)) == 0, "Data leakage between train and val!"
    assert len(val_outputs.intersection(test_outputs)) == 0, "Data leakage between val and test!"

    # Verify QA audit on each split
    audit_train = audit_dataset_file(train_file)
    assert audit_train["perfect_samples"] == 400

    audit_val = audit_dataset_file(val_file)
    assert audit_val["perfect_samples"] == 50

    audit_test = audit_dataset_file(test_file)
    assert audit_test["perfect_samples"] == 50

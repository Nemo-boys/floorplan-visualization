"""Tests for the quantitative benchmark harness."""

import pytest
from aegisplan.benchmark import BenchmarkHarness, BENCHMARK_BRIEFS


def test_benchmark_briefs_structure():
    assert len(BENCHMARK_BRIEFS) == 25
    feasible = [b for b in BENCHMARK_BRIEFS if b["type"] == "feasible"]
    infeasible = [b for b in BENCHMARK_BRIEFS if b["type"] == "infeasible"]
    assert len(feasible) == 20
    assert len(infeasible) == 5


@pytest.mark.anyio
async def test_benchmark_harness_execution():
    harness = BenchmarkHarness()
    # Test on a small subset of briefs
    results = await harness.run_benchmark()
    assert "variants" in results
    assert "feasible_evaluations" in results
    assert "infeasible_evaluations" in results
    assert len(results["feasible_evaluations"]) == 20
    assert len(results["infeasible_evaluations"]) == 5

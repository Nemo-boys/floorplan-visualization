"""Unit tests for the generation router and candidate ranking."""

import pytest
from aegisplan.router import GenerationRouter


@pytest.mark.anyio
async def test_generate_and_rank_candidates():
    router = GenerationRouter()
    candidates = await router.generate_candidates(
        brief="Primary care outpatient clinic with 3 exam rooms and clean utility",
        boundary_w=16000,
        boundary_h=12000,
        mode="local",
        num_candidates=3,
    )

    assert len(candidates) == 3
    # Check ranks are assigned 1, 2, 3
    assert [c.rank for c in candidates] == [1, 2, 3]

    # Verify best candidate has optimal or feasible status
    best = candidates[0]
    assert best.solver_status in ("OPTIMAL", "FEASIBLE")
    assert best.checks_passed > 0
    assert best.repaired_plan.metadata.plan_id == "clinic_rank_1"

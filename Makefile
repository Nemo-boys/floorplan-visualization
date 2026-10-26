PY := aegis/.venv/bin/python

.PHONY: setup dev test test-aegis test-viz fixtures bench

setup:
	cd aegis && uv venv --python 3.12 .venv && uv pip install --python .venv/bin/python -r requirements.txt -e .
	cd viz && npm install

# Build the viewer and serve it with the API on http://127.0.0.1:8000 (uses the local model if it's downloaded).
dev:
	cd viz && npm run build
	cd aegis && .venv/bin/uvicorn aegisplan.server:app --host 127.0.0.1 --port 8000

test: test-aegis test-viz

test-aegis:
	cd aegis && .venv/bin/python -m pytest -q

test-viz:
	cd viz && npm run check

fixtures:
	cd aegis && .venv/bin/python scripts/export_viz_fixtures.py

# Measured benchmark; writes docs/BENCHMARK.md. Add ARGS=--no-model to skip the model (seconds instead of ~30 min).
bench:
	cd aegis && .venv/bin/python scripts/bench_pipeline.py $(ARGS)

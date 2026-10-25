PY := aegis/.venv/bin/python

.PHONY: setup test test-aegis test-viz fixtures

setup:
	cd aegis && uv venv --python 3.12 .venv && uv pip install --python .venv/bin/python -r requirements.txt -e .
	cd viz && npm install

test: test-aegis test-viz

test-aegis:
	cd aegis && .venv/bin/python -m pytest -q

test-viz:
	cd viz && npm run check

fixtures:
	cd aegis && .venv/bin/python scripts/export_viz_fixtures.py

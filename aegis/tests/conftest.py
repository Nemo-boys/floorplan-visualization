"""Unit tests never load the multi-GB local model; they exercise the fallback path."""

import os

os.environ.setdefault("AEGISPLAN_DISABLE_MODEL", "1")

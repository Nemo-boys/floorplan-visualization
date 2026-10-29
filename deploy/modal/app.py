"""Floorplan Intelligence on Modal: the viewer and the AegisPlan API on a small CPU container.

The fine-tuned Nemotron Nano 9B runs on its own GPU endpoint (model.py), reached through AEGIS_GGUF_URL.
Nemotron 3 Ultra runs on Nebius Token Factory. Both scale to zero, so an idle demo costs nothing.

  make deploy-modal      # builds viz/dist, syncs keys from aegis/.env into the `aegis-app` secret, deploys
"""

import os

import modal

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
REMOTE = "/root/app"

image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install_from_requirements(os.path.join(ROOT, "aegis", "requirements.txt"))
    .add_local_dir(os.path.join(ROOT, "aegis", "aegisplan"), f"{REMOTE}/aegis/aegisplan", ignore=["**/__pycache__"])
    .add_local_dir(os.path.join(ROOT, "viz", "dist"), f"{REMOTE}/viz/dist")
)

app = modal.App("floorplan-intelligence")


@app.function(
    image=image,
    secrets=[modal.Secret.from_name("aegis-app")],
    scaledown_window=600,  # warm for 10 min after the last visit
    timeout=600,
    max_containers=2,
)
@modal.concurrent(max_inputs=50)
@modal.asgi_app(label="floorplan-intelligence")
def web():
    import sys

    sys.path.insert(0, f"{REMOTE}/aegis")
    from aegisplan.server import app as fastapi_app

    return fastapi_app

"""The fine-tuned AegisPlan Nemotron Nano 9B (GGUF Q4_K_M) on a Modal GPU (L4, else A10G or T4), served by llama.cpp.

llama-server speaks the OpenAI chat API and accepts a GBNF `grammar` per request, so the app keeps the
same grammar-constrained decoding it uses locally (aegisplan/gguf_engine.py, RemoteGGUFEngine). The GPU
scales to zero when idle; the first request after that waits for the model to load (~30-60 s).

  modal run deploy/modal/model.py::download     # once: the GGUF from Hugging Face into a Modal volume
  modal deploy deploy/modal/model.py            # the endpoint; needs the `aegis-model` secret (LLAMA_API_KEY)
"""

import subprocess

import modal

REPO = "VenuArvind/aegisplan-nemotron-nano-9b-gguf"
FILE = "nemotron_aegisplan_q4_k_m.gguf"
MODELS = "/models"
PORT = 8080

volume = modal.Volume.from_name("aegisplan-models", create_if_missing=True)
app = modal.App("aegisplan-model")

server_image = modal.Image.from_registry("ghcr.io/ggml-org/llama.cpp:server-cuda", add_python="3.12").entrypoint([])
download_image = modal.Image.debian_slim(python_version="3.12").pip_install("huggingface_hub")


@app.function(image=download_image, volumes={MODELS: volume}, timeout=1800)
def download():
    from huggingface_hub import hf_hub_download

    path = hf_hub_download(REPO, FILE, local_dir=MODELS)
    volume.commit()
    print("saved", path)


@app.function(
    image=server_image,
    gpu=["L4", "A10G", "T4"],  # first one with capacity; any of them holds the 5.5 GB model
    volumes={MODELS: volume},
    secrets=[modal.Secret.from_name("aegis-model")],
    scaledown_window=300,  # stay warm 5 min after the last request, then cost nothing
    timeout=600,
    max_containers=1,  # one GPU at most: a hard cap on spend
)
@modal.concurrent(max_inputs=4)
@modal.web_server(port=PORT, startup_timeout=300)
def serve():
    import os

    subprocess.Popen(
        [
            "/app/llama-server",
            "-m", f"{MODELS}/{FILE}",
            "--host", "0.0.0.0",
            "--port", str(PORT),
            "-ngl", "99",  # every layer on the GPU
            "-c", "4096",
            "--jinja",  # the model's own chat template, as llama-cpp-python uses locally
            "--api-key", os.environ["LLAMA_API_KEY"],
        ]
    )

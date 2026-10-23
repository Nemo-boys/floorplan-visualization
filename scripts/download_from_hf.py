#!/usr/bin/env python3
"""Download fine-tuned quantized GGUF model from Hugging Face Hub into local checkpoints/."""

import os
import sys
from huggingface_hub import hf_hub_download

REPO_ID = "VenuArvind/aegisplan-nemotron-nano-9b-gguf"
FILENAME = "nemotron_aegisplan_q4_k_m.gguf"
TOKEN = os.environ.get("HF_TOKEN")

def main():
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    checkpoints_dir = os.path.join(base_dir, "checkpoints")
    os.makedirs(checkpoints_dir, exist_ok=True)

    target_file = os.path.join(checkpoints_dir, FILENAME)
    print("=" * 60)
    print("AegisPlan GGUF Downloader")
    print(f"Repository: https://huggingface.co/{REPO_ID}")
    print(f"File:       {FILENAME}")
    print(f"Target:     {target_file}")
    print("=" * 60)

    if os.path.exists(target_file):
        size_gb = os.path.getsize(target_file) / (1024 * 1024 * 1024)
        print(f"File already exists locally ({size_gb:.2f} GB). Skipping download.")
    else:
        print(f"\nDownloading {FILENAME} from Hugging Face Hub (streaming with progress)...")
        downloaded_path = hf_hub_download(
            repo_id=REPO_ID,
            filename=FILENAME,
            local_dir=checkpoints_dir,
            token=TOKEN,
        )
        print(f"✓ Download complete: {downloaded_path}")

    # Verify with AegisPlan GGUF Engine
    sys.path.insert(0, base_dir)
    from aegisplan.gguf_engine import is_gguf_available, find_gguf_model_path

    print("\nVerifying AegisPlan Engine status:")
    print(f"• Detected Model Path: {find_gguf_model_path()}")
    print(f"• Apple Silicon Metal / GGUF Available: {is_gguf_available()}")
    print("\n✓ Ready for high-speed local inference!")

if __name__ == "__main__":
    main()

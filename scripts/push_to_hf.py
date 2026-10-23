#!/usr/bin/env python3
"""Publish local AegisPlan merged models or GGUF files to Hugging Face Hub.

Usage:
    python scripts/push_to_hf.py [--repo-id VenuArvind/nemotron-nano-9b-aegisplan] [--gguf-only]
"""

import os
import sys
import argparse
import glob
from huggingface_hub import HfApi

def main():
    parser = argparse.ArgumentParser(description="Upload AegisPlan models to Hugging Face Hub.")
    parser.add_argument(
        "--token",
        default=os.environ.get("HF_TOKEN", ""),
        help="Hugging Face write token (defaults to $HF_TOKEN environment variable).",
    )
    parser.add_argument(
        "--repo-name",
        default="nemotron-nano-9b-aegisplan",
        help="Target Hugging Face repository name.",
    )
    parser.add_argument(
        "--checkpoints-dir",
        default="checkpoints",
        help="Local checkpoints directory.",
    )
    parser.add_argument(
        "--private",
        action="store_true",
        help="Make repository private.",
    )
    args = parser.parse_args()

    api = HfApi(token=args.token)
    try:
        user_info = api.whoami()
        username = user_info["name"]
        print(f"✓ Authenticated as Hugging Face user: {username}")
    except Exception as e:
        print(f"Error authenticating with Hugging Face: {e}", file=sys.stderr)
        sys.exit(1)

    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    checkpoints_dir = os.path.join(base_dir, args.checkpoints_dir)

    # 1. Upload Merged SafeTensors Model
    merged_dir = os.path.join(checkpoints_dir, "nemotron_aegisplan_merged")
    if os.path.exists(merged_dir):
        repo_id = f"{username}/{args.repo_name}"
        print(f"\n1. Uploading merged model from {merged_dir} to {repo_id}...")
        api.create_repo(repo_id, repo_type="model", exist_ok=True, private=args.private)
        api.upload_folder(
            folder_path=merged_dir,
            repo_id=repo_id,
            repo_type="model",
            commit_message="Upload AegisPlan fine-tuned Nemotron Nano 9B weights",
        )
        print(f"✓ Model published: https://huggingface.co/{repo_id}")

    # 2. Upload GGUF Files
    gguf_files = glob.glob(os.path.join(checkpoints_dir, "*.gguf"))
    if gguf_files:
        gguf_repo = f"{username}/{args.repo_name}-gguf"
        print(f"\n2. Uploading {len(gguf_files)} GGUF file(s) to {gguf_repo}...")
        api.create_repo(gguf_repo, repo_type="model", exist_ok=True, private=args.private)
        for gf in gguf_files:
            fname = os.path.basename(gf)
            print(f"   Uploading {fname} ({os.path.getsize(gf)/1024/1024/1024:.2f} GB)...")
            api.upload_file(
                path_or_fileobj=gf,
                path_in_repo=fname,
                repo_id=gguf_repo,
                repo_type="model",
                commit_message=f"Upload {fname} quantized GGUF weights",
            )
            print(f"   ✓ {fname} uploaded!")
        print(f"✓ GGUF models published: https://huggingface.co/{gguf_repo}")

if __name__ == "__main__":
    main()

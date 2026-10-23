#!/usr/bin/env python3
"""Convert merged Hugging Face Nemotron model to GGUF format for local llama.cpp / Metal inference.

Usage:
    python scripts/convert_merged_to_gguf.py [--model-dir checkpoints/nemotron_aegisplan_merged] [--outtype q8_0|bf16|f16]
"""

import os
import sys
import argparse
import subprocess

def main():
    parser = argparse.ArgumentParser(description="Convert Nemotron HF model to GGUF format.")
    parser.add_argument(
        "--model-dir",
        default="checkpoints/nemotron_aegisplan_merged",
        help="Path to merged Hugging Face model directory.",
    )
    parser.add_argument(
        "--outtype",
        default="q8_0",
        choices=["q8_0", "bf16", "f16"],
        help="Output quantization format (default: q8_0 for compact 8-bit quantization).",
    )
    parser.add_argument(
        "--output-file",
        default=None,
        help="Target .gguf file path (default: checkpoints/nemotron_aegisplan_{outtype}.gguf).",
    )
    args = parser.parse_args()

    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    model_dir = os.path.join(base_dir, args.model_dir) if not os.path.isabs(args.model_dir) else args.model_dir

    if not os.path.exists(model_dir):
        print(f"Error: Model directory not found: {model_dir}", file=sys.stderr)
        sys.exit(1)

    out_file = args.output_file or os.path.join(base_dir, "checkpoints", f"nemotron_aegisplan_{args.outtype}.gguf")
    converter_script = os.path.join(base_dir, "llama.cpp", "convert_hf_to_gguf.py")

    if not os.path.exists(converter_script):
        print(f"Error: llama.cpp converter not found at: {converter_script}", file=sys.stderr)
        print("Run: git clone --depth 1 https://github.com/ggerganov/llama.cpp.git", file=sys.stderr)
        sys.exit(1)

    print(f"=== Converting {model_dir} to GGUF ({args.outtype}) ===")
    print(f"Target: {out_file}")

    cmd = [
        sys.executable,
        converter_script,
        model_dir,
        "--outtype", args.outtype,
        "--outfile", out_file,
    ]

    res = subprocess.run(cmd)
    if res.returncode == 0:
        print(f"\n Successfully converted model to GGUF!")
        print(f"Output saved to: {out_file}")
        print("AegisPlan will automatically discover and use this GGUF file for local Metal inference.")
    else:
        print(f"\n Conversion failed with exit code {res.returncode}", file=sys.stderr)
        sys.exit(res.returncode)

if __name__ == "__main__":
    main()

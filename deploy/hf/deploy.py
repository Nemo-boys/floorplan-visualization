"""Deploy the committed HEAD to a Hugging Face Docker Space.

  HF_TOKEN=hf_... make deploy-hf                 # default Space: manik063/floorplan-intelligence
  HF_TOKEN=hf_... make deploy-hf SPACE=org/name

Only committed files go up (git archive), minus what the server doesn't need. The keys the server uses
(NEBIUS_API_KEY, TAVILY_API_KEY) are set as Space secrets from the environment or aegis/.env, never uploaded.
"""

import argparse
import os
import shutil
import subprocess
import sys
import tarfile
import tempfile

from huggingface_hub import HfApi

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
HERE = os.path.dirname(os.path.abspath(__file__))
SECRETS = ("NEBIUS_API_KEY", "TAVILY_API_KEY")
# not needed to build or run the app: presentation media, tests, training data and notebooks, specs
EXCLUDE = (
    "presentation", "handoff", "docs", "contracts", "viz/tests", "viz/docs", "viz/design", "viz/reference-src",
    "viz/tools", "aegis/dataset", "aegis/notebooks", "aegis/tests", "aegis/scripts",
)


def env_file() -> dict:
    out = {}
    path = os.path.join(ROOT, "aegis", ".env")
    if os.path.isfile(path):
        for line in open(path, encoding="utf-8"):
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                out[k.strip()] = v.strip().strip("'\"")
    return out


def stage(dest: str) -> str:
    rev = subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, text=True).strip()
    archive = os.path.join(dest, "src.tar")
    subprocess.check_call(["git", "archive", "--format=tar", "-o", archive, "HEAD"], cwd=ROOT)
    site = os.path.join(dest, "site")
    with tarfile.open(archive) as tar:
        tar.extractall(site, filter="data")
    for rel in EXCLUDE:
        shutil.rmtree(os.path.join(site, rel), ignore_errors=True)
    for name in ("Dockerfile", "README.md"):
        shutil.copy(os.path.join(HERE, name), os.path.join(site, name))
    return site, rev


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--space", default=os.environ.get("SPACE") or "manik063/floorplan-intelligence")
    args = ap.parse_args()
    token = os.environ.get("HF_TOKEN")
    if not token:
        print("Set HF_TOKEN (a Hugging Face token with write access).", file=sys.stderr)
        return 1
    if subprocess.check_output(["git", "status", "--porcelain", "--untracked-files=no"], cwd=ROOT, text=True).strip():
        print("Note: uncommitted changes are not deployed; only HEAD goes up.")

    api = HfApi(token=token)
    api.create_repo(args.space, repo_type="space", space_sdk="docker", exist_ok=True)
    keys = {**env_file(), **{k: os.environ[k] for k in SECRETS if os.environ.get(k)}}
    for k in SECRETS:
        if keys.get(k):
            api.add_space_secret(args.space, k, keys[k])
            print(f"secret {k} set")
        else:
            print(f"secret {k} missing; that feature stays off on the Space")

    with tempfile.TemporaryDirectory() as tmp:
        site, rev = stage(tmp)
        api.upload_folder(
            repo_id=args.space,
            repo_type="space",
            folder_path=site,
            commit_message=f"Deploy {rev}",
            delete_patterns=["*"],  # mirror HEAD: files removed from the repo leave the Space too
        )
    user, name = args.space.split("/")
    print(f"Deployed {rev}: https://huggingface.co/spaces/{args.space}  app: https://{user}-{name}.hf.space".replace("_", "-"))
    return 0


if __name__ == "__main__":
    sys.exit(main())

"""Copy the server's keys from aegis/.env (or the environment) into the Modal secret `aegis-app`.

AEGIS_GGUF_URL defaults to the model endpoint deployed from model.py in the same Modal workspace.
"""

import os
import subprocess
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
KEYS = ("NEBIUS_API_KEY", "TAVILY_API_KEY", "AEGIS_GGUF_KEY", "AEGIS_GGUF_URL")


def main() -> int:
    import modal

    values = {}
    path = os.path.join(ROOT, "aegis", ".env")
    if os.path.isfile(path):
        for line in open(path, encoding="utf-8"):
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                values[k.strip()] = v.strip().strip("'\"")
    values.update({k: os.environ[k] for k in KEYS if os.environ.get(k)})
    if not values.get("AEGIS_GGUF_URL"):
        values["AEGIS_GGUF_URL"] = modal.Function.from_name("aegisplan-model", "serve").get_web_url()

    pairs = [f"{k}={values[k]}" for k in KEYS if values.get(k)]
    for k in KEYS:
        print(f"{k}: {'set' if values.get(k) else 'missing'}")
    modal_cli = os.path.join(os.path.dirname(sys.executable), "modal")
    subprocess.check_call([modal_cli, "secret", "create", "aegis-app", *pairs, "--force"], stdout=subprocess.DEVNULL)
    return 0


if __name__ == "__main__":
    sys.exit(main())

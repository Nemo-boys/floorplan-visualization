"""AegisPlan GGUF Inference Engine powered by llama-cpp-python and Apple Silicon Metal.

Provides high-throughput, low-latency local LLM generation for NVIDIA Nemotron 9B
hybrid architecture quantized models (Q4_K_M, Q8_0, etc.) without requiring cloud
APIs or high-memory unquantized PyTorch execution.

AEGIS_GGUF_URL (+ AEGIS_GGUF_KEY) swaps in the same model behind llama.cpp's server on a cloud GPU
(deploy/modal/model.py): same chat template, same GBNF grammar, no local weights needed.
"""

from typing import List, Dict, Any, Optional
import os
import glob
import logging
import time

logger = logging.getLogger("aegisplan.gguf_engine")

_GLOBAL_GGUF_ENGINE: Optional["GGUFInferenceEngine"] = None


def find_gguf_model_path() -> Optional[str]:
    """Locate the best available GGUF model file."""
    # Tests and offline demos can force the fallback path.
    if os.environ.get("AEGISPLAN_DISABLE_MODEL"):
        return None

    # 1. Environment variable override
    env_path = os.environ.get("AEGISPLAN_GGUF_PATH")
    if env_path and os.path.exists(env_path):
        return env_path

    # 2. Check checkpoints/ directory
    base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    checkpoints_dir = os.path.join(base_dir, "checkpoints")

    if not os.path.exists(checkpoints_dir):
        return None

    # Preferred patterns in order of priority
    patterns = [
        os.path.join(checkpoints_dir, "*aegisplan*q4*.gguf"),
        os.path.join(checkpoints_dir, "*aegisplan*q8*.gguf"),
        os.path.join(checkpoints_dir, "*aegisplan*.gguf"),
        os.path.join(checkpoints_dir, "*nemotron*q4*.gguf"),
        os.path.join(checkpoints_dir, "*q4_k_m*.gguf"),
        os.path.join(checkpoints_dir, "*.gguf"),
    ]

    for pat in patterns:
        matches = glob.glob(pat)
        if matches:
            # Pick the most recently modified or first match
            matches.sort(key=os.path.getmtime, reverse=True)
            return matches[0]

    return None


def remote_model_url() -> str:
    """The llama.cpp server holding the model, if one is configured (and the model isn't disabled)."""
    if os.environ.get("AEGISPLAN_DISABLE_MODEL"):
        return ""
    return os.environ.get("AEGIS_GGUF_URL", "").strip().rstrip("/")


def model_label() -> str:
    return "Nemotron Nano 9B (cloud GPU)" if remote_model_url() else "Nemotron Nano 9B (local)"


def is_gguf_available() -> bool:
    """Check if the model is reachable: a remote llama.cpp server, or llama-cpp-python plus a local GGUF."""
    if remote_model_url():
        return True
    try:
        import llama_cpp  # noqa: F401
    except ImportError:
        return False

    return find_gguf_model_path() is not None


class GGUFInferenceEngine:
    """Manages llama-cpp-python Llama instance with Metal acceleration and geometric logit masking."""

    def __init__(
        self,
        model_path: Optional[str] = None,
        n_ctx: int = 2048,
        n_gpu_layers: Optional[int] = None,
        n_threads: Optional[int] = None,
    ):
        try:
            from llama_cpp import Llama, LogitsProcessorList
            self._llama_class = Llama
            self._logits_proc_list_class = LogitsProcessorList
        except ImportError as e:
            raise RuntimeError(
                "llama-cpp-python is not installed. Install via: pip install llama-cpp-python"
            ) from e

        self.model_path = model_path or find_gguf_model_path()
        if not self.model_path or not os.path.exists(self.model_path):
            raise FileNotFoundError(
                f"No GGUF model found at '{self.model_path}'. "
                "Place a .gguf model in checkpoints/ or export via Google Colab."
            )

        # All layers on the GPU (Metal). Older llama.cpp builds hit KV-dimension mismatches with
        # the hybrid Mamba-2 layers on Metal; llama-cpp-python 0.3.36 runs it correctly and about
        # 1.3x faster than CPU on an M4 Pro. Set AEGISPLAN_GPU_LAYERS=0 to run on the CPU.
        if n_gpu_layers is None:
            n_gpu_layers = int(os.environ.get("AEGISPLAN_GPU_LAYERS", "-1"))

        threads = n_threads or int(os.environ.get("AEGISPLAN_THREADS", str(os.cpu_count() or 8)))

        logger.info(
            "Initializing GGUF engine with model: %s (n_gpu_layers=%d, n_threads=%d)",
            self.model_path,
            n_gpu_layers,
            threads,
        )
        self.llm = self._llama_class(
            model_path=self.model_path,
            n_ctx=n_ctx,
            n_gpu_layers=n_gpu_layers,
            n_threads=threads,
            n_threads_batch=threads,
            verbose=False,
        )

    def generate_fml(
        self,
        prompt: str,
        boundary_w: int = 16000,
        boundary_h: int = 12000,
        enable_geometric_masking: bool = False,
        temperature: float = 0.7,
        top_p: float = 0.9,
        max_tokens: int = 768,
        stop_tokens: Optional[List[str]] = None,
    ) -> str:
        """Generate FML-DSL text using quantized GGUF inference."""
        stop = stop_tokens or ["</fml>", "END_PLAN", "<|end_of_turn|>", "<SPECIAL_12>"]

        logits_processor = None
        if enable_geometric_masking:
            try:
                from aegisplan.logits_processor import FMLGeometricLogitsProcessor
                masking_proc = FMLGeometricLogitsProcessor(
                    tokenizer=self.llm,
                    boundary_w=boundary_w,
                    boundary_h=boundary_h,
                    enabled=True,
                )
                logits_processor = self._logits_proc_list_class([masking_proc])
                logger.info("GGUF generation using FMLGeometricLogitsProcessor")
            except Exception as e:
                logger.warning("Could not attach logits processor to GGUF: %s", e)

        # Build Chat ML formatted prompt targeting strict FML-DSL grammar
        system_content = (
            "You are AegisPlan, an autonomous AI architect specializing in U.S. Healthcare Outpatient Facilities.\n"
            "Output valid FML-DSL code matching the exact grammar:\n"
            "BOUNDARY RECT 0 0 <W> <H>\n"
            "ROOM <id> TYPE <type> RECT <x> <y> <w> <h> <LOCKED|FREE>\n"
            "DOOR <id> CONNECT <r1> <r2> AT <x> <y> WIDTH <w>\n"
            "FDOOR <id> CONNECT <r1> OUTSIDE AT <x> <y> WIDTH <w>\n"
            "END_PLAN"
        )

        full_prompt = (
            f"<SPECIAL_10>System\n{system_content}\n"
            f"<SPECIAL_11>User\n{prompt}\n"
            f"<SPECIAL_11>Assistant\n<think></think>\n<fml>\nBOUNDARY RECT 0 0 {boundary_w} {boundary_h}\n"
        )

        output = self.llm(
            full_prompt,
            max_tokens=max_tokens,
            temperature=temperature,
            top_p=top_p,
            stop=stop,
            logits_processor=logits_processor,
        )

        text = output["choices"][0]["text"].strip()
        logger.debug("Raw GGUF output: %s", text[:200])

        # Clean any tags if model emitted them
        if "</think>" in text:
            text = text.split("</think>")[-1].strip()
        if "<fml>" in text:
            text = text.split("<fml>")[-1].strip()
        if "</fml>" in text:
            text = text.split("</fml>")[0].strip()

        # Build clean FML document
        lines = []
        has_boundary = False
        for line in text.splitlines():
            line_str = line.strip()
            if not line_str or line_str == "END_PLAN":
                continue
            if line_str.startswith("BOUNDARY"):
                has_boundary = True
            lines.append(line_str)

        if not has_boundary:
            lines.insert(0, f"BOUNDARY RECT 0 0 {boundary_w} {boundary_h}")

        lines.append("END_PLAN")
        return "\n".join(lines)


    def generate_chat(
        self,
        messages: List[Dict[str, str]],
        grammar: Optional[str] = None,
        temperature: float = 0.0,
        max_tokens: int = 900,
    ) -> str:
        """Chat completion with the model's own chat template, optionally constrained by a GBNF grammar."""
        llama_grammar = None
        if grammar:
            from llama_cpp import LlamaGrammar
            llama_grammar = LlamaGrammar.from_string(grammar, verbose=False)
        out = self.llm.create_chat_completion(
            messages=messages, temperature=temperature, max_tokens=max_tokens, grammar=llama_grammar
        )
        return out["choices"][0]["message"]["content"].strip()


class RemoteGGUFEngine:
    """The same GGUF behind llama.cpp's OpenAI-compatible server, which takes a GBNF grammar per request."""

    # Tests replace this with an httpx.MockTransport.
    transport = None

    def __init__(self, url: str, key: str = ""):
        self.url = url
        self.key = key

    def generate_chat(
        self,
        messages: List[Dict[str, str]],
        grammar: Optional[str] = None,
        temperature: float = 0.0,
        max_tokens: int = 900,
    ) -> str:
        import httpx

        payload: Dict[str, Any] = {"messages": messages, "temperature": temperature, "max_tokens": max_tokens}
        if grammar:
            payload["grammar"] = grammar
        headers = {"Authorization": f"Bearer {self.key}"} if self.key else {}
        # a GPU that scaled to zero loads the model first (~30-60 s)
        with httpx.Client(timeout=httpx.Timeout(300.0, connect=30.0), transport=self.transport) as client:
            resp = client.post(f"{self.url}/v1/chat/completions", headers=headers, json=payload)
            resp.raise_for_status()
            return (resp.json()["choices"][0]["message"]["content"] or "").strip()


def get_gguf_engine() -> Optional[Any]:
    """Retrieve or initialize the singleton GGUF engine (remote when AEGIS_GGUF_URL is set)."""
    global _GLOBAL_GGUF_ENGINE
    url = remote_model_url()
    if url:
        if not isinstance(_GLOBAL_GGUF_ENGINE, RemoteGGUFEngine) or _GLOBAL_GGUF_ENGINE.url != url:
            _GLOBAL_GGUF_ENGINE = RemoteGGUFEngine(url, os.environ.get("AEGIS_GGUF_KEY", ""))
        return _GLOBAL_GGUF_ENGINE
    if _GLOBAL_GGUF_ENGINE is None and is_gguf_available():
        try:
            _GLOBAL_GGUF_ENGINE = GGUFInferenceEngine()
        except Exception as e:
            logger.error("Failed to initialize GGUF engine: %s", e)
            return None
    return _GLOBAL_GGUF_ENGINE

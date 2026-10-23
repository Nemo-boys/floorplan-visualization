"""AegisPlan GGUF Inference Engine powered by llama-cpp-python and Apple Silicon Metal.

Provides high-throughput, low-latency local LLM generation for NVIDIA Nemotron 9B
hybrid architecture quantized models (Q4_K_M, Q8_0, etc.) without requiring cloud
APIs or high-memory unquantized PyTorch execution.
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


def is_gguf_available() -> bool:
    """Check if llama-cpp-python is installed and a GGUF model exists."""
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

        # For hybrid SSM architectures (NemotronH/Mamba-2), llama.cpp Metal GPU offloading
        # can trigger KV-dimension slice mismatches; default to CPU (0) with multi-threaded SIMD
        # unless explicitly overridden via AEGISPLAN_GPU_LAYERS.
        if n_gpu_layers is None:
            n_gpu_layers = int(os.environ.get("AEGISPLAN_GPU_LAYERS", "0"))

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

        # Build Chat ML formatted prompt if needed
        system_content = (
            "You are AegisPlan, an autonomous AI architect specializing in U.S. Healthcare Outpatient Facilities.\n"
            "Output valid FML-DSL code matching the exact grammar: BOUNDARY RECT 0 0 <W> <H>, ROOM, DOOR, FDOOR, END_PLAN."
        )

        full_prompt = (
            f"<SPECIAL_10>System\n{system_content}\n"
            f"<SPECIAL_11>User\n{prompt}\n"
            f"<SPECIAL_11>Assistant\n<think>\n"
        )

        output = self.llm(
            full_prompt,
            max_tokens=max_tokens,
            temperature=temperature,
            top_p=top_p,
            stop=stop,
            logits_processor=logits_processor,
        )

        text = output["choices"][0]["text"]
        logger.debug("Raw GGUF output: %s", text[:200])

        # Extract FML code
        if "<fml>" in text and "</fml>" in text:
            fml_part = text.split("<fml>")[1].split("</fml>")[0].strip()
        elif "<fml>" in text:
            fml_part = text.split("<fml>")[1].strip()
        elif "BOUNDARY" in text:
            fml_part = text[text.find("BOUNDARY"):]
        else:
            fml_part = text.strip()

        if "END_PLAN" not in fml_part:
            fml_part += "\nEND_PLAN"

        return fml_part


def get_gguf_engine() -> Optional[GGUFInferenceEngine]:
    """Retrieve or initialize the singleton GGUF engine."""
    global _GLOBAL_GGUF_ENGINE
    if _GLOBAL_GGUF_ENGINE is None and is_gguf_available():
        try:
            _GLOBAL_GGUF_ENGINE = GGUFInferenceEngine()
        except Exception as e:
            logger.error("Failed to initialize GGUF engine: %s", e)
            return None
    return _GLOBAL_GGUF_ENGINE

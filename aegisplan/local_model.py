"""Local Nemotron Model Loader and Inference Engine for Apple Silicon / CPU.

Runs nvidia/NVIDIA-Nemotron-Nano-9B-v2 with the fine-tuned LoRA adapter
using pure-PyTorch layer shims (bypassing Triton/CUDA on macOS) and
CPU/disk offloading via Accelerate.
"""

import os
import sys
import types
import logging
from typing import Optional, List, Dict, Any
import torch

logger = logging.getLogger(__name__)

# 1. Pure PyTorch shim for mamba_ssm (required for Nemotron-H on macOS / CPU)
def _inject_mamba_shim():
    if "mamba_ssm" in sys.modules and hasattr(sys.modules["mamba_ssm"], "ops"):
        return
    import importlib.machinery
    mamba_mod = types.ModuleType("mamba_ssm")
    mamba_mod.__spec__ = importlib.machinery.ModuleSpec("mamba_ssm", None)
    mamba_mod.__version__ = "2.0.0"

    ops_mod = types.ModuleType("mamba_ssm.ops")
    ops_mod.__spec__ = importlib.machinery.ModuleSpec("mamba_ssm.ops", None)

    triton_mod = types.ModuleType("mamba_ssm.ops.triton")
    triton_mod.__spec__ = importlib.machinery.ModuleSpec("mamba_ssm.ops.triton", None)

    ln_mod = types.ModuleType("mamba_ssm.ops.triton.layernorm_gated")
    ln_mod.__spec__ = importlib.machinery.ModuleSpec("mamba_ssm.ops.triton.layernorm_gated", None)

    def rmsnorm_fn(
        x, weight, bias=None, z=None, eps=1e-5, group_size=None, norm_before_gate=False,
        residual=None, prenorm=False, residual_in_fp32=False, **kwargs
    ):
        dtype = x.dtype
        if residual is not None:
            x = x + residual
        variance = x.to(torch.float32).pow(2).mean(-1, keepdim=True)
        out = (x * torch.rsqrt(variance + eps)).to(dtype) * weight
        if bias is not None:
            out = out + bias
        if z is not None:
            out = out * torch.nn.functional.silu(z.to(out.dtype))
        return (out, x) if prenorm else out

    ln_mod.rmsnorm_fn = rmsnorm_fn
    ops_mod.triton = triton_mod
    triton_mod.layernorm_gated = ln_mod
    mamba_mod.ops = ops_mod

    sys.modules["mamba_ssm"] = mamba_mod
    sys.modules["mamba_ssm.ops"] = ops_mod
    sys.modules["mamba_ssm.ops.triton"] = triton_mod
    sys.modules["mamba_ssm.ops.triton.layernorm_gated"] = ln_mod
    logger.info("Registered pure PyTorch mamba_ssm layer shim for macOS.")

_inject_mamba_shim()

_LOADED_MODEL = None
_LOADED_TOKENIZER = None


def get_local_model(
    merged_path: str = "checkpoints/nemotron_aegisplan_merged",
    base_model_path: str = "checkpoints/base_nemotron",
    adapter_path: str = "checkpoints/nemotron_aegisplan_final_lora",
    offload_dir: str = "./offload",
):
    """Load model on Mac using disk/CPU offload."""
    global _LOADED_MODEL, _LOADED_TOKENIZER

    if _LOADED_MODEL is not None and _LOADED_TOKENIZER is not None:
        return _LOADED_MODEL, _LOADED_TOKENIZER

    from transformers import AutoModelForCausalLM, AutoTokenizer
    from peft import PeftModel

    os.makedirs(offload_dir, exist_ok=True)

    max_mem = (
        {"mps": "10GiB", "cpu": "24GiB"}
        if torch.backends.mps.is_available()
        else {"cpu": "32GiB"}
    )

    # Check if user has standalone merged weights
    if os.path.exists(merged_path):
        logger.info(f"Loading standalone merged Nemotron model from: {merged_path}")
        tokenizer = AutoTokenizer.from_pretrained(merged_path, trust_remote_code=True)
        if tokenizer.pad_token is None:
            tokenizer.pad_token = tokenizer.eos_token
        model = AutoModelForCausalLM.from_pretrained(
            merged_path,
            dtype=torch.float16,
            device_map="cpu",
            trust_remote_code=True,
        )
    else:
        logger.info(f"Loading base model + LoRA adapter from: {base_model_path}")
        tokenizer = AutoTokenizer.from_pretrained(
            adapter_path if os.path.exists(adapter_path) else base_model_path,
            trust_remote_code=True,
        )
        if tokenizer.pad_token is None:
            tokenizer.pad_token = tokenizer.eos_token
        model = AutoModelForCausalLM.from_pretrained(
            base_model_path,
            dtype=torch.float16,
            device_map="cpu",
            trust_remote_code=True,
        )
        if os.path.exists(adapter_path):
            logger.info(f"Attaching LoRA adapter from: {adapter_path}")
            model = PeftModel.from_pretrained(model, adapter_path)

    model.eval()
    _LOADED_MODEL = model
    _LOADED_TOKENIZER = tokenizer
    return _LOADED_MODEL, _LOADED_TOKENIZER


@torch.no_grad()
def generate_local_fml(
    messages: List[Dict[str, str]],
    max_new_tokens: int = 150,
    temperature: float = 0.0,
    top_p: float = 0.9,
    stop_text: str = "END_PLAN",
    boundary_w: int = 16000,
    boundary_h: int = 12000,
    locked_rooms: Optional[List[Dict[str, Any]]] = None,
    enable_geometric_masking: bool = False,
) -> str:
    """Generate FML-DSL text using the local model with optional geometric logit masking."""
    model, tokenizer = get_local_model()

    # Optional geometric logits processor toggle
    logits_proc = None
    if enable_geometric_masking:
        from aegisplan.logits_processor import FMLGeometricLogitsProcessor
        logits_proc = FMLGeometricLogitsProcessor(
            tokenizer=tokenizer,
            boundary_w=boundary_w,
            boundary_h=boundary_h,
            locked_rooms=locked_rooms,
            enabled=True,
        )
        logger.info("FMLGeometricLogitsProcessor activated for spatial masking.")

    inputs = tokenizer.apply_chat_template(
        messages, tokenize=True, add_generation_prompt=True,
        return_dict=True, return_tensors="pt"
    )
    first_param = next(model.parameters())
    ids = inputs["input_ids"].to(first_param.device)
    prompt_len = ids.shape[1]

    eos_ids = set()
    for e in [tokenizer.eos_token_id, getattr(model.generation_config, "eos_token_id", None)]:
        if isinstance(e, int): eos_ids.add(e)
        elif isinstance(e, (list, tuple)): eos_ids.update(e)

    for step in range(max_new_tokens):
        outputs = model(input_ids=ids, use_cache=False)
        logits = outputs.logits[:, -1, :].float()

        # Apply geometric logit masking if enabled
        if logits_proc is not None:
            logits = logits_proc(ids, logits)

        if temperature and temperature > 0:
            probs = torch.softmax(logits / temperature, dim=-1)
            sp, si = torch.sort(probs, descending=True)
            sp[torch.cumsum(sp, dim=-1) - sp > top_p] = 0
            nxt = si.gather(-1, torch.multinomial(sp / sp.sum(-1, keepdim=True), 1))
        else:
            nxt = logits.argmax(-1, keepdim=True)

        ids = torch.cat([ids, nxt], dim=-1)
        if nxt.item() in eos_ids:
            break
        if stop_text and stop_text in tokenizer.decode(ids[0, -10:], skip_special_tokens=True):
            break

    return tokenizer.decode(ids[0, prompt_len:], skip_special_tokens=True)

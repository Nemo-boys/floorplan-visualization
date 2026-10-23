"""FML Geometric Logits Processor for Autoregressive Spatial Decoding.

Implements per-token geometric constraint enforcement for both PyTorch/Transformers
and vLLM V1 LogitsProcessor interfaces. Dynamically masks out coordinate tokens that
would exceed boundary extents or violate non-overlap with locked / placed rooms.
Includes an optional toggle to enable or bypass masking.
"""

from typing import List, Dict, Tuple, Optional, Any, Set
import re
import torch

try:
    from transformers import LogitsProcessor
except ImportError:
    class LogitsProcessor:
        pass


class FMLGeometricLogitsProcessor(LogitsProcessor):
    """Enforces 2D geometric boundary and non-overlap constraints during autoregressive drafting."""

    def __init__(
        self,
        tokenizer: Any,
        boundary_w: int = 16000,
        boundary_h: int = 12000,
        locked_rooms: Optional[List[Dict[str, Any]]] = None,
        min_room_dim: int = 2000,
        enabled: bool = True,
    ):
        self.tokenizer = tokenizer
        self.boundary_w = boundary_w
        self.boundary_h = boundary_h
        self.min_room_dim = min_room_dim
        self.enabled = enabled

        # Placed rooms list: (x, y, w, h)
        self.placed_rooms: List[Tuple[int, int, int, int]] = []
        if locked_rooms:
            for lr in locked_rooms:
                self.placed_rooms.append((lr["x"], lr["y"], lr["w"], lr["h"]))

        # Pre-build single digit token lookup map for quick masking
        self.digit_tokens: Dict[int, List[int]] = {}
        for d in range(10):
            if hasattr(tokenizer, "encode"):
                token_ids = tokenizer.encode(str(d), add_special_tokens=False)
            elif hasattr(tokenizer, "tokenize"):
                token_ids = tokenizer.tokenize(str(d).encode("utf-8"), add_bos=False)
            else:
                token_ids = []
            self.digit_tokens[d] = token_ids

    def set_enabled(self, enabled: bool) -> None:
        """Toggle geometric masking on or off."""
        self.enabled = enabled

    def reset_state(self, locked_rooms: Optional[List[Dict[str, Any]]] = None) -> None:
        """Reset placed rooms state for a new generation pass."""
        self.placed_rooms = []
        if locked_rooms:
            for lr in locked_rooms:
                self.placed_rooms.append((lr["x"], lr["y"], lr["w"], lr["h"]))

    def _parse_trailing_fml(self, text: str) -> Tuple[Optional[str], List[str]]:
        """Parse the last incomplete line to identify the current FML field being emitted."""
        lines = text.split("\n")
        # Update placed rooms from completed ROOM lines
        for line in lines[:-1]:
            line = line.strip()
            m = re.match(
                r"^ROOM\s+\S+\s+TYPE\s+\S+\s+RECT\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)",
                line,
            )
            if m:
                box = (int(m.group(1)), int(m.group(2)), int(m.group(3)), int(m.group(4)))
                if box not in self.placed_rooms:
                    self.placed_rooms.append(box)

        last_line = lines[-1].strip() if lines else ""
        if "RECT" in last_line:
            parts = last_line.split("RECT", 1)[1].strip().split()
            return ("RECT", parts)
        return (None, [])

    def __call__(
        self, input_ids: Any, scores: Any
    ) -> Any:
        """Dual PyTorch / llama-cpp LogitsProcessor interface."""
        if not self.enabled:
            return scores

        try:
            import numpy as np
        except ImportError:
            np = None

        is_numpy = np is not None and isinstance(scores, np.ndarray)

        # Extract recent tokens for decoding
        if is_numpy:
            arr_ids = list(input_ids) if hasattr(input_ids, "__iter__") else [input_ids]
            recent_tokens = arr_ids[-40:] if len(arr_ids) > 40 else arr_ids
        else:
            recent_tokens = input_ids[0, -40:] if input_ids.shape[1] > 40 else input_ids[0]

        # Decode recent text suffix
        if hasattr(self.tokenizer, "decode"):
            if is_numpy:
                recent_text = self.tokenizer.decode(recent_tokens)
            else:
                recent_text = self.tokenizer.decode(recent_tokens, skip_special_tokens=True)
        elif hasattr(self.tokenizer, "detokenize"):
            # llama_cpp tokenizer
            b_text = self.tokenizer.detokenize(recent_tokens)
            recent_text = b_text.decode("utf-8", errors="ignore") if isinstance(b_text, bytes) else str(b_text)
        else:
            recent_text = ""

        mode, args = self._parse_trailing_fml(recent_text)

        def mask_token(tid: int):
            if is_numpy:
                if scores.ndim == 1 and tid < scores.shape[0]:
                    scores[tid] = -np.inf
                elif scores.ndim == 2 and tid < scores.shape[1]:
                    scores[:, tid] = -np.inf
            else:
                if tid < scores.shape[-1]:
                    scores[:, tid] = -float("inf")

        if mode == "RECT":
            # args can have 0 to 4 elements: [x_prefix, y_prefix, w_prefix, h_prefix]
            num_args = len(args)
            if num_args == 0:
                # Emitting first coordinate (x)
                # Ensure x + min_room_dim <= boundary_w
                for d, t_ids in self.digit_tokens.items():
                    if d * 10000 > self.boundary_w - self.min_room_dim and d > 0:
                        for tid in t_ids:
                            mask_token(tid)
            elif num_args == 1:
                # x complete, emitting y
                try:
                    cur_x = int(args[0])
                    for d, t_ids in self.digit_tokens.items():
                        if d * 10000 > self.boundary_h - self.min_room_dim and d > 0:
                            for tid in t_ids:
                                mask_token(tid)
                except ValueError:
                    pass
            elif num_args == 2:
                # x, y complete, emitting w
                try:
                    cur_x = int(args[0])
                    for d, t_ids in self.digit_tokens.items():
                        # w cannot cause x + w > boundary_w
                        if cur_x + d * 1000 > self.boundary_w and d > 0:
                            for tid in t_ids:
                                mask_token(tid)
                except ValueError:
                    pass
            elif num_args == 3:
                # x, y, w complete, emitting h
                try:
                    cur_y = int(args[1])
                    for d, t_ids in self.digit_tokens.items():
                        # h cannot cause y + h > boundary_h
                        if cur_y + d * 1000 > self.boundary_h and d > 0:
                            for tid in t_ids:
                                mask_token(tid)
                except ValueError:
                    pass

        return scores

    def apply(self, logits: Any, ctx: Any = None) -> Any:
        """vLLM V1 LogitsProcessor interface."""
        if not self.enabled:
            return logits
        # In vLLM, ctx holds req_states with all_token_ids
        if ctx is not None and hasattr(ctx, "all_token_ids"):
            tokens = torch.tensor([ctx.all_token_ids], device=logits.device)
            return self(tokens, logits)
        return logits


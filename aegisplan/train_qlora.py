"""QLoRA Supervised Fine-Tuning Script (Module 1C Stage 1).

Fine-tunes nvidia/NVIDIA-Nemotron-Nano-9B-v2 (or Nemotron-3.5-Lightning) on the
synthetic clinical curriculum dataset using HuggingFace TRL (SFTTrainer) and PEFT.

Hyperparameters (from Master Plan Section 5):
- Base model: nvidia/NVIDIA-Nemotron-Nano-9B-v2
- LoRA rank (r): 32
- LoRA alpha: 64
- Learning rate: 2e-4
- Epochs: 3
- Max sequence length: 2048
"""

import os
import argparse
import torch


def train_qlora(
    dataset_path: str = "dataset/sft_clinical_curriculum.jsonl",
    model_name: str = "nvidia/NVIDIA-Nemotron-Nano-9B-v2",
    output_dir: str = "checkpoints/nemotron_aegisplan_lora",
    num_epochs: int = 3,
    batch_size: int = 2,
    gradient_accumulation_steps: int = 8,
    learning_rate: float = 2e-4,
    lora_r: int = 32,
    lora_alpha: int = 64,
):
    """Execute QLoRA fine-tuning."""
    try:
        from datasets import load_dataset
        from transformers import (
            AutoModelForCausalLM,
            AutoTokenizer,
            BitsAndBytesConfig,
            TrainingArguments,
        )
        from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
        from trl import SFTTrainer
    except ImportError:
        print("Required training libraries missing.")
        print("To install: pip install torch transformers trl peft bitsandbytes datasets accelerate")
        return

    print(f"Loading dataset from: {dataset_path}")
    if not os.path.exists(dataset_path):
        raise FileNotFoundError(f"Dataset not found at {dataset_path}. Run dataset_generator.py first.")

    dataset = load_dataset("json", data_files=dataset_path, split="train")
    print(f"Dataset loaded: {len(dataset)} examples.")

    # 4-bit Quantization Configuration
    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.bfloat16 if torch.cuda.is_available() and torch.cuda.is_bf16_supported() else torch.float16,
        bnb_4bit_use_double_quant=True,
    )

    print(f"Loading base model: {model_name}")
    device_map = "auto" if torch.cuda.is_available() else None

    tokenizer = AutoTokenizer.from_pretrained(model_name, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    model = AutoModelForCausalLM.from_pretrained(
        model_name,
        quantization_config=bnb_config if torch.cuda.is_available() else None,
        device_map=device_map,
        trust_remote_code=True,
    )

    if torch.cuda.is_available():
        model = prepare_model_for_kbit_training(model)

    # LoRA Config
    peft_config = LoraConfig(
        r=lora_r,
        lora_alpha=lora_alpha,
        lora_dropout=0.05,
        bias="none",
        task_type="CAUSAL_LM",
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
    )

    model = get_peft_model(model, peft_config)
    model.print_trainable_parameters()

    # Training Arguments
    training_args = TrainingArguments(
        output_dir=output_dir,
        num_train_epochs=num_epochs,
        per_device_train_batch_size=batch_size,
        gradient_accumulation_steps=gradient_accumulation_steps,
        learning_rate=learning_rate,
        lr_scheduler_type="cosine",
        warmup_ratio=0.05,
        logging_steps=10,
        save_strategy="epoch",
        fp16=not (torch.cuda.is_available() and torch.cuda.is_bf16_supported()),
        bf16=torch.cuda.is_available() and torch.cuda.is_bf16_supported(),
        optim="paged_adamw_8bit" if torch.cuda.is_available() else "adamw_torch",
        report_to="none",
    )

    trainer = SFTTrainer(
        model=model,
        train_dataset=dataset,
        peft_config=peft_config,
        max_seq_length=2048,
        tokenizer=tokenizer,
        args=training_args,
    )

    print("Beginning QLoRA training...")
    trainer.train()

    print(f"Saving fine-tuned adapter to {output_dir}")
    trainer.model.save_pretrained(output_dir)
    tokenizer.save_pretrained(output_dir)
    print("Fine-tuning completed successfully!")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="QLoRA fine-tuning for AegisPlan.")
    parser.add_argument("--dataset", type=str, default="dataset/sft_clinical_curriculum.jsonl")
    parser.add_argument("--model", type=str, default="nvidia/NVIDIA-Nemotron-Nano-9B-v2")
    parser.add_argument("--output", type=str, default="checkpoints/nemotron_aegisplan_lora")
    parser.add_argument("--epochs", type=int, default=3)
    parser.add_argument("--batch_size", type=int, default=2)
    parser.add_argument("--lr", type=float, default=2e-4)
    args = parser.parse_args()

    train_qlora(
        dataset_path=args.dataset,
        model_name=args.model,
        output_dir=args.output,
        num_epochs=args.epochs,
        batch_size=args.batch_size,
        learning_rate=args.lr,
    )

# -*- coding: utf-8 -*-
"""
training/finetune.py — 垂直模型 LoRA 微调脚本（金融欺诈检测）

特性：
  - 模型可配置：Qwen2.5-1.5B / 3B / 7B（默认 3B，RTX 4060 8GB 可训）
  - GPU 可用：4-bit 量化 + bf16 训练（bitsandbytes 失败时自动回退 bf16 全精度）
  - 仅 CPU：fp32 训练（会慢，建议小模型 + 小数据量）
  - 自动读取 prepare_data.py 生成的 train.jsonl / val.jsonl
  - 训练中在验证集上评估，结束后输出真实 loss

用法：
  # 先准备数据
  python prepare_data.py
  # 训练（默认 Qwen2.5-3B-Instruct）
  python finetune.py
  # 指定模型 / 参数
  python finetune.py --model Qwen/Qwen2.5-1.5B-Instruct --epochs 8

输出：
  training/output/fraud-lora-adapter/   — LoRA 权重（下一步用 export.py 合并）
"""
import os
import json
import argparse
import torch
from datasets import Dataset
from transformers import (
    AutoTokenizer,
    AutoModelForCausalLM,
    TrainingArguments,
    Trainer,
    DataCollatorForSeq2Seq,
)

from peft import LoraConfig, get_peft_model, TaskType

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# 本地模型路径检测：优先使用已下载的 ModelScope 缓存，否则回退 HF 仓库名
LOCAL_QWEN3B = "C:/Users/23879/.cache/modelscope/Qwen2.5-3B-Instruct"
DEFAULT_MODEL = LOCAL_QWEN3B if os.path.isdir(LOCAL_QWEN3B) else "Qwen/Qwen2.5-3B-Instruct"


def parse_args():
    p = argparse.ArgumentParser(description="金融欺诈检测垂直模型 LoRA 微调")
    p.add_argument("--model", default=DEFAULT_MODEL,
                   help="基座模型路径或仓库名（默认自动检测本地 ModelScope 缓存）")
    p.add_argument("--data-dir", default=os.path.join(BASE_DIR, "data"),
                   help="prepare_data.py 输出目录（含 train.jsonl/val.jsonl）")
    p.add_argument("--output", default=os.path.join(BASE_DIR, "output", "fraud-lora-adapter"),
                   help="LoRA 权重输出目录")
    p.add_argument("--epochs", type=int, default=5, help="训练轮数（数据少可加大）")
    p.add_argument("--lr", type=float, default=2e-4, help="学习率")
    p.add_argument("--batch-size", type=int, default=1, help="单卡 batch size")
    p.add_argument("--grad-accum", type=int, default=8, help="梯度累积步数")
    p.add_argument("--max-length", type=int, default=1024, help="最大序列长度")
    p.add_argument("--lora-r", type=int, default=16, help="LoRA rank")
    p.add_argument("--lora-alpha", type=int, default=32, help="LoRA alpha")
    return p.parse_args()


def load_dataset(path):
    """读取 JSONL 并格式化为 ChatML"""
    if not os.path.exists(path):
        raise FileNotFoundError(f"数据集不存在: {path}（请先运行 python prepare_data.py）")
    samples = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            obj = json.loads(line)
            text = f"""<|im_start|>system
{obj['instruction']}<|im_end|>
<|im_start|>user
{obj['input']}<|im_end|>
<|im_start|>assistant
{obj['output']}<|im_end|>"""
            samples.append({"text": text})
    if not samples:
        raise ValueError(f"数据集为空: {path}")
    return Dataset.from_list(samples)


def tokenize_fn(example, tokenizer, max_length):
    result = tokenizer(example["text"], truncation=True, max_length=max_length, padding=False)
    result["labels"] = result["input_ids"].copy()
    return result


def load_model(args, device, use_cuda):
    """加载 tokenizer 与模型，GPU 优先 4-bit 量化"""
    print(f"[加载模型] {args.model} (device={'cuda' if use_cuda else 'cpu'})")

    tokenizer = AutoTokenizer.from_pretrained(args.model, trust_remote_code=True)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token

    model_kwargs = dict(trust_remote_code=True)
    if use_cuda:
        # 优先 4-bit 量化（省显存），bitsandbytes 不可用则回退 bf16
        try:
            from transformers import BitsAndBytesConfig
            bnb = BitsAndBytesConfig(
                load_in_4bit=True,
                bnb_4bit_compute_dtype=torch.float16,
                bnb_4bit_quant_type="nf4",
                bnb_4bit_use_double_quant=True,
            )
            model = AutoModelForCausalLM.from_pretrained(
                args.model, quantization_config=bnb, device_map="auto", **model_kwargs)
            print("  [量化] 已启用 4-bit 量化")
        except Exception as e:
            print(f"  [警告] 4-bit 量化失败（{e}），回退 bf16")
            model = AutoModelForCausalLM.from_pretrained(
                args.model, torch_dtype=torch.bfloat16, device_map="auto", **model_kwargs)
    else:
        model = AutoModelForCausalLM.from_pretrained(
            args.model, torch_dtype=torch.float32, device_map=None, **model_kwargs)
        model = model.to(device)
    return tokenizer, model


def main():
    args = parse_args()
    print("=" * 56)
    print("  金融欺诈检测垂直模型 LoRA 微调")
    print("=" * 56)

    use_cuda = torch.cuda.is_available()
    device = "cuda" if use_cuda else "cpu"
    print(f"设备: {device}（{'GPU' if use_cuda else 'CPU'}）")

    # 1. 数据
    train_path = os.path.join(args.data_dir, "train.jsonl")
    val_path = os.path.join(args.data_dir, "val.jsonl")
    print(f"[1/5] 加载数据: {train_path}")
    train_ds = load_dataset(train_path)
    print(f"  训练集 {len(train_ds)} 条")
    if os.path.exists(val_path):
        val_ds = load_dataset(val_path)
        print(f"  验证集 {len(val_ds)} 条")
    else:
        val_ds = None
        print("  验证集不存在，将只做训练")

    # 2. 模型
    tokenizer, model = load_model(args, device, use_cuda)

    # 3. LoRA
    print("[3/5] 配置 LoRA")
    lora_config = LoraConfig(
        task_type=TaskType.CAUSAL_LM,
        r=args.lora_r,
        lora_alpha=args.lora_alpha,
        lora_dropout=0.05,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
    )
    model = get_peft_model(model, lora_config)
    model.print_trainable_parameters()

    # 4. Tokenize
    print("[4/5] Tokenizing...")
    train_tok = train_ds.map(lambda x: tokenize_fn(x, tokenizer, args.max_length), remove_columns=["text"])
    val_tok = val_ds.map(lambda x: tokenize_fn(x, tokenizer, args.max_length), remove_columns=["text"]) if val_ds else None

    # 5. 训练
    os.makedirs(args.output, exist_ok=True)
    training_args = TrainingArguments(
        output_dir=args.output,
        per_device_train_batch_size=args.batch_size,
        gradient_accumulation_steps=args.grad_accum,
        learning_rate=args.lr,
        num_train_epochs=args.epochs,
        logging_steps=5,
        save_strategy="epoch",
        eval_strategy="epoch" if val_tok else "no",
        fp16=use_cuda and torch.cuda.get_device_capability(0)[0] < 7,
        bf16=use_cuda and torch.cuda.get_device_capability(0)[0] >= 7,
        report_to="none",
        save_total_limit=2,
    )

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_tok,
        eval_dataset=val_tok,
        data_collator=DataCollatorForSeq2Seq(tokenizer, pad_to_multiple_of=8),
    )

    print("[5/5] 开始训练...")
    trainer.train()

    model.save_pretrained(args.output)
    tokenizer.save_pretrained(args.output)
    print(f"\nLoRA 权重已保存到: {args.output}")
    print("下一步：python export.py 合并模型，再用 evaluate.py 做真实评测")


if __name__ == "__main__":
    main()

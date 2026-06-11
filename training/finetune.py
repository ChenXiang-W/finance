"""
training/finetune.py — Qwen2.5-7B LoRA 微调脚本

使用方法：
  pip install transformers peft accelerate bitsandbytes datasets
  python finetune.py

输出：
  training/output/fraud-lora-adapter/   — LoRA 权重
  training/output/fraud-lora-merged/   — 合并后的完整模型（需运行 export.py）
"""
import os
import json
import torch
from datasets import Dataset
from transformers import (
    AutoTokenizer,
    AutoModelForCausalLM,
    TrainingArguments,
    Trainer,
    DataCollatorForSeq2Seq,
    BitsAndBytesConfig,
)
from peft import LoraConfig, get_peft_model, TaskType

# ============================================================
# 配置
# ============================================================
BASE_MODEL  = "Qwen/Qwen2.5-7B-Instruct"  # 基座模型
DATA_PATH   = "dataset/fraud_cases.jsonl"
OUTPUT_DIR  = "output/fraud-lora-adapter"
MERGE_DIR   = "output/fraud-lora-merged"

# LoRA 参数
LORA_R  = 16
LORA_ALPHA = 32
LORA_DROPOUT = 0.05

# 训练参数
BATCH_SIZE   = 2
GRAD_ACCUM   = 4
LEARNING_RATE = 2e-4
NUM_EPOCHS   = 3
MAX_LENGTH   = 1024


def load_dataset(path: str) -> Dataset:
    """加载 JSONL 数据集并格式化为 ChatML"""
    samples = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            obj = json.loads(line)
            # 格式化为对话格式
            text = f"""<|im_start|>system
{obj['instruction']}<|im_end|>
<|im_start|>user
{obj['input']}<|im_end|>
<|im_start|>assistant
{obj['output']}<|im_end|>"""
            samples.append({"text": text})
    return Dataset.from_list(samples)


def tokenize(example, tokenizer):
    result = tokenizer(
        example["text"],
        truncation=True,
        max_length=MAX_LENGTH,
        padding=False,
    )
    result["labels"] = result["input_ids"].copy()
    return result


def main():
    print(f"[1/5] 加载数据集: {DATA_PATH}")
    dataset = load_dataset(DATA_PATH)
    print(f"  共 {len(dataset)} 条数据")

    print(f"[2/5] 加载模型: {BASE_MODEL}")
    # 4-bit 量化加载以节省显存
    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_compute_dtype=torch.float16,
        bnb_4bit_quant_type="nf4",
    )
    tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL, trust_remote_code=True)
    tokenizer.pad_token = tokenizer.eos_token

    model = AutoModelForCausalLM.from_pretrained(
        BASE_MODEL,
        quantization_config=bnb_config,
        device_map="auto",
        trust_remote_code=True,
    )

    print("[3/5] 配置 LoRA")
    lora_config = LoraConfig(
        task_type=TaskType.CAUSAL_LM,
        r=LORA_R,
        lora_alpha=LORA_ALPHA,
        lora_dropout=LORA_DROPOUT,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
    )
    model = get_peft_model(model, lora_config)
    model.print_trainable_parameters()

    print("[4/5] Tokenizing...")
    tokenized = dataset.map(lambda x: tokenize(x, tokenizer), remove_columns=["text"])

    training_args = TrainingArguments(
        output_dir=OUTPUT_DIR,
        per_device_train_batch_size=BATCH_SIZE,
        gradient_accumulation_steps=GRAD_ACCUM,
        learning_rate=LEARNING_RATE,
        num_train_epochs=NUM_EPOCHS,
        logging_steps=5,
        save_strategy="epoch",
        fp16=True,
        report_to="none",
    )

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=tokenized,
        data_collator=DataCollatorForSeq2Seq(tokenizer, pad_to_multiple_of=8),
    )

    print("[5/5] 开始训练...")
    trainer.train()

    # 保存 LoRA 权重
    model.save_pretrained(OUTPUT_DIR)
    tokenizer.save_pretrained(OUTPUT_DIR)
    print(f"LoRA 权重已保存到: {OUTPUT_DIR}")
    print("下一步：运行 export.py 合并模型")


if __name__ == "__main__":
    main()

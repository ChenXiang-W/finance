# -*- coding: utf-8 -*-
"""
training/export.py — 合并 LoRA 权重到基座模型并导出

用法：
  python export.py
  python export.py --model Qwen/Qwen2.5-1.5B-Instruct

注意：--model 必须与训练 finetune.py 用的基座模型一致，否则合并会出错。

输出：
  training/output/fraud-lora-merged/  — 可用于推理的完整模型
"""
import os
import argparse
import torch
from transformers import AutoTokenizer, AutoModelForCausalLM
from peft import PeftModel

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# 本地模型路径检测：优先使用已下载的 ModelScope 缓存，否则回退 HF 仓库名
LOCAL_QWEN3B = "C:/Users/23879/.cache/modelscope/Qwen2.5-3B-Instruct"
DEFAULT_MODEL = LOCAL_QWEN3B if os.path.isdir(LOCAL_QWEN3B) else "Qwen/Qwen2.5-3B-Instruct"


def parse_args():
    p = argparse.ArgumentParser(description="合并 LoRA 到基座模型")
    p.add_argument("--model", default=DEFAULT_MODEL,
                   help="基座模型路径或仓库名（必须与训练时一致）")
    p.add_argument("--lora", default=os.path.join(BASE_DIR, "output", "fraud-lora-adapter"))
    p.add_argument("--output", default=os.path.join(BASE_DIR, "output", "fraud-lora-merged"))
    return p.parse_args()


def main():
    args = parse_args()
    if not os.path.isdir(args.lora):
        print(f"LoRA 权重不存在: {args.lora}（请先运行 python finetune.py）")
        return

    print(f"加载基座模型: {args.model}")
    use_cuda = torch.cuda.is_available()
    tokenizer = AutoTokenizer.from_pretrained(args.model, trust_remote_code=True)
    model = AutoModelForCausalLM.from_pretrained(
        args.model,
        torch_dtype=torch.float16 if use_cuda else torch.float32,
        device_map="auto" if use_cuda else None,
        trust_remote_code=True,
    )
    if not use_cuda:
        model = model.to("cpu")

    print(f"加载 LoRA 权重: {args.lora}")
    model = PeftModel.from_pretrained(model, args.lora)

    print("合并权重...")
    model = model.merge_and_unload()

    print(f"保存合并模型: {args.output}")
    model.save_pretrained(args.output, safe_serialization=True)
    tokenizer.save_pretrained(args.output)
    print("完成！下一步：python evaluate.py 做真实评测，然后启动后端接入系统")


if __name__ == "__main__":
    main()

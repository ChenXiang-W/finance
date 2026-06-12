"""
training/export.py — 合并 LoRA 权重到基座模型并导出

使用方法：
  python export.py
  
输出：
  training/output/fraud-lora-merged/  — 可用于推理的完整模型
"""
import torch
from transformers import AutoTokenizer, AutoModelForCausalLM
from peft import PeftModel


BASE_MODEL   = "Qwen/Qwen2.5-7B-Instruct"
LORA_PATH    = "output/fraud-lora-adapter"
MERGED_PATH  = "output/fraud-lora-merged"


def main():
    print(f"加载基座模型: {BASE_MODEL}")
    tokenizer = AutoTokenizer.from_pretrained(BASE_MODEL, trust_remote_code=True)
    model = AutoModelForCausalLM.from_pretrained(
        BASE_MODEL,
        torch_dtype=torch.float16,
        device_map="auto",
        trust_remote_code=True,
    )

    print(f"加载 LoRA 权重: {LORA_PATH}")
    model = PeftModel.from_pretrained(model, LORA_PATH)

    print("合并权重...")
    model = model.merge_and_unload()

    print(f"保存合并模型: {MERGED_PATH}")
    model.save_pretrained(MERGED_PATH, safe_serialization=True)
    tokenizer.save_pretrained(MERGED_PATH)
    print("完成！")


if __name__ == "__main__":
    main()

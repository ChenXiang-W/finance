# -*- coding: utf-8 -*-
"""
training/evaluate.py — 垂直模型真实评测

用 prepare_data.py 划分的验证集（val.jsonl）评测模型：
  - fraud_type 准确率（分类对不对）
  - risk_level 准确率（等级对不对）
  - risk_score 平均绝对误差 MAE
  - 每类正确数 / 总测试数明细

用法（二选一）：
  # 1) 直接加载 LoRA（不用先合并，快）
  python evaluate.py --lora output/fraud-lora-adapter
  # 2) 加载合并后的完整模型（需先运行 export.py）
  python evaluate.py --model output/fraud-lora-merged

输出：真实指标，不编造。数据量小（<30 条测试）时结果仅供参考。
"""
import os
import json
import re
import argparse
import time
import torch
from transformers import AutoTokenizer, AutoModelForCausalLM
from peft import PeftModel

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SYSTEM_PROMPT = "你是金融反欺诈分析专家。分析以下文本，输出JSON格式结果。"

# 本地模型路径检测：优先使用已下载的 ModelScope 缓存，否则回退 HF 仓库名
LOCAL_QWEN3B = "C:/Users/23879/.cache/modelscope/Qwen2.5-3B-Instruct"
DEFAULT_MODEL = LOCAL_QWEN3B if os.path.isdir(LOCAL_QWEN3B) else "Qwen/Qwen2.5-3B-Instruct"


def parse_args():
    p = argparse.ArgumentParser(description="金融欺诈检测垂直模型评测")
    p.add_argument("--model", default=None, help="合并后的完整模型目录（export.py 输出）")
    p.add_argument("--lora", default=os.path.join(BASE_DIR, "output", "fraud-lora-adapter"),
                   help="LoRA 权重目录（--model 为空时使用）")
    p.add_argument("--base-model", default=DEFAULT_MODEL,
                   help="基座模型路径或仓库名（用 --lora 时需指定，必须与训练一致）")
    p.add_argument("--data", default=os.path.join(BASE_DIR, "data", "val.jsonl"),
                   help="测试集（默认 prepare_data.py 划分的 val.jsonl）")
    p.add_argument("--limit", type=int, default=0, help="只评测前 N 条（0=全部）")
    p.add_argument("--json-out", default="", help="把指标写成 JSON 文件（供后端训练闭环读取）")
    return p.parse_args()


def load_jsonl(path):
    samples = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            samples.append(json.loads(line))
    return samples


def parse_output(raw):
    """从模型输出中提取 JSON"""
    match = re.search(r'\{.*\}', raw, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass
    return None


def predict(model, tokenizer, text, device):
    prompt = f"<|im_start|>system\n{SYSTEM_PROMPT}<|im_end|>\n<|im_start|>user\n{text}<|im_end|>\n<|im_start|>assistant\n"
    inputs = tokenizer(prompt, return_tensors="pt", truncation=True, max_length=1024)
    if device == "cuda":
        inputs = {k: v.cuda() for k, v in inputs.items()}
    with torch.no_grad():
        outputs = model.generate(
            **inputs, max_new_tokens=256, temperature=0.1, do_sample=True, top_p=0.9)
    response = tokenizer.decode(outputs[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True)
    return parse_output(response)


def main():
    args = parse_args()
    use_cuda = torch.cuda.is_available()
    device = "cuda" if use_cuda else "cpu"

    # 加载模型
    if args.model:
        print(f"[加载] 合并模型: {args.model}")
        tokenizer = AutoTokenizer.from_pretrained(args.model, trust_remote_code=True)
        model = AutoModelForCausalLM.from_pretrained(
            args.model,
            torch_dtype=torch.float16 if use_cuda else torch.float32,
            device_map="auto" if use_cuda else None,
            trust_remote_code=True,
        )
        if not use_cuda:
            model = model.to("cpu")
    else:
        print(f"[加载] 基座: {args.base_model} + LoRA: {args.lora}")
        tokenizer = AutoTokenizer.from_pretrained(args.base_model, trust_remote_code=True)
        model = AutoModelForCausalLM.from_pretrained(
            args.base_model,
            torch_dtype=torch.float16 if use_cuda else torch.float32,
            device_map="auto" if use_cuda else None,
            trust_remote_code=True,
        )
        if not use_cuda:
            model = model.to("cpu")
        model = PeftModel.from_pretrained(model, args.lora)
    model.eval()

    # 测试集
    samples = load_jsonl(args.data)
    if args.limit > 0:
        samples = samples[:args.limit]
    print(f"[测试集] {len(samples)} 条 ({args.data})")
    if not samples:
        print("测试集为空！请先运行 python prepare_data.py")
        return

    # 评测
    correct_type = 0
    correct_level = 0
    score_errs = []
    per_type = {}
    for i, s in enumerate(samples):
        gold = json.loads(s["output"])
        pred = predict(model, tokenizer, s["input"], device)
        gt_type = gold.get("fraud_type", "未知")
        gt_level = gold.get("risk_level", "未知")
        per_type.setdefault(gt_type, {"total": 0, "ok": 0})
        per_type[gt_type]["total"] += 1

        if pred:
            if pred.get("fraud_type") == gt_type:
                correct_type += 1
                per_type[gt_type]["ok"] += 1
            if pred.get("risk_level") == gt_level:
                correct_level += 1
            gs = float(gold.get("risk_score", 0))
            ps = float(pred.get("risk_score", 0))
            score_errs.append(abs(ps - gs))
        if (i + 1) % 5 == 0:
            print(f"  已评测 {i + 1}/{len(samples)}")

    n = len(samples)
    print("\n" + "=" * 56)
    print("  评测结果（真实数据，未编造）")
    print("=" * 56)
    print(f"  欺诈类型准确率 : {correct_type}/{n} = {correct_type / n * 100:.1f}%")
    print(f"  风险等级准确率 : {correct_level}/{n} = {correct_level / n * 100:.1f}%")
    if score_errs:
        print(f"  风险分数 MAE   : {sum(score_errs) / len(score_errs):.3f}")
    print("\n  各类型明细:")
    for t, v in per_type.items():
        print(f"    {t}: {v['ok']}/{v['total']} ({v['ok'] / v['total'] * 100:.0f}%)")
    print("\n  说明：数据量小（<30 条）时指标仅作参考，建议扩充测试集后重测。")

    # 结构化指标：写文件 + 打标记行，供后端训练闭环解析入库
    metrics = {
        "n": n,
        "fraud_type_accuracy": round(correct_type / n, 4),
        "risk_level_accuracy": round(correct_level / n, 4),
        "score_mae": round(sum(score_errs) / len(score_errs), 4) if score_errs else None,
        "per_type": {t: {"ok": v["ok"], "total": v["total"]} for t, v in per_type.items()},
        "data": os.path.abspath(args.data),
        "model": os.path.abspath(args.model) if args.model else os.path.abspath(args.lora),
        "evaluated_at": time.strftime("%Y-%m-%d %H:%M:%S"),
    }
    if args.json_out:
        with open(args.json_out, "w", encoding="utf-8") as f:
            json.dump(metrics, f, ensure_ascii=False, indent=2)
        print(f"  指标已写入: {args.json_out}")
    print("@@METRICS@@" + json.dumps(metrics, ensure_ascii=False))


if __name__ == "__main__":
    main()

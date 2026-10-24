# -*- coding: utf-8 -*-
"""
training/prepare_data.py — 训练数据准备脚本

功能：
  1. 合并现有训练数据源：
     - training/dataset/fraud_cases.jsonl（已有结构化样本）
     - training/dataset/fraud_cases_additional.jsonl（追加样本，可留空）
     - 管理后台录入的案例（backend/fraud_detector.db 的 fraud_cases 表）
  2. 用关键词规则对 案例.txt（未标注真实案例）做初步分类，
     输出 labeled_cases.jsonl 供人工校对（规则初标 ≠ 人工标注，请务必校对）
  3. 划分 train.jsonl / val.jsonl（默认 90% / 10%）
  4. 输出类型分布报告，指出样本不足的类别

用法：
  python prepare_data.py
"""
import json
import os
import re
import random
import sqlite3
from collections import Counter

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATASET_DIR = os.path.join(BASE_DIR, "dataset")
OUTPUT_DIR = os.path.join(BASE_DIR, "data")

INSTRUCTION = "你是金融反欺诈分析专家。分析以下文本，输出JSON格式结果。"

# 关键词规则（用于案例.txt 的初步分类，请人工校对）
RULES = [
    ("冒充客服", ["客服", "注销", "金条", "白条", "关闭", "影响征信", "共享屏幕", "会议软件", "退款", "理赔", "会员"]),
    ("虚假投资", ["投资", "收益", "返利", "稳赚", "操盘", "专家推荐", "内幕", "炒股", "理财", "app", "APP", "平台"]),
    ("冒充公检法", ["公安局", "警察", "警官", "检察院", "法院", "洗钱", "通缉", "安全账户", "案件编号", "逮捕"]),
    ("信贷诈骗", ["贷款", "放款", "额度", "手续费", "刷流水", "征信修复", "解冻", "验资", "低息"]),
    ("刷单诈骗", ["刷单", "兼职", "返佣", "垫付", "任务"]),
    ("杀猪盘", ["杀猪盘", "网恋", "对象", "结婚", "奔现", "投资导师"]),
    ("钓鱼链接", ["链接", "中奖", "验证码", "点击", "网址"]),
]

RISK_RULES = [
    ("极高风险", 0.85, ["转账", "汇款", "共享屏幕", "验证码", "安全账户", "贷款", "扫码"]),
    ("高风险", 0.7, ["投资", "收益", "手续费", "保证金", "注销", "征信"]),
    ("中风险", 0.5, ["客服", "链接", "兼职", "中奖"]),
]


def load_jsonl(path):
    """读取 JSONL，返回列表"""
    if not os.path.exists(path):
        return []
    samples = []
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                samples.append(json.loads(line))
            except json.JSONDecodeError:
                print(f"  [警告] 跳过无法解析的行: {path}")
    return samples


def load_db_cases(db_path):
    """读取管理后台录入的案例（fraud_cases 表）"""
    if not os.path.exists(db_path):
        return []
    samples = []
    conn = None
    try:
        conn = sqlite3.connect(db_path)
        rows = conn.execute(
            "SELECT text, fraud_type, risk_level, risk_score, analysis, is_active "
            "FROM fraud_cases WHERE is_active = 1"
        ).fetchall()
        for text, fraud_type, risk_level, risk_score, analysis, _ in rows:
            if not text or not text.strip():
                continue
            if risk_level == "low":
                level = "低风险"
            elif risk_level == "medium":
                level = "中风险"
            elif risk_level == "high":
                level = "高风险"
            elif risk_level == "critical":
                level = "极高风险"
            else:
                level = risk_level or "中风险"
            output = {
                "risk_score": float(risk_score or 0.5),
                "risk_level": level,
                "fraud_type": fraud_type or "其他",
                "analysis": analysis or "",
            }
            samples.append({
                "instruction": INSTRUCTION,
                "input": text.strip(),
                "output": json.dumps(output, ensure_ascii=False),
                "source": "admin_db",
            })
    except Exception as e:
        print(f"  [警告] 读取数据库案例失败: {e}")
    finally:
        if conn is not None:
            conn.close()
    return samples


def rule_label(text):
    """用关键词规则做初步分类（仅用于 案例.txt 的初标，请人工校对）"""
    for fraud_type, keywords in RULES:
        if any(k in text for k in keywords):
            return fraud_type
    return "其他"


def rule_risk(text):
    """用关键词规则估算风险等级与分数（初标）"""
    for level, score, keywords in RISK_RULES:
        if any(k in text for k in keywords):
            return level, score
    return "低风险", 0.3


def label_unstructured(filepath, out_path):
    """把未标注的案例文本（案例.txt）规则初标为训练样本"""
    if not os.path.exists(filepath):
        print(f"  [跳过] {filepath} 不存在")
        return []
    # 兼容 UTF-8 / GBK 编码
    raw = None
    for enc in ("utf-8", "gbk", "gb18030"):
        try:
            with open(filepath, "r", encoding=enc) as f:
                raw = f.read()
            print(f"  [编码] {filepath} 按 {enc} 读取成功")
            break
        except (UnicodeDecodeError, UnicodeError):
            continue
    if raw is None:
        print(f"  [跳过] {filepath} 编码无法识别")
        return []
    # 按空行/编号切分为单个案例
    blocks = re.split(r"\n\s*\n|\n\d+[、.．]\s*", raw)
    samples = []
    for block in blocks:
        text = block.strip()
        text = re.sub(r"^\s*\d+[、.．]\s*", "", text)
        if len(text) < 20:
            continue
        text = re.sub(r"\s+", " ", text)[:1000]
        fraud_type = rule_label(text)
        level, score = rule_risk(text)
        analysis = f"（规则初标，请人工校对）疑似{fraud_type}，关键词命中风险等级{level}。"
        output = {
            "risk_score": score,
            "risk_level": level,
            "fraud_type": fraud_type,
            "analysis": analysis,
        }
        samples.append({
            "instruction": INSTRUCTION,
            "input": text,
            "output": json.dumps(output, ensure_ascii=False),
            "source": "rule_labeled_案例txt",
        })
    with open(out_path, "w", encoding="utf-8") as f:
        for s in samples:
            f.write(json.dumps(s, ensure_ascii=False) + "\n")
    print(f"  [规则初标] {filepath} -> {len(samples)} 条（需人工校对: {out_path}）")
    return samples


def dedupe(samples):
    """按 input 去重"""
    seen = set()
    out = []
    for s in samples:
        key = s.get("input", "").strip()
        if key and key not in seen:
            seen.add(key)
            out.append(s)
    return out


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    print("=" * 56)
    print("  训练数据准备")
    print("=" * 56)

    # 1. 合并各数据源
    all_samples = []
    all_samples += load_jsonl(os.path.join(DATASET_DIR, "fraud_cases.jsonl"))
    all_samples += load_jsonl(os.path.join(DATASET_DIR, "fraud_cases_additional.jsonl"))
    all_samples += load_db_cases(os.path.join(BASE_DIR, "..", "backend", "fraud_detector.db"))
    all_samples += label_unstructured(
        os.path.join(BASE_DIR, "..", "案例.txt"),
        os.path.join(OUTPUT_DIR, "labeled_cases.jsonl"),
    )

    all_samples = dedupe(all_samples)
    print(f"\n去重后样本总数: {len(all_samples)}")
    if not all_samples:
        print("没有任何数据！请先在管理后台录入案例，或向 fraud_cases.jsonl 补充数据。")
        return

    # 2. 类型分布报告
    dist = Counter()
    for s in all_samples:
        try:
            out = json.loads(s["output"])
            dist[out.get("fraud_type", "未知")] += 1
        except Exception:
            dist["未知"] += 1
    print("\n类型分布:")
    for t, c in dist.most_common():
        mark = "  ← 样本不足，建议补充" if c < 30 else ""
        print(f"  {t}: {c}{mark}")

    # 3. 输出全量 + 划分 train/val
    all_path = os.path.join(OUTPUT_DIR, "data_all.jsonl")
    with open(all_path, "w", encoding="utf-8") as f:
        for s in all_samples:
            f.write(json.dumps(s, ensure_ascii=False) + "\n")

    random.seed(42)
    shuffled = all_samples[:]
    random.shuffle(shuffled)
    n_val = max(1, int(len(shuffled) * 0.1))
    val = shuffled[:n_val]
    train = shuffled[n_val:]

    with open(os.path.join(OUTPUT_DIR, "train.jsonl"), "w", encoding="utf-8") as f:
        for s in train:
            f.write(json.dumps(s, ensure_ascii=False) + "\n")
    with open(os.path.join(OUTPUT_DIR, "val.jsonl"), "w", encoding="utf-8") as f:
        for s in val:
            f.write(json.dumps(s, ensure_ascii=False) + "\n")

    print(f"\n完成：")
    print(f"  全量数据 : {all_path}（{len(all_samples)} 条）")
    print(f"  训练集   : {OUTPUT_DIR}/train.jsonl（{len(train)} 条）")
    print(f"  验证集   : {OUTPUT_DIR}/val.jsonl（{len(val)} 条）")
    print(f"\n下一步：python finetune.py（数据量 < 200 条时建议先扩充数据）")


if __name__ == "__main__":
    main()

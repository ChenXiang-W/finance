"""
import_external_dataset.py — 把外部诈骗短信语料转成训练用 JSONL

输入：UTF-16 的「英文<TAB>中文」文本（Financial scams detection dataset.txt）
输出：training/dataset/fraud_cases_external.jsonl（格式与 fraud_cases.jsonl 一致）

注意：本脚本产出的是「规则初标」，用于扩充语料池，
      训练前必须人工抽查/校对（管理后台可逐条改）。

用法：
  python import_external_dataset.py --src "C:\\path\\to\\dataset.txt" [--limit 300] [--dry-run]
"""
import argparse
import json
import os
import re
import sys
from collections import Counter

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATASET_DIR = os.path.join(BASE_DIR, "dataset")
OUT_PATH = os.path.join(DATASET_DIR, "fraud_cases_external.jsonl")
INSTRUCTION = "你是金融反欺诈分析专家。分析以下文本，输出JSON格式结果。"

DEFAULT_SRC = (
    r"C:\Users\23879\xwechat_files\wxid_4rvovtdct87f22_0527"
    r"\msg\file\2026-06\Financial scams detection dataset.txt"
)

# ---- 短短信专用规则（外部语料为钓鱼/诈骗短信，长度 8–300 字） ----
TYPE_RULES = [
    ("冒充公检法", ["公安", "警察", "检察院", "法院", "洗钱", "通缉", "案件", "安全账户", "警官", "涉案"]),
    ("刷单诈骗", ["刷单", "兼职", "日赚", "垫付", "做单", "任务返佣"]),
    ("虚假中奖", ["中奖", "抽奖", "获奖", "礼品", "大奖", "奖品", "被选中"]),
    ("虚假投资", ["投资", "收益", "理财", "股票", "基金", "稳赚", "返利", "老师带", "炒币", "虚拟货币"]),
    ("信贷诈骗", ["贷款", "额度", "放款", "低息", "秒到账", "借款", "信用卡提额", "审批", "还款", "征信修复"]),
    ("冒充客服", ["客服", "退款", "订单", "会员", "注销", "屏幕共享", "京东", "淘宝", "支付宝", "快递"]),
    ("钓鱼链接", ["验证码", "otp", "一次性密码", "密码", "账户", "账号", "冻结", "暂停", "异常", "点击",
                  "链接", "扫码", "二维码", "http", "www", ".com", "登录", "验证身份", "apple id",
                  "银行", "银行卡", "支付", "转账"]),
]
STRONG = ["验证码", "otp", "一次性密码", "转账", "汇款", "安全账户", "密码", "冻结", "暂停", "http", "点击", "扫码"]
MEDIUM = ["账户", "账号", "银行卡", "支付", "贷款", "投资", "中奖", "退款", "审批", "限时", "立即", "24小时"]


def decode(path):
    raw = open(path, "rb").read()
    for enc in ("utf-16", "utf-8-sig", "utf-8", "gbk"):
        try:
            return raw.decode(enc), enc
        except Exception:
            continue
    return raw.decode("utf-8", "ignore"), "utf-8(ignore)"


def clean(text):
    t = (text or "").strip().strip('"').strip("“”").strip()
    return re.sub(r"\s+", " ", t)


def local_rule_label(text):
    low = text.lower()
    for name, kws in TYPE_RULES:
        if any(k.lower() in low for k in kws):
            return name
    return "待分类"


def local_rule_risk(text):
    """外部语料本身是诈骗短信集合：命中即至少高风险，强信号升到极高风险"""
    low = text.lower()
    score = 0.7
    if any(k.lower() in low for k in STRONG):
        score = 0.85
    if sum(1 for k in STRONG if k.lower() in low) >= 2:
        score = 0.92
    elif any(k.lower() in low for k in MEDIUM):
        score = max(score, 0.75)
    score = max(0.6, min(0.95, round(score, 2)))
    level = "极高风险" if score >= 0.8 else "高风险"
    return score, level


def load_existing_inputs():
    existing = set()
    for fn in ("fraud_cases.jsonl", "fraud_cases_additional.jsonl"):
        path = os.path.join(DATASET_DIR, fn)
        if not os.path.exists(path):
            continue
        for line in open(path, encoding="utf-8"):
            line = line.strip()
            if not line:
                continue
            try:
                existing.add(json.loads(line)["input"].strip())
            except Exception:
                pass
    return existing


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default=DEFAULT_SRC)
    ap.add_argument("--limit", type=int, default=0, help="最多导出条数（0=全部）")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    if not os.path.exists(args.src):
        sys.exit(f"找不到源文件：{args.src}")

    text, enc = decode(args.src)
    lines = [l for l in text.splitlines() if l.strip()]
    print(f"源文件：{os.path.basename(args.src)}  编码={enc}  行数={len(lines)}")

    existing = load_existing_inputs()
    seen, rows, dropped = set(), [], Counter()

    for line in lines:
        parts = line.split("\t")
        zh = clean(parts[1] if len(parts) >= 2 else parts[0])
        if not zh or len(zh) < 8:
            dropped["太短(<8字)"] += 1
            continue
        if len(zh) > 300:
            dropped["太长(>300字)"] += 1
            continue
        key = re.sub(r"[\s，。！？、,.!?\"“”]", "", zh)
        if key in seen:
            dropped["重复"] += 1
            continue
        seen.add(key)
        if zh in existing:
            dropped["与现有样本重复"] += 1
            continue

        ftype = local_rule_label(zh)
        score, level = local_rule_risk(zh)
        rows.append({
            "instruction": INSTRUCTION,
            "input": zh,
            "output": json.dumps({
                "risk_score": score,
                "risk_level": level,
                "fraud_type": ftype,
                "analysis": "规则初标（外部语料导入），需人工校对。",
            }, ensure_ascii=False),
        })

    if args.limit and len(rows) > args.limit:
        rows = rows[: args.limit]

    types = Counter(json.loads(r["output"])["fraud_type"] for r in rows)
    levels = Counter(json.loads(r["output"])["risk_level"] for r in rows)
    print(f"保留 {len(rows)} 条；丢弃：{dict(dropped)}")
    print("类型分布:", dict(types))
    print("等级分布:", dict(levels))

    if args.dry_run:
        print("--dry-run：未写文件")
        return

    os.makedirs(DATASET_DIR, exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8", newline="\n") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
    print(f"已写入：{OUT_PATH}（{len(rows)} 条）")


if __name__ == "__main__":
    main()

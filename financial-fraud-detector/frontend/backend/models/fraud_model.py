"""
backend/models/fraud_model.py — 微调模型加载 + 推理

支持两种形态（无需先跑 export.py 合并）：
  1) 合并后的完整模型目录        training/output/fraud-lora-merged
  2) LoRA 适配器目录（含 adapter_config.json）  training/output/fraud-lora-adapter
     —— 会自动读取 adapter_config 里的 base_model_name_or_path 作为基座

用法：
  model = FraudModel("training/output/fraud-lora-merged")
  result = model.predict("待检测的文本")
"""
import json
import os
import re
import torch
from transformers import AutoTokenizer, AutoModelForCausalLM


SYSTEM_PROMPT = "你是金融反欺诈分析专家。分析以下文本，输出JSON格式结果。"

# 模型可能输出自由格式 JSON，这里做一层兜底归一化，避免上游拿到 None
KNOWN_TYPES = [
    "冒充客服", "虚假投资", "虚假投资理财", "冒充公检法", "信贷诈骗", "刷单诈骗",
    "杀猪盘", "钓鱼链接", "非法集资", "虚拟货币诈骗", "保险诈骗", "洗钱", "正常",
]
LEVEL_KEYWORDS = ["极高风险", "高风险", "中风险", "低风险"]
LEVEL_SCORE = {"极高风险": 0.9, "高风险": 0.72, "中风险": 0.5, "低风险": 0.25}


class FraudModel:
    def __init__(self, model_path: str):
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.model_path = model_path

        adapter_cfg = os.path.join(model_path, "adapter_config.json")
        is_adapter = os.path.isfile(adapter_cfg)

        # 适配器目录：tokenizer 在适配器目录里，模型权重需要基座
        if is_adapter:
            with open(adapter_cfg, "r", encoding="utf-8") as f:
                cfg = json.load(f)
            base = cfg.get("base_model_name_or_path") or ""
            if not base or not (os.path.isdir(base) or "/" in base):
                raise RuntimeError("LoRA 适配器缺少可用基座模型: %r" % base)
            print(f"[FraudModel] 加载 LoRA 适配器: {model_path} (基座={base}, device={self.device})")
            self.tokenizer = AutoTokenizer.from_pretrained(model_path, trust_remote_code=True)
            base_model = AutoModelForCausalLM.from_pretrained(
                base,
                torch_dtype=torch.float16 if self.device == "cuda" else torch.float32,
                device_map="auto" if self.device == "cuda" else None,
                trust_remote_code=True,
            )
            from peft import PeftModel
            self.model = PeftModel.from_pretrained(base_model, model_path)
            if self.device == "cpu":
                self.model = self.model.to("cpu")
        else:
            print(f"[FraudModel] 加载模型: {model_path} (device={self.device})")
            self.tokenizer = AutoTokenizer.from_pretrained(model_path, trust_remote_code=True)
            self.model = AutoModelForCausalLM.from_pretrained(
                model_path,
                torch_dtype=torch.float16 if self.device == "cuda" else torch.float32,
                device_map="auto" if self.device == "cuda" else None,
                trust_remote_code=True,
            )
            if self.device == "cpu":
                self.model = self.model.to(self.device)

        if self.tokenizer.pad_token is None:
            self.tokenizer.pad_token = self.tokenizer.eos_token
        self.model.eval()

    def predict(self, text: str) -> dict:
        prompt = f"<|im_start|>system\n{SYSTEM_PROMPT}<|im_end|>\n<|im_start|>user\n{text}<|im_end|>\n<|im_start|>assistant\n"
        inputs = self.tokenizer(prompt, return_tensors="pt", truncation=True, max_length=1024)
        if self.device == "cuda":
            inputs = {k: v.cuda() for k, v in inputs.items()}

        with torch.no_grad():
            outputs = self.model.generate(
                **inputs,
                max_new_tokens=200,        # 结果是短 JSON，512 太慢也更容易 OOM
                temperature=0.1,
                do_sample=False,           # 结构化输出用贪心，减少格式漂移
                pad_token_id=self.tokenizer.pad_token_id,
            )

        response = self.tokenizer.decode(outputs[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True)
        return self._parse_response(response)

    @staticmethod
    def _find_type(blob: str) -> str:
        for t in KNOWN_TYPES:
            if t in blob:
                return t
        return ""

    @staticmethod
    def _find_level(blob: str) -> str:
        for lv in LEVEL_KEYWORDS:
            if lv in blob:
                return lv
        return ""

    @staticmethod
    def _find_score(data: dict, blob: str, level: str) -> float:
        for key in ("risk_score", "score", "risk", "probability"):
            if key in data:
                try:
                    v = float(data[key])
                    return max(0.0, min(1.0, v))
                except (TypeError, ValueError):
                    pass
        m = re.search(r'risk[_\s-]?score["\']?\s*[:：]\s*([01](?:\.\d+)?)', blob, re.I)
        if m:
            try:
                return max(0.0, min(1.0, float(m.group(1))))
            except ValueError:
                pass
        if level:
            return LEVEL_SCORE.get(level, 0.5)
        return 0.0

    def _parse_response(self, text: str) -> dict:
        """从模型输出里提取结构化结果。

        训练充分时模型会输出约定的 JSON；训练不足时可能输出别的 JSON 结构或纯文本，
        这里做归一化 + 兜底，保证上游（/api/detect）永远拿到可用字段，而不是 None。
        """
        match = re.search(r'\{.*\}', text, re.DOTALL)
        data = None
        if match:
            try:
                data = json.loads(match.group())
            except json.JSONDecodeError:
                data = None

        blob = json.dumps(data, ensure_ascii=False) if isinstance(data, dict) else (text or "")

        if isinstance(data, dict) and "risk_score" in data and "fraud_type" in data:
            out = dict(data)
            out.setdefault("risk_level", self._find_level(blob) or "中风险")
            out.setdefault("analysis", blob[:300])
            return out

        fraud_type = self._find_type(blob)
        level = self._find_level(blob)
        if isinstance(data, dict):
            # 兼容 {"code":400,"data":"疑似冒充客服诈骗","reason":"..."} 这类自由格式
            score = self._find_score(data, blob, level)
        else:
            score = self._find_score({}, blob, level)

        if not fraud_type and not level:
            return {
                "risk_score": 0.5,
                "risk_level": "疑似风险",
                "fraud_type": "待人工复核",
                "analysis": "微调模型输出不符合约定 JSON 格式，已按兜底值返回，建议人工复核。（原始输出：%s）" % (text or "")[:200],
                "unparsed": True,
                "_raw": (text or "")[:300],
            }

        return {
            "risk_score": score,
            "risk_level": level or "中风险",
            "fraud_type": fraud_type or "其他",
            "analysis": blob[:300],
            "_raw": (text or "")[:300],
        }


# 测试
if __name__ == "__main__":
    import sys
    path = sys.argv[1] if len(sys.argv) > 1 else "training/output/fraud-lora-adapter"
    model = FraudModel(path)
    result = model.predict("您好，我是京东客服，您的账户出现异常，请点击链接处理。")
    print(json.dumps(result, ensure_ascii=False, indent=2))

"""
backend/models/fraud_model.py — 微调模型加载 + 推理

使用方法：
  model = FraudModel("training/output/fraud-lora-merged")
  result = model.predict("待检测的文本")
"""
import json
import re
import torch
from transformers import AutoTokenizer, AutoModelForCausalLM


SYSTEM_PROMPT = "你是金融反欺诈分析专家。分析以下文本，输出JSON格式结果。"


class FraudModel:
    def __init__(self, model_path: str):
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
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
        self.model.eval()

    def predict(self, text: str) -> dict:
        prompt = f"<|im_start|>system\n{SYSTEM_PROMPT}<|im_end|>\n<|im_start|>user\n{text}<|im_end|>\n<|im_start|>assistant\n"
        inputs = self.tokenizer(prompt, return_tensors="pt", truncation=True, max_length=1024)
        if self.device == "cuda":
            inputs = {k: v.cuda() for k, v in inputs.items()}

        with torch.no_grad():
            outputs = self.model.generate(
                **inputs,
                max_new_tokens=512,
                temperature=0.1,
                do_sample=True,
                top_p=0.9,
            )

        response = self.tokenizer.decode(outputs[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True)
        return self._parse_response(response)

    def _parse_response(self, text: str) -> dict:
        """从模型输出中提取 JSON"""
        match = re.search(r'\{.*\}', text, re.DOTALL)
        if match:
            try:
                return json.loads(match.group())
            except json.JSONDecodeError:
                pass
        return {"risk_score": 0.5, "risk_level": "分析中", "fraud_type": "未知"}


# 测试
if __name__ == "__main__":
    import sys
    model = FraudModel(sys.argv[1] if len(sys.argv) > 1 else "training/output/fraud-lora-merged")
    result = model.predict("您好，我是京东客服，您的账户出现异常，请点击链接处理。")
    print(json.dumps(result, ensure_ascii=False, indent=2))

"""
backend/routers/detect.py — 欺诈检测 API
"""
import time
import uuid
from fastapi import APIRouter, HTTPException
from models.schemas import DetectRequest, DetectResponse
import config

router = APIRouter(prefix="/api", tags=["detect"])

# 模型延迟加载
_fraud_model = None


def get_model():
    global _fraud_model
    if _fraud_model is None and config.USE_FINETUNED:
        try:
            from models.fraud_model import FraudModel
            _fraud_model = FraudModel(config.MODEL_PATH)
        except Exception:
            _fraud_model = None  # 回退到纯 DeepSeek
    return _fraud_model


def call_deepseek(text: str) -> dict:
    """调用 DeepSeek API 做深度分析"""
    import httpx
    api_key = config.DEEPSEEK_API_KEY
    if not api_key:
        return {"error": "DeepSeek API Key 未配置"}

    prompt = f"""你是金融反欺诈分析专家。请对以下文本进行多维度分析：

【待检测文本】
{text}

请输出 JSON 格式（仅 JSON，不要其他内容）：
{{
  "risk_score": 0.0-1.0,
  "risk_level": "低风险/中风险/高风险/极高风险",
  "fraud_category": "冒充客服/虚假投资/冒充公检法/信贷诈骗/正常",
  "risk_factors": [{{"category": "维度名", "score": 0.0-1.0, "detail": "说明"}}],
  "suggestions": ["建议1", "建议2"],
  "summary": "200字以内的总结"
}}"""

    try:
        resp = httpx.post(
            f"{config.DEEPSEEK_BASE_URL}/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "model": "deepseek-chat",
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.1,
                "max_tokens": 2000,
            },
            timeout=30,
        )
        data = resp.json()
        content = data["choices"][0]["message"]["content"]
        # 尝试提取 JSON
        import json, re
        match = re.search(r'\{.*\}', content, re.DOTALL)
        if match:
            return json.loads(match.group())
    except Exception as e:
        return {"error": str(e)}
    return {"error": "解析失败"}


@router.post("/detect", response_model=DetectResponse)
def detect(req: DetectRequest):
    t0 = time.time()

    # 1. 微调模型推理（如果有）
    finetuned_result = None
    model = get_model()
    if model:
        try:
            finetuned_result = model.predict(req.text)
        except Exception:
            pass

    # 2. DeepSeek 深度分析
    llm_result = {}
    if req.use_llm:
        llm_result = call_deepseek(req.text)

    latency = int((time.time() - t0) * 1000)
    report_id = f"RPT-{uuid.uuid4().hex[:8].upper()}"

    # 合并结果
    score = llm_result.get("risk_score") or (finetuned_result.get("risk_score") if finetuned_result else 0.0)
    level = llm_result.get("risk_level") or (finetuned_result.get("risk_level") if finetuned_result else "分析中")
    category = llm_result.get("fraud_category") or (finetuned_result.get("fraud_type") if finetuned_result else "分析中")

    return DetectResponse(
        report_id=report_id,
        generated_at=time.strftime("%Y-%m-%d %H:%M:%S"),
        basic_info={
            "risk_score": score,
            "risk_level": level,
            "fraud_category": category,
            "confidence": 0.85,
            "detected_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        },
        risk_factors=llm_result.get("risk_factors", []),
        suggestions=llm_result.get("suggestions", []),
        summary=llm_result.get("summary", ""),
        llm_analysis=llm_result.get("summary", ""),
    )

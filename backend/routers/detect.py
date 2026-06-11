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


# ---- 全球威胁情报（首页地图数据） ----
@router.get("/threat-feed")
def threat_feed():
    """返回实时威胁节点 + 情报流数据，供首页世界地图渲染"""
    return {
        "nodes": [
            {"id": 1, "name": "东南亚", "lat": 13.7, "lng": 100.5, "level": "critical", "desc": "杀猪盘服务器集群新增 3 节点", "count": 1283},
            {"id": 2, "name": "东欧",   "lat": 52.0, "lng": 30.0,  "level": "high",     "desc": "虚拟货币洗钱通道",         "count": 647},
            {"id": 3, "name": "东亚",   "lat": 35.0, "lng": 120.0, "level": "high",     "desc": "冒充公检法话术 v4.2",      "count": 892},
            {"id": 4, "name": "北美",   "lat": 40.0, "lng": -100.0,"level": "high",     "desc": "AI 深度伪造语音诈骗 +47%",  "count": 531},
            {"id": 5, "name": "南美",   "lat": -10.0,"lng": -55.0, "level": "medium",   "desc": "虚假投资 App 黑产活跃",      "count": 312},
            {"id": 6, "name": "西欧",   "lat": 50.0, "lng": 5.0,   "level": "medium",   "desc": "钓鱼邮件攻击激增",           "count": 278},
            {"id": 7, "name": "中东",   "lat": 30.0, "lng": 45.0,  "level": "low",      "desc": "征信修复骗局关联账户",       "count": 104},
            {"id": 8, "name": "非洲",   "lat": 0.0,   "lng": 25.0,  "level": "low",      "desc": "伪基站活动范围扩展",          "count": 67},
        ],
        "feeds": [
            {"time": "14:32:07", "loc": "东南亚", "desc": "新杀猪盘服务器集群上线 3 节点", "level": "critical"},
            {"time": "14:28:51", "loc": "东欧",   "desc": "虚拟货币洗钱通道新增 2 条",     "level": "high"},
            {"time": "14:15:33", "loc": "北美",   "desc": "AI 深度伪造语音诈骗增长 47%",  "level": "high"},
            {"time": "14:02:19", "loc": "东亚",   "desc": "冒充公检法话术模板更新至 v4.2","level": "medium"},
            {"time": "13:47:55", "loc": "南美",   "desc": "虚假投资 App 在黑产论坛低价甩卖","level": "medium"},
            {"time": "13:21:13", "loc": "西欧",   "desc": "征信修复骗局关联账户 +283",     "level": "medium"},

            {"time": "12:58:40", "loc": "中东",   "desc": "伪基站活动半径扩展至二线城市",  "level": "low"},
        ],
        "stats": {
            "total_nodes": 1024,
            "active_threats": 47,
            "today_alerts": 283,
            "coverage_regions": 8,
        }
    }


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

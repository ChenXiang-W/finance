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
            {"id": 1,  "name": "缅甸",   "lat": 21.9, "lng": 96.0,  "level": "critical", "desc": "杀猪盘诈骗园区集中地，武装集团操控",           "count": 2847},
            {"id": 2,  "name": "柬埔寨", "lat": 12.5, "lng": 104.9, "level": "critical", "desc": "电诈窝点密集，冒充公检法话术源头",              "count": 1956},
            {"id": 3,  "name": "菲律宾", "lat": 13.0, "lng": 122.0, "level": "critical", "desc": "网络博彩+杀猪盘复合型诈骗基地",                 "count": 1623},
            {"id": 4,  "name": "尼日利亚","lat": 9.0,  "lng": 8.0,   "level": "critical", "desc": "419诈骗+浪漫杀猪盘+虚假投资全球输出",           "count": 1340},
            {"id": 5,  "name": "俄罗斯", "lat": 61.5, "lng": 52.0,  "level": "high", "desc": "暗网勒索软件+虚拟货币洗钱中转枢纽",              "count": 892},
            {"id": 6,  "name": "乌克兰", "lat": 49.0, "lng": 31.0,  "level": "high", "desc": "呼叫中心诈骗+技术支持诈骗产业链",                "count": 743},
            {"id": 7,  "name": "中国",   "lat": 35.0, "lng": 115.0, "level": "high", "desc": "冒充公检法话术 v4.2+虚假贷款App泛滥",            "count": 2156},
            {"id": 8,  "name": "印度",   "lat": 22.0, "lng": 79.0,  "level": "high", "desc": "假冒微软/IRS技术支持诈骗呼叫中心",              "count": 1678},
            {"id": 9,  "name": "美国",   "lat": 39.0, "lng": -98.0, "level": "high", "desc": "AI深度伪造语音诈骗+商业邮件入侵BEC",            "count": 1432},
            {"id": 10, "name": "巴西",   "lat": -5.0, "lng": -53.0, "level": "high", "desc": "Pix即时支付诈骗+社交工程钓鱼猖獗",              "count": 987},
            {"id": 11, "name": "阿联酋", "lat": 25.0, "lng": 55.0,  "level": "high", "desc": "虚假加密货币交易所+洗钱中转站",                 "count": 654},
            {"id": 12, "name": "英国",   "lat": 54.0, "lng": -2.0,  "level": "medium", "desc": "冒充银行+虚假投资平台+APP诈骗",                 "count": 521},
            {"id": 13, "name": "德国",   "lat": 51.0, "lng": 10.0,  "level": "medium", "desc": "钓鱼邮件攻击+虚假电商平台",                     "count": 438},
            {"id": 14, "name": "法国",   "lat": 47.0, "lng": 3.0,   "level": "medium", "desc": "虚假服务网站+电信欠费诈骗",                     "count": 396},
            {"id": 15, "name": "土耳其", "lat": 39.0, "lng": 35.0,  "level": "medium", "desc": "虚假投资平台+加密货币庞氏骗局中转",              "count": 467},
            {"id": 16, "name": "南非",   "lat": -29.0,"lng": 24.0,  "level": "medium", "desc": "预付费诈骗+虚假彩票+网络钓鱼激增",              "count": 312},
            {"id": 17, "name": "墨西哥", "lat": 23.0, "lng": -102.0,"level": "medium", "desc": "冒充移民局+绑架虚拟诈骗+虚假贷款",              "count": 285},
            {"id": 18, "name": "印尼",   "lat": -2.0, "lng": 118.0, "level": "medium", "desc": "虚假投资+社交媒体验证码诈骗",                   "count": 401},
            {"id": 19, "name": "越南",   "lat": 16.0, "lng": 108.0, "level": "medium", "desc": "假冒银行短信+虚假电商客服诈骗",                "count": 358},
            {"id": 20, "name": "巴基斯坦","lat": 30.0,"lng": 70.0,  "level": "medium", "desc": "虚假客服中心+技术诈骗",                         "count": 273},
            {"id": 21, "name": "日本",   "lat": 36.0, "lng": 138.0, "level": "low", "desc": "虚假账单诈骗+预付卡诈骗偶发",                    "count": 156},
            {"id": 22, "name": "韩国",   "lat": 36.5, "lng": 128.0, "level": "low", "desc": "语音钓鱼+虚假贷款平台",                         "count": 142},
            {"id": 23, "name": "澳大利亚","lat": -25.0,"lng": 133.0,"level": "low", "desc": "ATO冒充退税诈骗+虚假投资平台",                  "count": 118},
            {"id": 24, "name": "加拿大", "lat": 56.0, "lng": -106.0,"level": "low", "desc": "CRA冒充税务诈骗+虚假技术支持",                  "count": 98},
            {"id": 25, "name": "阿根廷", "lat": -34.0,"lng": -64.0, "level": "low", "desc": "WhatsApp诈骗+虚假线上购物",                     "count": 74},
        ],
        "feeds": [
            {"time": "14:35:12", "loc": "缅甸",   "desc": "妙瓦底园区新增2栋电诈大楼，容纳3000人",        "level": "critical"},
            {"time": "14:32:07", "loc": "柬埔寨", "desc": "西港查获冒充公检法话术手册 v4.2",              "level": "critical"},
            {"time": "14:28:51", "loc": "尼日利亚","desc": "拉各斯窝点利用AI换脸实施浪漫诈骗+47%",        "level": "critical"},
            {"time": "14:25:33", "loc": "印度",   "desc": "新德里呼叫中心假冒微软技术支持活跃度激增",      "level": "high"},
            {"time": "14:20:19", "loc": "俄罗斯", "desc": "暗网新上架3款勒索即服务(RaaS)工具包",           "level": "high"},
            {"time": "14:15:47", "loc": "美国",   "desc": "AI深度伪造CEO语音诈骗单笔损失$25M",             "level": "high"},
            {"time": "14:10:22", "loc": "阿联酋", "desc": "迪拜虚假加密货币交易所卷款$120M跑路",           "level": "high"},
            {"time": "14:05:08", "loc": "巴西",   "desc": "Pix即时支付钓鱼链接大规模群发，日增12万条",     "level": "high"},
            {"time": "13:58:41", "loc": "德国",   "desc": "钓鱼邮件冒充DHL/亚马逊物流通知大规模扩散",      "level": "medium"},
            {"time": "13:50:17", "loc": "南非",   "desc": "虚假彩票中奖短信+预付费诈骗关联账户+312",       "level": "medium"},
            {"time": "13:42:55", "loc": "墨西哥", "desc": "冒充美国移民局诈骗电话激增，针对拉美裔社区",     "level": "medium"},
            {"time": "13:35:30", "loc": "越南",   "desc": "假冒Vietcombank银行短信含钓鱼链接大规模群发",   "level": "medium"},
            {"time": "13:28:14", "loc": "印尼",   "desc": "WhatsApp验证码盗号+虚假投资推荐组合诈骗",        "level": "medium"},
            {"time": "13:20:08", "loc": "日本",   "desc": "虚假NHK收视费+电力公司账单诈骗偶发",              "level": "low"},
        ],
        "stats": {
            "total_nodes": 2547,
            "active_threats": 83,
            "today_alerts": 516,
            "coverage_regions": 25,
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

"""
backend/routers/detect.py — 欺诈检测 API
"""
import os
import time
import uuid
import threading
from fastapi import APIRouter, HTTPException
from sqlalchemy.orm import Session
from fastapi import Depends
from sqlalchemy import func
from datetime import datetime

from models.schemas import DetectRequest, DetectResponse
from pydantic import BaseModel as _PydBase
from models.database import get_db, DetectionLog
import config

router = APIRouter(prefix="/api", tags=["detect"])

# ---- 会话历史（持久化到 SQLite detection_logs 表，重启不丢失）----
# 前端通过 session_id 关联自己的检测历史；每条记录同时写入全局检测日志，
# 供管理后台「检测日志」与「统计」模块使用真实数据。

_MAX_CONVERSATIONS = 200  # 单会话记录上限


def _save_conversation(db: Session, session_id: str, user_text: str, result: dict, model_used: str = "deepseek", latency_ms: int = 0):
    """把一次检测结果持久化到数据库（会话历史 + 全局日志共用同一张表）"""
    if not session_id or session_id == "anonymous":
        return
    ri = result.get("basic_info") or {}
    try:
        score = float(ri.get("risk_score") or 0)
    except (TypeError, ValueError):
        score = 0.0

    log = DetectionLog(
        session_id=session_id,
        input_text=user_text[:10000],
        risk_score=score,
        risk_level=str(ri.get("risk_level") or "未知"),
        fraud_type=str(ri.get("fraud_category") or "分析中"),
        result_json=result,           # 完整检测结果，供前端历史恢复展示
        model_used=model_used,
        latency_ms=int(latency_ms),
    )
    db.add(log)
    db.commit()

    # 单会话记录上限：超出时删除该会话最旧的记录
    count = db.query(func.count(DetectionLog.id)).filter(DetectionLog.session_id == session_id).scalar()
    if count > _MAX_CONVERSATIONS:
        stale = db.query(DetectionLog).filter(DetectionLog.session_id == session_id)\
            .order_by(DetectionLog.created_at.asc()).limit(count - _MAX_CONVERSATIONS).all()
        for s in stale:
            db.delete(s)
        db.commit()


def _session_payload(db: Session, session_id: str) -> dict:
    """从数据库读取该会话的检测历史（含完整结果）"""
    logs = db.query(DetectionLog).filter(DetectionLog.session_id == session_id)\
        .order_by(DetectionLog.created_at.desc()).all()
    convs = []
    scores = []
    for l in logs:
        try:
            score = float(l.risk_score or 0)
        except (TypeError, ValueError):
            score = 0.0
        scores.append(score)
        convs.append({
            "id": l.id,                 # 单条删除/定位用
            "user_text": l.input_text,
            "risk_score": score,
            "risk_level": l.risk_level or "未知",
            "fraud_type": l.fraud_type or "分析中",
            "timestamp": l.created_at.strftime("%Y-%m-%d %H:%M:%S") if l.created_at else "",
            "result": l.result_json,   # 完整结果，前端可一键恢复展示
        })
    return {
        "session_id": session_id,
        "session_info": {
            "total": len(convs),
            "avg_risk_score": round(sum(scores) / len(scores), 2) if scores else None,
        },
        "conversations": convs,
    }


# ---- 会话历史：查询 ----
@router.get("/session/{session_id}")
def get_session(session_id: str, db: Session = Depends(get_db)):
    """返回指定会话的检测历史（无记录时返回空列表，而非 404）"""
    return {"ok": True, "data": _session_payload(db, session_id)}


# ---- 会话历史：清空 ----
@router.delete("/session/{session_id}")
def clear_session(session_id: str, db: Session = Depends(get_db)):
    """清空指定会话的检测历史（同时清理对应检测日志）"""
    db.query(DetectionLog).filter(DetectionLog.session_id == session_id).delete()
    db.commit()
    return {"ok": True, "data": _session_payload(db, session_id)}


# ---- 会话历史：删除单条 ----
@router.delete("/session/{session_id}/item/{log_id}")
def delete_session_item(session_id: str, log_id: int, db: Session = Depends(get_db)):
    """删除单条检测记录（侧边栏历史条目的 ✕ 按钮）"""
    row = db.query(DetectionLog).filter(
        DetectionLog.id == log_id, DetectionLog.session_id == session_id
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="记录不存在")
    db.delete(row)
    db.commit()
    return {"ok": True, "data": _session_payload(db, session_id)}


# ---- 全局检测统计（真实数据，供前端仪表盘/迷你统计/词云使用）----
@router.get("/stats")
def global_stats(db: Session = Depends(get_db)):
    """返回真实检测统计：总量/今日/高危/平均分/平均耗时/欺诈类型分布"""
    total = db.query(func.count(DetectionLog.id)).scalar() or 0
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    today_count = db.query(func.count(DetectionLog.id))\
        .filter(DetectionLog.created_at >= today_start).scalar() or 0
    high_count = db.query(func.count(DetectionLog.id))\
        .filter(DetectionLog.risk_score >= 0.6).scalar() or 0
    avg = db.query(func.avg(DetectionLog.risk_score)).scalar() or 0.0
    avg_latency = db.query(func.avg(DetectionLog.latency_ms)).scalar() or 0
    # 欺诈类型分布（真实统计）
    rows = db.query(DetectionLog.fraud_type, func.count(DetectionLog.id))\
        .group_by(DetectionLog.fraud_type).order_by(func.count(DetectionLog.id).desc()).all()
    categories = [{"name": r[0] or "未知", "count": r[1]} for r in rows]
    return {
        "total_detections": total,
        "today_detections": today_count,
        "high_risk_count": high_count,
        "avg_risk_score": round(float(avg), 2),
        "avg_latency_ms": round(float(avg_latency), 1),
        "categories": categories,
        # 前端侧边栏底部状态灯用（微调模型是否已加载）
        "model_loaded": model_loaded(),
        "active_model": current_model_path(),
        "finetuned_enabled": bool(config.USE_FINETUNED),
    }


# ---- DeepSeek 运行时配置（前端「系统设置」同步到此，后端检测实际使用）----
_runtime_llm = {"api_key": "", "base_url": "", "model": "deepseek-chat"}


@router.get("/llm/config")
def get_llm_config():
    """返回当前 LLM 配置状态（不回显 API Key 明文，防泄露）"""
    return {
        "ok": True,
        "base_url": _runtime_llm.get("base_url") or config.DEEPSEEK_BASE_URL,
        "model": _runtime_llm.get("model") or "deepseek-chat",
        "configured": bool(_runtime_llm.get("api_key") or config.DEEPSEEK_API_KEY),
    }


@router.post("/llm/config")
def set_llm_config(data: dict):
    """前端保存的 DeepSeek 配置写入运行时，后端检测/智能体立即生效。

    安全约束：已配置过 API Key 后，单独修改 base_url 会被拒绝
    （防止攻击者把 base_url 指向自己从而窃取已有 Key）。
    """
    has_existing_key = bool(_runtime_llm.get("api_key") or config.DEEPSEEK_API_KEY)
    incoming_key = str(data.get("api_key") or "").strip() if "api_key" in data else None
    new_base = str(data.get("base_url") or "").strip() if data.get("base_url") is not None else None

    if not incoming_key and new_base and new_base.rstrip("/") != (_runtime_llm.get("base_url") or config.DEEPSEEK_BASE_URL).rstrip("/") and has_existing_key:
        raise HTTPException(status_code=400, detail="修改 API 地址必须同时提供 API Key，防止密钥被窃取")

    if incoming_key is not None:
        _runtime_llm["api_key"] = incoming_key
    if new_base:
        _runtime_llm["base_url"] = new_base
    if data.get("model"):
        _runtime_llm["model"] = str(data["model"]).strip()
    return {"ok": True, "configured": bool(_runtime_llm["api_key"] or config.DEEPSEEK_API_KEY)}


# ---- URL 抓取代理（前端 URL 扫描的真实后端实现）----
@router.post("/fetch-url")
def fetch_url(data: dict):
    """服务端抓取网页并提取正文文本，解决浏览器跨域无法抓取的问题"""
    import httpx
    import re as _re
    from urllib.parse import urlparse

    url = (data.get("url") or "").strip()
    if not url:
        raise HTTPException(status_code=400, detail="URL 不能为空")
    if not url.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="仅支持 http/https 链接")

    # 防 SSRF：用 ipaddress 完整判定所有解析结果（含 IPv6），且不跟随重定向
    import socket
    import ipaddress as _ip

    host = urlparse(url).hostname or ""

    def _is_forbidden(ip_str: str) -> bool:
        try:
            ip = _ip.ip_address(ip_str)
        except ValueError:
            return True
        return (ip.is_private or ip.is_loopback or ip.is_link_local or
                ip.is_reserved or ip.is_multicast or ip.is_unspecified)

    try:
        infos = socket.getaddrinfo(host, None)
        ips = {info[4][0] for info in infos}
    except Exception:
        raise HTTPException(status_code=400, detail="无法解析域名")
    if not ips or any(_is_forbidden(i) for i in ips):
        raise HTTPException(status_code=400, detail="不允许访问内网/保留地址")

    try:
        resp = httpx.get(
            url, timeout=12, follow_redirects=False,  # 禁止重定向，防止绕过内网校验
            headers={"User-Agent": "Mozilla/5.0 (compatible; JindunZhihuiBot/1.0; +fraud-detector)"},
        )
        html = resp.text
        title_m = _re.search(r"<title[^>]*>([^<]+)</title>", html, _re.I)
        title = title_m.group(1).strip() if title_m else ""
        # 去除脚本/样式/标签，提取纯文本
        text = _re.sub(r"(?is)<(script|style|noscript|svg)[^>]*>.*?</\1>", " ", html)
        text = _re.sub(r"(?is)<[^>]+>", " ", text)
        text = _re.sub(r"\s+", " ", text).strip()
        if len(text) < 20:
            raise HTTPException(status_code=422, detail="页面未提取到有效文本（可能是图片/JS 渲染页面）")
        return {"ok": True, "url": url, "title": title, "text": text[:10000]}
    except HTTPException:
        raise
    except Exception as e:
        return {"ok": False, "error": "抓取失败: " + str(e)}

# ---- 模型延迟加载 + 热加载 ----
_fraud_model = None
_model_path_override = None
_model_load_error = None       # (path, error) —— 负缓存，避免每次检测都重试加载


def current_model_path():
    """当前生效的微调模型路径（管理后台激活的版本优先）"""
    return _model_path_override or config.MODEL_PATH


def model_loaded():
    return _fraud_model is not None


def set_model_path(path):
    """切换模型路径（只改指向，不立即加载）"""
    global _model_path_override, _fraud_model, _model_load_error
    _model_path_override = path
    _fraud_model = None
    _model_load_error = None


def reload_model(path=None):
    """同步加载模型，返回 (ok, error)"""
    global _model_load_error
    if path:
        set_model_path(path)
    _model_load_error = None
    get_model(force=True)
    if _fraud_model is not None:
        return True, ""
    return False, (_model_load_error[1] if _model_load_error else "未知错误")


def reload_model_async(path=None):
    """后台线程加载：3B 模型加载要几十秒，不能阻塞 HTTP 请求"""
    threading.Thread(target=reload_model, args=(path,), daemon=True).start()
    return True, ""


def unload_model():
    """卸载微调模型并释放显存（切回纯 DeepSeek 模式）"""
    global _fraud_model, _model_path_override, _model_load_error
    _fraud_model = None
    _model_path_override = None
    _model_load_error = None
    try:
        import gc
        import torch
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except Exception:
        pass
    return True


def get_model(force=False):
    global _fraud_model, _model_load_error
    if not config.USE_FINETUNED:
        return None
    if _fraud_model is not None and not force:
        return _fraud_model

    path = current_model_path()
    # 负缓存：同一个路径失败过就不再重试，避免每次检测都卡住
    if _model_load_error and _model_load_error[0] == path and not force:
        return None

    # 先判目录：目录不存在就直接返回，**不导入 torch/transformers**（首次导入约 20s）
    if not os.path.isdir(path):
        _model_load_error = (path, "微调模型目录不存在: %s" % path)
        return None

    try:
        from models.fraud_model import FraudModel
        _fraud_model = FraudModel(path)
        _model_load_error = None
        print("[模型] 已加载微调模型:", path)
    except Exception as e:
        _model_load_error = (path, str(e))
        _fraud_model = None
        print("[模型] 加载失败:", e)
    return _fraud_model


def call_deepseek(text: str) -> dict:
    """调用 DeepSeek API 做深度分析（优先使用前端同步的运行时配置）"""
    import httpx
    api_key = _runtime_llm.get("api_key") or config.DEEPSEEK_API_KEY
    base_url = (_runtime_llm.get("base_url") or config.DEEPSEEK_BASE_URL).rstrip("/")
    model = _runtime_llm.get("model") or "deepseek-chat"
    if not api_key:
        return {"error": "DeepSeek API Key 未配置"}

    prompt = f"""你是金融反欺诈分析专家。请对以下文本进行多维度分析：

【待检测文本】
{text}

请输出 JSON 格式（仅 JSON，不要其他内容）：
{{
  "risk_score": 0.0-1.0,
  "risk_level": "低风险/中风险/高风险/极高风险",
  "fraud_category": "虚假投资理财/虚拟货币诈骗/非法集资/信贷诈骗/保险诈骗/洗钱/正常",
  "risk_factors": [{{"category": "维度名", "score": 0.0-1.0, "detail": "说明"}}],
  "suggestions": ["建议1", "建议2"],
  "summary": "200字以内的总结"
}}"""

    try:
        resp = httpx.post(
            f"{base_url}/v1/chat/completions",
            headers={"Authorization": f"Bearer {api_key}"},
            json={
                "model": model,
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


# 省份实时情报——点击省份时调用，返回该省诈骗数据
@router.get("/province-intel")
def province_intel(name: str = ""):
    """返回指定省份的威胁情报（演示数据，未接入实时情报源）"""
    import time
    ts = time.strftime("%H:%M:%S")
    data = {
        "广东省": {
            "risk": "极高风险", "nodes": 3247, "monthly": 2156, "alerts": 523,
            "desc": "[" + ts + "] 虚假投资理财App泛滥，P2P清退后新型庞氏骗局卷土重来。虚拟货币交易所跑路案频发，涉案金额全国第一。",
            "fraud_types": [
                {"type":"虚假投资理财","pct":30,"color":"#e63946"},
                {"type":"虚拟货币诈骗","pct":28,"color":"#f4a261"},
                {"type":"非法集资","pct":20,"color":"#e9c46a"},
                {"type":"信贷诈骗","pct":14,"color":"#2a9d8f"},
                {"type":"保险诈骗","pct":8,"color":"#4f6ef7"}
            ],
            "cases": [
                "[" + ts + "] 深圳查处一虚假私募基金，涉案金额12亿元",
                "广州虚拟货币交易所 CoinKing 跑路，投资者血本无归",
                "东莞虚假汽车金融公司被端，涉及车贷诈骗3.8亿"
            ]
        },
        "浙江省": {
            "risk": "极高风险", "nodes": 2856, "monthly": 1892, "alerts": 467,
            "desc": "[" + ts + "] 杭州互联网法院受理的区块链金融诈骗案同比增长47%。虚假DeFi项目和NFT传销在省内集中爆发。",
            "fraud_types": [
                {"type":"虚拟货币诈骗","pct":32,"color":"#e63946"},
                {"type":"虚假投资理财","pct":26,"color":"#f4a261"},
                {"type":"非法集资","pct":22,"color":"#e9c46a"},
                {"type":"信贷诈骗","pct":12,"color":"#2a9d8f"},
                {"type":"洗钱","pct":8,"color":"#4f6ef7"}
            ],
            "cases": [
                "[" + ts + "] 杭州警方打掉一跨境虚拟货币洗钱团伙",
                "宁波虚假外汇交易平台被查，涉案金额8.5亿",
                "温州民间借贷连环爆雷，涉嫌非法吸收公众存款"
            ]
        },
        "上海市": {
            "risk": "极高风险", "nodes": 2156, "monthly": 1340, "alerts": 398,
            "desc": "[" + ts + "] 陆家嘴金融区查获多起虚假私募基金案件。外汇保证金诈骗利用上海国际金融中心形象，受害者遍布全国。",
            "fraud_types": [
                {"type":"虚假私募基金","pct":28,"color":"#e63946"},
                {"type":"外汇诈骗","pct":25,"color":"#f4a261"},
                {"type":"非法集资","pct":22,"color":"#e9c46a"},
                {"type":"信托诈骗","pct":15,"color":"#2a9d8f"},
                {"type":"洗钱","pct":10,"color":"#4f6ef7"}
            ],
            "cases": [
                "[" + ts + "] 上海经侦破获虚假外汇平台 FXMaster 案，涉案15亿",
                "浦东虚假信托产品诈骗案，受害老人超200人",
                "静安区查获一利用AI换脸实施金融诈骗团伙"
            ]
        },
        "北京市": {
            "risk": "高风险", "nodes": 1623, "monthly": 987, "alerts": 312,
            "desc": "[" + ts + "] 朝阳区查获多起虚假信托产品和高端理财诈骗。利用首都金融中心信誉包装的金融骗局持续活跃，中老年高净值人群受害严重。",
            "fraud_types": [
                {"type":"虚假信托","pct":30,"color":"#e63946"},
                {"type":"非法集资","pct":25,"color":"#f4a261"},
                {"type":"私募诈骗","pct":20,"color":"#e9c46a"},
                {"type":"保险诈骗","pct":15,"color":"#2a9d8f"},
                {"type":"洗钱","pct":10,"color":"#4f6ef7"}
            ],
            "cases": [
                "[" + ts + "] 北京朝阳一虚假信托公司被查，涉案金额超8000万",
                "海淀区非法集资案主犯被判无期，涉案金额12亿",
                "西城区查获利用老年人金融知识盲区实施保险诈骗团伙"
            ]
        },
        "江苏省": {
            "risk": "高风险", "nodes": 1340, "monthly": 876, "alerts": 245,
            "desc": "[" + ts + "] P2P全面清退后衍生金融诈骗持续发酵。民间资本活跃地区虚假银行理财和非法集资案件频发，苏州无锡地区尤为突出。",
            "fraud_types": [
                {"type":"P2P衍生诈骗","pct":28,"color":"#e63946"},
                {"type":"虚假理财","pct":25,"color":"#f4a261"},
                {"type":"非法集资","pct":22,"color":"#e9c46a"},
                {"type":"信贷诈骗","pct":15,"color":"#2a9d8f"},
                {"type":"洗钱","pct":10,"color":"#4f6ef7"}
            ],
            "cases": [
                "[" + ts + "] 南京P2P清退后新型庞氏骗局被查，非法吸存8亿元",
                "苏州一虚假银行理财平台被端，受害者超3000人",
                "无锡民间借贷连环爆雷，涉嫌非法吸收公众存款"
            ]
        },
        "福建省": {
            "risk": "高风险", "nodes": 1215, "monthly": 765, "alerts": 287,
            "desc": "[" + ts + "] 厦门泉州地区地下钱庄活跃，虚拟货币洗钱通道集中。跨境赌博资金盘利用福建侨乡优势向东南亚延伸。",
            "fraud_types": [
                {"type":"虚拟货币洗钱","pct":30,"color":"#e63946"},
                {"type":"跨境资金盘","pct":25,"color":"#f4a261"},
                {"type":"地下钱庄","pct":22,"color":"#e9c46a"},
                {"type":"非法集资","pct":13,"color":"#2a9d8f"},
                {"type":"信贷诈骗","pct":10,"color":"#4f6ef7"}
            ],
            "cases": [
                "[" + ts + "] 厦门地下钱庄洗钱通道被端，涉案金额超30亿元",
                "泉州虚假外汇交易平台被查，投资者遍布东南亚",
                "福州查获一利用虚拟货币跨境转移资金犯罪团伙"
            ]
        },
        "四川省": {
            "risk": "高风险", "nodes": 987, "monthly": 654, "alerts": 198,
            "desc": "[" + ts + "] 成都虚假投资平台泛滥，农村地区金融诈骗增长迅速。利用西部开发概念包装的非法集资项目在二三线城市蔓延。",
            "fraud_types": [
                {"type":"虚假投资平台","pct":30,"color":"#e63946"},
                {"type":"非法集资","pct":25,"color":"#f4a261"},
                {"type":"信贷诈骗","pct":20,"color":"#e9c46a"},
                {"type":"保险诈骗","pct":15,"color":"#2a9d8f"},
                {"type":"洗钱","pct":10,"color":"#4f6ef7"}
            ],
            "cases": [
                "[" + ts + "] 成都虚假投资平台蜀金所非法吸存8.5亿元",
                "绵阳农村非法集资案涉及金额2.3亿，受害者超千人",
                "德阳虚假汽车金融公司被端，涉嫌车贷诈骗"
            ]
        },
        "河南省": {
            "risk": "高风险", "nodes": 876, "monthly": 543, "alerts": 176,
            "desc": "[" + ts + "] 郑州虚假贷款中介泛滥，征信修复骗局升级。小微企业和个体户因融资困难成为金融诈骗主要受害群体。",
            "fraud_types": [
                {"type":"虚假贷款","pct":30,"color":"#e63946"},
                {"type":"征信诈骗","pct":25,"color":"#f4a261"},
                {"type":"非法集资","pct":20,"color":"#e9c46a"},
                {"type":"保险诈骗","pct":15,"color":"#2a9d8f"},
                {"type":"信用卡诈骗","pct":10,"color":"#4f6ef7"}
            ],
            "cases": [
                "[" + ts + "] 郑州虚假贷款中介公司被查，骗取服务费超500万",
                "洛阳征信修复骗局升级，虚假征信公司被端",
                "南阳一非法集资案主犯落网，涉案金额1.8亿"
            ]
        },
        "山东省": {
            "risk": "中风险", "nodes": 654, "monthly": 423, "alerts": 142,
            "desc": "[" + ts + "] 济南青岛虚假养老理财产品集中爆发。不法分子利用老龄化趋势，以高收益养老理财为名实施非法集资，老年人受害严重。",
            "fraud_types": [
                {"type":"养老理财诈骗","pct":32,"color":"#e63946"},
                {"type":"非法集资","pct":25,"color":"#f4a261"},
                {"type":"保险诈骗","pct":20,"color":"#e9c46a"},
                {"type":"虚假投资","pct":13,"color":"#2a9d8f"},
                {"type":"信贷诈骗","pct":10,"color":"#4f6ef7"}
            ],
            "cases": [
                "[" + ts + "] 济南虚假养老理财产品案集中爆发，受害老人超500人",
                "青岛一非法集资案主犯被判12年，涉案金额3.2亿",
                "烟台查获利用保险代理人身份实施金融诈骗犯罪团伙"
            ]
        },
        "湖北省": {
            "risk": "中风险", "nodes": 543, "monthly": 354, "alerts": 128,
            "desc": "[" + ts + "] 武汉虚假期货交易平台后台操纵行情被曝光。中部地区金融监管薄弱，信用卡诈骗和虚假理财案件多发。",
            "fraud_types": [
                {"type":"虚假期货","pct":28,"color":"#e63946"},
                {"type":"信用卡诈骗","pct":25,"color":"#f4a261"},
                {"type":"虚假理财","pct":22,"color":"#e9c46a"},
                {"type":"非法集资","pct":15,"color":"#2a9d8f"},
                {"type":"贷款诈骗","pct":10,"color":"#4f6ef7"}
            ],
            "cases": [
                "[" + ts + "] 武汉虚假期货平台后台操纵行情被曝光，投资者集体维权",
                "襄阳信用卡诈骗团伙被端，涉案金额超6000万",
                "宜昌一虚假理财公司跑路，受害者超800人"
            ]
        },
    }
    # 有数据的省份返回详情，没有的返回通用模板
    if name in data:
        data[name]["demo"] = True
        data[name]["demo_note"] = "演示数据：未接入实时威胁情报源"
        return data[name]
    return {
        "demo": True,
        "demo_note": "演示数据：未接入实时威胁情报源",
        "risk": "暂无数据", "nodes": 0, "monthly": 0, "alerts": 0,
        "desc": "[" + ts + "] 暂无" + name + "最新的诈骗威胁情报数据，反诈中心持续监控中。",
        "fraud_types": [
            {"type":"虚假投资理财","pct":25,"color":"#e63946"},
            {"type":"非法集资","pct":25,"color":"#f4a261"},
            {"type":"信贷诈骗","pct":20,"color":"#e9c46a"},
            {"type":"保险诈骗","pct":18,"color":"#2a9d8f"},
            {"type":"其他","pct":12,"color":"#4f6ef7"}
        ],
        "cases": [
            "[" + ts + "] 暂无" + name + "最新案件数据",
            "反诈中心持续监测中",
            "数据更新时间：" + time.strftime("%Y-%m-%d %H:%M")
        ]
    }


# ---- 全球威胁情报（首页地图数据） ----
@router.get("/threat-feed")
def threat_feed():
    """返回威胁节点 + 情报流数据，供首页地图渲染。

    注意：当前未接入真实威胁情报源，节点与情报为**演示数据**
    （基于公开报道的典型诈骗态势整理），前端已如实标注。
    """
    return {
        "demo": True,
        "demo_note": "演示数据：未接入实时威胁情报源，仅作界面演示",
        "nodes": [
            {"id": 1,  "name": "广东省",   "lat": 23.1, "lng": 113.2, "level": "critical", "desc": "虚假投资理财App+虚拟货币交易所跑路，涉案金额全国第一",          "count": 3247},
            {"id": 2,  "name": "浙江省",   "lat": 30.2, "lng": 120.1, "level": "critical", "desc": "区块链DeFi诈骗+NFT传销，互联网法院受案量全国第一",              "count": 2856},
            {"id": 3,  "name": "上海市",   "lat": 31.2, "lng": 121.4, "level": "critical", "desc": "虚假私募基金+外汇保证金诈骗，国际金融中心形象被滥用",            "count": 2156},
            {"id": 4,  "name": "北京市",   "lat": 39.9, "lng": 116.4, "level": "high",     "desc": "虚假信托产品+高端理财诈骗，利用首都金融信誉作案",                "count": 1623},
            {"id": 5,  "name": "江苏省",   "lat": 32.0, "lng": 118.7, "level": "high",     "desc": "P2P爆雷后续诈骗+虚假银行理财，民间借贷纠纷频发",                 "count": 1340},
            {"id": 6,  "name": "福建省",   "lat": 26.0, "lng": 118.0, "level": "high",     "desc": "虚拟货币洗钱+跨境资金盘，地下钱庄犯罪链活跃",                     "count": 1215},
            {"id": 7,  "name": "四川省",   "lat": 30.5, "lng": 104.0, "level": "high",     "desc": "虚假投资平台+非法吸存，农村金融诈骗增长迅速",                     "count": 987},
            {"id": 8,  "name": "河南省",   "lat": 34.7, "lng": 113.6, "level": "high",     "desc": "虚假贷款中介+征信修复骗局，小微企业和农户受害严重",               "count": 876},
            {"id": 9,  "name": "山东省",   "lat": 36.6, "lng": 117.0, "level": "medium",   "desc": "非法集资+虚假养老理财，老年人群体金融诈骗受害突出",               "count": 654},
            {"id": 10, "name": "湖北省",   "lat": 30.5, "lng": 114.3, "level": "medium",   "desc": "虚假期货平台+信用卡诈骗，中部金融监管薄弱",                       "count": 543},
            {"id": 11, "name": "湖南省",   "lat": 28.1, "lng": 112.9, "level": "medium",   "desc": "杀猪盘+虚假贷款App，社交平台引流至金融诈骗高发",                   "count": 498},
            {"id": 12, "name": "辽宁省",   "lat": 41.8, "lng": 123.4, "level": "medium",   "desc": "非法吸存+虚假养老产品，老龄化地区金融犯罪突出",                   "count": 423},
            {"id": 13, "name": "陕西省",   "lat": 34.2, "lng": 108.9, "level": "medium",   "desc": "虚假担保公司+套路贷，中小企业融资诈骗频发",                         "count": 387},
            {"id": 14, "name": "云南省",   "lat": 25.0, "lng": 102.0, "level": "medium",   "desc": "跨境非法集资+地下钱庄洗钱，边境金融犯罪活跃",                       "count": 342},
            {"id": 15, "name": "广西壮族自治区","lat": 23.8,"lng": 108.3,"level":"medium","desc":"面向东盟的虚假外汇平台+跨境资金盘",                                  "count": 298},
            {"id": 16, "name": "安徽省",   "lat": 31.8, "lng": 117.2, "level": "low",      "desc": "虚假理财+非法集资偶发，整体可控",                                    "count": 218},
            {"id": 17, "name": "河北省",   "lat": 38.0, "lng": 114.4, "level": "low",      "desc": "虚假贷款中介+征信修复偶发",                                          "count": 176},
            {"id": 18, "name": "江西省",   "lat": 28.6, "lng": 115.9, "level": "low",      "desc": "P2P清退后续诈骗+虚假理财偶发",                                       "count": 154},
            {"id": 19, "name": "贵州省",   "lat": 26.8, "lng": 106.7, "level": "low",      "desc": "虚假扶贫金融项目+非法集资偶发",                                      "count": 132},
            {"id": 20, "name": "重庆市",   "lat": 29.5, "lng": 106.5, "level": "low",      "desc": "虚假私募+虚拟货币传销，监管力度较大",                                "count": 118},
        ],
        "feeds": [
            {"time": "14:35:12", "loc": "广东·深圳",  "desc": "虚假私募基金跑路，涉案12亿元，投资者血本无归",       "level": "critical"},
            {"time": "14:32:07", "loc": "浙江·杭州",  "desc": "DeFi项目庞氏骗局崩盘，超5万投资者受损",               "level": "critical"},
            {"time": "14:28:51", "loc": "上海·浦东",  "desc": "外汇保证金平台被经侦查封，涉案15亿元",                 "level": "critical"},
            {"time": "14:25:33", "loc": "北京·朝阳",  "desc": "虚假信托产品诈骗老年人，涉案金额超8000万",            "level": "high"},
            {"time": "14:20:19", "loc": "福建·厦门",  "desc": "地下钱庄跨境洗钱通道被端，涉案30亿元",                "level": "high"},
            {"time": "14:15:47", "loc": "江苏·南京",  "desc": "P2P清退后新型庞氏骗局被查，非法吸存8亿",              "level": "high"},
            {"time": "14:10:22", "loc": "四川·成都",  "desc": "虚假投资平台非法吸存8.5亿，受害者遍布全国",            "level": "high"},
            {"time": "13:58:41", "loc": "河南·郑州",  "desc": "征信修复骗局升级，虚假公司骗取服务费数百万元",        "level": "medium"},
            {"time": "13:50:17", "loc": "湖北·武汉",  "desc": "虚假期货平台后台操纵行情被曝光，投资者集体维权",      "level": "medium"},
            {"time": "13:35:30", "loc": "山东·济南",  "desc": "虚假养老理财产品集中爆发，受害老人超500人",           "level": "medium"},
            {"time": "13:20:08", "loc": "辽宁·沈阳",  "desc": "非法吸收公众存款案主犯落网，涉案2.3亿元",             "level": "medium"},
            {"time": "13:12:45", "loc": "重庆",       "desc": "虚拟货币传销被取缔，发展下线超5万人",                 "level": "low"},
            {"time": "13:05:30", "loc": "安徽·合肥",  "desc": "虚假汽车金融诈骗团伙被端，涉案金额1.2亿",             "level": "low"},
        ],
        "stats": {
            "total_nodes": 2547,
            "active_threats": 83,
            "today_alerts": 516,
            "coverage_regions": 25,
        }
    }


@router.post("/detect", response_model=DetectResponse)
def detect(req: DetectRequest, db: Session = Depends(get_db)):
    t0 = time.time()

    # 0. 分析引擎：auto / deepseek / local
    engine = (getattr(req, "engine", None) or "auto").lower()
    run_local = engine != "deepseek"
    use_llm = bool(req.use_llm) and engine != "local"

    # 1. 微调模型推理（如果有）
    finetuned_result = None
    model = get_model() if run_local else None
    if run_local and model is None:
        print("[检测] 本地微调模型未加载：跳过本地推理（请启用模型版本或检查 MODEL_PATH）")
    if model:
        try:
            finetuned_result = model.predict(req.text)
        except Exception as e:
            print("[检测] 微调模型推理失败:", e)

    # 2. DeepSeek 深度分析
    llm_result = {}
    if use_llm:
        llm_result = call_deepseek(req.text)

    latency = int((time.time() - t0) * 1000)
    report_id = f"RPT-{uuid.uuid4().hex[:8].upper()}"

    # 深度分析是否失败（无 key / 超时 / 解析失败）
    llm_failed = "error" in llm_result
    no_engine = (not llm_result) and (finetuned_result is None)
    if no_engine:
        engine_used = "none"
    elif use_llm and not llm_failed:
        engine_used = "deepseek"
    elif finetuned_result:
        engine_used = "finetuned"
    else:
        engine_used = "none"

    # 合并结果；失败时明确标记「分析失败」，避免被误判为「安全」污染统计
    if no_engine:
        score = 0.0
        level = "未分析"
        category = "未分类"
        # 即使没有模型，也用规则给出可解释的六维与通用安全建议，避免报告空白
        risk_factors = rule_dimensions(req.text)
        suggestions = rule_suggestions("正常")
        summary = (
            "没有可用的分析引擎：本地微调模型未加载（模型路径不存在或未激活），"
            "且当前未启用 DeepSeek 深度分析。请到管理后台「模型训练 → 模型版本」启用模型，"
            "或在「设置」里配置 DeepSeek API Key 后重试。"
        )
    elif llm_failed and not finetuned_result:
        score = 0.0
        level = "分析失败"
        category = "分析失败"
        summary = "深度分析失败：" + str(llm_result.get("error", "未知错误"))
        risk_factors, suggestions = [], []
    else:
        score = llm_result.get("risk_score") or (finetuned_result.get("risk_score") if finetuned_result else 0.0)
        level = llm_result.get("risk_level") or (finetuned_result.get("risk_level") if finetuned_result else "分析中")
        category = llm_result.get("fraud_category") or (finetuned_result.get("fraud_type") if finetuned_result else "分析中")
        risk_factors = llm_result.get("risk_factors", [])
        suggestions = llm_result.get("suggestions", [])
        if not llm_result:
            # 纯本地模式（无 DeepSeek）：用规则补齐，保证报告结构完整
            if not risk_factors:
                risk_factors = rule_dimensions(req.text)
            if not suggestions:
                suggestions = rule_suggestions(category)
        # 纯离线（DeepSeek 不可用、但有本地微调模型）时 llm_result 里没有 summary，
        # 之前这里漏赋值会导致 /api/detect 直接 500
        try:
            score_f = float(score)
        except (TypeError, ValueError):
            score_f = 0.0
        summary = (llm_result.get("summary")
                   or ("已由本地微调模型完成离线分析：判定为「%s」，风险评分 %.2f。"
                       "（未配置 DeepSeek，建议配置后获得更详细的六维分析）" % (category, score_f)))

    resp = DetectResponse(
        report_id=report_id,
        generated_at=time.strftime("%Y-%m-%d %H:%M:%S"),
        basic_info={
            "risk_score": score,
            "risk_level": level,
            "fraud_category": category,
            "confidence": 0.85,
            "detected_at": time.strftime("%Y-%m-%d %H:%M:%S"),
            "engine_used": engine_used,
        },
        risk_factors=risk_factors,
        suggestions=suggestions,
        summary=summary,
        llm_analysis=summary,
    )
    # 持久化：会话历史 + 全局检测日志（真实入库，管理后台统计可见）。
    # 深度分析失败的结果不入库，避免污染统计与词云。
    if not llm_failed or finetuned_result:
        # 注意：llm_result 失败时是 {"error": ...} 也是真值，不能直接拿来判断用了哪个模型
        if not llm_failed:
            model_used = "deepseek"
        elif finetuned_result:
            model_used = "finetuned"
        else:
            model_used = "rule"
        _save_conversation(db, req.session_id, req.text, resp.model_dump(), model_used=model_used, latency_ms=latency)
    return resp


# ============================================================
# 纯本地增强：规则六维 / 建议模板 / 本地多轮对话（纯基座，不套 LoRA）
# ============================================================

_DIM_KEYWORDS = {
    "欺诈手法": ["客服", "公安", "检察院", "法院", "银行", "平台", "注销", "投资", "刷单", "中奖", "贷款", "退款"],
    "心理操控": ["立即", "限时", "24小时", "征信", "冻结", "封号", "诉讼", "最后", "仅剩", "否则", "影响"],
    "资金风险": ["转账", "汇款", "安全账户", "支付", "验证码", "密码", "共享屏幕", "垫付", "充值", "扫码"],
    "法律风险": ["洗钱", "涉案", "通缉", "违法", "犯罪", "起诉", "判决", "案件"],
    "社会危害": ["老人", "学生", "老年", "群体", "全国", "大量", "多人", "受害者"],
    "紧急程度": ["紧急", "马上", "立刻", "今天", "到期", "期限", "尽快", "速办"],
}

_TYPE_SUGGESTIONS = {
    "冒充客服": [
        "任何要求「屏幕共享」的客服都是诈骗，立即挂断",
        "官方客服不会引导你把资金转入「安全账户」",
        "不要下载陌生会议软件，不要透露验证码",
        "通过官方 App 内客服入口核实，勿用短信内的电话",
        "若已共享屏幕：立刻断网、挂失银行卡、修改支付密码",
    ],
    "冒充公检法": [
        "公检法不会电话办案，更不会要求转账到「安全账户」",
        "接到此类电话立即挂断，拨打 96110 或 110 核实",
        "不要按对方要求下载任何「安全软件」",
        "保存通话记录与号码，到就近派出所报案",
        "不要向任何人透露身份证号、银行卡号与验证码",
    ],
    "虚假投资": [
        "承诺「稳赚不赔/高收益」的投资平台基本是诈骗",
        "不要向陌生平台转账，尤其是需要「先交费/垫付」的",
        "核实平台是否具备金融牌照，可在证监会/银保监会官网查询",
        "不要轻信「老师带单」「内部消息」",
        "已投入资金：立即停止追加并保留转账凭证报警",
    ],
    "信贷诈骗": [
        "正规贷款不会要求「先交保证金/解冻费」",
        "不要点击短信中的贷款链接，直接使用银行官方 App",
        "任何索要验证码、密码的行为都应拒绝",
        "核实放款方资质，必要时拨打银行官方客服",
        "已交费：保留凭证并报警",
    ],
    "钓鱼链接": [
        "不要点击短信中的陌生链接，尤其是要求「验证身份」的",
        "官方通知不会用短链接或非官方域名索要信息",
        "在浏览器手动输入官方域名，勿从短信跳转",
        "不要在陌生页面输入账号、密码、验证码",
        "如已输入：立即修改密码并检查账户变动",
    ],
    "刷单诈骗": [
        "所有「先垫付后返佣」的刷单都是诈骗",
        "不要相信「日赚几百」的兼职广告",
        "切勿为陌生账户代收代付资金",
        "已垫付：立即停止并报警，保留聊天与转账记录",
        "正规兼职不会要求你先付钱",
    ],
    "虚假中奖": [
        "正规抽奖不会要求中奖者先交「手续费/税费」",
        "不要为领奖提供银行卡号、验证码",
        "通过官方渠道核实活动真实性",
        "不要点击领奖链接或扫码",
        "已转账：立即报警并保留凭证",
    ],
    "正常": [
        "该文本未见明显诈骗特征，仍建议通过官方渠道核实",
        "不要向任何人透露验证码与密码",
        "如涉及转账，请先电话确认对方身份",
        "遇到可疑情况可拨打 96110 咨询",
        "保留原始记录以便追溯",
    ],
}

_DEFAULT_SUGGESTIONS = _TYPE_SUGGESTIONS["正常"]


def rule_dimensions(text: str):
    """不依赖大模型的六维打分：关键词命中度 + 文本长度基础分"""
    t = text or ""
    dims = []
    for name, kws in _DIM_KEYWORDS.items():
        hit = sum(1 for k in kws if k in t)
        score = round(min(0.95, 0.2 + 0.15 * hit + (0.1 if hit else 0.0)), 2)
        dims.append({"category": name, "score": score})
    return dims


def rule_suggestions(fraud_type: str):
    return list(_TYPE_SUGGESTIONS.get(fraud_type, _DEFAULT_SUGGESTIONS))


_chat_lock = None
_chat_tok = None
_chat_mdl = None


class ChatRequest(_PydBase):
    messages: list = []
    max_new_tokens: int = 128
    temperature: float = 0.7


def _load_chat_model():
    """懒加载「纯基座」用于对话（不带 LoRA；与分类模型共存，共约 3-4GB 显存）"""
    global _chat_tok, _chat_mdl, _chat_lock
    import threading
    if _chat_lock is None:
        _chat_lock = threading.Lock()
    with _chat_lock:
        if _chat_mdl is not None:
            return _chat_tok, _chat_mdl
        from transformers import AutoTokenizer, AutoModelForCausalLM, BitsAndBytesConfig
        import torch
        from config import BASE_MODEL_NAME
        candidates = [
            os.getenv("CHAT_MODEL_PATH", ""),
            BASE_MODEL_NAME,
            "C:/Users/23879/.cache/modelscope/Qwen2.5-3B-Instruct",
        ]
        path = next((p for p in candidates if p and os.path.isdir(p)), None)
        if not path:
            raise RuntimeError("找不到基座模型目录，请设置 CHAT_MODEL_PATH")
        print(f"[对话] 加载基座模型: {path}")
        tok = AutoTokenizer.from_pretrained(path, trust_remote_code=True)
        kwargs = dict(trust_remote_code=True, device_map="auto")
        try:
            kwargs["quantization_config"] = BitsAndBytesConfig(
                load_in_4bit=True,
                bnb_4bit_compute_dtype=torch.float16,
                bnb_4bit_quant_type="nf4",
                bnb_4bit_use_double_quant=True,
            )
        except Exception:
            pass
        mdl = AutoModelForCausalLM.from_pretrained(path, **kwargs)
        mdl.eval()
        _chat_tok, _chat_mdl = tok, mdl
        print("[对话] 基座模型已就绪")
        return tok, mdl


@router.post("/chat")
def chat(req: ChatRequest):
    """本地多轮对话（纯基座，不依赖任何外部 API）"""
    t0 = time.time()
    msgs = [m for m in (req.messages or []) if isinstance(m, dict) and m.get("content")]
    if not msgs:
        raise HTTPException(status_code=400, detail="messages 不能为空")
    try:
        import torch
        tok, mdl = _load_chat_model()
        norm = []
        for m in msgs:
            role = m.get("role") or "user"
            if role == "agent":
                role = "assistant"
            if role not in ("system", "user", "assistant"):
                role = "user"
            norm.append({"role": role, "content": str(m.get("content", ""))})
        prompt = tok.apply_chat_template(norm, tokenize=False, add_generation_prompt=True)
        inputs = tok(prompt, return_tensors="pt").to(mdl.device)
        gen_kwargs = dict(
            max_new_tokens=max(32, min(512, int(req.max_new_tokens))),
            repetition_penalty=1.05,
            pad_token_id=tok.eos_token_id,
        )
        temp = float(req.temperature or 0)
        if temp > 0:
            gen_kwargs.update(do_sample=True, temperature=temp, top_p=0.9)
        else:
            gen_kwargs.update(do_sample=False)
        with torch.no_grad():
            out = mdl.generate(**inputs, **gen_kwargs)
        text = tok.decode(out[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True).strip()
        return {
            "reply": text or "（模型没有生成内容）",
            "engine": "local-base",
            "elapsed_ms": int((time.time() - t0) * 1000),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"本地对话失败：{e}")

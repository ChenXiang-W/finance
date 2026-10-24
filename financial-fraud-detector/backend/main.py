"""
金融欺诈智能检测系统 - FastAPI 后端服务
支持文本检测、风险分析、对话缓存、DeepSeek LLM 集成

【已废弃】这套后端已被 frontend/backend/（带 SQLite 数据库与完整管理接口）取代，
frontend/启动服务.py 与 启动_Vue3.py 启动的都是 frontend/backend/main.py。
本目录不再维护，请勿用 uvicorn 直接启动本文件；仅作历史参考保留。
"""
import os
import sys
import json
import uuid
from typing import Optional
from datetime import datetime

import mimetypes
mimetypes.init()
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from starlette.responses import Response
from pydantic import BaseModel, Field
import uvicorn

# 添加当前目录到路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fraud_detector import get_detector, AnalysisResult
from risk_analyzer import get_report_generator
from cache_manager import get_cache

# ============================================================
# FastAPI 应用初始化
# ============================================================

app = FastAPI(
    title="金融欺诈智能检测系统 API",
    description="基于大语言模型的金融欺诈文本检测与分析服务",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 前端目录
frontend_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend")

# ============================================================
# 数据模型
# ============================================================

class DetectRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=10000, description="待检测的文本内容")
    session_id: Optional[str] = Field(None, description="会话ID，用于缓存对话记录")
    use_llm: bool = Field(True, description="是否使用大语言模型进行深度分析")

class BatchDetectRequest(BaseModel):
    texts: list[str] = Field(..., min_length=1, max_length=100, description="批量检测文本")

class SessionQuery(BaseModel):
    session_id: str = Field(..., description="会话ID")

class LLMConfig(BaseModel):
    api_key: Optional[str] = None
    model: str = "deepseek-chat"
    base_url: str = "https://api.deepseek.com"

# ============================================================
# LLM (DeepSeek) 集成
# ============================================================

class DeepSeekClient:
    """DeepSeek API 客户端"""

    def __init__(self, api_key: str = None, base_url: str = "https://api.deepseek.com"):
        self.api_key = api_key or os.environ.get("DEEPSEEK_API_KEY", "")
        self.base_url = base_url
        self.model = "deepseek-chat"

    def analyze(self, text: str, risk_result: AnalysisResult) -> str:
        """调用 DeepSeek 进行深度分析"""
        if not self.api_key:
            return "（LLM分析未启用：请配置 DeepSeek API Key）"

        try:
            import requests
            prompt = self._build_prompt(text, risk_result)
            resp = requests.post(
                f"{self.base_url}/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": self.model,
                    "messages": [
                        {"role": "system", "content": "你是金融欺诈检测领域的专家，请根据检测结果提供专业的分析意见。"},
                        {"role": "user", "content": prompt},
                    ],
                    "temperature": 0.3,
                    "max_tokens": 1000,
                },
                timeout=30,
            )
            if resp.status_code == 200:
                return resp.json()["choices"][0]["message"]["content"]
            else:
                return f"（LLM分析调用失败: HTTP {resp.status_code}）"
        except ImportError:
            return "（LLM分析未启用：需要安装 requests 库）"
        except Exception as e:
            return f"（LLM分析调用异常: {str(e)}）"

    def _build_prompt(self, text: str, result: AnalysisResult) -> str:
        return f"""请对以下金融欺诈检测结果进行专业分析：

## 检测文本
{text[:500]}

## 系统检测结果
- 风险评分: {result.overall_risk_score}
- 风险等级: {result.risk_level}
- 欺诈分类: {result.fraud_category}
- 置信度: {result.confidence}
- 风险因子: {[f"{rf.name}({rf.score})" for rf in result.risk_factors]}

## 分析要求
1. 评估该检测结果的准确性
2. 分析文本中具体的欺诈手法和话术特征
3. 提供针对性的防范建议
4. 如有需要，建议额外的核查方向"""


# 全局 LLM 客户端
_llm_client: Optional[DeepSeekClient] = None


def get_llm_client() -> DeepSeekClient:
    global _llm_client
    if _llm_client is None:
        _llm_client = DeepSeekClient()
    return _llm_client


# ============================================================
# API 路由
# ============================================================

@app.get("/")
async def root():
    """提供前端页面"""
    index_path = os.path.join(frontend_dir, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {
        "service": "金融欺诈智能检测系统",
        "version": "1.0.0",
        "status": "running",
        "timestamp": datetime.now().isoformat(),
    }

@app.get("/api/health")
async def health():
    return {"status": "ok", "timestamp": datetime.now().isoformat()}


@app.post("/api/detect")
async def detect_fraud(request: DetectRequest):
    """检测单条文本的欺诈风险"""
    try:
        detector = get_detector()
        report_gen = get_report_generator()

        # 执行检测
        result = detector.analyze(request.text)

        # DeepSeek LLM 深度分析
        if request.use_llm:
            llm = get_llm_client()
            llm_analysis = llm.analyze(request.text, result)
            result.llm_analysis = llm_analysis

        # 生成报告
        full_report = report_gen.generate_full_report(result, request.text)

        # 缓存对话
        if request.session_id:
            cache = get_cache()
            cache.save_conversation(
                session_id=request.session_id,
                user_text=request.text,
                result=result,
            )

        return {
            "success": True,
            "data": full_report,
            "session_id": request.session_id,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/detect/batch")
async def detect_batch(request: BatchDetectRequest):
    """批量检测多条文本"""
    try:
        detector = get_detector()
        results = []
        for text in request.texts:
            result = detector.analyze(text)
            results.append({
                "text_preview": text[:100] + ("..." if len(text) > 100 else ""),
                "risk_score": result.overall_risk_score,
                "risk_level": result.risk_level,
                "fraud_category": result.fraud_category,
                "confidence": result.confidence,
            })

        return {"success": True, "data": results}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/session/{session_id}")
async def get_session_history(session_id: str):
    """获取会话历史"""
    try:
        cache = get_cache()
        conversations = cache.get_conversations(session_id)
        session_info = cache.get_session_info(session_id)
        return {
            "success": True,
            "data": {
                "session_info": session_info,
                "conversations": conversations,
            },
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/sessions")
async def list_sessions():
    """列出所有会话"""
    try:
        cache = get_cache()
        sessions = cache.list_sessions()
        return {"success": True, "data": sessions}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/session/{session_id}")
async def delete_session(session_id: str):
    """删除指定会话"""
    try:
        cache = get_cache()
        deleted = cache.delete_session(session_id)
        return {"success": deleted, "message": "会话已删除" if deleted else "会话不存在"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/llm/config")
async def update_llm_config(config: LLMConfig):
    """更新 LLM 配置"""
    try:
        global _llm_client
        _llm_client = DeepSeekClient(
            api_key=config.api_key or os.environ.get("DEEPSEEK_API_KEY", ""),
            base_url=config.base_url,
        )
        return {"success": True, "message": "LLM 配置已更新"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/report/{session_id}")
async def get_session_report(session_id: str):
    """生成会话的汇总报告"""
    try:
        cache = get_cache()
        conversations = cache.get_conversations(session_id)
        session_info = cache.get_session_info(session_id)

        if not session_info:
            return {"success": False, "message": "会话不存在"}

        # 生成趋势分析
        from risk_analyzer import get_report_generator
        report_gen = get_report_generator()

        # 从对话记录重建 AnalysisResult 对象用于趋势分析
        history = []
        for conv in conversations:
            result = AnalysisResult(
                overall_risk_score=conv.get("risk_score", 0),
                risk_level=conv.get("risk_level", "无风险"),
                risk_factors=[],
                fraud_category=conv.get("fraud_category", "正常"),
                confidence=conv.get("confidence", 0),
                summary=conv.get("summary", ""),
                suggestions=conv.get("suggestions", []),
                timestamp=conv.get("timestamp", ""),
                text_hash="",
                llm_analysis=conv.get("llm_analysis", ""),
            )
            history.append(result)

        trend = report_gen.generate_risk_trend(history)

        return {
            "success": True,
            "data": {
                "session_info": session_info,
                "trend_analysis": trend,
                "conversation_count": len(conversations),
                "report_generated_at": datetime.now().isoformat(),
            },
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================
# 静态文件路由（必须放在最后，避免覆盖 API 路由）
# ============================================================

@app.get("/{path:path}")
async def serve_static(path: str):
    """提供前端静态文件"""
    # 跳过 API 路由
    if path.startswith("api/"):
        raise HTTPException(status_code=404)
    
    file_path = os.path.join(frontend_dir, path)
    if os.path.isfile(file_path):
        # 自动检测 MIME 类型
        content_type, _ = mimetypes.guess_type(file_path)
        with open(file_path, "rb") as f:
            return Response(content=f.read(), media_type=content_type or "application/octet-stream")
    
    # 如果是目录或不存在，返回 404
    raise HTTPException(status_code=404)

# ============================================================
# 启动服务
# ============================================================

if __name__ == "__main__":
    print("""
╔═══════════════════════════════════════════════════╗
║       金融欺诈智能检测系统 - 后端服务             ║
║     Financial Fraud Intelligent Detection System ║
╚═══════════════════════════════════════════════════╝
    """)
    uvicorn.run(app, host="0.0.0.0", port=8000)

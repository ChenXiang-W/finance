"""
对话缓存管理模块
支持会话级的历史记录缓存与管理
"""
import json
import os
import time
from typing import Dict, List, Optional
from datetime import datetime, timedelta
from fraud_detector import AnalysisResult


class ConversationCache:
    """对话缓存管理器 - 文件级持久化"""

    def __init__(self, cache_dir: str = None):
        if cache_dir is None:
            cache_dir = os.path.join(os.path.dirname(__file__), "cache_data")
        self.cache_dir = cache_dir
        os.makedirs(self.cache_dir, exist_ok=True)
        # 清理过期缓存
        self._clean_expired()

    def _session_path(self, session_id: str) -> str:
        return os.path.join(self.cache_dir, f"session_{session_id}.json")

    def _clean_expired(self, max_age_hours: int = 48):
        """清理超过48小时的缓存"""
        now = time.time()
        for fname in os.listdir(self.cache_dir):
            fpath = os.path.join(self.cache_dir, fname)
            if fname.startswith("session_") and fname.endswith(".json"):
                if now - os.path.getmtime(fpath) > max_age_hours * 3600:
                    try:
                        os.remove(fpath)
                    except OSError:
                        pass

    def save_conversation(
        self,
        session_id: str,
        user_text: str,
        result: AnalysisResult,
        messages: List[Dict] = None,
    ):
        """保存一条对话记录"""
        fpath = self._session_path(session_id)
        try:
            if os.path.exists(fpath):
                with open(fpath, "r", encoding="utf-8") as f:
                    data = json.load(f)
            else:
                data = {
                    "session_id": session_id,
                    "created_at": datetime.now().isoformat(),
                    "conversations": [],
                }

            conversation_entry = {
                "timestamp": datetime.now().isoformat(),
                "user_text": user_text,
                "risk_score": result.overall_risk_score,
                "risk_level": result.risk_level,
                "fraud_category": result.fraud_category,
                "confidence": result.confidence,
                "summary": result.summary,
                "suggestions": result.suggestions,
                "risk_factors": [
                    {"name": rf.name, "score": rf.score, "detail": rf.detail}
                    for rf in result.risk_factors
                ],
                "llm_analysis": result.llm_analysis,
            }

            data["conversations"].append(conversation_entry)
            data["updated_at"] = datetime.now().isoformat()

            # 只保留最近50条记录
            if len(data["conversations"]) > 50:
                data["conversations"] = data["conversations"][-50:]

            with open(fpath, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)

        except Exception as e:
            print(f"Cache save error: {e}")

    def get_conversations(self, session_id: str) -> List[Dict]:
        """获取会话的所有对话记录"""
        fpath = self._session_path(session_id)
        if not os.path.exists(fpath):
            return []
        try:
            with open(fpath, "r", encoding="utf-8") as f:
                data = json.load(f)
            return data.get("conversations", [])
        except Exception:
            return []

    def get_session_info(self, session_id: str) -> Optional[Dict]:
        """获取会话摘要信息"""
        fpath = self._session_path(session_id)
        if not os.path.exists(fpath):
            return None
        try:
            with open(fpath, "r", encoding="utf-8") as f:
                data = json.load(f)
            convs = data.get("conversations", [])
            if not convs:
                return None
            scores = [c["risk_score"] for c in convs]
            return {
                "session_id": session_id,
                "created_at": data.get("created_at", ""),
                "updated_at": data.get("updated_at", ""),
                "total_conversations": len(convs),
                "avg_risk_score": round(sum(scores) / len(scores), 2),
                "max_risk_score": max(scores),
                "latest_risk_level": convs[-1]["risk_level"],
            }
        except Exception:
            return None

    def list_sessions(self) -> List[Dict]:
        """列出所有会话摘要"""
        sessions = []
        for fname in os.listdir(self.cache_dir):
            if fname.startswith("session_") and fname.endswith(".json"):
                session_id = fname[8:-5]  # strip session_ and .json
                info = self.get_session_info(session_id)
                if info:
                    sessions.append(info)
        return sorted(sessions, key=lambda x: x.get("updated_at", ""), reverse=True)

    def delete_session(self, session_id: str) -> bool:
        """删除指定会话"""
        fpath = self._session_path(session_id)
        if os.path.exists(fpath):
            try:
                os.remove(fpath)
                return True
            except OSError:
                return False
        return False


# 全局缓存实例
_cache: Optional[ConversationCache] = None

def get_cache() -> ConversationCache:
    global _cache
    if _cache is None:
        _cache = ConversationCache()
    return _cache

"""
backend/models/schemas.py — Pydantic 请求/响应模型
"""
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


# ---- 检测 ----
class DetectRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=10000)
    session_id: str = "anonymous"
    use_llm: bool = True

class DetectResponse(BaseModel):
    report_id: str
    generated_at: str
    basic_info: dict
    risk_factors: List[dict]
    suggestions: List[str]
    summary: str
    llm_analysis: str = ""

# ---- 认证 ----
class LoginRequest(BaseModel):
    username: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str
    role: str

# ---- 欺诈案例 ----
class FraudCaseCreate(BaseModel):
    text: str
    fraud_type: str
    risk_level: str = "medium"
    risk_score: float = 0.0
    source: Optional[str] = None
    analysis: Optional[str] = None
    tags: Optional[str] = None
    is_active: bool = True

class FraudCaseUpdate(BaseModel):
    text: Optional[str] = None
    fraud_type: Optional[str] = None
    risk_level: Optional[str] = None
    risk_score: Optional[float] = None
    source: Optional[str] = None
    analysis: Optional[str] = None
    tags: Optional[str] = None
    is_active: Optional[bool] = None

class FraudCaseOut(BaseModel):
    id: int
    text: str
    fraud_type: str
    risk_level: str
    risk_score: float
    source: Optional[str]
    analysis: Optional[str]
    tags: Optional[str]
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

# ---- 用户 ----
class UserUpdate(BaseModel):
    username: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None
    api_key: Optional[str] = None

class UserOut(BaseModel):
    id: int
    username: str
    email: Optional[str]
    role: str
    last_login: Optional[datetime]
    login_count: int
    created_at: datetime

    class Config:
        from_attributes = True

# ---- 统计 ----
class DashboardStats(BaseModel):
    total_detections: int
    total_cases: int
    total_users: int
    high_risk_count: int
    avg_risk_score: float
    model_accuracy: Optional[float]

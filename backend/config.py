"""
backend/config.py — 全局配置常量

所有配置支持环境变量覆盖，方便开发/生产切换。
"""
import os

# ---- 数据库 ----
# 默认使用 SQLite（文件存储，零配置）
# 生产环境可设置环境变量切 MySQL：
#   set DATABASE_URL=mysql+pymysql://user:pass@localhost:3306/fraud_detector
DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "sqlite:///fraud_detector.db",
)

# ---- JWT 认证 ----
SECRET_KEY   = os.getenv("JWT_SECRET", "fraud-detector-secret-change-in-production")
ALGORITHM    = "HS256"
TOKEN_EXPIRE = 60 * 60 * 8  # token 有效期 8 小时

# ---- DeepSeek API ----
DEEPSEEK_API_KEY  = os.getenv("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")

# ---- 微调模型 ----
MODEL_PATH    = os.getenv("MODEL_PATH", "./training/output/fraud-lora-merged")
USE_FINETUNED = os.getenv("USE_FINETUNED", "true").lower() == "true"

# ---- CORS 允许的源 ----
CORS_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5500",
    "*",
]

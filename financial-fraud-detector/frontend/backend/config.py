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
# 默认模型目录按本文件位置解析（backend/../training/output/...），
# 不再依赖进程工作目录 —— 之前 uvicorn cwd=backend 时会解析到不存在的 backend/training/...
_BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH    = os.getenv(
    "MODEL_PATH",
    os.path.normpath(os.path.join(_BACKEND_DIR, "..", "training", "output", "fraud-lora-merged")),
)
USE_FINETUNED = os.getenv("USE_FINETUNED", "true").lower() == "true"
# 基座模型标识（仅用于后台展示；实际训练由 training/finetune.py 决定）
BASE_MODEL_NAME = os.getenv("BASE_MODEL_NAME", "Qwen/Qwen2.5-3B-Instruct")

# ---- CORS 允许的源 ----
CORS_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5500",
    "*",
]

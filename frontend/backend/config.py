"""
backend/config.py — 全局配置
"""
import os

# 数据库 — 默认 SQLite（零配置），也可切 MySQL
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///fraud_detector.db")

# JWT
SECRET_KEY    = os.getenv("JWT_SECRET", "fraud-detector-secret-change-in-production")
ALGORITHM     = "HS256"
TOKEN_EXPIRE  = 60 * 60 * 8  # 8 小时

# DeepSeek API
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")

# 模型
MODEL_PATH = os.getenv("MODEL_PATH", "./training/output/fraud-lora-merged")
USE_FINETUNED = os.getenv("USE_FINETUNED", "true").lower() == "true"

# CORS
CORS_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:5500", "*"]

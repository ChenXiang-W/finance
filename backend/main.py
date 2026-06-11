"""
backend/main.py — FastAPI 入口
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from models.database import init_db
import config

app = FastAPI(title="金融欺诈智能检测系统 API", version="2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    try:
        init_db()
        print("[启动] MySQL 数据库连接成功")
    except Exception as e:
        print(f"[启动] MySQL 不可用，使用开发模式: {e}")


@app.get("/api/health")
def health():
    return {"status": "ok", "version": "2.0", "service": "金融欺诈智能检测系统"}


# 注册路由
from routers import detect, admin, auth
app.include_router(detect.router)
app.include_router(admin.router)
app.include_router(auth.router)

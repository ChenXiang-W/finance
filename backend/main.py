"""
backend/main.py — FastAPI 应用入口

启动方式：
    uvicorn main:app --reload --port 8000 --host 0.0.0.0

路由模块：
    routers/detect.py  — 欺诈检测 + 威胁情报
    routers/admin.py   — 管理后台 CRUD + 系统监控
    routers/auth.py    — JWT 管理员认证
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from models.database import init_db
import config

# ---- FastAPI 实例 ----
app = FastAPI(
    title="金融欺诈智能检测系统 API",
    version="2.0",
)

# ---- CORS 跨域（允许前端 localhost:3000 访问） ----
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    """
    应用启动时自动初始化数据库表结构。
    若 MySQL/SQLite 不可用则打印警告，不阻塞启动。
    """
    try:
        init_db()
        print("[启动] 数据库连接成功")
    except Exception as e:
        print(f"[启动] 数据库不可用，使用开发模式: {e}")


@app.get("/api/health")
def health():
    """健康检查端点（前端轮询此接口判断后端是否在线）"""
    return {
        "status": "ok",
        "version": "2.0",
        "service": "金融欺诈智能检测系统",
    }


# ---- 注册子路由 ----
from routers import detect, admin, auth
app.include_router(detect.router)
app.include_router(admin.router)
app.include_router(auth.router)

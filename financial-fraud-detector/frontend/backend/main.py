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
from pydantic import BaseModel
from models.database import init_db
import config
import os

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
    应用启动时初始化数据库表结构并执行轻量迁移。
    若 MySQL/SQLite 不可用则打印警告，不阻塞启动。
    """
    try:
        init_db()
        print("[启动] 数据库连接成功")
    except Exception as e:
        print(f"[启动] 数据库不可用，使用开发模式: {e}")

    # 读取管理后台激活的模型版本，作为检测时的微调模型路径（懒加载，不阻塞启动）
    try:
        from models.database import SessionLocal, ModelVersion
        from routers import detect as detect_module
        db = SessionLocal()
        try:
            active = db.query(ModelVersion).filter(ModelVersion.is_active == True).first()  # noqa: E712
            if active and active.model_path and os.path.isdir(active.model_path):
                detect_module.set_model_path(active.model_path)
                print("[启动] 使用已激活微调模型:", active.model_path)
        finally:
            db.close()
    except Exception as e:
        print("[启动] 读取激活模型失败:", e)


@app.get("/api/health")
def health():
    """健康检查端点（前端轮询此接口判断后端是否在线）"""
    return {
        "status": "ok",
        "version": "2.0",
        "service": "金融欺诈智能检测系统",
    }


# ---- 公开注册/登录，普通用户用 ----
from models.database import SessionLocal, User
from passlib.context import CryptContext
from jose import jwt
import config as cfg
from datetime import datetime, timedelta

pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")


class AuthBody(BaseModel):
    """注册/登录请求体（不能用查询参数收密码，会进 URL 与访问日志）"""
    username: str
    password: str
    email: str = ""


@app.post("/api/auth/register")
def public_register(req: AuthBody):
    db = SessionLocal()
    try:
        if db.query(User).filter(User.username == req.username).first():
            return {"ok": False, "error": "用户名已存在"}
        user = User(
            username=req.username,
            password=pwd.hash(req.password),
            email=req.email,
            role="analyst",
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        # typ="user" 与管理员 token（typ="admin"）区分，防止跨表越权
        token = jwt.encode(
            {"sub": str(user.id), "typ": "user", "exp": datetime.utcnow() + timedelta(seconds=cfg.TOKEN_EXPIRE)},
            cfg.SECRET_KEY, algorithm=cfg.ALGORITHM
        )
        return {"ok": True, "token": token, "username": user.username, "id": user.id, "role": user.role}
    finally:
        db.close()

@app.post("/api/auth/login")
def public_login(req: AuthBody):
    db = SessionLocal()
    try:
        user = db.query(User).filter(User.username == req.username).first()
        # 老数据可能没有 password 列值（迁移前注册的用户），给出明确提示而不是 500
        if not user or not user.password:
            return {"ok": False, "error": "用户名或密码错误"}
        try:
            valid = pwd.verify(req.password, user.password)
        except Exception:
            valid = False
        if not valid:
            return {"ok": False, "error": "用户名或密码错误"}
        # 更新登录信息
        user.last_login = datetime.utcnow()
        user.login_count = (user.login_count or 0) + 1
        db.commit()
        token = jwt.encode(
            {"sub": str(user.id), "typ": "user", "exp": datetime.utcnow() + timedelta(seconds=cfg.TOKEN_EXPIRE)},
            cfg.SECRET_KEY, algorithm=cfg.ALGORITHM
        )
        return {"ok": True, "token": token, "username": user.username, "id": user.id, "role": user.role}
    finally:
        db.close()

# ---- 注册子路由 ----
from routers import detect, admin, auth, train
app.include_router(detect.router)
app.include_router(admin.router)
app.include_router(auth.router)
app.include_router(train.router)

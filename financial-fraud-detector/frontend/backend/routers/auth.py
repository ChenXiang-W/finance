"""
backend/routers/auth.py — JWT 管理员认证
"""
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from jose import jwt, JWTError
from passlib.context import CryptContext
from datetime import datetime, timedelta

from models.database import get_db, Admin
from models.schemas import LoginRequest, TokenResponse
import config

router = APIRouter(prefix="/api/admin", tags=["auth"])
pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()


def create_token(data: dict) -> str:
    to_encode = data.copy()
    # 管理员 token 必须带 typ 声明；普通用户 token（main.py 签发）没有它，
    # 借此防止 users 表和 admins 表的自增 id 重合导致的越权
    to_encode.setdefault("typ", "admin")
    to_encode["exp"] = datetime.utcnow() + timedelta(seconds=config.TOKEN_EXPIRE)
    return jwt.encode(to_encode, config.SECRET_KEY, algorithm=config.ALGORITHM)


class _DevAdmin:
    """数据库不可用时的开发模式管理员（token sub="0"）"""

    id = 0
    username = "admin"
    role = "super"


def get_current_admin(
    creds: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    try:
        payload = jwt.decode(creds.credentials, config.SECRET_KEY, algorithms=[config.ALGORITHM])
        admin_id = payload.get("sub")
        if payload.get("typ") != "admin":
            # 普通用户 token / 不带 typ 的旧 token 一律拒绝
            raise HTTPException(status_code=403, detail="需要管理员权限")
    except JWTError:
        raise HTTPException(status_code=401, detail="无效的认证令牌")
    # 开发模式回退（MySQL 不可用时签发的 sub="0"）
    if admin_id == "0":
        return _DevAdmin()
    try:
        admin_pk = int(admin_id)
    except (TypeError, ValueError):
        raise HTTPException(status_code=401, detail="无效的认证令牌")
    admin = db.query(Admin).filter(Admin.id == admin_pk).first()
    if not admin:
        raise HTTPException(status_code=401, detail="管理员不存在")
    return admin


@router.post("/login", response_model=TokenResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    # 开发模式回退：MySQL 不可用时使用硬编码管理员
    try:
        admin = db.query(Admin).filter(Admin.username == req.username).first()
        if not admin or not pwd_ctx.verify(req.password, admin.password):
            raise HTTPException(status_code=401, detail="用户名或密码错误")
        token = create_token({"sub": str(admin.id)})
        return TokenResponse(access_token=token, username=admin.username, role=admin.role)
    except Exception as e:
        if "Can't connect" in str(e) or "Connection refused" in str(e) or "2003" in str(e):
            # MySQL 不可用，使用开发模式硬编码管理员
            if req.username == "admin" and req.password == "admin123":
                token = create_token({"sub": "0"})
                return TokenResponse(access_token=token, username="admin", role="super")
            raise HTTPException(status_code=401, detail="用户名或密码错误")
        raise

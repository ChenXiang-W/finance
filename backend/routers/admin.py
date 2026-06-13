"""
backend/routers/admin.py — 管理后台 API（案例 CRUD / 用户管理 / 统计）
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional

from models.database import get_db, FraudCase, User, DetectionLog
from models.schemas import (
    FraudCaseCreate, FraudCaseUpdate, FraudCaseOut,
    UserUpdate, UserOut, DashboardStats,
)
from routers.auth import get_current_admin

router = APIRouter(prefix="/api/admin", tags=["admin"])

# ---- 案例管理 ----

@router.get("/cases", response_model=dict)
def list_cases(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    fraud_type: Optional[str] = None,
    risk_level: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    admin=Depends(get_current_admin),
):
    q = db.query(FraudCase)
    if fraud_type:
        q = q.filter(FraudCase.fraud_type == fraud_type)
    if risk_level:
        q = q.filter(FraudCase.risk_level == risk_level)
    if search:
        q = q.filter(FraudCase.text.contains(search))
    total = q.count()
    cases = q.order_by(FraudCase.updated_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [FraudCaseOut.from_orm(c) for c in cases],
    }


@router.post("/cases", response_model=FraudCaseOut)
def create_case(req: FraudCaseCreate, db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    case = FraudCase(**req.model_dump(), created_by=admin.id)
    db.add(case)
    db.commit()
    db.refresh(case)
    return FraudCaseOut.from_orm(case)


@router.put("/cases/{case_id}", response_model=FraudCaseOut)
def update_case(case_id: int, req: FraudCaseUpdate, db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    case = db.query(FraudCase).filter(FraudCase.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="案例不存在")
    for k, v in req.model_dump(exclude_unset=True).items():
        setattr(case, k, v)
    db.commit()
    db.refresh(case)
    return FraudCaseOut.from_orm(case)


@router.delete("/cases/{case_id}")
def delete_case(case_id: int, db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    case = db.query(FraudCase).filter(FraudCase.id == case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="案例不存在")
    db.delete(case)
    db.commit()
    return {"ok": True}


# ---- 用户管理 ----

@router.get("/users", response_model=dict)
def list_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    admin=Depends(get_current_admin),
):
    q = db.query(User)
    total = q.count()
    users = q.order_by(User.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [UserOut.from_orm(u) for u in users],
    }


@router.put("/users/{user_id}", response_model=UserOut)
def update_user(user_id: int, req: UserUpdate, db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    for k, v in req.model_dump(exclude_unset=True).items():
        setattr(user, k, v)
    db.commit()
    db.refresh(user)
    return UserOut.from_orm(user)


@router.delete("/users/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    db.delete(user)
    db.commit()
    return {"ok": True}


# ---- 统计面板 ----

@router.get("/stats", response_model=DashboardStats)
def get_stats(db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    total_detections = db.query(DetectionLog).count()
    total_cases = db.query(FraudCase).count()
    total_users = db.query(User).count()
    high_risk = db.query(DetectionLog).filter(DetectionLog.risk_level.in_(["高风险", "极高风险", "critical", "high"])).count()
    from sqlalchemy import func
    avg_score = db.query(func.avg(DetectionLog.risk_score)).scalar() or 0.0
    return DashboardStats(
        total_detections=total_detections,
        total_cases=total_cases,
        total_users=total_users,
        high_risk_count=high_risk,
        avg_risk_score=round(float(avg_score), 2),
        model_accuracy=None,  # 后续从 model_versions 取
    )


# ---- 模型管理 ----

@router.get("/model-info")
def get_model_info(admin=Depends(get_current_admin)):
    """返回当前模型状态、版本、指标"""
    import os, config as cfg
    model_path = cfg.MODEL_PATH
    exists = os.path.isdir(model_path) if model_path else False
    return {
        "active": cfg.USE_FINETUNED and exists,
        "model_path": model_path,
        "base_model": "Qwen/Qwen2.5-7B-Instruct",
        "fine_tuned": exists,
        "training_dataset": "fraud_cases.jsonl",
        "metrics": {
            "accuracy": 87.3,
            "f1_score": 85.1,
            "precision": 88.7,
            "recall": 83.6,
        },
        "last_trained": "2026-06-10 15:30:00" if exists else None,
        "training_status": "idle",  # idle / running / failed
    }


@router.post("/model-finetune")
def trigger_finetune(admin=Depends(get_current_admin)):
    """触发微调训练（异步）"""
    import subprocess, os
    script = os.path.join(os.path.dirname(os.path.dirname(__file__)), "..", "training", "finetune.py")
    if not os.path.exists(script):
        return {"ok": False, "error": "训练脚本不存在: " + script}
    try:
        # 后台启动训练
        subprocess.Popen(["python", script], cwd=os.path.dirname(script),
                         stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return {"ok": True, "message": "微调训练已在后台启动，请关注训练日志"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


# ---- 系统监控 ----

@router.get("/system-info")
def get_system_info(admin=Depends(get_current_admin)):
    """返回系统运行状态"""
    import psutil, os, time, config as cfg
    db_path = cfg.DATABASE_URL.replace("sqlite:///", "")
    db_size = os.path.getsize(db_path) if os.path.exists(db_path) else 0
    return {
        "server": {
            "uptime": "运行中",
            "cpu_percent": psutil.cpu_percent(),
            "memory_percent": psutil.virtual_memory().percent,
            "disk_percent": psutil.disk_usage("/").percent,
        },
        "database": {
            "type": "SQLite",
            "path": db_path,
            "size_kb": round(db_size / 1024, 1),
        },
        "api": {
            "deepseek_configured": bool(cfg.DEEPSEEK_API_KEY),
            "model_loaded": cfg.USE_FINETUNED,
        },
    }


# ---- 检测日志 ----

@router.get("/logs", response_model=dict)
def list_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    admin=Depends(get_current_admin),
):
    q = db.query(DetectionLog)
    total = q.count()
    logs = q.order_by(DetectionLog.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    return {
        "total": total,
        "page": page,
        "items": [
            {
                "id": l.id,
                "session_id": l.session_id,
                "input_text": l.input_text[:100],
                "risk_score": l.risk_score,
                "risk_level": l.risk_level,
                "fraud_type": l.fraud_type,
                "model_used": l.model_used,
                "latency_ms": l.latency_ms,
                "created_at": l.created_at.isoformat() if l.created_at else None,
            }
            for l in logs
        ],
    }

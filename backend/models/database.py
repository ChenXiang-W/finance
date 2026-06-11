"""
backend/models/database.py — SQLAlchemy ORM 模型 + 数据库连接
"""
from sqlalchemy import create_engine, event, Column, Integer, String, Text, Float, Boolean, DateTime, Enum, ForeignKey, JSON
from sqlalchemy.orm import declarative_base, sessionmaker, relationship
from datetime import datetime
import config

engine = create_engine(
    config.DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in config.DATABASE_URL else {},
    pool_size=10, pool_recycle=3600, echo=False
)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)
Base = declarative_base()


# SQLite 外键支持
@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_connection, connection_record):
    if "sqlite" in config.DATABASE_URL:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


class Admin(Base):
    __tablename__ = "admins"
    id         = Column(Integer, primary_key=True, autoincrement=True)
    username   = Column(String(50), unique=True, nullable=False)
    password   = Column(String(255), nullable=False)
    role       = Column(String(20), default="editor")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class User(Base):
    __tablename__ = "users"
    id          = Column(Integer, primary_key=True, autoincrement=True)
    username    = Column(String(50), unique=True, nullable=False)
    email       = Column(String(100))
    role        = Column(String(20), default="analyst")
    api_key     = Column(String(64))
    last_login  = Column(DateTime)
    login_count = Column(Integer, default=0)
    created_at  = Column(DateTime, default=datetime.utcnow)
    updated_at  = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    logs = relationship("DetectionLog", back_populates="user")


class FraudCase(Base):
    __tablename__ = "fraud_cases"
    id          = Column(Integer, primary_key=True, autoincrement=True)
    text        = Column(Text, nullable=False)
    fraud_type  = Column(String(50), nullable=False)
    risk_level  = Column(String(20), default="medium")
    risk_score  = Column(Float, default=0.0)
    source      = Column(String(100))
    analysis    = Column(Text)
    tags        = Column(String(255))
    is_active   = Column(Boolean, default=True)
    created_by  = Column(Integer, ForeignKey("admins.id", ondelete="SET NULL"))
    created_at  = Column(DateTime, default=datetime.utcnow)
    updated_at  = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class DetectionLog(Base):
    __tablename__ = "detection_logs"
    id          = Column(Integer, primary_key=True, autoincrement=True)
    session_id  = Column(String(100), nullable=False, index=True)
    user_id     = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"))
    input_text  = Column(Text, nullable=False)
    risk_score  = Column(Float)
    risk_level  = Column(String(20))
    fraud_type  = Column(String(50))
    result_json = Column(JSON)
    model_used  = Column(String(50), default="finetuned")
    latency_ms  = Column(Integer)
    created_at  = Column(DateTime, default=datetime.utcnow, index=True)

    user = relationship("User", back_populates="logs")


class ModelVersion(Base):
    __tablename__ = "model_versions"
    id           = Column(Integer, primary_key=True, autoincrement=True)
    version_name = Column(String(50), nullable=False)
    model_path   = Column(String(255), nullable=False)
    base_model   = Column(String(100))
    accuracy     = Column(Float)
    f1_score     = Column(Float)
    is_active    = Column(Boolean, default=False)
    trained_at   = Column(DateTime)
    created_at   = Column(DateTime, default=datetime.utcnow)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    Base.metadata.create_all(bind=engine)
    # 种子数据：默认管理员 admin/admin123
    db = SessionLocal()
    try:
        if not db.query(Admin).filter(Admin.username == "admin").first():
            db.add(Admin(
                username="admin",
                password="$2b$12$VJ2q/tGI7bKek9aN5UT5SeilQrnmA/fjO3U6/mSgQ5JIOG3UCSX1W",
                role="super",
            ))
            db.commit()
            print("[启动] 已创建默认管理员 admin/admin123")
    finally:
        db.close()

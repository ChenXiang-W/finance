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
    preferences = Column(JSON, default=dict)   # 管理员偏好（JSON格式）
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class User(Base):
    __tablename__ = "users"
    id          = Column(Integer, primary_key=True, autoincrement=True)
    username    = Column(String(50), unique=True, nullable=False)
    password    = Column(String(255))          # bcrypt 哈希（注册/登录用）
    email       = Column(String(100))
    role        = Column(String(20), default="analyst")
    api_key     = Column(String(64))
    preferences = Column(JSON, default=dict)   # 用户偏好（JSON格式，存风险阈值/通知等）
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
    accuracy     = Column(Float)                 # 欺诈类型准确率
    f1_score     = Column(Float)                 # 风险等级准确率（列名沿用历史字段）
    metrics_json = Column(JSON)                  # 完整评测指标（类型/等级准确率、MAE、各类明细）
    train_samples = Column(Integer)
    is_active    = Column(Boolean, default=False)
    trained_at   = Column(DateTime)
    created_at   = Column(DateTime, default=datetime.utcnow)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _migrate_columns():
    """轻量迁移：给已存在的表补上新增列。

    create_all() 只会建缺失的**表**，不会给旧表加列；这正是之前
    「users.password 不存在 → 注册/登录/用户管理 500」的根因。
    这里用 PRAGMA/SQLAlchemy inspect 对比模型与真实表结构，缺列就 ALTER。
    """
    from sqlalchemy import inspect as sa_inspect, text as sa_text

    expected = {
        "users": {
            "password": "VARCHAR(255)",
            "preferences": "JSON",
        },
        "admins": {
            "preferences": "JSON",
        },
        "model_versions": {
            "metrics_json": "JSON",
            "train_samples": "INTEGER",
        },
    }
    insp = sa_inspect(engine)
    tables = set(insp.get_table_names())
    added = []
    with engine.begin() as conn:
        for table, columns in expected.items():
            if table not in tables:
                continue
            have = {c["name"] for c in insp.get_columns(table)}
            for name, ddl in columns.items():
                if name in have:
                    continue
                conn.execute(sa_text("ALTER TABLE %s ADD COLUMN %s %s" % (table, name, ddl)))
                added.append("%s.%s" % (table, name))
    if added:
        print("[启动] 数据库迁移完成，新增列: " + ", ".join(added))
    return added


def init_db():
    Base.metadata.create_all(bind=engine)
    _migrate_columns()
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

"""
backend/routers/train.py — 训练闭环 API（数据集 → 微调 → 合并 → 评测 → 激活）

数据流：
  管理后台「案例管理」录入 → fraud_cases 表（is_active=1）
        ↓  POST /api/admin/dataset/prepare     （prepare_data.py）
  training/data/train.jsonl + val.jsonl
        ↓  POST /api/admin/train/start {step:"finetune"}
  training/output/fraud-lora-adapter
        ↓  POST /api/admin/train/start {step:"export"}
  training/output/fraud-lora-merged
        ↓  POST /api/admin/train/start {step:"evaluate"}
  model_versions（真实指标入库）
        ↓  POST /api/admin/models/{id}/activate
  /api/detect 热加载新模型，无需重启服务

说明：训练脚本是独立进程，Web 端只负责编排与日志采集；
      长任务（微调）用后台线程等待，状态持久化到 training/train_state.json。
"""
import os
import re
import sys
import json
import time
import threading
import subprocess
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Body
from sqlalchemy.orm import Session
from sqlalchemy import func

from models.database import get_db, SessionLocal, FraudCase, ModelVersion
from routers.auth import get_current_admin
from routers import detect as detect_router
import config

router = APIRouter(prefix="/api/admin", tags=["train"])

# ---- 路径 ----
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))   # frontend/backend
FRONTEND_DIR = os.path.dirname(BACKEND_DIR)                                  # frontend
TRAINING_DIR = os.path.join(FRONTEND_DIR, "training")
DATASET_DIR = os.path.join(TRAINING_DIR, "dataset")
DATA_DIR = os.path.join(TRAINING_DIR, "data")
OUTPUT_DIR = os.path.join(TRAINING_DIR, "output")
LOG_DIR = os.path.join(TRAINING_DIR, "logs")
ADAPTER_DIR = os.path.join(OUTPUT_DIR, "fraud-lora-adapter")
MERGED_DIR = os.path.join(OUTPUT_DIR, "fraud-lora-merged")
STATE_FILE = os.path.join(TRAINING_DIR, "train_state.json")
METRICS_FILE = os.path.join(TRAINING_DIR, "metrics_last.json")

STEP_SCRIPTS = {
    "prepare": "prepare_data.py",
    "finetune": "finetune.py",
    "export": "export.py",
    "evaluate": "evaluate.py",
}
CREATE_NO_WINDOW = 0x08000000 if os.name == "nt" else 0


def _child_env():
    """训练脚本用 UTF-8 输出，避免 Windows 控制台默认 GBK 导致日志乱码。"""
    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "utf-8"
    env["PYTHONUTF8"] = "1"
    return env


# ============================================================
# 工具
# ============================================================
def _count_jsonl(path):
    if not os.path.exists(path):
        return 0
    n = 0
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        for line in f:
            if line.strip():
                n += 1
    return n


def _mtime_str(path):
    if not os.path.exists(path):
        return None
    return datetime.fromtimestamp(os.path.getmtime(path)).strftime("%Y-%m-%d %H:%M:%S")


def _dir_info(path):
    """目录是否存在 + 大小 + 修改时间"""
    if not os.path.isdir(path):
        return {"exists": False, "size_mb": 0, "mtime": None}
    size = 0
    for root, _dirs, files in os.walk(path):
        for fn in files:
            try:
                size += os.path.getsize(os.path.join(root, fn))
            except OSError:
                pass
    return {"exists": True, "size_mb": round(size / 1024 / 1024, 1), "mtime": _mtime_str(path)}


def _to_local_str(dt_utc):
    """DB 里存的是 UTC（datetime.utcnow），展示时转成本机时区，否则和文件时间差 8 小时"""
    if not dt_utc:
        return None
    try:
        return datetime.fromtimestamp(dt_utc.replace(tzinfo=timezone.utc).timestamp()).strftime("%Y-%m-%d %H:%M:%S")
    except (ValueError, OSError):
        return dt_utc.strftime("%Y-%m-%d %H:%M:%S")


def _parse_prepare(output):
    """从 prepare_data.py 的 stdout 里提取统计信息"""
    summary = {"total": None, "train": None, "val": None, "types": []}
    m = re.search(r"去重后样本总数:\s*(\d+)", output)
    if m:
        summary["total"] = int(m.group(1))
    m = re.search(r"训练集\s*:.*?（(\d+)\s*条）", output)
    if m:
        summary["train"] = int(m.group(1))
    m = re.search(r"验证集\s*:.*?（(\d+)\s*条）", output)
    if m:
        summary["val"] = int(m.group(1))
    in_dist = False
    for line in output.splitlines():
        if "类型分布" in line:
            in_dist = True
            continue
        if in_dist:
            if not line.strip():
                continue
            mm = re.match(r"\s*(\S+?):\s*(\d+)", line)
            if mm:
                summary["types"].append({"name": mm.group(1), "count": int(mm.group(2))})
            elif line.strip() and not line.startswith(" "):
                in_dist = False
    return summary


# ============================================================
# 单例任务运行器
# ============================================================
class TrainRunner:
    """同一时刻只允许一个训练步骤；状态持久化，服务重启后可读上次结果。"""

    def __init__(self):
        self._lock = threading.Lock()
        self._proc = None
        self.state = self._blank()
        self._load()

    @staticmethod
    def _blank():
        return {
            "state": "idle",          # idle / running / done / failed / interrupted
            "step": None,
            "started_at": None,
            "finished_at": None,
            "returncode": None,
            "log_file": "",
            "message": "",
            "params": {},
            "metrics": None,
            "last_prepare": None,
        }

    # ---- 持久化 ----
    def _load(self):
        try:
            with open(STATE_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            if data.get("state") == "running":
                data["state"] = "interrupted"
                data["message"] = "上次训练进程随服务重启中断"
            self.state = dict(self._blank(), **data)
        except (OSError, ValueError):
            pass

    def _save(self):
        try:
            os.makedirs(TRAINING_DIR, exist_ok=True)
            with open(STATE_FILE, "w", encoding="utf-8") as f:
                json.dump(self.state, f, ensure_ascii=False, indent=2)
        except OSError:
            pass

    # ---- 查询 ----
    def is_running(self):
        return self._proc is not None and self._proc.poll() is None

    def log_tail(self, lines=60):
        path = self.state.get("log_file")
        if not path or not os.path.exists(path):
            return ""
        try:
            with open(path, "r", encoding="utf-8", errors="replace") as f:
                content = f.readlines()
            return "".join(content[-lines:])
        except OSError:
            return ""

    def progress(self):
        """从日志尾部粗略解析进度（不编造百分比，解析不到就是 None）"""
        tail = self.log_tail(40)
        percent = None
        for m in re.finditer(r"(\d{1,3})%\|", tail):
            percent = int(m.group(1))
        stage = None
        for m in re.finditer(r"\[(\d)/5\]", tail):
            stage = int(m.group(1))
        return {"percent": percent, "stage": stage}

    # ---- 启动 ----
    def _build_cmd(self, step, params):
        py = sys.executable
        script = os.path.join(TRAINING_DIR, STEP_SCRIPTS[step])
        if step == "prepare":
            return [py, script]
        if step == "finetune":
            cmd = [py, script, "--epochs", str(int(params.get("epochs") or 3))]
            if params.get("model"):
                cmd += ["--model", str(params["model"])]
            return cmd
        if step == "export":
            cmd = [py, script]
            if params.get("model"):
                cmd += ["--model", str(params["model"])]
            return cmd
        if step == "evaluate":
            return [py, script, "--json-out", METRICS_FILE]
        raise ValueError("未知步骤: %s" % step)

    def start(self, step, params=None):
        params = params or {}
        with self._lock:
            if self.is_running():
                raise RuntimeError("已有训练任务在运行，请先等待完成或停止")
            if step not in STEP_SCRIPTS:
                raise RuntimeError("未知步骤: %s" % step)
            script = os.path.join(TRAINING_DIR, STEP_SCRIPTS[step])
            if not os.path.exists(script):
                raise RuntimeError("训练脚本不存在: %s" % script)

            os.makedirs(LOG_DIR, exist_ok=True)
            ts = time.strftime("%Y%m%d-%H%M%S")
            log_file = os.path.join(LOG_DIR, "%s-%s.log" % (step, ts))
            cmd = self._build_cmd(step, params)

            fh = open(log_file, "w", encoding="utf-8", errors="replace")
            fh.write("[命令] " + " ".join(cmd) + "\n")
            fh.write("[目录] " + TRAINING_DIR + "\n")
            fh.write("[开始] " + time.strftime("%Y-%m-%d %H:%M:%S") + "\n")
            fh.write("-" * 64 + "\n")
            fh.flush()

            try:
                proc = subprocess.Popen(
                    cmd, cwd=TRAINING_DIR,
                    stdout=fh, stderr=subprocess.STDOUT,
                    creationflags=CREATE_NO_WINDOW,
                    env=_child_env(),
                )
            except OSError as e:
                fh.write("启动失败: %s\n" % e)
                fh.close()
                raise RuntimeError("启动训练进程失败: %s" % e)

            self._proc = proc
            self.state = dict(self._blank(), **{
                "state": "running",
                "step": step,
                "started_at": time.strftime("%Y-%m-%d %H:%M:%S"),
                "log_file": log_file,
                "message": "运行中",
                "params": params,
                "last_prepare": self.state.get("last_prepare"),
            })
            self._save()
            threading.Thread(target=self._wait, args=(proc, fh, step), daemon=True).start()
            return dict(self.state)

    def _wait(self, proc, fh, step):
        try:
            rc = proc.wait()
        except Exception:
            rc = -1
        finally:
            try:
                fh.close()
            except OSError:
                pass

        self.state["returncode"] = rc
        self.state["finished_at"] = time.strftime("%Y-%m-%d %H:%M:%S")
        self.state["state"] = "done" if rc == 0 else "failed"
        self.state["message"] = "完成" if rc == 0 else ("失败（退出码 %s）" % rc)
        if rc == 0 and step == "evaluate":
            metrics = self._read_metrics()
            if metrics:
                self.state["metrics"] = metrics
                self._register_version(metrics)
        self._save()

    def _read_metrics(self):
        if os.path.exists(METRICS_FILE):
            try:
                with open(METRICS_FILE, "r", encoding="utf-8") as f:
                    return json.load(f)
            except (OSError, ValueError):
                pass
        m = re.search(r"@@METRICS@@(\{.*\})", self.log_tail(30))
        if m:
            try:
                return json.loads(m.group(1))
            except ValueError:
                pass
        return None

    def _register_version(self, metrics):
        """评测成功后写入 model_versions（真实指标，不编造）"""
        path = MERGED_DIR if os.path.isdir(MERGED_DIR) else ADAPTER_DIR
        db = SessionLocal()
        try:
            ver = ModelVersion(
                version_name=time.strftime("v%Y%m%d-%H%M%S"),
                model_path=path,
                base_model=config.BASE_MODEL_NAME,
                accuracy=metrics.get("fraud_type_accuracy"),
                f1_score=metrics.get("risk_level_accuracy"),
                metrics_json=metrics,
                train_samples=_count_jsonl(os.path.join(DATA_DIR, "train.jsonl")),
                is_active=False,
                trained_at=datetime.utcnow(),
            )
            db.add(ver)
            db.commit()
        except Exception as e:
            print("[训练] 写入模型版本失败:", e)
        finally:
            db.close()

    def stop(self, timeout=6):
        with self._lock:
            proc = self._proc
        if not proc or proc.poll() is not None:
            return False
        try:
            proc.terminate()
            for _ in range(int(timeout * 10)):
                if proc.poll() is not None:
                    break
                time.sleep(0.1)
            if proc.poll() is None:
                proc.kill()
        except OSError:
            pass
        self.state["state"] = "failed"
        self.state["message"] = "已被手动停止"
        self.state["finished_at"] = time.strftime("%Y-%m-%d %H:%M:%S")
        self._save()
        return True


runner = TrainRunner()


# ============================================================
# 数据集
# ============================================================
@router.get("/dataset")
def dataset_summary(db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    """数据集总览：DB 案例 + JSONL 数据源 + 已生成训练集 + 模型产物"""
    total = db.query(FraudCase).count()
    active = db.query(FraudCase).filter(FraudCase.is_active == True).count()  # noqa: E712
    rows = (db.query(FraudCase.fraud_type, func.count(FraudCase.id))
            .filter(FraudCase.is_active == True)  # noqa: E712
            .group_by(FraudCase.fraud_type).all())
    by_type = [{"name": r[0] or "其他", "count": r[1]} for r in rows]
    last_case_update = db.query(func.max(FraudCase.updated_at)).scalar()

    sources = [
        {"name": "fraud_cases.jsonl", "count": _count_jsonl(os.path.join(DATASET_DIR, "fraud_cases.jsonl"))},
        {"name": "fraud_cases_additional.jsonl", "count": _count_jsonl(os.path.join(DATASET_DIR, "fraud_cases_additional.jsonl"))},
        {"name": "管理后台录入（启用）", "count": active},
    ]
    train_n = _count_jsonl(os.path.join(DATA_DIR, "train.jsonl"))
    val_n = _count_jsonl(os.path.join(DATA_DIR, "val.jsonl"))
    train_path = os.path.join(DATA_DIR, "train.jsonl")
    train_mtime = _mtime_str(train_path)

    # 「案例已更新但训练集没重新生成」判定：两边都换算到 UTC 再比，避免时区差 8 小时导致永远 False
    stale = False
    if last_case_update:
        if os.path.exists(train_path):
            stale = last_case_update > datetime.utcfromtimestamp(os.path.getmtime(train_path))
        elif total > 0:
            stale = True

    return {
        "cases": {
            "total": total,
            "active": active,
            "inactive": total - active,
            "by_type": by_type,
            "last_update": _to_local_str(last_case_update),
        },
        "sources": sources,
        "generated": {
            "train": train_n,
            "val": val_n,
            "train_mtime": train_mtime,
            "all": _count_jsonl(os.path.join(DATA_DIR, "data_all.jsonl")),
            "stale": stale,
        },
        "artifacts": {
            "adapter": _dir_info(ADAPTER_DIR),
            "merged": _dir_info(MERGED_DIR),
        },
        "training_dir": TRAINING_DIR,
        "base_model": config.BASE_MODEL_NAME,
        "active_model": detect_router.current_model_path(),
        "runner": _runner_payload(),
    }


@router.post("/dataset/prepare")
def prepare_dataset(admin=Depends(get_current_admin)):
    """运行 prepare_data.py：把 DB 案例 + JSONL 合并成 train/val（通常几秒内完成）"""
    if runner.is_running():
        raise HTTPException(status_code=409, detail="有训练任务正在运行，无法准备数据")
    script = os.path.join(TRAINING_DIR, "prepare_data.py")
    if not os.path.exists(script):
        raise HTTPException(status_code=404, detail="找不到训练脚本: %s" % script)
    try:
        proc = subprocess.run(
            [sys.executable, script], cwd=TRAINING_DIR,
            capture_output=True, text=True, encoding="utf-8", errors="replace",
            timeout=180, creationflags=CREATE_NO_WINDOW, env=_child_env(),
        )
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="数据准备超时（180s）")

    output = (proc.stdout or "") + (proc.stderr or "")
    if proc.returncode != 0:
        raise HTTPException(status_code=500, detail="数据准备失败：" + output[-1200:])

    summary = _parse_prepare(output)
    summary["at"] = time.strftime("%Y-%m-%d %H:%M:%S")
    runner.state["last_prepare"] = summary
    runner._save()

    # 同步刷新文件时间等状态
    return {"ok": True, "summary": summary, "output": output[-6000:]}


# ============================================================
# 训练任务
# ============================================================
def _runner_payload():
    return {
        "state": runner.state.get("state"),
        "step": runner.state.get("step"),
        "started_at": runner.state.get("started_at"),
        "finished_at": runner.state.get("finished_at"),
        "returncode": runner.state.get("returncode"),
        "message": runner.state.get("message"),
        "running": runner.is_running(),
        "progress": runner.progress(),
        "metrics": runner.state.get("metrics"),
        "last_prepare": runner.state.get("last_prepare"),
        "log_file": runner.state.get("log_file"),
    }


@router.get("/train/status")
def train_status(lines: int = 40, admin=Depends(get_current_admin)):
    payload = _runner_payload()
    payload["log_tail"] = runner.log_tail(max(1, min(lines, 400)))
    payload["log_size"] = os.path.getsize(payload["log_file"]) if payload.get("log_file") and os.path.exists(payload["log_file"]) else 0
    return payload


@router.post("/train/start")
def start_train(payload: dict = Body(default={}), admin=Depends(get_current_admin)):
    step = (payload or {}).get("step")
    if step not in STEP_SCRIPTS:
        raise HTTPException(status_code=400, detail="step 必须是 prepare/finetune/export/evaluate 之一")
    try:
        state = runner.start(step, payload)
    except RuntimeError as e:
        raise HTTPException(status_code=409, detail=str(e))
    return {"ok": True, "state": state}


@router.post("/train/stop")
def stop_train(admin=Depends(get_current_admin)):
    stopped = runner.stop()
    return {"ok": True, "stopped": stopped, "state": _runner_payload()}


@router.get("/train/logs")
def train_logs(lines: int = 200, admin=Depends(get_current_admin)):
    return {"log_file": runner.state.get("log_file"), "log": runner.log_tail(max(1, min(lines, 2000)))}


# ============================================================
# 模型版本
# ============================================================
def _version_dict(v):
    return {
        "id": v.id,
        "version_name": v.version_name,
        "model_path": v.model_path,
        "base_model": v.base_model,
        "accuracy": v.accuracy,
        "risk_level_accuracy": v.f1_score,
        "train_samples": v.train_samples,
        "metrics": v.metrics_json,
        "is_active": bool(v.is_active),
        "trained_at": _to_local_str(v.trained_at),
        "exists": os.path.isdir(v.model_path) if v.model_path else False,
    }


@router.get("/models")
def list_models(db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    rows = db.query(ModelVersion).order_by(ModelVersion.id.desc()).all()
    return {
        "items": [_version_dict(v) for v in rows],
        "active_path": detect_router.current_model_path(),
        "model_loaded": detect_router.model_loaded(),
    }


@router.post("/models/{version_id}/activate")
def activate_model(version_id: int, db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    """激活某个模型版本：更新 is_active + 热加载（后台线程，不阻塞接口）"""
    ver = db.query(ModelVersion).filter(ModelVersion.id == version_id).first()
    if not ver:
        raise HTTPException(status_code=404, detail="模型版本不存在")
    if not os.path.isdir(ver.model_path):
        raise HTTPException(status_code=400, detail="模型目录不存在: %s" % ver.model_path)

    db.query(ModelVersion).update({ModelVersion.is_active: False})
    ver.is_active = True
    db.commit()

    detect_router.set_model_path(ver.model_path)
    ok, err = detect_router.reload_model_async()
    return {"ok": ok, "message": "已切换模型并开始热加载" if ok else "已切换但加载失败: %s" % err,
            "active_path": ver.model_path}


@router.post("/models/deactivate")
def deactivate_model(db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    """停用微调模型：检测回退到纯 DeepSeek/规则，并释放显存"""
    db.query(ModelVersion).update({ModelVersion.is_active: False})
    db.commit()
    detect_router.unload_model()
    return {"ok": True, "message": "已停用微调模型，检测使用 DeepSeek 深度分析", "active_path": detect_router.current_model_path()}


@router.delete("/models/{version_id}")
def delete_model(version_id: int, db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    ver = db.query(ModelVersion).filter(ModelVersion.id == version_id).first()
    if not ver:
        raise HTTPException(status_code=404, detail="模型版本不存在")
    if ver.is_active:
        raise HTTPException(status_code=400, detail="不能删除正在使用的模型版本")
    db.delete(ver)
    db.commit()
    return {"ok": True}


# ============================================================
# 训练数据导入（案例批量导入，直接进 fraud_cases）
# ============================================================
@router.post("/cases/import")
def import_cases(payload: dict = Body(default={}), db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    """批量导入案例：支持 JSONL 文本或 [{...}] 数组。

    每行格式：{"text": "...", "fraud_type": "冒充客服", "risk_level": "high", "risk_score": 0.8}
    """
    raw = (payload or {}).get("data") or ""
    items = []
    if isinstance(raw, list):
        items = raw
    elif isinstance(raw, str):
        raw = raw.strip()
        if raw.startswith("["):
            try:
                items = json.loads(raw)
            except ValueError:
                raise HTTPException(status_code=400, detail="JSON 数组解析失败")
        else:
            for line in raw.splitlines():
                line = line.strip()
                if not line:
                    continue
                try:
                    items.append(json.loads(line))
                except ValueError:
                    continue
    if not items:
        raise HTTPException(status_code=400, detail="没有解析到有效数据")

    created, skipped = 0, 0
    for it in items:
        if not isinstance(it, dict):
            skipped += 1
            continue
        text = str(it.get("text") or it.get("input") or "").strip()
        if len(text) < 8:
            skipped += 1
            continue
        level = str(it.get("risk_level") or "medium")
        level_map = {"低风险": "low", "中风险": "medium", "高风险": "high", "极高风险": "critical"}
        level = str(it.get("risk_level") or "medium")
        level_map = {"低风险": "low", "中风险": "medium", "高风险": "high", "极高风险": "critical"}
        # 显式 0 是合法分值（正常样本），只有缺省时才默认 0.5；非数字跳过该条而不是整个请求 500
        raw_score = it.get("risk_score")
        try:
            risk_score = 0.5 if raw_score is None or raw_score == "" else float(raw_score)
        except (TypeError, ValueError):
            skipped += 1
            continue
        db.add(FraudCase(
            text=text[:5000],
            fraud_type=str(it.get("fraud_type") or "其他"),
            risk_level=level_map.get(level, level),
            risk_score=risk_score,
            source=str(it.get("source") or "web_import"),
            analysis=it.get("analysis"),
            tags=it.get("tags"),
            is_active=bool(it.get("is_active", True)),
            created_by=admin.id,
        ))
        created += 1
    db.commit()
    return {"ok": True, "created": created, "skipped": skipped, "total": created + skipped}

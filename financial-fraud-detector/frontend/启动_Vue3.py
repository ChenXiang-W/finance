"""
双击此文件：启动 Vue 3 前端（并确保后端在跑）
  · 后端 8000 未启动 → 自动用 uvicorn 拉起
  · vue3/node_modules 缺失 → 自动 npm install
  · 打开浏览器 http://127.0.0.1:5173

旧的静态版（index.html / home.html / admin.html）仍可用 启动服务.py 打开。
"""

import importlib.util
import os
import socket
import subprocess
import sys
import time
import webbrowser

ROOT = os.path.dirname(os.path.abspath(__file__))
VUE3 = os.path.join(ROOT, "vue3")
BACKEND = os.path.join(ROOT, "backend")
NPM = "npm.cmd" if os.name == "nt" else "npm"
DEV_URL = "http://127.0.0.1:5173/#/map"


def port_open(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.settimeout(0.4)
        return s.connect_ex(("127.0.0.1", port)) == 0


def wait_port(port: int, timeout: float = 30.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if port_open(port):
            return True
        time.sleep(0.4)
    return False


def main() -> None:
    print("=" * 52)
    print("  金盾智眼 · Vue 3 前端启动")
    print("=" * 52)

    # 1. 后端
    if port_open(8000):
        print("[1/3] 后端已在 8000 运行")
    elif importlib.util.find_spec("uvicorn") is None:
        print("[1/3] 当前 Python 未安装 uvicorn，无法自带后端")
        print("      请先运行 启动服务.py（它用的是装了依赖的 Python），再回来启动前端")
    else:
        print("[1/3] 启动后端 (端口 8000)…")
        subprocess.Popen(
            [sys.executable, "-m", "uvicorn", "main:app", "--port", "8000", "--host", "0.0.0.0"],
            cwd=BACKEND,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        print("      等待后端就绪…" if wait_port(8000) else "      后端未在 30s 内就绪，前端仍可打开")

    # 2. 依赖
    if not os.path.isdir(os.path.join(VUE3, "node_modules")):
        print("[2/3] 首次运行，安装前端依赖（约 1–2 分钟）…")
        subprocess.run([NPM, "install", "--no-audit", "--no-fund"], cwd=VUE3, check=False)
    else:
        print("[2/3] 前端依赖已就绪")

    # 3. 开发服务器
    if port_open(5173):
        print("[3/3] Vite 已在 5173 运行，直接打开浏览器")
        webbrowser.open(DEV_URL)
        return

    print("[3/3] 启动 Vite 开发服务器…")
    proc = subprocess.Popen([NPM, "run", "dev"], cwd=VUE3)
    if wait_port(5173):
        webbrowser.open(DEV_URL)
    print("\n前端地址：", DEV_URL, "\n关闭此窗口即停止前端。")
    try:
        proc.wait()
    except KeyboardInterrupt:
        proc.terminate()


if __name__ == "__main__":
    main()

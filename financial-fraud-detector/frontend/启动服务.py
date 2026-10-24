"""
双击此文件启动全部服务
"""
import subprocess, os, sys, webbrowser, time

ROOT = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.join(ROOT, "backend")

print("=" * 50)
print("  金盾智眼 — 启动全部服务")
print("=" * 50)

# 启动后端
print("\n[1/2] 启动后端 (端口 8000)...")
backend = subprocess.Popen(
    [sys.executable, "-m", "uvicorn", "main:app", "--port", "8000", "--host", "0.0.0.0"],
    cwd=BACKEND,
    creationflags=subprocess.CREATE_NO_WINDOW,
)

# 启动前端
print("[2/2] 启动前端 (端口 3000)...")
frontend = subprocess.Popen(
    [sys.executable, "-m", "http.server", "3000"],
    cwd=ROOT,
    creationflags=subprocess.CREATE_NO_WINDOW,
)

time.sleep(2)

print("\n" + "=" * 50)
print("  启动完成！浏览器即将打开...")
print("=" * 50)

webbrowser.open("http://localhost:3000/home.html")

print("\n服务已在后台运行。")
print("关闭此窗口不会停止服务。")
print("\n要停止服务，请运行 停止服务.py")
input("\n按回车关闭此窗口...")

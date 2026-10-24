"""双击停止所有服务"""
import subprocess, os

print("正在停止服务...")
subprocess.run(["taskkill", "/f", "/im", "python.exe"], capture_output=True)
print("已停止。")
input("按回车关闭...")

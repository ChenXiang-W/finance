@echo off
chcp 65001 >nul
title 金盾智眼 - Vue3 前端
cd /d "%~dp0"
where python >nul 2>nul
if %errorlevel%==0 (
  python "启动_Vue3.py"
) else (
  cd /d "%~dp0vue3"
  if not exist node_modules call npm install --no-audit --no-fund
  start "" "http://127.0.0.1:5173/#/map"
  call npm run dev
)
pause

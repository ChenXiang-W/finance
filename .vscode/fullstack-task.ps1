# VS Code preLaunchTask「启动全栈」的实现脚本。
# 为什么用脚本而不是常驻任务链：uvicorn/vite 作为 isBackground 任务永远不会"结束"，
# 第二次按 F5 时 VS Code 要先终止上一个仍存活的任务实例，终止会被算到新一次
# preLaunchTask 头上，弹出「Canceled / 仍要调试」对话框。
# 本脚本做完清理、拉起、等待就绪后**正常退出**，因此可以反复 F5，不再有任务实例冲突。

$ErrorActionPreference = 'SilentlyContinue'

# .vscode/ 的上一级即工作区根目录
$root = Split-Path -Parent $PSScriptRoot
$fe   = Join-Path $root 'financial-fraud-detector\frontend'
$be   = Join-Path $fe 'backend'
$vue3 = Join-Path $fe 'vue3'
$py   = 'D:\Python39\python.exe'

# ---- 1/3 清理端口（杀掉上一轮残留的前后端进程）----
8000, 5173, 3000 | ForEach-Object {
    $p = $_
    Get-NetTCPConnection -State Listen -LocalPort $p -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique |
        ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
}
Write-Host '[1/3] 端口 8000/5173/3000 已清理'

# ---- 2/3 拉起后端（独立最小化窗口；stdout 同时写入日志文件，便于事后排查）----
$logDir = Join-Path $PSScriptRoot 'logs'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
# 只保留最近 5 份日志
Get-ChildItem $logDir -Filter '*.log' -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -Skip 5 |
    Remove-Item -Force -ErrorAction SilentlyContinue
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backendLog = Join-Path $logDir "backend-$stamp.log"
$viteLog = Join-Path $logDir "vite-$stamp.log"

Start-Process -FilePath 'cmd.exe' `
    -ArgumentList "/c $py -m uvicorn main:app --port 8000 --host 127.0.0.1 >> $backendLog 2>&1" `
    -WorkingDirectory $be -WindowStyle Minimized
Write-Host "[2/3] 后端 uvicorn 启动中…（日志: .vscode/logs/backend-$stamp.log）"

# ---- 3/3 拉起前端 vite ----
if (-not (Test-Path (Join-Path $vue3 'node_modules'))) {
    Write-Host '      首次运行：先安装前端依赖…'
    Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', 'npm install --no-audit --no-fund' `
        -WorkingDirectory $vue3 -WindowStyle Minimized -Wait
}
Start-Process -FilePath 'cmd.exe' -ArgumentList "/c npm run dev >> $viteLog 2>&1" `
    -WorkingDirectory $vue3 -WindowStyle Minimized
Write-Host "[3/3] 前端 vite 启动中…（日志: .vscode/logs/vite-$stamp.log）"

# ---- 等待两个端口就绪（总预算约 48s，小于 launch.json 的 90s 超时）----
function Wait-Port([int]$port, [string]$name) {
    for ($i = 0; $i -lt 30; $i++) {
        $c = New-Object Net.Sockets.TcpClient
        try {
            if ($c.ConnectAsync('127.0.0.1', $port).Wait(500) -and $c.Connected) {
                Write-Host "      $name 就绪（端口 $port）"
                return $true
            }
        } catch { }
        finally { $c.Dispose() }
        Start-Sleep -Milliseconds 800
    }
    Write-Host "      警告: $name 未在预算时间内就绪（端口 $port），浏览器可能打不开页面"
    return $false
}
Wait-Port 8000 '后端' | Out-Null
Wait-Port 5173 '前端' | Out-Null

Write-Host '全栈就绪。'
exit 0

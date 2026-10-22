@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "PLANNER_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if exist "%PLANNER_NODE%" goto run
set "PLANNER_NODE=node"
:run
echo 正在启动知程学习规划工作台...
echo 启动成功后，请访问 http://127.0.0.1:4317
echo 关闭此窗口将停止网站。
"%PLANNER_NODE%" server.mjs
pause

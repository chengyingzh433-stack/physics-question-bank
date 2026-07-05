@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 物理题库管理系统 - dev
echo 正在启动物理教师题库管理系统...
echo.
echo 关闭弹出的应用窗口即可退出。
echo.
npm run dev
echo.
echo 应用已退出。按任意键关闭本窗口。
pause >nul

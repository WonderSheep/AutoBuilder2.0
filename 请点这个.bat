@echo off
chcp 65001 >nul 2>&1
title Ad Automation Tool

cd /d "%~dp0"

if not exist "node_modules" if not exist "src\node_modules" (
    echo [INFO] Installing dependencies...
    cd src
    call npm install
    cd ..
    if errorlevel 1 (
        echo [ERROR] npm install failed
        pause
        exit /b 1
    )
    echo [INFO] Done
    echo.
)

"%~dp0src\node.exe" "%~dp0src\index.js"

if errorlevel 1 pause

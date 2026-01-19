@echo off
echo Starting Tauri development server...
echo.

REM Try to use npm directly (works in CMD)
npm run tauri dev

REM If npm is not found, try with PowerShell bypass
if %errorlevel% neq 0 (
    echo.
    echo npm not found in CMD, trying PowerShell...
    powershell -ExecutionPolicy Bypass -Command "npm run tauri dev"
)

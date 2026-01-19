@echo off
echo Killing processes on port 1420...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :1420') do (
    taskkill /PID %%a /F 2>nul
)
echo Done.
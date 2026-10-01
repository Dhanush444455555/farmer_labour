@echo off
title Farm Connect Server
cd /d "%~dp0"

echo =========================================
echo Starting Farm Connect System...
echo =========================================

echo.
echo Checking dependencies...
if not exist "frontend\node_modules\" (
  echo Frontend dependencies missing. Installing...
  call npm install --prefix frontend
)

echo.
echo =========================================
echo Launching Servers...
echo =========================================
echo.

:: Start Python Backend
IF EXIST "agent-service\.venv\Scripts\activate.bat" (
    start "FarmConnect-Backend" cmd /k "cd /d backend && call ..\agent-service\.venv\Scripts\activate.bat && uvicorn main:socket_app --host 0.0.0.0 --port 5000 --reload"
) ELSE (
    start "FarmConnect-Backend" cmd /k "cd /d backend && python -m uvicorn main:socket_app --host 0.0.0.0 --port 5000 --reload"
)

:: Start Frontend in Vite
start "FarmConnect-Frontend" cmd /k "cd /d frontend && npm run dev"

:: Open Browser
start cmd /c "timeout /t 3 >nul && start http://localhost:5173"

echo.
echo Application running at http://localhost:5173
echo API & Docs running at http://localhost:5000/docs
echo.
pause

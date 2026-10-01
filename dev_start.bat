@echo off
REM ─────────────────────────────────────────────────────────────────────────────
REM  Farm Connect — Local Dev Startup (Unified Python Backend + React Vite Frontend)
REM ─────────────────────────────────────────────────────────────────────────────

setlocal enabledelayedexpansion
SET ROOT=%~dp0

echo.
echo  ======================================================
echo  🌾 Farm Connect - Unified Python Backend ^& Frontend
echo  ======================================================
echo.

REM ── 1. Python Backend (Port 5000) ──────────────────────────────────────────
echo  [1/2] Starting Unified Python Backend on port 5000...
IF EXIST "%ROOT%agent-service\.venv\Scripts\activate.bat" (
    start "FarmConnect-PythonBackend" cmd /k "cd /d %ROOT%backend && call %ROOT%agent-service\.venv\Scripts\activate.bat && uvicorn main:socket_app --host 0.0.0.0 --port 5000 --reload"
) ELSE IF EXIST "%ROOT%backend\.venv\Scripts\activate.bat" (
    start "FarmConnect-PythonBackend" cmd /k "cd /d %ROOT%backend && call .venv\Scripts\activate.bat && uvicorn main:socket_app --host 0.0.0.0 --port 5000 --reload"
) ELSE (
    start "FarmConnect-PythonBackend" cmd /k "cd /d %ROOT%backend && python -m uvicorn main:socket_app --host 0.0.0.0 --port 5000 --reload"
)

timeout /t 2 /nobreak >nul

REM ── 2. Vite Frontend (Port 5173) ───────────────────────────────────────────
echo  [2/2] Starting React Vite Frontend on port 5173...
start "FarmConnect-Frontend" cmd /k "cd /d %ROOT%frontend && npm run dev"

echo.
echo  ✅ All services launched successfully!
echo.
echo  Endpoints:
echo    Frontend (Web UI)   - http://localhost:5173
echo    Backend (FastAPI)   - http://localhost:5000
echo    Interactive API Docs- http://localhost:5000/docs
echo.
pause

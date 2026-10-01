@echo off
REM ─────────────────────────────────────────────────────────────────────────────
REM  Farm Connect — Local Dev Startup
REM  Starts: Node backend (5000) + Python agent-service (8000) + Vite (5173)
REM
REM  Prerequisites:
REM    node >= 18, npm, python >= 3.10, pip
REM
REM  First-time setup:
REM    1. cd backend  &&  npm install
REM    2. cd frontend &&  npm install
REM    3. cd agent-service && python -m venv .venv && .venv\Scripts\activate && pip install -r requirements.txt
REM    4. Copy and fill .env files (see .env.example in backend/ and agent-service/)
REM    5. Run this script: dev_start.bat
REM ─────────────────────────────────────────────────────────────────────────────

setlocal enabledelayedexpansion
SET ROOT=%~dp0

echo.
echo  Farm Connect ^| Local Dev
echo  ──────────────────────────────────────────────
echo.

REM ── 1. Backend (Node) ────────────────────────────────────────────────────────
echo  [1/3] Starting Node backend on port 5000...
start "Farm-Backend" cmd /k "cd /d %ROOT%backend && node index.js"
timeout /t 2 /nobreak >nul

REM ── 2. Agent service (Python) ────────────────────────────────────────────────
echo  [2/3] Starting Python agent-service on port 8000...
IF EXIST "%ROOT%agent-service\.venv\Scripts\activate.bat" (
    start "Farm-AgentService" cmd /k "cd /d %ROOT%agent-service && call .venv\Scripts\activate.bat && uvicorn main:app --reload --port 8000"
) ELSE (
    echo  [WARN] No .venv found in agent-service\. Running with system python...
    start "Farm-AgentService" cmd /k "cd /d %ROOT%agent-service && python -m uvicorn main:app --reload --port 8000"
)
timeout /t 3 /nobreak >nul

REM ── 3. Frontend (Vite) ───────────────────────────────────────────────────────
echo  [3/3] Starting Vite frontend on port 5173...
start "Farm-Frontend" cmd /k "cd /d %ROOT%frontend && npm run dev"

echo.
echo  ✅  All services launched in separate windows.
echo.
echo  Endpoints:
echo    Frontend      →  http://localhost:5173
echo    Node Backend  →  http://localhost:5000
echo    Agent Service →  http://localhost:8000
echo    Agent API docs→  http://localhost:8000/docs
echo.
echo  Logs are visible in each window.
echo  Close all windows or press Ctrl+C in each to stop.
echo.
pause

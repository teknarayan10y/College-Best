@echo off
title College ERP + SnapClass AI Ecosystem Launcher
echo =======================================================================
echo          Starting Smart College ERP + SnapClass AI Suite
echo =======================================================================
echo.
echo [1/4] Starting ERP Node.js Server on http://localhost:5000...
start "ERP Server (Port 5000)" cmd /k "cd Server && npm run dev"

echo [2/4] Starting NexusMind + SnapClass Python ML Service on http://localhost:8000...
start "Python ML Service (Port 8000)" cmd /k "cd ml_service && python app.py"

echo [3/4] Starting AI Attendance Showcase Landing on http://localhost:5002...
start "AI Landing Page (Port 5002)" cmd /k "cd ai-attendance-project-landing && python app.py"

echo [4/4] Starting React ERP Frontend on http://localhost:5173...
start "ERP Web Portal (Port 5173)" cmd /k "cd \"Smart College ERP Sysytem\" && npm run dev"

echo.
echo =======================================================================
echo All services launched!
echo - ERP Portal:         http://localhost:5173
echo - ERP Backend API:    http://localhost:5000
echo - AI Biometric Engine: http://localhost:8000
echo - AI Landing Page:    http://localhost:5002
echo =======================================================================
echo.
pause

@echo off
title NexusMind Python ML Service - Port 8000
echo ============================================================
echo Starting NexusMind Python ML Service on http://localhost:8000
echo ============================================================
echo Checking Python and packages...
python -c "import numpy, pandas; print('Loaded NumPy:', numpy.__version__, '| Loaded pandas:', pandas.__version__)"
echo.
if exist app.py (
    python app.py
) else (
    python ml_service\app.py
)
pause

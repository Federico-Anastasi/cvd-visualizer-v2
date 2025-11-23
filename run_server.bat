@echo off
echo Starting CVD Visualizer V2 Server...
echo Open http://localhost:8000 in your browser
echo.
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
pause

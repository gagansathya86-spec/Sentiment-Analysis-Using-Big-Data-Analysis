@echo off
echo Starting Social Media Analytics Backend...
echo (Hot-reloading is active, but ignoring the data/ directory to prevent connection drops during analysis)

uvicorn main:app --reload --reload-exclude "data" --host 0.0.0.0 --port 8000

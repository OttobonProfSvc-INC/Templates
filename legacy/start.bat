@echo off
title Ottobon Templates Dashboard
cd /d "%~dp0"
echo ========================================================
echo   Launching Ottobon Templates Hub
echo ========================================================
echo.
echo Starting local server at http://localhost:3000 ...
node server.js
pause

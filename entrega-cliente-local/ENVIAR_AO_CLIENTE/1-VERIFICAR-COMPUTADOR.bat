@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File ".\VERIFICAR-COMPUTADOR.ps1"
echo.
pause

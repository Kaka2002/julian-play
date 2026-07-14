@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File ".\ABRIR-PAINEL.ps1"
echo.
pause

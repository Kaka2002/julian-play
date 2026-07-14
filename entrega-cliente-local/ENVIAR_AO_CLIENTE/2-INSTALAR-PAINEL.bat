@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File ".\INSTALAR-PAINEL.ps1"
echo.
pause

@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File ".\ATUALIZAR-PAINEL.ps1"
echo.
pause

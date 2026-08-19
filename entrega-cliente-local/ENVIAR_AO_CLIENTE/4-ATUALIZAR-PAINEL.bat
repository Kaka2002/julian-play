@echo off
setlocal
title Julian Play - Atualizacao local
cd /d "%~dp0"
echo.
echo ================================================================
echo  JULIAN PLAY - ATUALIZACAO LOCAL
echo  Acompanhe as etapas nesta janela. Nao a feche ate a conclusao.
echo ================================================================
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File ".\ATUALIZAR-PAINEL.ps1"
set "CODIGO=%ERRORLEVEL%"
echo.
if not "%CODIGO%"=="0" (
  echo A atualizacao nao foi concluida. Leia a mensagem acima antes de fechar.
) else (
  echo Atualizacao concluida. O painel foi aberto no navegador.
)
pause
exit /b %CODIGO%

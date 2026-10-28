@echo off
chcp 65001 >nul
title TramitaFacil RD
cd /d "%~dp0"
where py >nul 2>nul && (py -3 iniciar_local.py %*) || (python iniciar_local.py %*)
if errorlevel 1 (
  echo.
  echo Si dice que no encuentra Python, instalalo desde https://www.python.org/downloads/
  echo y marca la casilla "Add Python to PATH".
)
pause

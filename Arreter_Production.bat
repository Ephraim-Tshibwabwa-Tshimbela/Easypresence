@echo off
title EasyPresence - Arret du Serveur
color 0E

echo ======================================================================
echo    ARRET DU SERVEUR EASYPRESENCE
echo ======================================================================
echo.

where pm2 >nul 2>nul
if %errorlevel% equ 0 (
    echo Arret du processus supervise PM2...
    call pm2 stop easypresence
    call pm2 delete easypresence
)

echo Fermeture des processus Node.js ecoutant sur le port 3000...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000" ^| findstr "LISTENING"') do (
    echo Fermeture du PID %%a...
    taskkill /F /PID %%a >nul 2>nul
)

echo.
echo [OK] Serveur EasyPresence arrete avec succes.
echo.
pause

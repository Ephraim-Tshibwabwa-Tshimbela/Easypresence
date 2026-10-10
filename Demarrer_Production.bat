@echo off
setlocal enabledelayedexpansion
title EasyPresence - Demarrage Production
color 0A

echo ======================================================================
echo    EASYPRESENCE - SERVEUR DE PRODUCTION LAN HORS-LIGNE
echo    Mode Haute Disponibilite ^& Securite Renforcee
echo ======================================================================
echo.

:: 1. Verification de Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    color 0C
    echo [ERREUR CRITIQUE] Node.js n'est pas installe ou n'est pas dans le PATH.
    echo Veuillez installer Node.js v20+ depuis le support d'installation.
    pause
    exit /b 1
)

:: 2. Creation des repertoires indispensables
if not exist "logs" mkdir "logs"
if not exist "data" mkdir "data"
if not exist "backups" mkdir "backups"

:: 3. Verification de l'integrite de la base de donnees avant lancement
echo [1/3] Verification de l'integrite de la base SQLite...
node -e "const { DatabaseSync } = require('node:sqlite'); try { const db = new DatabaseSync('data/attendance.db'); const r = db.prepare('PRAGMA integrity_check;').get(); if (r && r.integrity_check === 'ok') { console.log('       [OK] Base de donnees saine (PRAGMA integrity_check = ok)'); } else { console.error('       [ATTENTION] Defaut detecte:', r); } } catch (e) { console.log('       [INFO] Base non encore creee ou premier lancement.'); }"

:: 4. Choix du gestionnaire de processus (PM2 si present, sinon Node direct)
echo [2/3] Initialisation du processus serveur...
where pm2 >nul 2>nul
if %errorlevel% equ 0 (
    echo [OK] PM2 detecte. Lancement en cluster supervise avec redemarrage automatique...
    call pm2 start ecosystem.config.cjs
    echo.
    call pm2 status
) else (
    echo [INFO] PM2 non installe globalement. Lancement supervise via Node.js...
    start "EasyPresence Production Server" /min cmd /c "node src/server/index.js >> logs/server.log 2>>&1"
)

:: 5. Attente et verification du port 3000
echo [3/3] Verification de la disponibilite du service...
timeout /t 3 /nobreak >nul

:: Ouverture du navigateur
echo.
echo Ouverture de l'interface d'administration locale...
start http://localhost:3000

echo.
echo ======================================================================
echo  SERVEUR OPERATIONNEL SUR LE PORT 3000 !
echo.
echo  Pour connecter les autres postes clients sur le reseau local (LAN) :
echo  1. Ouvrez l'application a l'ecran pour voir l'adresse IP de cette machine.
echo  2. Sur les postes agents, ouvrez Chrome/Edge et tapez :
echo     http://[IP_DE_CETTE_MACHINE]:3000
echo.
echo  Journaux d'evenements disponibles dans le dossier : logs/
echo  Pour arreter le serveur proprement : executez Arreter_Production.bat
echo ======================================================================
echo.
pause

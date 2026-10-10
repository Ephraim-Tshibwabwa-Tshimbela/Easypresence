@echo off
title Configuration du Pare-Feu Windows - EasyPresence
chcp 65001 >nul
echo ============================================================
echo   CONFIGURATION DU PARE-FEU WINDOWS — EASYPRESENCE
echo ============================================================
echo.

:: Verifier les privileges Administrateur
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [ATTENTION] Ce script doit etre execute en mode Administrateur !
    echo.
    echo 1. Fermez cette fenetre.
    echo 2. Faites un clic droit sur "fix-firewall.bat".
    echo 3. Cliquez sur "Executer en tant qu'administrateur".
    echo.
    pause
    exit /b 1
)

echo [1/2] Autorisation du port TCP 3000 dans le Pare-Feu Windows...
netsh advfirewall firewall delete rule name="EasyPresence LAN (Port 3000)" >nul 2>&1
netsh advfirewall firewall add rule name="EasyPresence LAN (Port 3000)" dir=in action=allow protocol=TCP localport=3000 profile=any >nul

if %errorLevel% equ 0 (
    echo  ^> Succes : Le port 3000 est maintenant autorise pour tous les profils (Prive et Public).
) else (
    echo  ^> Erreur lors de l'ajout de la regle.
)

echo.
echo [2/2] Verification des profils reseau...
powershell -NoProfile -Command "Get-NetConnectionProfile | Select-Object InterfaceAlias, NetworkCategory, IPv4Connectivity | Format-Table -AutoSize"

echo.
echo ============================================================
echo   Termine ! Le port 3000 est pret a recevoir les connexions
echo   des autres postes sur votre reseau local.
echo ============================================================
echo.
pause

@echo off
title EasyPresence - Recherche Excel & Gestion de Presence
color 0B

echo ======================================================================
echo    APPLICATION WEB DE RECHERCHE EXCEL & GESTION DE PRESENCE
echo    Mode 100%% Web - Solo & Reseau Local (LAN Hors-Ligne)
echo ======================================================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERREUR] Node.js n'est pas detecte sur cet ordinateur.
    echo Veuillez installer Node.js ou contacter votre administrateur.
    pause
    exit /b
)

echo [1/2] Demarrage du serveur local...
start "Serveur EasyPresence" /min cmd /c "node src/server/index.js"

echo [2/2] Ouverture de votre navigateur web par defaut...
timeout /t 2 /nobreak >nul
start http://localhost:3000

echo.
echo ======================================================================
echo  L'application est maintenant ouverte dans votre navigateur !
echo  Pour connecter d'autres postes sur le meme reseau local (Wi-Fi/LAN),
echo  partagez l'adresse IP affichee dans l'entete de l'application.
echo.
echo  (Laissez cette fenetre ouverte tant que vous utilisez l'application)
echo ======================================================================
echo.
pause

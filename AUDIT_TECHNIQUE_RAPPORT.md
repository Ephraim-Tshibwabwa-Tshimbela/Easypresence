# RAPPORT D'AUDIT TECHNIQUE COMPLET, PERFORMANCE, SÉCURITÉ ET PRODUCTION
**Projet :** EasyPresence (Recherche Excel & Gestion des Présences LAN)  
**Date d'audit :** 10 Octobre 2026  
**Environnement analysé :** Node.js v22.18.0 (Windows), Express 5.2.1, SQLite (`node:sqlite`), WebSockets (`ws`)  
**Base de données actuelle :** 2 056 inscrits, 957 historiques d'audit  

---

## 1. ÉTAT GÉNÉRAL DU PROJET

| Domaine | Note / Évaluation | Statut | Synthèse |
| :--- | :---: | :---: | :--- |
| **Architecture Globale** | 7.5 / 10 | 🟡 Bon mais fragile | Architecture Node.js + Vanilla SPA propre et réactive, mais mono-processus bloquant sous opérations lourdes. |
| **Performance (50 users)** | 8.0 / 10 | 🟢 Conforme | 341.2 requêtes/sec, P95 à 164.7 ms. Supporte 50 agents en recherche/pointage classique. |
| **Résilience sous charge lourde** | 4.0 / 10 | 🔴 Bloquant | La génération d'un export PDF bloque totalement l'Event Loop pendant 2.1 secondes pour tous les agents. |
| **Base de Données & Intégrité** | 6.0 / 10 | 🟡 À sécuriser | Mode WAL performant, mais module `node:sqlite` expérimental, PRAGMA foreign_keys manquant, et sauvegarde incomplète. |
| **Sécurité Applicative** | 3.5 / 10 | 🔴 Risque Critique | Faille d'usurpation Admin via `X-Forwarded-For`, Stored XSS dans plusieurs vues, zéro authentification des postes. |
| **Préparation au Déploiement** | 4.5 / 10 | 🔴 Insuffisant | Aucun gestionnaire de service (pas de PM2/NSSM), dépendance externe CDN Google Fonts malgré le mode hors-ligne. |

---

## 2. RÉSULTATS RÉELS DES TESTS DE CHARGE & CONCURRENCE (MESURES EFFECTIVES)

Des tests de charge réels ont été exécutés sur le serveur avec des requêtes concurrentes (recherches multi-champs, pointages, consultations de statistiques, WebSockets actifs).

### A. Tableau des mesures de charge (10 à 100 utilisateurs simultanés)

| Utilisateurs Virtuels | Requêtes Totales | Taux d'Erreur | Débit (RPS) | Temps Moyen | P50 (Médiane) | P95 | P99 | Max | WebSockets & Messages | Variation RAM Heap |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **10 VU** | 967 | **0.00 %** | **191.0 req/s** | 9.73 ms | 8.05 ms | 20.50 ms | 31.24 ms | 62.72 ms | 10 connectés (120 msg) | +16.8 MB |
| **25 VU** | 1 628 | **0.00 %** | **317.8 req/s** | 37.34 ms | 35.01 ms | 66.46 ms | 83.94 ms | 95.73 ms | 25 connectés (1 175 msg) | -4.9 MB |
| **50 VU (Cible)** | 2 783 | **0.00 %** | **341.2 req/s** | **104.43 ms** | **98.44 ms** | **164.74 ms** | **251.89 ms** | 335.36 ms | 50 connectés (5 100 msg) | +0.09 MB |
| **75 VU** | 2 156 | **0.00 %** | **343.8 req/s** | 173.02 ms | 164.27 ms | 231.06 ms | 485.63 ms | 530.22 ms | 75 connectés (13 275 msg) | -9.8 MB |
| **100 VU** | 1 913 | **0.00 %** | **306.1 req/s** | 279.32 ms | 226.30 ms | 943.98 ms | 1 176.70 ms | 1 239.94 ms | 100 connectés (23 508 msg) | +13.7 MB |

### B. Test de concurrence transactionnelle (Double-pointage simultané)
- **Scénario :** 50 postes envoyant au même milliseconde une requête de pointage pour le même candidat (ID 784 — BANZE MONGA DEBORAH).
- **Résultat :** 
  * 1 requête acceptée (présence confirmée).
  * 49 requêtes rejetées proprement (`alreadyPresent: true`).
  * 0 erreur HTTP / 0 plantage.
  * Historique d'audit : exactement 1 seule entrée enregistrée.
- **Constat :** Sur le flux nominal local, la sérialisation des opérations de l'Event Loop évite le doublon, mais l'absence de transaction SQLite explicite et de contrainte d'intégrité SQL laisse une fragilité en cas de latence asynchrone réseau.

### C. Test d'interférence opération lourde (Goulot d'étranglement majeur)
- **Scénario :** Génération d'un export PDF complet (2 056 candidats) pendant que 25 agents effectuent des recherches.
- **Résultat :**
  * Temps de génération du PDF (jsPDF + autoTable synchrone) : **2 092 ms (2,1 secondes)**.
  * **Blocage total de l'Event Loop Node.js** pendant ces 2,1 secondes.
  * La latence de recherche des agents est passée de **~8 ms à plus de 2 108 ms (P95 à 2 102 ms)**.
  * **Conséquence directe :** Si un superviseur clique sur "Export PDF" pendant que 50 agents scannent des candidats à l'entrée, tous les scanners et interfaces se figent pendant 2 à 3 secondes.

---

## 3. TABLEAU DES PROBLÈMES DÉTECTÉS & CLASSIFICATION PAR GRAVITÉ

| # | Composant | Problème Technique | Conséquence en Production | Gravité | Correction Recommandée |
| :-: | :--- | :--- | :--- | :---: | :--- |
| **1** | [routes.js](file:///c:/Users/ephra/Documents/easy_two/src/server/routes.js#L51-L71) | Confiance aveugle envers le header HTTP `X-Forwarded-For`. | **Bypass d'authentification total.** N'importe quel poste sur le réseau peut envoyer `X-Forwarded-For: 127.0.0.1` et obtenir les pleins pouvoirs d'administrateur (vider la base, réinitialiser, télécharger les backups). | 🚨 **CRITIQUE** | Ne vérifier que l'adresse IP socket réelle (`req.socket.remoteAddress`) en l'absence d'un reverse-proxy de confiance configuré. |
| **2** | [exportService.js](file:///c:/Users/ephra/Documents/easy_two/src/server/exportService.js#L274-L350) / [routes.js](file:///c:/Users/ephra/Documents/easy_two/src/server/routes.js#L547-L566) | Génération synchrone des exports PDF / Excel volumineux sur le thread principal. | **Déni de service interne.** L'Event Loop gèle pendant 2 à 5 secondes. Tous les pointages simultanés sont bloqués. | 🚨 **CRITIQUE** | Déporter la génération PDF/Excel dans un `worker_threads` Node.js ou un processus enfant asynchrone. |
| **3** | [historyView.js](file:///c:/Users/ephra/Documents/easy_two/public/js/views/historyView.js#L89-L110), [importView.js](file:///c:/Users/ephra/Documents/easy_two/public/js/views/importView.js#L303-L306), [settingsView.js](file:///c:/Users/ephra/Documents/easy_two/public/js/views/settingsView.js#L216-L225) | Absence d'échappement HTML (`escapeHtml`) lors de l'injection dans `innerHTML` (`agent_name`, en-têtes Excel, `ws.name`). | **Failles XSS Stockées (Stored XSS).** Un utilisateur injectant un payload HTML/JS dans son nom de poste ou son fichier Excel exécute du code dans le navigateur de l'administrateur. | 🔴 **ÉLEVÉ** | Sanitiser systématiquement toutes les valeurs insérées dans le DOM avec `escapeHtml()` ou utiliser `textContent`. |
| **4** | [routes.js](file:///c:/Users/ephra/Documents/easy_two/src/server/routes.js#L606-L617) | Téléchargement brut du fichier `data/attendance.db` sans checkpoint SQLite WAL. | **Sauvegarde incomplète ou corrompue.** En mode WAL, les dernières écritures résident dans `attendance.db-wal` (jusqu'à plusieurs mégaoctets) et ne sont pas incluses dans le fichier téléchargé. | 🔴 **ÉLEVÉ** | Forcer un `PRAGMA wal_checkpoint(TRUNCATE)` avant la sauvegarde ou utiliser `VACUUM INTO 'backup.db'`. |
| **5** | [db.js](file:///c:/Users/ephra/Documents/easy_two/src/server/db.js#L18-L25) | Absence d'activation de `PRAGMA foreign_keys = ON;`. | **Intégrité référentielle non appliquée.** SQLite désactive les clés étrangères par défaut. Le `ON DELETE CASCADE` ne s'exécute pas. | 🔴 **ÉLEVÉ** | Ajouter `db.exec('PRAGMA foreign_keys = ON;')` dès l'initialisation de la base. |
| **6** | [db.js](file:///c:/Users/ephra/Documents/easy_two/src/server/db.js#L1) | Utilisation du module `node:sqlite` expérimental (`ExperimentalWarning`). | Instabilité potentielle de l'API lors des mises à jour mineures de Node.js. | 🟡 **MOYEN** | Valider les flags ou figer la version Node.js d'exécution (22.x LTS). |
| **7** | [searchView.js](file:///c:/Users/ephra/Documents/easy_two/public/js/views/searchView.js#L313-L316) | Debounce de recherche fixé à seulement 25 ms. | **Tempête de requêtes (HTTP flooding).** À chaque lettre frappée par 50 agents, 50 requêtes sont envoyées quasi-instantanément. | 🟡 **MOYEN** | Augmenter le debounce à 150-200 ms pour la frappe manuelle, tout en conservant le déclenchement immédiat sur scanner code-barres. |
| **8** | [index.html](file:///c:/Users/ephra/Documents/easy_two/public/index.html#L8-L9) | Dépendance externe CDN Google Fonts (`fonts.googleapis.com`). | **Échec d'affichage / latence de rendu hors-ligne.** En réseau local isolé sans internet, les navigateurs attendent le timeout DNS de Google. | 🟡 **MOYEN** | Héberger la police Inter localement dans `/public/css/fonts/` ou utiliser la police système native. |
| **9** | [package.json](file:///c:/Users/ephra/Documents/easy_two/package.json#L21) | Vulnérabilité de sévérité élevée sur `xlsx` (SheetJS 0.18.5 Prototype Pollution & ReDoS). | Risque d'exploitation via un fichier Excel spécialement forgé. | 🟡 **MOYEN** | Mettre à jour vers la distribution officielle SheetJS ou valider strictement les fichiers importés. |
| **10** | [Lancer_Application.bat](file:///c:/Users/ephra/Documents/easy_two/Lancer_Application.bat#L20) | Démarrage par script batch simple sans redémarrage automatique en cas de crash. | Aucune reprise automatique en cas d'erreur fatale ou coupure. | 🟡 **MOYEN** | Utiliser PM2 ou un service Windows (NSSM) pour la production. |
| **11** | [index.js](file:///c:/Users/ephra/Documents/easy_two/src/server/index.js#L19-L30) | Absence de rate limiting et de headers de sécurité HTTP (Helmet, CSP). | Exposition aux attaques par déni de service et injection. | 🟡 **MOYEN** | Installer et configurer `helmet` et `express-rate-limit`. |

---

## 4. LISTE DES CORRECTIONS INDISPENSABLES AVANT PRODUCTION

### A. Bloquants absolus (À corriger impérativement avant toute ouverture à 50 postes) :
1. **Corriger `isHostMachine` dans `routes.js` :** Supprimer la dépendance à `req.headers['x-forwarded-for']` et se baser uniquement sur `req.socket.remoteAddress` pour empêcher l'usurpation des droits administrateur.
2. **Corriger la procédure de sauvegarde SQLite :** Ajouter un checkpoint WAL préalable (`PRAGMA wal_checkpoint(TRUNCATE)`) ou une commande `VACUUM INTO` pour garantir que les sauvegardes téléchargées contiennent 100% des données récentes.
3. **Corriger les failles XSS dans le frontend :** Ajouter la fonction `escapeHtml` dans `historyView.js`, `importView.js` et `settingsView.js`.
4. **Activer les clés étrangères SQLite :** Exécuter `PRAGMA foreign_keys = ON;` dans `db.js`.
5. **Rendre le mode hors-ligne 100% autonome :** Supprimer le lien vers Google Fonts dans `index.html` et déclarer les polices système modernes (`system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif`).

### B. Améliorations de performance et robustesse (Recommandées à court terme) :
1. **Augmenter le debounce de recherche :** Passer de 25 ms à 180 ms pour diviser par 4 le nombre de requêtes émises lors de la frappe par 50 agents.
2. **Asynchroniser ou isoler les exports PDF/Excel :** Empêcher le gel du serveur lors des téléchargements administratifs.
3. **Mettre en place un redémarrage automatique :** Déployer avec PM2 sous Windows (`pm2 start src/server/index.js --name easypresence`).

---

## 5. PLAN DE MISE EN PRODUCTION (WORKFLOW ÉTAPE PAR ÉTAPE)

1. **Étape 1 : Préparation du PC Serveur (Hôte)**
   - Choisir une machine avec au moins 8 Go de RAM, processeur moderne 4+ cœurs et connexion réseau filaire (Ethernet recommandé pour le PC hôte, même si les clients sont en Wi-Fi).
   - Fixer l'adresse IP statique du PC hôte sur le routeur local (ex. `192.168.1.100`).
2. **Étape 2 : Application des correctifs de sécurité et d'intégrité**
   - Sécurisation du middleware admin, activation des foreign keys, assainissement XSS, et suppression de la dépendance Google Fonts.
3. **Étape 3 : Configuration du pare-feu Windows**
   - Exécuter `fix-firewall.bat` en mode administrateur pour ouvrir le port 3000 sur le réseau privé.
4. **Étape 4 : Lancement avec supervision**
   - Configurer PM2 sous Windows pour redémarrer automatiquement l'application en cas d'anomalie :
     `npx pm2 start src/server/index.js --name easypresence`
5. **Étape 5 : Phase pré-opérationnelle (Admin)**
   - Ouvrir `http://localhost:3000`.
   - Importer le fichier Excel des candidats.
   - Sélectionner la journée active (Information ou Test).
   - Effectuer un test de sauvegarde et vérifier son intégrité.
6. **Étape 6 : Raccordement des postes agents**
   - Partager l'adresse IP LAN avec les 50 postes.
   - Les agents nomment leurs postes (ex. `Porte 1`, `Guichet Nord`).
   - L'administrateur surveille les connexions dans l'onglet *Postes connectés*.

---

## 6. VERDICT FINAL

### ⚠️ **PRÊTE SOUS RÉSERVE**

**Justification technique :**
- **Sur le plan du dimensionnement et des performances brutes :** L'application a **validé avec succès le seuil de 50 utilisateurs simultanés**, atteignant **341 requêtes par seconde** avec un temps de réponse moyen de **104 ms** et **0% d'erreur**.
- **Cependant, la mise en production immédiate sans correctifs présente 3 risques critiques :**
  1. **Risque de sécurité élevé :** L'usurpation possible des privilèges administrateur via le header `X-Forwarded-For`.
  2. **Risque d'interruption sous export :** Le blocage de 2 secondes de l'Event Loop lors des exports PDF par l'administrateur.
  3. **Risque d'intégrité des sauvegardes :** Les sauvegardes manuelles incomplètes sans checkpoint SQLite WAL.

Une fois ces correctifs prioritaires appliqués, l'application basculera immédiatement au statut **PRÊTE POUR LA PRODUCTION**.

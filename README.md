# EasyPresence — Recherche Excel & Gestion de Présence

Application web professionnelle, ultra-rapide, moderne et 100% hors-ligne pour la recherche instantanée de personnes à partir de fichiers Excel et la gestion des présences en temps réel, en mode **Solo** ou en **Groupe sur Réseau Local (LAN)**.

---

## 🌟 Points Forts & Fonctionnalités Clés

1. **100% Web & 100% Hors-Ligne (Zéro Internet Requis)** :
   - Fonctionne de manière totalement autonome sans aucune dépendance au cloud ni connexion Internet.
   - Accessible depuis n'importe quel navigateur moderne (Google Chrome, Microsoft Edge, Mozilla Firefox, Safari) sur PC, Mac, tablettes ou smartphones.

2. **Recherche Ultra-Rapide (< 5 ms)** :
   - Champ de recherche dédié XXL avec autofocus immédiat (`F2` ou `Ctrl+K`).
   - Recherche en direct dès la frappe, insensible à la casse et tolérante aux accents.
   - Recherche multi-champs instantanée : *Nom*, *Post-nom*, *Prénom*, *Matricule*, *Numéro de série* ou colonnes additionnelles.
   - Mode **Douchette / Scanner Code-Barres** : pointage automatique au scan.

3. **Importation Excel Intelligente & Souple** :
   - Formats acceptés : `.xlsx`, `.xls`, `.csv`.
   - Analyse automatique de la structure et détection intelligente des colonnes (`MATRICULE`, `NOM`, `POST-NOM`, `PRÉNOM`, `SEXE`, `SN`).
   - Préservation intégrale de toutes les colonnes supplémentaires (ex. : *Fonction*, *Direction*, *Site*, etc.).
   - Détection des doublons de matricule et prévisualisation interactive avant validation.
   - Chargement optimisé par transactions SQLite : capable d'importer des dizaines de milliers de lignes en quelques secondes.

4. **Pointage de Présence en 1 Clic** :
   - Statut visuel clair : `🟢 PRÉSENT` / `⚪ ABSENT`.
   - Raccourci clavier ultra-rapide : touches `↓` / `↑` pour sélectionner et `Entrée` pour pointer immédiatement.
   - Horodatage précis (date et heure) et enregistrement du nom de l'agent / poste.
   - Retour sonore discret (synthétiseur Web Audio natif, activable ou désactivable).

5. **Travail Collaboratif Multi-Postes en Réseau Local (LAN)** :
   - **Architecture PC Serveur + Clients Légers** : Le PC principal héberge la base locale SQLite. Les autres ordinateurs se connectent simplement en tapant l'adresse IP locale affichée (ex. `http://192.168.1.45:3000`).
   - Synchronisation en direct par **WebSockets** : dès qu'un agent pointe une personne, la mise à jour s'affiche instantanément sur tous les autres écrans sans recharger la page.
   - Zéro risque de corruption : un seul processus centralise les écritures de manière transactionnelle.

6. **Tableau de Bord & Métriques en Temps Réel** :
   - Total inscrits, Présents, Absents, Taux de présence avec barre de progression dynamique.
   - Répartition par genre (Hommes / Femmes).
   - Indicateur de l'état de connexion LAN et nombre de postes actifs.

7. **Journal d'Audit & Historique Complet** :
   - Traçabilité de chaque action : Date, Heure, Matricule, Nom complet, Action (Présent / Absent), Nom du Poste, Adresse IP.

8. **Rapports & Exportations Professionnelles** :
   - **Export Excel (.xlsx)** : Classeur structuré avec statuts, dates, heures, agents et colonnes personnalisées.
   - **Export PDF Officiel** : Document prêt pour l'impression A4 avec en-tête officiel, récapitulatif KPI, tableau d'émargement et pagination.

9. **Maintenance & Sauvegarde** :
   - Téléchargement de sauvegarde de la base locale (`.db`) en 1 clic.
   - Réinitialisation quotidienne des présences pour une nouvelle séance tout en conservant la liste des inscrits.
   - Nettoyage complet de la base en cas de besoin.

---

## 🚀 Démarrage Rapide

### Option 1 : Double-clic sous Windows (Recommandé)
Double-cliquez simplement sur le fichier :
```
Lancer_Application.bat
```
Ce script démarre le serveur local et ouvre automatiquement l'application dans votre navigateur web par défaut à l'adresse `http://localhost:3000`.

### Option 2 : En Ligne de Commande
```bash
# 1. Démarrer l'application
npm start

# 2. Ouvrir votre navigateur
# Rendez-vous sur : http://localhost:3000
```

---

## 🌐 Comment Connecter D'autres Ordinateurs sur le Réseau Local ?

1. Assurez-vous que les ordinateurs sont connectés au **même réseau local** (même box Wi-Fi, routeur ou switch réseau par câble Ethernet). **Aucune connexion Internet n'est requise.**
2. Sur le PC principal, notez l'adresse **LAN** affichée en haut à droite de l'application ou dans la section **Réseau & Réglages** (ex. : `http://192.168.1.45:3000`).
3. Sur les autres ordinateurs ou tablettes des agents, ouvrez simplement Google Chrome ou Edge et saisissez cette adresse.
4. Dans **Paramètres**, chaque agent peut personnaliser le nom de son poste (ex. : `Poste Entrée Nord`, `Agent Sarah`).
5. Tous les pointages se synchronisent en direct !

---

## ⌨️ Raccourcis Clavier Pratiques

| Touche | Action |
| :--- | :--- |
| **`F2`** ou **`Ctrl + K`** | Ouvrir la Recherche Ultra-Rapide et placer le curseur |
| **`↓`** / **`↑`** | Naviguer entre les personnes trouvées |
| **`Entrée`** | Marquer la personne sélectionnée comme Présente / Absente |
| **`Échap`** | Effacer le champ de recherche |
| **`F1`** | Revenir au Tableau de bord |
| **`F3`** | Ouvrir la Liste complète des inscrits |
| **`F4`** | Ouvrir l'importateur Excel |

---

## 📁 Structure du Projet

```
easy_two/
├── Lancer_Application.bat      # Lanceur 1-clic pour Windows
├── package.json                # Configuration et dépendances
├── README.md                   # Documentation complète
├── data/
│   └── attendance.db           # Base SQLite locale indexée (mode WAL)
├── src/
│   └── server/
│       ├── index.js            # Serveur Express & point d'entrée HTTP
│       ├── db.js               # Moteur SQLite (recherche plein texte, requêtes, transactions)
│       ├── routes.js           # API REST (stats, search, presence, excel, export)
│       ├── excelParser.js      # Détection intelligente des colonnes & import par lot
│       ├── exportService.js    # Générateur de rapports Excel (.xlsx) et PDF
│       ├── websocket.js        # Hub de synchronisation temps réel LAN
│       └── network.js          # Détecteur automatique de l'IP du réseau local
├── public/                     # Interface Web Moderne (HTML5 / Vanilla JS / CSS)
│   ├── index.html              # Interface utilisateur monopage
│   ├── css/
│   │   ├── variables.css       # Design tokens (mode sombre & clair, palette)
│   │   ├── style.css           # Mise en page, sidebar et topbar
│   │   └── components.css      # Cartes KPI, champ XXL, tableaux, badges, modals
│   └── js/
│       ├── app.js              # Coordinateur principal & navigation
│       ├── api.js              # Client API REST & écouteur WebSocket
│       ├── state.js            # Gestionnaire d'état réactif
│       ├── sound.js            # Synthétiseur sonore de confirmation
│       └── views/              # Vues spécialisées
│           ├── dashboardView.js
│           ├── searchView.js   # Vue dédiée à la recherche ultra-rapide
│           ├── listView.js     # Tableau des inscrits avec filtres et actions groupées
│           ├── importView.js   # Importateur Excel avec aperçu et mapping
│           ├── historyView.js  # Journal d'audit chronologique
│           ├── exportView.js   # Téléchargements Excel & PDF
│           └── settingsView.js # Configuration réseau LAN & maintenance
└── test/
    ├── generate_test_data.js   # Générateur de jeux de données (officiel + 3 000 lignes)
    └── test_end_to_end.js      # Suite de tests automatisés de performance
```

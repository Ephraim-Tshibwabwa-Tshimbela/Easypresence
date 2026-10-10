import * as XLSX from 'xlsx';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const testDir = path.resolve(__dirname);
if (!fs.existsSync(testDir)) {
  fs.mkdirSync(testDir, { recursive: true });
}

// 1. Generate Sample File with the exact prompt data + extra columns
const officialSample = [
  { 'SN': 1, 'MATRICULE': '74007805010017', 'NOM': 'ALI', 'POST-NOM': 'MAPENDO', 'PRÉNOM': 'CHARON', 'SEXE': 'F', 'FONCTION': 'Comptable', 'SITE': 'Siège Central' },
  { 'SN': 2, 'MATRICULE': '74022201010017', 'NOM': 'AMINA', 'POST-NOM': 'BAHANE', 'PRÉNOM': 'JOELLE', 'SEXE': 'F', 'FONCTION': 'Superviseur RH', 'SITE': 'Site Gombe' },
  { 'SN': 3, 'MATRICULE': '74027201060027', 'NOM': 'ANGELANI', 'POST-NOM': 'NSENGA', 'PRÉNOM': 'ESTHER', 'SEXE': 'F', 'FONCTION': 'Technicienne', 'SITE': 'Site Limete' },
  { 'SN': 4, 'MATRICULE': '74027201060037', 'NOM': 'ANNE', 'POST-NOM': 'MARIE', 'PRÉNOM': 'RAMANE', 'SEXE': 'F', 'FONCTION': 'Secrétaire', 'SITE': 'Siège Central' },
  { 'SN': 5, 'MATRICULE': '74011101030017', 'NOM': 'ARLY', 'POST-NOM': 'CONSOLATE', 'PRÉNOM': 'SANDON', 'SEXE': 'F', 'FONCTION': 'Ingénieur Logiciel', 'SITE': 'Site Gombe' },
  { 'SN': 6, 'MATRICULE': '74011101030028', 'NOM': 'BAHATI', 'POST-NOM': 'LUKOO', 'PRÉNOM': 'PATRICK', 'SEXE': 'M', 'FONCTION': 'Chef de Projet', 'SITE': 'Site Limete' },
  { 'SN': 7, 'MATRICULE': '74011101030039', 'NOM': 'BAKUPA', 'POST-NOM': 'KABONGO', 'PRÉNOM': 'JEAN-PAUL', 'SEXE': 'M', 'FONCTION': 'Coordonnateur', 'SITE': 'Siège Central' },
  { 'SN': 8, 'MATRICULE': '74011101030040', 'NOM': 'MUKENDI', 'POST-NOM': 'TSHIMANGA', 'PRÉNOM': 'DIEUDONNÉ', 'SEXE': 'M', 'FONCTION': 'Chauffeur', 'SITE': 'Logistique' },
  { 'SN': 9, 'MATRICULE': '74011101030051', 'NOM': 'KAPINGA', 'POST-NOM': 'ILUNGA', 'PRÉNOM': 'GRÂCE', 'SEXE': 'F', 'FONCTION': 'Réceptionniste', 'SITE': 'Siège Central' },
  { 'SN': 10, 'MATRICULE': '74011101030062', 'NOM': 'KASEREKA', 'POST-NOM': 'KAMBALE', 'PRÉNOM': 'JACQUES', 'SEXE': 'M', 'FONCTION': 'Agent d\'Accueil', 'SITE': 'Entrée Nord' }
];

const wb1 = XLSX.utils.book_new();
const ws1 = XLSX.utils.json_to_sheet(officialSample);
XLSX.utils.book_append_sheet(wb1, ws1, 'Liste Officielle');
const file1Path = path.join(testDir, 'echantillon_officiel.xlsx');
XLSX.writeFile(wb1, file1Path);
console.log(`[OK] Fichier échantillon officiel généré : ${file1Path}`);

// 2. Generate a Large Scale File (3,000 records) to test real-world scale
const firstNamesM = ['Jean', 'Patrick', 'David', 'Jacques', 'Marc', 'Emmanuel', 'Alain', 'Christian', 'Joseph', 'Paul', 'Michel', 'Serge', 'Dieudonné', 'Fabrice', 'Jonathan'];
const firstNamesF = ['Joelle', 'Amina', 'Esther', 'Grâce', 'Rachel', 'Sarah', 'Marie', 'Sandrine', 'Dorcas', 'Chantal', 'Nathalie', 'Prisca', 'Clarisse', 'Ruth', 'Naomie'];
const lastNames = ['MUKENDI', 'KASEREKA', 'ILUNGA', 'MUTOMBO', 'BAHANE', 'NSENGA', 'MAPENDO', 'TSHILOMBO', 'KABAMBA', 'MWAMBA', 'LUMUMBA', 'KAMBALE', 'NDONGO', 'MALUBA', 'NZUZI', 'KASONGO', 'BOKETSHU', 'KALONJI', 'BWIRA', 'MASIKA'];
const postNames = ['KABONGO', 'TSHIMANGA', 'LUKOO', 'RAMANE', 'SANDON', 'CONSOLATE', 'KAPINGA', 'MUHINDO', 'MBENGA', 'MUTEBA', 'TUMBA', 'KASONGO', 'BASHIZI', 'MWANZAMBAMBI'];
const functions = ['Agent Administratif', 'Technicien Supérieur', 'Comptable', 'Superviseur Opérations', 'Coordonnateur', 'Assistant RH', 'Analyste Données', 'Opérateur Logistique'];
const sites = ['Siège Central', 'Site Nord', 'Site Sud', 'Site Est', 'Site Ouest', 'Dépôt Principal'];

const largeData = [];
const count = 3000;

for (let i = 1; i <= count; i++) {
  const isFemale = i % 2 === 0;
  const prenomList = isFemale ? firstNamesF : firstNamesM;
  const prenom = prenomList[Math.floor(Math.random() * prenomList.length)];
  const nom = lastNames[Math.floor(Math.random() * lastNames.length)];
  const postnom = postNames[Math.floor(Math.random() * postNames.length)];
  const sexe = isFemale ? 'F' : 'M';
  const matNumber = String(74000000000000 + i);
  const fonc = functions[Math.floor(Math.random() * functions.length)];
  const site = sites[Math.floor(Math.random() * sites.length)];

  largeData.push({
    'N° ORDRE': i,
    'CODE MATRICULE': matNumber,
    'NOM DE FAMILLE': nom,
    'POSTNOM': postnom,
    'PRENOM': prenom,
    'GENRE': sexe,
    'DEPARTEMENT / SERVICE': fonc,
    'AFFECTATION': site
  });
}

const wb2 = XLSX.utils.book_new();
const ws2 = XLSX.utils.json_to_sheet(largeData);
XLSX.utils.book_append_sheet(wb2, ws2, 'Grand Registre');
const file2Path = path.join(testDir, 'grand_fichier_3000.xlsx');
XLSX.writeFile(wb2, file2Path);
console.log(`[OK] Fichier de test à grande échelle (3 000 lignes) généré : ${file2Path}`);

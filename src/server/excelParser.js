import * as XLSX from 'xlsx';
import { insertPersonsBatch, normalizeText } from './db.js';

// Synonyms dictionary for intelligent fuzzy matching of columns
const SYNONYMS = {
  matricule: [
    'matricule', 'mat', 'matricul', 'n° matricule', 'no matricule', 'num matricule', 
    'matricule n°', 'id', 'identifiant', 'code', 'badge', 'card', 'carte'
  ],
  nom: [
    'nom', 'noms', 'last name', 'lastname', 'nom de famille', 'surname', 'family name'
  ],
  postnom: [
    'postnom', 'post-nom', 'post_nom', 'post nom', 'middle name', 'deuxieme nom'
  ],
  prenom: [
    'prenom', 'prénom', 'first name', 'firstname', 'prenoms', 'prénoms'
  ],
  sexe: [
    'sexe', 'sex', 'genre', 'gender'
  ],
  sn: [
    'sn', 's/n', 'n°', 'no', 'numero', 'numéro', 'num', 's.n', 'ordre', 'n° ordre', 'rang',
    'n° serie', 'n° de serie', 'no serie', 'num serie', 'numero serie', 'numéro de série',
    'serial', 'serial number', 'serie'
  ]
};

/**
 * Normalizes a header string for comparison
 */
function cleanHeader(header) {
  if (!header) return '';
  return String(header)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/**
 * Finds the best matching standard field for a given Excel header
 */
export function guessFieldMapping(header) {
  const cleaned = cleanHeader(header);
  if (!cleaned) return null;

  // Pass 1: Exact matches first
  for (const [field, syns] of Object.entries(SYNONYMS)) {
    for (const syn of syns) {
      if (cleaned === cleanHeader(syn)) {
        return field;
      }
    }
  }

  // Pass 2: StartsWith / prefix matches
  for (const [field, syns] of Object.entries(SYNONYMS)) {
    for (const syn of syns) {
      const cleanSyn = cleanHeader(syn);
      if (cleaned.startsWith(cleanSyn) || cleanSyn.startsWith(cleaned)) {
        return field;
      }
    }
  }

  // Pass 3: Substring matches
  for (const [field, syns] of Object.entries(SYNONYMS)) {
    for (const syn of syns) {
      const cleanSyn = cleanHeader(syn);
      if (cleaned.includes(cleanSyn) || cleanSyn.includes(cleaned)) {
        return field;
      }
    }
  }
  return null;
}

/**
 * Parses an Excel buffer and returns an analysis with preview
 * CRITICAL: Uses cellNF: true, cellText: true, raw: false to guarantee
 * that formatted strings like "0002", "0008", "0028" keep all leading zeros!
 */
export function analyzeExcelBuffer(buffer) {
  const workbook = XLSX.read(buffer, {
    type: 'buffer',
    cellDates: true,
    cellNF: true,
    cellText: true
  });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error('Le classeur Excel ne contient aucune feuille.');
  }

  const sheet = workbook.Sheets[firstSheetName];
  // Parse as array of arrays with raw: false to preserve formatted text
  const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });

  if (!rawData || rawData.length === 0) {
    throw new Error('La feuille Excel est vide.');
  }

  // Find header row (the first row containing at least one non-empty string)
  let headerRowIndex = 0;
  for (let i = 0; i < Math.min(10, rawData.length); i++) {
    const row = rawData[i];
    if (Array.isArray(row) && row.some(cell => String(cell).trim().length > 0)) {
      headerRowIndex = i;
      break;
    }
  }

  const rawHeaders = rawData[headerRowIndex].map(h => String(h || '').trim());
  const validHeaders = rawHeaders.filter(Boolean);

  if (validHeaders.length === 0) {
    throw new Error('Aucun en-tête valide trouvé dans le fichier.');
  }

  // Build suggested mappings: 2-phase matching
  const mapping = {};
  const mappedFields = new Set();

  // Phase 1: Exact matches first
  for (const h of validHeaders) {
    const cleaned = cleanHeader(h);
    for (const [field, syns] of Object.entries(SYNONYMS)) {
      if (mappedFields.has(field)) continue;
      for (const syn of syns) {
        if (cleaned === cleanHeader(syn)) {
          mapping[field] = h;
          mappedFields.add(field);
          break;
        }
      }
    }
  }

  // Phase 2: Fuzzy matches for remaining unmapped fields
  for (const h of validHeaders) {
    if (Object.values(mapping).includes(h)) continue;
    const matchedField = guessFieldMapping(h);
    if (matchedField && !mappedFields.has(matchedField)) {
      mapping[matchedField] = h;
      mappedFields.add(matchedField);
    }
  }

  // Extract all data rows as objects with raw: false to keep formatted string values
  const rows = XLSX.utils.sheet_to_json(sheet, {
    range: headerRowIndex,
    defval: '',
    raw: false
  });

  // Analyze rows, check duplicates, empty rows, etc.
  const matriculesSeen = new Map();
  const duplicatesInFile = [];
  let incompleteCount = 0;

  const previewRows = [];
  const totalRows = rows.length;

  for (let i = 0; i < totalRows; i++) {
    const row = rows[i];
    
    // Check if the row has any data
    const hasValues = Object.values(row).some(v => String(v).trim().length > 0);
    if (!hasValues) continue;

    // Check matricule if mapped
    if (mapping.matricule && row[mapping.matricule] !== undefined) {
      const mat = String(row[mapping.matricule] || '').trim();
      if (mat) {
        if (matriculesSeen.has(mat)) {
          duplicatesInFile.push({
            matricule: mat,
            firstRow: matriculesSeen.get(mat),
            duplicateRow: i + headerRowIndex + 2
          });
        } else {
          matriculesSeen.set(mat, i + headerRowIndex + 2);
        }
      }
    }

    // Check nom
    const nomVal = mapping.nom ? String(row[mapping.nom] || '').trim() : '';
    if (!nomVal) {
      incompleteCount++;
    }

    if (previewRows.length < 10) {
      // Ensure row preview values are strings
      const safeRow = {};
      for (const [k, v] of Object.entries(row)) {
        safeRow[k] = v !== undefined && v !== null ? String(v).trim() : '';
      }
      previewRows.push(safeRow);
    }
  }

  return {
    sheetNames: workbook.SheetNames,
    activeSheet: firstSheetName,
    headers: validHeaders,
    suggestedMapping: mapping,
    totalRows,
    incompleteCount,
    duplicateCount: duplicatesInFile.length,
    duplicates: duplicatesInFile.slice(0, 20),
    previewRows
  };
}

/**
 * Executes the confirmed import with the user's column mapping
 * CRITICAL: Never converts SN to a number (no parseInt/Number/parseFloat).
 * All cell values are read with raw: false to preserve formatted text (e.g. "0002").
 */
export function executeImport({
  buffer,
  filename = 'Fichier Excel',
  mapping, // { matricule: 'MATRICULE', nom: 'NOM', postnom: 'POST-NOM', prenom: 'PRÉNOM', sexe: 'SEXE', sn: 'SN' }
  updateDuplicates = false
}) {
  const workbook = XLSX.read(buffer, {
    type: 'buffer',
    cellDates: true,
    cellNF: true,
    cellText: true
  });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error('Le classeur Excel ne contient aucune feuille valide.');
  }

  const sheet = workbook.Sheets[firstSheetName];

  // Find header row consistently
  const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
  let headerRowIndex = 0;
  for (let i = 0; i < Math.min(10, rawData.length); i++) {
    const row = rawData[i];
    if (Array.isArray(row) && row.some(cell => String(cell).trim().length > 0)) {
      headerRowIndex = i;
      break;
    }
  }

  // Read data rows with raw: false so that cell.w formatted text ("0002") is preserved
  const rows = XLSX.utils.sheet_to_json(sheet, {
    range: headerRowIndex,
    defval: '',
    raw: false
  });

  const mappedFieldValues = new Set(Object.values(mapping));
  const personsToInsert = [];

  for (const row of rows) {
    // Check if row is completely empty
    if (!Object.values(row).some(v => String(v).trim().length > 0)) continue;

    const nom = mapping.nom && row[mapping.nom] !== undefined && row[mapping.nom] !== null
      ? String(row[mapping.nom]).trim()
      : '';
    // Must have at least a nom to be imported
    if (!nom) continue;

    const matricule = mapping.matricule && row[mapping.matricule] !== undefined && row[mapping.matricule] !== null
      ? String(row[mapping.matricule]).trim() 
      : '';
    const postnom = mapping.postnom && row[mapping.postnom] !== undefined && row[mapping.postnom] !== null
      ? String(row[mapping.postnom]).trim() 
      : '';
    const prenom = mapping.prenom && row[mapping.prenom] !== undefined && row[mapping.prenom] !== null
      ? String(row[mapping.prenom]).trim() 
      : '';
    
    // Normalize Sexe: 'F', 'M', or raw trimmed string
    let sexe = mapping.sexe && row[mapping.sexe] !== undefined && row[mapping.sexe] !== null
      ? String(row[mapping.sexe]).trim().toUpperCase()
      : '';
    if (sexe.startsWith('F')) sexe = 'F';
    else if (sexe.startsWith('M') || sexe.startsWith('H')) sexe = 'M';

    // CRITICAL: SN must remain a string at all times, preserving leading zeros (e.g. "0002")
    const sn = mapping.sn && row[mapping.sn] !== undefined && row[mapping.sn] !== null
      ? String(row[mapping.sn]).trim()
      : '';

    // Collect any extra columns not mapped to standard fields
    const extra = {};
    for (const [key, value] of Object.entries(row)) {
      if (!mappedFieldValues.has(key) && value !== undefined && value !== null && String(value).trim()) {
        extra[key] = String(value).trim();
      }
    }

    personsToInsert.push({
      sn,
      matricule,
      nom,
      postnom,
      prenom,
      sexe,
      extra_data: Object.keys(extra).length > 0 ? extra : null
    });
  }

  return insertPersonsBatch(personsToInsert, updateDuplicates, filename);
}

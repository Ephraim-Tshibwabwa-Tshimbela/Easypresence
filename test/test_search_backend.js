import { searchPersons } from '../src/server/db.js';

const queries = [
  'Jean',
  'BANZE',
  'BANZE M',
  'BANZE MONGA',
  'BANZE MUKADI',
  'MUBIAYI KADIEBUE',
  'KILWILO KALONDA FRANCOIS',
  'Pierre Tshibwabwa'
];

for (const q of queries) {
  try {
    const res = searchPersons(q, 3);
    console.log(`Query: "${q}" -> count: ${res.length}`);
    if (res.length > 0) {
      console.log(`  Top 1: ${res[0].nom} (SN: ${res[0].sn})`);
    }
  } catch (err) {
    console.error(`Query: "${q}" -> ERROR:`, err.message);
  }
}

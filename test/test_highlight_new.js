function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function highlightMatchNew(text, terms) {
  if (!text) return '';
  const str = String(text);
  if (!terms || terms.length === 0) return escapeHtml(str);

  const cleanTerms = Array.from(new Set(
    terms
      .map(t => String(t || '').trim())
      .filter(t => t.length > 0)
  )).sort((a, b) => b.length - a.length);

  if (cleanTerms.length === 0) return escapeHtml(str);

  const escapedTerms = cleanTerms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const regex = new RegExp(`(${escapedTerms.join('|')})`, 'gi');

  const parts = str.split(regex);
  return parts.map(part => {
    if (!part) return '';
    const isMatch = cleanTerms.some(t => part.toLowerCase() === t.toLowerCase());
    if (isMatch) {
      return `<mark class="hl">${escapeHtml(part)}</mark>`;
    }
    return escapeHtml(part);
  }).join('');
}

console.log('--- TEST 1: [banze, m] on BANZE MONGA DEBORAH ---');
console.log(highlightMatchNew('BANZE MONGA DEBORAH', ['banze', 'm']));

console.log('\n--- TEST 2: [jean, a] on Jean Dupont ---');
console.log(highlightMatchNew('Jean Dupont', ['jean', 'a']));

console.log('\n--- TEST 3: [jean, dupont] on Jean Dupont ---');
console.log(highlightMatchNew('Jean Dupont', ['jean', 'dupont']));

console.log('\n--- TEST 4: [pierre, tshibwabwa] on Pierre Tshibwabwa ---');
console.log(highlightMatchNew('Pierre Tshibwabwa', ['pierre', 'tshibwabwa']));

console.log('\n--- TEST 5: [banze, mukadi] on BANZE MUKADI FRANCK ---');
console.log(highlightMatchNew('BANZE MUKADI FRANCK', ['banze', 'mukadi']));

console.log('\n--- TEST 6: [m, a, r, k] on Mark Zuckerberg ---');
console.log(highlightMatchNew('Mark Zuckerberg', ['m', 'a', 'r', 'k']));

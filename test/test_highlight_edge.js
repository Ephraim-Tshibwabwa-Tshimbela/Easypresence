function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function highlightMatch(text, terms) {
  if (!text) return '';
  const str = String(text);
  if (!terms || terms.length === 0) return escapeHtml(str);

  // Clean, trim and deduplicate terms; sort descending by length
  const cleanTerms = Array.from(new Set(
    terms
      .map(t => String(t || '').trim())
      .filter(t => t.length > 0)
  )).sort((a, b) => b.length - a.length);

  if (cleanTerms.length === 0) return escapeHtml(str);

  const escapedTerms = cleanTerms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const combinedRegex = new RegExp(`(${escapedTerms.join('|')})`, 'gi');

  const parts = str.split(combinedRegex);
  return parts.map(part => {
    if (!part) return '';
    const isMatch = cleanTerms.some(t => part.toLowerCase() === t.toLowerCase());
    if (isMatch) {
      return `<mark class="hl">${escapeHtml(part)}</mark>`;
    }
    return escapeHtml(part);
  }).join('');
}

console.log('Test overlapping [jean, j]:', highlightMatch('Jean Dupont', ['jean', 'j']));
console.log('Test space in text [jean, dupont]:', highlightMatch('Jean   Dupont', ['jean', 'dupont']));
console.log('Test special chars in query [jean-pierre]:', highlightMatch('Jean-Pierre Durand', ['jean-pierre']));
console.log('Test capture screenshot case [banze, m]:', highlightMatch('BANZE MONGA DEBORAH', ['banze', 'm']));
console.log('Test capture screenshot case 2 [banze, m]:', highlightMatch('BANZE MUKADI FRANCK', ['banze', 'm']));

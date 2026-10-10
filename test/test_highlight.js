function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function highlightMatchOld(text, terms) {
  if (!text) return '';
  if (!terms || terms.length === 0) return escapeHtml(String(text));
  let result = escapeHtml(String(text));
  for (const term of terms) {
    if (!term || term.length < 1) continue;
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, 'gi');
    result = result.replace(regex, '<mark class="hl">$1</mark>');
  }
  return result;
}

console.log('Result for [banze, m]:');
console.log(highlightMatchOld('BANZE MONGA DEBORAH', ['banze', 'm']));

console.log('\nResult for [jean, dupont]:');
console.log(highlightMatchOld('Jean Dupont', ['jean', 'dupont']));

console.log('\nResult for [jean, a]:');
console.log(highlightMatchOld('Jean Dupont', ['jean', 'a']));

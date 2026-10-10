/**
 * Utility functions for frontend sanitization and formatting.
 */

/**
 * Escapes all HTML special characters to prevent Cross-Site Scripting (XSS).
 * Strictly converts null or undefined to empty string.
 */
export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Formats ISO date-time string to localized French time (HH:MM).
 */
export function formatTime(isoStr) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr.replace(' ', 'T'));
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  } catch (_) {
    return isoStr;
  }
}

/**
 * Formats ISO date-time string to localized French date (JJ/MM/AAAA).
 */
export function formatDate(isoStr) {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr.replace(' ', 'T'));
    return d.toLocaleDateString('fr-FR');
  } catch (_) {
    return isoStr;
  }
}

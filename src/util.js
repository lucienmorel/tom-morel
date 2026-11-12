const MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const e = s => String(s ?? '').replace(/[&<>"']/g, c => MAP[c]);

const paragraphs = text => String(text || '')
  .split(/\n\s*\n/)
  .map(p => p.trim())
  .filter(Boolean);

const parasHtml = text => paragraphs(text)
  .map(p => `<p>${e(p).replace(/\n/g, '<br>')}</p>`)
  .join('');

function fmtDate(sqlDate) {
  const d = new Date(String(sqlDate).replace(' ', 'T') + 'Z');
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

const plural = (n, one, many) => `${n} ${n > 1 ? (many || one + 's') : one}`;

const toArr = v => (v == null ? [] : Array.isArray(v) ? v : [v]);

const clean = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

// Retire les guillemets que l'auteur aurait déjà mis autour d'une citation
const stripQuotes = t => String(t).trim().replace(/^[«"“„‘'\s]+|[»"”’'\s]+$/g, '').trim();

const frCompare = (a, b) => String(a).localeCompare(String(b), 'fr', { sensitivity: 'base', ignorePunctuation: true });

function contentDisposition(type, filename) {
  const ascii = filename.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w.\- ]+/g, '_');
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

const slug = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'fiche';

// Apostrophe droite -> apostrophe typographique
const typo = t => String(t ?? '').replace(/(\w)'(?=\w)/g, '$1’').replace(/'/g, '’');

module.exports = { e, typo, paragraphs, parasHtml, fmtDate, plural, toArr, clean, stripQuotes, frCompare, contentDisposition, slug };

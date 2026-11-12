// Descriptions affichées en haut des pages, modifiables par les administrateurs.
// Un texte laissé vide dans l'administration rétablit le texte d'origine.
const { db } = require('./db');

const PAGES = [
  ['home', 'Accueil', 'Une couverture, un thème, un résumé, les citations qui ont compté. Le site compose la fiche et l’ajoute aux recueils communs.'],
  ['lib', 'Bibliothèque', ''],
  ['cit', 'Citations', 'Une phrase retenue, sans rédiger toute une fiche : il suffit de la référence.'],
  ['fbi', 'Fausses bonnes idées', 'Les ouvrages que l’on déconseille : séduisants sur le papier, décevants ou trompeurs à la lecture. Un titre suffit.'],
  ['carnet', 'Carnet de route', 'Conseils, organisation, retours d’expérience : ce qui aide à garder une vie intérieure malgré les aléas du métier.'],
  ['dl', 'Téléchargements', 'Les recueils sont recomposés à chaque téléchargement : ils intègrent toujours les dernières fiches.'],
];
const MAX = 600;
const DEFAULTS = Object.fromEntries(PAGES.map(([k, , d]) => [k, d]));

function intro(key) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(`intro:${key}`);
  return row ? row.value : DEFAULTS[key] || '';
}

function setIntro(key, text) {
  if (!(key in DEFAULTS)) return;
  const value = String(text || '').replace(/\s+/g, ' ').trim().slice(0, MAX);
  if (!value || value === DEFAULTS[key]) db.prepare('DELETE FROM settings WHERE key = ?').run(`intro:${key}`);
  else db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(`intro:${key}`, value);
}

const allIntros = () => PAGES.map(([key, label, def]) => ({ key, label, def, value: intro(key) }));

module.exports = { intro, setIntro, allIntros, MAX };

// Règle du cercle : texte libre, modifiable par les administrateurs, affiché sur l'accueil.
// Format : blocs séparés par une ligne vide. Un bloc d'une seule ligne est un paragraphe
// d'introduction ; un bloc de plusieurs lignes est un article (1re ligne = titre).
const { db } = require('./db');
const { e, typo, paragraphs } = require('./util');

const KEY = 'regle';
const MAX = 8000;

const DEFAULT_RULE = `« Le métier me doit le temps qu'il me faut pour ma vie intérieure. »

Le but
Le but de ma vie est le salut de mon âme, non l'espoir de ne jamais recevoir de reproche sur la façon dont j'accomplis mon métier. Le cercle existe pour nous aider à ne pas le perdre de vue.

La prière
Méditation et prière chaque jour, quels que soient les aléas du service. Une prière véritable, et non une récitation de formules.

Le travail
Le travail est une prière autant qu'il est offert à Dieu ; il ne la remplace pas. Fait pour les honneurs, la récompense ou les félicitations, il n'en est plus une.

La formation
Notre métier exige une formation propre. Chacun lit, puis partage : une fiche, une idée de lecture, une citation. Ce qui est gardé pour soi ne sert qu'à un seul.

L'organisation
Une vie intérieure se prépare. Chacun tient un emploi du temps souple mais précis, et partage ce qui lui permet de tenir.

La constance
Peu, mais régulièrement. Mieux vaut une petite initiative tenue dans la durée qu'un grand projet abandonné. Ce que nous refusons, c'est de ne rien faire.

L'entraide
Nul ne tient seul. Ce qui est partagé ici l'est entre membres, pour que chacun fasse rayonner sa foi là où il sert.`;

function getRule() {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(KEY);
  return row ? row.value : DEFAULT_RULE;
}

function setRule(text) {
  const value = String(text || '').replace(/\r\n/g, '\n').trim().slice(0, MAX);
  db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(KEY, value);
}

const resetRule = () => db.prepare('DELETE FROM settings WHERE key = ?').run(KEY);

function ruleHtml(text) {
  const intro = [], articles = [];
  for (const block of paragraphs(text)) {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) {
      (articles.length ? articles : intro).push(`<p class="rule-p">${e(typo(lines[0]))}</p>`);
    } else {
      articles.push(`<li><h3>${e(typo(lines[0]))}</h3><p>${lines.slice(1).map(l => e(typo(l))).join('<br>')}</p></li>`);
    }
  }
  // Les paragraphes placés après le premier article restent dans la liste, hors numérotation
  const list = articles.map(a => (a.startsWith('<li>') ? a : `<li class="plain">${a}</li>`)).join('');
  return `${intro.join('')}${list ? `<ol class="rule-list">${list}</ol>` : ''}`;
}

module.exports = { getRule, setRule, resetRule, ruleHtml, DEFAULT_RULE, MAX };

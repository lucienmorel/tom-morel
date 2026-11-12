// Règle du cercle : texte libre, modifiable par les administrateurs, affiché sur l'accueil.
// Format : blocs séparés par une ligne vide. Un bloc d'une seule ligne est un paragraphe
// d'introduction ; un bloc de plusieurs lignes est un article (1re ligne = titre).
const { db } = require('./db');
const { e, typo, paragraphs } = require('./util');

const KEY = 'regle';
const MAX = 8000;

// Les articles I à V reprennent le texte « Du point de vue spirituel » ; VI et VII, le projet du cercle.
const DEFAULT_RULE = `Le but
Le but de ma vie est le salut de mon âme, et non pas l'espoir de ne jamais recevoir de reproche sur la façon dont j'accomplis mon métier.

Le travail
Le travail est une prière. Oui, mais il ne remplace pas entièrement la prière ; et il n'est une prière qu'autant qu'il est offert à Dieu. Si le travail a pour raison d'être l'argent ou les honneurs, ou l'espoir d'une félicitation ou d'une récompense, ce n'est plus une prière.

La prière
Méditation et prière sont choses nécessaires. Elles doivent être quotidiennes. Prière… et non pas récitation de formules.

Le temps
Le métier me doit le temps qu'il me faut pour ma vie intérieure. Ce temps se prévoit : chacun tient un emploi du temps souple mais précis, qui résiste aux aléas du service.

Le bilan
Une année qui ne m'a pas fait faire de progrès du point de vue spirituel est une mauvaise année, quels qu'en soient les succès. Chacun fait régulièrement le point.

La formation
Notre métier exige une formation propre. Chacun lit, puis partage : une fiche, une idée de lecture, une citation.

La constance
Peu, mais régulièrement. Ce que nous refusons, c'est de ne rien faire.`;

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

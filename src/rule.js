// Règle du cercle : texte libre, modifiable par les administrateurs, affiché sur l'accueil.
// Format : blocs séparés par une ligne vide. Un bloc d'une seule ligne est un paragraphe
// d'introduction ; un bloc de plusieurs lignes est un article (1re ligne = titre,
// chaque ligne suivante = un paragraphe).
const { db } = require('./db');
const { e, typo, paragraphs } = require('./util');

const KEY = 'regle';
const MAX = 8000;

const DEFAULT_RULE = `« Le métier me doit donc le temps qu'il me faut pour ma vie intérieure » (Alain de Penfentenyo)

Le constat
Force est de constater que cela n'est pas évident… Ce cercle a pour but de vous y aider, de faire de vous de bons catholiques militaires.
J'ai bien dit de bons catholiques et de bons militaires, ensemble ! C'est notre idéal de vie : être saint en étant militaire. Nous ne pouvons pas nous y prendre comme le reste des autres professions.
Par exemple, les médecins ont leurs associations d'éthique catholique et leur revue (les Cahiers Saint-Raphaël). Pour les militaires, rien, alors que notre métier en a tout autant besoin. Ce cercle a pour objectif d'y remédier.

Les limites des cercles classiques
Pour la formation intellectuelle, rien de tel que les cercles. Cependant cela exige une chose primordiale : la constance. Dans l'armée, cela est mission impossible. De plus, cela ne traite que la formation intellectuelle, délaissant la vie intérieure, la piété, l'apostolat, etc. Une simple cellule ne saurait donc répondre entièrement à notre sujet.

Le concept du site
1. Formation intellectuelle : partage de fiches de lecture, d'idées de lecture et de citations, axées sur la vie militaire en tant que catholique. Cela demandera peu de travail : il suffit de prendre quelques notes à la lecture d'un bon livre pour le partager avec les autres. Cela peut être fait à très grande échelle afin d'avoir une base de données foisonnante !
2. Concilier vie catho et vie militaire (« carnet de route ») : il faut être très organisé pour garder une vie intérieure malgré les aléas du métier, mais de façon souple. Plus que des emplois du temps, cette section est là pour partager des conseils pour avoir une vie spirituelle normale. Si chacun partage les siens, on finira par avoir une ligne de conduite solide, adaptée à notre métier.

Les limites du site
Évidemment, rien ne vaut de se réunir entre nous. Partout où cela est possible, priez ensemble (« Là où deux ou trois sont réunis en mon nom, je suis là, au milieu d'eux », Mt 18, 20), étudiez ensemble, demandez-vous conseil en réel. Ce site ne saura jamais remplacer cela.`;

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
      articles.push(`<li><h3>${e(typo(lines[0]))}</h3>${lines.slice(1).map(l => `<p>${e(typo(l))}</p>`).join('')}</li>`);
    }
  }
  // Les paragraphes placés après le premier article restent dans la liste, hors numérotation
  const list = articles.map(a => (a.startsWith('<li>') ? a : `<li class="plain">${a}</li>`)).join('');
  return `${intro.join('')}${list ? `<ol class="rule-list">${list}</ol>` : ''}`;
}

module.exports = { getRule, setRule, resetRule, ruleHtml, DEFAULT_RULE, MAX };

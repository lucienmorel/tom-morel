const { e: esc, typo, parasHtml, fmtDate, plural, stripQuotes } = require('./util');
const e = s => esc(s);
const te = s => esc(typo(s));
const { SITE_NAME, MONOGRAM } = require('./config');
const { intro } = require('./texts');

// Description en haut de page (modifiable dans l'administration)
const lede = key => { const t = intro(key); return t ? `<p class="lede">${te(t)}</p>` : ''; };
const ESSENTIAL = 'À avoir lu dans sa vie';

const NAV = [
  ['/', 'Accueil', 'home'],
  ['/bibliotheque', 'Bibliothèque', 'lib'],
  ['/citations', 'Citations', 'cit'],
  ['/fausses-bonnes-idees', 'Fausses bonnes idées', 'fbi'],
  ['/carnet-de-route', 'Carnet de route', 'edt'],
  ['/telechargements', 'Téléchargements', 'dl'],
];

const csrfField = csrf => `<input type="hidden" name="_csrf" value="${e(csrf)}">`;

function layout({ title, body, user, csrf, active, flash }) {
  const links = NAV.map(([href, label, key]) =>
    `<a href="${href}"${active === key ? ' class="on" aria-current="page"' : ''}>${label}</a>`).join('');
  const nav = user ? `
    <nav class="nav" aria-label="Navigation principale">
      ${links}
      ${user.is_admin ? `<a href="/admin"${active === 'admin' ? ' class="on"' : ''}>Administration</a>` : ''}
      <span class="sep" aria-hidden="true"></span>
      <a href="/compte"${active === 'compte' ? ' class="on"' : ''}>${e(user.username)}</a>
      <form method="post" action="/deconnexion" class="inline">${csrfField(csrf)}<button class="linklike" type="submit">Déconnexion</button></form>
    </nav>` : '';
  const flashHtml = flash ? `
    <div class="flash flash-${e(flash.type)}" role="status">
      <p>${e(flash.msg)}</p>
      ${flash.code ? `<p class="code-line">Identifiant : <strong>${e(flash.login)}</strong> &nbsp; Code : <code>${e(flash.code)}</code></p><p class="small">Ce code ne sera plus affiché. Transmettez-le maintenant.</p>` : ''}
    </div>` : '';

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title ? e(title) + ' — ' : ''}${e(SITE_NAME)}</title>
<link rel="preload" href="/static/fonts/eb-garamond-latin-400-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/static/style.css">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
</head>
<body>
<header class="site">
  <div class="wrap head">
    <a class="brand" href="/"><span class="mono">${e(MONOGRAM)}</span><span class="name">${e(SITE_NAME)}</span></a>
    ${nav}
  </div>
</header>
<main class="wrap">
${flashHtml}
${body}
</main>
<footer class="site"><div class="wrap"><span class="mono small-mono">${e(MONOGRAM)}</span> ${e(SITE_NAME)}</div></footer>
<script src="/static/app.js" defer></script>
</body>
</html>`;
}

/* ---------- Éléments ---------- */

function cover(b, cls = '') {
  return b.cover
    ? `<img class="cover ${cls}" src="/couvertures/${e(b.cover)}" alt="Couverture : ${e(b.title)}" loading="lazy">`
    : `<div class="cover ph ${cls}" aria-hidden="true"><span class="ph-t">${te(b.title)}</span><span class="ph-a">${e(b.author)}</span></div>`;
}

const card = b => `
  <article class="card">
    <a href="/livres/${b.id}">
      ${cover(b)}
      ${b.essential ? `<div class="essential">${ESSENTIAL}</div>` : ''}
      <div class="theme">${e(b.theme || 'Sans thème')}</div>
      <h3 class="t">${te(b.title)}</h3>
      <div class="a">${e(b.author)}</div>
    </a>
  </article>`;

const grid = books => `<div class="books">${books.map(card).join('')}</div>`;

/* ---------- Pages ---------- */

function login({ error, suite, username }) {
  return `
  <section class="login">
    <span class="mono big-mono">${e(MONOGRAM)}</span>
    <h1>${e(SITE_NAME)}</h1>
    <p class="lede">Accès réservé aux membres. Saisissez l’identifiant et le code qui vous ont été remis.</p>
    ${error ? `<p class="error">${e(error)}</p>` : ''}
    <form method="post" action="/connexion" class="stack">
      <input type="hidden" name="suite" value="${e(suite || '')}">
      <label for="u">Identifiant</label>
      <input id="u" name="username" autocomplete="username" required value="${e(username || '')}" autofocus>
      <label for="p">Code d’accès</label>
      <input id="p" name="password" type="password" autocomplete="current-password" required>
      <p><button class="btn" type="submit">Entrer</button></p>
    </form>
  </section>`;
}

function home({ latest, stats, ruleHtml, isAdmin }) {
  return `
  <section class="hero">
    <p class="kicker">Lire, retenir, transmettre</p>
    <h1>Proposer une lecture</h1>
    ${lede('home')}
    <p class="actions"><a class="btn" href="/livres/nouveau">Rédiger une fiche</a><a class="btn ghost" href="/citations">Noter une citation</a><a class="btn ghost" href="/bibliotheque">Parcourir la bibliothèque</a></p>
    <p class="stats">${plural(stats.books, 'fiche')} · ${plural(stats.quotes, 'citation')} · ${plural(stats.themes, 'thème')}</p>
  </section>
  ${ruleHtml || isAdmin ? `<section class="rule" id="regle">
    <h2 class="sec">Règle du cercle${isAdmin ? ' <a class="sec-link" href="/admin/regle">Modifier</a>' : ''}</h2>
    ${ruleHtml || '<p class="empty">Aucune règle n’est affichée pour le moment.</p>'}
  </section>` : ''}
  <section>
    <h2 class="sec">Dernières fiches</h2>
    ${latest.length ? grid(latest) : '<p class="empty">Aucune fiche pour le moment. La première vous revient.</p>'}
    ${stats.books > latest.length ? '<p class="more"><a href="/bibliotheque">Toute la bibliothèque →</a></p>' : ''}
  </section>`;
}

function library({ books, themes, q, theme, sort, essential, nEssential }) {
  const opt = (v, label, cur) => `<option value="${e(v)}"${String(cur) === String(v) ? ' selected' : ''}>${e(label)}</option>`;
  return `
  <h1>Bibliothèque</h1>
  ${lede('lib')}
  <form class="filters" method="get" action="/bibliotheque" role="search">
    ${essential ? '<input type="hidden" name="avoirlu" value="1">' : ''}
    <div><label for="q">Titre ou auteur</label><input id="q" name="q" value="${e(q)}" placeholder="Rechercher"></div>
    <div><label for="th">Thème</label><select id="th" name="theme">${opt('', 'Tous les thèmes', theme)}${themes.map(t => opt(t.id, `${t.name} (${t.n})`, theme)).join('')}</select></div>
    <div><label for="so">Trier par</label><select id="so" name="tri">
      ${opt('recent', 'Plus récentes', sort)}${opt('titre', 'Titre', sort)}${opt('auteur', 'Auteur', sort)}${opt('note', 'Note', sort)}
    </select></div>
    <div class="f-btn"><button class="btn" type="submit">Filtrer</button></div>
  </form>
  ${themes.length || nEssential ? `<p class="chips">${nEssential || essential ? `<a href="/bibliotheque?avoirlu=1" class="chip-ess${essential ? ' on' : ''}">${ESSENTIAL} (${nEssential})</a>` : ''}${themes.map(t =>
    `<a href="/bibliotheque?theme=${t.id}"${String(theme) === String(t.id) ? ' class="on"' : ''}>${e(t.name)}</a>`).join('')}${theme || q || essential ? '<a href="/bibliotheque" class="reset">Tout afficher</a>' : ''}</p>` : ''}
  <p class="count">${plural(books.length, 'fiche')}</p>
  ${books.length ? grid(books) : '<p class="empty">Aucune fiche ne correspond.</p>'}`;
}

function bookDetail({ book, quotes, canEdit, csrf }) {
  const meta = [book.year, book.isbn ? `ISBN ${book.isbn}` : null].filter(Boolean).map(e).join(' · ');
  return `
  <article class="book">
    <div class="book-side">
      ${cover(book, 'large')}
      <p><a class="btn block" href="/livres/${book.id}/fiche.pdf">Télécharger la fiche</a></p>
      ${canEdit ? `
        <p><a class="btn ghost block" href="/livres/${book.id}/modifier">Modifier</a></p>
        <form method="post" action="/livres/${book.id}/supprimer" data-confirm="Supprimer définitivement cette fiche ?">
          ${csrfField(csrf)}<button class="linklike danger" type="submit">Supprimer la fiche</button>
        </form>` : ''}
    </div>
    <div class="book-main">
      <p class="theme"><a href="/bibliotheque?theme=${book.theme_id || ''}">${e(book.theme || 'Sans thème')}</a></p>
      <h1 class="book-title">${te(book.title)}</h1>
      <p class="book-author">${e(book.author)}</p>
      ${meta ? `<p class="meta">${meta}</p>` : ''}
      ${book.rating ? `<p class="rating" aria-label="Note : ${book.rating} sur 5"><span class="dots">${'<i class="on"></i>'.repeat(book.rating)}${'<i></i>'.repeat(5 - book.rating)}</span> ${book.rating}/5</p>` : ''}
      ${book.essential ? `<p class="essential big"><a href="/bibliotheque?avoirlu=1">${ESSENTIAL}</a></p>` : ''}
      <p class="byline">Proposée par ${e(book.by_name || 'un ancien membre')}, le ${fmtDate(book.created_at)}</p>

      <h2 class="sec">Résumé</h2>
      <div class="prose">${parasHtml(typo(book.summary))}</div>

      ${book.read_if ? `<h2 class="sec">À lire si…</h2><p class="read-if">${te(book.read_if)}</p>` : ''}

      ${quotes.length ? `<h2 class="sec">${quotes.length > 1 ? 'Citations' : 'Citation'}</h2>
        ${quotes.map(q => `<blockquote><p>« ${te(stripQuotes(q.text))} »</p>${q.page ? `<cite>p. ${e(q.page)}</cite>` : ''}</blockquote>`).join('')}` : ''}
    </div>
  </article>`;
}

function quoteRow(q = {}) {
  return `
    <div class="quote-row">
      <div class="q-text"><label>Citation</label><textarea name="quote_text" rows="3" maxlength="2000">${e(q.text || '')}</textarea></div>
      <div class="q-page"><label>Page</label><input name="quote_page" maxlength="20" value="${e(q.page || '')}"></div>
      <button type="button" class="linklike q-remove">Retirer</button>
    </div>`;
}

function bookForm({ values = {}, quotes = [], themes, error, csrf, action, isEdit }) {
  const v = values;
  const rows = (quotes.length ? quotes : [{}]).map(quoteRow).join('');
  return `
  <h1>${isEdit ? 'Modifier la fiche' : 'Rédiger une fiche'}</h1>
  ${error ? `<p class="error">${e(error)}</p>` : ''}
  <form method="post" action="${action}" enctype="multipart/form-data" class="book-form">
    ${csrfField(csrf)}
    <input type="hidden" name="cover_tmp" id="cover_tmp" value="">

    <fieldset>
      <legend>L’ouvrage</legend>
      <div class="isbn-line">
        <div><label for="isbn">ISBN <span class="opt">facultatif</span></label><input id="isbn" name="isbn" value="${e(v.isbn || '')}" inputmode="numeric" maxlength="20" placeholder="978…"></div>
        <button type="button" class="btn ghost" id="isbn-btn">Rechercher</button>
      </div>
      <p class="hint" id="isbn-status">L’ISBN permet de remplir la notice et de récupérer la couverture.</p>
      <div class="cols">
        <div><label for="title">Titre</label><input id="title" name="title" required maxlength="300" value="${e(v.title || '')}"></div>
        <div><label for="author">Auteur</label><input id="author" name="author" required maxlength="200" value="${e(v.author || '')}"></div>
      </div>
      <div class="cols three">
        <div><label for="year">Année</label><input id="year" name="year" inputmode="numeric" maxlength="5" value="${e(v.year || '')}"></div>
        <div><label for="theme">Thème</label><input id="theme" name="theme" required maxlength="80" list="themes" value="${e(v.theme || '')}" autocomplete="off"><datalist id="themes">${themes.map(t => `<option value="${e(t.name)}">`).join('')}</datalist></div>
        <div><label for="rating">Note</label><select id="rating" name="rating">
          <option value="">—</option>${[5, 4, 3, 2, 1].map(n => `<option value="${n}"${String(v.rating) === String(n) ? ' selected' : ''}>${n} / 5</option>`).join('')}
        </select></div>
      </div>
      <p class="hint">Choisissez un thème existant ou saisissez-en un nouveau.</p>
      <label class="check ess-check"><input type="checkbox" name="essential" value="1"${v.essential ? ' checked' : ''}> ${ESSENTIAL}</label>
    </fieldset>

    <fieldset>
      <legend>Couverture</legend>
      <div class="cover-line">
        <div class="cover-preview">
          ${v.cover ? `<img id="cover-img" src="/couvertures/${e(v.cover)}" alt="">` : '<img id="cover-img" alt="" hidden>'}
          <span id="cover-none"${v.cover ? ' hidden' : ''}>Aucune couverture</span>
        </div>
        <div>
          <label for="cover">Image JPEG ou PNG, 5 Mo maximum</label>
          <input id="cover" name="cover" type="file" accept="image/jpeg,image/png">
          <p class="hint">Si vous ne déposez rien, la couverture trouvée par l’ISBN est utilisée (Open Library, Google Books…).</p>
        </div>
      </div>
    </fieldset>

    <fieldset>
      <legend>Résumé</legend>
      <label for="summary" class="sr">Résumé</label>
      <textarea id="summary" name="summary" required rows="12" maxlength="20000">${e(v.summary || '')}</textarea>
      <p class="hint">Séparez les paragraphes par une ligne vide.</p>
      <label for="read_if">À lire si… <span class="opt">facultatif</span></label>
      <input id="read_if" name="read_if" maxlength="300" value="${e(v.read_if || '')}" placeholder="vous voulez comprendre…">
    </fieldset>

    <fieldset>
      <legend>Citations marquantes</legend>
      <div id="quotes">${rows}</div>
      <template id="quote-tpl">${quoteRow()}</template>
      <p><button type="button" class="btn ghost" id="quote-add">Ajouter une citation</button></p>
    </fieldset>

    <p class="actions"><button class="btn" type="submit">${isEdit ? 'Enregistrer' : 'Publier la fiche'}</button></p>
  </form>`;
}

/* ---------- Citations ---------- */

function citationFields(v = {}, sources = []) {
  return `
      <label for="c-text">Citation</label>
      <textarea id="c-text" name="text" rows="4" maxlength="2000" required>${e(v.text || '')}</textarea>
      <div class="cols three c-ref">
        <div><label for="c-source">Titre de l’ouvrage</label><input id="c-source" name="source" required maxlength="300" list="c-sources" value="${e(v.source || '')}" autocomplete="off">
          <datalist id="c-sources">${sources.map(t => `<option value="${e(t)}">`).join('')}</datalist></div>
        <div><label for="c-author">Auteur <span class="opt">facultatif</span></label><input id="c-author" name="author" maxlength="200" value="${e(v.author || '')}"></div>
        <div><label for="c-page">Page <span class="opt">facultatif</span></label><input id="c-page" name="page" maxlength="20" value="${e(v.page || '')}"></div>
      </div>`;
}

function citations({ items, q, origine, user, csrf, error, values, sources }) {
  const opt = (v, label) => `<option value="${v}"${origine === v ? ' selected' : ''}>${label}</option>`;
  return `
  <h1>Citations</h1>
  ${lede('cit')}
  <details class="panel"${error || !items.length ? ' open' : ''}>
    <summary>Ajouter une citation</summary>
    ${error ? `<p class="error">${e(error)}</p>` : ''}
    <form method="post" action="/citations">
      ${csrfField(csrf)}
      ${citationFields(values, sources)}
      <p><button class="btn" type="submit">Ajouter</button></p>
    </form>
  </details>
  <form class="filters cit-filters" method="get" action="/citations" role="search">
    <div><label for="cq">Texte, titre ou auteur</label><input id="cq" name="q" value="${e(q)}" placeholder="Rechercher"></div>
    <div><label for="co">Origine</label><select id="co" name="origine">${opt('', 'Toutes')}${opt('libres', 'Hors fiche')}${opt('fiches', 'Tirées des fiches')}</select></div>
    <div class="f-btn"><button class="btn" type="submit">Filtrer</button></div>
  </form>
  <p class="count">${plural(items.length, 'citation')}${q || origine ? ' · <a href="/citations">tout afficher</a>' : ''}</p>
  ${items.length ? `<div class="cit-list">${items.map(c => {
    const ref = c.book_id
      ? `<a href="/livres/${c.book_id}" class="it">${te(c.source)}</a>`
      : `<span class="it">${te(c.source)}</span>`;
    const parts = [ref, c.author ? e(c.author) : null, c.page ? `p. ${e(c.page)}` : null].filter(Boolean).join(', ');
    const mine = !c.book_id && (user.is_admin || user.id === c.user_id);
    return `
    <blockquote class="cit">
      <p>« ${te(stripQuotes(c.text))} »</p>
      <cite>${parts}</cite>
      <div class="cit-meta">${c.book_id ? 'Fiche de lecture' : `Ajoutée par ${e(c.by_name || 'un ancien membre')}`} · ${fmtDate(c.created_at)}
        ${mine ? `<span class="row-actions inl"><a class="linklike" href="/citations/${c.id}/modifier">Modifier</a>
          <form method="post" action="/citations/${c.id}/supprimer" data-confirm="Supprimer cette citation ?">${csrfField(csrf)}<button class="linklike danger">Supprimer</button></form></span>` : ''}
      </div>
    </blockquote>`;
  }).join('')}</div>` : `<p class="empty">${q || origine ? 'Aucune citation ne correspond.' : 'Aucune citation pour le moment.'}</p>`}`;
}

function citationForm({ values, csrf, error, sources }) {
  return `
  <h1>Modifier la citation</h1>
  ${error ? `<p class="error">${e(error)}</p>` : ''}
  <form method="post" action="/citations/${values.id}" class="book-form">
    ${csrfField(csrf)}
    ${citationFields(values, sources)}
    <p class="actions"><button class="btn" type="submit">Enregistrer</button><a class="btn ghost" href="/citations">Annuler</a></p>
  </form>`;
}

/* ---------- Fausses bonnes idées ---------- */

function discouragedFields(v = {}) {
  return `
      <div class="cols">
        <div><label for="d-title">Titre de l’ouvrage</label><input id="d-title" name="title" required maxlength="300" value="${e(v.title || '')}"></div>
        <div><label for="d-author">Auteur <span class="opt">facultatif</span></label><input id="d-author" name="author" maxlength="200" value="${e(v.author || '')}"></div>
      </div>
      <label for="d-reason">Pourquoi <span class="opt">facultatif</span></label>
      <textarea id="d-reason" name="reason" rows="6" maxlength="5000">${e(v.reason || '')}</textarea>
      <p class="hint">Séparez les paragraphes par une ligne vide.</p>`;
}

function discouraged({ items, user, csrf, error, values }) {
  return `
  <h1>Fausses bonnes idées</h1>
  ${lede('fbi')}
  <details class="panel"${error || !items.length ? ' open' : ''}>
    <summary>Déconseiller un ouvrage</summary>
    ${error ? `<p class="error">${e(error)}</p>` : ''}
    <form method="post" action="/fausses-bonnes-idees">
      ${csrfField(csrf)}
      ${discouragedFields(values)}
      <p><button class="btn" type="submit">Ajouter</button></p>
    </form>
  </details>
  <p class="count">${plural(items.length, 'ouvrage déconseillé', 'ouvrages déconseillés')}</p>
  ${items.length ? `<div class="fbi-list">${items.map(d => `
    <article class="fbi">
      <h3><span class="it">${te(d.title)}</span>${d.author ? `<span class="fbi-a">, ${e(d.author)}</span>` : ''}</h3>
      ${d.reason ? `<div class="fbi-r">${parasHtml(typo(d.reason))}</div>` : ''}
      <div class="cit-meta">Signalé par ${e(d.by_name || 'un ancien membre')} · ${fmtDate(d.created_at)}
        ${user.is_admin || user.id === d.user_id ? `<span class="row-actions inl"><a class="linklike" href="/fausses-bonnes-idees/${d.id}/modifier">Modifier</a>
          <form method="post" action="/fausses-bonnes-idees/${d.id}/supprimer" data-confirm="Retirer cet ouvrage de la liste ?">${csrfField(csrf)}<button class="linklike danger">Supprimer</button></form></span>` : ''}
      </div>
    </article>`).join('')}</div>` : '<p class="empty">Aucun ouvrage déconseillé pour le moment.</p>'}`;
}

function discouragedForm({ values, csrf, error }) {
  return `
  <h1>Modifier l’ouvrage déconseillé</h1>
  ${error ? `<p class="error">${e(error)}</p>` : ''}
  <form method="post" action="/fausses-bonnes-idees/${values.id}" class="book-form">
    ${csrfField(csrf)}
    ${discouragedFields(values)}
    <p class="actions"><button class="btn" type="submit">Enregistrer</button><a class="btn ghost" href="/fausses-bonnes-idees">Annuler</a></p>
  </form>`;
}

function ruleForm({ text, max, csrf }) {
  return `
  <h1>Règle du cercle</h1>
  <p class="lede">Ce texte est affiché sur la page d’accueil, pour tous les membres.</p>
  <form method="post" action="/admin/regle" class="book-form">
    ${csrfField(csrf)}
    <label for="r-text" class="sr">Texte de la règle</label>
    <textarea id="r-text" name="text" rows="26" maxlength="${max}">${e(text)}</textarea>
    <p class="hint">Séparez les blocs par une ligne vide. Un bloc d’une seule ligne est un paragraphe simple ; un bloc de plusieurs lignes devient un article numéroté, dont la première ligne est le titre et chaque ligne suivante un paragraphe. Un texte vide masque la règle.</p>
    <p class="actions"><button class="btn" type="submit">Enregistrer</button><a class="btn ghost" href="/">Annuler</a>
      <button class="linklike" type="submit" name="action" value="defaut" formnovalidate data-confirm-btn="Remplacer le texte actuel par la règle d’origine ?">Rétablir la règle d’origine</button></p>
  </form>`;
}

function schedules({ items, user, csrf, error, values = {} }) {
  return `
  <h1>Carnet de route</h1>
  ${lede('carnet')}
  <details class="panel"${error ? ' open' : ''}>
    <summary>Ajouter au carnet</summary>
    ${error ? `<p class="error">${e(error)}</p>` : ''}
    <form method="post" action="/carnet-de-route" enctype="multipart/form-data">
      ${csrfField(csrf)}
      <div class="cols">
        <div><label for="s-title">Titre</label><input id="s-title" name="title" required maxlength="120" value="${e(values.title || '')}" placeholder="Semaine type, conseil, retour d’expérience…"></div>
        <div><label for="s-file">Fichier PDF <span class="opt">facultatif, 15 Mo maximum</span></label><input id="s-file" name="file" type="file" accept="application/pdf"></div>
      </div>
      <label for="s-note">Texte <span class="opt">conseil, organisation, retex…</span></label>
      <textarea id="s-note" name="note" rows="6" maxlength="10000" placeholder="Lever à 6 h, trente minutes de lecture avant le service…">${e(values.note || '')}</textarea>
      <p class="hint">Un texte, un PDF, ou les deux. Séparez les paragraphes par une ligne vide.</p>
      <p><button class="btn" type="submit">Ajouter</button></p>
    </form>
  </details>
  ${items.length ? `<div class="sched-list">${items.map(s => `
    <article class="sched">
      <div>
        <h3>${s.filename ? `<a href="/emplois/${s.id}/fichier" target="_blank" rel="noopener">${te(s.title)}</a>` : te(s.title)}</h3>
        <p class="meta">${e(s.by_name)} · ${fmtDate(s.created_at)}</p>
        ${s.note ? `<div class="note">${parasHtml(typo(s.note))}</div>` : ''}
      </div>
      <div class="sched-actions">
        ${s.filename ? `<a class="btn ghost" href="/emplois/${s.id}/fichier" target="_blank" rel="noopener">Consulter le PDF</a>` : ''}
        ${(user.is_admin || user.id === s.user_id) ? `<form method="post" action="/emplois/${s.id}/supprimer" data-confirm="Supprimer cette entrée du carnet ?">${csrfField(csrf)}<button class="linklike danger">Supprimer</button></form>` : ''}
      </div>
    </article>`).join('')}</div>` : '<p class="empty">Le carnet de route est vide pour le moment.</p>'}`;
}

function textsForm({ items, max, csrf }) {
  return `
  <h1>Descriptions des pages</h1>
  <p class="lede">Le court texte affiché en haut de chaque page, sous le titre.</p>
  <form method="post" action="/admin/textes" class="book-form">
    ${csrfField(csrf)}
    ${items.map(t => `
      <label for="t-${t.key}">${e(t.label)}</label>
      <textarea id="t-${t.key}" name="intro_${t.key}" rows="3" maxlength="${max}">${e(t.value)}</textarea>`).join('')}
    <p class="hint">Un champ laissé vide reprend le texte d’origine (la Bibliothèque n’en a pas).</p>
    <p class="actions"><button class="btn" type="submit">Enregistrer</button><a class="btn ghost" href="/admin">Retour</a></p>
  </form>`;
}

function downloads({ books, stats }) {
  return `
  <h1>Téléchargements</h1>
  ${lede('dl')}
  <div class="dl-grid">
    <a class="dl" href="/telechargements/recueil-des-citations.pdf">
      <span class="dl-k">Recueil</span>
      <span class="dl-t">Toutes les citations</span>
      <span class="dl-m">${plural(stats.quotes, 'citation')} (fiches et hors fiche), classées par ouvrage</span>
    </a>
    <a class="dl" href="/telechargements/lectures-par-theme.pdf">
      <span class="dl-k">Liste</span>
      <span class="dl-t">Tous les titres, par thème</span>
      <span class="dl-m">${plural(stats.books, 'ouvrage')}, ${plural(stats.themes, 'thème')}</span>
    </a>
  </div>
  <h2 class="sec">Fiches individuelles</h2>
  ${books.length ? `<table class="table">
    <thead><tr><th>Titre</th><th>Auteur</th><th class="hide-m">Thème</th><th></th></tr></thead>
    <tbody>${books.map(b => `<tr>
      <td><a href="/livres/${b.id}">${e(b.title)}</a></td><td class="it">${e(b.author)}</td>
      <td class="hide-m">${e(b.theme || 'Sans thème')}</td>
      <td class="r"><a href="/livres/${b.id}/fiche.pdf">PDF</a></td></tr>`).join('')}</tbody>
  </table>` : '<p class="empty">Aucune fiche pour le moment.</p>'}`;
}

function account({ user, csrf, error }) {
  return `
  <h1>Mon compte</h1>
  <p class="lede">Connecté en tant que <strong>${e(user.username)}</strong>${user.is_admin ? ' (administrateur)' : ''}.</p>
  <section class="narrow">
    <h2 class="sec">Changer de code d’accès</h2>
    ${error ? `<p class="error">${e(error)}</p>` : ''}
    <form method="post" action="/compte/code">
      ${csrfField(csrf)}
      <label for="cur">Code actuel</label><input id="cur" name="current" type="password" autocomplete="current-password" required>
      <label for="new">Nouveau code (10 caractères minimum)</label><input id="new" name="next" type="password" autocomplete="new-password" minlength="10" required>
      <label for="cf">Confirmation</label><input id="cf" name="confirm" type="password" autocomplete="new-password" minlength="10" required>
      <p><button class="btn" type="submit">Enregistrer</button></p>
    </form>
  </section>`;
}

function admin({ users, themes, books, csrf, me }) {
  return `
  <h1>Administration</h1>

  <section>
    <h2 class="sec">Règle du cercle</h2>
    <p>Le texte affiché sur la page d’accueil. <a href="/admin/regle">Modifier la règle →</a></p>
  </section>

  <section>
    <h2 class="sec">Descriptions des pages</h2>
    <p>Le court texte en haut de chaque page (Accueil, Bibliothèque, Citations…). <a href="/admin/textes">Modifier les descriptions →</a></p>
  </section>

  <section>
    <h2 class="sec">Comptes</h2>
    <form method="post" action="/admin/comptes" class="inline-form">
      ${csrfField(csrf)}
      <div><label for="nu">Nouvel identifiant</label><input id="nu" name="username" required maxlength="40" pattern="[A-Za-z0-9._\\-]{2,40}" title="Lettres, chiffres, point, tiret ; 2 à 40 caractères"></div>
      <label class="check"><input type="checkbox" name="is_admin" value="1"> Administrateur</label>
      <button class="btn" type="submit">Créer le compte</button>
    </form>
    <p class="hint">Un code d’accès est généré automatiquement et affiché une seule fois.</p>
    <table class="table">
      <thead><tr><th>Identifiant</th><th class="hide-m">Créé le</th><th>Fiches</th><th></th></tr></thead>
      <tbody>${users.map(u => `<tr>
        <td>${e(u.username)}${u.is_admin ? ' <span class="tag">admin</span>' : ''}</td>
        <td class="hide-m">${fmtDate(u.created_at)}</td>
        <td>${u.n}</td>
        <td class="r"><div class="row-actions">
          <form method="post" action="/admin/comptes/${u.id}/reinitialiser" data-confirm="Générer un nouveau code pour ${e(u.username)} ?">${csrfField(csrf)}<button class="linklike">Nouveau code</button></form>
          ${u.id !== me.id ? `<form method="post" action="/admin/comptes/${u.id}/supprimer" data-confirm="Supprimer le compte ${e(u.username)} ? Ses fiches sont conservées.">${csrfField(csrf)}<button class="linklike danger">Supprimer</button></form>` : ''}
        </div></td></tr>`).join('')}</tbody>
    </table>
  </section>

  <section>
    <h2 class="sec">Thèmes</h2>
    <p class="hint">Renommer un thème avec le nom d’un thème existant fusionne les deux. Supprimer un thème place ses fiches dans « Sans thème ».</p>
    ${themes.length ? `<table class="table">
      <thead><tr><th>Thème</th><th>Fiches</th><th></th></tr></thead>
      <tbody>${themes.map(t => `<tr>
        <td><form method="post" action="/admin/themes/${t.id}" class="rename">${csrfField(csrf)}<input name="name" value="${e(t.name)}" maxlength="80" required aria-label="Nom du thème"><button class="linklike">Renommer</button></form></td>
        <td>${t.n}</td>
        <td class="r"><form method="post" action="/admin/themes/${t.id}/supprimer" data-confirm="Supprimer le thème « ${e(t.name)} » ?">${csrfField(csrf)}<button class="linklike danger">Supprimer</button></form></td>
      </tr>`).join('')}</tbody>
    </table>` : '<p class="empty">Aucun thème.</p>'}
  </section>

  <section>
    <h2 class="sec">Fiches</h2>
    ${books.length ? `<table class="table">
      <thead><tr><th>Titre</th><th class="hide-m">Proposée par</th><th class="hide-m">Date</th><th></th></tr></thead>
      <tbody>${books.map(b => `<tr>
        <td><a href="/livres/${b.id}">${e(b.title)}</a> <span class="it muted">${e(b.author)}</span></td>
        <td class="hide-m">${e(b.by_name || '—')}</td>
        <td class="hide-m">${fmtDate(b.created_at)}</td>
        <td class="r"><div class="row-actions"><a class="linklike" href="/livres/${b.id}/modifier">Modifier</a>
          <form method="post" action="/livres/${b.id}/supprimer" data-confirm="Supprimer « ${e(b.title)} » ?">${csrfField(csrf)}<button class="linklike danger">Supprimer</button></form></div></td>
      </tr>`).join('')}</tbody>
    </table>` : '<p class="empty">Aucune fiche.</p>'}
  </section>`;
}

const message = (title, text) => `<section class="narrow msg"><h1>${e(title)}</h1><p class="lede">${e(text)}</p><p><a class="btn ghost" href="/">Retour à l’accueil</a></p></section>`;

module.exports = { layout, login, home, library, bookDetail, bookForm, citations, citationForm, discouraged, discouragedForm, ruleForm, textsForm, schedules, downloads, account, admin, message };

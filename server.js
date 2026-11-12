const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const cfg = require('./src/config');
const { db, COVERS_DIR, SCHED_DIR, TMP_DIR } = require('./src/db');
const A = require('./src/auth');
const V = require('./src/views');
const pdf = require('./src/pdf');
const ol = require('./src/openlibrary');
const R = require('./src/rule');
const { toArr, clean, frCompare, contentDisposition, slug } = require('./src/util');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 'loopback');

const CSP = [
  "default-src 'self'",
  "img-src 'self' blob:",
  "style-src 'self'",
  "script-src 'self'",
  "font-src 'self'",
  "connect-src 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "object-src 'none'",
].join('; ');

app.use((req, res, next) => {
  res.set({
    'Content-Security-Policy': CSP,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  });
  next();
});

app.get('/favicon.svg', (req, res) => {
  const m = cfg.MONOGRAM.replace(/[^A-Za-zÀ-ÿ0-9]/g, '').slice(0, 3);
  res.type('image/svg+xml').set('Cache-Control', 'public, max-age=86400').send(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#14213d"/><rect x="5" y="5" width="54" height="54" fill="none" stroke="#fff" stroke-opacity=".5"/><text x="32" y="42" font-family="Garamond,'Times New Roman',serif" font-size="${m.length > 2 ? 20 : 26}" fill="#fff" text-anchor="middle">${m}</text></svg>`);
});

app.use('/static', express.static(path.join(__dirname, 'public'), { maxAge: '7d' }));
app.use(express.urlencoded({ extended: false, limit: '300kb' }));
app.use(A.loadSession);

/* ---------- Helpers ---------- */

function render(req, res, title, body, active, status = 200) {
  res.status(status).send(V.layout({
    title, body, active,
    user: req.user,
    csrf: req.session && req.session.csrf,
    flash: A.popFlash(req),
  }));
}

const notFound = (req, res) => render(req, res, 'Introuvable', V.message('Page introuvable', 'Cette page n’existe pas ou a été supprimée.'), null, 404);

const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Upload en mémoire, puis vérification du contenu réel (octets magiques)
function upload(field, maxMb) {
  const m = multer({ storage: multer.memoryStorage(), limits: { fileSize: maxMb * 1024 * 1024, files: 1, fields: 120 } }).single(field);
  return (req, res, next) => m(req, res, err => {
    if (err) req.uploadError = err.code === 'LIMIT_FILE_SIZE' ? `Fichier trop lourd (${maxMb} Mo maximum).` : 'Envoi du fichier impossible.';
    next();
  });
}

function imageExt(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 8 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  return null;
}
const isPdf = buf => buf.length > 5 && buf.slice(0, 5).toString('latin1') === '%PDF-';

function saveFile(dir, buf, ext) {
  const name = `${crypto.randomBytes(16).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(dir, name), buf, { mode: 0o640 });
  return name;
}
function removeFile(dir, name) {
  if (name && /^[a-f0-9]{32}\.(jpg|png|pdf)$/.test(name)) fs.rm(path.join(dir, name), { force: true }, () => {});
}

const BOOK_SELECT = `
  SELECT b.*, t.name AS theme, u.username AS by_name
  FROM books b LEFT JOIN themes t ON t.id = b.theme_id LEFT JOIN users u ON u.id = b.user_id`;

const getBook = id => db.prepare(`${BOOK_SELECT} WHERE b.id = ?`).get(id);
const getQuotes = id => db.prepare('SELECT text, page FROM quotes WHERE book_id = ? ORDER BY position, id').all(id);
const canEdit = (user, book) => user.is_admin || book.user_id === user.id;

function themeId(name) {
  name = clean(name, 80);
  if (!name) return null;
  name = name[0].toUpperCase() + name.slice(1);
  const row = db.prepare('SELECT id FROM themes WHERE name = ?').get(name);
  return row ? row.id : db.prepare('INSERT INTO themes (name) VALUES (?)').run(name).lastInsertRowid;
}
const purgeThemes = () => db.prepare('DELETE FROM themes WHERE id NOT IN (SELECT theme_id FROM books WHERE theme_id IS NOT NULL)').run();

function stats() {
  return {
    books: db.prepare('SELECT COUNT(*) n FROM books').get().n,
    quotes: db.prepare('SELECT (SELECT COUNT(*) FROM quotes) + (SELECT COUNT(*) FROM citations) n').get().n,
    themes: db.prepare('SELECT COUNT(DISTINCT theme_id) n FROM books WHERE theme_id IS NOT NULL').get().n,
  };
}

function themesWithCount() {
  return db.prepare(`SELECT t.id, t.name, COUNT(b.id) n FROM themes t
    JOIN books b ON b.theme_id = t.id GROUP BY t.id`).all().sort((a, b) => frCompare(a.name, b.name));
}

/* ---------- Connexion ---------- */

app.get('/connexion', (req, res) => {
  if (req.user) return res.redirect('/');
  render(req, res, 'Connexion', V.login({ suite: req.query.suite }));
});

app.post('/connexion', (req, res) => {
  const ip = req.ip;
  const username = clean(req.body.username, 40);
  const suite = typeof req.body.suite === 'string' && /^\/(?!\/)/.test(req.body.suite) ? req.body.suite : '/';
  if (!A.loginAllowed(ip)) {
    return render(req, res, 'Connexion', V.login({ error: 'Trop de tentatives. Réessayez dans quelques minutes.', username, suite }), null, 429);
  }
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  const pw = String(req.body.password || '').trim();
  if (!user || !A.verifyPassword(pw, user.pass_hash)) {
    A.loginFailed(ip);
    return render(req, res, 'Connexion', V.login({ error: 'Identifiant ou code incorrect.', username, suite }), null, 401);
  }
  A.loginSucceeded(ip);
  A.createSession(res, user.id);
  res.redirect(suite);
});

app.post('/deconnexion', A.csrfCheck, (req, res) => {
  A.destroySession(req, res);
  res.redirect('/connexion');
});

/* ---------- Tout le reste exige une session ---------- */
app.use(A.requireAuth);

app.get('/', (req, res) => {
  const latest = db.prepare(`${BOOK_SELECT} ORDER BY b.created_at DESC, b.id DESC LIMIT 8`).all();
  render(req, res, 'Accueil', V.home({ latest, stats: stats(), ruleHtml: R.ruleHtml(R.getRule()), isAdmin: !!req.user.is_admin }), 'home');
});

app.get('/bibliotheque', (req, res) => {
  const q = clean(req.query.q, 100);
  const theme = /^\d+$/.test(req.query.theme || '') ? req.query.theme : '';
  const sort = ['recent', 'titre', 'auteur', 'note'].includes(req.query.tri) ? req.query.tri : 'recent';
  const where = [], params = [];
  if (q) { where.push('(b.title LIKE ? OR b.author LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  if (theme) { where.push('b.theme_id = ?'); params.push(theme); }
  let books = db.prepare(`${BOOK_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY b.created_at DESC, b.id DESC`).all(...params);
  if (sort === 'titre') books.sort((a, b) => frCompare(a.title, b.title));
  if (sort === 'auteur') books.sort((a, b) => frCompare(a.author, b.author));
  if (sort === 'note') books.sort((a, b) => (b.rating || 0) - (a.rating || 0));
  render(req, res, 'Bibliothèque', V.library({ books, themes: themesWithCount(), q, theme, sort }), 'lib');
});

/* ---------- Fiches ---------- */

// Recherche ISBN : la couverture trouvée est stockée provisoirement sur le serveur,
// servie pour l'aperçu, puis reprise telle quelle à l'enregistrement de la fiche.
app.get('/api/isbn/:isbn', wrap(async (req, res) => {
  try {
    const r = await ol.lookup(req.params.isbn);
    let cover = null, cover_tmp = null;
    if (r.cover) {
      cover_tmp = saveFile(TMP_DIR, r.cover.buf, r.cover.ext);
      cover = `/api/couverture-provisoire/${cover_tmp}`;
    }
    res.json({ found: r.found, title: r.title, author: r.author, year: r.year, cover, cover_tmp });
  } catch (err) {
    console.warn('Recherche ISBN :', err.message);
    res.status(502).json({ found: false, error: 'indisponible' });
  }
}));

const TMP_RE = /^[a-f0-9]{32}\.(jpg|png)$/;

app.get('/api/couverture-provisoire/:file', (req, res) => {
  if (!TMP_RE.test(req.params.file)) return notFound(req, res);
  res.sendFile(path.join(TMP_DIR, req.params.file), { headers: { 'Cache-Control': 'private, max-age=86400' } },
    err => { if (err && !res.headersSent) notFound(req, res); });
});

// Déplace une couverture provisoire vers les couvertures définitives ; renvoie son nom ou null
function adoptTmpCover(name) {
  if (typeof name !== 'string' || !TMP_RE.test(name)) return null;
  try {
    fs.renameSync(path.join(TMP_DIR, name), path.join(COVERS_DIR, name));
    return name;
  } catch {
    return null;
  }
}

function showForm(req, res, opts, status = 200) {
  render(req, res, opts.isEdit ? 'Modifier la fiche' : 'Nouvelle fiche', V.bookForm({
    themes: themesWithCount(), csrf: req.session.csrf, ...opts,
  }), 'home', status);
}

app.get('/livres/nouveau', (req, res) => showForm(req, res, { action: '/livres' }));

async function saveBook(req, res, existing) {
  const b = req.body;
  const isEdit = !!existing;
  const action = isEdit ? `/livres/${existing.id}` : '/livres';
  const values = {
    title: clean(b.title, 300),
    author: clean(b.author, 200),
    year: clean(b.year, 5),
    isbn: ol.normIsbn(b.isbn).slice(0, 13),
    theme: clean(b.theme, 80),
    rating: clean(b.rating, 1),
    summary: String(b.summary || '').replace(/\r\n/g, '\n').trim().slice(0, 20000),
    read_if: clean(b.read_if, 300),
    cover: existing ? existing.cover : null,
  };
  const texts = toArr(b.quote_text), pages = toArr(b.quote_page);
  const quotes = texts.map((t, i) => ({
    text: String(t || '').replace(/\r\n/g, '\n').trim().slice(0, 2000),
    page: clean(pages[i], 20),
  })).filter(q => q.text).slice(0, 50);

  const fail = msg => showForm(req, res, { values, quotes, error: msg, action, isEdit }, 400);

  if (req.uploadError) return fail(req.uploadError);
  if (!values.title || !values.author || !values.theme || !values.summary) {
    return fail('Le titre, l’auteur, le thème et le résumé sont obligatoires.');
  }
  let year = null;
  if (values.year) {
    year = parseInt(values.year, 10);
    if (!/^-?\d{1,4}$/.test(values.year) || year > new Date().getFullYear() + 1) return fail('Année invalide.');
  }
  const rating = values.rating ? parseInt(values.rating, 10) : null;
  if (rating !== null && !(rating >= 1 && rating <= 5)) return fail('Note invalide.');

  // Couverture : fichier déposé > couverture trouvée par la recherche ISBN > existante
  // > à défaut, nouvelle recherche par ISBN si la fiche n'a toujours pas de couverture
  let newCover = null;
  if (req.file && req.file.size) {
    const ext = imageExt(req.file.buffer);
    if (!ext) return fail('La couverture doit être une image JPEG ou PNG.');
    newCover = saveFile(COVERS_DIR, req.file.buffer, ext);
  } else if (b.cover_tmp) {
    newCover = adoptTmpCover(b.cover_tmp);
  }
  if (!newCover && !values.cover && values.isbn) {
    const found = await ol.findCover(values.isbn);
    if (found) newCover = saveFile(COVERS_DIR, found.buf, found.ext);
  }
  const cover = newCover || values.cover;

  const id = db.transaction(() => {
    const tid = themeId(values.theme);
    let bookId;
    if (isEdit) {
      db.prepare(`UPDATE books SET theme_id=?, title=?, author=?, year=?, isbn=?, rating=?, summary=?, read_if=?, cover=?, updated_at=datetime('now') WHERE id=?`)
        .run(tid, values.title, values.author, year, values.isbn || null, rating, values.summary, values.read_if || null, cover, existing.id);
      bookId = existing.id;
      db.prepare('DELETE FROM quotes WHERE book_id = ?').run(bookId);
    } else {
      bookId = db.prepare(`INSERT INTO books (user_id, theme_id, title, author, year, isbn, rating, summary, read_if, cover)
        VALUES (?,?,?,?,?,?,?,?,?,?)`)
        .run(req.user.id, tid, values.title, values.author, year, values.isbn || null, rating, values.summary, values.read_if || null, cover).lastInsertRowid;
    }
    const ins = db.prepare('INSERT INTO quotes (book_id, text, page, position) VALUES (?,?,?,?)');
    quotes.forEach((q, i) => ins.run(bookId, q.text, q.page || null, i));
    purgeThemes();
    return bookId;
  })();

  if (newCover && existing && existing.cover) removeFile(COVERS_DIR, existing.cover);
  A.setFlash(req, 'ok', isEdit ? 'Fiche mise à jour.' : 'Fiche publiée. Merci pour cette lecture.');
  res.redirect(`/livres/${id}`);
}

app.post('/livres', upload('cover', 5), A.csrfCheck, wrap((req, res) => saveBook(req, res, null)));

app.param('id', (req, res, next, id) => (/^\d+$/.test(id) ? next() : notFound(req, res)));

app.get('/livres/:id', (req, res) => {
  const book = getBook(req.params.id);
  if (!book) return notFound(req, res);
  render(req, res, book.title, V.bookDetail({
    book, quotes: getQuotes(book.id), canEdit: canEdit(req.user, book), csrf: req.session.csrf,
  }), 'lib');
});

app.get('/livres/:id/modifier', (req, res) => {
  const book = getBook(req.params.id);
  if (!book) return notFound(req, res);
  if (!canEdit(req.user, book)) return res.status(403).send('Seul l’auteur de la fiche ou un administrateur peut la modifier.');
  showForm(req, res, { values: book, quotes: getQuotes(book.id), action: `/livres/${book.id}`, isEdit: true });
});

app.post('/livres/:id', upload('cover', 5), A.csrfCheck, wrap((req, res) => {
  const book = getBook(req.params.id);
  if (!book) return notFound(req, res);
  if (!canEdit(req.user, book)) return res.status(403).send('Action non autorisée.');
  return saveBook(req, res, book);
}));

app.post('/livres/:id/supprimer', A.csrfCheck, (req, res) => {
  const book = getBook(req.params.id);
  if (!book) return notFound(req, res);
  if (!canEdit(req.user, book)) return res.status(403).send('Action non autorisée.');
  db.transaction(() => {
    db.prepare('DELETE FROM books WHERE id = ?').run(book.id);
    purgeThemes();
  })();
  removeFile(COVERS_DIR, book.cover);
  A.setFlash(req, 'ok', `La fiche « ${book.title} » a été supprimée.`);
  res.redirect(req.user.is_admin && /\/admin/.test(req.get('referer') || '') ? '/admin' : '/bibliotheque');
});

app.get('/couvertures/:file', (req, res) => {
  if (!/^[a-f0-9]{32}\.(jpg|png)$/.test(req.params.file)) return notFound(req, res);
  res.sendFile(path.join(COVERS_DIR, req.params.file), { maxAge: '30d', headers: { 'Cache-Control': 'private, max-age=2592000' } },
    err => { if (err && !res.headersSent) notFound(req, res); });
});

function pdfHeaders(res, filename) {
  res.removeHeader('Content-Security-Policy');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', contentDisposition('inline', filename));
  res.setHeader('Cache-Control', 'private, no-cache');
}

app.get('/livres/:id/fiche.pdf', (req, res) => {
  const book = getBook(req.params.id);
  if (!book) return notFound(req, res);
  pdfHeaders(res, `fiche-${slug(book.title)}.pdf`);
  pdf.bookPdf(book, getQuotes(book.id), book.cover ? path.join(COVERS_DIR, book.cover) : null, res);
});

/* ---------- Téléchargements globaux ---------- */

app.get('/telechargements', (req, res) => {
  const books = db.prepare(BOOK_SELECT).all().sort((a, b) => frCompare(a.title, b.title));
  render(req, res, 'Téléchargements', V.downloads({ books, stats: stats() }), 'dl');
});

app.get('/telechargements/recueil-des-citations.pdf', (req, res) => {
  const fromBooks = db.prepare(`SELECT q.text, q.page, b.title, b.author, b.year
    FROM quotes q JOIN books b ON b.id = q.book_id ORDER BY q.book_id, q.position, q.id`).all();
  const loose = db.prepare(`SELECT text, page, source AS title, author, NULL AS year
    FROM citations ORDER BY created_at, id`).all();
  const rows = [...fromBooks, ...loose];
  pdfHeaders(res, 'recueil-des-citations.pdf');
  pdf.quotesPdf(rows, res);
});

app.get('/telechargements/lectures-par-theme.pdf', (req, res) => {
  pdfHeaders(res, 'lectures-par-theme.pdf');
  pdf.listPdf(db.prepare(BOOK_SELECT).all(), res);
});

/* ---------- Citations ---------- */

// Citations hors fiche + citations tirées des fiches, dans une même liste
function allQuotes({ q, origine }) {
  const like = `%${q}%`;
  const fq = q ? 'AND (c.text LIKE ? OR c.source LIKE ? OR c.author LIKE ?)' : '';
  const bq = q ? 'AND (q.text LIKE ? OR b.title LIKE ? OR b.author LIKE ?)' : '';
  const free = origine === 'fiches' ? [] : db.prepare(`
    SELECT c.id, c.text, c.page, c.source, c.author, c.user_id, c.created_at, u.username AS by_name, NULL AS book_id
    FROM citations c LEFT JOIN users u ON u.id = c.user_id WHERE 1 ${fq}`).all(...(q ? [like, like, like] : []));
  const fromBooks = origine === 'libres' ? [] : db.prepare(`
    SELECT q.id, q.text, q.page, b.title AS source, b.author, b.user_id, b.created_at, u.username AS by_name, b.id AS book_id, q.position
    FROM quotes q JOIN books b ON b.id = q.book_id LEFT JOIN users u ON u.id = b.user_id WHERE 1 ${bq}`).all(...(q ? [like, like, like] : []));
  return [...free, ...fromBooks].sort((a, b) =>
    b.created_at.localeCompare(a.created_at) || (a.position || 0) - (b.position || 0) || b.id - a.id);
}

function sourcesList() {
  const titles = db.prepare('SELECT title AS s FROM books UNION SELECT source AS s FROM citations').all().map(r => r.s);
  return titles.sort(frCompare);
}

function citationsPage(req, res, { error, values, status = 200 } = {}) {
  const q = clean(req.query.q, 100);
  const origine = ['libres', 'fiches'].includes(req.query.origine) ? req.query.origine : '';
  render(req, res, 'Citations', V.citations({
    items: allQuotes({ q, origine }), q, origine, user: req.user, csrf: req.session.csrf,
    error, values, sources: sourcesList(),
  }), 'cit', status);
}

function readCitation(body) {
  return {
    text: String(body.text || '').replace(/\r\n/g, '\n').trim().slice(0, 2000),
    source: clean(body.source, 300),
    author: clean(body.author, 200),
    page: clean(body.page, 20),
  };
}

const getCitation = id => db.prepare('SELECT * FROM citations WHERE id = ?').get(id);

app.get('/citations', (req, res) => citationsPage(req, res));

app.post('/citations', A.csrfCheck, (req, res) => {
  const v = readCitation(req.body);
  if (!v.text || !v.source) return citationsPage(req, res, { error: 'La citation et le titre de l’ouvrage sont obligatoires.', values: v, status: 400 });
  db.prepare('INSERT INTO citations (user_id, text, source, author, page) VALUES (?,?,?,?,?)')
    .run(req.user.id, v.text, v.source, v.author || null, v.page || null);
  A.setFlash(req, 'ok', 'Citation ajoutée.');
  res.redirect('/citations');
});

app.get('/citations/:id/modifier', (req, res) => {
  const c = getCitation(req.params.id);
  if (!c) return notFound(req, res);
  if (!canEdit(req.user, c)) return res.status(403).send('Seul l’auteur de la citation ou un administrateur peut la modifier.');
  render(req, res, 'Modifier la citation', V.citationForm({ values: c, csrf: req.session.csrf, sources: sourcesList() }), 'cit');
});

app.post('/citations/:id', A.csrfCheck, (req, res) => {
  const c = getCitation(req.params.id);
  if (!c) return notFound(req, res);
  if (!canEdit(req.user, c)) return res.status(403).send('Action non autorisée.');
  const v = readCitation(req.body);
  if (!v.text || !v.source) {
    return render(req, res, 'Modifier la citation', V.citationForm({ values: { ...v, id: c.id }, csrf: req.session.csrf, sources: sourcesList(),
      error: 'La citation et le titre de l’ouvrage sont obligatoires.' }), 'cit', 400);
  }
  db.prepare(`UPDATE citations SET text=?, source=?, author=?, page=?, updated_at=datetime('now') WHERE id=?`)
    .run(v.text, v.source, v.author || null, v.page || null, c.id);
  A.setFlash(req, 'ok', 'Citation mise à jour.');
  res.redirect('/citations');
});

app.post('/citations/:id/supprimer', A.csrfCheck, (req, res) => {
  const c = getCitation(req.params.id);
  if (!c) return notFound(req, res);
  if (!canEdit(req.user, c)) return res.status(403).send('Action non autorisée.');
  db.prepare('DELETE FROM citations WHERE id = ?').run(c.id);
  A.setFlash(req, 'ok', 'Citation supprimée.');
  res.redirect('/citations');
});

/* ---------- Fausses bonnes idées (ouvrages déconseillés) ---------- */

const getDiscouraged = id => db.prepare('SELECT * FROM discouraged WHERE id = ?').get(id);
const readDiscouraged = body => ({
  title: clean(body.title, 300),
  author: clean(body.author, 200),
  reason: String(body.reason || '').replace(/\r\n/g, '\n').trim().slice(0, 5000),
});

function discouragedPage(req, res, { error, values, status = 200 } = {}) {
  const items = db.prepare(`SELECT d.*, u.username AS by_name FROM discouraged d LEFT JOIN users u ON u.id = d.user_id`).all()
    .sort((a, b) => frCompare(a.title, b.title));
  render(req, res, 'Fausses bonnes idées', V.discouraged({ items, user: req.user, csrf: req.session.csrf, error, values }), 'fbi', status);
}

app.get('/fausses-bonnes-idees', (req, res) => discouragedPage(req, res));

app.post('/fausses-bonnes-idees', A.csrfCheck, (req, res) => {
  const v = readDiscouraged(req.body);
  if (!v.title) return discouragedPage(req, res, { error: 'Le titre est obligatoire.', values: v, status: 400 });
  db.prepare('INSERT INTO discouraged (user_id, title, author, reason) VALUES (?,?,?,?)')
    .run(req.user.id, v.title, v.author || null, v.reason || null);
  A.setFlash(req, 'ok', 'Ouvrage ajouté aux fausses bonnes idées.');
  res.redirect('/fausses-bonnes-idees');
});

app.get('/fausses-bonnes-idees/:id/modifier', (req, res) => {
  const d = getDiscouraged(req.params.id);
  if (!d) return notFound(req, res);
  if (!canEdit(req.user, d)) return res.status(403).send('Seul l’auteur du signalement ou un administrateur peut le modifier.');
  render(req, res, 'Modifier', V.discouragedForm({ values: d, csrf: req.session.csrf }), 'fbi');
});

app.post('/fausses-bonnes-idees/:id', A.csrfCheck, (req, res) => {
  const d = getDiscouraged(req.params.id);
  if (!d) return notFound(req, res);
  if (!canEdit(req.user, d)) return res.status(403).send('Action non autorisée.');
  const v = readDiscouraged(req.body);
  if (!v.title) {
    return render(req, res, 'Modifier', V.discouragedForm({ values: { ...v, id: d.id }, csrf: req.session.csrf, error: 'Le titre est obligatoire.' }), 'fbi', 400);
  }
  db.prepare('UPDATE discouraged SET title=?, author=?, reason=? WHERE id=?').run(v.title, v.author || null, v.reason || null, d.id);
  A.setFlash(req, 'ok', 'Ouvrage mis à jour.');
  res.redirect('/fausses-bonnes-idees');
});

app.post('/fausses-bonnes-idees/:id/supprimer', A.csrfCheck, (req, res) => {
  const d = getDiscouraged(req.params.id);
  if (!d) return notFound(req, res);
  if (!canEdit(req.user, d)) return res.status(403).send('Action non autorisée.');
  db.prepare('DELETE FROM discouraged WHERE id = ?').run(d.id);
  A.setFlash(req, 'ok', `« ${d.title} » retiré des fausses bonnes idées.`);
  res.redirect('/fausses-bonnes-idees');
});

/* ---------- Emplois du temps ---------- */

function schedulesPage(req, res, error, status = 200) {
  const items = db.prepare(`SELECT s.*, u.username AS by_name FROM schedules s JOIN users u ON u.id = s.user_id
    ORDER BY s.created_at DESC, s.id DESC`).all();
  render(req, res, 'Emplois du temps', V.schedules({ items, user: req.user, csrf: req.session.csrf, error }), 'edt', status);
}

app.get('/emplois-du-temps', (req, res) => schedulesPage(req, res));

app.post('/emplois-du-temps', upload('file', 15), A.csrfCheck, (req, res) => {
  if (req.uploadError) return schedulesPage(req, res, req.uploadError, 400);
  const title = clean(req.body.title, 120);
  const note = String(req.body.note || '').trim().slice(0, 1000);
  if (!title) return schedulesPage(req, res, 'Le titre est obligatoire.', 400);
  if (!req.file || !isPdf(req.file.buffer)) return schedulesPage(req, res, 'Le fichier doit être un PDF.', 400);
  const filename = saveFile(SCHED_DIR, req.file.buffer, 'pdf');
  db.prepare('INSERT INTO schedules (user_id, title, note, filename) VALUES (?,?,?,?)').run(req.user.id, title, note || null, filename);
  A.setFlash(req, 'ok', 'Emploi du temps déposé.');
  res.redirect('/emplois-du-temps');
});

app.get('/emplois/:id/fichier', (req, res) => {
  const s = db.prepare('SELECT * FROM schedules WHERE id = ?').get(req.params.id);
  if (!s) return notFound(req, res);
  pdfHeaders(res, `${slug(s.title)}.pdf`);
  res.sendFile(path.join(SCHED_DIR, s.filename), err => { if (err && !res.headersSent) notFound(req, res); });
});

app.post('/emplois/:id/supprimer', A.csrfCheck, (req, res) => {
  const s = db.prepare('SELECT * FROM schedules WHERE id = ?').get(req.params.id);
  if (!s) return notFound(req, res);
  if (!req.user.is_admin && s.user_id !== req.user.id) return res.status(403).send('Action non autorisée.');
  db.prepare('DELETE FROM schedules WHERE id = ?').run(s.id);
  removeFile(SCHED_DIR, s.filename);
  A.setFlash(req, 'ok', 'Emploi du temps supprimé.');
  res.redirect('/emplois-du-temps');
});

/* ---------- Compte ---------- */

app.get('/compte', (req, res) => render(req, res, 'Mon compte', V.account({ user: req.user, csrf: req.session.csrf }), 'compte'));

app.post('/compte/code', A.csrfCheck, (req, res) => {
  const fail = msg => render(req, res, 'Mon compte', V.account({ user: req.user, csrf: req.session.csrf, error: msg }), 'compte', 400);
  const row = db.prepare('SELECT pass_hash FROM users WHERE id = ?').get(req.user.id);
  const next = String(req.body.next || '');
  if (!A.verifyPassword(String(req.body.current || '').trim(), row.pass_hash)) return fail('Code actuel incorrect.');
  if (next.length < 10) return fail('Le nouveau code doit compter au moins 10 caractères.');
  if (next !== req.body.confirm) return fail('La confirmation ne correspond pas.');
  db.transaction(() => {
    db.prepare('UPDATE users SET pass_hash = ? WHERE id = ?').run(A.hashPassword(next), req.user.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?').run(req.user.id, req.session.token);
  })();
  A.setFlash(req, 'ok', 'Code d’accès modifié. Vos autres sessions ont été fermées.');
  res.redirect('/compte');
});

/* ---------- Administration ---------- */

const adminRouter = express.Router();
adminRouter.use(A.requireAdmin);

adminRouter.get('/', (req, res) => {
  const users = db.prepare(`SELECT u.*, (SELECT COUNT(*) FROM books b WHERE b.user_id = u.id) n FROM users u`).all()
    .sort((a, b) => frCompare(a.username, b.username));
  const themes = db.prepare(`SELECT t.id, t.name, COUNT(b.id) n FROM themes t LEFT JOIN books b ON b.theme_id = t.id GROUP BY t.id`).all()
    .sort((a, b) => frCompare(a.name, b.name));
  const books = db.prepare(`${BOOK_SELECT} ORDER BY b.created_at DESC, b.id DESC`).all();
  render(req, res, 'Administration', V.admin({ users, themes, books, csrf: req.session.csrf, me: req.user }), 'admin');
});

adminRouter.get('/regle', (req, res) => {
  render(req, res, 'Règle du cercle', V.ruleForm({ text: R.getRule(), max: R.MAX, csrf: req.session.csrf }), 'admin');
});

adminRouter.post('/regle', A.csrfCheck, (req, res) => {
  if (req.body.action === 'defaut') {
    R.resetRule();
    A.setFlash(req, 'ok', 'Règle d’origine rétablie.');
    return res.redirect('/admin/regle');
  }
  R.setRule(req.body.text);
  A.setFlash(req, 'ok', 'Règle du cercle mise à jour.');
  res.redirect('/');
});

adminRouter.post('/comptes', A.csrfCheck, (req, res) => {
  const username = clean(req.body.username, 40);
  if (!/^[A-Za-z0-9._-]{2,40}$/.test(username)) {
    A.setFlash(req, 'err', 'Identifiant invalide : lettres, chiffres, point, tiret ou souligné, 2 à 40 caractères.');
    return res.redirect('/admin');
  }
  if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) {
    A.setFlash(req, 'err', `L’identifiant « ${username} » existe déjà.`);
    return res.redirect('/admin');
  }
  const code = A.generateCode();
  db.prepare('INSERT INTO users (username, pass_hash, is_admin) VALUES (?,?,?)')
    .run(username, A.hashPassword(code), req.body.is_admin === '1' ? 1 : 0);
  A.setFlash(req, 'ok', 'Compte créé.', { login: username, code });
  res.redirect('/admin');
});

adminRouter.post('/comptes/:uid/reinitialiser', A.csrfCheck, (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.uid);
  if (!u) return notFound(req, res);
  const code = A.generateCode();
  db.transaction(() => {
    db.prepare('UPDATE users SET pass_hash = ? WHERE id = ?').run(A.hashPassword(code), u.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?').run(u.id, req.session.token);
  })();
  A.setFlash(req, 'ok', 'Nouveau code généré.', { login: u.username, code });
  res.redirect('/admin');
});

adminRouter.post('/comptes/:uid/supprimer', A.csrfCheck, (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.uid);
  if (!u) return notFound(req, res);
  if (u.id === req.user.id) { A.setFlash(req, 'err', 'Vous ne pouvez pas supprimer votre propre compte.'); return res.redirect('/admin'); }
  const files = db.prepare('SELECT filename FROM schedules WHERE user_id = ?').all(u.id);
  db.prepare('DELETE FROM users WHERE id = ?').run(u.id);
  files.forEach(f => removeFile(SCHED_DIR, f.filename));
  A.setFlash(req, 'ok', `Compte « ${u.username} » supprimé. Ses fiches sont conservées.`);
  res.redirect('/admin');
});

adminRouter.post('/themes/:tid', A.csrfCheck, (req, res) => {
  const t = db.prepare('SELECT * FROM themes WHERE id = ?').get(req.params.tid);
  let name = clean(req.body.name, 80);
  if (!t || !name) return res.redirect('/admin');
  name = name[0].toUpperCase() + name.slice(1);
  const other = db.prepare('SELECT * FROM themes WHERE name = ? AND id != ?').get(name, t.id);
  db.transaction(() => {
    if (other) {
      db.prepare('UPDATE books SET theme_id = ? WHERE theme_id = ?').run(other.id, t.id);
      db.prepare('DELETE FROM themes WHERE id = ?').run(t.id);
    } else {
      db.prepare('UPDATE themes SET name = ? WHERE id = ?').run(name, t.id);
    }
  })();
  A.setFlash(req, 'ok', other ? `« ${t.name} » fusionné dans « ${other.name} ».` : `Thème renommé en « ${name} ».`);
  res.redirect('/admin');
});

adminRouter.post('/themes/:tid/supprimer', A.csrfCheck, (req, res) => {
  const t = db.prepare('SELECT * FROM themes WHERE id = ?').get(req.params.tid);
  if (t) {
    db.prepare('DELETE FROM themes WHERE id = ?').run(t.id);
    A.setFlash(req, 'ok', `Thème « ${t.name} » supprimé.`);
  }
  res.redirect('/admin');
});

app.use('/admin', adminRouter);

/* ---------- Erreurs ---------- */

app.use(notFound);
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return res.end();
  render(req, res, 'Erreur', V.message('Une erreur est survenue', 'Réessayez dans un instant. Si le problème persiste, prévenez l’administrateur.'), null, 500);
});

app.listen(cfg.PORT, cfg.HOST, () => {
  console.log(`${cfg.SITE_NAME} en écoute sur http://${cfg.HOST}:${cfg.PORT}`);
  if (!db.prepare('SELECT 1 FROM users WHERE is_admin = 1').get()) {
    console.log('Aucun administrateur : lancez « npm run create-admin -- <identifiant> ».');
  }
});

const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const { DATA_DIR } = require('./config');

const COVERS_DIR = path.join(DATA_DIR, 'uploads', 'couvertures');
const SCHED_DIR = path.join(DATA_DIR, 'uploads', 'emplois');
const TMP_DIR = path.join(DATA_DIR, 'uploads', 'provisoire');
fs.mkdirSync(COVERS_DIR, { recursive: true });
fs.mkdirSync(TMP_DIR, { recursive: true });
fs.mkdirSync(SCHED_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'cabinet.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pass_hash TEXT NOT NULL,
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf TEXT NOT NULL,
  flash TEXT,
  expires INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS themes (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE COLLATE NOCASE
);
CREATE TABLE IF NOT EXISTS books (
  id INTEGER PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  theme_id INTEGER REFERENCES themes(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  year INTEGER,
  isbn TEXT,
  rating INTEGER,
  summary TEXT NOT NULL,
  read_if TEXT,
  cover TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS quotes (
  id INTEGER PRIMARY KEY,
  book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  page TEXT,
  position INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS schedules (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  note TEXT,
  filename TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Citations hors fiche : seule une référence (titre, auteur et page facultatifs)
CREATE TABLE IF NOT EXISTS citations (
  id INTEGER PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  text TEXT NOT NULL,
  source TEXT NOT NULL,
  author TEXT,
  page TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Réglages modifiables depuis l'administration (règle du cercle…)
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- Fausses bonnes idées : ouvrages déconseillés (ni résumé ni citations)
CREATE TABLE IF NOT EXISTS discouraged (
  id INTEGER PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  author TEXT,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_citations_created ON citations(created_at);
CREATE INDEX IF NOT EXISTS idx_books_created ON books(created_at);
CREATE INDEX IF NOT EXISTS idx_quotes_book ON quotes(book_id);
`);

// Migrations légères : colonnes ajoutées après la première mise en service
if (!db.prepare('PRAGMA table_info(books)').all().some(c => c.name === 'essential')) {
  db.exec('ALTER TABLE books ADD COLUMN essential INTEGER NOT NULL DEFAULT 0');
}

// Purge des sessions expirées au démarrage puis toutes les heures
// et des couvertures provisoires (recherches ISBN non suivies d'un enregistrement) de plus de 24 h
const purge = () => {
  db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());
  const limit = Date.now() - 24 * 3600 * 1000;
  for (const f of fs.readdirSync(TMP_DIR)) {
    const p = path.join(TMP_DIR, f);
    try { if (fs.statSync(p).mtimeMs < limit) fs.rmSync(p, { force: true }); } catch { /* ignoré */ }
  }
};
purge();
setInterval(purge, 3600 * 1000).unref();

module.exports = { db, COVERS_DIR, SCHED_DIR, TMP_DIR };

// Usage : node scripts/create-admin.js <identifiant>
// Crée un administrateur (ou réinitialise son code s'il existe) et affiche le code d'accès.
const { db } = require('../src/db');
const { hashPassword, generateCode } = require('../src/auth');

const username = process.argv[2];
if (!username || !/^[A-Za-z0-9._-]{2,40}$/.test(username)) {
  console.error('Usage : npm run create-admin -- <identifiant>   (lettres, chiffres, . _ -)');
  process.exit(1);
}

const code = generateCode();
const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
if (existing) {
  db.prepare('UPDATE users SET pass_hash = ?, is_admin = 1 WHERE id = ?').run(hashPassword(code), existing.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(existing.id);
  console.log(`Compte existant promu administrateur, code réinitialisé.`);
} else {
  db.prepare('INSERT INTO users (username, pass_hash, is_admin) VALUES (?, ?, 1)').run(username, hashPassword(code));
  console.log('Administrateur créé.');
}
console.log(`  Identifiant : ${username}\n  Code        : ${code}`);

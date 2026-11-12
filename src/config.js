const path = require('path');

const SITE_NAME = process.env.SITE_NAME || 'Cabinet de lecture';

function initials(name) {
  const small = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'l', 'd', 'et', 'à', 'au', 'aux']);
  return name
    .split(/[\s'’-]+/)
    .filter(w => w && !small.has(w.toLowerCase()))
    .map(w => w[0].toUpperCase())
    .slice(0, 3)
    .join('');
}

module.exports = {
  SITE_NAME,
  MONOGRAM: process.env.MONOGRAM || initials(SITE_NAME),
  PORT: parseInt(process.env.PORT || '3000', 10),
  HOST: process.env.HOST || '127.0.0.1',
  COOKIE_SECURE: process.env.COOKIE_SECURE === '1',
  DATA_DIR: process.env.DATA_DIR || path.join(__dirname, '..', 'data'),
  SESSION_DAYS: 30,
};

// Notices et couvertures : Open Library, puis Google Books, puis Amazon (ISBN-10).
// Chaque source est essayée tour à tour ; la première image valide l'emporte.
const UA = { 'User-Agent': 'CabinetDeLecture/1.1 (fiches de lecture)' };
const GOOGLE_KEY = process.env.GOOGLE_BOOKS_KEY || '';

const normIsbn = s => String(s || '').replace(/[^0-9Xx]/g, '').toUpperCase();
const validIsbn = s => /^(\d{9}[\dX]|\d{13})$/.test(s);

function isbn10to13(i) {
  const core = '978' + i.slice(0, 9);
  let sum = 0;
  for (let k = 0; k < 12; k++) sum += +core[k] * (k % 2 ? 3 : 1);
  return core + ((10 - (sum % 10)) % 10);
}
function isbn13to10(i) {
  if (!i.startsWith('978')) return null;
  const core = i.slice(3, 12);
  let sum = 0;
  for (let k = 0; k < 9; k++) sum += +core[k] * (10 - k);
  const c = (11 - (sum % 11)) % 11;
  return core + (c === 10 ? 'X' : String(c));
}
// Les deux formes de l'ISBN (13 d'abord)
function variants(isbn) {
  if (isbn.length === 10) return [isbn10to13(isbn), isbn];
  const ten = isbn13to10(isbn);
  return ten ? [isbn, ten] : [isbn];
}

async function getJson(url, ms = 7000) {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(ms) });
  if (!r.ok) throw new Error(`${new URL(url).host} ${r.status}`);
  return r.json();
}

// Dimensions d'une image JPEG ou PNG (null si illisible)
function imageInfo(buf) {
  if (buf.length > 24 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { ext: 'png', w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let o = 2;
    while (o + 9 < buf.length) {
      if (buf[o] !== 0xff) { o++; continue; }
      const m = buf[o + 1];
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7) || m === 0xff) { o += m === 0xff ? 1 : 2; continue; }
      const len = buf.readUInt16BE(o + 2);
      if ((m >= 0xc0 && m <= 0xc3) || (m >= 0xc5 && m <= 0xc7) || (m >= 0xc9 && m <= 0xcb) || (m >= 0xcd && m <= 0xcf)) {
        return { ext: 'jpg', h: buf.readUInt16BE(o + 5), w: buf.readUInt16BE(o + 7) };
      }
      o += 2 + len;
    }
    return { ext: 'jpg', w: 0, h: 0 };
  }
  return null;
}

// Télécharge une image candidate ; rejette les vides, pixels de remplissage et vignettes minuscules
async function fetchImage(url, ms = 9000) {
  try {
    const r = await fetch(url, { headers: UA, redirect: 'follow', signal: AbortSignal.timeout(ms) });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 1500 || buf.length > 8 * 1024 * 1024) return null;
    const info = imageInfo(buf);
    if (!info) return null;
    if (info.w && (info.w < 60 || info.h < 80)) return null;
    return { buf, ext: info.ext };
  } catch {
    return null;
  }
}

/* ---------- Sources ---------- */

async function openLibrary(isbns) {
  const keys = isbns.map(i => `ISBN:${i}`).join(',');
  const data = await getJson(`https://openlibrary.org/api/books?bibkeys=${keys}&format=json&jscmd=data`);
  const rec = isbns.map(i => data[`ISBN:${i}`]).find(Boolean);
  const covers = [];
  if (rec && rec.cover) covers.push(rec.cover.large || rec.cover.medium);
  isbns.forEach(i => covers.push(`https://covers.openlibrary.org/b/isbn/${i}-L.jpg?default=false`));
  if (!rec) return { covers };
  return {
    title: [rec.title, rec.subtitle].filter(Boolean).join(' : '),
    author: (rec.authors || []).map(a => a.name).join(', '),
    year: (String(rec.publish_date || '').match(/\d{4}/) || [])[0] || '',
    covers,
  };
}

async function googleBooks(isbns) {
  for (const i of isbns) {
    const key = GOOGLE_KEY ? `&key=${encodeURIComponent(GOOGLE_KEY)}` : '';
    const data = await getJson(`https://www.googleapis.com/books/v1/volumes?q=isbn:${i}&maxResults=1${key}`);
    const v = data.items && data.items[0] && data.items[0].volumeInfo;
    if (!v) continue;
    const covers = [];
    const links = v.imageLinks || {};
    const best = links.extraLarge || links.large || links.medium || links.thumbnail || links.smallThumbnail;
    if (best) {
      const base = best.replace(/^http:/, 'https:').replace(/&edge=curl/g, '');
      covers.push(base.replace(/&zoom=\d/, '') + '&fife=w800-h1200', base);
    }
    return {
      title: [v.title, v.subtitle].filter(Boolean).join(' : '),
      author: (v.authors || []).join(', '),
      year: (String(v.publishedDate || '').match(/\d{4}/) || [])[0] || '',
      covers,
    };
  }
  return { covers: [] };
}

const amazon = isbns => {
  const ten = isbns.find(i => i.length === 10);
  return { covers: ten ? [`https://images-na.ssl-images-amazon.com/images/P/${ten}.01.LZZZZZZZ.jpg`] : [] };
};

/* ---------- API ---------- */

// Notice + couverture. Renvoie { found, title, author, year, cover: {buf, ext} | null }
async function lookup(isbn, { withCover = true } = {}) {
  isbn = normIsbn(isbn);
  if (!validIsbn(isbn)) return { found: false, cover: null };
  const isbns = variants(isbn);
  const [ol, gb] = await Promise.allSettled([openLibrary(isbns), googleBooks(isbns)]);
  const olv = ol.status === 'fulfilled' ? ol.value : { covers: [] };
  const gbv = gb.status === 'fulfilled' ? gb.value : { covers: [] };
  if (ol.status === 'rejected' && gb.status === 'rejected') {
    console.warn('Recherche ISBN indisponible :', ol.reason && ol.reason.message, '/', gb.reason && gb.reason.message);
  }
  const pick = k => olv[k] || gbv[k] || '';
  const found = !!(olv.title || gbv.title);

  let cover = null;
  if (withCover) {
    const seen = new Set();
    const candidates = [...olv.covers, ...gbv.covers, ...amazon(isbns).covers].filter(u => u && !seen.has(u) && seen.add(u));
    for (const url of candidates) {
      cover = await fetchImage(url);
      if (cover) break;
    }
  }
  // Métadonnées : Open Library d'abord, Google Books en complément
  return { found, title: pick('title'), author: pick('author'), year: pick('year'), cover };
}

// Couverture seule ({buf, ext} ou null)
async function findCover(isbn) {
  try {
    return (await lookup(isbn)).cover;
  } catch {
    return null;
  }
}

module.exports = { lookup, findCover, normIsbn, validIsbn, imageInfo, variants };

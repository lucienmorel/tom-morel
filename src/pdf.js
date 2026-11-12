const PDFDocument = require('pdfkit');
const path = require('path');
const { SITE_NAME, MONOGRAM } = require('./config');
const { paragraphs, stripQuotes, fmtDate, frCompare, plural, typo } = require('./util');

const FONT = f => path.join(__dirname, '..', 'fonts', f);
const NAVY = '#14213d';
const INK = '#1b1b1b';
const MUTED = '#5b6475';
const M = 64; // marge

function newDoc(info) {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: M, bottom: 78, left: M, right: M },
    bufferPages: true,
    info: { Producer: SITE_NAME, Creator: SITE_NAME, ...info },
  });
  doc.registerFont('R', FONT('eb-garamond-latin-400-normal.woff'));
  doc.registerFont('I', FONT('eb-garamond-latin-400-italic.woff'));
  doc.registerFont('B', FONT('eb-garamond-latin-600-normal.woff'));
  doc.registerFont('BI', FONT('eb-garamond-latin-600-italic.woff'));
  doc.font('R').fillColor(INK);
  return doc;
}

const W = doc => doc.page.width - 2 * M;
const bottom = doc => doc.page.height - doc.page.margins.bottom;
function ensure(doc, h) { if (doc.y + h > bottom(doc)) doc.addPage(); }

function rule(doc, y, width = 0.5) {
  doc.save().moveTo(M, y).lineTo(doc.page.width - M, y).lineWidth(width).strokeColor(NAVY).stroke().restore();
}

function heading(doc, label) {
  ensure(doc, 90);
  doc.moveDown(1.3);
  doc.font('R').fontSize(9.5).fillColor(NAVY).text(label.toUpperCase(), M, doc.y, { characterSpacing: 2.2, width: W(doc) });
  const y = doc.y + 3;
  rule(doc, y);
  doc.y = y + 12;
  doc.x = M;
}

function monogram(doc, x, y, size) {
  doc.save().rect(x, y, size, size).lineWidth(0.8).strokeColor(NAVY).stroke();
  doc.font('B').fontSize(size * 0.42).fillColor(NAVY);
  const h = doc.currentLineHeight();
  doc.text(MONOGRAM, x, y + (size - h) / 2 + size * 0.03, { width: size, align: 'center', lineBreak: false });
  doc.restore();
}

// Pied de page : nom du site + pagination, sur toutes les pages
function footers(doc, label) {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    const saved = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const y = doc.page.height - 50;
    rule(doc, y - 8, 0.4);
    doc.font('R').fontSize(8.5).fillColor(NAVY);
    doc.text(`${SITE_NAME.toUpperCase()}  ·  ${label.toUpperCase()}`, M, y, { characterSpacing: 1.4, lineBreak: false });
    doc.text(`${i + 1} / ${range.count}`, M, y, { width: W(doc), align: 'right', lineBreak: false });
    doc.page.margins.bottom = saved;
  }
}

function quoteBlock(doc, q, indent = 18) {
  ensure(doc, 55);
  const startPage = doc.page;
  const y0 = doc.y;
  doc.font('I').fontSize(12.5).fillColor(INK)
    .text(`« ${typo(stripQuotes(q.text))} »`, M + indent, y0, { width: W(doc) - indent, lineGap: 2.2 });
  if (q.page) {
    doc.moveDown(0.15).font('R').fontSize(9.5).fillColor(MUTED)
      .text(`p. ${q.page}`, M + indent, doc.y, { width: W(doc) - indent, align: 'right' });
  }
  if (doc.page === startPage) {
    doc.save().moveTo(M + 2, y0 + 3).lineTo(M + 2, doc.y - 3).lineWidth(1.2).strokeColor(NAVY).stroke().restore();
  }
  doc.moveDown(0.9);
  doc.x = M;
}

/* ---------- Fiche individuelle ---------- */
function bookPdf(book, quotes, coverPath, out) {
  const doc = newDoc({ Title: `${book.title} — fiche de lecture`, Author: book.by_name || SITE_NAME });
  doc.pipe(out);

  doc.font('R').fontSize(9).fillColor(NAVY).text('FICHE DE LECTURE', M, 40, { characterSpacing: 2.2 });
  rule(doc, 54, 0.4);

  const top = 82;
  let textX = M;
  let coverBottom = top;
  if (coverPath) {
    try {
      const img = doc.openImage(coverPath);
      const s = Math.min(150 / img.width, 228 / img.height);
      const w = img.width * s, h = img.height * s;
      doc.image(img, M, top, { width: w, height: h });
      doc.save().rect(M, top, w, h).lineWidth(0.5).strokeColor('#c4cad6').stroke().restore();
      textX = M + w + 30;
      coverBottom = top + h;
    } catch { /* image illisible : on l'ignore */ }
  }
  const textW = doc.page.width - M - textX;

  doc.font('R').fontSize(9.5).fillColor(NAVY)
    .text((book.theme || 'Sans thème').toUpperCase(), textX, top, { width: textW, characterSpacing: 1.8 });
  doc.moveDown(0.5).font('B').fontSize(25).fillColor(NAVY).text(typo(book.title), textX, doc.y, { width: textW, lineGap: -1 });
  doc.moveDown(0.25).font('I').fontSize(15).fillColor(INK).text(book.author, textX, doc.y, { width: textW });

  const meta = [
    book.year ? String(book.year) : null,
    book.isbn ? `ISBN ${book.isbn}` : null,
    book.rating ? `Note ${book.rating}/5` : null,
  ].filter(Boolean).join('   ·   ');
  doc.moveDown(0.8).font('R').fontSize(10.5).fillColor(MUTED);
  if (meta) doc.text(meta, textX, doc.y, { width: textW });
  doc.moveDown(0.2).text(`Proposée par ${book.by_name || 'un ancien membre'}, le ${fmtDate(book.created_at)}`, textX, doc.y, { width: textW });

  doc.y = Math.max(doc.y, coverBottom) + 6;
  doc.x = M;

  heading(doc, 'Résumé');
  doc.font('R').fontSize(11.8).fillColor(INK);
  for (const p of paragraphs(book.summary)) {
    doc.text(typo(p), M, doc.y, { width: W(doc), align: 'justify', lineGap: 2.6, paragraphGap: 7 });
  }

  if (book.read_if) {
    heading(doc, 'À lire si…');
    doc.font('I').fontSize(12).fillColor(INK).text(typo(book.read_if), M, doc.y, { width: W(doc), lineGap: 2.4 });
  }

  if (quotes.length) {
    heading(doc, quotes.length > 1 ? 'Citations' : 'Citation');
    quotes.forEach(q => quoteBlock(doc, q));
  }

  const short = typo(book.title);
  footers(doc, short.length > 48 ? short.slice(0, 46) + '…' : short);
  doc.end();
}

function titlePage(doc, title, subtitle) {
  const cx = doc.page.width / 2;
  monogram(doc, cx - 30, 250, 60);
  doc.font('R').fontSize(11).fillColor(NAVY)
    .text(SITE_NAME.toUpperCase(), M, 340, { width: W(doc), align: 'center', characterSpacing: 3 });
  doc.save().moveTo(cx - 40, 375).lineTo(cx + 40, 375).lineWidth(0.6).strokeColor(NAVY).stroke().restore();
  doc.font('R').fontSize(34).fillColor(NAVY).text(title, M, 400, { width: W(doc), align: 'center' });
  doc.moveDown(0.6).font('I').fontSize(13).fillColor(MUTED).text(subtitle, M, doc.y, { width: W(doc), align: 'center' });
  doc.addPage();
}

/* ---------- Recueil des citations ---------- */
function quotesPdf(rows, out) {
  const doc = newDoc({ Title: `Recueil des citations — ${SITE_NAME}` });
  doc.pipe(out);

  // Regroupement par ouvrage (titre normalisé) : les citations hors fiche rejoignent la fiche du même titre
  const keyOf = t => String(t).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const books = new Map();
  rows.forEach(r => {
    const k = keyOf(r.title);
    if (!books.has(k)) books.set(k, { title: r.title, author: r.author, year: r.year, quotes: [] });
    const g = books.get(k);
    if (!g.author && r.author) g.author = r.author;
    if (!g.year && r.year) g.year = r.year;
    g.quotes.push(r);
  });
  const list = [...books.values()].sort((a, b) => frCompare(a.title, b.title));

  const today = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  titlePage(doc, 'Recueil des citations',
    `${plural(rows.length, 'citation')} tirées de ${plural(list.length, 'ouvrage')} — état au ${today}`);

  if (!list.length) doc.font('I').fontSize(13).fillColor(MUTED).text('Aucune citation pour le moment.', M, M);
  list.forEach((b, i) => {
    ensure(doc, 120);
    if (i > 0) doc.moveDown(1);
    doc.font('B').fontSize(15).fillColor(NAVY).text(typo(b.title), M, doc.y, { width: W(doc) });
    const by = [b.author, b.year].filter(Boolean).join(', ');
    if (by) doc.font('I').fontSize(11.5).fillColor(MUTED).text(by, M, doc.y, { width: W(doc) });
    doc.moveDown(0.7);
    b.quotes.forEach(q => quoteBlock(doc, q));
  });

  footers(doc, 'Recueil des citations');
  doc.end();
}

/* ---------- Liste des lectures par thème ---------- */
function listPdf(rows, out) {
  const doc = newDoc({ Title: `Lectures par thème — ${SITE_NAME}` });
  doc.pipe(out);

  const groups = new Map();
  rows.forEach(r => {
    const k = r.theme || 'Sans thème';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  });
  const keys = [...groups.keys()].sort((a, b) =>
    a === 'Sans thème' ? 1 : b === 'Sans thème' ? -1 : frCompare(a, b));

  const today = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  doc.font('R').fontSize(9).fillColor(NAVY).text(SITE_NAME.toUpperCase(), M, 40, { characterSpacing: 2.2 });
  rule(doc, 54, 0.4);
  doc.font('R').fontSize(30).fillColor(NAVY).text('Lectures par thème', M, 84, { width: W(doc) });
  doc.font('I').fontSize(12).fillColor(MUTED)
    .text(`${plural(rows.length, 'ouvrage')}, ${plural(keys.length, 'thème')} — état au ${today}`, M, doc.y + 2, { width: W(doc) });

  if (!rows.length) doc.moveDown(2).font('I').fontSize(13).text('Aucune fiche pour le moment.', M, doc.y);

  const rightW = 120;
  keys.forEach(k => {
    heading(doc, `${k}  (${groups.get(k).length})`);
    groups.get(k).sort((a, b) => frCompare(a.title, b.title)).forEach(r => {
      ensure(doc, 34);
      const y = doc.y;
      doc.font('B').fontSize(12.2).fillColor(INK)
        .text(typo(r.title), M, y, { width: W(doc) - rightW - 16, continued: true })
        .font('I').fillColor(MUTED).text(`  —  ${r.author}${r.year ? ', ' + r.year : ''}`);
      const after = doc.y;
      doc.font('R').fontSize(9.5).fillColor(MUTED)
        .text(r.by_name || '', doc.page.width - M - rightW, y + 2.5, { width: rightW, align: 'right' });
      doc.y = Math.max(after, doc.y) + 5;
      doc.x = M;
    });
  });

  footers(doc, 'Lectures par thème');
  doc.end();
}

module.exports = { bookPdf, quotesPdf, listPdf };

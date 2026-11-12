// Confirmation avant les actions destructrices
document.addEventListener('submit', ev => {
  const btn = ev.submitter;
  const msg = (btn && btn.dataset.confirmBtn) || (ev.target.dataset && ev.target.dataset.confirm);
  if (msg && !window.confirm(msg)) ev.preventDefault();
});

// ---------- Formulaire de fiche ----------
const $ = id => document.getElementById(id);

const coverImg = $('cover-img');
const coverNone = $('cover-none');
function showCover(src) {
  if (!coverImg) return;
  coverImg.src = src;
  coverImg.hidden = false;
  if (coverNone) coverNone.hidden = true;
}

// Recherche ISBN (Open Library, via le serveur)
const isbnBtn = $('isbn-btn');
if (isbnBtn) {
  const status = $('isbn-status');
  const run = async () => {
    const isbn = $('isbn').value.replace(/[^0-9Xx]/g, '');
    if (isbn.length !== 10 && isbn.length !== 13) { status.textContent = 'Un ISBN compte 10 ou 13 chiffres.'; return; }
    status.textContent = 'Recherche en cours (Open Library, Google Books)…';
    isbnBtn.disabled = true;
    try {
      const r = await fetch('/api/isbn/' + encodeURIComponent(isbn), { headers: { Accept: 'application/json' } });
      const d = await r.json();
      if (!r.ok) throw new Error();
      ['title', 'author', 'year'].forEach(k => { if (d[k] && !$(k).value.trim()) $(k).value = d[k]; });
      const gotCover = d.cover && !$('cover').files.length;
      if (gotCover) {
        showCover(d.cover);
        $('cover_tmp').value = d.cover_tmp;
      }
      if (!d.found) {
        status.textContent = gotCover
          ? 'Couverture trouvée, mais pas la notice : complétez les champs.'
          : 'Aucune notice trouvée. Remplissez les champs et déposez une couverture.';
      } else if (gotCover) {
        status.textContent = 'Notice trouvée, couverture comprise. Vérifiez les champs.';
      } else {
        status.textContent = d.cover ? 'Notice trouvée.' : 'Notice trouvée, sans couverture : vous pouvez en déposer une.';
      }
    } catch {
      status.textContent = 'Le service de recherche ne répond pas. Remplissez les champs à la main.';
    } finally {
      isbnBtn.disabled = false;
    }
  };
  isbnBtn.addEventListener('click', run);
  $('isbn').addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); run(); } });
}

// Aperçu de la couverture déposée
const coverInput = $('cover');
if (coverInput) {
  coverInput.addEventListener('change', () => {
    const f = coverInput.files[0];
    if (!f) return;
    showCover(URL.createObjectURL(f));
    $('cover_tmp').value = '';
  });
}

// Citations : ajout / retrait de lignes
const quotes = $('quotes');
if (quotes) {
  const tpl = $('quote-tpl');
  $('quote-add').addEventListener('click', () => {
    const node = tpl.content.cloneNode(true);
    quotes.appendChild(node);
    const areas = quotes.querySelectorAll('textarea');
    areas[areas.length - 1].focus();
  });
  quotes.addEventListener('click', ev => {
    if (!ev.target.classList.contains('q-remove')) return;
    const row = ev.target.closest('.quote-row');
    if (quotes.querySelectorAll('.quote-row').length > 1) row.remove();
    else row.querySelectorAll('textarea, input').forEach(el => { el.value = ''; });
  });
}

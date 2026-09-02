/* ============================================================================
 * tour.js — tour guidato al primo accesso: un'anteprima rapida (~2 minuti,
 * 9 passi) delle sezioni della sidebar, invece di lasciare chi apre il
 * gestionale per la prima volta a scoprire tutto da solo.
 *
 * Resta apposta sulla pagina in cui ci si trova (mai una navigazione vera):
 * ogni passo indica un elemento della barra laterale — presente identica su
 * ogni pagina (vedi nav.js) — quindi il tour funziona a prescindere da dove
 * l'utente sia atterrato dopo il login (oggi clienti.html, ma non deve
 * dipendere da quello).
 *
 * Agganciato da nav.js (SaasNav.render() chiama SaasTour.maybeStart() alla
 * fine): un solo punto di innesco, niente da aggiungere all'init() di ogni
 * singola pagina — SOLO lo script tag va incluso (vedi ogni pagina, accanto
 * a app/nav.js).
 *
 * "Buco" nel velo scuro ottenuto con quattro rettangoli intorno
 * all'elemento evidenziato (mai sopra di lui), non con un z-index
 * sull'elemento stesso: .sidebar ha position:sticky, che crea un proprio
 * contesto d'impilamento — un z-index sul solo elemento interno non
 * basterebbe a farlo emergere sopra un velo esterno con z-index più alto
 * (resterebbe comunque sotto, intrappolato dentro il contesto della
 * sidebar). Quattro rettangoli che lasciano libero solo il suo riquadro
 * evita il problema alla radice, senza dover litigare con lo stacking.
 * ============================================================================ */

(function (global) {
  'use strict';

  const DONE_KEY = 'saas_tour_done';

  function navgroupOf(href) {
    const link = document.querySelector('a.navlink[href="' + href + '"]');
    return link ? link.closest('.navgroup') : null;
  }

  const STEPS = [
    { title: 'Benvenuto 👋',
      text: 'Facciamo un giro veloce di due minuti per orientarti nel gestionale — puoi saltarlo in ogni momento.' },
    { target: () => document.querySelector('a.navlink[href="dashboard.html"]'),
      title: 'Dashboard',
      text: 'Il colpo d’occhio della tua azienda: fatturato del mese, scadenze imminenti, ordini aperti. Il primo posto da guardare ogni mattina.' },
    { target: () => document.querySelector('a.navlink[href="assistente-ai.html"]'),
      title: 'Assistente AI',
      text: 'Fai domande sui tuoi dati in linguaggio semplice, e chiedi anche di eseguire azioni — creare un ordine, segnare una fattura pagata — sempre con un’anteprima da confermare prima.' },
    { target: () => navgroupOf('clienti.html'),
      title: 'Clienti',
      text: 'L’anagrafica dei tuoi clienti, e da lì tutto il ciclo di vendita: preventivo → ordine → DDT → fattura.' },
    { target: () => navgroupOf('fornitori.html'),
      title: 'Fornitori',
      text: 'Lo stesso ciclo, dal lato degli acquisti: fornitori, ordini, fatture da pagare.' },
    { target: () => navgroupOf('prodotti.html'),
      title: 'Catalogo',
      text: 'Il catalogo prodotti e le giacenze di magazzino, condivisi da ogni documento che crei.' },
    { target: () => document.querySelector('a.navlink[href="scadenziario.html"]'),
      title: 'Scadenziario',
      text: 'Chi ti deve pagare e chi devi pagare, con le scadenze — utile per non perdere di vista gli incassi.' },
    { target: () => navgroupOf('impostazioni-azienda.html'),
      title: 'Azienda',
      text: 'I dati della tua azienda, il team, e il tuo piano di abbonamento.' },
    { title: 'Pronto a partire 🚀',
      text: 'Hai finito il giro! Puoi rivedere questo tour quando vuoi da "Rifai il tour", in fondo al menu.' },
  ];

  let idx = -1;
  let wasSidebarOpen = false;
  let resizeHandler = null;

  function ensureDom() {
    if (document.getElementById('tour-card')) return;
    const card = document.createElement('div');
    card.className = 'tour-card';
    card.id = 'tour-card';
    card.innerHTML =
      '<div class="tour-step" id="tour-step"></div>' +
      '<h3 id="tour-title"></h3>' +
      '<p id="tour-text"></p>' +
      '<div class="tour-actions">' +
      '<button type="button" class="linklike" id="tour-skip">Salta il tour</button>' +
      '<div class="tour-nav">' +
      '<button type="button" class="ghost" id="tour-prev">← Indietro</button>' +
      '<button type="button" class="primary" id="tour-next">Avanti →</button>' +
      '</div></div>';
    document.body.appendChild(card);
    document.getElementById('tour-skip').addEventListener('click', finish);
    document.getElementById('tour-prev').addEventListener('click', () => go(idx - 1));
    document.getElementById('tour-next').addEventListener('click', () => go(idx + 1));
  }

  function onKeydown(e) {
    if (!document.getElementById('tour-card')) return;
    if (e.key === 'Escape') finish();
    else if (e.key === 'ArrowRight') go(idx + 1);
    else if (e.key === 'ArrowLeft') go(idx - 1);
  }

  // Quattro rettangoli intorno al target (mai sopra, vedi nota in testa al
  // file) — o un unico velo pieno per un passo senza target (introduzione/
  // chiusura). Ridisegnato ad ogni passo e al resize della finestra.
  function drawCurtain(target) {
    document.querySelectorAll('.tour-curtain').forEach(el => el.remove());
    document.querySelectorAll('.tour-spotlight').forEach(el => el.classList.remove('tour-spotlight'));
    const vw = window.innerWidth, vh = window.innerHeight;
    const piece = (top, left, width, height) => {
      if (width <= 0 || height <= 0) return;
      const div = document.createElement('div');
      div.className = 'tour-curtain';
      div.style.top = top + 'px'; div.style.left = left + 'px';
      div.style.width = width + 'px'; div.style.height = height + 'px';
      div.addEventListener('click', finish); // clic sul velo (fuori dal riquadro) = salta, come Escape
      document.body.appendChild(div);
    };
    if (!target) { piece(0, 0, vw, vh); return; }
    const pad = 6;
    const r = target.getBoundingClientRect();
    piece(0, 0, vw, Math.max(0, r.top - pad)); // sopra
    piece(r.bottom + pad, 0, vw, Math.max(0, vh - r.bottom - pad)); // sotto
    piece(r.top - pad, 0, Math.max(0, r.left - pad), r.height + pad * 2); // sinistra
    piece(r.top - pad, r.right + pad, Math.max(0, vw - r.right - pad), r.height + pad * 2); // destra
    target.classList.add('tour-spotlight');
  }

  function positionCard(target) {
    const card = document.getElementById('tour-card');
    if (!target) {
      card.style.top = '50%'; card.style.left = '50%';
      card.style.transform = 'translate(-50%, -50%)';
      return;
    }
    card.style.transform = 'none';
    const r = target.getBoundingClientRect();
    const cardW = 320, cardH = card.offsetHeight || 200;
    let left = r.right + 16;
    if (left + cardW > window.innerWidth - 12) left = Math.max(12, r.left - cardW - 16);
    let top = Math.min(Math.max(12, r.top), window.innerHeight - cardH - 12);
    card.style.left = left + 'px';
    card.style.top = top + 'px';
  }

  function render() {
    const step = STEPS[idx];
    const target = step.target ? step.target() : null;
    if (target) target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    drawCurtain(target);
    document.getElementById('tour-step').textContent = (idx + 1) + ' di ' + STEPS.length;
    document.getElementById('tour-title').textContent = step.title;
    document.getElementById('tour-text').textContent = step.text;
    document.getElementById('tour-prev').hidden = idx === 0;
    document.getElementById('tour-next').textContent = idx === STEPS.length - 1 ? 'Fine' : 'Avanti →';
    requestAnimationFrame(() => positionCard(target));
  }

  function go(newIdx) {
    if (newIdx < 0) return;
    if (newIdx >= STEPS.length) { finish(); return; }
    idx = newIdx;
    render();
  }

  function finish() {
    document.querySelectorAll('.tour-curtain').forEach(el => el.remove());
    document.querySelectorAll('.tour-spotlight').forEach(el => el.classList.remove('tour-spotlight'));
    const card = document.getElementById('tour-card');
    if (card) card.remove();
    document.removeEventListener('keydown', onKeydown);
    if (resizeHandler) { window.removeEventListener('resize', resizeHandler); resizeHandler = null; }
    const sidebar = document.getElementById('sidebar');
    if (sidebar && !wasSidebarOpen) sidebar.classList.remove('open');
    try { localStorage.setItem(DONE_KEY, '1'); } catch (e) { /* niente storage disponibile: il tour ripartirà al prossimo accesso, non è grave */ }
  }

  // Chiamabile in ogni momento (start()), a differenza di maybeStart() —
  // usata dal link "Rifai il tour" in fondo al menu (nav.js).
  function start() {
    ensureDom();
    const sidebar = document.getElementById('sidebar');
    // Su schermi stretti la sidebar è un cassetto chiuso di norma (vedi
    // nav.js/theme.css): va aperta per la durata del tour, altrimenti gli
    // elementi da evidenziare non sono nemmeno visibili. Richiusa alla
    // fine SOLO se non era già aperta (non deve sorprendere chi l'aveva
    // aperta da sé).
    wasSidebarOpen = !!(sidebar && sidebar.classList.contains('open'));
    if (sidebar) sidebar.classList.add('open');
    document.addEventListener('keydown', onKeydown);
    resizeHandler = () => { if (idx >= 0 && idx < STEPS.length) render(); };
    window.addEventListener('resize', resizeHandler);
    go(0);
  }

  // Avviato UNA sola volta per dispositivo/browser (localStorage, come
  // saas_theme) — non per azienda: ogni persona che apre il gestionale per
  // la prima volta su un dispositivo vede il tour, anche se l'azienda è già
  // avviata da tempo (chi si unisce dopo ne ha comunque bisogno).
  function maybeStart() {
    let done = false;
    try { done = localStorage.getItem(DONE_KEY) === '1'; } catch (e) { /* niente storage: mostralo comunque, non è un errore bloccante */ }
    if (done) return;
    // render() della sidebar è sincrono: a questo punto i link ci sono già,
    // nessun timer di attesa necessario.
    if (!document.querySelector('a.navlink[href="dashboard.html"]')) return;
    start();
  }

  global.SaasTour = { maybeStart, start };
})(window);

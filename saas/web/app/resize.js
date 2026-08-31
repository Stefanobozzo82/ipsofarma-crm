/* ============================================================================
 * resize.js — colonne ridimensionabili trascinando il bordo dell'intestazione,
 * stessa funzione già presente nel gestionale originale (makeColsResizable in
 * index.html), riportata qui pari pari — senza la compensazione per lo zoom
 * di pagina, che questo prodotto non usa.
 *
 * La larghezza scelta si ricorda da una visita all'altra (localStorage), con
 * una chiave diversa da quella del gestionale originale ("saas_colWidths"
 * invece di "colWidths"): pagina diversa, stesso dominio — usare la stessa
 * chiave avrebbe fatto leggere/scrivere le preferenze dell'altro prodotto.
 * ============================================================================ */

(function (global) {
  'use strict';

  let COLW = null;
  try { COLW = JSON.parse(localStorage.getItem('saas_colWidths') || '{}'); } catch (e) { COLW = {}; }
  function saveColWidths() {
    try { localStorage.setItem('saas_colWidths', JSON.stringify(COLW)); } catch (e) {}
  }

  // table: l'elemento <table> da rendere ridimensionabile. key: identificatore
  // stabile per ricordare le larghezze di QUESTA tabella (es. 'clienti-elenco').
  function makeColsResizable(table, key) {
    if (!table) return;
    const ths = [...table.querySelectorAll(':scope>thead>tr>th')];
    if (ths.length < 2) return; // niente da ridimensionare con una sola colonna

    const saved = COLW[key] || {};
    // Misura le larghezze naturali PRIMA di passare a table-layout:fixed
    // (altrimenti il browser le ricalcola già "fisse" in modo diverso da
    // come sarebbero venute con table-layout:auto).
    const widths = ths.map((th, i) => saved[i] || th.getBoundingClientRect().width);
    table.style.tableLayout = 'fixed';
    const applyTableWidth = () => { table.style.width = widths.reduce((s, w) => s + w, 0) + 'px'; };

    ths.forEach((th, i) => {
      th.style.width = widths[i] + 'px';
      th.style.boxSizing = 'border-box';
      th.style.position = 'relative';

      // Il testo dell'intestazione non deve poter far crescere la colonna
      // oltre la larghezza scelta: lo avvolgiamo in uno span troncabile.
      // Con table-layout:fixed il motore della tabella ignora overflow/
      // text-overflow messi direttamente sul <th> nel calcolo della
      // larghezza minima — su un elemento normale funziona, quindi questo
      // giro in più serve davvero, non è un dettaglio superfluo.
      const wrap = document.createElement('span');
      wrap.style.cssText = 'display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
      while (th.firstChild) wrap.appendChild(th.firstChild);
      th.appendChild(wrap);

      if (i === ths.length - 1) return; // l'ultima colonna riempie lo spazio residuo: nessuna maniglia
      if (th.classList.contains('check-col')) return; // colonna di selezione multipla: larghezza fissa, non ha senso ridimensionarla

      const handle = document.createElement('span');
      handle.className = 'col-resize-handle';
      th.appendChild(handle);

      // Trascinare la maniglia non deve ordinare la colonna: il gestionale
      // originale prova a evitarlo fermando la propagazione di mousedown e
      // del click sulla maniglia, ma non basta — se il rilascio del mouse
      // avviene fuori dal fazzoletto di 9px della maniglia (praticamente
      // sempre, trascinando), l'evento "click" sintetizzato dal browser
      // parte da un altro elemento dentro il <th> e arriva comunque
      // all'ascoltatore di ordinamento (scoperto collaudando: non un
      // dettaglio ipotetico). Qui si intercetta il click sul <th> stesso,
      // in fase di cattura (prima che l'ascoltatore di ordinamento della
      // pagina, aggiunto in fase di bolla, possa vederlo), e lo si
      // sopprime solo se il click segue davvero un trascinamento appena
      // avvenuto su questa colonna.
      let justResized = false;
      th.addEventListener('click', e => {
        if (justResized) { justResized = false; e.stopPropagation(); e.stopImmediatePropagation(); }
      }, true);

      let startX = 0, startW = 0;
      const onMove = e => {
        const x = e.touches ? e.touches[0].clientX : e.clientX;
        widths[i] = Math.max(40, startW + (x - startX));
        th.style.width = widths[i] + 'px';
        applyTableWidth();
      };
      const onUp = () => {
        handle.classList.remove('active');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.removeEventListener('touchmove', onMove);
        document.removeEventListener('touchend', onUp);
        COLW[key] = COLW[key] || {};
        COLW[key][i] = widths[i];
        saveColWidths();
      };
      const onDown = e => {
        e.preventDefault(); e.stopPropagation();
        justResized = true;
        handle.classList.add('active');
        startX = e.touches ? e.touches[0].clientX : e.clientX;
        startW = widths[i];
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('touchend', onUp);
      };
      handle.addEventListener('mousedown', onDown);
      handle.addEventListener('touchstart', onDown, { passive: false });
    });
    applyTableWidth();
  }

  global.SaasResize = { makeColsResizable };
})(window);

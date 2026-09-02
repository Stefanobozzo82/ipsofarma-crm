/* ============================================================================
 * elenco-cards.js — sotto una certa larghezza (vedi theme.css, stessa soglia
 * di 860px della barra di navigazione in basso) le tabelle degli elenchi
 * diventano schede impilate invece di scorrere in orizzontale: un elenco con
 * 6-10 colonne (fatture, ordini...) non si legge scorrendo di lato su un
 * telefono, mentre una scheda per riga, con l'etichetta accanto al valore,
 * resta leggibile senza pizzicare per ingrandire (Fase 2 del piano app, la
 * parte lasciata esplicitamente per dopo quando è stata fatta la barra in
 * basso — vedi la nota strategica "Da PWA ad app vera" e saas/README.md).
 *
 * Il "come": ogni pagina genera già la propria tabella con <th> di
 * intestazione (spesso ordinabili, vedi th() in ogni modulo) e <td> nello
 * stesso ordine — le etichette per la vista a scheda si leggono da lì una
 * sola volta, invece di doverle scrivere a mano in ogni singolo modulo.
 * Le uniche tabelle escluse sono quelle che restano "vere tabelle" anche su
 * telefono per scelta (righe di un documento — .righe-table — e le anteprime
 * fedeli di un file/email da importare o inviare, che non portano affatto
 * questa classe): la conversione riguarda solo <table class="elenco-table">.
 * ============================================================================ */

(function (global) {
  'use strict';

  // th() in ogni modulo aggiunge una freccia quando la colonna è quella
  // ordinata ("Numero ↓"): l'etichetta della scheda deve restare "Numero".
  function cleanLabel(text) {
    return (text || '').replace(/[↑↓]\s*$/, '').trim();
  }

  function labelizeTable(table) {
    const heads = Array.from(table.querySelectorAll(':scope > thead > tr > th'));
    if (heads.length === 0) return;
    const labels = heads.map(th => cleanLabel(th.textContent));
    table.querySelectorAll(':scope > tbody > tr').forEach(tr => {
      const cells = Array.from(tr.children);
      // Una riga con un'unica cella a colspan pieno è uno stato di
      // caricamento/"nessun risultato" (es. report.html prima che arrivino
      // i dati), non una riga di dati: resta un messaggio centrato, non una
      // scheda con etichette — vedi theme.css, table.elenco-table td[colspan].
      if (cells.length === 1 && cells[0].hasAttribute('colspan')) return;
      cells.forEach((td, i) => {
        if (labels[i]) td.setAttribute('data-label', labels[i]);
        // Una cella "vuota" nella tabella desktop (es. td.actions quando la
        // riga non è selezionata, vedi fatture/ordini/...) in realtà non è
        // mai davvero vuota nell'HTML generato: il template lascia spazi o
        // un a-capo prima del tag di chiusura, quindi il CSS :empty non la
        // riconoscerebbe mai. Qui si marca esplicitamente, così la scheda
        // può nascondere la riga invece di lasciare uno spazio senza senso.
        const isBlank = td.children.length === 0 && td.textContent.trim() === '';
        td.classList.toggle('elenco-blank', isBlank);
      });
    });
  }

  function labelizeAll(root) {
    if (root.matches && root.matches('table.elenco-table')) labelizeTable(root);
    if (root.querySelectorAll) root.querySelectorAll('table.elenco-table').forEach(labelizeTable);
  }

  labelizeAll(document);

  // Ogni pagina ricostruisce il proprio elenco da zero ad ogni filtro,
  // ricerca o ordinamento (di solito area.innerHTML = ...; report.html
  // sostituisce solo il <tbody>) — invece di dover richiamare labelizeAll()
  // a mano da ogni singolo renderList() di ogni modulo, si osserva il DOM e
  // si rietichetta da soli ogni volta che compare una tabella o una riga
  // nuova.
  const mo = new MutationObserver(mutations => {
    for (const m of mutations) {
      m.addedNodes.forEach(node => {
        if (node.nodeType !== 1) return;
        if (node.tagName === 'TABLE' && node.classList.contains('elenco-table')) {
          labelizeTable(node);
          return;
        }
        if (node.querySelectorAll) node.querySelectorAll('table.elenco-table').forEach(labelizeTable);
        // Il nodo aggiunto può essere una riga (o un gruppo di righe) dentro
        // una tabella già esistente, con solo il <tbody> sostituito: risali
        // fino alla tabella più vicina invece di ignorarla.
        if ((node.tagName === 'TR' || node.tagName === 'TD') && node.closest) {
          const table = node.closest('table.elenco-table');
          if (table) labelizeTable(table);
        }
      });
    }
  });
  mo.observe(document.body, { childList: true, subtree: true });

  global.SaasElencoCards = { labelizeAll };
})(window);

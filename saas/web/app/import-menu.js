/* ============================================================================
 * import-menu.js — un solo pulsante "Importa" con dentro i diversi modi di
 * importare, invece di più pulsanti affiancati. Stesso principio già usato
 * per "⬇ Scarica" (vedi app/print.js/bindDownloadMenu, riusata identica qui
 * — stesso menu a tendina, stesso CSS .dl-menu/.dl-list, niente di nuovo).
 *
 * Richiesta reale: "vorrei che il pulsante importa racchiudesse i diversi
 * modi di importare come abbiamo fatto per il pulsante esporta" — prima
 * c'erano fino a 3 pulsanti separati affiancati ("Importa", "📷 Fotocamera",
 * "🖨 Scansiona da PC"), ognuno aggiunto da un modulo diverso
 * (camera-import.js/scan-import.js) senza sapere degli altri.
 *
 * Questo modulo prende il posto del pulsante "Importa" esistente
 * (id="ai-import-btn") avvolgendolo in un menu a tendina, con "📄 Da file
 * (PDF/foto)" come prima voce — lo stesso identico comportamento che il
 * pulsante aveva da solo prima (ogni pagina lo cablava con
 * "$('ai-import-btn').addEventListener('click', () => $('ai-import-file')
 * .click())"; quella riga va tolta dalle pagine, il click ora apre il menu).
 * camera-import.js e scan-import.js, invece di aggiungere un pulsante a sé
 * stante, aggiungono una voce a QUESTO menu tramite addImportOption() —
 * nessuna pagina deve fare altro, funziona per costruzione su ogni pagina
 * con lo stesso pattern id="ai-import-btn"/id="ai-import-file" già usato.
 * ============================================================================ */

(function (global) {
  'use strict';

  function setup() {
    const btn = document.getElementById('ai-import-btn');
    const input = document.getElementById('ai-import-file');
    if (!btn || !input || document.getElementById('ai-import-list')) return;

    // Avvolge il pulsante esistente in un menu a tendina — stessa struttura
    // (.dl-menu/.dl-list) e stesso apri/chiudi (bindDownloadMenu) del
    // pulsante "Scarica": nessun CSS nuovo da aggiungere.
    const menu = document.createElement('div');
    menu.className = 'dl-menu';
    menu.id = 'ai-import-menu';
    btn.replaceWith(menu);
    menu.appendChild(btn);
    const list = document.createElement('div');
    list.className = 'dl-list';
    list.id = 'ai-import-list';
    list.hidden = true;
    menu.appendChild(list);

    // Prima voce, sempre presente: lo stesso comportamento che il pulsante
    // faceva da solo prima di questo modulo. removeAttribute('capture') è
    // per sicurezza — vedi camera-import.js: se si era aperta la fotocamera
    // e si annulla senza scattare, il prossimo giro da qui deve tornare a
    // offrire "Galleria/File", non restare agganciato alla fotocamera.
    addImportOption('📄 Da file (PDF/foto)', () => {
      input.removeAttribute('capture');
      input.click();
    });

    window.SaasPrint.bindDownloadMenu(btn, list);
  }

  // Esposta per camera-import.js/scan-import.js: aggiunge una voce al menu
  // "Importa" invece di un pulsante a sé stante — stessa firma di
  // addEventListener('click', ...) più un id opzionale per la guardia
  // "già aggiunto?" di chi chiama. Ritorna il <button> creato (null se il
  // menu non esiste, es. una pagina senza il pattern ai-import-btn — stessa
  // guardia già usata dagli altri moduli) così chi chiama può disabilitarlo
  // durante un'operazione lunga, come faceva già col proprio pulsante.
  function addImportOption(label, onClick, id) {
    const list = document.getElementById('ai-import-list');
    if (!list) return null;
    const item = document.createElement('button');
    item.type = 'button';
    if (id) item.id = id;
    item.textContent = label;
    if (onClick) item.addEventListener('click', onClick);
    list.appendChild(item);
    return item;
  }

  global.SaasImportMenu = { addImportOption };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
  } else {
    setup();
  }
})(window);

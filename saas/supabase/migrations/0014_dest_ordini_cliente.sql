-- ============================================================================
-- 0014 — Destinazione di consegna anche sugli ordini cliente
--
-- Richiesta reale: "nel vecchio gestionale quando inserivo un ordine potevo
-- scegliere anche la sede di destinazione e lo stesso poteva essere fatto
-- nei DDT e nelle fatture — puoi controllare come era fatto nel vecchio
-- gestionale e riportare questa funzione nel nuovo". ddt e fatture_cliente
-- hanno già dest_id (0003_documenti.sql), ordini_cliente no.
--
-- Verificato sul vecchio gestionale (index.html): la destinazione si
-- sceglie al preventivo/ordine e si propaga da sola lungo tutta la cascata
-- (preventivo → ordine → DDT → fattura, aiGenDDT()/aiGenFT():
-- "destId: oc.destId||null", "destId: ddt.destId||null") — non va ripetuta
-- ad ogni documento, resta comunque modificabile in ciascuno.
--
-- Stesso tipo/nullable di ddt.dest_id/fatture_cliente.dest_id: un id
-- testuale libero (le destinazioni vivono in clienti.dest, jsonb — non una
-- vera FK verso una tabella a sé).
--
-- Backfill necessario: prima che questa colonna esistesse, store.js
-- (docToRow) metteva "destId" — non essendo tra le colonne mappate —
-- dentro "extra" come qualunque altro campo non riconosciuto. 74 ordini
-- reali (importati dal vecchio gestionale, che aveva già questo campo)
-- ce l'hanno già valorizzato lì: senza riportarlo nella colonna vera,
-- rowToDoc() lo sovrascriverebbe silenziosamente con NULL alla prima
-- lettura (il ciclo sulle colonne mappate gira DOPO lo spread di extra),
-- perdendo una destinazione già scelta da un utente reale. Tolto da
-- extra dopo averlo copiato, per non lasciare due fonti della stessa
-- informazione.
-- ============================================================================

alter table ordini_cliente add column dest_id text;

update ordini_cliente
set dest_id = extra->>'destId', extra = extra - 'destId'
where extra ? 'destId' and extra->>'destId' is not null and extra->>'destId' <> '';

-- ============================================================================
-- 0015 — Destinazione di consegna anche sui preventivi
--
-- Seguito di 0014_dest_ordini_cliente.sql ("verifica anche i preventivi"):
-- nel vecchio gestionale (index.html) la destinazione si sceglie già al
-- preventivo, non solo all'ordine, e si propaga da sola quando il
-- preventivo diventa ordine ("destId: pv.destId||null"). ordini_cliente
-- l'ha già (0014); preventivi no.
--
-- Stesso backfill di 0014, per coerenza — verificato sul database reale:
-- qui non ha trovato righe da spostare (0 preventivi con destId già in
-- extra), ma resta corretto tenerlo: un preventivo con quel campo in
-- extra da un import futuro non verrebbe silenziosamente perso.
-- ============================================================================

alter table preventivi add column dest_id text;

update preventivi
set dest_id = extra->>'destId', extra = extra - 'destId'
where extra ? 'destId' and extra->>'destId' is not null and extra->>'destId' <> '';

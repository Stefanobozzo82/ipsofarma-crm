-- Estensioni richieste dallo schema Fido.
-- pgcrypto: gen_random_uuid() per le chiavi primarie.
-- postgis: ricerca geografica (raggio di copertura del sitter, Fase 3).
create extension if not exists pgcrypto;
create extension if not exists postgis;

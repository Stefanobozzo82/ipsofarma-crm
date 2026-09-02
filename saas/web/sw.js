/* ============================================================================
 * sw.js — service worker minimo, in cima a saas/web/ (non in app/) apposta:
 * uno service worker controlla solo la propria cartella e le sottocartelle
 * per default, quindi da qui copre TUTTE le pagine del gestionale invece che
 * solo app/.
 *
 * Esiste solo per soddisfare il requisito di installabilità di Chrome/Edge
 * (manifest + service worker registrato) e permettere così "Installa app" /
 * la finestra a sé senza barra degli indirizzi — vedi manifest.json
 * (display:"standalone") e app/pwa.js (che lo registra).
 *
 * NON fa caching offline: il gestionale ha comunque bisogno della rete per
 * parlare con Supabase (dati, autenticazione, IA...), un'app "offline" qui
 * sarebbe solo un guscio vuoto e ingannevole. Il fetch handler è un
 * passthrough puro — ogni richiesta va alla rete esattamente come se questo
 * file non esistesse.
 * ============================================================================ */

self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (e) => { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', () => { /* passthrough: nessuna risposta dalla cache, va tutto in rete */ });

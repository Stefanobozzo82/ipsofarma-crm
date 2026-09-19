# AI quota and supplier receipt rollout

Scope: migrations 0023 and 0028, their Edge/browser changes, and regression tests. This document describes implemented behavior, not an assertion that a remote deployment has been completed.

## Deploy and validate

1. Use an isolated staging database with the full migration sequence through 0028. Run the migrations as their owner; preserve the existing role/RLS configuration. Do not copy production prompts, provider keys, invoices, or customer data into tests.
2. Coordinate the frontend and `ai-proxy` release: new requests require a UUID `request_id`. The store creates one per invocation; an explicit retry must reuse its original ID and identical payload. Old cached clients must reload. Deploy migration 0023 before enabling the new Edge code: the old Edge implementation cannot insert directly into the hardened ledger, so avoid a prolonged mixed-version interval.
3. Set the existing server-only `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`, and exact `EDGE_ALLOWED_ORIGINS`. Never expose the service key to the web app. Optional `AI_PROVIDER_TIMEOUT_MS` defaults to 60000 and is clamped to 1000–120000 milliseconds.
4. Release the supplier store wrappers and supplier DDT page together with 0028. Older linked-DDT writes now fail with an instruction to use the transactional path. Smoke-test as admin, operator and viewer using staging fixtures, including two tenants.
5. Run `node --test --test-concurrency=1 tests/*.test.cjs` on Node 24+. PGlite exercises PostgreSQL permissions and transactions; its serialized connection is not a substitute for multi-connection contention tests in staging. Provider tests use mocks and send no real email or AI request.

## AI admission and failure policy

`reserve_ai_attempt` locks the company before the membership, matching the membership-management lock order. Both company locks use `FOR NO KEY UPDATE`: they serialize quota/role managers and plan updates while allowing foreign-key `KEY SHARE` checks from document transactions that already hold membership locks. This removes that company/membership lock inversion without weakening membership row locks. [PostgreSQL lock compatibility](https://www.postgresql.org/docs/17/explicit-locking.html#LOCKING-ROWS). Admission verifies membership, checks the current plan and UTC calendar month, and records a reservation atomically. Existing usage rows count toward the limit. Missing plans and database errors fail closed. `finish_ai_attempt` transitions pending attempts to succeeded, failed or unknown. Only `service_role` may execute these two RPCs; direct ledger writes are revoked even from that role. Members retain tenant-scoped read access.

Every admitted attempt consumes quota, including provider rejection, timeout, network uncertainty, and failure to record the final outcome. There is no automatic release or automatic second provider request. This prevents a retry from creating an unbounded cost loop. The ledger contains identifiers, SHA-256 request fingerprint, model, status, timestamps and HTTP status; it stores neither prompts nor provider responses.

A repeated ID with the same actor and normalized payload returns HTTP 409 and the saved status without contacting the provider. Reusing an ID with different data is rejected. A lost successful response cannot be reconstructed from this metadata-only ledger. A crash after reservation can leave an attempt pending and charged; a provider timeout does not prove that the provider stopped work. These cases require explicit reconciliation, not blind replay.

Server-side bounds are 20 MiB request bytes (streamed, not just Content-Length), 200000 text characters, 60 messages, 8 images, 8192 output tokens and 2 MiB provider response bytes. Models are restricted to the two existing configured model names. Image content accepts inline PNG/JPEG/WebP data URLs; arbitrary remote image URLs are rejected. Unknown request fields such as `n`, `stream` and tools are not forwarded. Existing PDF import with 8000 tokens and `reasoning_effort: none` remains supported.

## Supplier receipts

`create_supplier_ddt` commits the supplier DDT, quantity updates on its order, document links, counter changes and replay record in one transaction. It requires the exact expected order rows and locks the order. Each delivery row refers to its original zero-based order index; a missing index is accepted only when its code identifies exactly one order row. Split rows aggregate against one source residual. Duplicate codes never receive the same quantity twice.

An optional existing supplier invoice can be linked in that same transaction after tenant, supplier, order and existing-link checks. The response includes the updated invoice. Receipt creation does not create stock movements.

`change_supplier_ddt` supports updates and admin-only cancellation. It applies the quantity difference and records actor, reason, expected state and result in a private audit/replay table. Cancellation retains the document and its number, marks it cancelled and restores only its recorded contribution. Invoice-linked receipts require invoice correction first. Historical linked receipts without a reliable creation record fail closed instead of guessing a reversal.

The page preserves source indexes through row reading and residual prefill, reuses a creation/update request ID for an unchanged retry, and uses cancellation instead of physical deletion. Direct linked inserts, quantity edits and deletion are blocked. A narrowly permitted `extra.ftfId`-only update keeps the existing supplier invoice-linking path compatible; it does not authorize quantity changes.

## Remaining boundaries

- New supplier DDTs without an order still use the existing standalone save path. Their optional invoice attachment remains a separate write. If it fails, the page explicitly reports that the DDT was saved and the invoice link needs verification; it does not pretend rollback or silently encourage another DDT. Standalone creation is not idempotent.
- The legacy supplier order editor has no stable row identity. Orders with tracked receipts reject structural rewrites, including price/description edits through that old editor, to preserve safe reversal indexes. Existing monotonic manual completion remains supported; a dedicated order-edit RPC is a later step.
- Cancellation is blocked for known invoiced receipts. The supplier invoice generation backend still needs its own full atomic lifecycle and server-side prohibition on attaching cancelled DDTs; the receipt page disables that action, which is not equivalent to a database constraint.
- Replay responses are the original operation result. They are not a fresh read of later unrelated document changes. After replay, refresh current documents before further edits.
- No historical fulfillment rebuild, inventory reconciliation, stock allocation, production migration, or provider billing change is performed by this tranche.

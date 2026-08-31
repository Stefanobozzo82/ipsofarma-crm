-- ============================================================================
-- 0007 — Abbonamenti (Fase 5)
--
-- Lo schema per i pagamenti ricorrenti via Stripe. Non chiama Stripe da
-- nessuna parte in questa migrazione — è solo lo stato che il resto del
-- sistema (Edge Function di checkout e di webhook, in supabase/functions/)
-- legge e scrive. companies.piano esiste già dalla Fase 0
-- (0001_aziende_e_utenti.sql): resta il campo che il gestionale legge per
-- decidere cosa un'azienda può fare — qui aggiungiamo solo i dati necessari
-- a tenerlo sincronizzato con l'abbonamento Stripe reale.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- plans: i piani vendibili. Pubblica (chiunque deve poter vedere i prezzi
-- per decidere se registrarsi), mai scritta dal client.
-- ---------------------------------------------------------------------------
create table plans (
  id text primary key,                    -- 'trial' | 'base' | 'pro' — stesso valore di companies.piano
  nome text not null,
  prezzo_mensile numeric(10,2) not null,
  stripe_price_id text,                   -- null per 'trial' (nessun addebito)
  limite_utenti integer,                  -- null = illimitato
  limite_documenti_mese integer,          -- null = illimitato
  created_at timestamptz not null default now()
);

comment on table plans is 'Catalogo dei piani vendibili. Letta anche da chi non è ancora autenticato (pagina prezzi pubblica).';

alter table plans enable row level security;
create policy "chiunque legge i piani" on plans for select using (true);

insert into plans (id, nome, prezzo_mensile, stripe_price_id, limite_utenti, limite_documenti_mese) values
  ('trial', 'Prova gratuita', 0, null, 2, 50),
  ('base', 'Base', 29, null, 5, null),
  ('pro', 'Pro', 79, null, null, null);
comment on column plans.stripe_price_id is 'Da valorizzare con l''id reale del prezzo Stripe (price_...) quando i piani a pagamento vengono creati nella dashboard Stripe — vuoto finché non esiste un account.';

-- ---------------------------------------------------------------------------
-- companies: i dati dell'abbonamento reale, tenuti sincronizzati dal webhook
-- Stripe (mai scritti direttamente dal client — solo letti).
-- ---------------------------------------------------------------------------
alter table companies add column if not exists stripe_customer_id text;
alter table companies add column if not exists stripe_subscription_id text;
alter table companies add column if not exists subscription_status text;
alter table companies add column if not exists current_period_end timestamptz;

comment on column companies.subscription_status is 'Rispecchia lo stato Stripe della subscription: trialing, active, past_due, canceled, ecc. — scritto solo dal webhook.';
comment on column companies.current_period_end is 'Fine del periodo di fatturazione corrente, secondo Stripe.';

create unique index if not exists idx_companies_stripe_customer on companies (stripe_customer_id) where stripe_customer_id is not null;
create unique index if not exists idx_companies_stripe_subscription on companies (stripe_subscription_id) where stripe_subscription_id is not null;

comment on column companies.piano is 'Il piano EFFETTIVO che il gestionale applica (limiti, funzioni). Aggiornato dal webhook Stripe in base a stripe_price_id -> plans.id; il client non lo scrive mai direttamente.';

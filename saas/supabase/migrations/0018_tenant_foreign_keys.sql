-- 0018: isolamento tenant sulle relazioni SQL esistenti.
-- Additiva: nessuna modifica/cancellazione dei dati storici o delle vecchie FK.
-- PostgreSQL >= 15: SET NULL (colonna) preserva company_id NOT NULL.
-- NOT VALID rinvia la scansione dello storico, ma controlla nuove chiavi.
-- Prima di validare: saas/docs/TENANT_FK_ROLLOUT.md.

create unique index fornitori_tenant_id_uidx on public.fornitori (company_id, id);
create unique index clienti_tenant_id_uidx on public.clienti (company_id, id);
create unique index ordini_cliente_tenant_id_uidx on public.ordini_cliente (company_id, id);
create unique index preventivi_tenant_id_uidx on public.preventivi (company_id, id);
create unique index ddt_tenant_id_uidx on public.ddt (company_id, id);
create unique index ordini_fornitore_tenant_id_uidx on public.ordini_fornitore (company_id, id);
create unique index ddt_fornitore_tenant_id_uidx on public.ddt_fornitore (company_id, id);
create unique index fatture_cliente_tenant_id_uidx on public.fatture_cliente (company_id, id);
create unique index fatture_fornitore_tenant_id_uidx on public.fatture_fornitore (company_id, id);
create unique index prodotti_tenant_id_uidx on public.prodotti (company_id, id);
create unique index depositi_tenant_id_uidx on public.depositi (company_id, id);

alter table public.prodotti
  add constraint prodotti_fornitore_id_tenant_fkey
  foreign key (company_id, fornitore_id) references public.fornitori (company_id, id)
  on delete no action not valid;

alter table public.preventivi
  add constraint preventivi_cliente_id_tenant_fkey
  foreign key (company_id, cliente_id) references public.clienti (company_id, id)
  on delete set null (cliente_id) not valid;

alter table public.preventivi
  add constraint preventivi_oc_id_tenant_fkey
  foreign key (company_id, oc_id) references public.ordini_cliente (company_id, id)
  on delete set null (oc_id) not valid;

alter table public.ordini_cliente
  add constraint ordini_cliente_cliente_id_tenant_fkey
  foreign key (company_id, cliente_id) references public.clienti (company_id, id)
  on delete no action not valid;

alter table public.ordini_cliente
  add constraint ordini_cliente_prev_id_tenant_fkey
  foreign key (company_id, prev_id) references public.preventivi (company_id, id)
  on delete set null (prev_id) not valid;

alter table public.ordini_fornitore
  add constraint ordini_fornitore_fornitore_id_tenant_fkey
  foreign key (company_id, fornitore_id) references public.fornitori (company_id, id)
  on delete no action not valid;

alter table public.ddt
  add constraint ddt_cliente_id_tenant_fkey
  foreign key (company_id, cliente_id) references public.clienti (company_id, id)
  on delete no action not valid;

alter table public.ddt
  add constraint ddt_oc_id_tenant_fkey
  foreign key (company_id, oc_id) references public.ordini_cliente (company_id, id)
  on delete set null (oc_id) not valid;

alter table public.fatture_cliente
  add constraint fatture_cliente_cliente_id_tenant_fkey
  foreign key (company_id, cliente_id) references public.clienti (company_id, id)
  on delete no action not valid;

alter table public.fatture_cliente
  add constraint fatture_cliente_ddt_id_tenant_fkey
  foreign key (company_id, ddt_id) references public.ddt (company_id, id)
  on delete set null (ddt_id) not valid;

alter table public.fatture_cliente
  add constraint fatture_cliente_oc_id_tenant_fkey
  foreign key (company_id, oc_id) references public.ordini_cliente (company_id, id)
  on delete set null (oc_id) not valid;

alter table public.fatture_fornitore
  add constraint fatture_fornitore_fornitore_id_tenant_fkey
  foreign key (company_id, fornitore_id) references public.fornitori (company_id, id)
  on delete no action not valid;

alter table public.fatture_fornitore
  add constraint fatture_fornitore_of_id_tenant_fkey
  foreign key (company_id, of_id) references public.ordini_fornitore (company_id, id)
  on delete set null (of_id) not valid;

alter table public.fatture_fornitore
  add constraint fatture_fornitore_ddtf_id_tenant_fkey
  foreign key (company_id, ddtf_id) references public.ddt_fornitore (company_id, id)
  on delete set null (ddtf_id) not valid;

alter table public.note_credito
  add constraint note_credito_cliente_id_tenant_fkey
  foreign key (company_id, cliente_id) references public.clienti (company_id, id)
  on delete no action not valid;

alter table public.note_credito
  add constraint note_credito_fattura_id_tenant_fkey
  foreign key (company_id, fattura_id) references public.fatture_cliente (company_id, id)
  on delete set null (fattura_id) not valid;

alter table public.note_credito_fornitore
  add constraint note_credito_fornitore_fornitore_id_tenant_fkey
  foreign key (company_id, fornitore_id) references public.fornitori (company_id, id)
  on delete no action not valid;

alter table public.note_credito_fornitore
  add constraint note_credito_fornitore_fattura_id_tenant_fkey
  foreign key (company_id, fattura_id) references public.fatture_fornitore (company_id, id)
  on delete set null (fattura_id) not valid;

alter table public.movimenti_magazzino
  add constraint movimenti_magazzino_prodotto_id_tenant_fkey
  foreign key (company_id, prodotto_id) references public.prodotti (company_id, id)
  on delete cascade not valid;

alter table public.movimenti_magazzino
  add constraint movimenti_magazzino_deposito_id_tenant_fkey
  foreign key (company_id, deposito_id) references public.depositi (company_id, id)
  on delete restrict not valid;

alter table public.ddt_fornitore
  add constraint ddt_fornitore_fornitore_id_tenant_fkey
  foreign key (company_id, fornitore_id) references public.fornitori (company_id, id)
  on delete no action not valid;

alter table public.ddt_fornitore
  add constraint ddt_fornitore_of_id_tenant_fkey
  foreign key (company_id, of_id) references public.ordini_fornitore (company_id, id)
  on delete set null (of_id) not valid;



-- ============================================================================
-- 0005 — Registrazione self-service di una nuova azienda
--
-- Un utente appena autenticato non ha ancora nessuna membership, quindi le
-- policy RLS della migrazione 0001 gli impediscono di scrivere sia su
-- companies sia su memberships — di proposito: nessuno può auto-nominarsi
-- admin di un'azienda a caso. register_company() è l'unico varco: crea
-- l'azienda e la prima membership (admin, l'utente stesso) in una sola
-- transazione atomica, cosi' non può mai esistere un'azienda senza il suo
-- primo amministratore o viceversa.
-- ============================================================================

create or replace function register_company(p_nome text, p_slug text)
returns table (company_id uuid, slug text, role text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_company_id uuid;
begin
  if v_uid is null then
    raise exception 'devi effettuare l''accesso prima di registrare un''azienda';
  end if;
  if p_nome is null or length(trim(p_nome)) = 0 then
    raise exception 'il nome dell''azienda non può essere vuoto';
  end if;
  if p_slug !~ '^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$' then
    raise exception 'l''indirizzo azienda può contenere solo lettere minuscole, numeri e trattini (3-50 caratteri)';
  end if;

  insert into companies (nome, slug) values (trim(p_nome), p_slug)
  returning id into v_company_id;

  insert into memberships (company_id, user_id, role)
  values (v_company_id, v_uid, 'admin');

  return query select v_company_id, p_slug, 'admin'::text;
exception
  when unique_violation then
    raise exception 'questo indirizzo azienda è già in uso, scegline un altro';
end;
$$;

grant execute on function register_company(text, text) to authenticated;

comment on function register_company(text, text) is
  'Unico punto di ingresso per creare un''azienda: crea companies + la prima membership (admin, il chiamante) in una transazione atomica. Chiamata dal client via supabase.rpc(''register_company'', {p_nome, p_slug}).';

-- ---------------------------------------------------------------------------
-- my_memberships: a quali aziende appartiene l'utente collegato, con che
-- ruolo. Il client la interroga subito dopo il login per decidere se
-- mostrare "crea la tua azienda" oppure aprire direttamente il gestionale.
--
-- security_invoker = true: la vista viene valutata con i permessi e il
-- contesto RLS di chi la interroga (non del suo creatore) — pratica
-- raccomandata da Supabase per le viste sopra tabelle protette da RLS.
-- Il filtro esplicito "where m.user_id = auth.uid()" la rende comunque
-- corretta anche a prescindere da questo dettaglio.
-- ---------------------------------------------------------------------------
create or replace view my_memberships
with (security_invoker = true) as
  select m.company_id, c.nome as company_nome, c.slug as company_slug, m.role
  from memberships m
  join companies c on c.id = m.company_id
  where m.user_id = auth.uid();

grant select on my_memberships to authenticated;

comment on view my_memberships is
  'Le aziende a cui appartiene l''utente collegato, con il ruolo in ciascuna. Prima query del client dopo ogni login.';

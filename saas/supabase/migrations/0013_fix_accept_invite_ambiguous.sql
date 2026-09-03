-- ============================================================================
-- 0013 — Corregge accept_invite(): "column reference company_id is ambiguous"
--
-- Bug reale, segnalato da un utente mentre accettava un invito appena
-- creato: "Non sono riuscito ad accettare l'invito: column reference
-- 'company_id' is ambiguous".
--
-- accept_invite() dichiara RETURNS TABLE (company_id uuid, company_nome
-- text, role text) — quei nomi di colonna d'uscita diventano ANCHE
-- variabili visibili in tutto il corpo della funzione (una particolarità
-- di PL/pgSQL). Il corpo, per registrare l'appartenenza all'azienda, fa:
--
--   insert into memberships (company_id, user_id, role)
--   values (...)
--   on conflict (company_id, user_id) do update set role = excluded.role;
--
-- "on conflict (company_id, user_id)" nomina le COLONNE del vincolo, non
-- il vincolo stesso — e PL/pgSQL non riusciva più a stabilire se
-- "company_id" lì dentro fosse la colonna della tabella memberships o la
-- variabile d'uscita della funzione con lo stesso nome: da qui
-- l'ambiguità, ad ogni singola chiamata (mai un caso limite, sempre
-- riproducibile).
--
-- Corretto nominando il VINCOLO invece delle sue colonne ("on conflict ON
-- CONSTRAINT nome_vincolo") — sintassi che non ha bisogno di nominare
-- "company_id" da nessuna parte, quindi elimina l'ambiguità alla radice.
-- Non si tocca invece l'uscita pubblica della funzione (i nomi in RETURNS
-- TABLE): saas/web/index.html legge data.company_id/company_nome/role dal
-- risultato della RPC, cambiarli avrebbe rotto il client per niente.
-- ============================================================================

create or replace function accept_invite(p_token uuid)
returns table (company_id uuid, company_nome text, role text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_invite invites;
begin
  if v_uid is null then
    raise exception 'devi effettuare l''accesso prima di accettare un invito';
  end if;
  select email into v_email from auth.users where id = v_uid;

  select * into v_invite from invites where token = p_token and accepted_at is null;
  if v_invite is null then
    raise exception 'invito non valido o già usato';
  end if;
  if lower(v_email) <> v_invite.email then
    raise exception 'questo invito è per %, non per %', v_invite.email, v_email;
  end if;

  insert into memberships (company_id, user_id, role)
  values (v_invite.company_id, v_uid, v_invite.role)
  on conflict on constraint memberships_company_id_user_id_key do update set role = excluded.role;

  update invites set accepted_at = now(), accepted_by = v_uid where id = v_invite.id;

  return query select c.id, c.nome, v_invite.role from companies c where c.id = v_invite.company_id;
end;
$$;

grant execute on function accept_invite(uuid) to authenticated;

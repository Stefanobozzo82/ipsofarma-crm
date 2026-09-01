-- ============================================================================
-- 0010 — Corregge list_members(): mancata corrispondenza di tipo
--
-- Bug reale, trovato mentre l'utente segnalava "non vedo 'Invita una
-- persona'" nella scheda Team: list_members() dichiara "email text" nel
-- RETURNS TABLE, ma legge auth.users.email, che è varchar(255), non text.
-- Un RETURN QUERY in PL/pgSQL richiede una corrispondenza di tipo ESATTA
-- (non solo compatibile/castabile), quindi ogni chiamata falliva con
-- SQLSTATE 42804 ("structure of query does not match function result
-- type") — mappato da PostgREST a HTTP 400.
--
-- L'effetto lato pagina era silenzioso: impostazioni-azienda.html chiama
-- renderTeam() senza await/catch, quindi il fallimento di store.listMembers()
-- (dentro un Promise.all) interrompeva la funzione PRIMA della riga che
-- mostra "invite-admin-area" — nessun messaggio d'errore, la sezione
-- restava semplicemente invisibile, per qualunque admin.
-- ============================================================================

create or replace function list_members(p_company_id uuid)
returns table (user_id uuid, email text, role text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_member(p_company_id) then
    raise exception 'non fai parte di questa azienda';
  end if;
  return query
    select m.user_id, u.email::text, m.role, m.created_at
    from memberships m join auth.users u on u.id = m.user_id
    where m.company_id = p_company_id
    order by m.created_at;
end;
$$;

grant execute on function list_members(uuid) to authenticated;

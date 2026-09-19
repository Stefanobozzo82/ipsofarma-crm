-- Do not depend on project-wide auto-exposure defaults for the Data API.
-- Table permissions and RLS are separate, both are required on fresh projects.
revoke create on schema public from public,anon,authenticated;
grant usage on schema public to anon,authenticated,service_role;
do $$
declare t text;
begin
  foreach t in array array['clienti','fornitori','prodotti','preventivi','ordini_cliente',
    'ordini_fornitore','ddt','ddt_fornitore','fatture_cliente','fatture_fornitore',
    'note_credito','note_credito_fornitore','depositi','movimenti_magazzino'] loop
    if not (select relrowsecurity from pg_class where oid=format('public.%I',t)::regclass) then
      raise exception 'RLS richiesta sulla tabella % prima dei permessi API',t;
    end if;
    execute format('revoke all on public.%I from public,anon',t);
    execute format('grant select,insert,update,delete on public.%I to authenticated',t);
  end loop;
end;
$$;
grant select on public.companies,public.memberships,public.invites,public.ai_usage,
  public.document_counters,public.my_memberships,public.giacenze to authenticated;
grant select on public.plans to anon,authenticated;
-- No privileges are restored on private ledgers, protected company columns,
-- membership writes or AI writes; those remain domain-RPC-only.
notify pgrst,'reload schema';

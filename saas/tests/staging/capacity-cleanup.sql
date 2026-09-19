begin;
do $$begin
 if exists(select 1 from public.companies where id='991b0000-0000-4000-8000-000000000010' and slug<>'codex-ai-capacity-fixture') or exists(select 1 from public.companies where id='991b0000-0000-4000-8000-000000000011' and slug<>'codex-invite-capacity-fixture') then raise exception 'fixture company identity mismatch';end if;
 if exists(select 1 from auth.users where id='991b0000-0000-4000-8000-000000000001' and email<>'codex-capacity@example.invalid') then raise exception 'fixture user identity mismatch';end if;
end$$;
delete from public.companies where (id='991b0000-0000-4000-8000-000000000010' and slug='codex-ai-capacity-fixture') or (id='991b0000-0000-4000-8000-000000000011' and slug='codex-invite-capacity-fixture');
delete from auth.users where id='991b0000-0000-4000-8000-000000000001' and email='codex-capacity@example.invalid';
commit;

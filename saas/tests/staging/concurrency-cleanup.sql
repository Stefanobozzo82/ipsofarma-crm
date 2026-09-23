-- Only these dedicated IDs AND expected identity labels. No arbitrary table cleanup.
begin;
do $$begin
 if exists(select 1 from public.companies where id='991a0000-0000-4000-8000-000000000010' and slug<>'codex-concurrency-fixture') then raise exception 'fixture identity mismatch';end if;
 if exists(select 1 from auth.users where id='991a0000-0000-4000-8000-000000000001' and email<>'codex-concurrency@example.invalid') then raise exception 'fixture user mismatch';end if;
end$$;
delete from public.companies where id='991a0000-0000-4000-8000-000000000010' and slug='codex-concurrency-fixture';
delete from auth.users where id='991a0000-0000-4000-8000-000000000001' and email='codex-concurrency@example.invalid';
commit;

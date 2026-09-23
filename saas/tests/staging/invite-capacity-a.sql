begin;
set local statement_timeout='20s';
-- Owner locks company; then real authenticated context invokes admission.
select id from public.companies where id='991b0000-0000-4000-8000-000000000011' for update;
set local role authenticated;
select set_config('request.jwt.claim.sub','991b0000-0000-4000-8000-000000000001',true);
select pg_sleep(4);
select public.create_invite('991b0000-0000-4000-8000-000000000011','codex-last-seat-a@example.invalid','operatore');
commit;

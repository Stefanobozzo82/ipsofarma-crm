begin;
set local statement_timeout='20s';
set local role service_role;
-- Hold the actual admission mutex before B starts.
select id from public.companies where id='991b0000-0000-4000-8000-000000000010' for update;
select pg_sleep(4);
do $$declare result jsonb;begin
 result:=public.reserve_ai_attempt('991b0000-0000-4000-8000-000000000010','991b0000-0000-4000-8000-000000000001','991b0000-0000-4000-8000-000000000040',repeat('a',64),'gemini-2.5-flash');
 if result->>'reserved' is distinct from 'true' then raise exception 'A expected final quota reservation: %',result;end if;
end$$;
commit;

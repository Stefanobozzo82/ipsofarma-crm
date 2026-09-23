begin;
set local statement_timeout='20s';
set local role service_role;
do $$declare result jsonb;begin
 result:=public.reserve_ai_attempt('991b0000-0000-4000-8000-000000000010','991b0000-0000-4000-8000-000000000001','991b0000-0000-4000-8000-000000000041',repeat('b',64),'gemini-2.5-flash');
 if result->>'reason' is distinct from 'quota' or result->>'allowed' is distinct from 'false' then raise exception 'B expected quota denial: %',result;end if;
end$$;
commit;

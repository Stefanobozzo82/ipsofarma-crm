begin;
set local statement_timeout='20s';
set local role authenticated;
select set_config('request.jwt.claim.sub','991b0000-0000-4000-8000-000000000001',true);
do $$declare denied boolean:=false;begin
 begin perform public.create_invite('991b0000-0000-4000-8000-000000000011','codex-last-seat-b@example.invalid','operatore');
 exception when raise_exception then
  if SQLERRM not like '%limite utenti%' then raise;end if;
  denied:=true;
 end;
 if not denied then raise exception 'B expected final seat denial';end if;
end$$;
commit;

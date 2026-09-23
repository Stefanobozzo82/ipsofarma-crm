-- STAGING ONLY: ffjzhtzavkuwysmabmds. Run as the authorized DB owner.
-- Uses the real auth schema/roles; sends no mail and calls no external provider.
-- Every row and fixture is rolled back. Never remove BEGIN/ROLLBACK.
begin;
set local statement_timeout='30s';
set local lock_timeout='5s';
create temporary table smoke_state(k text primary key,v jsonb);
grant all on smoke_state to authenticated,service_role;
create function pg_temp.assert_true(ok boolean,label text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'SMOKE ASSERTION: %',label;end if;end$$;

-- Deliberate INSERT, not UPSERT: an unexpected existing ID fails safely.
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change_token_new,email_change)
select id::uuid,'00000000-0000-0000-0000-000000000000','authenticated','authenticated',email,'',now(),'{"provider":"email","providers":["email"]}','{}',now(),now(),'','','',''
from(values
 ('99190000-0000-4000-8000-000000000001','codex-smoke-admin@example.invalid'),
 ('99190000-0000-4000-8000-000000000002','codex-smoke-invite@example.invalid'),
 ('99190000-0000-4000-8000-000000000003','codex-smoke-other@example.invalid')) u(id,email);
insert into public.companies(id,slug,nome,piano) values
 ('99190000-0000-4000-8000-000000000010','codex-rollback-smoke-a','Codex rollback fixture A','pro'),
 ('99190000-0000-4000-8000-000000000011','codex-rollback-smoke-b','Codex rollback fixture B','trial');
insert into public.memberships(company_id,user_id,role) values
 ('99190000-0000-4000-8000-000000000010','99190000-0000-4000-8000-000000000001','admin'),
 ('99190000-0000-4000-8000-000000000011','99190000-0000-4000-8000-000000000003','admin');
insert into public.clienti(id,company_id,nome) values
 ('99190000-0000-4000-8000-000000000020','99190000-0000-4000-8000-000000000010','Synthetic customer');
insert into public.ordini_cliente(id,company_id,num,data,cliente_id,righe) values
 ('99190000-0000-4000-8000-000000000030','99190000-0000-4000-8000-000000000010','SMOKE-OC',current_date,'99190000-0000-4000-8000-000000000020','[{"cod":"A","qty":10,"prezzo":2,"iva":22}]');
insert into smoke_state select 'order',to_jsonb(o) from public.ordini_cliente o where id='99190000-0000-4000-8000-000000000030';

set local role authenticated;
select set_config('request.jwt.claim.sub','99190000-0000-4000-8000-000000000001',true);
select pg_temp.assert_true((select count(*)=1 from public.companies where id in ('99190000-0000-4000-8000-000000000010','99190000-0000-4000-8000-000000000011')),'RLS isolates companies');
do $$declare denied boolean:=false;begin
 begin update public.companies set piano='base' where id='99190000-0000-4000-8000-000000000010';exception when insufficient_privilege then denied:=true;end;
 perform pg_temp.assert_true(denied,'client cannot change subscription columns');
 denied:=false;
 begin insert into public.memberships(company_id,user_id,role) values('99190000-0000-4000-8000-000000000010','99190000-0000-4000-8000-000000000002','admin');exception when insufficient_privilege then denied:=true;end;
 perform pg_temp.assert_true(denied,'direct membership insertion denied');
end$$;
do $$declare o jsonb;out jsonb; snap jsonb; failed boolean:=false;begin
 select v into o from smoke_state where k='order';
 out:=public.create_customer_ddt((o->>'company_id')::uuid,(o->>'id')::uuid,'99190000-0000-4000-8000-000000000040',o->'righe',jsonb_build_object('cliente_id',o->'cliente_id','data',current_date::text,'righe','[{"cod":"A","qty":4,"source_order_index":0}]'::jsonb));
 perform pg_temp.assert_true((out#>>'{ordine,righe,0,qtyEv}')::numeric=4,'DDT increments quantity');
 insert into smoke_state values('ddt',out->'ddt');
 snap:=jsonb_build_object('num',o->'num','data',o->'data','cliente_id',o->'cliente_id','dest_id',o->'dest_id','righe',o->'righe','extra',o->'extra');
 begin perform public.update_customer_order((o->>'company_id')::uuid,(o->>'id')::uuid,snap,snap);exception when others then failed:=true;end;
 perform pg_temp.assert_true(failed,'stale order snapshot rejected');
end$$;
do $$declare d jsonb;snap jsonb;doc jsonb;out jsonb;begin
 select v into d from smoke_state where k='ddt';
 snap:=jsonb_build_object('num',d->'num','data',d->'data','cliente_id',d->'cliente_id','oc_id',d->'oc_id','dest_id',d->'dest_id','righe',d->'righe','extra',d->'extra');
 doc:=jsonb_set(snap,'{righe,0,qty}','3');
 out:=public.change_customer_ddt((d->>'company_id')::uuid,(d->>'id')::uuid,'99190000-0000-4000-8000-000000000041','update',snap,doc,'Synthetic correction');
 perform pg_temp.assert_true((out#>>'{ordine,righe,0,qtyEv}')::numeric=3,'DDT correction updates quantity');
 d:=out->'ddt';snap:=jsonb_build_object('num',d->'num','data',d->'data','cliente_id',d->'cliente_id','oc_id',d->'oc_id','dest_id',d->'dest_id','righe',d->'righe','extra',d->'extra');
 out:=public.change_customer_ddt((d->>'company_id')::uuid,(d->>'id')::uuid,'99190000-0000-4000-8000-000000000042','cancel',snap,'{}','Synthetic cancellation');
 perform pg_temp.assert_true((out#>>'{ordine,righe,0,qtyEv}')::numeric=0,'cancellation reverses quantity');
 insert into smoke_state values('current_order',out->'ordine');
end$$;
do $$declare o jsonb;d jsonb;out jsonb;expected jsonb;begin
 select v into o from smoke_state where k='current_order';
 out:=public.create_customer_ddt((o->>'company_id')::uuid,(o->>'id')::uuid,'99190000-0000-4000-8000-000000000043',o->'righe',jsonb_build_object('cliente_id',o->'cliente_id','data',current_date::text,'righe','[{"cod":"A","qty":2,"source_order_index":0}]'::jsonb));
 d:=out->'ddt';expected:=jsonb_build_object('cliente_id',d->'cliente_id','oc_id',d->'oc_id','righe',d->'righe','extra',jsonb_build_object('ftId',null,'annullato',false));
 out:=public.create_customer_invoice((o->>'company_id')::uuid,(d->>'id')::uuid,'99190000-0000-4000-8000-000000000044',expected,jsonb_build_object('cliente_id',d->'cliente_id','oc_id',d->'oc_id','data',current_date::text,'righe','[{"cod":"A","qty":2,"prezzo":2,"source_ddt_index":0}]'::jsonb));
 perform pg_temp.assert_true(out#>>'{ddt,extra,ftId}'=out#>>'{fattura,num}','invoice links match');
 perform pg_temp.assert_true((out#>>'{ordine,righe,0,qtyEv}')::numeric=2,'invoice preserves delivery quantity');
end$$;
insert into smoke_state select 'invite',to_jsonb(i) from public.create_invite('99190000-0000-4000-8000-000000000010','codex-smoke-invite@example.invalid','operatore') i;
select set_config('request.jwt.claim.sub','99190000-0000-4000-8000-000000000002',true);
do $$declare token uuid;begin
 select (v->>'token')::uuid into token from smoke_state where k='invite';
 perform public.accept_invite(token);
 perform pg_temp.assert_true(public.is_member('99190000-0000-4000-8000-000000000010'),'verified email accepts invite');
end$$;
reset role;
set local role service_role;
do $$declare out jsonb;begin
 out:=public.reserve_ai_attempt('99190000-0000-4000-8000-000000000010','99190000-0000-4000-8000-000000000002','99190000-0000-4000-8000-000000000050',repeat('a',64),'gemini-2.5-flash');
 perform pg_temp.assert_true(out->>'reserved'='true','service reserves quota');
 perform public.finish_ai_attempt('99190000-0000-4000-8000-000000000010','99190000-0000-4000-8000-000000000002','99190000-0000-4000-8000-000000000050','succeeded',200);
 out:=public.reserve_ai_attempt('99190000-0000-4000-8000-000000000010','99190000-0000-4000-8000-000000000002','99190000-0000-4000-8000-000000000050',repeat('a',64),'gemini-2.5-flash');
 perform pg_temp.assert_true(out->>'reserved'='false','quota retry does not reserve twice');
end$$;
reset role;
select 'rollback smoke passed; rolling back all fixtures' as result;
rollback;

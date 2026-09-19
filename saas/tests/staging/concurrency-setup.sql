-- STAGING ONLY. Committed, dedicated synthetic fixtures for separate connections.
begin;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change_token_new,email_change)
values('991a0000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','codex-concurrency@example.invalid','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now(),'','','','');
insert into public.companies(id,slug,nome,piano) values('991a0000-0000-4000-8000-000000000010','codex-concurrency-fixture','Codex concurrency fixture','pro');
insert into public.memberships(company_id,user_id,role) values('991a0000-0000-4000-8000-000000000010','991a0000-0000-4000-8000-000000000001','admin');
insert into public.clienti(id,company_id,nome) values('991a0000-0000-4000-8000-000000000020','991a0000-0000-4000-8000-000000000010','Synthetic concurrency customer');
insert into public.ordini_cliente(id,company_id,num,data,cliente_id,righe) values('991a0000-0000-4000-8000-000000000030','991a0000-0000-4000-8000-000000000010','CONCURRENCY-OC',current_date,'991a0000-0000-4000-8000-000000000020','[{"cod":"A","qty":10}]');
commit;

-- STAGING ONLY: two isolated tenants; shared plan configuration is read-only.
begin;
insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change_token_new,email_change)
values('991b0000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','codex-capacity@example.invalid','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now(),'','','','');
insert into public.companies(id,slug,nome,piano) values
('991b0000-0000-4000-8000-000000000010','codex-ai-capacity-fixture','Codex AI capacity fixture','trial'),
('991b0000-0000-4000-8000-000000000011','codex-invite-capacity-fixture','Codex invite capacity fixture','trial');
insert into public.memberships(company_id,user_id,role) values
('991b0000-0000-4000-8000-000000000010','991b0000-0000-4000-8000-000000000001','admin'),
('991b0000-0000-4000-8000-000000000011','991b0000-0000-4000-8000-000000000001','admin');
do $$declare ai_limit integer;member_limit integer;begin
 select limite_ai_mese,limite_utenti into ai_limit,member_limit from public.plans where id='trial';
 if ai_limit is null or ai_limit<1 or ai_limit>1000 or member_limit is null or member_limit<2 or member_limit>100 then raise exception 'trial limits unsupported for capacity fixture; do not alter shared plan';end if;
 insert into public.ai_usage(company_id,created_at,status)
 select '991b0000-0000-4000-8000-000000000010',now(),'succeeded' from generate_series(1,ai_limit-1);
 -- Admin already occupies one seat. Reserve all but the last free seat.
 insert into public.invites(company_id,email,role,created_by,expires_at)
 select '991b0000-0000-4000-8000-000000000011','codex-seed-'||n||'@example.invalid','operatore','991b0000-0000-4000-8000-000000000001',now()+interval '1 day'
 from generate_series(1,member_limit-2) n;
end$$;
commit;

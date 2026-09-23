do $$declare limit_ai integer;limit_members integer;begin
 select limite_ai_mese,limite_utenti into limit_ai,limit_members from public.plans where id='trial';
 if (select count(*) from public.ai_usage where company_id='991b0000-0000-4000-8000-000000000010')<>limit_ai then raise exception 'AI count must equal limit';end if;
 if (select count(*) from public.ai_usage where company_id='991b0000-0000-4000-8000-000000000010' and request_id is not null)<>1 then raise exception 'exactly one AI request admitted';end if;
 if (select count(*) from public.invites where company_id='991b0000-0000-4000-8000-000000000011')<>limit_members-1 then raise exception 'members plus invites must equal limit';end if;
 if (select count(*) from public.invites where company_id='991b0000-0000-4000-8000-000000000011' and email in ('codex-last-seat-a@example.invalid','codex-last-seat-b@example.invalid'))<>1 then raise exception 'exactly one contender invite admitted';end if;
end$$;
select 'AI and membership capacity invariants passed' as result;

do $$begin
 if (select count(*) from public.ddt where company_id='991a0000-0000-4000-8000-000000000010')<>1 then raise exception 'expected exactly one DDT';end if;
 if (select (righe->0->>'qtyEv')::numeric from public.ordini_cliente where id='991a0000-0000-4000-8000-000000000030') is distinct from 10::numeric then raise exception 'expected delivered quantity 10';end if;
 if (select count(*) from public.customer_ddt_operations where company_id='991a0000-0000-4000-8000-000000000010')<>1 then raise exception 'expected exactly one operation';end if;
end$$;
select 'concurrency invariants passed' as result;

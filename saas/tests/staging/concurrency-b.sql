-- Expected: blocks behind worker A then fails stale snapshot. Nonzero exit is expected.
begin;
set local statement_timeout='20s';
set local role authenticated;
select set_config('request.jwt.claim.sub','991a0000-0000-4000-8000-000000000001',true);
select public.create_customer_ddt('991a0000-0000-4000-8000-000000000010','991a0000-0000-4000-8000-000000000030','991a0000-0000-4000-8000-000000000041','[{"cod":"A","qty":10}]',jsonb_build_object('cliente_id','991a0000-0000-4000-8000-000000000020','data',current_date::text,'righe','[{"cod":"A","qty":10,"source_order_index":0}]'::jsonb));
commit;

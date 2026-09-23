-- Preserve number-based historical credit links during invoice renumbering.
create or replace function public.guard_invoice_credit_integrity() returns trigger
language plpgsql security definer set search_path='' as $$
declare kind text;notes text;partykey text;n jsonb;linked boolean:=false;credit numeric;
begin
 kind:=case TG_TABLE_NAME when 'fatture_cliente' then 'customer' else 'supplier' end;
 notes:=case kind when 'customer' then 'note_credito' else 'note_credito_fornitore' end;
 partykey:=case kind when 'customer' then 'cliente_id' else 'fornitore_id' end;
 -- Privileged maintenance without an end-user identity can clean test fixtures.
 if TG_OP='DELETE' and auth.uid() is null then return old;end if;
 if TG_OP='UPDATE' and new.num is distinct from old.num then
  for n in execute format('select to_jsonb(n) from public.%I n where company_id=$1 and fattura_id is null',notes) using old.company_id loop
   -- Inspect references directly: cancelled or unresolved multi-invoice notes
   -- must not lose their last usable historical link when the invoice is renamed.
   if (kind='customer' and (n#>>'{extra,ftId}'=old.num or coalesce(n#>'{extra,ftIds}','[]'::jsonb) @> jsonb_build_array(old.num)))
     or (kind='supplier' and n#>>'{extra,ftfId}'=old.num) then
    raise exception 'fattura con riferimenti legacy nelle note credito: riconciliare prima di rinumerare';
   end if;
  end loop;
 end if;
 if TG_OP='UPDATE' and new.righe is not distinct from old.righe
   and to_jsonb(new)->partykey is not distinct from to_jsonb(old)->partykey then return new;end if;
 for n in execute format('select to_jsonb(n) from public.%I n where company_id=$1',notes) using old.company_id loop
  if old.id=any(public.credit_note_invoice_ids(old.company_id,kind,n)) then linked:=true;exit;end if;
 end loop;
 if TG_OP='DELETE' then
  if linked then raise exception 'fattura con note credito collegate: cancellazione non consentita';end if;
  return old;
 end if;
 if linked and to_jsonb(new)->partykey is distinct from to_jsonb(old)->partykey then raise exception 'fattura con note credito collegate: controparte non modificabile';end if;
 if new.righe is distinct from old.righe then
  credit:=public.invoice_credit_total(old.company_id,kind,old.id);
  if credit>public.invoice_gross_total(new.righe) then raise exception 'totale fattura inferiore al credito già registrato';end if;
 end if;
 return new;
end$$;

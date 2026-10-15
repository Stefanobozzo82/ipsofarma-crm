-- Destinazione di consegna modificabile anche su DDT fatturati/storici e su
-- fatture collegate a un DDT. Le rettifiche tracciate (change_customer_ddt,
-- guard_customer_invoice_link) bloccano giustamente righe, numeri e
-- collegamenti; la destinazione invece non tocca quantità né importi.
-- Si cambia solo dest_id, e la stessa destinazione passa al documento
-- collegato (DDT ↔ fattura) perché le due stampe non si contraddicano.
create or replace function public.set_document_destination(
  p_company_id uuid, p_table text, p_id uuid, p_dest_id text)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_role text; v_cliente uuid; v_ddt_id uuid; v_dest text := nullif(trim(coalesce(p_dest_id,'')),'');
begin
  if auth.uid() is null or p_company_id is null or p_id is null then
    raise exception 'accesso e identificativi richiesti';
  end if;
  select role into v_role from public.memberships where company_id=p_company_id and user_id=auth.uid();
  if v_role is null or v_role not in ('admin','operatore') then raise exception 'operazione non autorizzata'; end if;
  if p_table='ddt' then
    select cliente_id into v_cliente from public.ddt where id=p_id and company_id=p_company_id for update;
  elsif p_table='fatture_cliente' then
    select cliente_id, ddt_id into v_cliente, v_ddt_id from public.fatture_cliente where id=p_id and company_id=p_company_id for update;
  else
    raise exception 'documento non valido';
  end if;
  if v_cliente is null then raise exception 'documento non disponibile'; end if;
  if v_dest is not null and not exists (
    select 1 from public.clienti c, jsonb_array_elements(coalesce(c.dest,'[]'::jsonb)) d
    where c.id=v_cliente and c.company_id=p_company_id and d->>'id'=v_dest) then
    raise exception 'destinazione non presente nella scheda del cliente';
  end if;
  if p_table='ddt' then
    update public.ddt set dest_id=v_dest where id=p_id and company_id=p_company_id;
    update public.fatture_cliente set dest_id=v_dest where company_id=p_company_id and ddt_id=p_id and dest_id is distinct from v_dest;
  else
    update public.fatture_cliente set dest_id=v_dest where id=p_id and company_id=p_company_id;
    if v_ddt_id is not null then
      update public.ddt set dest_id=v_dest where id=v_ddt_id and company_id=p_company_id and dest_id is distinct from v_dest;
    end if;
  end if;
  return jsonb_build_object('dest_id', v_dest);
end;
$$;

revoke all on function public.set_document_destination(uuid,text,uuid,text) from public, anon;
grant execute on function public.set_document_destination(uuid,text,uuid,text) to authenticated;

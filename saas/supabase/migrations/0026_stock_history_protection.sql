-- Keep existing FK names (PostgREST clients use explicit relationship hints).
-- Normal application users cannot erase stock history through a parent DELETE.
create function public.guard_product_stock_history() returns trigger
language plpgsql set search_path='' as $$
begin
  if current_user in ('authenticated','anon') and exists(
    select 1 from public.movimenti_magazzino where prodotto_id=old.id
  ) then raise exception 'prodotto con movimenti: conservare lo storico e usare una rettifica'; end if;
  return old;
end;
$$;
create trigger product_stock_history before delete on public.prodotti
for each row execute function public.guard_product_stock_history();

create function public.attribute_stock_movement() returns trigger
language plpgsql set search_path='' as $$
begin
  if current_user in ('authenticated','anon') then
    if auth.uid() is null then raise exception 'accesso richiesto'; end if;
    new.created_by:=auth.uid();
    new.created_at:=statement_timestamp();
  end if;
  return new;
end;
$$;
create trigger stock_movement_actor before insert on public.movimenti_magazzino
for each row execute function public.attribute_stock_movement();
-- Trusted maintenance/service paths retain explicit control for backup/restore
-- and account erasure; this is not a claim of physical database immutability.

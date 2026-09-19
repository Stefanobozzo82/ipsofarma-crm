-- 0017 — Separate editable company details from server-owned subscription state.
-- Run as the table owner, like the preceding migrations. No rows are rewritten.
-- RLS still decides WHICH company an administrator can edit; column privileges
-- decide WHAT can be edited. New columns are denied until explicitly reviewed.

-- Clear broad/default grants, including PUBLIC, before adding the allowlist.
-- RESTRICT is intentional: unexpected dependent grants require investigation,
-- rather than silently changing privileges of unrelated custom roles.
revoke all privileges on table public.companies from public, anon, authenticated;

-- Also clear explicit column grants on upgraded installations. Enumerating the
-- real columns includes any existing additions beyond the checked-in schema.
do $$
declare
  v_columns text;
begin
  select string_agg(quote_ident(attname), ', ' order by attnum)
  into v_columns
  from pg_attribute
  where attrelid = 'public.companies'::regclass
    and attnum > 0 and not attisdropped;
  execute format(
    'revoke all privileges (%s) on table public.companies from public, anon, authenticated',
    v_columns
  );
end;
$$;

-- Current settings form fields, plus the existing fiscal-regime business field.
-- slug/id, timestamps, piano and every Stripe/subscription field are excluded.
grant select on table public.companies to authenticated;
grant update (nome, piva, cf, sdi_codice, pec, indirizzo, settings, regime_fiscale)
  on table public.companies to authenticated;

-- Checkout and webhook use service_role. Preserve their server-side write path
-- even on installations where it previously relied on a PUBLIC grant.
grant select, update on table public.companies to service_role;

-- Existing RLS policies and register_company SECURITY DEFINER remain unchanged.
-- The owner can still register a company and the updated_at trigger still runs.
-- Detect unexpected inherited privileges rather than reporting a false success.
do $$
declare
  v_role text;
  v_column text;
begin
  foreach v_role in array array['anon', 'authenticated'] loop
    if has_table_privilege(v_role, 'public.companies', 'INSERT')
      or has_table_privilege(v_role, 'public.companies', 'DELETE')
      or has_table_privilege(v_role, 'public.companies', 'TRUNCATE') then
      raise exception 'companies: unexpected inherited write privileges for %', v_role;
    end if;
    for v_column in
      select attname from pg_attribute
      where attrelid = 'public.companies'::regclass and attnum > 0 and not attisdropped
        and (v_role = 'anon' or attname not in
          ('nome', 'piva', 'cf', 'sdi_codice', 'pec', 'indirizzo', 'settings', 'regime_fiscale'))
    loop
      if has_column_privilege(v_role, 'public.companies', v_column, 'UPDATE')
        or has_column_privilege(v_role, 'public.companies', v_column, 'INSERT') then
        raise exception 'companies: unexpected inherited privilege for %.%', v_role, v_column;
      end if;
    end loop;
  end loop;
end;
$$;

notify pgrst, 'reload schema';

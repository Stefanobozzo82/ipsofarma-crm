-- Limite di 100 email al giorno per azienda (send-email).
--
-- Chiunque può registrarsi e creare un'azienda: senza un tetto, l'invio
-- email del gestionale (mittente "<azienda> (tramite <piattaforma>)") potrebbe
-- essere usato per mandare messaggi in massa a indirizzi qualunque. Ogni
-- tentativo di invio da send-email passa prima da reserve_email_send(), che
-- conta i tentativi del giorno (ora italiana) in modo atomico: anche molte
-- richieste insieme non superano il limite. Conta il tentativo, non l'esito:
-- un invio rifiutato dal provider resta conteggiato.
-- I solleciti automatici (solleciti-automatici, lanciati dal server) non
-- passano da qui.

create table public.email_daily_usage (
  company_id uuid not null references public.companies(id) on delete cascade,
  giorno date not null,
  inviate integer not null default 0 check (inviate >= 0),
  primary key (company_id, giorno)
);
alter table public.email_daily_usage enable row level security;
revoke all on public.email_daily_usage from anon, authenticated;

create or replace function public.reserve_email_send(p_company_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_limit constant integer := 100;
  v_giorno date := (now() at time zone 'Europe/Rome')::date;
  v_inviate integer;
begin
  if auth.uid() is null or p_company_id is null or not exists (
    select 1 from memberships m
    where m.company_id = p_company_id and m.user_id = auth.uid() and m.role in ('admin', 'operatore')
  ) then
    return jsonb_build_object('allowed', false, 'reason', 'forbidden', 'limit', v_limit);
  end if;
  insert into email_daily_usage as u (company_id, giorno, inviate) values (p_company_id, v_giorno, 1)
  on conflict (company_id, giorno) do update set inviate = u.inviate + 1 where u.inviate < v_limit
  returning u.inviate into v_inviate;
  if v_inviate is null then
    return jsonb_build_object('allowed', false, 'reason', 'quota', 'used', v_limit, 'limit', v_limit);
  end if;
  return jsonb_build_object('allowed', true, 'used', v_inviate, 'limit', v_limit);
end;
$$;
revoke all on function public.reserve_email_send(uuid) from public, anon;
grant execute on function public.reserve_email_send(uuid) to authenticated;

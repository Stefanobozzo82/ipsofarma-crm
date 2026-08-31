-- ============================================================================
-- 0006 — Generazione XML FatturaPA
--
-- Questa migrazione costruisce la parte di fatturazione elettronica che NON
-- dipende dal provider SDI scelto in futuro (Aruba o altri): il documento
-- XML nel formato ufficiale richiesto dall'Agenzia delle Entrate. L'invio
-- vero e proprio allo SDI (via API di un provider) è un passo successivo,
-- volutamente separato — richiede un account presso quel provider, che
-- questa sessione non può creare al posto dell'azienda cliente.
--
-- Riferimento: specifiche tecniche FatturaPA versione 1.9 (formato FPR12,
-- fattura verso privati/aziende — il caso comune per un gestionale
-- commerciale; FPA12 per la Pubblica Amministrazione non è coperto qui).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Il regime fiscale (RF01 = ordinario, il più comune) è un dato dell'azienda
-- che serve OBBLIGATORIAMENTE in ogni fattura elettronica trasmessa: non era
-- ancora una colonna propria, viveva solo genericamente in "settings".
-- ---------------------------------------------------------------------------
alter table companies add column if not exists regime_fiscale text not null default 'RF01';
comment on column companies.regime_fiscale is 'Codice regime fiscale FatturaPA (RF01 = ordinario, il più comune; RF19 = forfettario, ecc.). Va reso modificabile dall''azienda prima di andare in produzione.';

-- ---------------------------------------------------------------------------
-- Tracciabilità: ogni fattura, una volta generata come XML, porta con sé il
-- progressivo di trasmissione usato e l'XML esatto prodotto — indispensabile
-- per poter sempre ricostruire cosa è stato (o sarà) inviato allo SDI.
-- ---------------------------------------------------------------------------
alter table fatture_cliente add column if not exists sdi_progressivo text;
alter table fatture_cliente add column if not exists sdi_xml text;
alter table fatture_cliente add column if not exists sdi_generato_at timestamptz;
comment on column fatture_cliente.sdi_xml is 'L''esatto XML FatturaPA generato per questa fattura. Rigenerarlo (senza forzare) è bloccato per non consumare un nuovo progressivo di trasmissione su una fattura già preparata.';

-- ---------------------------------------------------------------------------
-- ProgressivoInvio: un identificativo univoco per trasmissione, per azienda
-- mittente — obbligatorio nell'header di ogni fattura elettronica. Stessa
-- garanzia di atomicità di next_document_number() (0004): mai un numero
-- duplicato, anche con più dispositivi che generano contemporaneamente.
-- Non è legato all'anno (a differenza della numerazione documenti): è un
-- contatore di trasmissioni, non di fatture.
-- ---------------------------------------------------------------------------
create table sdi_progressivo_invio (
  company_id uuid primary key references companies(id) on delete cascade,
  next_value integer not null default 1
);

alter table sdi_progressivo_invio enable row level security;
create policy "membri leggono il progressivo della propria azienda" on sdi_progressivo_invio
  for select using (is_member(company_id));

create or replace function next_progressivo_invio(p_company_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next integer;
begin
  if not is_member(p_company_id) then
    raise exception 'utente non autorizzato per questa azienda';
  end if;
  insert into sdi_progressivo_invio (company_id, next_value)
  values (p_company_id, 2)
  on conflict (company_id)
  do update set next_value = sdi_progressivo_invio.next_value + 1
  returning next_value - 1 into v_next;
  return lpad(v_next::text, 5, '0');
end;
$$;

-- ---------------------------------------------------------------------------
-- Escape XML: & < > " ' — un campo testo libero (descrizione riga, nome
-- cliente...) che contenga uno di questi caratteri produrrebbe XML non
-- valido senza questa funzione.
-- ---------------------------------------------------------------------------
create or replace function xml_escape(t text)
returns text
language sql immutable
as $$
  select replace(replace(replace(replace(replace(
    coalesce(t, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&apos;')
$$;

-- ---------------------------------------------------------------------------
-- generate_fatturapa_xml: il cuore della migrazione.
--
-- Non è SECURITY DEFINER: legge fatture_cliente/clienti/companies con i
-- permessi di chi chiama, quindi la Row Level Security fa già da guardia —
-- una fattura di un'altra azienda risulta semplicemente "non trovata",
-- esattamente come per qualunque altra query.
-- ---------------------------------------------------------------------------
create or replace function generate_fatturapa_xml(p_fattura_id uuid, p_forza boolean default false)
returns text
language plpgsql
as $$
declare
  v_fattura fatture_cliente%rowtype;
  v_cliente clienti%rowtype;
  v_company companies%rowtype;
  v_progressivo text;
  v_righe jsonb;
  v_riga jsonb;
  v_linee text := '';
  v_riepilogo text := '';
  v_numero_linea integer := 0;
  v_totale_doc numeric(14,2) := 0;
  v_iva_rate numeric;
  v_imponibile numeric;
  v_imposta numeric;
  v_cod_dest text;
  v_pec_dest text;
  v_dest_block text;
  v_cess_fiscale text;
  v_xml text;
begin
  select * into v_fattura from fatture_cliente where id = p_fattura_id;
  if not found then
    raise exception 'fattura non trovata (o non appartiene alla tua azienda)';
  end if;

  if is_viewer_only(v_fattura.company_id) then
    raise exception 'un utente in sola lettura non può generare fatture elettroniche';
  end if;

  if v_fattura.sdi_xml is not null and not p_forza then
    raise exception 'questa fattura ha già un XML generato (progressivo %). Passa true come secondo parametro solo se vuoi davvero rigenerarlo: consuma un nuovo progressivo di trasmissione.', v_fattura.sdi_progressivo;
  end if;

  select * into v_cliente from clienti where id = v_fattura.cliente_id;
  if not found then
    raise exception 'il cliente collegato a questa fattura non esiste più';
  end if;

  select * into v_company from companies where id = v_fattura.company_id;

  if v_company.piva is null or length(trim(v_company.piva)) = 0 then
    raise exception 'impossibile generare la fattura elettronica: la partita IVA della tua azienda non è impostata (Impostazioni azienda)';
  end if;
  if (v_company.indirizzo->>'via') is null or (v_company.indirizzo->>'cap') is null
     or (v_company.indirizzo->>'citta') is null or (v_company.indirizzo->>'prov') is null then
    raise exception 'impossibile generare la fattura elettronica: l''indirizzo della tua azienda è incompleto (via, CAP, città, provincia)';
  end if;
  if (v_cliente.piva is null or length(trim(v_cliente.piva)) = 0)
     and (v_cliente.cf is null or length(trim(v_cliente.cf)) = 0) then
    raise exception 'impossibile generare la fattura elettronica: il cliente "%" non ha né partita IVA né codice fiscale', v_cliente.nome;
  end if;

  v_righe := coalesce(v_fattura.righe, '[]'::jsonb);
  if jsonb_array_length(v_righe) = 0 then
    raise exception 'impossibile generare la fattura elettronica: non ci sono righe';
  end if;

  -- CodiceDestinatario: 7 caratteri. "0000000" + PEC è l'alternativa standard
  -- per chi non ha (o non ha comunicato) un codice destinatario SDI proprio.
  -- Validato QUI, prima di consumare un progressivo di trasmissione: fallire
  -- su questo controllo non deve mai "sprecare" un numero che poi risulta
  -- associato a nessuna fattura effettivamente generata.
  v_cod_dest := coalesce(nullif(trim(v_cliente.sdi), ''), '0000000');
  if v_cod_dest = '0000000' then
    v_pec_dest := nullif(trim(v_cliente.pec), '');
    if v_pec_dest is null then
      raise exception 'impossibile generare la fattura elettronica: il cliente "%" non ha né un codice destinatario SDI né una PEC', v_cliente.nome;
    end if;
    v_dest_block := format('<CodiceDestinatario>%s</CodiceDestinatario><PECDestinatario>%s</PECDestinatario>', v_cod_dest, xml_escape(v_pec_dest));
  else
    v_dest_block := format('<CodiceDestinatario>%s</CodiceDestinatario>', xml_escape(v_cod_dest));
  end if;

  -- Da qui in poi la generazione non può più fallire per dati mancanti:
  -- è il punto giusto per consumare il progressivo di trasmissione.
  v_progressivo := next_progressivo_invio(v_fattura.company_id);

  -- DettaglioLinee: una per riga, nell'ordine in cui sono state inserite
  for v_riga in select * from jsonb_array_elements(v_righe)
  loop
    v_numero_linea := v_numero_linea + 1;
    v_iva_rate := coalesce((v_riga->>'iva')::numeric, 0);
    v_imponibile := round(coalesce((v_riga->>'qty')::numeric, 0) * coalesce((v_riga->>'prezzo')::numeric, 0), 2);
    v_linee := v_linee || format(
      '<DettaglioLinee><NumeroLinea>%s</NumeroLinea><Descrizione>%s</Descrizione><Quantita>%s</Quantita><PrezzoUnitario>%s</PrezzoUnitario><PrezzoTotale>%s</PrezzoTotale><AliquotaIVA>%s</AliquotaIVA></DettaglioLinee>',
      v_numero_linea,
      xml_escape(coalesce(nullif(v_riga->>'descr', ''), v_riga->>'cod', '(senza descrizione)')),
      to_char(coalesce((v_riga->>'qty')::numeric, 0), 'FM999999990.00'),
      to_char(coalesce((v_riga->>'prezzo')::numeric, 0), 'FM999999990.00'),
      to_char(v_imponibile, 'FM999999990.00'),
      to_char(v_iva_rate, 'FM990.00')
    );
  end loop;

  -- DatiRiepilogo: un blocco per ogni aliquota IVA distinta presente nelle righe
  for v_iva_rate, v_imponibile in
    select coalesce((r->>'iva')::numeric, 0),
           round(sum(coalesce((r->>'qty')::numeric, 0) * coalesce((r->>'prezzo')::numeric, 0)), 2)
    from jsonb_array_elements(v_righe) r
    group by coalesce((r->>'iva')::numeric, 0)
    order by 1
  loop
    v_imposta := round(v_imponibile * v_iva_rate / 100, 2);
    v_totale_doc := v_totale_doc + v_imponibile + v_imposta;
    v_riepilogo := v_riepilogo || format(
      '<DatiRiepilogo><AliquotaIVA>%s</AliquotaIVA><ImponibileImporto>%s</ImponibileImporto><Imposta>%s</Imposta><EsigibilitaIVA>I</EsigibilitaIVA></DatiRiepilogo>',
      to_char(v_iva_rate, 'FM990.00'),
      to_char(v_imponibile, 'FM999999990.00'),
      to_char(v_imposta, 'FM999999990.00')
    );
  end loop;

  if v_cliente.piva is not null and length(trim(v_cliente.piva)) > 0 then
    v_cess_fiscale := format('<IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>%s</IdCodice></IdFiscaleIVA>', xml_escape(v_cliente.piva));
  else
    v_cess_fiscale := format('<CodiceFiscale>%s</CodiceFiscale>', xml_escape(v_cliente.cf));
  end if;

  v_xml :=
    '<?xml version="1.0" encoding="UTF-8"?>' ||
    '<p:FatturaElettronica versione="FPR12" xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' ||
      '<FatturaElettronicaHeader>' ||
        '<DatiTrasmissione>' ||
          format('<IdTrasmittente><IdPaese>IT</IdPaese><IdCodice>%s</IdCodice></IdTrasmittente>', xml_escape(v_company.piva)) ||
          format('<ProgressivoInvio>%s</ProgressivoInvio>', v_progressivo) ||
          '<FormatoTrasmissione>FPR12</FormatoTrasmissione>' ||
          v_dest_block ||
        '</DatiTrasmissione>' ||
        '<CedentePrestatore>' ||
          '<DatiAnagrafici>' ||
            format('<IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>%s</IdCodice></IdFiscaleIVA>', xml_escape(v_company.piva)) ||
            case when v_company.cf is not null and length(trim(v_company.cf)) > 0
                 then format('<CodiceFiscale>%s</CodiceFiscale>', xml_escape(v_company.cf)) else '' end ||
            format('<Anagrafica><Denominazione>%s</Denominazione></Anagrafica>', xml_escape(v_company.nome)) ||
            format('<RegimeFiscale>%s</RegimeFiscale>', xml_escape(v_company.regime_fiscale)) ||
          '</DatiAnagrafici>' ||
          '<Sede>' ||
            format('<Indirizzo>%s</Indirizzo>', xml_escape(v_company.indirizzo->>'via')) ||
            format('<CAP>%s</CAP>', xml_escape(v_company.indirizzo->>'cap')) ||
            format('<Comune>%s</Comune>', xml_escape(v_company.indirizzo->>'citta')) ||
            format('<Provincia>%s</Provincia>', xml_escape(v_company.indirizzo->>'prov')) ||
            '<Nazione>IT</Nazione>' ||
          '</Sede>' ||
        '</CedentePrestatore>' ||
        '<CessionarioCommittente>' ||
          '<DatiAnagrafici>' ||
            v_cess_fiscale ||
            format('<Anagrafica><Denominazione>%s</Denominazione></Anagrafica>', xml_escape(v_cliente.nome)) ||
          '</DatiAnagrafici>' ||
          '<Sede>' ||
            format('<Indirizzo>%s</Indirizzo>', xml_escape(coalesce(v_cliente.via, ''))) ||
            format('<CAP>%s</CAP>', xml_escape(coalesce(v_cliente.cap, ''))) ||
            format('<Comune>%s</Comune>', xml_escape(coalesce(v_cliente.citta, ''))) ||
            format('<Provincia>%s</Provincia>', xml_escape(coalesce(v_cliente.prov, ''))) ||
            '<Nazione>IT</Nazione>' ||
          '</Sede>' ||
        '</CessionarioCommittente>' ||
      '</FatturaElettronicaHeader>' ||
      '<FatturaElettronicaBody>' ||
        '<DatiGenerali>' ||
          '<DatiGeneraliDocumento>' ||
            '<TipoDocumento>TD01</TipoDocumento>' ||
            '<Divisa>EUR</Divisa>' ||
            format('<Data>%s</Data>', to_char(v_fattura.data, 'YYYY-MM-DD')) ||
            format('<Numero>%s</Numero>', xml_escape(v_fattura.num)) ||
            format('<ImportoTotaleDocumento>%s</ImportoTotaleDocumento>', to_char(v_totale_doc, 'FM999999990.00')) ||
          '</DatiGeneraliDocumento>' ||
        '</DatiGenerali>' ||
        '<DatiBeniServizi>' ||
          v_linee ||
          v_riepilogo ||
        '</DatiBeniServizi>' ||
        '<DatiPagamento>' ||
          '<CondizioniPagamento>TP02</CondizioniPagamento>' ||
          '<DettaglioPagamento>' ||
            '<ModalitaPagamento>MP05</ModalitaPagamento>' ||
            format('<ImportoPagamento>%s</ImportoPagamento>', to_char(v_totale_doc, 'FM999999990.00')) ||
          '</DettaglioPagamento>' ||
        '</DatiPagamento>' ||
      '</FatturaElettronicaBody>' ||
    '</p:FatturaElettronica>';

  update fatture_cliente
    set sdi_progressivo = v_progressivo, sdi_xml = v_xml, sdi_generato_at = now()
    where id = p_fattura_id;

  return v_xml;
end;
$$;

comment on function generate_fatturapa_xml(uuid, boolean) is
  'Genera l''XML FatturaPA (formato FPR12) per una fattura cliente e lo salva sulla riga stessa insieme al progressivo di trasmissione usato. Non invia nulla allo SDI: quello è un passo successivo, tramite un provider esterno.';

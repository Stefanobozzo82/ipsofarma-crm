#!/usr/bin/env python3
"""Importazione dei listini suture nel Convertitore suture del gestionale.

Legge i listini (PDF ed Excel) in tools/listini/, estrae codice, materiale,
USP, ago e lunghezza, normalizza i valori con le stesse regole della pagina
(saas/web/app/suture.js) e aggiorna tools/suture-codici.json senza doppioni
(chiave: marca + codice). Le righe che non riesce a interpretare finiscono in
tools/report_non_interpretate.csv, da correggere a mano.

Il JSON si carica poi dal gestionale: Convertitore suture → Archivio codici →
Importa JSON (solo admin).

Uso:
    python3 tools/importa_listini.py [--listini DIR] [--json FILE] [--report FILE]

Requisiti: pip install pymupdf openpyxl xlrd

Il repository è pubblico: listini, JSON e report restano fuori da git
(vedi .gitignore), perché contengono prezzi.

Marche gestite: Ergon Sutramed (listino suture PDF), B. Braun (listino
Excel "AE 50 FILI DI SUTURA"). Le altre marche si
aggiungono scrivendo un parser e registrandolo in PARSER.
"""
import argparse
import csv
import json
import re
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

QUI = Path(__file__).resolve().parent

CURVATURE = ['1/2', '3/8', '5/8', '1/4', 'Retto', 'J']
PUNTE = ['Cilindrica', 'Tagliente inversa', 'Tagliente', 'Taper-cut', 'Spatolata', 'Smussa']


# ---- normalizzazione (stesse regole di saas/web/app/suture.js) ------------------
def fold(s):
    s = '' if s is None else str(s)
    return ''.join(c for c in unicodedata.normalize('NFD', s.lower()) if unicodedata.category(c) != 'Mn')


def norm_codice(s):
    return re.sub(r'[\s.\-/_]', '', fold(s))


def norm_usp(v):
    """USP nel formato "2-0": accetta "2/0", "2 - 0", "USP 3-0", "00", "0"."""
    s = re.sub(r'usp|ep\s*[\d.,]+', '', fold(v)).strip()
    if not s:
        return None
    m = re.match(r'^(\d{1,2})\s*[-/.]\s*0$', s)
    if m:
        k = int(m.group(1))
        return '0' if k <= 1 else f'{k}-0'
    if re.fullmatch(r'0{2,}', s):
        return f'{len(s)}-0'
    m = re.match(r'^(\d)\s*[&/+-]\s*(\d)$', s)
    if m and m.group(1) != '0' and m.group(2) != '0':
        return f'{m.group(1)}-{m.group(2)}'
    if re.fullmatch(r'\d', s):
        return s
    return None


def norm_curvatura(v):
    s = re.sub(r'\s+', '', fold(v))
    if not s:
        return None
    for pref, val in (('1/2', '1/2'), ('3/8', '3/8'), ('5/8', '5/8'), ('1/4', '1/4')):
        if s.startswith(pref):
            return val
    if re.match(r'^(retto|retta|dritto|straight)', s):
        return 'Retto'
    if re.match(r'^(j|agoaj|forma?j)', s):
        return 'J'
    return None


def norm_punta(v):
    s = re.sub(r'[\s_]+', ' ', fold(v)).strip()
    if not s:
        return None
    if re.search(r'taper.?cut|tapercut|cilindrica tagliente', s):
        return 'Taper-cut'
    if re.search(r'inver|reverse', s):
        return 'Tagliente inversa'
    if re.search(r'spatol', s):
        return 'Spatolata'
    if re.search(r'smuss|blunt', s):
        return 'Smussa'
    if re.search(r'taglien|triang|cutting', s):
        return 'Tagliente'
    if re.search(r'cilindr|taper|round', s):
        return 'Cilindrica'
    return None


def num(v):
    """Numero da testo italiano: "17,4" → 17.4, "€ 1.234,50" → 1234.5."""
    if v is None or v == '':
        return None
    s = str(v).replace('€', '').strip()
    if ',' in s:
        s = s.replace('.', '').replace(',', '.')
    try:
        return float(s)
    except ValueError:
        return None


# ---- Ergon Sutramed: "Listino Sutura" PDF ---------------------------------------
# Titolo di pagina → famiglia del Convertitore. Le famiglie non presenti nella
# tabella di partenza (Monofast, PLC, Coralene, Maxilene, acciaio, titanio)
# vengono create con il nome indicato qui.
ERGON_FAMIGLIE = {
    'dar-vin lac fast': 'Rapido intrecciato',
    'dar-vin lac': 'PGLA intrecciato',
    'dar-vin fast': 'Rapido intrecciato',
    'dar-vin': 'PGA intrecciato',
    'monofast': 'Monofilamento rapido (poliglecaprone)',
    'monomed': 'Monofilamento medio (poliglecaprone)',
    'dar-vin monofilamento': 'PDO',
    'selene': 'Polipropilene',
    'coralene': 'PVDF',
    'terylene': 'Poliestere',
    'cardioerg': 'Poliestere',
    'maxilene': 'Polietere poliuretanico',
    'sutron': 'Nylon',
    'supramid': 'Nylon',
    'seta': 'Seta',
    'acciaio': 'Acciaio',
    'titanio': 'Titanio',
}
# La pagina 21 ha il titolo "Dar-Vin Monofilamento" ma secondo l'indice è il
# monofilamento di poli(L-lactide-ε-caprolattone), non il polidiossanone.
ERGON_PAGINA_FAMIGLIA = {21: ('Dar-Vin Monofilamento PLC', 'Monofilamento lungo (lattide-caprolattone)')}
# Colonne del listino (coordinate x in punti PDF).
ERGON_COLONNE = [('codice', 0, 55), ('ago', 55, 175), ('mm', 175, 200), ('colore', 200, 270), ('note', 270, 335),
                 ('fili', 335, 355), ('cm', 355, 376), ('usp', 376, 399), ('ep', 399, 420), ('buste', 420, 446),
                 ('prezzo', 446, 481), ('prezzo_conf', 481, 600)]
SENZA_AGO = re.compile(r'fili pretagliati|bobina|fili liberi', re.I)


def _ergon_famiglia(titolo):
    """"Dar-Vin Lac Fast - Kit per Episiorrafia" → famiglia di "Dar-Vin Lac Fast"."""
    base = re.split(r'\s+-\s+|\s+kit\b', fold(titolo))[0].strip()
    return ERGON_FAMIGLIE.get(base)


def parse_ergon(path, report):
    import pymupdf
    doc = pymupdf.open(str(path))
    out = []
    for pn in range(doc.page_count):
        page = doc[pn]
        words = page.get_text('words')
        titolo = ' '.join(w[4] for w in sorted([w for w in words if w[1] < 35], key=lambda w: w[0])).strip()
        if not any(w[4] == 'CODICE' for w in words) or not titolo or titolo.upper().startswith('CODICE'):
            continue  # indice dei codici, pagine introduttive
        nome, famiglia = ERGON_PAGINA_FAMIGLIA.get(pn, (titolo, _ergon_famiglia(titolo)))
        if famiglia is None:
            report.append([path.name, pn, '', titolo, 'pagina saltata: non è un filo di sutura (' + titolo + ')'])
            continue
        # Righe della tabella: una parola a inizio riga (x < 30) apre una riga
        # di prodotto se è un codice (maiuscole/cifre), un sottotitolo di
        # sezione se è testo ("Dar-Vin Lac Fast - Kit per Episiorrafia").
        heads = sorted([w for w in words if w[0] < 30 and 40 < w[1] < 800], key=lambda w: w[1])
        for h in heads:
            yc = (h[1] + h[3]) / 2
            line = sorted([w for w in words if abs((w[1] + w[3]) / 2 - yc) < 3], key=lambda w: w[0])
            if re.search(r'[a-z]', h[4]):
                testo = ' '.join(w[4] for w in line)
                if _ergon_famiglia(testo):
                    nome, famiglia = (ERGON_PAGINA_FAMIGLIA.get(pn, (testo, None))[0], _ergon_famiglia(testo))
                continue
            if h[4] == 'CODICE' or not re.match(r'^[A-Z0-9][A-Z0-9-]+$', h[4]):
                continue
            codice = ' '.join(w[4] for w in line if w[0] < 55)
            # Il valore in mm a volte sta mezza riga sotto: entro mezza interlinea.
            row = [w for w in words if abs((w[1] + w[3]) / 2 - yc) < 6 and w[0] >= 55]
            cell = {}
            for key, x0, x1 in ERGON_COLONNE[1:]:
                cell[key] = ' '.join(w[4] for w in sorted(row, key=lambda w: w[0]) if x0 <= w[0] < x1).strip()
            riga_txt = codice + ' | ' + ' | '.join(f'{k}={v}' for k, v in cell.items() if v)
            ago = cell['ago']
            senza_ago = bool(SENZA_AGO.search(ago))
            # Doppio ago: "2" in fondo alla colonna ago e/o "2 x 30" nei mm.
            m_mm = re.match(r'^(?:(\d)\s*)?x\s*([\d,]+)(?:\s+\d+)?$', cell['mm'])
            doppio = bool(re.search(r'\s2$', ago)) or bool(m_mm)
            ago_pulito = re.sub(r'\s2$', '', ago)
            mm = num(m_mm.group(2)) if m_mm else num(cell['mm'])
            colore, note = cell['colore'], cell['note']
            # "Ago serie 300" a volte scavalla nella colonna colore.
            if colore.endswith(' Ago') and note.lower().startswith('serie'):
                colore, note = colore[:-4], 'Ago ' + note
            if doppio:
                colore = re.sub(r'\s*Doppio(\s+Ago)?', '', colore).strip()
                note = re.sub(r'^Ago\b\s*', '', note).strip()
            curv = None if senza_ago else norm_curvatura(ago_pulito)
            punta = None if senza_ago else norm_punta(ago_pulito)
            if not senza_ago and re.search(r'\ba j\b|ago a j', fold(ago_pulito)):
                curv = 'J'
            usp = norm_usp(cell['usp'])
            cm = num(cell['cm'])
            problemi = []
            if not usp:
                problemi.append('USP "' + cell['usp'] + '" non riconosciuto')
            if not senza_ago and not curv:
                problemi.append('curvatura non riconosciuta in "' + ago + '"')
            if not senza_ago and not punta:
                problemi.append('punta non riconosciuta in "' + ago + '"')
            if not senza_ago and mm is None:
                problemi.append('mm ago non riconosciuti ("' + cell['mm'] + '")')
            if cm is None:
                problemi.append('lunghezza mancante')
            extra = [x for x in ('2 aghi' if doppio else '', note.strip(' /'), colore) if x]
            descr = ' '.join(x for x in [nome, ('USP ' + usp) if usp else '', ago_pulito,
                                         (fmt(mm) + ' mm') if mm is not None else '', (fmt(cm) + ' cm') if cm is not None else ''] if x)
            if extra:
                descr += ' - ' + ', '.join(extra)
            out.append({'marca': 'ergon', 'codice': codice, 'tipo': famiglia, 'usp': usp, 'curvatura': curv, 'punta': punta,
                        'agoMm': mm, 'lungCm': cm, 'siglaAgo': None, 'descr': descr, 'prezzo': num(cell['prezzo'])})
            if problemi:
                report.append([path.name, pn, codice, riga_txt, '; '.join(problemi)])
    return out


def fmt(n):
    return ('%g' % n).replace('.', ',')


# ---- B. Braun: listino "AE 50 FILI DI SUTURA" (Excel) ---------------------------
# Prodotto (inizio descrizione) → famiglia; il più specifico prima.
BBRAUN_FAMIGLIE = [
    ('NOVOSYN QUICK', 'Rapido intrecciato'), ('NOVOSYN', 'PGLA intrecciato'),
    ('SAFIL QUICK', 'Rapido intrecciato'), ('SAFIL', 'PGA intrecciato'),
    ('MONOSYN QUICK', 'Monofilamento rapido (poliglecaprone)'), ('MONOSYN', 'Monofilamento medio (poliglecaprone)'),
    ('MONOPLUS', 'PDO'), ('MONOP ', 'PDO'), ('MONOMAX', 'Monofilamento lunghissimo (P4HB)'),
    ('OPTILENE', 'Polipropilene'), ('PREMILENE', 'Polipropilene'),
    ('PREMICRON', 'Poliestere'), ('PREMICRN', 'Poliestere'), ('DAGROFIL', 'Poliestere'),
    ('SILKAM', 'Seta'), ('DAFILON', 'Nylon'), ('SUPRAMID', 'Nylon'),
    ('STEELEX', 'Acciaio'), ('STEEL', 'Acciaio'), ('STEE', 'Acciaio'),
    ('SYMMCORA', 'Barbato'), ('SYMMC', 'Barbato'),
    # Set per episiorrafia con Novosyn Quick.
    ('EPISET NOVO', 'Rapido intrecciato'), ('EPI NOVOQU', 'Rapido intrecciato'),
]
# Nomenclatura aghi B. Braun (catalogo "Chiusura delle ferite", pag. 19):
# curvatura + corpo + punta + lunghezza mm + spessore. Es. HR26 = 1/2 cerchio,
# cilindrico, 26 mm; DS24 = 3/8, tagliente (punta esterna = tagliente inversa).
BBRAUN_CURV = {'V': '1/4', 'D': '3/8', 'H': '1/2', 'F': '5/8', 'G': 'Retto', 'J': 'J'}
BBRAUN_AGO = re.compile(r'(?:(\d)X)?(SK|[SVDHFGJP])(R|S|L|G)([A-Z]*?)(\d+(?:[.,]\d+)?)')


def _bbraun_ago(sigla):
    m = BBRAUN_AGO.fullmatch(sigla) or BBRAUN_AGO.match(sigla)
    if not m:
        return None
    n_aghi, cur, corpo, mods, mm = m.groups()
    if corpo == 'S':
        punta = 'Tagliente inversa'
    elif corpo == 'G':
        punta = 'Tagliente'   # Dermaslide (DGMP): tagliente con micro-punta
    elif corpo == 'L':
        punta = 'Spatolata'
    elif 'N' in mods:
        punta = 'Smussa'
    elif re.search(r'[CTS]', mods):
        punta = 'Taper-cut'   # punta tagliente corta, trocar o sternale su corpo cilindrico
    else:
        punta = 'Cilindrica'
    return {'curvatura': BBRAUN_CURV.get(cur), 'punta': punta, 'agoMm': num(mm.replace('.', ',')),
            'doppio': n_aghi == '2', 'sigla': m.group(0)}


def parse_bbraun(path, report):
    if path.suffix.lower() == '.xls':
        import xlrd
        sh = xlrd.open_workbook(str(path)).sheet_by_index(0)
        rows = [sh.row_values(r) for r in range(sh.nrows)]
    else:
        import openpyxl
        rows = [list(r) for r in openpyxl.load_workbook(str(path), read_only=True, data_only=True).active.iter_rows(values_only=True)]
    head = next((i for i, r in enumerate(rows) if r and str(r[0]).strip().lower() == 'articolo'), None)
    if head is None:
        report.append([path.name, '', '', '', 'intestazione "Articolo" non trovata'])
        return []
    out = []
    for i, r in enumerate(rows[head + 1:], start=head + 2):
        codice = str(r[0] or '').strip()
        descr = re.sub(r'\s+', ' ', str(r[1] or '')).strip()
        if not codice or not descr:
            continue
        D = descr.upper()
        compatto = D.replace(' ', '')
        famiglia = next((f for k, f in BBRAUN_FAMIGLIE if (D.startswith(k) if k.endswith(' ') else compatto.startswith(k.replace(' ', '')))), None)
        if not famiglia:
            report.append([path.name, i, codice, descr, 'prodotto non gestito (non è un filo delle famiglie)'])
            continue
        problemi = []
        # USP: "2/0 (3)" con l'EP tra parentesi, "2/0 8X75" o "3/0 15CM" senza.
        m = (re.search(r'(?<![\d/,X])(\d{1,2}/0)(?![\d])', D) or re.search(r'(?<![\d/,.X])(\d)\s*\(\s*[\d,.]+\s*\)', D)
             or re.search(r'(?<![\d/,.X])(\d)(?=\s+(?:\d+X)?\d{1,3}\s*CM)', D))
        usp = norm_usp(m.group(1)) if m else None
        if not usp:
            problemi.append('USP non trovato')
        # Lunghezza subito dopo USP/EP: "70CM", "70 CM", "4X45", "3X45C", "150".
        resto = D[m.end():] if m else D
        resto = re.sub(r'^\s*\(\s*[\d,.]+\s*\)', '', resto)
        m = re.match(r'\s*(?:(\d+)X)?(\d{1,3})(?:\s*CM?\b|\s*C(?=\s)|(?=\s|$))', resto) or re.search(r'(?:(\d+)X)?(\d{1,3})\s*CM', resto)
        cm = num(m.group(2)) if m else None
        fili = int(m.group(1)) if m and m.group(1) else 1
        if cm is None:
            problemi.append('lunghezza non trovata')
        D = resto
        dopo = re.sub(r'(\d)X\s+', r'\1X', D[m.end():] if m else '')
        ago = None
        for tok in re.findall(r'(?:\dX)?(?:SK|[SVDHFGJP])[RSLG][A-Z]*\d+(?:[.,]\d+)?', dopo):
            ago = _bbraun_ago(tok)
            if ago:
                break
        senza_ago = ago is None and not re.search(r'\d', re.sub(r'\b(DDP|RCP|LP|LOCK?|UDIR|BDIR|CV\d?|\(M\))\b', '', dopo))
        if ago is None and not senza_ago:
            problemi.append('sigla ago non riconosciuta in "' + dopo.strip() + '"')
        if ago and ago['curvatura'] is None:
            problemi.append('curvatura a slitta/progressiva/1-8 non prevista (sigla ' + ago['sigla'] + ')')
        pezzi = num(r[5]) if len(r) > 5 else None
        prezzo_conf = num(r[2]) if not isinstance(r[2], (int, float)) else float(r[2])
        prezzo = round(prezzo_conf / pezzi, 2) if prezzo_conf and pezzi else None
        extra = []
        if ago and ago['doppio']:
            extra.append('2 aghi')
        if fili > 1:
            extra.append(f'{fili} fili')
        out.append({'marca': 'bbraun', 'codice': codice, 'tipo': famiglia, 'usp': usp,
                    'curvatura': ago['curvatura'] if ago else None, 'punta': ago['punta'] if ago else None,
                    'agoMm': ago['agoMm'] if ago else None, 'lungCm': cm,
                    'siglaAgo': ago['sigla'] if ago else None,
                    'descr': descr + (' - ' + ', '.join(extra) if extra else ''), 'prezzo': prezzo})
        if problemi:
            report.append([path.name, i, codice, descr, '; '.join(problemi)])
    return out


# Riconoscimento del listino dal nome del file → parser.
PARSER = [
    (re.compile(r'ergon|sutramed', re.I), re.compile(r'listino.*sutur', re.I), parse_ergon),
    (re.compile(r'braun|\bae\s*50\b', re.I), re.compile(r'fili di sutura', re.I), parse_bbraun),
]


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n\n')[0])
    ap.add_argument('--listini', default=str(QUI / 'listini'))
    ap.add_argument('--json', default=str(QUI / 'suture-codici.json'))
    ap.add_argument('--report', default=str(QUI / 'report_non_interpretate.csv'))
    a = ap.parse_args()

    listini = Path(a.listini)
    if not listini.is_dir():
        sys.exit(f'Cartella dei listini non trovata: {listini}')
    report = []
    letti = []
    for f in sorted(listini.rglob('*')):
        if f.suffix.lower() not in ('.pdf', '.xlsx', '.xls'):
            continue
        parser = next((p for marca, tipo, p in PARSER if marca.search(f.name) and tipo.search(f.name)), None)
        if not parser:
            report.append([f.name, '', '', '', 'listino non ancora gestito dallo script'])
            continue
        righe = parser(f, report)
        print(f'{f.name}: {len(righe)} codici')
        letti.extend(righe)

    # Unione con il JSON esistente: chiave marca + codice; un listino non
    # cancella i campi che non riporta.
    out_path = Path(a.json)
    esistenti = []
    if out_path.exists():
        dati = json.loads(out_path.read_text(encoding='utf-8'))
        esistenti = dati['codici'] if isinstance(dati, dict) else dati
    per_chiave = {r['marca'] + '|' + norm_codice(r['codice']): r for r in esistenti}
    nuovi = aggiornati = 0
    for r in letti:
        k = r['marca'] + '|' + norm_codice(r['codice'])
        if k in per_chiave:
            per_chiave[k].update({f: v for f, v in r.items() if v not in (None, '')})
            aggiornati += 1
        else:
            per_chiave[k] = r
            nuovi += 1
    codici = sorted(per_chiave.values(), key=lambda r: (r['marca'], r['codice']))
    out_path.write_text(json.dumps({'versione': 1, 'generato': datetime.now(timezone.utc).isoformat(timespec='seconds'),
                                    'codici': codici}, ensure_ascii=False, indent=1), encoding='utf-8')
    with open(a.report, 'w', newline='', encoding='utf-8-sig') as fh:
        w = csv.writer(fh, delimiter=';')
        w.writerow(['file', 'pagina', 'codice', 'riga letta', 'problema'])
        w.writerows(report)
    print(f'{out_path}: {len(codici)} codici ({nuovi} nuovi, {aggiornati} aggiornati)')
    print(f'{a.report}: {len(report)} righe da controllare')


if __name__ == '__main__':
    main()

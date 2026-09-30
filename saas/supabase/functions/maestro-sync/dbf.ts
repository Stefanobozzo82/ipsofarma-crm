// Lettore dei file dBase (.DBF, con memo .DBT) usati da Maestro Gold
// (GenioSoft). Solo lettura, nessuna dipendenza: gira identico in Deno
// (Edge Function) e in Node (test).

export type DbfField = { name: string; type: string; length: number; decimals: number };
export type DbfRecord = { index: number; deleted: boolean; values: Record<string, unknown> };

const decoder = new TextDecoder('windows-1252');

function u16(b: Uint8Array, o: number) { return b[o] | (b[o + 1] << 8); }
function u32(b: Uint8Array, o: number) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }

export function readFields(buf: Uint8Array): DbfField[] {
  const fields: DbfField[] = [];
  for (let o = 32; o + 32 <= buf.length && buf[o] !== 0x0d; o += 32) {
    let end = o; while (end < o + 11 && buf[end] !== 0) end++;
    fields.push({
      name: decoder.decode(buf.subarray(o, end)).trim().toUpperCase(),
      type: String.fromCharCode(buf[o + 11]),
      length: buf[o + 16],
      decimals: buf[o + 17],
    });
  }
  return fields;
}

// Memo dBase III (testo chiuso da 0x1A) e dBase IV (blocco con intestazione
// FF FF 08 00 + lunghezza): Maestro usa il secondo, il primo è gestito per
// sicurezza sui file più vecchi.
export function readMemo(dbt: Uint8Array | null, block: number): string | null {
  if (!dbt || !block) return null;
  const size = u16(dbt, 20) || 512;
  const start = block * size;
  if (start >= dbt.length) return null;
  if (dbt[start] === 0xff && dbt[start + 1] === 0xff && dbt[start + 2] === 0x08 && dbt[start + 3] === 0x00) {
    const len = u32(dbt, start + 4);
    return decoder.decode(dbt.subarray(start + 8, Math.min(dbt.length, start + len))).replace(/\x1a+$/, '').trim();
  }
  let end = start; while (end < dbt.length && dbt[end] !== 0x1a) end++;
  return decoder.decode(dbt.subarray(start, end)).trim();
}

function parseValue(f: DbfField, raw: Uint8Array, dbt: Uint8Array | null): unknown {
  const text = decoder.decode(raw);
  switch (f.type) {
    case 'C': return text.replace(/\0/g, '').trimEnd();
    case 'N': case 'F': {
      const t = text.trim();
      if (!t || /^\*+$/.test(t)) return null;
      const n = Number(t.replace(',', '.'));
      return Number.isFinite(n) ? n : null;
    }
    case 'D': {
      const t = text.trim();
      return /^\d{8}$/.test(t) && t !== '00000000' ? `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}` : null;
    }
    case 'L': return /^[TtYy]$/.test(text.trim()) ? true : /^[FfNn]$/.test(text.trim()) ? false : null;
    case 'M': {
      const t = text.trim();
      return /^\d+$/.test(t) ? readMemo(dbt, Number(t)) : null;
    }
    default: return text.trim();
  }
}

export function readDbf(buf: Uint8Array, dbt: Uint8Array | null = null): { fields: DbfField[]; records: DbfRecord[] } {
  if (buf.length < 32) throw new Error('file DBF troppo corto');
  const count = u32(buf, 4), headerLen = u16(buf, 8), recordLen = u16(buf, 10);
  if (!headerLen || !recordLen || headerLen > buf.length) throw new Error('intestazione DBF non valida');
  const fields = readFields(buf);
  const offsets: number[] = []; let acc = 1;
  for (const f of fields) { offsets.push(acc); acc += f.length; }
  if (acc > recordLen) throw new Error('struttura DBF incoerente');
  const records: DbfRecord[] = [];
  for (let i = 0; i < count; i++) {
    const start = headerLen + i * recordLen;
    if (start + recordLen > buf.length) break;
    if (buf[start] === 0x1a) break;
    const values: Record<string, unknown> = {};
    fields.forEach((f, k) => {
      values[f.name] = parseValue(f, buf.subarray(start + offsets[k], start + offsets[k] + f.length), dbt);
    });
    records.push({ index: i + 1, deleted: buf[start] === 0x2a, values });
  }
  return { fields, records };
}

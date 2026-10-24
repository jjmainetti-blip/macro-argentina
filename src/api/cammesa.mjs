// v220 · Demanda eléctrica diaria de CAMMESA ("Comportamiento de la Demanda de Energía Eléctrica en el MEM").
// Dos bases en zip con un xlsx adentro, en URLs fijas que CAMMESA actualiza a diario:
//  · Base Demanda Diaria 2017–2026 (datos de transacciones económicas, definitivos): hoja "Datos Tipo Usuario".
//  · Base de datos GU Semanal (datos operativos 2022–hoy, incluye el mes en curso): hoja "Base 2022 a 2026".
// Se arma el promedio mensual (MW medios) de la demanda de los Grandes Usuarios del MEM (GUMA + autogeneradores) sin
// ALUAR (una sola planta de aluminio cuya demanda se mueve por razones propias). Sólo meses completos. El definitivo
// manda; el operativo cubre los meses que todavía no están en la base definitiva.
import * as XLSX from 'xlsx';

const BASE = 'https://microfe.cammesa.com/static-content/CammesaWeb/download-manager-files/covid-19/';
export const CAMMESA_URLS = {
  dte: `${BASE}Base%20Demanda%20Diaria%202017%202026.zip`,
  oper: `${BASE}Base%20de%20datos%20GU%20Semanal.zip`
};
export const CAMMESA_PAGE = 'https://cammesaweb.cammesa.com/2026/10/23/covid-19-comportamiento-de-la-demanda-de-energia-electrica-en-el-mem/';

async function inflateRaw(bytes) {
  const ds = new DecompressionStream('deflate-raw'), w = ds.writable.getWriter();
  w.write(bytes).catch(() => { }); w.close().catch(() => { });
  return new Uint8Array(await new Response(ds.readable).arrayBuffer());
}
// Primer archivo .xlsx de un zip (lee el directorio central).
export async function firstXlsxInZip(buf) {
  const b = new Uint8Array(buf), dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let eocd = -1; for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('zip sin directorio');
  const count = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true);
  for (let k = 0; k < count; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(b.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + xlen + clen;
    if (!/\.xlsx$/i.test(name)) continue;
    const start = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true), data = b.subarray(start, start + csize);
    return method === 0 ? data : await inflateRaw(data);
  }
  throw new Error('zip sin xlsx');
}
const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
const serialYmd = v => typeof v === 'number' && v > 30000 ? new Date(Math.round((v - 25569) * 86400e3)).toISOString().slice(0, 10) : null;
const daysIn = ym => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };

// Filas → { 'AAAA-MM': {n, sum} } con la columna de fecha y una función de valor sobre la fila.
function monthlyFrom(rows, dateCol, value) {
  const M = {};
  for (const r of rows) { const d = serialYmd(r[dateCol]); if (!d) continue; const v = value(r); if (!Number.isFinite(v)) continue; const ym = d.slice(0, 7); const o = M[ym] || (M[ym] = { n: 0, sum: 0, days: new Set() }); if (o.days.has(d)) continue; o.days.add(d); o.n++; o.sum += v; }
  const out = {}; for (const [ym, o] of Object.entries(M)) if (o.n >= daysIn(ym)) out[ym] = Math.round(o.sum / o.n * 10) / 10;
  return out;
}
function sheetRows(xlsx, name) {
  const wb = XLSX.read(xlsx, { type: 'array', sheets: [name], dense: true, cellDates: false, cellFormula: false, cellHTML: false, cellText: false });
  const ws = wb.Sheets[name]; if (!ws) throw new Error(`falta la hoja ${name}`);
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });
}
function headerRow(R, need) { for (let i = 0; i < Math.min(R.length, 40); i++) { const h = R[i].map(norm); if (need.every(n => h.some(c => c === n || c.startsWith(n)))) return i; } return -1; }
const col = (H, ...names) => { const h = H.map(norm); for (const n of names) { const i = h.findIndex(c => c === n); if (i >= 0) return i; } for (const n of names) { const i = h.findIndex(c => c.startsWith(n)); if (i >= 0) return i; } return -1; };

export function parseDte(xlsx) {
  const R = sheetRows(xlsx, 'Datos Tipo Usuario'), hi = headerRow(R, ['FECHA', 'ALUAR']); if (hi < 0) throw new Error('DTE: encabezado no encontrado');
  const H = R[hi], f = col(H, 'FECHA'), g = col(H, 'GUMA/AUTOGENER TOTAL', 'GUMA'), a = col(H, 'ALUAR');
  if (f < 0 || g < 0 || a < 0) throw new Error('DTE: columnas no encontradas');
  return monthlyFrom(R.slice(hi + 1), f, r => Number(r[g]) - Number(r[a]));
}
export function parseOper(xlsx) {
  const R = sheetRows(xlsx, 'Base 2022 a 2026'), hi = headerRow(R, ['FECHA', 'ALUAR']); if (hi < 0) throw new Error('operativa: encabezado no encontrado');
  const H = R[hi], f = col(H, 'FECHA'), x = col(H, 'AUTO+GUMAS (SIN ALUAR)'), g = col(H, 'AUTO+GUMAS'), a = col(H, 'ALUAR');
  if (f < 0 || (x < 0 && (g < 0 || a < 0))) throw new Error('operativa: columnas no encontradas');
  return monthlyFrom(R.slice(hi + 1), f, r => x >= 0 ? Number(r[x]) : Number(r[g]) - Number(r[a]));
}

export async function cammesaDemand(get) {
  const warn = []; let dte = {}, oper = {};
  try { dte = parseDte(await firstXlsxInZip(await get(CAMMESA_URLS.dte, 'buf'))); } catch (e) { warn.push(`definitiva: ${String(e?.message || e).slice(0, 90)}`); }
  try { oper = parseOper(await firstXlsxInZip(await get(CAMMESA_URLS.oper, 'buf'))); } catch (e) { warn.push(`operativa: ${String(e?.message || e).slice(0, 90)}`); }
  const gumaExAluar = { ...oper, ...dte }, provisional = Object.keys(oper).filter(k => dte[k] === undefined).sort();
  if (Object.keys(gumaExAluar).length < 48) throw new Error(`CAMMESA: serie corta (${warn.join('; ') || 'sin datos'})`);
  const keys = Object.keys(gumaExAluar).sort();
  return {
    status: 'ok', source: 'CAMMESA — demanda diaria de Grandes Usuarios del MEM (sin ALUAR)', sourceUrl: CAMMESA_PAGE,
    unit: 'MW medios', gumaExAluar: Object.fromEntries(keys.map(k => [k, gumaExAluar[k]])), provisional, latest: { ym: keys.at(-1), provisional: provisional.includes(keys.at(-1)) },
    ...(warn.length ? { warnings: warn } : {})
  };
}

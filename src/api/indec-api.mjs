// v238 · Catálogo API-INDEC (https://api.indec.gob.ar/v1, beta desde nov-2026).
// Requiere el secreto INDEC_API_TOKEN (JWT del perfil del portal) en Cloudflare; sin él, todo esto se saltea y quedan
// las fuentes de siempre (cuadros xls/csv del INDEC y Datos Argentina).
// La API es estilo PostgREST: filtros ?col=op.valor, order, limit (máx. 1000 filas por respuesta) y offset.
// Como los textos exactos de cada columna (descripciones, tipos de indicador, regiones) no están documentados, las filas se
// clasifican con expresiones flexibles y cada servicio deja un diagnóstico (`apiDiag`) con los valores que vio.
const BASE = 'https://api.indec.gob.ar/v1';
let TOKEN = null;
export function setIndecToken(t) { TOKEN = typeof t === 'string' && t.trim() ? t.trim() : null; }
export const indecApiEnabled = () => !!TOKEN;

const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const ymOf = r => { const p = String(r.periodo ?? ''); if (/^\d{6}$/.test(p)) return `${p.slice(0, 4)}-${p.slice(4)}`; const y = Number(r.anio), m = Number(r.mes); return y > 1900 && m >= 1 && m <= 12 ? `${y}-${String(m).padStart(2, '0')}` : null; };
const num = v => { if (typeof v === 'number') return Number.isFinite(v) ? v : null; const s = String(v ?? '').trim(); if (!s || !/\d/.test(s)) return null; const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s); return Number.isFinite(n) ? n : null; };

async function page(path, params, offset) {
  const q = new URLSearchParams({ ...params, limit: '1000', offset: String(offset) });
  const c = new AbortController(), tm = setTimeout(() => c.abort(), 20000);
  try {
    const r = await fetch(`${BASE}/${path}?${q}`, { signal: c.signal, headers: { authorization: `Bearer ${TOKEN}`, accept: 'application/json', 'user-agent': 'macrodatos.ar (Cloudflare Worker)' } });
    if (!r.ok) { let msg = ''; try { msg = (await r.json())?.message || ''; } catch {} throw new Error(`HTTP ${r.status}${msg ? ` ${String(msg).slice(0, 80)}` : ''}`); }
    const j = await r.json(); if (!Array.isArray(j)) throw new Error('respuesta inesperada'); return j;
  } finally { clearTimeout(tm); }
}
// Hasta `maxPages` páginas de 1000 filas (orden estable por la clave primaria de cada tabla).
export async function indecApiRows(path, params = {}, maxPages = 6) {
  if (!TOKEN) throw new Error('sin INDEC_API_TOKEN');
  const out = [];
  for (let p = 0; p < maxPages; p++) { const rows = await page(path, params, p * 1000); out.push(...rows); if (rows.length < 1000) break; }
  return out;
}

// Valores distintos de algunas columnas, para revisar la clasificación desde /api/macro-data.
function diag(rows, cols, extra = {}) {
  const d = { rows: rows.length, ...extra };
  for (const c of cols) { const s = [...new Set(rows.map(r => r[c]).filter(v => v != null && v !== ''))]; if (s.length) d[c] = s.slice(0, 14).map(v => String(v).slice(0, 70)); }
  const yms = rows.map(ymOf).filter(Boolean).sort(); if (yms.length) { d.first = yms[0]; d.last = yms.at(-1); }
  return d;
}
const kindOf = t => { const s = norm(t); if (/desestacionaliz/.test(s)) return 'sa'; if (/tendencia/.test(s)) return 'trend'; if (/original/.test(s)) return 'orig'; return null; };
const measureOf = t => { const s = norm(t); if (/acumulad/.test(s)) return 'ytd'; if (/interanual|(mismo|igual) (mes|periodo) del ano anterior|i\.a\./.test(s)) return 'yoy'; if (/mensual|intermensual|mes anterior|m\/m/.test(s)) return 'mom'; if (/indice|nivel|numero/.test(s)) return 'index'; return null; };
const sinceYm = (months) => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - months); return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };
const put = (o, k, v) => { if (k && v != null) o[k] = v; };
const yoyFrom = L => { const o = {}; for (const [k, v] of Object.entries(L)) { const [y, m] = k.split('-'); const p = L[`${+y - 1}-${m}`]; if (p > 0 && v > 0) o[k] = Number(((v / p - 1) * 100).toFixed(1)); } return o; };
const momFrom = L => { const ks = Object.keys(L).sort(), o = {}; for (let i = 1; i < ks.length; i++) { const [y, m] = ks[i].split('-').map(Number), pk = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`; if (ks[i - 1] === pk && L[pk] > 0) o[ks[i]] = Number(((L[ks[i]] / L[pk] - 1) * 100).toFixed(1)); } return o; };

// EMAE nivel general: índices original/desestacionalizado y variaciones.
export async function emaeApi() {
  const rows = await indecApiRows('estimador-mensual-de-actividad-economica-nivel-general', { periodo: `gte.${sinceYm(40)}`, order: 'tipo_de_indicador_descripcion,anio,mes,periodo,tipo_de_indicador' }, 4);
  const L = { orig: {}, sa: {} }, V = { yoy: {}, mom: {} };
  for (const r of rows) {
    const ym = ymOf(r), v = num(r.valor); if (!ym || v == null) continue;
    const k = kindOf(`${r.tipo_de_indicador_descripcion} ${r.tipo_de_indicador}`), me = measureOf(r.tipo_de_indicador) || measureOf(r.tipo_de_indicador_descripcion);
    if (me === 'index' && (k === 'orig' || k === 'sa')) put(L[k], ym, v);
    else if (me === 'yoy' && k !== 'sa' && k !== 'trend') put(V.yoy, ym, v);
    else if (me === 'mom' && k === 'sa') put(V.mom, ym, v);
  }
  const monthlyYoy = { ...yoyFrom(L.orig), ...V.yoy }, monthlySaMom = { ...momFrom(L.sa), ...V.mom };
  return { level: L.orig, monthlyYoy, monthlySaMom, url: `${BASE}/estimador-mensual-de-actividad-economica-nivel-general`, apiDiag: diag(rows, ['tipo_de_indicador_descripcion', 'tipo_de_indicador', 'unidad_de_medida', 'observaciones'], { yoy: Object.keys(monthlyYoy).length, saMom: Object.keys(monthlySaMom).length }) };
}

// IPI manufacturero, nivel general.
export async function ipiApi() {
  let rows = [];
  try { rows = await indecApiRows('ipi_manufacturero', { descripcion: 'ilike.*nivel general*', periodo: `gte.${sinceYm(40)}`, order: 'periodo,indicador,cuadro_web,codigo_CLaNAE_2004,descripcion,serie,tipo_de_indicador' }, 3); } catch (e) { throw e; }
  if (!rows.length) rows = (await indecApiRows('ipi_manufacturero', { periodo: `gte.${sinceYm(14)}`, order: 'periodo,indicador,cuadro_web,codigo_CLaNAE_2004,descripcion,serie,tipo_de_indicador' }, 4)).filter(r => /nivel general|^total/i.test(norm(r.descripcion)) || !String(r.codigo_CLaNAE_2004 ?? '').trim());
  const L = { orig: {}, sa: {} }, V = { yoy: {}, mom: {} };
  for (const r of rows) {
    const ym = ymOf(r), v = num(r.valor); if (!ym || v == null) continue;
    const k = kindOf(r.serie), me = measureOf(r.tipo_de_indicador) || measureOf(r.unidad_de_medida);
    if (me === 'index' && (k === 'orig' || k === 'sa')) put(L[k], ym, v);
    else if (me === 'yoy' && (k === 'orig' || !k)) put(V.yoy, ym, v);
    else if (me === 'mom' && k === 'sa') put(V.mom, ym, v);
  }
  const monthlyYoy = { ...yoyFrom(L.orig), ...V.yoy }, monthlySaMom = { ...momFrom(L.sa), ...V.mom };
  return { level: L.orig, monthlyYoy, monthlySaMom, url: `${BASE}/ipi_manufacturero`, apiDiag: diag(rows, ['indicador', 'cuadro_web', 'descripcion', 'serie', 'tipo_de_indicador', 'unidad_de_medida'], { yoy: Object.keys(monthlyYoy).length, saMom: Object.keys(monthlySaMom).length }) };
}

// IPC nacional, nivel general: índice (base dic-2016=100) de los últimos meses.
export async function ipcApi(months = 15) {
  const order = 'clasificador,nivel,codigo,descripcion,periodo,anio,mes,indicador,tipo_de_indicador,tipo_de_indicador_descripcion,region,unidad_de_medida';
  let rows = await indecApiRows('ipc_nacional', { descripcion: 'ilike.*nivel general*', periodo: `gte.${sinceYm(months)}`, order }, 4);
  if (!rows.length) rows = await indecApiRows('ipc_nacional', { periodo: `gte.${sinceYm(3)}`, order }, 5);
  const idx = {}, mom = {}, regions = new Set();
  for (const r of rows) {
    const reg = norm(r.region); regions.add(r.region);
    if (reg && !/nacional|total pais|^total$/.test(reg)) continue;
    if (!/nivel general/.test(norm(r.descripcion)) && !/general/.test(norm(r.nivel))) continue;
    const ym = ymOf(r), v = num(r.valor); if (!ym || v == null) continue;
    const me = measureOf(`${r.tipo_de_indicador} ${r.tipo_de_indicador_descripcion}`);
    if (me === 'index') put(idx, ym, v); else if (me === 'mom') put(mom, ym, v);
  }
  return { index: idx, mom, url: `${BASE}/ipc_nacional`, apiDiag: diag(rows, ['clasificador', 'nivel', 'descripcion', 'indicador', 'tipo_de_indicador', 'tipo_de_indicador_descripcion', 'region', 'unidad_de_medida'], { regions: [...regions].slice(0, 10), months: Object.keys(idx).length }) };
}

// Índice de salarios (base oct-2016=100): total, registrado, privado registrado, público y no registrado.
export async function wagesApi() {
  const order = 'clasificador,nivel,codigo,descripcion,periodo,anio,mes,indicador,tipo_de_indicador,tipo_de_indicador_descripcion,unidad_de_medida';
  const rows = await indecApiRows('indice_salarios', { periodo: `gte.${sinceYm(26)}`, order }, 4);
  const M = { total: {}, totalReg: {}, privReg: {}, pub: {}, nonReg: {} };
  const keyOf = d => { const s = norm(d); if (/no registrad/.test(s)) return 'nonReg'; if (/public/.test(s)) return 'pub'; if (/privad/.test(s) && /registrad/.test(s)) return 'privReg'; if (/registrad/.test(s)) return 'totalReg'; if (/total|nivel general|indice de salarios$/.test(s)) return 'total'; return null; };
  for (const r of rows) {
    const me = measureOf(`${r.tipo_de_indicador} ${r.tipo_de_indicador_descripcion}`); if (me !== 'index') continue;
    const k = keyOf(r.descripcion), ym = ymOf(r), v = num(r.valor); if (k && ym && v != null && M[k][ym] == null) M[k][ym] = v;
  }
  return { monthly: M, url: `${BASE}/indice_salarios`, apiDiag: diag(rows, ['clasificador', 'nivel', 'codigo', 'descripcion', 'indicador', 'tipo_de_indicador', 'tipo_de_indicador_descripcion', 'unidad_de_medida'], Object.fromEntries(Object.entries(M).map(([k, o]) => [k, Object.keys(o).length]))) };
}

// Seguridad: la API sólo se usa si coincide con lo que ya tenemos en los meses en común.
// Niveles: diferencia relativa ≤ 0,3%; variaciones (%): ≤ 0,15 p.p. en al menos el 90% de los meses comparados.
export function agrees(ours, api, kind = 'level') {
  const common = Object.keys(api).filter(k => Number.isFinite(Number(ours?.[k])) && Number.isFinite(Number(api[k])));
  if (common.length < 3) return { ok: true, compared: common.length };
  const okN = common.filter(k => kind === 'level' ? Math.abs(api[k] / ours[k] - 1) <= 0.003 : Math.abs(api[k] - ours[k]) <= 0.15).length;
  return { ok: okN / common.length >= 0.9, compared: common.length, matching: okN };
}

// v160 · Reservas internacionales del BCRA: brutas (diarias desde 1996) y netas con tres metodologías.
//
// Fuentes que se leen en vivo (API de Estadísticas del BCRA, v4.0):
//   var 1    Reservas internacionales (brutas), millones de USD, desde 1996.
//   var 1243 Cuentas corrientes en moneda extranjera en el BCRA (encajes de los bancos), desde 2003.
//   var 76   Divisas – pase pasivo en dólares con el exterior (repos con bancos), desde 2003.
// Componentes mensuales investigados y documentados (public/reserves-components.json): swap con China (CNY y tipo
// de cambio), BIS y otros pasivos de corto plazo (incluye el swap con el Tesoro de EE.UU.), SEDESA, oro (toneladas ×
// precio), tenencias de DEG y crédito del FMI (FMI, "Financial Position in the Fund").
//
// Metodologías (todas en millones de USD):
//   mercado  = brutas − encajes − swap China (total, en CNY al tipo de cambio) − repos − BIS/otros − SEDESA
//   liquidas = mercado − oro − tenencias de DEG
//   fmi      = definición del programa 2025 (TMU): brutas netas de swaps, seguro de depósitos, encajes y otros pasivos
//              de reservas, y excluyendo el cambio en el crédito neto del FMI desde 2025 → mercado − (crédito FMI(t) −
//              crédito FMI(dic-2024)). Sólo desde ene-2025. Se calcula a precios de mercado, no a los "tipos de cambio
//              del programa".
const API = 'https://api.bcra.gob.ar/estadisticas/v4.0/monetarias';
const KV_KEY = 'reserves:v2';
const TTL = 6 * 3600e3;

async function fetchJson(url, ms = 12000) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), ms);
  try { const r = await fetch(url, { signal: c.signal, headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0 (compatible; macrodatos.ar)' } }); if (!r.ok) throw new Error(`BCRA ${r.status}`); return await r.json(); }
  finally { clearTimeout(t); }
}
// Serie diaria completa de una variable (con paginado).
export async function bcraSeries(id, desde = '1996-01-01') {
  const hasta = new Date().toISOString().slice(0, 10), out = {}, limit = 3000;
  for (let offset = 0, i = 0; i < 6; i++, offset += limit) {
    const j = await fetchJson(`${API}/${id}?desde=${desde}&hasta=${hasta}&limit=${limit}&offset=${offset}`);
    const rows = j?.results?.[0]?.detalle || [];
    for (const x of rows) { const d = String(x?.fecha || '').slice(0, 10), v = Number(x?.valor); if (d && Number.isFinite(v)) out[d] = v; }
    const count = Number(j?.metadata?.resultset?.count);
    if (!rows.length || (Number.isFinite(count) ? offset + rows.length >= count : rows.length < limit)) break;
  }
  return out;
}
// Último dato de cada mes (y el último disponible).
export function monthEnds(daily) {
  const m = {}; for (const d of Object.keys(daily).sort()) m[d.slice(0, 7)] = { date: d, v: daily[d] }; return m;
}
const r1 = x => x == null || !Number.isFinite(x) ? null : Math.round(x);

// ---------- Posición de Argentina en el FMI (fin de cada mes), guardada en KV y completada de a poco ----------
// Página oficial: https://www.imf.org/external/np/fin/tad/exfin2.aspx?memberKey1=30&date1key=AAAA-MM-DD
// Se leen (en millones de DEG) las tenencias de DEG ("SDR Department … Holdings") y el crédito vigente del FMI
// (sección IV "Outstanding Purchases and Loans", suma de todos los programas).
const IMF_KEY = 'imfpos:v1';
export function parseImfPosition(html) {
  const t = String(html || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, '|').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').replace(/(\s*\|\s*)+/g, '|');
  const sdrSec = (t.match(/SDR Department:(.*?)IV\.[|\s]*Outstanding/i) || [])[1];
  const ivSec = (t.match(/IV\.[|\s]*Outstanding Purchases and Loans:?(.*?)\bV\.[|\s]*Latest Financial/i) || [])[1];
  if (sdrSec == null || ivSec == null) return null;
  const num = x => Number(String(x).replace(/,/g, ''));
  const h = sdrSec.match(/Holdings\|?\s*([\d,]+\.\d+)/i);
  let credit = 0;
  for (const m of ivSec.matchAll(/([A-Za-z][A-Za-z .\-]*?)\|?\s*([\d,]+\.\d{2})\|?\s*[\d,]+\.\d{2}/g)) if (!/total|sdr million|quota/i.test(m[1])) credit += num(m[2]);
  return { holdings: h ? num(h[1]) : 0, credit };
}
async function fetchText(url, ms = 12000) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), ms);
  try { const r = await fetch(url, { signal: c.signal, headers: { accept: 'text/html', 'user-agent': 'Mozilla/5.0 (compatible; macrodatos.ar)' } }); if (!r.ok) throw new Error(`FMI ${r.status}`); return await r.text(); }
  finally { clearTimeout(t); }
}
const monthEnd = ym => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
// Completa hasta `max` meses faltantes por llamada (primero 2024–hoy, después hacia atrás hasta 2003).
export async function imfBackfill(env, max = 10) {
  let st = {}; try { st = (await env?.MACRO_STORE?.get?.(IMF_KEY, 'json')) || {}; } catch { }
  const now = new Date(Date.now() - 3 * 3600e3), cur = now.toISOString().slice(0, 7), want = [];
  // 2003–sep 2026 vienen en public/reserves-components.json (imfPos); acá sólo se agregan los meses posteriores.
  for (let y = 2026; y <= now.getUTCFullYear(); y++) for (let m = 1; m <= 12; m++) { const k = `${y}-${String(m).padStart(2, '0')}`; if (k >= '2026-09' && k < cur) want.push(k); }
  const missing = want.filter(k => !st[k]).sort((a, b) => (b >= '2024-12') - (a >= '2024-12') || b.localeCompare(a));
  // El mes en curso se vuelve a leer como mucho una vez por día.
  const today = now.toISOString().slice(0, 10), todo = missing.slice(0, max).map(k => [k, monthEnd(k)]);
  if (!st._cur || st._cur.date !== today) todo.unshift(['_cur', today]);
  let changed = false;
  for (const [k, d] of todo.slice(0, max)) {
    try { const x = parseImfPosition(await fetchText(`https://www.imf.org/external/np/fin/tad/exfin2.aspx?memberKey1=30&date1key=${d}`)); if (x) { st[k] = { ...x, date: d }; changed = true; } else { st._err = `${d}: formato de la página del FMI no reconocido`; changed = true; } } catch (e) { st._err = String(e?.message || e).slice(0, 120); }
  }
  if (changed) { try { await env?.MACRO_STORE?.put?.(IMF_KEY, JSON.stringify(st)); } catch { } }
  return st;
}

// Combina las series del BCRA con los componentes documentados.
export function buildReserves(gross, encajes, repos, C, imfPos = {}, sdr83 = {}, usdPerSdrNow = null) {
  const G = monthEnds(gross), E = monthEnds(encajes), R = monthEnds(repos);
  const months = Object.keys(G).sort().filter(k => k >= '1996-01');
  const val = (map, k) => { const x = map?.[k]; return Number.isFinite(Number(x)) ? Number(x) : null; };
  const carry = (map, k) => { if (!map) return null; if (val(map, k) != null) return val(map, k); const ks = Object.keys(map).filter(x => x <= k).sort(); return ks.length ? val(map, ks.at(-1)) : null; };
  // USD por DEG: la serie diaria del BCRA de las asignaciones de DEG de 2009 (var 83, en USD) se divide por esa misma
  // asignación en DEG, que se obtiene con la cotización actual del FMI. Antes de sep-2009 se usa la del primer dato.
  const S83 = monthEnds(sdr83), k83 = Object.keys(S83).sort(), last83 = k83.length ? S83[k83.at(-1)].v : null;
  const alloc = usdPerSdrNow && last83 ? last83 / usdPerSdrNow : null;
  const usdPerSdr = k => { if (!alloc) return C.usdPerSdr?.[k] ?? null; const x = S83[k]?.v ?? (k < (k83[0] || '') ? S83[k83[0]]?.v : null); return x ? x / alloc : null; };
  const imfUsd = (k, field) => { const p = imfPos[k]; const r = usdPerSdr(k); return p && r ? p[field] * r : null; };
  const imfBase = imfUsd('2024-12', 'credit') ?? carry(C.imfCreditUsd, '2024-12');
  const rows = [];
  for (const k of months) {
    const g = G[k]?.v, enc = E[k]?.v ?? null, rep = R[k]?.v ?? (k >= '2003-01' ? 0 : null);
    const cny = carry(C.cnyPerUsd, k), swapCny = val(C.swapCnyBn, k) ?? (k < '2014-10' ? 0 : carry(C.swapCnyBn, k));
    const swap = swapCny != null && cny ? swapCny * 1000 / cny : null;
    const after = C.through && k > C.through; // después del último mes documentado se mantiene el último valor
    const bis = (after ? carry(C.bisOther, C.through) : val(C.bisOther, k)) ?? 0, sedesa = (after ? carry(C.sedesa, C.through) : val(C.sedesa, k)) ?? 0;
    const tonnes = carry(C.goldTonnes, k), price = carry(C.goldPrice, k), gold = tonnes != null && price != null ? tonnes * 32150.7466 * price / 1e6 : null;
    const sdr = imfUsd(k, 'holdings') ?? val(C.sdrHoldingsUsd, k), imf = imfUsd(k, 'credit') ?? val(C.imfCreditUsd, k);
    const row = { m: k, date: G[k].date, brutas: r1(g) };
    if (enc != null && k >= '2003-01' && swap != null) {
      row.encajes = r1(enc); row.swap = r1(swap); row.repos = r1(rep); row.bis = r1(bis); row.sedesa = r1(sedesa);
      row.mercado = r1(g - enc - swap - rep - bis - sedesa);
      if (gold != null && sdr != null) { row.oro = r1(gold); row.deg = r1(sdr); row.liquidas = r1(row.mercado - gold - sdr); }
      if (k >= '2025-01' && imf != null && imfBase != null) { row.fmiNeto = r1(imf - imfBase); row.fmi = r1(row.mercado - (imf - imfBase)); }
    }
    rows.push(row);
  }
  return rows;
}

// Cotización actual del DEG (USD por DEG) publicada por el FMI.
export async function usdPerSdr() {
  const h = await fetchText('https://www.imf.org/external/np/fin/data/rms_sdrv.aspx');
  const t = h.replace(/<[^>]+>/g, '|').replace(/\s+/g, ' ');
  const m = t.match(/SDR\s*1\s*=\s*US\$[\s|]*([\d.]+)/i) || t.match(/U\.S\.\s*\$\s*1\.00\s*=\s*SDR[\s|]*([\d.]+)/i);
  if (!m) throw new Error('FMI: sin cotización del DEG');
  let v = Number(m[1]); if (v < 1) v = 1 / v; // si vino "DEG por USD"
  if (!(v > 1.1 && v < 1.8)) throw new Error('FMI: cotización del DEG fuera de rango');
  return v;
}
export default async function reserves(env, ctx, components) {
  const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=1800', 'access-control-allow-origin': '*' };
  let stored = null; try { stored = await env?.MACRO_STORE?.get?.(KV_KEY, 'json'); } catch { }
  if (stored?.generatedAt && Date.now() - Date.parse(stored.generatedAt) < (stored.imfMonths >= 280 ? TTL : 30 * 60e3)) return new Response(JSON.stringify(stored), { headers: { ...headers, 'x-reserves-cache': 'kv' } });
  try {
    const [g, e, r, a83, pos, rate] = await Promise.all([bcraSeries(1, '1996-01-01'), bcraSeries(1243, '2003-01-01'), bcraSeries(76, '2003-01-01'), bcraSeries(83, '2009-08-01').catch(() => ({})), imfBackfill(env, 6).catch(() => ({})), usdPerSdr().catch(() => null)]);
    if (Object.keys(g).length < 1000) throw new Error('BCRA: serie de reservas incompleta');
    const cur = pos?._cur; const P = { ...(components?.imfPos || {}), ...pos }; if (cur?.date) P[cur.date.slice(0, 7)] = cur;
    const rows = buildReserves(g, e, r, components || {}, P, a83, rate);
    const imfMonths = Object.keys(P).filter(k => /^\d{4}-\d{2}$/.test(k)).length;
    const body = { status: 'ok', imfMonths, imfError: pos?._err || null, usdPerSdr: rate, generatedAt: new Date().toISOString(), source: 'BCRA (reservas, encajes, repos) + componentes documentados (swap China, BIS, SEDESA, oro, DEG, FMI)', componentsThrough: components?.through || null, rows };
    try { const w = env?.MACRO_STORE?.put?.(KV_KEY, JSON.stringify(body)); if (w && ctx?.waitUntil) ctx.waitUntil(w); } catch { }
    return new Response(JSON.stringify(body), { headers });
  } catch (err) {
    if (stored?.rows) return new Response(JSON.stringify({ ...stored, status: 'snapshot', refreshError: String(err?.message || err) }), { headers });
    return new Response(JSON.stringify({ status: 'error', error: String(err?.message || err) }), { status: 503, headers: { ...headers, 'cache-control': 'no-store' } });
  }
}

// v255 · Producción de granos (Secretaría de Agricultura — Dirección de Estimaciones Agrícolas).
// - Anual: producción por campaña y cultivo (datosestimaciones.magyp.gob.ar, CSV del formulario «Descargar»).
// - Mensual: cosecha acumulada = producción de la campaña × % del área cosechada al último informe semanal del mes
//   (tablas «AVANCE DE LA COSECHA DE …», fila del total país). La producción de la campaña es la final del CSV anual o,
//   si la campaña todavía no está ahí, la estimación del último informe mensual («Producción estimada (ton)»).
// Este módulo no depende de nada del worker: el mismo código se usó para reconstruir el histórico embebido.

import { GRAINS_BASE_ANNUAL, GRAINS_BASE_PROGRESS, GRAINS_BASE_ESTIMATES, GRAINS_BASE_PRICES } from './grains-history.mjs';

export const GRAIN_CROPS = [
  ['soja', 'Soja'], ['maiz', 'Maíz'], ['trigo', 'Trigo'], ['girasol', 'Girasol'], ['cebada', 'Cebada'], ['sorgo', 'Sorgo'],
];
const MAIN = new Set(GRAIN_CROPS.map(([k]) => k));
const REPORTS = 'https://www.magyp.gob.ar/sitio/areas/estimaciones/estimaciones/informes/';
const ESTIM = 'https://datosestimaciones.magyp.gob.ar/reportes.php?reporte=Estimaciones';
// Id del cultivo en el formulario de datosestimaciones → clave propia ('otros' suma el resto de los granos).
const CSV_IDS = { 32: 'maiz', 25: 'soja', 28: 'trigo', 14: 'girasol', 33: 'cebada', 9: 'cebadaCerv', 10: 'cebadaForr', 26: 'sorgo',
  4: 'otros', 5: 'otros', 12: 'otros', 19: 'otros', 20: 'otros', 3: 'otros', 13: 'otros', 17: 'otros', 8: 'otros', 24: 'otros', 38: 'otros', 39: 'otros', 40: 'otros' };
const CSV_NAMES = { 'maiz': 'maiz', 'soja total': 'soja', 'trigo total': 'trigo', 'girasol': 'girasol', 'cebada total': 'cebada', 'cebada cervecera': 'cebadaCerv', 'cebada forrajera': 'cebadaForr', 'sorgo': 'sorgo' };
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/"/g, '').trim().toLowerCase();
const numAR = s => { const v = Number(String(s).replace(/\./g, '').replace(',', '.')); return Number.isFinite(v) ? v : null; };
const camp = (a, b) => `20${a}/${b}`; // '25','26' → '2025/26'

// ---------- PDF → texto plano (Td/T* = espacio, ET = « | », páginas separadas por «\n=====\n») ----------
async function inflate(bytes) {
  const ds = new DecompressionStream('deflate'), w = ds.writable.getWriter(), r = ds.readable.getReader();
  w.write(bytes).catch(() => { }); w.close().catch(() => { });
  const parts = []; let len = 0;
  try { for (;;) { const { done, value } = await r.read(); if (done) break; parts.push(value); len += value.length; } } catch { }
  const all = new Uint8Array(len); let o = 0; for (const p of parts) { all.set(p, o); o += p.length; }
  return new TextDecoder('latin1').decode(all);
}
const unesc = s => s.replace(/\\(\d{1,3})/g, (_, o) => String.fromCharCode(parseInt(o, 8))).replace(/\\(.)/g, '$1');
export async function pdfPlain(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf), s = new TextDecoder('latin1').decode(u8), pages = [];
  const re = /stream\r?\n/g; let m;
  while ((m = re.exec(s))) {
    const st = m.index + m[0].length, en = s.indexOf('endstream', st); if (en < 0) break;
    const head = s.slice(Math.max(0, m.index - 400), m.index), dict = head.slice(head.lastIndexOf('obj'));
    if (!/FlateDecode/.test(dict) || /\/Subtype\s*\/(Image|Type1C|CIDFontType0C|XML)|\/Length[123]\s|\/ObjStm|\/XRef/.test(dict)) continue; // fuentes, imágenes y tablas internas no tienen texto
    const L = dict.match(/\/Length\s+(\d+)(?!\s+\d+\s+R)/); let end = L ? Math.min(st + Number(L[1]), en) : en;
    if (!L) while (end > st && (u8[end - 1] === 10 || u8[end - 1] === 13)) end--;
    const t = await inflate(u8.subarray(st, end)); if (!/\bBT\b/.test(t) || !/T[jJ]/.test(t)) continue;
    let o = '';
    for (const x of t.matchAll(/\[((?:\((?:\\.|[^\\)])*\)|[^\]])*)\]\s*TJ|\(((?:\\.|[^\\)])*)\)\s*Tj|(T\*|Td|TD|ET)/g)) {
      if (x[1] != null) o += [...x[1].matchAll(/\(((?:\\.|[^\\)])*)\)/g)].map(y => unesc(y[1])).join('');
      else if (x[2] != null) o += unesc(x[2]);
      else o += x[3] === 'ET' ? ' | ' : ' ';
    }
    pages.push(o.replace(/[ \t]+/g, ' '));
  }
  return pages.join('\n=====\n');
}

// ---------- Informe semanal: % cosechado (total país) por cultivo ----------
const HARVEST_TITLE = /AVANCE DE LA COSECHA DE (SOJA|MA[IÍ]Z|TRIGO|GIRASOL|CEBADA|SORGO)/gi;
const cropKey = t => ({ SOJA: 'soja', MAIZ: 'maiz', 'MAÍZ': 'maiz', TRIGO: 'trigo', GIRASOL: 'girasol', CEBADA: 'cebada', SORGO: 'sorgo' })[t.toUpperCase()];
export function parseHarvestProgress(text) {
  const best = {};
  for (const page of String(text).split('\n=====\n')) {
    const titles = [...page.matchAll(HARVEST_TITLE)].map(m => ({ crop: cropKey(m[1]), at: m.index, end: m.index + m[0].length })).filter(t => t.crop);
    if (!titles.length) continue;
    // Con un solo cultivo, toda la página; con varios, el texto anterior a cada título (en estos PDFs el título va después de la tabla).
    const segs = new Set(titles.map(t => t.crop)).size === 1 ? [[titles[0].crop, page]] : titles.map((t, i) => [t.crop, page.slice(i ? titles[i - 1].end : 0, t.at)]);
    for (const [crop, seg] of segs) scanRows(crop, seg, best);
  }
  // Por cultivo: la campaña más nueva es la que se está cosechando; la anterior sirve de comparación.
  const out = {};
  for (const r of Object.values(best)) { if (!out[r.crop] || r.campaign > out[r.crop].campaign) out[r.crop] = { campaign: r.campaign, pct: r.pct, area: r.area }; }
  for (const r of Object.values(best)) { const o = out[r.crop]; if (o && r.campaign < o.campaign && (!o.prev || r.campaign > o.prev.campaign)) o.prev = { campaign: r.campaign, pct: r.pct }; }
  return out;
}
function scanRows(crop, page, best) {
  {
    // El texto puede venir pegado («7.06625/26 6.821.962 33 47 …»): se escanea con regex, sin depender de separadores.
    // También el % puede venir pegado a la campaña siguiente («… 9 1722/23 …»): se separa antes de escanear.
    page = page.replace(/(\d)(\d{2})\/(\d{2})(?!\d*\/)/g, (w, d, a, b) => (+a + 1) % 100 === +b ? `${d} ${a}/${b}` : w);
    // El área va pegada al primer % («10.651.2614 7 14 …» = 10.651.261 ha y 4 %): el área toma sólo grupos de tres dígitos.
    const re = /(\d{2})\/(\d{2})\s*\|?\s*(\d{1,3}(?:\.\d{3})+)/g, pr = /\s*\|?\s*(\d{1,3}(?:,\d{1,2})?)(?![\d.,\/])/y; let m;
    while ((m = re.exec(page))) {
      if ((Number(m[1]) + 1) % 100 !== Number(m[2])) continue;
      const area = numAR(m[3]), pcts = []; pr.lastIndex = re.lastIndex; let x;
      while (pcts.length < 12 && (x = pr.exec(page))) { const v = numAR(x[1]); if (v > 100 || (pcts.length && v < pcts.at(-1))) break; pcts.push(v); }
      if (pcts.length < 2 || area < 1000) continue;
      const k = `${crop}|${camp(m[1], m[2])}`;
      if (!best[k] || area > best[k].area) best[k] = { crop, campaign: camp(m[1], m[2]), area, pct: pcts.at(-1) };
    }
  }
}

// ---------- Informe mensual: producción estimada de la campaña en curso ----------
export function parseMonthlyEstimates(text) {
  const s = String(text).replace(/[\s|]+/g, ''), out = {};
  const re = /(TRIGO|CEBADA|GIRASOL|MA[IÍ]Z|SOJA|SORGO(?:GRAN[IÍ]FERO)?)Campa[nñ]a(?:20)?(\d{2})\/(?:20)?(\d{2})/g; let m;
  while ((m = re.exec(s))) {
    const crop = cropKey(m[1].replace(/GRAN[IÍ]FERO/, '')); if (!crop || out[crop]) continue;
    const seg = s.slice(m.index, m.index + 2500), p = seg.match(/Producci[oó]n(?:estimada)?(?:degrano)?\((?:ton|tn|t)\)((?:\d{1,3}(?:\.\d{3})+|-)+)/i);
    if (!p) continue;
    const tk = p[1].match(/\d{1,3}(?:\.\d{3})+|-/g) || [], cur = tk[2] ?? null, v = cur && cur !== '-' ? numAR(cur) : null;
    if (v && v > 1e5) out[crop] = { campaign: camp(m[2], m[3]), tons: v };
  }
  return out;
}

// ---------- CSV anual ----------
export function parseAnnualCsv(csv) {
  const by = {};
  for (const line of String(csv).split(/\r?\n/).slice(1)) {
    const [c, cp, v] = line.split(';'); if (!c || !/^\d{4}\/\d{2}$/.test(String(cp).trim())) continue;
    const n = norm(c), key = CSV_NAMES[n] || 'otros', val = Number(String(v).trim()); if (!Number.isFinite(val)) continue;
    const y = (by[cp.trim()] ??= {}); y[key] = (y[key] || 0) + val;
  }
  const out = {};
  for (const [cp, y] of Object.entries(by)) {
    const o = {}; for (const k of MAIN) if (k !== 'cebada' && y[k]) o[k] = Math.round(y[k]);
    const ceb = y.cebada || ((y.cebadaCerv || 0) + (y.cebadaForr || 0)); if (ceb) o.cebada = Math.round(ceb);
    if (y.otros) o.otros = Math.round(y.otros);
    if (Object.keys(o).length >= 3) out[cp] = o;
  }
  return out;
}

// ---------- Cosecha mensual a partir de los % de fin de mes ----------
// progress: { 'YYYY-MM': { crop: { campaign, pct } } } · prod(crop, campaign) → toneladas o null.
export function monthlyHarvest(progress, prod) {
  // Cuando la tabla de un cultivo deja de publicarse con ≥60 % cosechado, el resto se asigna a ese mes (la cosecha terminó).
  const months = Object.keys(progress).sort(), cum = {}, last = {}, monthly = {}, accum = {};
  for (const ym of months) {
    const row = {}, acc = {}, seen = new Set();
    for (const [crop, p] of Object.entries(progress[ym] || {})) {
      if (!p || !p.campaign) continue;
      const P = prod(crop, p.campaign); if (!P) continue;
      const k = `${crop}|${p.campaign}`, before = cum[k] ?? 0, tons = Math.max(before, Math.round(P * Math.min(100, p.pct) / 100));
      row[crop] = (row[crop] || 0) + tons - before; cum[k] = tons; last[k] = { crop, campaign: p.campaign, pct: p.pct, P }; seen.add(k);
      acc[crop] = { campaign: p.campaign, tons, pct: p.pct };
    }
    for (const [k, L] of Object.entries(last)) {
      if (seen.has(k) || L.done || L.pct < 60) continue;
      const rest = L.P - cum[k]; if (rest > 0) { row[L.crop] = (row[L.crop] || 0) + rest; cum[k] = L.P; }
      L.done = true; acc[L.crop] ??= { campaign: L.campaign, tons: L.P, pct: 100 };
    }
    for (const [k, L] of Object.entries(last)) if (seen.has(k) && L.pct >= 100) L.done = true;
    monthly[ym] = row; accum[ym] = acc;
  }
  return { monthly, accum };
}

// ---------- Descargas (worker) ----------
async function getText(url, init) { const r = await fetch(url, { ...init, headers: { 'user-agent': 'Mozilla/5.0 (macrodatos.ar)', ...(init?.headers || {}) }, cf: { cacheTtl: 3600 } }); if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`); return r; }
export async function grainsAnnual() {
  const fd = new URLSearchParams();
  for (const id of Object.keys(CSV_IDS)) fd.append('cultivo[]', id);
  fd.append('variable[]', 'Producción'); fd.append('desde', '1'); fd.append('hasta', '200'); fd.append('agregacion', 'Total País'); fd.append('nombre', ''); fd.append('submit', 'Descargar');
  const r = await getText(ESTIM, { method: 'POST', body: fd, headers: { 'content-type': 'application/x-www-form-urlencoded' } });
  const csv = new TextDecoder('latin1').decode(await r.arrayBuffer()), annual = parseAnnualCsv(csv);
  if (Object.keys(annual).length < 20) throw new Error(`granos: CSV anual con ${Object.keys(annual).length} campañas`);
  return annual;
}
// Último informe semanal y último mensual publicados (mes en curso y, si hace falta, el anterior).
export async function grainsLatestReports(now = new Date()) {
  const ym = d => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`, prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const links = [];
  for (const m of [ym(now), ym(prev)]) {
    try { const html = await (await getText(`${REPORTS}?mes=${m}`)).text(); for (const x of html.matchAll(/href="([^"]+\.pdf)"/gi)) links.push(new URL(x[1].replace(/ /g, '%20'), REPORTS).href); } catch { }
  }
  const dated = links.map(u => { const d = decodeURIComponent(u).match(/(\d{2})_(\d{2})_(\d{4})\.pdf$/); return d ? { u, date: `${d[3]}-${d[2]}-${d[1]}`, weekly: /semanal/i.test(decodeURIComponent(u)) } : null; }).filter(Boolean).sort((a, b) => b.date.localeCompare(a.date));
  return { weekly: dated.find(x => x.weekly) || null, monthly: dated.find(x => !x.weekly) || null };
}
export async function grainsPdf(url) { return pdfPlain(await (await getText(url)).arrayBuffer()); }
export const GRAINS_URLS = { reports: REPORTS, annual: ESTIM };

// ---------- Precios FOB oficiales (API diaria de la Secretaría de Agricultura) ----------
// Posición NCM por cultivo; se toma el embarque más cercano y, entre variantes (granel/embolsado), el menor precio.
export const FOB_NCM = { soja: '12019000', maiz: '10059010', trigo: '10019900', girasol: '12060090', sorgo: '10079000', cebada: '10039010' };
const FOB_API = 'https://www.magyp.gob.ar/sitio/areas/ss_mercados_agropecuarios/ws/ssma/precios_fob.php';
export function pickFob(posts) {
  const out = {}, per = r => (Number(r['añoDesde']) * 12 + Number(r.mesDesde)) || 0;
  for (const [c, pre] of Object.entries(FOB_NCM)) {
    const rows = (posts || []).filter(p => String(p.posicion).startsWith(pre) && Number(p.precio) > 0); if (!rows.length) continue;
    const mn = Math.min(...rows.map(per)); out[c] = Math.min(...rows.filter(r => per(r) === mn).map(r => Number(r.precio)));
  }
  return out;
}
export async function grainsFobLatest(now = new Date()) {
  for (let k = 0; k < 8; k++) {
    const d = new Date(now.getTime() - k * 864e5), dow = d.getUTCDay(); if (dow === 0 || dow === 6) continue;
    const s = `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
    try {
      const t = await (await getText(`${FOB_API}?Fecha=${s}`)).text(); if (/too many/i.test(t)) continue;
      const p = pickFob(JSON.parse(t).posts); if (Object.keys(p).length >= 3) return { date: d.toISOString().slice(0, 10), prices: p };
    } catch { }
  }
  return null;
}

// ---------- Job del worker ----------
// Devuelve el histórico embebido más lo que se pueda bajar ahora. El snapshot fusiona objetos en profundidad, así que los
// meses que se van agregando (progress[YYYY-MM]) y las estimaciones por campaña quedan guardados aunque el job sólo
// informe el mes en curso. La cosecha mensual se calcula en el navegador.
export async function grainsJob() {
  const out = { status: 'ok', source: 'Secretaría de Agricultura, Ganadería y Pesca — Estimaciones Agrícolas', sourceUrl: REPORTS, annualUrl: ESTIM,
    unit: 't', crops: GRAIN_CROPS, prices: { ...GRAINS_BASE_PRICES }, fobUrl: FOB_API, annual: { ...GRAINS_BASE_ANNUAL }, progress: { ...GRAINS_BASE_PROGRESS }, estimates: JSON.parse(JSON.stringify(GRAINS_BASE_ESTIMATES)), errors: {} };
  try { Object.assign(out.annual, await grainsAnnual()); } catch (e) { out.errors.annual = String(e?.message || e).slice(0, 160); }
  try {
    const R = await grainsLatestReports();
    if (R.weekly) {
      const p = parseHarvestProgress(await grainsPdf(R.weekly.u)), ym = R.weekly.date.slice(0, 7), row = { d: R.weekly.date };
      for (const [c, x] of Object.entries(p)) row[c] = [x.campaign, x.pct];
      // Un informe que no se pudo leer (sin ninguna tabla) no pisa el mes: sólo se guarda si trae datos o es fuera de cosecha.
      out.progress[ym] = row; out.latestWeekly = { date: R.weekly.date, url: R.weekly.u, crops: p };
    }
    if (R.monthly) {
      const est = parseMonthlyEstimates(await grainsPdf(R.monthly.u));
      for (const [c, x] of Object.entries(est)) (out.estimates[c] ??= {})[x.campaign] = x.tons;
      out.latestMonthly = { date: R.monthly.date, url: R.monthly.u, estimates: est };
    }
  } catch (e) { out.errors.reports = String(e?.message || e).slice(0, 160); }
  // v256: precio FOB oficial del último día hábil con datos → mes en curso (USD por tonelada).
  try { const F = await grainsFobLatest(); if (F) { out.prices[F.date.slice(0, 7)] = F.prices; out.latestFob = F; } } catch (e) { out.errors.fob = String(e?.message || e).slice(0, 160); }
  if (!Object.keys(out.errors).length) delete out.errors;
  return out;
}

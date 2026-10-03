// v128 · Fuentes en vivo para tarjetas que antes dependían sólo de la línea de base incluida en el sitio.
// Cada función devuelve el mismo formato que usa el frontend y nunca inventa meses: si la fuente no
// responde, el handler conserva el último snapshot guardado (KV) o la línea de base.
import { one as cementMonth } from './cement-monthly.mjs';

const UA_BROWSER = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const SERIES = 'https://apis.datos.gob.ar/series/api/series/';
const MONTHS = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };
const ym = (y, m) => `${y}-${String(m).padStart(2, '0')}`;
const num = s => Number(String(s).replace(/\./g, '').replace(',', '.'));

async function fetchWithTimeout(url, opts = {}, ms = 20000) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { ...opts, signal: c.signal, headers: { 'user-agent': UA_BROWSER, 'accept-language': 'es-AR,es;q=.9', ...(opts.headers || {}) } });
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return r;
  } finally { clearTimeout(t); }
}
async function seriesMap(id, start) {
  const end = new Date(); end.setUTCFullYear(end.getUTCFullYear() + 1);
  const url = `${SERIES}?ids=${encodeURIComponent(id)}&start_date=${start}&end_date=${end.toISOString().slice(0, 10)}&limit=1000&sort=desc&format=json&metadata=none`;
  const j = await (await fetchWithTimeout(url, { headers: { accept: 'application/json' } })).json();
  const out = {};
  for (const [d, v] of j.data || []) if (v !== null && Number.isFinite(Number(v))) out[String(d).slice(0, 7)] = Number(v);
  return out;
}

// ---------- Patentamientos 0 km: comunicado mensual de ACARA (API pública de su sitio) ----------
// El artículo dice: "…vehículos patentados durante septiembre de 2026 ascendió a 49.814 unidades, … en
// septiembre de 2025 se habían registrado 56.241 unidades. Si la comparación es contra agosto, … 45.003 unidades."
export function parseAcaraArticle(text) {
  const t = String(text || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  if (/motoveh|maquinaria|tractor/i.test(t.slice(0, 300))) return null;
  const M = '(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)';
  const m = t.match(new RegExp(`patentad[oa]s?\\s+(?:durante|en)\\s+(?:el mes de\\s+)?${M}\\s+(?:de|del)\\s+(20\\d{2})[^.]{0,80}?([\\d.]{4,9})\\s+unidades`, 'i'));
  if (!m) return null;
  const mon = MONTHS[m[1].toLowerCase()], year = +m[2], units = num(m[3]);
  const out = { ym: ym(year, mon), units, history: { [ym(year, mon)]: units } };
  const py = t.match(new RegExp(`en\\s+${M}\\s+(?:de|del)\\s+(${year - 1})\\s+se\\s+habían\\s+(?:registrado|patentado)\\s+([\\d.]{4,9})`, 'i'));
  if (py && MONTHS[py[1].toLowerCase()] === mon) out.history[ym(year - 1, mon)] = num(py[3]);
  const prevMon = mon === 1 ? 12 : mon - 1, prevYear = mon === 1 ? year - 1 : year;
  const pm = t.match(new RegExp(`contra\\s+${M}[^.]{0,160}?([\\d.]{4,9})\\s+unidades`, 'i'));
  if (pm && MONTHS[pm[1].toLowerCase()] === prevMon) out.history[ym(prevYear, prevMon)] = num(pm[2]);
  return out;
}
export async function autosLive() {
  const j = await (await fetchWithTimeout('https://api.acara.org.ar/api/v1/views/index', { headers: { accept: 'application/json' } })).json();
  const arts = (j?.data?.articles || []).filter(a => /patent/i.test(`${a.title} ${a.content}`));
  let best = null;
  for (const a of arts) {
    const p = parseAcaraArticle(`${a.title}. ${a.content}`);
    if (p && (!best || p.ym > best.ym)) best = { ...p, published: a.date || null, title: a.title };
  }
  if (!best) throw new Error('ACARA: no se encontró el comunicado de patentamientos');
  const prev = best.history[`${+best.ym.slice(0, 4) - 1}${best.ym.slice(4)}`];
  return {
    status: 'ok', source: 'ACARA — comunicado mensual de patentamientos', sourceUrl: 'https://www.acara.org.ar/',
    history: { 'Patentamientos (unidades)': best.history },
    latest: { ym: best.ym, units: best.units, yoy: prev ? Math.round((best.units / prev - 1) * 1000) / 10 : null, published: best.published }
  };
}

// ---------- Inflación CABA (IPCBA, IDECBA) vía Datos Argentina ----------
export async function ipcCabaLive() {
  const lv = await seriesMap('193.2_NIVEL_GENERAL_2021_0_13_2', '2020-12-01');
  const ks = Object.keys(lv).sort(), history = {};
  for (let i = 1; i < ks.length; i++) history[ks[i]] = Math.round((lv[ks[i]] / lv[ks[i - 1]] - 1) * 1000) / 10;
  if (Object.keys(history).length < 24) throw new Error('IPCBA: serie incompleta');
  return { status: 'ok', source: 'IDECBA — IPCBA Nivel General (vía Datos Argentina)', sourceUrl: 'https://www.estadisticaciudad.gob.ar/', history, index: lv };
}

// ---------- Pobreza (INDEC EPH, personas, total aglomerados) vía Datos Argentina ----------
// La serie fecha los semestres así: AAAA-07 = 1.er semestre de AAAA; AAAA-01 = 2.º semestre de AAAA-1.
export async function povertyLive() {
  const raw = await seriesMap('64.2_POBLACION_NUA_0_0_34_74', '2016-01-01');
  const semesters = {};
  for (const [k, v] of Object.entries(raw)) {
    const y = +k.slice(0, 4), m = +k.slice(5, 7);
    const key = m >= 7 ? `${y}-S1` : `${y - 1}-S2`;
    semesters[key] = Math.round((v <= 1 ? v * 100 : v) * 10) / 10;
  }
  if (Object.keys(semesters).length < 8) throw new Error('Pobreza: serie incompleta');
  return { status: 'ok', source: 'INDEC — EPH, incidencia de la pobreza en personas (vía Datos Argentina)', sourceUrl: 'https://www.indec.gob.ar/', semesters };
}

// ---------- Despachos de cemento (AFCP) ----------
// Se revisan los últimos meses hacia adelante; cada página mensual de AFCP trae la variación interanual.
export async function cementLive() {
  const now = new Date(), monthly = {};
  let y = now.getUTCFullYear(), m = now.getUTCMonth() + 1 - 3; if (m < 1) { m += 12; y--; }
  for (let i = 0; i < 4; i++) {
    try { const x = await cementMonth(y, m); if (x) monthly[x.period] = x.yoy; } catch { }
    m++; if (m === 13) { m = 1; y++; }
  }
  if (!Object.keys(monthly).length) throw new Error('AFCP: sin meses nuevos');
  return { status: 'ok', source: 'AFCP — Despacho Nacional de Cemento', sourceUrl: 'https://afcp.info/ESTADISTICAS/DATOS-DEFINITIVOS/', monthlyYoy: monthly };
}

// v197 · Fuente primaria oficial: cuadros de INDEC (xls publicados en indec.gob.ar/ftp/cuadros) y API del BCRA.
// Datos Argentina queda como respaldo: cada job toma primero estos datos y sólo completa con la API de series los
// meses/años que aquí falten. Los nombres de archivo de INDEC cambian con cada informe (p. ej. ica_cuadros_18_09_26.xls),
// por eso se descubren leyendo el fragmento HTML de la página del tema (indec.gob.ar/Nivel4/Tema/a/b/c) y, si eso
// falla, se prueban los nombres conocidos.
import * as XLSX from 'xlsx';

const BASE = 'https://www.indec.gob.ar';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const MESES = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };
const r1 = v => Math.round(v * 10) / 10 + 0;
const ymk = (y, m) => `${y}-${String(m).padStart(2, '0')}`;
const n = v => { if (v == null || v === '') return null; const x = typeof v === 'number' ? v : Number(String(v).trim().replace(/\s/g, '')); return Number.isFinite(x) ? x : null; };

async function fetchT(url, type, ms = 25000) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { signal: c.signal, headers: { 'user-agent': UA, 'accept-language': 'es-AR,es;q=.9' } });
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return type === 'buf' ? await r.arrayBuffer() : await r.text();
  } finally { clearTimeout(t); }
}

// ---------- descubrimiento y lectura ----------
const TEMAS = {
  emae: { tema: '3/9/48', re: /sh_emae_mensual_base2004\.xls/i, known: () => ['economia/sh_emae_mensual_base2004.xls'] },
  ipi: { tema: '3/6/14', re: /sh_ipi_manufacturero_\d{4}\.xls/i, known: y => [`economia/sh_ipi_manufacturero_${y}.xls`, `economia/sh_ipi_manufacturero_${y - 1}.xls`] },
  isac: { tema: '3/3/42', re: /sh_isac_\d{4}\.xls/i, known: y => [`economia/sh_isac_${y}.xls`, `economia/sh_isac_${y - 1}.xls`] },
  ica: { tema: '3/2/40', re: /ica_cuadros_\d{2}_\d{2}_\d{2}\.xls/i, known: () => [] },
  pib: { tema: '3/9/47', re: /sh_oferta_demanda_\d{2}_\d{2}\.xls/i, known: (y, m) => [0, 1, 2, 3, 4, 5, 6].map(i => { const d = new Date(Date.UTC(y, m - 1 - i, 1)); return `economia/sh_oferta_demanda_${String(d.getUTCMonth() + 1).padStart(2, '0')}_${String(d.getUTCFullYear()).slice(2)}.xls`; }) },
  eph: { tema: '4/31/58', re: /cuadros_tasas_indicadores_eph_\d{2}_\d{2}\.xls/i, known: (y, m) => [0, 1, 2, 3, 4, 5].map(i => { const d = new Date(Date.UTC(y, m - 1 - i, 1)); return `sociedad/cuadros_tasas_indicadores_eph_${String(d.getUTCMonth() + 1).padStart(2, '0')}_${String(d.getUTCFullYear()).slice(2)}.xls`; }) },
};
export async function indecFileUrls(key) {
  const T = TEMAS[key], urls = [];
  try {
    const html = await fetchT(`${BASE}/Nivel4/Tema/${T.tema}`, 'text', 15000);
    for (const m of html.matchAll(/href="([^"]*ftp\/cuadros\/[^"]+\.xlsx?)"/gi)) if (T.re.test(m[1])) urls.push(`${BASE}/ftp/cuadros/${m[1].split('ftp/cuadros/')[1]}`);
  } catch { }
  const d = new Date();
  for (const k of T.known(d.getUTCFullYear(), d.getUTCMonth() + 1)) urls.push(`${BASE}/ftp/cuadros/${k}`);
  return [...new Set(urls)];
}
// Devuelve las filas (matriz) de la hoja cuyo nombre cumple sheetRe, del primer archivo que se pueda leer.
export async function indecSheet(key, sheetRe) {
  let lastErr = null;
  for (const url of await indecFileUrls(key)) {
    try {
      const buf = await fetchT(url, 'buf');
      const names = XLSX.read(buf, { type: 'array', bookSheets: true }).SheetNames || [];
      const name = names.find(s => sheetRe.test(String(s).trim()));
      if (!name) throw new Error(`hoja ${sheetRe} no encontrada en ${url}`);
      const wb = XLSX.read(buf, { type: 'array', sheets: [name], dense: true, cellStyles: false, cellHTML: false, cellFormula: false });
      return { url, rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null }) };
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error(`INDEC ${key}: archivo no encontrado`);
}

// ---------- parsers (exportados para test) ----------
// Filas mensuales: el año aparece sólo en la fila de enero (o en la primera del año); el mes, por nombre.
export function monthRows(rows, yearCol, monthCol) {
  const out = []; let y = null;
  for (const r of rows || []) {
    const yc = r?.[yearCol]; const ym = String(yc ?? '').match(/^\s*((?:19|20)\d{2})/); if (ym) y = +ym[1];
    const mc = String(r?.[monthCol] ?? '').trim().toLowerCase().replace(/[^a-záéíóú]/g, ''); const m = MESES[mc];
    if (y && m) out.push({ ym: ymk(y, m), r });
  }
  return out;
}
function seriesFrom(list, col, fn = r1) { const o = {}; for (const { ym, r } of list) { const v = n(r[col]); if (v != null) o[ym] = fn(v); } return o; }
// EMAE (sh_emae_mensual_base2004, hoja 1): año | mes | original | var. i.a. % | desestacionalizada | var. m/m % | tendencia
export function parseEmae(rows) {
  const L = monthRows(rows, 0, 1); if (L.length < 120) throw new Error(`EMAE: ${L.length} meses`);
  const first = +L[0].ym.slice(0, 4), yoy = seriesFrom(L, 3);
  for (const k of Object.keys(yoy)) if (+k.slice(0, 4) <= first) delete yoy[k]; // el primer año no tiene variación
  return { level: seriesFrom(L, 2, v => v), monthlyYoy: yoy, monthlySaMom: seriesFrom(L, 5) };
}
// IPI manufacturero (Cuadro 1): _ | año | mes | nivel general | var. i.a. % | acum. % | _ | desest. | var. m/m %
export function parseIpi(rows) {
  const L = monthRows(rows, 1, 2); if (L.length < 60) throw new Error(`IPI: ${L.length} meses`);
  return { level: seriesFrom(L, 3, v => v), monthlyYoy: seriesFrom(L, 4), monthlySaMom: seriesFrom(L, 8) };
}
// ISAC (Cuadro 1): año | mes | nivel | var. i.a. % | … | desest. (col 6) | var. m/m % (col 7)
export function parseIsac(rows) {
  const L = monthRows(rows, 0, 1); if (L.length < 60) throw new Error(`ISAC: ${L.length} meses`);
  return { level: seriesFrom(L, 2, v => v), monthlyYoy: seriesFrom(L, 3), monthlySaMom: seriesFrom(L, 7) };
}
// ICA (hoja c1): año en curso y anterior por mes. Exportaciones cols 2–3, importaciones cols 6–7 (millones de USD).
export function parseIca(rows) {
  const hdr = rows.find(r => r && n(String(r[2] ?? '').slice(0, 4)) > 2000 && n(String(r[3] ?? '').slice(0, 4)) > 2000);
  if (!hdr) throw new Error('ICA: encabezado de años no encontrado');
  const yCur = +String(hdr[2]).slice(0, 4), yPrev = +String(hdr[3]).slice(0, 4);
  const exports = {}, imports = {}, monthlyBalance = {};
  for (const r of rows) {
    const m = MESES[String(r?.[1] ?? '').trim().toLowerCase()]; if (!m) continue;
    for (const [y, ce, ci] of [[yCur, 2, 6], [yPrev, 3, 7]]) {
      const e = n(r[ce]), i = n(r[ci]); if (e == null || i == null) continue;
      const k = ymk(y, m); exports[k] = r1(e); imports[k] = r1(i); monthlyBalance[k] = r1(e - i);
    }
  }
  if (Object.keys(monthlyBalance).length < 12) throw new Error('ICA: meses insuficientes');
  const annual = { exports: {}, imports: {}, balance: {} };
  const tot = rows.find(r => /total anual/i.test(String(r?.[1] ?? '')));
  for (const [y, ce, ci] of [[yCur, 2, 6], [yPrev, 3, 7]]) { const e = n(tot?.[ce]), i = n(tot?.[ci]); if (e != null && i != null) { annual.exports[y] = r1(e); annual.imports[y] = r1(i); annual.balance[y] = r1(e - i); } }
  for (const y of [yPrev, yCur]) {
    if (annual.exports[y] != null) continue;
    const ks = Object.keys(exports).filter(k => k.startsWith(`${y}-`)); if (ks.length !== 12) continue;
    annual.exports[y] = r1(ks.reduce((s, k) => s + exports[k], 0)); annual.imports[y] = r1(ks.reduce((s, k) => s + imports[k], 0)); annual.balance[y] = r1(annual.exports[y] - annual.imports[y]);
  }
  return { exports, imports, monthlyBalance, annual };
}
// PIB (sh_oferta_demanda, "cuadro 1" constantes 2004 / "cuadro 8" corrientes): fila de años (cada 6 columnas:
// T1..T4, Total, vacío), fila de trimestres y fila "B1b" (Producto Interno Bruto). Valores trimestrales anualizados.
export function parsePibQuarters(rows) {
  const qi = rows.findIndex(r => r && r.filter(v => /^\s*[1-4]\s*[º°o]\s*trimestre/i.test(String(v ?? ''))).length >= 8);
  if (qi < 1) throw new Error('PIB: fila de trimestres no encontrada');
  const yr = rows[qi - 1], qr = rows[qi], pr = rows.find(r => String(r?.[0] ?? '').trim() === 'B1b');
  if (!pr) throw new Error('PIB: fila B1b no encontrada');
  const quarters = {}, annual = {}; let y = null;
  for (let j = 0; j < qr.length; j++) {
    const ym = String(yr?.[j] ?? '').match(/((?:19|20)\d{2})/); if (ym) y = +ym[1]; if (!y) continue;
    const q = String(qr[j] ?? '').match(/^\s*([1-4])\s*[º°o]\s*trimestre/i), v = n(pr[j]); if (v == null) continue;
    if (q) quarters[`${y}-Q${q[1]}`] = v; else if (/total/i.test(String(qr[j] ?? ''))) annual[y] = v;
  }
  if (Object.keys(quarters).length < 40) throw new Error('PIB: trimestres insuficientes');
  return { quarters, annual };
}
// EPH (Cuadro 1.1): fila "Año 2017 …" (cada 5 columnas), fila de trimestres y fila "Desocupación abierta".
export function parseEph(rows) {
  const yi = rows.findIndex(r => r && r.filter(v => /^\s*año\s+(19|20)\d{2}/i.test(String(v ?? ''))).length >= 3);
  if (yi < 0) throw new Error('EPH: fila de años no encontrada');
  const yr = rows[yi], qr = rows[yi + 1], ur = rows.find(r => /^\s*desocupaci[oó]n/i.test(String(r?.[0] ?? '')));
  if (!ur) throw new Error('EPH: fila de desocupación no encontrada');
  const quarterly = {}; let y = null;
  for (let j = 1; j < qr.length; j++) {
    const ym = String(yr[j] ?? '').match(/((?:19|20)\d{2})/); if (ym) y = +ym[1]; if (!y) continue;
    const q = String(qr[j] ?? '').match(/^\s*([1-4])\s*[º°o]\s*trimestre/i), v = n(ur[j]); if (q && v != null && v > 0) quarterly[`${y}-Q${q[1]}`] = v;
  }
  const annual = {}; const by = {};
  for (const [k, v] of Object.entries(quarterly)) (by[k.slice(0, 4)] ??= []).push(v);
  for (const [yy, a] of Object.entries(by)) if (a.length === 4) annual[yy] = r1(a.reduce((s, v) => s + v, 0) / 4);
  if (Object.keys(quarterly).length < 12) throw new Error('EPH: trimestres insuficientes');
  return { quarterly, annual };
}

// ---------- API ----------
export async function indecEmae() { const x = await indecSheet('emae', /./); return { url: x.url, ...parseEmae(x.rows) }; }
export async function indecIpi() { const x = await indecSheet('ipi', /^cuadro\s*1$/i); return { url: x.url, ...parseIpi(x.rows) }; }
export async function indecIsac() { const x = await indecSheet('isac', /^cuadro\s*1$/i); return { url: x.url, ...parseIsac(x.rows) }; }
export async function indecIca() { const x = await indecSheet('ica', /^c1$/i); return { url: x.url, ...parseIca(x.rows) }; }
export async function indecPib(sheet = 1) { const x = await indecSheet('pib', new RegExp(`^cuadro\\s*${sheet}$`, 'i')); return { url: x.url, ...parsePibQuarters(x.rows) }; }
export async function indecEph() { const x = await indecSheet('eph', /^cuadro\s*1\.1$/i); return { url: x.url, ...parseEph(x.rows) }; }

// ---------- BCRA (API de Estadísticas v4.0) ----------
const BCRA = 'https://api.bcra.gob.ar/estadisticas/v4.0/monetarias';
export async function bcraDaily(id, desde) {
  const hasta = new Date().toISOString().slice(0, 10), out = {}, limit = 3000;
  for (let offset = 0, i = 0; i < 8; i++, offset += limit) {
    const j = JSON.parse(await fetchT(`${BCRA}/${id}?desde=${desde}&hasta=${hasta}&limit=${limit}&offset=${offset}`, 'text', 15000));
    const rows = j?.results?.[0]?.detalle || [];
    for (const x of rows) { const d = String(x?.fecha || '').slice(0, 10), v = Number(x?.valor); if (d && Number.isFinite(v)) out[d] = v; }
    const count = Number(j?.metadata?.resultset?.count);
    if (!rows.length || (Number.isFinite(count) ? offset + rows.length >= count : rows.length < limit)) break;
  }
  if (!Object.keys(out).length) throw new Error(`BCRA ${id}: sin datos`);
  return out;
}
export function monthlyAvg(daily) { const by = {}; for (const [d, v] of Object.entries(daily)) (by[d.slice(0, 7)] ??= []).push(v); const o = {}; for (const [k, a] of Object.entries(by)) o[k] = a.reduce((s, v) => s + v, 0) / a.length; return o; }
export function annualAvg(daily) { const by = {}; for (const [d, v] of Object.entries(daily)) (by[d.slice(0, 4)] ??= []).push(v); const o = {}; for (const [k, a] of Object.entries(by)) o[k] = Math.round(a.reduce((s, v) => s + v, 0) / a.length * 100) / 100; return o; }

// ---------- v212 · Precios promedio del IPC (GBA) ----------
// sh_ipc_precios_promedio.xls: una hoja por cobertura ("Precios … para el Gran Buenos Aires (GBA). Abril 2016-<mes> <año>"
// y otra por regiones). Se busca la hoja de GBA y se detecta sola la orientación (meses en columnas o en filas). El
// año de cada mes se deduce del título (primer mes de la serie) avanzando cuando el mes "vuelve" a enero, y se verifica
// contra el último mes del título.
const normTxt = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/['’]/g, '').replace(/\s+/g, ' ').trim();
const MES_N = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };
export function parseAvgPrices(rows) {
  const title = rows.slice(0, 8).flat().map(normTxt).find(t => /gran buenos aires|gba/.test(t) && /(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre) \d{4}/.test(t));
  if (!title) throw new Error('precios promedio: título de GBA no encontrado');
  const tm = [...title.matchAll(/(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre) (\d{4})/g)];
  const [y0, m0] = [+tm[0][2], MES_N[tm[0][1]]], end = tm.length > 1 ? ymk(+tm.at(-1)[2], MES_N[tm.at(-1)[1]]) : null;
  const isMonth = v => MES_N[normTxt(v)] || null;
  // ¿Meses en una fila (columnas = meses) o en una columna (filas = meses)?
  let best = { n: 0 };
  rows.forEach((r, i) => { const n = (r || []).filter(isMonth).length; if (n > best.n) best = { n, row: i }; });
  const width = Math.max(...rows.map(r => (r || []).length));
  for (let c = 0; c < width; c++) { const n = rows.filter(r => isMonth(r?.[c])).length; if (n > best.n) best = { n, col: c }; }
  if (best.n < 6) throw new Error('precios promedio: meses no encontrados');
  const seq = []; // [índice de columna o fila, ym]
  let y = y0, prev = 0;
  const push = (idx, v) => { const m = isMonth(v); if (!m) return; if (!seq.length) { y = m >= m0 ? y0 : y0 + 1; } else if (m <= prev) y++; prev = m; seq.push([idx, ymk(y, m)]); };
  if (best.row != null) rows[best.row].forEach((v, c) => push(c, v)); else rows.forEach((r, i) => push(i, r?.[best.col]));
  if (end && seq.at(-1)[1] !== end) throw new Error(`precios promedio: el último mes (${seq.at(-1)[1]}) no coincide con el título (${end})`);
  const out = {}; // nombre normalizado → { ym: precio }
  if (best.row != null) {
    for (const r of rows.slice(best.row + 1)) {
      const name = (r || []).slice(0, 3).map(normTxt).find(t => /[a-z]{3}/.test(t)); if (!name) continue;
      const o = {}; for (const [c, ym] of seq) { const v = n(r[c]); if (v != null && v > 0) o[ym] = v; }
      if (Object.keys(o).length) out[name] = { ...(out[name] || {}), ...o };
    }
  } else {
    const hdr = rows.slice(0, seq[0][0]).reverse().find(r => (r || []).filter(v => /[a-z]{3}/i.test(String(v ?? ''))).length >= 5) || [];
    hdr.forEach((h, c) => { const name = normTxt(h); if (!/[a-z]{3}/.test(name) || c === best.col) return; const o = {}; for (const [i, ym] of seq) { const v = n(rows[i]?.[c]); if (v != null && v > 0) o[ym] = v; } if (Object.keys(o).length) out[name] = o; });
  }
  if (Object.keys(out).length < 10) throw new Error('precios promedio: pocos productos');
  return { end: seq.at(-1)[1], prices: out };
}
export async function indecAvgPrices() {
  const url = `${BASE}/ftp/cuadros/economia/sh_ipc_precios_promedio.xls`;
  const buf = await fetchT(url, 'buf');
  const wb = XLSX.read(buf, { type: 'array', dense: true, cellStyles: false, cellHTML: false, cellFormula: false });
  let lastErr = null;
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: null });
    try { return { url, sheet: name, ...parseAvgPrices(rows) }; } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('precios promedio: sin hojas');
}

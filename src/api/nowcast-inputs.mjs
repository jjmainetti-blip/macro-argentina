// v218 · Insumos de la señal mensual del EMAE (public/emae-signal.js). Series mensuales completas de Datos Argentina
// (CSV de infra.datos.gob.ar; la API de series devuelve vacías algunas columnas, por eso se leen los CSV):
// demanda eléctrica de grandes usuarios + comercial/industrial (CAMMESA), despachos de cemento (insumo del ISAC),
// IVA DGI recaudado, IPC nacional (para deflactar; empalmado con la cadena histórica del sitio) y EMAE desestacionalizado
// (respaldo del objetivo si falta el de INDEC). El modelo se calcula en el navegador con las fuentes ya fusionadas.
import { ipcMonthlyChain } from './ipc-chain.mjs';

const BASE = 'https://infra.datos.gob.ar/catalog/sspm/dataset';
const URLS = {
  elec: `${BASE}/367/distribution/367.3/download/demanda-de-electricidad-datos-mensuales.csv`,
  isac: `${BASE}/33/distribution/33.3/download/indicador-sintetico-actividad-construccion-insumos-serie-original.csv`,
  tax: `${BASE}/142/distribution/142.3/download/recursos-tributarios-totales-por-tributo-mensual-base-2001.csv`,
  ipc: `${BASE}/145/distribution/145.9/download/indice-precios-al-consumidor-apertura-por-categorias-base-diciembre-2016-mensual.csv`,
  emae: `${BASE}/143/distribution/143.3/download/emae-valores-anuales-indice-base-2004-mensual.csv`
};
const FROM = '2005-01';

// CSV simple (sin comillas) → { columna: { 'AAAA-MM': número } } para las columnas pedidas.
export function csvColumns(text, cols) {
  const lines = String(text || '').trim().split(/\r?\n/);
  const head = (lines.shift() || '').split(',').map(s => s.trim().replace(/^"|"$/g, ''));
  const idx = Object.fromEntries(cols.map(c => [c, head.indexOf(c)]));
  const out = Object.fromEntries(cols.map(c => [c, {}]));
  for (const l of lines) {
    const r = l.split(','), ym = String(r[0] || '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(ym) || ym < FROM) continue;
    for (const c of cols) { const i = idx[c]; if (i < 0) continue; const v = parseFloat(r[i]); if (Number.isFinite(v)) out[c][ym] = v; }
  }
  return out;
}
const r4 = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Math.round(v * 1e4) / 1e4]));

export async function nowcastInputs(get) {
  const warn = [], res = {};
  const job = async (k, f) => { try { res[k] = await f(); } catch (e) { warn.push(`${k}: ${String(e?.message || e).slice(0, 80)}`); } };
  await Promise.all([
    job('elec', async () => { const c = csvColumns(await get(URLS.elec), ['grandes_usuarios', 'comercio_e_industria']); const o = {}; for (const [k, v] of Object.entries(c.grandes_usuarios)) if (c.comercio_e_industria[k] > 0) o[k] = v + c.comercio_e_industria[k]; res.elecGU = c.grandes_usuarios; return o; }),
    job('cem', async () => csvColumns(await get(URLS.isac), ['isac_cemento_portland']).isac_cemento_portland),
    job('iva', async () => csvColumns(await get(URLS.tax), ['iva_dgi']).iva_dgi),
    job('ipc', async () => { const c = csvColumns(await get(URLS.ipc), ['ipc_nivel_general_nacional']).ipc_nivel_general_nacional; const M = ipcMonthlyChain(Object.entries(c).map(([date, index]) => ({ date, index }))); return Object.fromEntries(Object.entries(M).filter(([k]) => k >= FROM)); }),
    job('emae', async () => csvColumns(await get(URLS.emae), ['emae_desestacionalizada']).emae_desestacionalizada)
  ]);
  const n = k => Object.keys(res[k] || {}).length;
  if (n('elec') < 120 || n('cem') < 60) throw new Error(`insumos insuficientes (${warn.join('; ') || 'series cortas'})`);
  return {
    status: 'ok', source: 'Datos Argentina — CAMMESA, INDEC (ISAC insumos, EMAE), Secretaría de Hacienda (recaudación)', sourceUrl: 'https://datos.gob.ar/',
    elecInd: r4(res.elec), elecGU: r4(res.elecGU || {}), cemIsac: r4(res.cem || {}), ivaDgi: r4(res.iva || {}), ipcIdx: r4(res.ipc || {}), emaeSa: r4(res.emae || {}),
    ...(warn.length ? { warnings: warn } : {})
  };
}

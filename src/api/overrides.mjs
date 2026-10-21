// v210 · Datos cargados a mano por el administrador (pestaña "Sitio" de Mi cuenta).
// Se guardan en KV (admin:overrides) y se aplican a cada actualización del grupo correspondiente, después de leer las
// fuentes. Modo "fill" (por defecto): sólo completa si la fuente todavía no publicó ese mes — cuando llega el dato
// oficial, manda el oficial. Modo "replace": reemplaza el valor de la fuente (para corregir un dato).
export const OVERRIDES_KEY = 'admin:overrides';
export const SERIES = [
  { id: 'ipc', label: 'Inflación nacional (INDEC) · variación mensual', unit: '%', group: 'core', kind: 'ipcMom', card: 'ipc' },
  { id: 'ipcCaba', label: 'Inflación CABA (IDECBA) · variación mensual', unit: '%', group: 'core', path: ['ipcCaba', 'history'], card: 'ipcCaba' },
  { id: 'arca', label: 'Recaudación (ARCA) · variación interanual', unit: '%', group: 'core', path: ['arca', 'history'], card: 'arca' },
  { id: 'icg', label: 'Confianza en el gobierno (UTDT) · índice', unit: 'puntos', group: 'core', path: ['icg', 'history'], card: 'icg' },
  { id: 'cameYoy', label: 'Ventas minoristas pyme (CAME) · variación interanual', unit: '%', group: 'core', path: ['came', 'monthlyYoy'], card: 'came' },
  { id: 'cameMom', label: 'Ventas minoristas pyme (CAME) · variación mensual desest.', unit: '%', group: 'core', path: ['came', 'monthlySaMom'], card: 'came' },
  { id: 'ipiYoy', label: 'IPI manufacturero (INDEC) · variación interanual', unit: '%', group: 'history', path: ['industryHistorical', 'monthlyYoy'], card: 'ipi' },
  { id: 'ipiMom', label: 'IPI manufacturero (INDEC) · variación mensual desest.', unit: '%', group: 'history', path: ['industryHistorical', 'monthlySaMom'], card: 'ipi' },
  { id: 'trade', label: 'Balanza comercial (INDEC) · saldo mensual', unit: 'USD millones', group: 'history', path: ['tradeHistorical', 'monthlyBalance'], card: 'trade' },
  { id: 'emaeYoy', label: 'EMAE (INDEC) · variación interanual', unit: '%', group: 'activity', path: ['emaeHistorical', 'monthlyYoy'], card: 'emae' },
  { id: 'emaeMom', label: 'EMAE (INDEC) · variación mensual desest.', unit: '%', group: 'activity', path: ['emaeHistorical', 'monthlySaMom'], card: 'emae' },
  { id: 'isacYoy', label: 'ISAC construcción (INDEC) · variación interanual', unit: '%', group: 'activity', path: ['isacHistorical', 'monthlyYoy'], card: 'isac' },
  { id: 'isacMom', label: 'ISAC construcción (INDEC) · variación mensual desest.', unit: '%', group: 'activity', path: ['isacHistorical', 'monthlySaMom'], card: 'isac' },
  { id: 'cement', label: 'Despachos de cemento (AFCP) · variación interanual', unit: '%', group: 'activity', path: ['cement', 'monthlyYoy'], card: 'cement' },
  { id: 'superYoy', label: 'Supermercados (INDEC) · variación interanual real', unit: '%', group: 'activity', path: ['supermarkets', 'monthlyYoy'], card: 'super' },
  { id: 'superMom', label: 'Supermercados (INDEC) · variación mensual desest.', unit: '%', group: 'activity', path: ['supermarkets', 'monthlySaMom'], card: 'super' },
  { id: 'scentia', label: 'Consumo masivo (Scentia) · variación interanual', unit: '%', group: 'activity', path: ['scentia', 'monthlyYoy'], card: 'scentia' },
  { id: 'credit', label: 'Crédito privado en pesos (BCRA) · variación mensual real desest.', unit: '%', group: 'activity', path: ['creditHistorical', 'monthlySaRealMom'], card: 'credit' },
  { id: 'arrears', label: 'Mora bancaria (BCRA) · total', unit: '% de la cartera', group: 'banks', path: ['arrearsHistorical', 'monthlyTotal'], card: 'arrears' }
];
export const SERIES_BY_ID = Object.fromEntries(SERIES.map(s => [s.id, s]));
export const YM_RE = /^(19|20)\d{2}-(0[1-9]|1[0-2])$/;

let memo = { at: 0, v: null };
export async function readOverrides(env, { fresh = false } = {}) {
  if (!fresh && memo.v && Date.now() - memo.at < 60e3) return memo.v;
  let v = null; try { v = await env?.MACRO_STORE?.get?.(OVERRIDES_KEY, 'json'); } catch { }
  v = v && Array.isArray(v.entries) ? v : { entries: [] };
  memo = { at: Date.now(), v }; return v;
}
export function setOverridesMemo(v) { memo = { at: Date.now(), v }; }

const prevYm = ym => { let [y, m] = ym.split('-').map(Number); m--; if (!m) { m = 12; y--; } return `${y}-${String(m).padStart(2, '0')}`; };
const r2 = x => Math.round(x * 1e4) / 1e4;
function mapAt(sources, path, create) {
  let o = sources; for (const k of path) { if (!o[k] || typeof o[k] !== 'object') { if (!create) return null; o[k] = {}; } o = o[k]; }
  return o;
}

// Aplica los datos cargados a mano a las fuentes de un grupo. `manual` (del snapshot anterior) dice qué valores puso
// esta función la vez pasada: si ese dato ya no está cargado, se saca (así borrar un dato lo saca del sitio).
// Devuelve el nuevo registro `manual` {serie: {ym: valor}} para guardar junto al snapshot.
export function applyOverrides(sources, group, entries, manual = {}) {
  const out = {};
  const active = (entries || []).filter(e => SERIES_BY_ID[e.id]?.group === group);
  // 1) Quitar lo que puso esta función antes y ya no está cargado (o cambió).
  for (const [id, vals] of Object.entries(manual || {})) {
    const S = SERIES_BY_ID[id]; if (!S || S.group !== group) continue;
    for (const [ym, v] of Object.entries(vals || {})) {
      if (active.some(e => e.id === id && e.ym === ym)) continue;
      if (S.kind === 'ipcMom') { const M = sources.ipc?.monthly; if (Array.isArray(M)) { const i = M.findIndex(r => String(r.date).slice(0, 7) === ym); if (i >= 0 && Math.abs(Number(M[i].index) - v) < 1e-6) M.splice(i, 1); } continue; }
      const map = mapAt(sources, S.path, false); if (map && Number(map[ym]) === Number(v)) delete map[ym];
    }
  }
  // 2) Aplicar lo cargado (en orden de mes, así el IPC encadena varios meses seguidos).
  for (const e of [...active].sort((a, b) => a.ym.localeCompare(b.ym))) {
    const S = SERIES_BY_ID[e.id], value = Number(e.value); if (!Number.isFinite(value)) continue;
    const prevManual = manual?.[e.id]?.[e.ym];
    if (S.kind === 'ipcMom') {
      const src = sources.ipc; if (!src || !Array.isArray(src.monthly)) continue;
      const M = src.monthly, i = M.findIndex(r => String(r.date).slice(0, 7) === e.ym);
      const isOurs = i >= 0 && prevManual != null && Math.abs(Number(M[i].index) - prevManual) < 1e-6;
      if (i >= 0 && e.mode !== 'replace' && !isOurs) continue; // ya lo publicó la fuente
      const p = M.find(r => String(r.date).slice(0, 7) === prevYm(e.ym)); if (!p || !(Number(p.index) > 0)) continue;
      const row = { date: e.ym, index: r2(Number(p.index) * (1 + value / 100)) };
      if (i >= 0) M[i] = row; else { M.push(row); M.sort((a, b) => String(a.date).localeCompare(String(b.date))); }
      (out[e.id] ||= {})[e.ym] = row.index; continue;
    }
    const map = mapAt(sources, S.path, true);
    const has = map[e.ym] != null && Number.isFinite(Number(map[e.ym]));
    const isOurs = has && prevManual != null && Number(map[e.ym]) === Number(prevManual);
    if (has && e.mode !== 'replace' && !isOurs) continue; // ya lo publicó la fuente: manda el oficial
    map[e.ym] = value; (out[e.id] ||= {})[e.ym] = value;
    const src = sources[S.path[0]]; if (src && src.status === 'error') src.status = 'ok';
  }
  return out;
}

// Estado de cada dato cargado frente al snapshot guardado: "aplicado" o "ya publicado por la fuente".
export function overrideState(e, snapshot) {
  const S = SERIES_BY_ID[e.id]; if (!S || !snapshot) return null;
  const manual = snapshot.manual?.[e.id]?.[e.ym];
  if (manual != null) return { state: 'aplicado' };
  let src = null;
  if (S.kind === 'ipcMom') { const r = (snapshot.sources?.ipc?.monthly || []).find(x => String(x.date).slice(0, 7) === e.ym); src = r ? Number(r.index) : null; }
  else { const m = mapAt(snapshot.sources || {}, S.path, false); src = m && m[e.ym] != null ? Number(m[e.ym]) : null; }
  return src != null ? { state: 'fuente', sourceValue: src } : { state: 'pendiente' };
}

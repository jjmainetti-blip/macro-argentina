// v219 · Anticipo del EMAE (sección Expectativas). Misma función en el navegador y en el Worker. S = fuentes fusionadas.
// Tres indicadores, cada uno traducido a una estimación de la variación mensual desestacionalizada del EMAE para los
// dos meses que INDEC todavía no publicó:
//  · Macrodatos: regresión sobre cemento, electricidad (grandes usuarios + comercial/industrial) e IVA DGI, cada uno
//    desestacionalizado (variación mensual menos el promedio del mismo mes en los 5 años previos) + días hábiles.
//    1ª estimación: cemento · 2ª: + electricidad · 3ª: + IVA DGI. Sin IGA.
//  · IGA-OJF: su variación mensual desestacionalizada, tal cual.
//  · ILA-ARG (CICEc): regresión del EMAE sobre la variación mensual del índice líder del mismo mes.
// Zonas: estimación ≤ −0,5% "probable baja"; ≥ +0,5% "probable suba"; en el medio "sin señal clara".
// Aciertos de cada zona, en pruebas fuera de muestra (cada mes estimado sólo con lo conocido hasta dos meses antes):
// baja → el EMAE bajó; suba → subió; sin señal clara → varió menos de ±0,5%.
// Detalle de la investigación: research/emae-nowcast/README.md.
const ymShift = (ym, n) => { let [y, m] = ym.split('-').map(Number); m += n; while (m < 1) { m += 12; y--; } while (m > 12) { m -= 12; y++; } return `${y}-${String(m).padStart(2, '0')}`; };
const covid = t => t >= '2020-03' && t <= '2021-06';
const YM = /^\d{4}-\d{2}$/;
const num = v => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v))) ? null : Number(v);
const r2 = v => Math.round(v * 100) / 100;
const workdays = t => { const [y, m] = t.split('-').map(Number); let n = 0; const last = new Date(Date.UTC(y, m, 0)).getUTCDate(); for (let d = 1; d <= last; d++) { const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); if (w > 0 && w < 6) n++; } return n; };
const dwd = t => { let s = 0; for (let k = 1; k <= 7; k++) { const q = ymShift(t, -12 * k); s += workdays(q) - workdays(ymShift(q, -1)); } return (workdays(t) - workdays(ymShift(t, -1))) - s / 7; };
const lm = (S, t) => { const a = S?.[t], b = S?.[ymShift(t, -1)]; return a > 0 && b > 0 ? 100 * Math.log(a / b) : null; };
function dsm(S, t) {
  const x = lm(S, t); if (x === null) return null;
  const p = []; for (let k = 1; k <= 5; k++) { const q = ymShift(t, -12 * k); if (covid(q) || covid(ymShift(q, -1))) continue; const v = lm(S, q); if (v !== null) p.push(v); }
  return p.length >= 3 ? x - p.reduce((a, b) => a + b, 0) / p.length : null;
}
function solve(A, b) {
  const k = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let i = 0; i < k; i++) { let p = i; for (let r = i + 1; r < k; r++) if (Math.abs(M[r][i]) > Math.abs(M[p][i])) p = r; [M[i], M[p]] = [M[p], M[i]]; if (Math.abs(M[i][i]) < 1e-12) return null; for (let r = 0; r < k; r++) if (r !== i) { const f = M[r][i] / M[i][i]; for (let c = i; c <= k; c++) M[r][c] -= f * M[i][c]; } }
  return M.map((r, i) => r[k] / r[i]);
}
function ols(X, y, lam = 0.001) {
  const k = X[0].length, A = Array.from({ length: k }, () => Array(k).fill(0)), b = Array(k).fill(0);
  X.forEach((r, i) => { for (let a = 0; a < k; a++) { b[a] += r[a] * y[i]; for (let c = 0; c < k; c++) A[a][c] += r[a] * r[c]; } });
  for (let a = 1; a < k; a++) A[a][a] += lam * X.length;
  return solve(A, b);
}

function inputs(S) {
  const N = S?.nowcastInputs || {};
  // Cemento: índice del ISAC (INDEC), extendido con la interanual de AFCP para los meses que INDEC todavía no publicó.
  const cem = { ...(N.cemIsac || {}) }, afcp = S?.cement?.monthlyYoy || {};
  for (const t of Object.keys(afcp).filter(k => YM.test(k)).sort()) { const y = num(afcp[t]), b = cem[ymShift(t, -12)]; if (cem[t] === undefined && y !== null && b > 0) cem[t] = b * (1 + y / 100); }
  // IPC: cadena de Datos Argentina, pisada por el IPC del sitio (misma base dic-2016 = 100, llega antes).
  const ipc = { ...(N.ipcIdx || {}) };
  for (const r of (Array.isArray(S?.ipc?.monthly) ? S.ipc.monthly : [])) { const k = String(r.date).slice(0, 7), v = num(r.index); if (YM.test(k) && v > 0) ipc[k] = v; }
  // IVA DGI cobrado en c ≈ actividad de c−1, deflactado por el IPC de ese mes.
  const iva = {}; for (const [c, v] of Object.entries(N.ivaDgi || {})) { const a = ymShift(c, -1); if (v > 0 && ipc[a] > 0) iva[a] = v / ipc[a]; }
  // Objetivo: variación mensual s.e. de INDEC; si falta un mes, la del índice s.e. de Datos Argentina.
  const target = {}; const E = N.emaeSa || {};
  for (const t of Object.keys(E)) { const v = lm(E, t); if (v !== null) target[t] = r2((Math.exp(v / 100) - 1) * 100); }
  for (const [t, v] of Object.entries(S?.emaeHistorical?.monthlySaMom || {})) if (YM.test(t) && num(v) !== null) target[t] = num(v);
  const iga = {}; for (const [t, r] of Object.entries(S?.igaHistorical?.monthly || {})) if (YM.test(t) && num(r?.momSa) !== null) iga[t] = num(r.momSa);
  const ila = {}; for (const [t, r] of Object.entries(S?.ilaHistorical?.monthly || {})) if (YM.test(t) && num(r?.mom) !== null) ila[t] = num(r.mom);
  return { elec: N.elecInd || {}, cem, iva, target, iga, ila };
}

export const ZONES = { down: 'Probable baja', flat: 'Sin señal clara', up: 'Probable suba' };
export const zoneOf = v => v <= -0.5 ? 'down' : v >= 0.5 ? 'up' : 'flat';
const hitOf = (z, a) => z === 'down' ? a < 0 : z === 'up' ? a > 0 : Math.abs(a) < 0.5;
function zoneStats(back) {
  const out = {}; for (const z of Object.keys(ZONES)) { const b = back.filter(x => zoneOf(x.est) === z); out[z] = { n: b.length, hits: b.filter(x => hitOf(z, x.actual)).length }; }
  const mae = back.length ? r2(back.reduce((s, x) => s + Math.abs(x.est - x.actual), 0) / back.length) : null;
  return { zones: out, n: back.length, mae, from: back[0]?.ym || null };
}
const point = (value, stats, extra = {}) => { const z = zoneOf(value), st = stats.zones[z]; return { value: r2(value), zone: z, zoneLabel: ZONES[z], zoneN: st.n, zoneHits: st.hits, ...extra }; };

// Regresión con prueba fuera de muestra. feats(t) → [x...] o null.
function regression(I, feats, { from = '2008-01', backFrom = '2019-01', minTrain = 36 } = {}) {
  const months = Object.keys(I.target).filter(t => t >= from).sort();
  const rows = months.map(t => ({ t, x: feats(t), y: I.target[t] })).filter(r => r.x && !covid(r.t) && !covid(ymShift(r.t, -1)));
  const back = [];
  for (const r of rows) { if (r.t < backFrom) continue; const tr = rows.filter(q => q.t <= ymShift(r.t, -2)); if (tr.length < minTrain) continue; const b = ols(tr.map(q => [1, ...q.x]), tr.map(q => q.y)); if (!b) continue; back.push({ ym: r.t, est: [1, ...r.x].reduce((s, v, i) => s + v * b[i], 0), actual: r.y }); }
  const coef = rows.length >= minTrain ? ols(rows.map(q => [1, ...q.x]), rows.map(q => q.y)) : null;
  return { coef, back, predict: t => { const x = feats(t); return coef && x ? [1, ...x].reduce((s, v, i) => s + v * coef[i], 0) : null; } };
}

const STAGES = [
  { id: 1, label: '1ª estimación', inputs: 'cemento', feats: ['cem'] },
  { id: 2, label: '2ª estimación', inputs: 'cemento y electricidad', feats: ['cem', 'elec'] },
  { id: 3, label: '3ª estimación', inputs: 'cemento, electricidad e IVA', feats: ['cem', 'elec', 'iva'] }
];

export function emaeNowcast(S) {
  const I = inputs(S);
  const tKeys = Object.keys(I.target).sort();
  if (tKeys.length < 60) return null;
  const lastEmae = tKeys.at(-1), months = [ymShift(lastEmae, 1), ymShift(lastEmae, 2)];
  const out = { lastEmae, months, indicators: {} };

  // Macrodatos (tres etapas).
  if (Object.keys(I.cem).length >= 60) {
    const fx = fs => t => { const x = []; for (const f of fs) { const v = dsm(I[f], t); if (v === null || !Number.isFinite(v)) return null; x.push(v); } x.push(dwd(t)); return x; };
    const stages = STAGES.map(st => { const R = regression(I, fx(st.feats)); return { ...st, R, stats: zoneStats(R.back) }; });
    const perMonth = {};
    for (const t of months) {
      const list = stages.map(st => { const v = st.R.predict(t); return v === null ? null : point(v, st.stats, { stage: st.id, label: st.label, inputs: st.inputs }); }).filter(Boolean);
      perMonth[t] = list.length ? { ...list.at(-1), stages: list } : null;
    }
    out.indicators.model = { key: 'nowModel', title: 'Estimación Macrodatos', source: 'Macrodatos con CAMMESA, AFCP, INDEC y ARCA', perMonth, stats: stages.map(s => ({ id: s.id, ...s.stats })), history: stages[1].R.back.map(b => ({ ym: b.ym, est: r2(b.est), actual: b.actual })) };
  }
  // IGA-OJF: la variación mensual s.e. del IGA como estimación directa del EMAE.
  {
    const back = Object.keys(I.iga).filter(t => I.target[t] !== undefined && !covid(t) && !covid(ymShift(t, -1))).sort().map(t => ({ ym: t, est: I.iga[t], actual: I.target[t] }));
    if (back.length >= 12) { const stats = zoneStats(back); const perMonth = {}; for (const t of months) perMonth[t] = I.iga[t] !== undefined ? point(I.iga[t], stats) : null; out.indicators.iga = { key: 'nowIga', title: 'IGA-OJF', source: 'Orlando J. Ferreres & Asociados', perMonth, stats: [stats], history: back.map(b => ({ ...b, est: r2(b.est) })) }; }
  }
  // ILA-ARG: regresión del EMAE sobre la variación mensual del índice líder.
  if (Object.keys(I.ila).length >= 60) {
    const R = regression(I, t => I.ila[t] !== undefined ? [I.ila[t]] : null, { from: '2005-01', backFrom: '2016-01' });
    const stats = zoneStats(R.back); const perMonth = {}; for (const t of months) { const v = R.predict(t); perMonth[t] = v === null ? null : point(v, stats, { raw: I.ila[t] }); }
    out.indicators.ila = { key: 'nowIla', title: 'Índice Líder (ILA-ARG)', source: 'CICEc — Bolsas de Comercio de Santa Fe y Rosario', perMonth, stats: [stats], history: R.back.map(b => ({ ym: b.ym, est: r2(b.est), actual: b.actual })) };
  }
  return out;
}
if (typeof window !== 'undefined') window.MacroEmaeSignal = { emaeNowcast, zoneOf, ZONES };

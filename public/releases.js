// v134 · "Último dato publicado": misma lógica en el navegador y en el Worker (que la escribe en el HTML de la
// portada). R = fuentes fusionadas (mismo formato que /api/macro-data). Devuelve la publicación más reciente.
const MONTH_LABELS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const fmt = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });
const fmt1 = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
const displayDay = d => { const [y, m, dd] = String(d).split('-'); return `${Number(dd)} ${MONTH_LABELS[+m - 1]} ${y}`; };
const displayMonth = ym => { const [y, m] = ym.split('-'); return `${MONTH_LABELS[+m - 1]} ${y}`; };
const ymShift = (ym, n) => { let [y, m] = ym.split('-').map(Number); m += n; while (m < 1) { m += 12; y--; } while (m > 12) { m -= 12; y++; } return `${y}-${String(m).padStart(2, '0')}`; };
const numOrNull = v => v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v);
const kpiPct = n => { const x = Math.round(Number(n) * 10) / 10, z = Object.is(x, -0) ? 0 : x; return `${z > 0 ? '+' : z < 0 ? '−' : ''}${fmt1.format(Math.abs(z))}%`; };
const lastEntry = obj => Object.entries(obj || {}).filter(([d, v]) => /^\d{4}-\d{2}$/.test(d) && v !== null && v !== '' && Number.isFinite(Number(v))).map(([d, v]) => [d, Number(v)]).sort(([a], [b]) => a.localeCompare(b)).at(-1);
const bopQuarterLabel = k => { const m = String(k).match(/^(\d{4})-Q([1-4])$/); return m ? `${m[2]}T ${m[1]}` : String(k); };
function ymFromSpanishPeriod(s) {
  const m = { ene: '01', enero: '01', feb: '02', febrero: '02', mar: '03', marzo: '03', abr: '04', abril: '04', may: '05', mayo: '05', jun: '06', junio: '06', jul: '07', julio: '07', ago: '08', agosto: '08', sep: '09', sept: '09', septiembre: '09', set: '09', setiembre: '09', oct: '10', octubre: '10', nov: '11', noviembre: '11', dic: '12', diciembre: '12' };
  const z = String(s || '').toLowerCase().match(/(enero|ene|febrero|feb|marzo|mar|abril|abr|mayo|may|junio|jun|julio|jul|agosto|ago|septiembre|sept|sep|setiembre|set|octubre|oct|noviembre|nov|diciembre|dic)\s+(20\d{2})/);
  return z ? `${z[2]}-${m[z[1]]}` : null;
}
export function releaseSortKey(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (/^\d{4}-\d{2}$/.test(s)) return `${s}-01`;
  const months = { ene: '01', feb: '02', mar: '03', abr: '04', may: '05', jun: '06', jul: '07', ago: '08', sep: '09', oct: '10', nov: '11', dic: '12' };
  const m = s.match(/(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)[a-záéíóú.]*\s+(20\d{2})/i);
  return m ? `${m[2]}-${months[m[1].slice(0, 3)]}-01` : '';
}
function ipcIndexWithRem(S, ym) {
  const idx = Object.fromEntries((S.ipc?.monthly || []).map(r => [String(r.date).slice(0, 7), Number(r.index)]).filter(([, v]) => Number.isFinite(v)));
  if (Number.isFinite(idx[ym])) return { value: idx[ym], estimated: false };
  const rem = S.rem?.cpiExpected?.monthly || {}; let k = ym; const chain = [];
  while (!Number.isFinite(idx[k]) && chain.length < 3) { const e = Number(rem[k]); if (!Number.isFinite(e)) return null; chain.unshift([k, e]); k = ymShift(k, -1); }
  if (!Number.isFinite(idx[k]) || chain.length > 2) return null;
  let v = idx[k]; for (const [, e] of chain) v *= 1 + e / 100;
  return { value: v, estimated: true };
}
function arcaRealYoy(S, ym, nominal) {
  const i1 = ipcIndexWithRem(S, ym), i0 = ipcIndexWithRem(S, ymShift(ym, -12));
  if (!i1 || !i0 || i0.estimated) return null;
  return { real: ((1 + nominal / 100) / (i1.value / i0.value) - 1) * 100 + 0, estimated: i1.estimated };
}
function arcaHistory(S) { const h = { ...(S?.arca?.history || {}) }, L = S?.arca?.latest; if (L && Number.isFinite(Number(L.yoy))) { const ym = L.ym || ymFromSpanishPeriod(L.period || ''); if (ym && /^\d{4}-\d{2}$/.test(ym)) h[ym] = Number(L.yoy); } return h; }
function autosHistory(S) { return { ...(S?.activityPulse?.autos?.history?.['Patentamientos (unidades)'] || {}), ...(S?.autos?.history?.['Patentamientos (unidades)'] || {}) }; }
const moneyMillionsToBillions = m => { const v = Number(m); if (!Number.isFinite(v)) return ''; return v >= 1e6 ? `$ ${fmt1.format(v / 1e6)} billones` : `$ ${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(v)} millones`; };

export function buildReleases(R = {}) {
  const pub = (ym, lag, day) => ym ? `${ymShift(ym, lag)}-${String(day).padStart(2, '0')}` : '';
  const shown = (iso, ym) => iso ? `Publicado ${displayDay(iso)}${ym ? ` · período ${displayMonth(ym)}` : ''}` : `Período ${displayMonth(ym)}`;
  const releases = [{ releaseDate: '2026-09-28', date: 'sep 2026', displayDate: 'Publicado 28 sep 2026 · período sep 2026', title: 'ICG UTDT', value: '1,94 puntos · −5,9% mensual' }];
  { const M = Array.isArray(R.ipc?.monthly) ? R.ipc.monthly : [], L = M.filter(r => Number.isFinite(Number(r.value))).at(-1);
    if (L) { const ym = String(L.date).slice(0, 7), rd = R.ipc?.publishedAt || pub(ym, 1, 12); const prev = M.find(r => String(r.date).slice(0, 7) === ymShift(ym, -12));
      const yoy = Number.isFinite(Number(R.ipc?.latest?.yoy)) && R.ipc.latest?.date?.slice?.(0, 7) === ym ? Number(R.ipc.latest.yoy) : (prev ? ((Number(L.index) / Number(prev.index)) - 1) * 100 : null);
      releases.push({ releaseDate: rd, title: 'IPC Nacional · INDEC', value: `${fmt.format(Number(L.value))}% mensual${Number.isFinite(yoy) ? ` · ${fmt.format(yoy)}% interanual` : ''}`, displayDate: shown(R.ipc?.publishedAt, ym) }); } }
  { const L = R.arca?.latest, H = arcaHistory(R), last = lastEntry(H); const ym = L?.ym || (L?.period ? ymFromSpanishPeriod(L.period) : null) || last?.[0];
    if (ym) { const same = (L?.ym || ymFromSpanishPeriod(L?.period || '')) === ym; const yoy = Number.isFinite(Number(L?.yoy)) && same ? Number(L.yoy) : Number(H[ym]); const rr = Number.isFinite(yoy) ? arcaRealYoy(R, ym, yoy) : null;
      const parts = [Number.isFinite(Number(L?.value)) && same ? moneyMillionsToBillions(L.value) : null, Number.isFinite(yoy) ? `${kpiPct(yoy)} interanual` : null, rr ? `${kpiPct(rr.real)} real${rr.estimated ? ' (est. REM)' : ''}` : null].filter(Boolean);
      releases.push({ releaseDate: L?.published || pub(ym, 1, 1), title: 'Recaudación · ARCA', value: parts.join(' · '), displayDate: shown(L?.published || pub(ym, 1, 1), ym) }); } }
  if (R.salary?.latest?.period && Number.isFinite(Number(R.salary.latest.value))) { const ym = ymFromSpanishPeriod(R.salary.latest.period) || String(R.salary.latest.period).slice(0, 7); releases.push({ releaseDate: pub(ym, 1, 28), title: 'RIPTE', value: money.format(R.salary.latest.value), displayDate: `Período ${displayMonth(ym)}` }); }
  if (R.icg?.status === 'ok' && R.icg.latest) releases.push({ releaseDate: R.icg.publicationDate || '', date: R.icg.latest.period || '', title: 'ICG UTDT', value: `${fmt.format(R.icg.latest.value)} puntos${Number.isFinite(Number(R.icg.latest.mom)) ? ` · ${Number(R.icg.latest.mom) > 0 ? '+' : ''}${fmt.format(R.icg.latest.mom)}% mensual` : ''}` });
  { const h = autosHistory(R), L = lastEntry(h); if (L) { const p = numOrNull(h[ymShift(L[0], -12)]), pubd = R.autos?.latest?.ym === L[0] ? R.autos.latest.published : null; releases.push({ releaseDate: pubd || `${ymShift(L[0], 1)}-01`, title: 'Patentamientos · ACARA', value: `${new Intl.NumberFormat('es-AR').format(L[1])} unidades${p ? ` · ${kpiPct((L[1] / p - 1) * 100)} interanual` : ''}`, displayDate: pubd ? `Publicado ${displayDay(pubd)} · período ${displayMonth(L[0])}` : `Período ${displayMonth(L[0])}` }); } }
  if (R.bopHistorical?.prepared && R.bopHistorical?.quarterly?.CA) { const k = Object.keys(R.bopHistorical.quarterly.CA).sort().at(-1), v = Number(R.bopHistorical.quarterly.CA[k]); releases.push({ releaseDate: R.bopHistorical.prepared, title: 'Balanza de pagos · INDEC', value: `Cuenta corriente ${v >= 0 ? '+' : '−'}USD ${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(Math.abs(v))} M (${bopQuarterLabel(k)})`, displayDate: `Publicado ${displayDay(R.bopHistorical.prepared)}` }); }
  return releases;
}
// La más reciente por fecha de publicación (a igual fecha, la última de la lista).
export function pickLatest(releases) {
  const valid = (releases || []).map(x => ({ ...x, sortKey: String(x.releaseDate || releaseSortKey(x.date)).slice(0, 10) })).filter(x => x.title && x.value && x.sortKey).sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  const l = valid.at(-1); if (!l) return null;
  return { title: l.title, value: l.value, date: l.displayDate || l.date || l.releaseDate || '', sortKey: l.sortKey };
}
export function latestRelease(R) { return pickLatest(buildReleases(R)); }
if (typeof window !== 'undefined') window.MacroReleases = { buildReleases, pickLatest, latestRelease };

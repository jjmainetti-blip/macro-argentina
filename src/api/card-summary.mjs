// v216 · Resumen de cada tarjeta de "Pulso económico" para los mails (resúmenes diarios y semanales).
// Antes los mails usaban buildReleases (public/releases.js), que no incluía EMAE, salarios, crédito, mora, balanza
// comercial, cemento, fiscal, etc., y además fechaba cada dato con un día "habitual" en lugar del día en que salió.
// Ahora se recorren las mismas tarjetas que el sitio (CARDS) y la fecha de publicación es la misma que usa el tablero
// (cardPublication: fecha de la fuente, o el día en que el sitio detectó el período nuevo, o el día habitual).
import { CARDS, AGENCY, periodEndYm } from './freshness.mjs';
import { cardPublication } from '../../public/releases.js';

const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const f1 = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const f0 = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const num = v => v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v);
const pct = v => { const x = Math.round(v * 10) / 10; return `${x > 0 ? '+' : x < 0 ? '−' : ''}${f1.format(Math.abs(x))}%`; };
const lv = v => f1.format(v);
const shift = (ym, n) => { let [y, m] = ym.split('-').map(Number); m += n; while (m < 1) { m += 12; y--; } while (m > 12) { m -= 12; y++; } return `${y}-${String(m).padStart(2, '0')}`; };
const last = (o, re = /^\d{4}-\d{2}$/) => Object.entries(o || {}).filter(([k, v]) => re.test(k) && num(v) !== null).sort(([a], [b]) => a.localeCompare(b)).at(-1) || null;
const join = (...xs) => xs.filter(Boolean).join(' · ');
const periodLabel = p => { if (/^\d{4}-\d{2}$/.test(p)) return `${MES[+p.slice(5) - 1]} ${p.slice(0, 4)}`; const q = String(p).match(/^(\d{4})-Q([1-4])$/); if (q) return `${q[2]}T ${q[1]}`; const s = String(p).match(/^(\d{4})-S([12])$/); if (s) return `${s[2]}S ${s[1]}`; return String(p); };
const dayLabel = d => { const [y, m, dd] = String(d).split('-'); return `${+dd} ${MES[+m - 1]} ${y}`; };

function ipcIdx(S) { return Object.fromEntries((S.ipc?.monthly || []).map(r => [String(r.date).slice(0, 7), num(r.index)]).filter(([, v]) => v > 0)); }
const act = (H, label = 'interanual') => p => { const m = num(H?.monthlySaMom?.[p]), y = num(H?.monthlyYoy?.[p]); return join(m !== null ? `${pct(m)} mensual s.e.` : null, y !== null ? `${pct(y)} ${label}` : null); };

// Texto del valor de cada tarjeta para el período p.
const VALUE = {
  ipc: (S, p) => { const r = (S.ipc?.monthly || []).find(x => String(x.date).slice(0, 7) === p), I = ipcIdx(S), y = I[p] && I[shift(p, -12)] ? (I[p] / I[shift(p, -12)] - 1) * 100 : null; return join(num(r?.value) !== null ? `${lv(Number(r.value))}% mensual` : null, y !== null ? `${lv(y)}% interanual` : null); },
  ipcCaba: (S, p) => num(S.ipcCaba?.history?.[p]) !== null ? `${lv(Number(S.ipcCaba.history[p]))}% mensual` : '',
  wages: (S, p) => { const T = S.wages?.monthly?.total || {}, I = ipcIdx(S), a = num(T[p]), b = num(T[shift(p, -1)]), c = num(T[shift(p, -12)]); if (!a || !b) return ''; const m = (a / b - 1) * 100, inf = I[p] && I[shift(p, -1)] ? (I[p] / I[shift(p, -1)] - 1) * 100 : null; return join(`${pct(m)} mensual`, inf !== null ? `${pct(((1 + m / 100) / (1 + inf / 100) - 1) * 100)} real` : null, c ? `${lv((a / c - 1) * 100)}% interanual` : null); },
  emae: (S, p) => act(S.emaeHistorical)(p),
  ipi: (S, p) => act(S.industryHistorical)(p),
  isac: (S, p) => act(S.isacHistorical)(p),
  arca: (S, p) => { const y = num(S.arca?.history?.[p]) ?? (S.arca?.latest?.ym === p ? num(S.arca.latest.yoy) : null); return y !== null ? `${pct(y)} interanual nominal` : ''; },
  icg: (S, p) => { const v = num(S.icg?.history?.[p]), b = num(S.icg?.history?.[shift(p, -1)]); return v !== null ? join(`${f1.format(v)} puntos`, b ? `${pct((v / b - 1) * 100)} mensual` : null) : ''; },
  autos: (S, p) => { const h = { ...(S.activityPulse?.autos?.history?.['Patentamientos (unidades)'] || {}), ...(S.autos?.history?.['Patentamientos (unidades)'] || {}) }, v = num(h[p]), b = num(h[shift(p, -12)]); return v !== null ? join(`${f0.format(v)} unidades`, b ? `${pct((v / b - 1) * 100)} interanual` : null) : ''; },
  came: (S, p) => { const y = num(S.came?.monthlyYoy?.[p]), m = num(S.came?.monthlySaMom?.[p]); return join(y !== null ? `${pct(y)} interanual real` : null, m !== null ? `${pct(m)} mensual s.e.` : null); },
  super: (S, p) => { const y = num(S.supermarkets?.monthlyYoy?.[p]), m = num(S.supermarkets?.monthlySaMom?.[p]); return join(y !== null ? `${pct(y)} interanual real` : null, m !== null ? `${pct(m)} mensual s.e.` : null); },
  scentia: (S, p) => { const y = num(S.scentia?.monthlyYoy?.[p]); return y !== null ? `${pct(y)} interanual (unidades)` : ''; },
  cement: (S, p) => { const y = num(S.cement?.monthlyYoy?.[p]); return y !== null ? `${pct(y)} interanual` : ''; },
  credit: (S, p) => { const m = num(S.creditHistorical?.monthlySaRealMom?.[p]), y = num(S.creditHistorical?.monthlyYoy?.[p]); return join(m !== null ? `${pct(m)} real mensual s.e.` : null, y !== null ? `${pct(y)} interanual nominal` : null); },
  arrears: (S, p) => { const v = num(S.arrearsHistorical?.monthlyTotal?.[p]), b = num(S.arrearsHistorical?.monthlyTotal?.[shift(p, -1)]); return v !== null ? join(`${lv(v)}% de irregularidad`, b !== null ? `${v - b >= 0 ? '+' : '−'}${f1.format(Math.abs(v - b))} p.p. mensual` : null) : ''; },
  trade: (S, p) => { const v = num(S.tradeHistorical?.monthlyBalance?.[p]); return v !== null ? `${v >= 0 ? 'superávit' : 'déficit'} de US$ ${f0.format(Math.abs(v))} M` : ''; },
  fiscal: (S, p) => { const P = num(S.activityPulse?.fiscal?.historyPctGDP?.primary?.[p]), F = num(S.activityPulse?.fiscal?.historyPctGDP?.financial?.[p]); return join(P !== null ? `primario ${lv(P)}% del PIB (acumulado del año)` : null, F !== null ? `financiero ${lv(F)}%` : null); },
  ila: (S, p) => { const r = S.ilaHistorical?.monthly?.[p]; return num(r?.mom) !== null ? join(`${pct(r.mom)} mensual`, num(r?.yoy) !== null ? `${pct(r.yoy)} interanual` : null) : ''; },
  iga: (S, p) => { const r = S.igaHistorical?.monthly?.[p]; return join(num(r?.momSa) !== null ? `${pct(r.momSa)} mensual s.e.` : null, num(r?.yoy) !== null ? `${pct(r.yoy)} interanual` : null); },
  bop: (S, p) => { const v = num(S.bopHistorical?.quarterly?.CA?.[p]); return v !== null ? `cuenta corriente: ${v >= 0 ? 'superávit' : 'déficit'} de US$ ${f0.format(Math.abs(v))} M` : ''; },
  poverty: (S, p) => { const v = num(S.poverty?.semesters?.[p]); return v !== null ? `${lv(v)}% de las personas` : ''; },
};

// Un registro por tarjeta con dato: { key, title, period, releaseDate, basis, value, displayDate }.
export function cardSummaries(S = {}, seen = {}) {
  const out = [];
  for (const c of CARDS) {
    let p = null; try { p = c.latest(S); } catch { }
    const ym = p ? periodEndYm(p) : null; if (!ym) continue;
    const pub = cardPublication(c.key, ym, S, seen); if (!pub) continue;
    let value = ''; try { value = VALUE[c.key]?.(S, p) || ''; } catch { }
    if (!value) continue;
    const title = `${c.title} · ${AGENCY[c.key] || ''}`.replace(/ · $/, '');
    out.push({ key: c.key, title, period: p, releaseDate: pub.date, basis: pub.basis, value: `${value} (${periodLabel(p)})`, displayDate: `${pub.basis === 'habitual' ? 'Período' : `Publicado ${dayLabel(pub.date)} · período`} ${periodLabel(p)}` });
  }
  return out.sort((a, b) => String(b.releaseDate).localeCompare(String(a.releaseDate)));
}

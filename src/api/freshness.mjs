// v128 · Motor de frescura: para cada tarjeta sabe qué período tiene, cuál es el próximo y cuándo debería
// publicarse (calendario oficial si existe; si no, el rezago habitual del organismo). La revisión
// programada usa esto para insistir sólo sobre las fuentes cuyo dato nuevo ya debería estar publicado.
import { EVENTS } from './calendar-data.mjs';

const MONTHS_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const ymRe = /^\d{4}-(0[1-9]|1[0-2])$/;
const lastKey = (o, re = ymRe) => Object.keys(o || {}).filter(k => re.test(k) && o[k] !== null && o[k] !== undefined).sort().at(-1) || null;
const maxKey = (...ks) => ks.filter(Boolean).sort().at(-1) || null;
export function ymShift(ym, n) { let [y, m] = ym.split('-').map(Number); m += n; while (m < 1) { m += 12; y--; } while (m > 12) { m -= 12; y++; } return `${y}-${String(m).padStart(2, '0')}`; }
const dd = (ym, day) => `${ym}-${String(Math.min(day, 28)).padStart(2, '0')}`;

// group = grupo de /api/macro-data que la actualiza. lag = meses entre el período y la publicación; day = día habitual.
export const CARDS = [
  { key: 'ipc', title: 'Inflación nacional', group: 'core', freq: 'M', lag: 1, day: 15, cal: /precios al consumidor \(IPC\)/i, latest: S => lastKey(Object.fromEntries((S.ipc?.monthly || []).map(r => [String(r.date).slice(0, 7), r.value]))) },
  { key: 'ipcCaba', title: 'Inflación CABA', group: 'core', freq: 'M', lag: 1, day: 15, latest: S => lastKey(S.ipcCaba?.history) },
  { key: 'arca', title: 'Recaudación', group: 'core', freq: 'M', lag: 1, day: 2, cal: /Recaudaci[oó]n tributaria/i, latest: S => maxKey(lastKey(S.arca?.history), S.arca?.latest?.ym) },
  { key: 'icg', title: 'Confianza en el gobierno', group: 'core', freq: 'M', lag: 0, day: 28, latest: S => lastKey(S.icg?.history) },
  { key: 'autos', title: 'Patentamientos 0 km', group: 'core', freq: 'M', lag: 1, day: 2, latest: S => maxKey(lastKey(S.autos?.history?.['Patentamientos (unidades)']), lastKey(S.activityPulse?.autos?.history?.['Patentamientos (unidades)'])) },
  { key: 'came', title: 'Ventas minoristas pyme', group: 'core', freq: 'M', lag: 1, day: 5, latest: S => maxKey(lastKey(S.came?.monthlyYoy), S.came?.latest?.ym) },
  { key: 'emae', title: 'EMAE', group: 'activity', freq: 'M', lag: 2, day: 25, cal: /actividad econ[oó]mica \(EMAE\)/i, latest: S => maxKey(lastKey(S.emaeHistorical?.monthlySaMom), lastKey(S.emaeHistorical?.monthlyYoy)) },
  { key: 'isac', title: 'ISAC construcción', group: 'activity', freq: 'M', lag: 2, day: 7, cal: /actividad de la construcci[oó]n \(ISAC\)/i, latest: S => lastKey(S.isacHistorical?.monthlyYoy) },
  { key: 'fiscal', title: 'Resultado fiscal', group: 'activity', freq: 'M', lag: 1, day: 18, cal: /Resultado fiscal/i, latest: S => lastKey(S.activityPulse?.fiscal?.historyPctGDP?.primary) },
  { key: 'cement', title: 'Despachos de cemento', group: 'activity', freq: 'M', lag: 1, day: 4, latest: S => lastKey(S.cement?.monthlyYoy) },
  { key: 'credit', title: 'Crédito privado', group: 'activity', freq: 'M', lag: 1, day: 20, latest: S => maxKey(lastKey(S.creditHistorical?.monthlySaRealMom), S.activityPulse?.creditLatest?.ym) },
  { key: 'arrears', title: 'Mora bancaria', group: 'banks', freq: 'M', lag: 2, day: 20, latest: S => lastKey(S.arrearsHistorical?.monthlyTotal) },
  { key: 'ipi', title: 'IPI manufacturero', group: 'history', freq: 'M', lag: 2, day: 10, cal: /producci[oó]n industrial manufacturero/i, latest: S => maxKey(lastKey(S.industryHistorical?.monthlySaMom), lastKey(S.industryHistorical?.monthlyYoy)) },
  { key: 'trade', title: 'Balanza comercial', group: 'history', freq: 'M', lag: 1, day: 20, cal: /Intercambio comercial argentino/i, latest: S => lastKey(S.tradeHistorical?.monthlyBalance) },
  { key: 'ila', title: 'Índice Líder (ILA)', group: 'leading', freq: 'M', lag: 1, day: 28, latest: S => lastKey(S.ilaHistorical?.monthly) },
  { key: 'iga', title: 'IGA-OJF', group: 'leading', freq: 'M', lag: 1, day: 22, latest: S => lastKey(S.igaHistorical?.monthly) },
  { key: 'bop', title: 'Balanza de pagos', group: 'external', freq: 'Q', lag: 3, day: 25, latest: S => lastKey(S.bopHistorical?.quarterly?.CA, /^\d{4}-Q[1-4]$/) },
  { key: 'poverty', title: 'Pobreza', group: 'external', freq: 'S', lag: 3, day: 28, latest: S => lastKey(S.poverty?.semesters, /^\d{4}-S[12]$/) }
];

// Período → último mes que cubre. Próximo período según la frecuencia.
export function periodEndYm(p) {
  if (ymRe.test(p)) return p;
  let m = String(p).match(/^(\d{4})-Q([1-4])$/); if (m) return `${m[1]}-${String(+m[2] * 3).padStart(2, '0')}`;
  m = String(p).match(/^(\d{4})-S([12])$/); if (m) return `${m[1]}-${m[2] === '1' ? '06' : '12'}`;
  return null;
}
function nextPeriod(p, freq) {
  if (freq === 'M') return ymShift(p, 1);
  let m = String(p).match(/^(\d{4})-Q([1-4])$/); if (m) return +m[2] === 4 ? `${+m[1] + 1}-Q1` : `${m[1]}-Q${+m[2] + 1}`;
  m = String(p).match(/^(\d{4})-S([12])$/); if (m) return m[2] === '2' ? `${+m[1] + 1}-S1` : `${m[1]}-S2`;
  return null;
}
const periodLabel = p => { const e = periodEndYm(p); if (!e) return p; if (ymRe.test(p)) return `${MONTHS_ES[+p.slice(5) - 1]} ${p.slice(0, 4)}`; return p.replace('-Q', ' T').replace('-S', ' S'); };

export function expectedDate(card, period) {
  const end = periodEndYm(period); if (!end) return null;
  if (card.cal) {
    const label = periodLabel(period).toLowerCase();
    const ev = EVENTS.find(e => card.cal.test(e.title) && String(e.period).toLowerCase() === label);
    if (ev) return { date: ev.date, basis: 'calendario oficial' };
  }
  return { date: dd(ymShift(end, card.lag), card.day), basis: 'calendario habitual' };
}

export function todayAR() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }

export function cardStatus(sources, today = todayAR()) {
  const list = Array.isArray(sources) ? sources : [sources];
  return CARDS.map(c => {
    let latest = null;
    for (const src of list) { try { const l = c.latest(src || {}); if (l && (!latest || l > latest)) latest = l; } catch { } }
    if (!latest) return { key: c.key, title: c.title, group: c.group, state: 'sin-datos' };
    const next = nextPeriod(latest, c.freq), exp = next ? expectedDate(c, next) : null;
    let state = 'al-dia', daysLate = 0;
    if (exp && today >= exp.date) {
      daysLate = Math.round((Date.parse(today) - Date.parse(exp.date)) / 864e5);
      state = daysLate <= 20 ? 'esperando' : 'atrasado';
    }
    return { key: c.key, title: c.title, group: c.group, latest, latestLabel: periodLabel(latest), next, nextLabel: next ? periodLabel(next) : null, expected: exp?.date || null, expectedBasis: exp?.basis || null, state, daysLate };
  });
}

// Elige el grupo a refrescar en esta ejecución programada. Prioridad: grupos con tarjetas "esperando"
// (el dato ya debería estar publicado), rotando entre ellos; si no hay, rotación normal con "core" la mitad del tiempo.
export function pickCronGroup(statuses, groups, tick) {
  const waiting = [...new Set(statuses.filter(s => s.state === 'esperando').map(s => s.group))].filter(g => groups.includes(g));
  if (waiting.length && tick % 3 !== 2) return { group: waiting[(tick - Math.floor(tick / 3)) % waiting.length], reason: 'esperando publicación' };
  const others = groups.filter(g => g !== 'core');
  return tick % 2 === 0 ? { group: 'core', reason: 'rotación' } : { group: others[Math.floor(tick / 2) % others.length], reason: 'rotación' };
}

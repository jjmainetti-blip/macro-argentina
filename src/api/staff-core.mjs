// v175 · Personal de casas particulares: pagos (por jornada, semanal, quincenal o mensual), registro de lo pagado con
// arrastre opcional de la diferencia al período siguiente, valor por hora y comparación con la escala oficial (CNTCP).
import { STAFF_SCALE, STAFF_CATEGORIES, ZONA_PCT } from './casas-scale.mjs';
import { addDays } from './contracts-core.mjs';

export const STAFF_FREQ = { jornada: 'Por jornada', semanal: 'Semanal', quincenal: 'Quincenal', mensual: 'Mensual' };
export const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const isDay = k => /^\d{4}-\d{2}-\d{2}$/.test(String(k || ''));
const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const numAR = v => Number(String(v ?? '').trim().replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
const r2 = v => Math.round(v * 100) / 100;
const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const wd = d => new Date(d + 'T12:00:00Z').getUTCDay();

export function normalizeStaff(x, { maxRecipients = 3 } = {}) {
  const errors = [];
  const days = [...new Set((Array.isArray(x?.workDays) ? x.workDays : []).map(Number).filter(n => n >= 0 && n <= 6))].sort();
  const S = {
    type: 'staff',
    name: clean(x?.name, 80) || 'Personal',
    category: STAFF_CATEGORIES[x?.category] ? x.category : 'generales',
    retiro: x?.retiro === 'sin' ? 'sin' : 'con',
    zona: !!x?.zona,
    freq: STAFF_FREQ[x?.freq] ? x.freq : 'mensual',
    amount: r2(numAR(x?.amount)),
    hours: Math.round(numAR(x?.hours) * 100) / 100,
    payDay: Math.round(Number(x?.payDay)),
    workDays: days,
    start: String(x?.start || ''),
    effective: x?.effective ? String(x.effective) : '',
    notes: clean(x?.notes, 300),
    reminders: {
      mode: ['off', 'due'].includes(x?.reminders?.mode) ? x.reminders.mode : 'due',
      daysBefore: Math.min(7, Math.max(0, Math.round(Number(x?.reminders?.daysBefore) || 0))),
      hour: Number.isInteger(Number(x?.reminders?.hour)) && Number(x.reminders.hour) >= 0 && Number(x.reminders.hour) <= 23 ? Number(x.reminders.hour) : 9,
      skipPaid: x?.reminders?.skipPaid !== false,
      scale: x?.reminders?.scale !== false,
      self: x?.reminders?.self !== false,
      others: [...new Set((Array.isArray(x?.reminders?.others) ? x.reminders.others : String(x?.reminders?.others || '').split(/[\s,;]+/))
        .map(e => String(e || '').trim().toLowerCase()).filter(Boolean))].slice(0, maxRecipients + 1),
    },
  };
  if (!(S.amount > 0 && S.amount < 1e11)) errors.push('Indicá el monto a pagar.');
  if (!(S.hours > 0 && S.hours <= 744)) errors.push('Indicá la cantidad de horas del período (para calcular el valor por hora).');
  if (!isDay(S.start)) errors.push('Indicá desde cuándo se paga.');
  if (S.freq === 'mensual') { if (!(S.payDay >= 1 && S.payDay <= 31)) S.payDay = 1; }
  else if (S.freq === 'semanal') { if (!(S.payDay >= 0 && S.payDay <= 6)) S.payDay = 5; }
  else if (S.freq === 'jornada') { if (!S.workDays.length) errors.push('Elegí los días que trabaja.'); S.payDay = null; }
  else S.payDay = null;
  const bad = S.reminders.others.filter(e => !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) || e.length > 120);
  if (bad.length) errors.push(`Revisá ${bad.length === 1 ? 'esta dirección' : 'estas direcciones'}: ${bad.join(', ')}`);
  if (S.reminders.others.length > maxRecipients) errors.push(`Podés agregar hasta ${maxRecipients} direcciones además de la tuya.`);
  return { staff: S, errors };
}

// Fechas de pago desde el inicio hasta "until".
export function payDates(S, until) {
  const out = []; if (!isDay(S.start)) return out;
  let d = S.start, guard = 0;
  if (S.freq === 'mensual') {
    let [y, m] = d.split('-').map(Number);
    for (; guard < 600; guard++) {
      const day = Math.min(S.payDay || 1, lastDay(y, m)), k = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      if (k > until) break; if (k >= S.start) out.push(k);
      m++; if (m > 12) { m = 1; y++; }
    }
  } else if (S.freq === 'quincenal') {
    let [y, m] = d.split('-').map(Number);
    for (; guard < 1200; guard++) {
      for (const day of [15, lastDay(y, m)]) { const k = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`; if (k > until) return out; if (k >= S.start) out.push(k); }
      m++; if (m > 12) { m = 1; y++; }
    }
  } else {
    const ok = S.freq === 'semanal' ? (k => wd(k) === S.payDay) : (k => S.workDays.includes(wd(k)));
    for (; d <= until && guard < 5000; d = addDays(d, 1), guard++) if (ok(d)) out.push(d);
  }
  return out;
}

// Escala oficial vigente en el mes ym para la categoría y modalidad (con zona desfavorable si corresponde).
export function officialRate(S, ym) {
  const step = [...STAFF_SCALE].reverse().find(s => s.from <= ym) || STAFF_SCALE[0];
  const c = step.categories[S.category] || {}, z = S.zona ? 1 + ZONA_PCT(step.from) / 100 : 1;
  const hour = S.category === 'caseros' ? c.hour : (S.retiro === 'sin' ? c.hourSin : c.hourCon);
  const month = S.category === 'caseros' ? c.month : (S.retiro === 'sin' ? c.monthSin : c.monthCon);
  return { from: step.from, pct: step.pct, hour: hour ? r2(hour * z) : null, month: month ? r2(month * z) : null };
}
export function nextOfficial(S, ym) { const n = STAFF_SCALE.find(s => s.from > ym); return n ? officialRate(S, n.from) : null; }

// Tarifa vigente en una fecha (el monto se puede cambiar con "vigente desde").
function rateAt(S, d) { const r = [...(S.rates || [])].sort((a, b) => a.from.localeCompare(b.from)).filter(x => x.from <= d).at(-1); return r || { amount: S.amount, hours: S.hours }; }

export function computeStaff(S, today, { horizon = 40 } = {}) {
  const dates = payDates(S, addDays(today, horizon)), pay = S.payments || {};
  const rows = []; let carry = 0;
  for (const d of dates) {
    const r = rateAt(S, d), p = pay[d];
    const expected = r2(r.amount + carry);
    const row = { date: d, base: r.amount, carryIn: r2(carry), expected, hours: r.hours, past: d < today, today: d === today };
    if (p) { row.paid = p.paid; row.paidAt = p.at || null; row.carry = !!p.carry; row.note = p.note || null; row.diff = r2(expected - p.paid); carry = p.carry ? row.diff : 0; }
    else carry = 0;
    rows.push(row);
  }
  const ym = today.slice(0, 7), cur = rateAt(S, today), hourly = cur.hours ? r2(cur.amount / cur.hours) : null;
  const off = officialRate(S, ym), next = nextOfficial(S, ym);
  const trackFrom = S.trackFrom || S.start, pending = rows.filter(r => r.past && r.paid == null && r.date >= trackFrom);
  const nextRow = rows.find(r => r.date >= today && r.paid == null) || null;
  const gapPct = hourly && off.hour ? r2((hourly / off.hour - 1) * 100) : null;
  return { rows, hourly, official: off, nextOfficial: next, gapPct, below: gapPct != null && gapPct < -0.05, next: nextRow, pendingCount: pending.length, trackFrom, current: cur };
}

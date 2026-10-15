// v171 · Créditos: cronograma de cuotas (sistema francés, alemán o americano), en pesos a tasa fija o en UVA.
// En los créditos UVA el cronograma se arma en UVAs y cada cuota se paga en pesos al valor de la UVA del día del
// vencimiento (BCRA). Si ese valor todavía no se publicó, se estima con el último disponible y se marca como estimado.
import { addMonths, addDays } from './contracts-core.mjs';

export const SYSTEMS = { frances: 'Francés (cuota constante)', aleman: 'Alemán (amortización constante)', americano: 'Americano (capital al final)' };
export const ADJUST = { uva: 'UVA', fijo: 'Tradicional en pesos (tasa fija)' };
const isDay = k => /^\d{4}-\d{2}-\d{2}$/.test(String(k || ''));
const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const numAR = v => Number(String(v ?? '').trim().replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));

export function normalizeLoan(x, { maxRecipients = 3 } = {}) {
  const errors = [];
  const L = {
    type: 'loan',
    name: clean(x?.name, 80) || 'Crédito',
    adjust: ADJUST[x?.adjust] ? x.adjust : 'uva',
    principal: Math.round(numAR(x?.principal) * 100) / 100,
    principalUnit: x?.principalUnit === 'uva' ? 'uva' : 'ars',
    start: String(x?.start || ''),
    firstDue: x?.firstDue ? String(x.firstDue) : '',
    term: Math.round(Number(x?.term)),
    rate: Math.round(numAR(x?.rate) * 1000) / 1000,
    system: SYSTEMS[x?.system] ? x.system : 'frances',
    notes: clean(x?.notes, 300),
    reminders: {
      mode: ['off', 'due'].includes(x?.reminders?.mode) ? x.reminders.mode : 'due',
      daysBefore: Math.min(15, Math.max(0, Math.round(Number(x?.reminders?.daysBefore) || 0))),
      hour: Number.isInteger(Number(x?.reminders?.hour)) && Number(x.reminders.hour) >= 0 && Number(x.reminders.hour) <= 23 ? Number(x.reminders.hour) : 9,
      self: x?.reminders?.self !== false,
      others: [...new Set((Array.isArray(x?.reminders?.others) ? x.reminders.others : String(x?.reminders?.others || '').split(/[\s,;]+/))
        .map(e => String(e || '').trim().toLowerCase()).filter(Boolean))].slice(0, maxRecipients + 1),
    },
  };
  if (L.adjust !== 'uva') L.principalUnit = 'ars';
  if (!(L.principal > 0 && L.principal < 1e13)) errors.push('Indicá el monto del crédito.');
  if (!isDay(L.start) || L.start < '1990-01-01' || L.start > '2100-01-01') errors.push('Indicá la fecha de otorgamiento.');
  if (L.firstDue && (!isDay(L.firstDue) || L.firstDue <= L.start)) errors.push('El primer vencimiento debe ser posterior al otorgamiento.');
  if (!(L.term >= 1 && L.term <= 480)) errors.push('Indicá el plazo en meses (entre 1 y 480).');
  if (!(L.rate >= 0 && L.rate <= 500)) errors.push('Indicá la tasa nominal anual (TNA) en %.');
  const bad = L.reminders.others.filter(e => !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) || e.length > 120);
  if (bad.length) errors.push(`Revisá ${bad.length === 1 ? 'esta dirección' : 'estas direcciones'}: ${bad.join(', ')}`);
  if (L.reminders.others.length > maxRecipients) errors.push(`Podés agregar hasta ${maxRecipients} direcciones además de la tuya.`);
  return { loan: L, errors };
}

// Valor de la UVA en la fecha d (o el último anterior, hasta 7 días). Si d es posterior al último dato publicado,
// devuelve el último con estimated: true.
function uvaAt(uva, keys, d) {
  if (Number(uva[d]) > 0) return { date: d, value: Number(uva[d]), estimated: false };
  let lo = 0, hi = keys.length - 1, best = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (keys[mid] <= d) { best = mid; lo = mid + 1; } else hi = mid - 1; }
  if (best < 0) return null;
  const k = keys[best], last = best === keys.length - 1;
  if (last && k < d) return { date: k, value: Number(uva[k]), estimated: true };
  if (k < addDays(d, -7)) return null;
  return { date: k, value: Number(uva[k]), estimated: false };
}

export function computeLoan(L, idx, today) {
  const uva = idx?.uva || {}, keys = L.adjust === 'uva' ? Object.keys(uva).filter(isDay).sort() : [];
  const i = L.rate / 1200, n = L.term, first = L.firstDue || addMonths(L.start, 1);
  let base = null, P = L.principal;
  if (L.adjust === 'uva') {
    base = uvaAt(uva, keys, L.start);
    if (!base || base.estimated && L.start < (keys.at(-1) || '')) return { error: `No hay valor de la UVA para el ${L.start}.` };
    if (L.principalUnit === 'ars') P = L.principal / base.value;
  }
  const french = i > 0 ? P * i / (1 - Math.pow(1 + i, -n)) : P / n;
  const rows = []; let bal = P, totalInterest = 0;
  for (let k = 1; k <= n; k++) {
    const date = addMonths(first, k - 1), interest = bal * i;
    let capital = L.system === 'aleman' ? P / n : L.system === 'americano' ? (k === n ? bal : 0) : french - interest;
    if (k === n) capital = bal;
    const quota = capital + interest; bal = Math.max(0, bal - capital); totalInterest += interest;
    const r = { k, date, quota, interest, capital, balance: bal, past: date < today };
    if (L.adjust === 'uva') {
      const u = uvaAt(uva, keys, date);
      if (u) Object.assign(r, { uva: u.value, uvaDate: u.date, estimated: u.estimated, quotaArs: quota * u.value, interestArs: interest * u.value, capitalArs: capital * u.value, balanceArs: bal * u.value });
    } else Object.assign(r, { quotaArs: quota, interestArs: interest, capitalArs: capital, balanceArs: bal });
    rows.push(r);
  }
  const next = rows.find(r => r.date >= today) || null, paid = rows.filter(r => r.date < today);
  const balUnits = paid.length ? paid.at(-1).balance : P;
  const nowUva = L.adjust === 'uva' ? uvaAt(uva, keys, today) : null;
  return {
    rows, next, paidCount: paid.length, finished: !next, principalUnits: P, baseUva: base, firstQuota: rows[0]?.quota ?? null,
    balanceUnits: balUnits, balanceArs: L.adjust === 'uva' ? (nowUva ? balUnits * nowUva.value : null) : balUnits, uvaToday: nowUva,
    totalInterest, unit: L.adjust === 'uva' ? 'UVA' : '$', lastDue: rows.at(-1)?.date,
  };
}

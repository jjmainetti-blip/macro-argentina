// v164 · Cálculo de contratos (alquileres, etc.): cronograma de ajustes, monto vigente y próximo ajuste.
// Lo usan la API de la cuenta (vista previa y listado) y los recordatorios por mail, así ambos dan siempre lo mismo.
//
// Convenciones
// - El ajuste N ocurre N × frecuencia meses después de la fecha de inicio (mismo día del mes, o el último si no existe).
// - Monto del ajuste N = monto inicial × factor(fecha del ajuste N); el factor es acumulado desde el inicio, así que
//   encadenar los ajustes o calcularlos punta a punta da lo mismo.
// - IPC (mensual): factor = IPC[mes del ajuste − rezago] / IPC[mes de inicio − rezago]. Con rezago 1 se toma la
//   inflación de los meses transcurridos del período (se conoce a mediados del mes del ajuste); con rezago 2, los
//   últimos meses ya publicados al momento del ajuste (lo habitual en contratos que ajustan el día 1).
// - ICL, CER y UVA (diarios): factor = índice(fecha del ajuste) / índice(fecha de inicio), como la Ley 27.551 para el
//   ICL. Si ese día no tiene dato se usa el último anterior (hasta 7 días).
// - Porcentaje fijo: factor = (1 + p)^N.

export const INDEX_NAMES = { ipc: 'IPC (INDEC)', icl: 'ICL (BCRA)', cer: 'CER (BCRA)', uva: 'UVA (BCRA)', fixed: 'Porcentaje fijo' };
export const FREQ_NAMES = { 1: 'mensual', 2: 'bimestral', 3: 'trimestral', 4: 'cuatrimestral', 6: 'semestral', 12: 'anual' };
const MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const isDay = k => /^\d{4}-\d{2}-\d{2}$/.test(String(k || ''));
const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export function addMonths(k, n) {
  const [y, m, d] = k.split('-').map(Number), t = (m - 1) + n, yy = y + Math.floor(t / 12), mm = ((t % 12) + 12) % 12 + 1;
  const base = `${yy}-${String(mm).padStart(2, '0')}`;
  return d ? `${base}-${String(Math.min(d, lastDay(yy, mm))).padStart(2, '0')}` : base;
}
export function addDays(k, n) { const t = new Date(k + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); }
export function dateLabel(k) {
  if (isDay(k)) { const [y, m, d] = k.split('-'); return `${Number(d)} de ${MES[+m - 1]} de ${y}`; }
  const [y, m] = String(k).split('-'); return `${MES[+m - 1]} de ${y}`;
}
export const monthLabel = ym => { const [y, m] = ym.split('-'); return `${MES[+m - 1]} ${y}`; };
export const freqText = n => FREQ_NAMES[n] || `cada ${n} meses`;

// ── Validación del contrato que manda el formulario ─────────────────────────────────────────────────────────
const clean = (s, max) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
export function normalizeContract(x, { maxRecipients = 3 } = {}) {
  const errors = [];
  const c = {
    name: clean(x?.name, 80) || 'Contrato',
    amount: Math.round(Number(String(x?.amount ?? '').replace(/\./g, '').replace(',', '.')) * 100) / 100,
    start: String(x?.start || ''),
    end: x?.end ? String(x.end) : '',
    index: String(x?.index || ''),
    lag: Number(x?.lag ?? 2),
    fixedPct: Number(String(x?.fixedPct ?? '').replace(',', '.')),
    freq: Math.round(Number(x?.freq)),
    notes: clean(x?.notes, 300),
    reminders: {
      mode: ['off', 'adjust', 'monthly'].includes(x?.reminders?.mode) ? x.reminders.mode : 'adjust',
      day: Math.min(28, Math.max(1, Math.round(Number(x?.reminders?.day) || 1))),
      daysBefore: Math.min(15, Math.max(0, Math.round(Number(x?.reminders?.daysBefore) || 0))),
      hour: Number.isInteger(Number(x?.reminders?.hour)) && Number(x.reminders.hour) >= 0 && Number(x.reminders.hour) <= 23 ? Number(x.reminders.hour) : 9,
      self: x?.reminders?.self !== false,
      others: [...new Set((Array.isArray(x?.reminders?.others) ? x.reminders.others : String(x?.reminders?.others || '').split(/[\s,;]+/))
        .map(e => String(e || '').trim().toLowerCase()).filter(Boolean))].slice(0, maxRecipients + 1),
    },
  };
  if (!(c.amount > 0 && c.amount < 1e13)) errors.push('Indicá un monto inicial válido.');
  if (!isDay(c.start) || c.start < '1990-01-01' || c.start > '2100-01-01') errors.push('Indicá la fecha de inicio.');
  if (c.end && (!isDay(c.end) || c.end <= c.start)) errors.push('La fecha de fin debe ser posterior al inicio.');
  if (!INDEX_NAMES[c.index]) errors.push('Elegí el índice de actualización.');
  if (c.index === 'ipc' && ![0, 1, 2, 3].includes(c.lag)) c.lag = 2;
  if (c.index !== 'ipc') delete c.lag;
  if (c.index === 'fixed') { if (!(c.fixedPct > -100 && c.fixedPct <= 1000)) errors.push('Indicá el porcentaje fijo de cada ajuste.'); }
  else delete c.fixedPct;
  if (!(c.freq >= 1 && c.freq <= 120)) errors.push('Indicá cada cuántos meses se actualiza (entre 1 y 120).');
  const bad = c.reminders.others.filter(e => !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) || e.length > 120);
  if (bad.length) errors.push(`Revisá ${bad.length === 1 ? 'esta dirección' : 'estas direcciones'}: ${bad.join(', ')}`);
  if (c.reminders.others.length > maxRecipients) errors.push(`Podés agregar hasta ${maxRecipients} direcciones además de la tuya.`);
  return { contract: c, errors };
}

// ── Índices ──────────────────────────────────────────────────────────────────────────────────────────────────
// idx = { ipc: {'YYYY-MM': nivel}, icl|cer|uva: {'YYYY-MM-DD': valor} }
function dailyAt(map, keys, d) {
  if (Number(map[d]) > 0) return { key: d, value: Number(map[d]) };
  let lo = 0, hi = keys.length - 1, best = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (keys[mid] <= d) { best = mid; lo = mid + 1; } else hi = mid - 1; }
  if (best < 0 || keys[best] < addDays(d, -7)) return null;
  // Si el último dato disponible es anterior a d y no hay ninguno posterior, el de d todavía no se publicó.
  if (best === keys.length - 1 && keys[best] < d) return null;
  return { key: keys[best], value: Number(map[keys[best]]) };
}
export function factorFor(c, k, date, idx, cache = {}) {
  if (c.index === 'fixed') return { factor: Math.pow(1 + c.fixedPct / 100, k), from: null, to: null };
  if (c.index === 'ipc') {
    const map = idx.ipc || {}, lag = c.lag ?? 2;
    const fromM = addMonths(c.start.slice(0, 7), -lag), toM = addMonths(date.slice(0, 7), -lag);
    const a = Number(map[fromM]), b = Number(map[toM]);
    if (!(a > 0)) return { error: 'base', missing: fromM };
    if (!(b > 0)) return { pending: true, missing: toM };
    return { factor: b / a, from: { key: fromM, value: a }, to: { key: toM, value: b } };
  }
  const map = idx[c.index] || {}, keys = cache[c.index] ||= Object.keys(map).filter(isDay).sort();
  const a = dailyAt(map, keys, c.start);
  if (!a) return { error: 'base', missing: c.start };
  const b = dailyAt(map, keys, date);
  if (!b) return { pending: true, missing: date };
  return { factor: b.value / a.value, from: a, to: b };
}

// ── Cronograma ───────────────────────────────────────────────────────────────────────────────────────────────
// today: 'YYYY-MM-DD' (Argentina). horizon: cuántos ajustes futuros listar.
export function computeContract(c, idx, today, { horizon = 1 } = {}) {
  const rows = [], cache = {};
  let prevAmount = c.amount, current = { k: 0, date: c.start, amount: c.amount }, next = null, baseError = null;
  for (let k = 1; k <= 1200; k++) {
    const date = addMonths(c.start, c.freq * k);
    if (c.end && date >= c.end) break;
    const f = factorFor(c, k, date, idx, cache);
    if (f.error) { baseError = f.missing; break; }
    const row = { k, date, past: date <= today };
    if (f.pending) Object.assign(row, { pending: true, missing: f.missing });
    else {
      const amount = Math.round(c.amount * f.factor * 100) / 100;
      Object.assign(row, { amount, factor: f.factor, stepPct: (amount / prevAmount - 1) * 100, totalPct: (f.factor - 1) * 100, from: f.from, to: f.to, prevAmount });
      prevAmount = amount;
    }
    rows.push(row);
    if (row.past && !row.pending) current = { k, date, amount: row.amount };
    if (!row.past) { if (!next) next = row; if (rows.filter(r => !r.past).length >= horizon) break; }
    if (row.pending && row.past) { /* ajuste ya ocurrido cuyo índice no se publicó: sigue como "pendiente" */ }
  }
  const pendingPast = rows.filter(r => r.past && r.pending);
  return { rows, current, next, pendingPast, baseError, ended: !!(c.end && today >= c.end) };
}

// Texto explicativo de qué meses de IPC se toman (para el formulario y los mails).
export function ipcWindowText(c, adjDate) {
  if (c.index !== 'ipc') return '';
  // Meses que entran en ESTE ajuste: desde el ajuste anterior (o el inicio) hasta el del ajuste, corridos por el rezago.
  const lag = c.lag ?? 2, prev = adjDate.slice(0, 7) <= addMonths(c.start.slice(0, 7), c.freq) ? c.start.slice(0, 7) : addMonths(adjDate.slice(0, 7), -c.freq);
  const from = addMonths(prev, -lag), to = addMonths(adjDate.slice(0, 7), -lag);
  const first = addMonths(from, 1);
  if (first === to) return `IPC de ${monthLabel(to)}`;
  return `IPC de ${first.slice(0, 4) === to.slice(0, 4) ? monthLabel(first).split(' ')[0] : monthLabel(first)} a ${monthLabel(to)}`;
}

// Fecha estimada en que se conoce el dato que falta (IPC: INDEC publica a mediados del mes siguiente).
export function pendingHint(c, missing) {
  if (c.index === 'ipc') return `cuando INDEC publique el IPC de ${monthLabel(missing)} (a mediados de ${monthLabel(addMonths(missing, 1))})`;
  return `cuando el BCRA publique el ${c.index.toUpperCase()} del ${dateLabel(missing)}`;
}

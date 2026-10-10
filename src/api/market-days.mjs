// v163 · Días hábiles bursátiles en Argentina. Los fines de semana y feriados no hay rueda: el último dato de Merval,
// MEP, riesgo país y BNA corresponde al cierre del último día hábil, aunque la fuente lo publique con la fecha de hoy.
// Feriados nacionales y días no laborables con fines turísticos (BYMA no opera). Las fechas fijas valen para cualquier año.
const FIXED = ['01-01', '03-24', '04-02', '05-01', '05-25', '06-20', '07-09', '12-08', '12-25'];
const MOVABLE = new Set([
  // 2025
  '2025-03-03', '2025-03-04', '2025-04-18', '2025-05-02', '2025-06-16', '2025-08-15', '2025-08-17', '2025-11-21', '2025-11-24',
  // 2026
  '2026-02-16', '2026-02-17', '2026-03-23', '2026-04-03', '2026-06-15', '2026-07-10', '2026-08-17', '2026-10-12', '2026-11-23', '2026-12-07',
]);
export function isBusinessDay(d) {
  d = String(d || '').slice(0, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return true;
  const w = new Date(d + 'T12:00:00Z').getUTCDay();
  return w !== 0 && w !== 6 && !FIXED.includes(d.slice(5)) && !MOVABLE.has(d);
}
export function lastBusinessDay(d) {
  d = String(d || '').slice(0, 10); if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  const t = new Date(d + 'T12:00:00Z');
  for (let i = 0; i < 15 && !isBusinessDay(t.toISOString().slice(0, 10)); i++) t.setUTCDate(t.getUTCDate() - 1);
  return t.toISOString().slice(0, 10);
}
// Si el dato viene fechado en un día sin rueda, se lo fecha en el último día hábil (el cierre que realmente es).
export function closeDay(x) {
  if (!x?.date) return x;
  const d = String(x.date).slice(0, 10), c = lastBusinessDay(d);
  return c === d ? x : { ...x, date: c, closed: true };
}

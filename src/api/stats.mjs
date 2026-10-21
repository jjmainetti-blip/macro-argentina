// v210 · Estadísticas del sitio (visitas y mails enviados) con pocas escrituras de KV.
// Cada instancia del Worker acumula en memoria y cada tanto guarda SU propia clave del día
// (stats:<tipo>:<día>:<instancia>) con los totales acumulados en los metadatos. Así no hay carreras entre instancias
// (cada una sólo pisa su clave) y leer un mes completo es un único list() de KV. Si una instancia se apaga antes de
// guardar se pierden sus últimas visitas: los números son aproximados (del orden de unas pocas visitas por día).
const ISO = Math.random().toString(36).slice(2, 10);
const TTL = 400 * 86400; // ~13 meses
const dayAR = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const acc = { hit: {}, mail: {} }, dirty = { hit: 0, mail: 0 }, lastFlush = { hit: Date.now(), mail: Date.now() };
const cap = s => String(s || '').toLowerCase().replace(/[^a-z0-9áéíóúñ_-]/g, '').slice(0, 24) || 'otro';

function bump(type, fields) {
  const d = dayAR(), A = (acc[type][d] ||= {});
  for (const [k, v] of Object.entries(fields)) if (v) A[k] = (A[k] || 0) + v;
  dirty[type]++;
}
async function flushType(env, type, force = false) {
  const KV = env?.MACRO_STORE; if (!KV?.put || !dirty[type]) return;
  const lim = type === 'hit' ? { n: 25, ms: 5 * 60e3 } : { n: 10, ms: 60e3 };
  if (!force && dirty[type] < lim.n && Date.now() - lastFlush[type] < lim.ms) return;
  dirty[type] = 0; lastFlush[type] = Date.now();
  const today = dayAR();
  for (const [d, A] of Object.entries(acc[type])) {
    try { await KV.put(`stats:${type}:${d}:${ISO}`, '', { metadata: A, expirationTtl: TTL }); } catch { }
    if (d < today) delete acc[type][d];
  }
}
export async function flushStats(env, force = false) { await flushType(env, 'hit', force); await flushType(env, 'mail', force); }

// Visita (beacon del navegador). `first`: primera visita del día de ese navegador. `mobile`: pantalla chica.
export async function countHit(env, { first = false, mobile = false, logged = false } = {}) {
  bump('hit', { views: 1, visitors: first ? 1 : 0, mobile: first && mobile ? 1 : 0, logged: first && logged ? 1 : 0 });
  await flushType(env, 'hit');
}
// Mail enviado (lo llama sendMail). Se guarda cada 10 mails o 1 minuto, y siempre al terminar cada revisión programada.
export async function countMail(env, kind) {
  bump('mail', { total: 1, [`k_${cap(kind)}`]: 1 });
  await flushType(env, 'mail');
}

// Lectura: suma de todas las instancias por día (incluye lo que esta instancia todavía no guardó).
export async function readStats(env, type, days = 60) {
  const KV = env?.MACRO_STORE, out = {}, from = new Date(Date.now() - 3 * 3600e3 - (days - 1) * 86400e3).toISOString().slice(0, 10);
  const add = (d, A) => { if (d < from) return; const o = (out[d] ||= {}); for (const [k, v] of Object.entries(A || {})) if (Number.isFinite(+v)) o[k] = (o[k] || 0) + +v; };
  const mine = {};
  if (KV?.list) {
    let cursor; do {
      const r = await KV.list({ prefix: `stats:${type}:`, cursor });
      for (const k of r.keys) { const [, , d, iso] = k.name.split(':'); if (iso === ISO) { mine[d] = k.metadata; continue; } add(d, k.metadata); }
      cursor = r.list_complete ? null : r.cursor;
    } while (cursor);
  }
  // Lo de esta instancia: lo de memoria es acumulado (incluye lo guardado), así que manda sobre su clave.
  for (const d of new Set([...Object.keys(mine), ...Object.keys(acc[type])])) add(d, acc[type][d] || mine[d]);
  return out;
}

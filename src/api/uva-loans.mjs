// v139 · Tasas de préstamos hipotecarios UVA por banco (BCRA — API del Régimen de Transparencia).
// https://api.bcra.gob.ar/transparencia/v1.0/Prestamos/Hipotecarios devuelve todas las líneas informadas por las
// entidades. Para cada entidad se toma la línea UVA para "Vivienda propia, única y permanente" con la menor tasa para
// clientes (clientes que acreditan sueldos, clientes con cuenta o todos los beneficiarios); si la entidad sólo informa
// otros segmentos (p. ej. empleados públicos), se usa la menor de esas y se aclara el segmento.
// La respuesta se guarda en KV (uva:loans) y en la caché del edge; si el BCRA no responde se usa el último guardado.
const API = 'https://api.bcra.gob.ar/transparencia/v1.0/Prestamos/Hipotecarios';
const KV_KEY = 'uva:loans';
const PRIORITY = ['Clientes que acrediten sueldos en la entidad', 'Clientes con cuenta en la entidad', 'Todos los beneficiarios'];
const LABEL = { 'Clientes que acrediten sueldos en la entidad': 'Clientes con sueldo en el banco', 'Clientes con cuenta en la entidad': 'Clientes con cuenta', 'Todos los beneficiarios': 'Todos los clientes' };
const SMALL = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e']);
export function prettyBank(s) {
  const t = String(s || '').replace(/\b(S\.?A\.?U?\.?|SOCIEDAD AN[OÓ]NIMA(\s+UNIPERSONAL)?|COOPERATIVO LIMITADO)\b\.?/gi, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  return t.split(' ').map((w, i) => (i && SMALL.has(w)) ? w : w.replace(/^(\(?)(\p{L})/u, (_, p, c) => p + c.toUpperCase())).join(' ')
    .replace(/\bBbva\b/, 'BBVA').replace(/\bIcbc\b/, 'ICBC').replace(/\bAnd\b/, 'and').replace(/\bOf\b/, 'of').replace(/\(argentina\)/i, '(Argentina)')
    .replace(/\bNacion\b/, 'Nación').replace(/\bCordoba\b/, 'Córdoba').replace(/\bNeuquen\b/, 'Neuquén').replace(/\bRios\b/, 'Ríos');
}
const tnaFromTea = tea => (Math.pow(1 + tea / 100, 1 / 12) - 1) * 1200;
export function summarizeUvaLoans(rows) {
  const by = new Map();
  for (const x of rows || []) {
    if (x?.denominacion !== 'UVA' || x?.destinoFondos !== 'Vivienda propia, única y permanente') continue;
    const tea = Number(x.tasaEfectivaAnualMaxima); if (!Number.isFinite(tea) || tea <= 0 || tea > 60) continue;
    const rank = PRIORITY.includes(x.beneficiario) ? 0 : 1;   // 0 = línea para clientes (sueldo, cuenta o todos); 1 = otros segmentos
    const cur = by.get(x.codigoEntidad);
    if (!cur || rank < cur.rank || (rank === cur.rank && tea < cur.tea)) by.set(x.codigoEntidad, { rank, tea, x });
  }
  const banks = [...by.values()].map(({ rank, tea, x }) => ({
    code: x.codigoEntidad, name: prettyBank(x.descripcionEntidad), tea: Math.round(tea * 100) / 100, tna: Math.round(tnaFromTea(tea) * 100) / 100,
    beneficiary: LABEL[x.beneficiario] || x.beneficiario || '', clientRate: rank === 0, product: x.nombreCorto || x.nombreCompleto || '',
    rateType: x.tipoTasa || '', maxTermMonths: Number(x.plazoMaximoOtorgable) || null, ltv: Number(x.relacionMontoTasacion) || null,
    installmentToIncome: Number(x.relacionCuotaIngreso) || null, minIncome: Number(x.ingresoMinimoMensual) || null, cft: Number(x.costoFinancieroEfectivoTotalMaximo) || null,
    date: String(x.fechaInformacion || '').slice(0, 10)
  })).sort((a, b) => a.name.localeCompare(b.name, 'es'));
  return banks;
}
export default async function uvaLoans(env, ctx) {
  const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=900', 'access-control-allow-origin': '*' };
  const cacheKey = new Request('https://macro-cache.internal/api/uva-loans/v139');
  try { const hit = await caches?.default?.match(cacheKey); if (hit) return new Response(await hit.text(), { headers: { ...headers, 'x-uva-cache': 'edge' } }); } catch { }
  let stored = null; try { stored = await env?.MACRO_STORE?.get?.(KV_KEY, 'json'); } catch { }
  if (stored?.fetchedAt && Date.now() - Date.parse(stored.fetchedAt) < 3 * 3600e3) return new Response(JSON.stringify(stored), { headers: { ...headers, 'x-uva-cache': 'kv' } });
  let body;
  try {
    const c = new AbortController(), t = setTimeout(() => c.abort(), 12000);
    let j; try { const r = await fetch(API, { signal: c.signal, headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0 (compatible; macrodatos.ar)' } }); if (!r.ok) throw new Error(`BCRA ${r.status}`); j = await r.json(); } finally { clearTimeout(t); }
    const banks = summarizeUvaLoans(j?.results);
    if (banks.length < 5) throw new Error('BCRA: respuesta incompleta');
    body = { status: 'ok', source: 'BCRA — Régimen de Transparencia (préstamos hipotecarios)', sourceUrl: API, fetchedAt: new Date().toISOString(), banks };
    try { const w = env?.MACRO_STORE?.put?.(KV_KEY, JSON.stringify(body)); if (w && ctx?.waitUntil) ctx.waitUntil(w); } catch { }
  } catch (e) {
    if (stored?.banks?.length) body = { ...stored, status: 'snapshot', refreshError: String(e?.message || e) };
    else return new Response(JSON.stringify({ status: 'error', error: String(e?.message || e) }), { status: 503, headers: { ...headers, 'cache-control': 'no-store' } });
  }
  const text = JSON.stringify(body);
  try { const p = caches?.default?.put(cacheKey, new Response(text, { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=1800' } })); if (p && ctx?.waitUntil) ctx.waitUntil(p); } catch { }
  return new Response(text, { headers });
}

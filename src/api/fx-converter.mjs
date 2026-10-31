// v226 · Conversor de monedas (pestaña Dólar). Cotizaciones del dólar en pesos (BNA, MEP, blue y CCL, compra y venta)
// y tipos de cambio internacionales contra el dólar, para convertir cualquier moneda usando el dólar elegido como puente.
const UA = { accept: 'application/json', 'user-agent': 'Mozilla/5.0 (compatible; macrodatos.ar)' };
async function getJson(url, ms = 6000) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), ms);
  try { const r = await fetch(url, { signal: c.signal, headers: UA, cf: { cacheTtl: 300, cacheEverything: true } }); if (!r.ok) throw new Error(`${r.status} ${url}`); return await r.json(); }
  finally { clearTimeout(t); }
}
// Monedas que ofrece el conversor (además de ARS y USD), en orden de aparición.
export const FX_CURRENCIES = ['EUR', 'BRL', 'UYU', 'CLP', 'PYG', 'BOB', 'PEN', 'COP', 'MXN', 'GBP', 'CHF', 'JPY', 'CNY', 'CAD', 'AUD'];
const num = v => { const x = Number(v); return Number.isFinite(x) && x > 0 ? x : null; };
function quote(o, source) {
  const buy = num(o?.compra), sell = num(o?.venta);
  if (!buy && !sell) return null;
  return { buy, sell, updatedAt: o?.fechaActualizacion || null, source };
}
export default async function fxConverter() {
  const [all, bna, intl, intl2] = await Promise.allSettled([
    getJson('https://dolarapi.com/v1/dolares'),
    getJson('https://dolarapi.com/v1/ambito/dolares/bna'),
    getJson('https://open.er-api.com/v6/latest/USD'),
    getJson('https://api.frankfurter.dev/v1/latest?base=USD')
  ]);
  const by = {}; if (all.status === 'fulfilled' && Array.isArray(all.value)) for (const x of all.value) by[String(x.casa || '').toLowerCase()] = x;
  const dollars = {
    bna: (bna.status === 'fulfilled' && quote(bna.value, 'Banco Nación (Ámbito)')) || quote(by.oficial, 'Oficial (DolarApi)'),
    mep: quote(by.bolsa, 'MEP (DolarApi)'),
    blue: quote(by.blue, 'Blue (DolarApi)'),
    ccl: quote(by.contadoconliqui, 'CCL (DolarApi)')
  };
  // Tipos de cambio internacionales: unidades de cada moneda por 1 USD.
  const rates = {}; let ratesSource = null, ratesDate = null;
  if (intl.status === 'fulfilled' && intl.value?.result === 'success' && intl.value.rates) {
    for (const c of FX_CURRENCIES) { const v = num(intl.value.rates[c]); if (v) rates[c] = v; }
    ratesSource = 'ExchangeRate-API (open.er-api.com)'; ratesDate = intl.value.time_last_update_utc ? new Date(intl.value.time_last_update_utc).toISOString().slice(0, 10) : null;
  }
  if (intl2.status === 'fulfilled' && intl2.value?.rates) {
    let used = false; for (const c of FX_CURRENCIES) { const v = num(intl2.value.rates[c]); if (v && !rates[c]) { rates[c] = v; used = true; } }
    if (used || !ratesSource) { ratesSource = ratesSource ? `${ratesSource} y BCE (Frankfurter)` : 'Banco Central Europeo (Frankfurter)'; ratesDate ||= intl2.value.date || null; }
  }
  const ok = Object.values(dollars).some(Boolean);
  const body = { status: ok ? 'ok' : 'error', dollars, rates, ratesSource, ratesDate, currencies: FX_CURRENCIES.filter(c => rates[c]), updatedAt: new Date().toISOString() };
  return new Response(JSON.stringify(body), { status: ok ? 200 : 502, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-cache', 'access-control-allow-origin': '*' } });
}

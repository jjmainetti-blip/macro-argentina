// v167 · Cotizaciones de acciones, bonos, letras, ON, CEDEARs y ADRs para los resúmenes por mail (etapa 3).
// Fuente: data912.com (API pública y gratuita con datos de BYMA y de Wall Street; precios con demora).
//   /live/<lista>                → [{symbol, c (último), pct_change (variación del día, %), …}]
//   /historical/<tipo>/<ticker>  → [{date, c, …}]  (stocks, bonds, cedears)
//   /historical/usa_stocks/<t>   → {dates:[], prices:[]}  (Wall Street)
const BASE = 'https://data912.com';
export const MARKETS = {
  ar: { list: 'arg_stocks', hist: 'stocks', label: 'Acción BYMA' },
  bono: { list: 'arg_bonds', hist: 'bonds', label: 'Bono' },
  letra: { list: 'arg_notes', hist: 'bonds', label: 'Letra' },
  on: { list: 'arg_corp', hist: 'bonds', label: 'ON' },
  cedear: { list: 'arg_cedears', hist: 'cedears', label: 'CEDEAR' },
  us: { list: ['usa_adrs', 'usa_stocks'], hist: 'usa_stocks', label: 'Wall Street' },
};
// Empresas argentinas que cotizan en Nueva York (ADRs y acciones directas).
export const AR_US = { GGAL: 'Grupo Galicia', YPF: 'YPF', PAM: 'Pampa Energía', BMA: 'Banco Macro', BBAR: 'BBVA Argentina', SUPV: 'Supervielle', CEPU: 'Central Puerto', EDN: 'Edenor', TEO: 'Telecom', TGS: 'TGS', CRESY: 'Cresud', IRS: 'IRSA', LOMA: 'Loma Negra', TX: 'Ternium', TS: 'Tenaris', MELI: 'Mercado Libre', GLOB: 'Globant', VIST: 'Vista Energy', BIOX: 'Bioceres', CAAP: 'Corporación América', DESP: 'Despegar' };
const NAMES = {
  ...AR_US, YPFD: 'YPF', PAMP: 'Pampa Energía', TECO2: 'Telecom', TGSU2: 'TGS', TGNO4: 'TGN', CRES: 'Cresud', IRSA: 'IRSA', LOMA: 'Loma Negra', TXAR: 'Ternium Arg.', ALUA: 'Aluar', COME: 'Comercial del Plata', TRAN: 'Transener', BYMA: 'BYMA', VALO: 'Grupo Valores', METR: 'Metrogas', MIRG: 'Mirgor', CVH: 'Cablevisión Holding', HARG: 'Holcim Arg.', AGRO: 'Agrometal', SAMI: 'San Miguel',
  AL29: 'Bonar 2029', AL30: 'Bonar 2030', AL35: 'Bonar 2035', AE38: 'Bonar 2038', AL41: 'Bonar 2041', GD29: 'Global 2029', GD30: 'Global 2030', GD35: 'Global 2035', GD38: 'Global 2038', GD41: 'Global 2041', GD46: 'Global 2046', TX26: 'Boncer 2026', TX28: 'Boncer 2028', DICP: 'Discount $', PARP: 'Par $', CUAP: 'Cuasipar',
};
const baseSym = s => String(s).replace(/[DC]$/, '');
export function instrumentName(market, symbol) { return NAMES[symbol] || (market !== 'us' ? NAMES[baseSym(symbol)] : null) || null; }
// Moneda: en BYMA los tickers terminados en D cotizan en dólares MEP y en C en dólares cable; Wall Street, en dólares.
export function currencyOf(market, symbol) { if (market === 'us') return 'USD'; if (symbol.length > 3 && /D$/.test(symbol)) return 'USD'; if (symbol.length > 3 && /C$/.test(symbol)) return 'USD cable'; return 'ARS'; }

async function getJson(url, ms = 7000) {
  const c = new AbortController(), t = setTimeout(() => c.abort(), ms);
  try { const r = await fetch(url, { signal: c.signal, headers: { accept: 'application/json', 'user-agent': 'macrodatos.ar' } }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return await r.json(); }
  finally { clearTimeout(t); }
}
let LIVE = { at: 0, data: {} };
// Cotizaciones en vivo de los mercados pedidos. Devuelve { 'ar:GGAL': {id, market, symbol, price, pct}, … }.
export async function liveQuotes(markets = Object.keys(MARKETS), { maxAgeMs = 3 * 60 * 1000 } = {}) {
  const out = {}, errors = [];
  await Promise.all(markets.map(async m => {
    const cached = LIVE.data[m];
    if (cached && Date.now() - cached.at < maxAgeMs) { Object.assign(out, cached.q); return; }
    const lists = [].concat(MARKETS[m].list), q = {};
    try {
      for (const l of lists) {
        const arr = await getJson(`${BASE}/live/${l}`);
        for (const x of Array.isArray(arr) ? arr : []) {
          if (!x?.symbol || !(Number(x.c) > 0)) continue;
          if (m === 'us' && !AR_US[x.symbol]) continue;
          q[`${m}:${x.symbol}`] = { id: `${m}:${x.symbol}`, market: m, symbol: x.symbol, price: Number(x.c), pct: Number.isFinite(Number(x.pct_change)) ? Number(x.pct_change) : null };
        }
      }
      LIVE.data[m] = { at: Date.now(), q }; Object.assign(out, q);
    } catch (e) { errors.push(`${m}: ${e?.message || e}`); if (cached) Object.assign(out, cached.q); }
  }));
  return Object.assign(out, errors.length ? { _errors: errors } : {});
}
// Cierre en la fecha d o el anterior más cercano (para la variación semanal).
export async function closeOn(id, d) {
  const [m, symbol] = id.split(':'), M = MARKETS[m]; if (!M) return null;
  try {
    const j = await getJson(`${BASE}/historical/${M.hist}/${encodeURIComponent(symbol)}`);
    let rows = [];
    if (Array.isArray(j)) rows = j.map(r => [String(r.date).slice(0, 10), Number(r.c)]);
    else if (Array.isArray(j?.dates)) rows = j.dates.map((x, i) => [String(x).slice(0, 10), Number(j.prices?.[i])]);
    rows = rows.filter(([k, v]) => k <= d && v > 0);
    const last = rows.at(-1); return last ? { date: last[0], value: last[1] } : null;
  } catch { return null; }
}
// Catálogo para el buscador del navegador: [id, símbolo, mercado, nombre, precio, variación].
let CAT = { at: 0, body: null };
export async function catalog() {
  if (CAT.body && Date.now() - CAT.at < 5 * 60 * 1000) return CAT.body;
  const q = await liveQuotes();
  const rows = Object.values(q).filter(x => x && x.id).map(x => { const n = instrumentName(x.market, x.symbol) || ''; return [x.id, x.symbol, MARKETS[x.market].label, n.toUpperCase() === x.symbol ? '' : n, x.price, x.pct]; });
  const order = Object.keys(MARKETS);
  rows.sort((a, b) => order.indexOf(a[0].split(':')[0]) - order.indexOf(b[0].split(':')[0]) || a[1].localeCompare(b[1]));
  CAT = { at: Date.now(), body: { generatedAt: new Date().toISOString(), source: 'data912.com (BYMA y Wall Street, con demora)', errors: q._errors || null, rows } };
  return CAT.body;
}
// Cotizaciones de una lista de seguimiento (ids), con variación semanal opcional.
export async function watchQuotes(ids, { weekly = false, since = null } = {}) {
  const markets = [...new Set(ids.map(id => id.split(':')[0]).filter(m => MARKETS[m]))];
  if (!markets.length) return [];
  const q = await liveQuotes(markets);
  return Promise.all(ids.map(async id => {
    const [m, symbol] = id.split(':'), x = q[id];
    const nm = instrumentName(m, symbol), r = { id, market: m, symbol, name: nm && nm.toUpperCase() !== symbol ? nm : null, label: MARKETS[m]?.label || m, currency: currencyOf(m, symbol), price: x?.price ?? null, pct: x?.pct ?? null, week: null };
    if (weekly && x && since) { const c = await closeOn(id, since); if (c) r.week = (x.price / c.value - 1) * 100; }
    return r;
  }));
}

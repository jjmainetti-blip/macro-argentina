// v133 · La portada sale del Worker con los últimos valores de "Mercados ahora" ya escritos en el HTML
// (último dato guardado en KV), para que al abrir el sitio nunca se vean valores viejos mientras carga /api/markets.
const TZ = 'America/Argentina/Buenos_Aires';
const fmt = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });
const fmt0 = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });

function stamp(x) {
  const d = String(x?.date || '').slice(0, 10); if (!d) return '';
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
  if (d === today) {
    let hm = '';
    try { if (x.updatedAt) hm = new Date(x.updatedAt).toLocaleTimeString('es-AR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }); } catch { }
    return `Hoy${hm ? ` · ${hm}` : ''}${x.source ? ` · ${x.source}` : ''}`;
  }
  const [yy, mm, dd] = d.split('-');
  return `Cierre ${dd}/${mm}/${yy}${x.source ? ` · ${x.source}` : ''}`;
}
function change(x, inverse) {
  const c = x?.changePct;
  if (c == null || !Number.isFinite(Number(c))) return { text: '—', cls: 'market-change neutral' };
  const n = Number(c), good = inverse ? n < 0 : n > 0;
  return { text: `${n > 0 ? '↑' : n < 0 ? '↓' : '→'} ${n > 0 ? '+' : ''}${fmt.format(n)}%`, cls: 'market-change ' + (n === 0 ? 'neutral' : good ? 'positive' : 'negative') };
}

// v143 · Compras netas de divisas del BCRA (millones de USD).
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export function bcraView(b) {
  const usd = n => `${n > 0 ? '+' : n < 0 ? '−' : ''}US$ ${fmt0.format(Math.abs(n))} M`;
  const [y, m, d] = String(b.date || '').split('-'), mm = +String(b.month || '').slice(5);
  const value = Number(b.value) === 0 ? 'US$ 0 M' : usd(Number(b.value));
  const mt = Number(b.monthToDate), change = Number.isFinite(mt) && mm ? `${MES[mm - 1]}: ${mt > 0 ? '+' : mt < 0 ? '−' : ''}${fmt0.format(Math.abs(mt))} M` : '—';
  const cls = 'market-change ' + (Number(b.monthToDate) > 0 ? 'positive' : Number(b.monthToDate) < 0 ? 'negative' : 'neutral');
  const date = `${Number(b.value) < 0 ? 'Vendió' : 'Compró'} el ${d}/${m}/${y}${Number.isFinite(Number(b.reserves)) ? ` · reservas US$ ${fmt0.format(b.reserves)} M` : ''}`;
  return { value, change, cls, date };
}
// id del elemento → { text, cls? }
export function marketsView(L) {
  const v = {};
  if (!L) return v;
  const put = (key, x, value, inverse, date = stamp(x)) => {
    const c = change(x, inverse);
    v[key] = { text: value }; v[key + 'Change'] = { text: c.text, cls: c.cls }; v[key + 'Date'] = { text: date };
  };
  if (L.merval?.value) put('heroMerval', L.merval, `${fmt0.format(L.merval.value)} pts`, false);
  if (L.dollar?.value) put('heroDollar', L.dollar, `$ ${fmt.format(L.dollar.value)}`, true);
  if (L.risk?.value) put('heroRisk', L.risk, `${fmt.format(L.risk.value)} pb`, true);
  if (L.bna?.sell) put('heroBna', L.bna, `$ ${fmt.format(L.bna.sell)} venta`, true, `${stamp(L.bna)} · compra $ ${fmt.format(L.bna.buy)}`);
  if (L.bcra && Number.isFinite(Number(L.bcra.value))) { const b = bcraView(L.bcra); v.heroBcra = { text: b.value }; v.heroBcraChange = { text: b.change, cls: b.cls }; v.heroBcraDate = { text: b.date }; }
  return v;
}

export async function homeWithMarkets(request, env, latestBody, release = null, seen = null) {
  const res = await env.ASSETS.fetch(request);
  const type = res.headers.get('content-type') || '';
  if (!res.ok || !type.includes('text/html') || (!latestBody && !release) || typeof HTMLRewriter === 'undefined') return res;
  let data = null; try { data = latestBody ? JSON.parse(latestBody) : null; } catch { }
  const view = marketsView(data?.latest);
  // v134: "Último dato publicado" también sale escrito en el HTML.
  if (release?.title) { view.latestReleaseTitle = { text: release.title }; view.latestReleaseValue = { text: release.value }; view.latestReleaseDate = { text: release.date || '' }; }
  let rw = new HTMLRewriter();
  for (const [id, o] of Object.entries(view)) {
    rw = rw.on(`#${id}`, { element(el) { el.setInnerContent(o.text); if (o.cls) el.setAttribute('class', o.cls); } });
  }
  // El navegador recibe el mismo dato para no repintar con una copia local más vieja.
  const esc = t => String(t).replace(/</g, '\\u003c');
  const inject = (data ? `window.__MARKETS__=${esc(latestBody)};` : '') + (release?.title ? `window.__LATEST_RELEASE__=${esc(JSON.stringify(release))};` : '') + (seen && Object.keys(seen).length ? `window.__CARD_PUB__=${esc(JSON.stringify(seen))};` : '');
  rw = rw.on('head', { element(el) { el.append(`<script>${inject}</script>`, { html: true }); } });
  const out = rw.transform(res);
  const h = new Headers(out.headers);
  h.set('cache-control', 'no-cache'); h.delete('etag'); h.delete('content-length');
  return new Response(out.body, { status: out.status, headers: h });
}

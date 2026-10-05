import macroData, { GROUPS, freshnessReport, latestReleaseFor, cardsSeen } from './api/macro-data.mjs';
import { pickCronGroup } from './api/freshness.mjs';
import calendarData from './api/calendar-data.mjs';
import marketsData, { latestMarketsBody } from './api/markets.mjs';
import { homeWithMarkets } from './api/markets-html.mjs';
import tradeMonthly from './api/trade-monthly.mjs';
import cementMonthly from './api/cement-monthly.mjs';

const jsonHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin'
};

function withHeaders(response) {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(jsonHeaders)) headers.set(k, v);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/assets/duhalde.jpg') {
      const upstream = await fetch('https://www.casarosada.gob.ar/images/stories/galeriapresidentes/gallery/full/duhalde.jpg', { cf: { cacheTtl: 604800, cacheEverything: true } });
      if (!upstream.ok) return new Response('Image unavailable', { status: 502 });
      const headers = new Headers(upstream.headers);
      headers.set('cache-control', 'public, max-age=604800, stale-while-revalidate=2592000');
      headers.set('content-type', upstream.headers.get('content-type') || 'image/jpeg');
      return new Response(upstream.body, { status: 200, headers });
    }
    if (request.method === 'GET' && url.pathname === '/api/markets') {
      return withHeaders(await marketsData(request, ctx, env));
    }
    if (request.method === 'GET' && url.pathname === '/api/trade-monthly') {
      return withHeaders(await tradeMonthly());
    }
    if (request.method === 'GET' && url.pathname === '/api/cement-monthly') {
      return withHeaders(await cementMonthly(request));
    }
    if (request.method === 'GET' && url.pathname === '/api/macro-data') {
      return withHeaders(await macroData(env, ctx, request));
    }
    // v128: estado de actualización de cada tarjeta (último período, próximo esperado y fecha prevista).
    if (request.method === 'GET' && url.pathname === '/api/status') {
      const cards = await freshnessReport(env);
      return withHeaders(new Response(JSON.stringify({ generatedAt: new Date().toISOString(), kv: !!env?.MACRO_STORE, cards }, null, 1), { headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'access-control-allow-origin': '*' } }));
    }
    if (request.method === 'GET' && url.pathname === '/api/calendar-data') {
      return withHeaders(await calendarData());
    }
    if (url.pathname.startsWith('/api/')) {
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'content-type': 'application/json; charset=utf-8', ...jsonHeaders }
      });
    }
    // v133: la portada lleva escritos los últimos valores de mercado (KV) para no mostrar datos viejos al abrir.
    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      const [m, rel, seen] = await Promise.allSettled([latestMarketsBody(env), latestReleaseFor(env, ctx), cardsSeen(env)]);
      try { return withHeaders(await homeWithMarkets(request, env, m.value || null, rel.value || null, seen.value || null)); } catch { }
    }
    return withHeaders(await env.ASSETS.fetch(request));
  },

  // v128 · Revisión programada cada 5 minutos (dos Cron Triggers desfasados). Cada ejecución actualiza UN grupo de fuentes
  // (límite de 50 pedidos externos por invocación del plan gratuito). Prioriza los grupos con tarjetas cuyo
  // próximo dato ya debería estar publicado según el calendario: así se capturan ni bien salen.
  async scheduled(event, env, ctx) {
    const groups = Object.keys(GROUPS), tick = Math.floor((event.scheduledTime || Date.now()) / 300000);
    let statuses = [];
    try { statuses = await freshnessReport(env); } catch { }
    const { group, reason } = pickCronGroup(statuses, groups, tick);
    // v133: en cada ejecución se renueva también el último dato de mercados (KV), aunque nadie esté mirando el sitio.
    ctx.waitUntil(marketsData(null, ctx, env, { force: true }).catch(e => console.log(`cron markets: error ${e?.message || e}`)));
    ctx.waitUntil(macroData(env, ctx, new Request(`https://cron.invalid/api/macro-data?group=${group}`), { force: true })
      .then(r => r.json()).then(async j => { try { await latestReleaseFor(env, null, { force: true }); } catch { } return j; }).then(j => console.log(`cron ${group} (${reason}): guardado=${j.stored} esperando=${statuses.filter(s => s.state === 'esperando').map(s => s.key).join(',') || '—'}`))
      .catch(e => console.log(`cron ${group}: error ${e?.message || e}`)));
  }
};

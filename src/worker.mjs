import macroData from './api/macro-data.mjs';
import calendarData from './api/calendar-data.mjs';
import marketsData from './api/markets.mjs';
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
      return withHeaders(await marketsData(request, ctx));
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
    if (request.method === 'GET' && url.pathname === '/api/calendar-data') {
      return withHeaders(await calendarData());
    }
    if (url.pathname.startsWith('/api/')) {
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'content-type': 'application/json; charset=utf-8', ...jsonHeaders }
      });
    }
    return withHeaders(await env.ASSETS.fetch(request));
  }
};

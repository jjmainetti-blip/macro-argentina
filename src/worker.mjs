import macroData from './api/macro-data.mjs';
import calendarData from './api/calendar-data.mjs';

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
    if (request.method === 'GET' && url.pathname === '/api/macro-data') {
      return withHeaders(await macroData());
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

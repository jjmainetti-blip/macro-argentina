// v227 · Recaudación tributaria en X (@Arca_informa). ARCA anuncia el dato del mes en X antes de subir la novedad y el
// informe a su sitio. Igual que con el BCRA y el INDEC, sólo se consulta X cuando se espera la publicación: el día que
// marca el calendario (calendar-data.mjs) y, si ese día no aparece, los 3 días hábiles siguientes; desde las 18 h
// (Argentina) y hasta las 23 h, como mucho una consulta cada 5 minutos, y nada más una vez capturado el mes esperado.
// v228: ARCA publica el dato en una placa (imagen), como el BCRA: la placa se lee con Workers AI (binding AI) y su
// contenido se agrega al texto del posteo, en una frase que entiende el lector de la novedad de ARCA.
// Estado en KV (x:arca): {userId, sinceId, lastCheck, doneYm, posts[], recent[]}.
import { EVENTS } from './calendar-data.mjs';
import { cleanXToken } from './markets.mjs';

const X_USER = 'Arca_informa', KV_KEY = 'x:arca';
const AI_MODELS = ['@cf/meta/llama-4-scout-17b-16e-instruct', '@cf/google/gemma-3-12b-it'];
const MES_RE = /(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)/i;
// Lee una placa de recaudación y devuelve una frase normalizada, o null si la imagen no es de recaudación.
export async function readArcaCard(env, url) {
  const img = await fetch(url + (url.includes('?') ? '' : '?name=medium')); if (!img.ok) throw new Error(`imagen ${img.status}`);
  const buf = new Uint8Array(await img.arrayBuffer()); let bin = ''; for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  const data = `data:${img.headers.get('content-type') || 'image/jpeg'};base64,${btoa(bin)}`;
  const prompt = 'Esta imagen es una placa de ARCA (Agencia de Recaudación y Control Aduanero de Argentina). Si muestra la recaudación tributaria TOTAL de un mes, copiá EXACTAMENTE como aparecen escritos (como texto, sin convertir separadores): el mes y el año, el monto total con su unidad (millones o billones) y la variación interanual del total en %, con su signo si lo tiene. Si no es una placa de recaudación total, respondé {"recaudacion":false}. Respondé sólo con JSON: {"recaudacion":true,"mes":"...","anio":"...","total":"...","unidad":"...","variacion":"..."}';
  let last = '';
  for (const model of AI_MODELS) {
    try {
      const out = await env.AI.run(model, { messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: data } }] }], max_tokens: 200, temperature: 0 });
      const txt = typeof out?.response === 'string' ? out.response : JSON.stringify(out?.response ?? out); last = txt;
      const m = txt.match(/\{[\s\S]*\}/); if (!m) continue; const o = JSON.parse(m[0]);
      if (o.recaudacion === false) return null;
      const mes = String(o.mes || '').match(MES_RE)?.[1]?.toLowerCase(), anio = String(o.anio || o.mes || '').match(/20\d{2}/)?.[0] || '';
      const v = String(o.variacion || '').replace(/\s/g, '').replace(/%$/, '');
      if (!mes || !/^[+\-−–]?\d+(?:[.,]\d+)?$/.test(v)) continue;
      const neg = /^[\-−–]/.test(v), vv = v.replace(/^[+\-−–]/, '');
      const tot = String(o.total || '').replace(/[^\d.,]/g, ''), uni = /billon/i.test(String(o.unidad || o.total || '')) ? 'billones' : 'millones';
      return `La recaudación tributaria de ${mes}${anio ? ` de ${anio}` : ''} fue de ${tot ? `$ ${tot} ${uni}` : 'un total'}, con una variación interanual ${neg ? 'de caída del' : 'del'} ${vv}%.`;
    } catch (e) { last = String(e?.message || e); }
  }
  throw new Error(`IA sin resultado: ${last.slice(0, 150)}`);
}
const arNow = () => { const d = new Date(Date.now() - 3 * 3600e3); return { day: d.toISOString().slice(0, 10), h: d.getUTCHours() }; };
const MESES = { enero: '01', febrero: '02', marzo: '03', abril: '04', mayo: '05', junio: '06', julio: '07', agosto: '08', septiembre: '09', setiembre: '09', octubre: '10', noviembre: '11', diciembre: '12' };
const isBiz = d => ![0, 6].includes(new Date(d + 'T12:00:00Z').getUTCDay());
function addBizDays(day, n) { const x = new Date(day + 'T12:00:00Z'); let k = 0; while (k < n) { x.setUTCDate(x.getUTCDate() + 1); if (isBiz(x.toISOString().slice(0, 10))) k++; } return x.toISOString().slice(0, 10); }
// Publicación de ARCA que se espera hoy (o que se demoró hasta 3 días hábiles): {date, ym} o null.
export function arcaReleaseDue(day) {
  for (const e of EVENTS.filter(e => e.agency === 'ARCA' && /Recaudaci[oó]n/i.test(e.title || ''))) {
    if (day < e.date || day > addBizDays(e.date, 3)) continue;
    const m = String(e.period || e.ref || '').toLowerCase().match(/(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s+(20\d{2})/);
    return { date: e.date, ym: m ? `${m[2]}-${MESES[m[1]]}` : null };
  }
  return null;
}
async function xErr(r, label) { let d = ''; try { const j = await r.json(); d = j?.detail || j?.title || j?.errors?.[0]?.message || ''; } catch { } return `${label} ${r.status}${d ? `: ${String(d).slice(0, 160)}` : ''}`; }

// Devuelve las publicaciones recientes de ARCA (últimos 10 días) como [{id, at, text}]. Si corresponde, antes consulta X.
// parse(text, date) → {ym, …} | null: el lector de la novedad de ARCA (macro-data), para saber si ya está el mes esperado.
export async function arcaXPosts(env, parse, { force = false } = {}) {
  const KV = env?.MACRO_STORE; if (!KV?.get) return [];
  let st = {}; try { st = (await KV.get(KV_KEY, 'json')) || {}; } catch { }
  const token = cleanXToken(env?.X_BEARER_TOKEN), now = Date.now(), { day, h } = arNow();
  const rel = arcaReleaseDue(day);
  const due = token && (force || (rel && h >= 18 && h < 23 && !(rel.ym && st.doneYm === rel.ym)))
    && (!st.lastCheck || now - st.lastCheck > 5 * 60 * 1000) && (!st.backoffUntil || now > st.backoffUntil);
  if (due) {
    st.lastCheck = now;
    try {
      const H = { authorization: `Bearer ${token}`, 'user-agent': 'macrodatos.ar' };
      if (!st.userId) { const r = await fetch(`https://api.x.com/2/users/by/username/${X_USER}`, { headers: H }); if (!r.ok) { if ([401, 402, 403, 429].includes(r.status)) st.backoffUntil = now + 30 * 60 * 1000; throw new Error(await xErr(r, 'X ARCA user')); } st.userId = (await r.json())?.data?.id; if (!st.userId) throw new Error('X ARCA: usuario no encontrado'); }
      const q = new URLSearchParams({ max_results: '20', 'tweet.fields': 'created_at,note_tweet,attachments', expansions: 'attachments.media_keys', 'media.fields': 'alt_text,type,url', exclude: 'retweets,replies' });
      if (st.sinceId) q.set('since_id', st.sinceId); else q.set('start_time', new Date(now - 4 * 24 * 3600e3).toISOString());
      const r = await fetch(`https://api.x.com/2/users/${st.userId}/tweets?${q}`, { headers: H });
      if ([401, 402, 403, 429].includes(r.status)) { st.backoffUntil = now + 60 * 60 * 1000; st.lastError = await xErr(r, 'X ARCA tweets'); }
      else if (!r.ok) throw new Error(`X ARCA tweets ${r.status}`);
      else {
        const j = await r.json(); if (j?.meta?.newest_id) st.sinceId = j.meta.newest_id;
        const media = Object.fromEntries((j?.includes?.media || []).map(m => [m.media_key, m]));
        const fresh = []; let aiUsed = 0;
        for (const t of (j?.data || [])) {
          const imgs = (t.attachments?.media_keys || []).map(k => media[k]).filter(m => m && m.type === 'photo');
          const alt = imgs.map(m => m.alt_text || '').filter(Boolean).join(' ');
          let text = `${String(t.note_tweet?.text || t.text || '')} ${alt}`.replace(/https?:\/\/\S+/g, ' ').replace(/\s+/g, ' ').trim(), via = 'texto';
          // Placa: sólo si el posteo habla de recaudación, el texto no trae ya el dato y hay presupuesto (3 lecturas por consulta).
          const parsed = typeof parse === 'function' ? parse(text, new Date(t.created_at)) : null;
          if (!parsed && imgs.length && /recaudaci|ingresos tributarios|recursos tributarios/i.test(text) && env?.AI && aiUsed < 3) {
            for (const im of imgs.slice(0, 2)) { if (!im.url || aiUsed >= 3) continue; aiUsed++; try { const c = await readArcaCard(env, im.url); if (c) { text = `${text} . ${c}`; via = 'imagen'; break; } } catch (e) { st.aiError = String(e?.message || e).slice(0, 200); } }
          }
          fresh.push({ id: t.id, at: t.created_at, text, via, images: imgs.length });
        }
        const cut = new Date(now - 10 * 24 * 3600e3).toISOString();
        st.posts = [...fresh, ...(st.posts || [])].filter((p, i, a) => p.at >= cut && a.findIndex(x => x.id === p.id) === i).slice(0, 40);
        st.lastRead = fresh.length; st.lastError = null;
        if (rel?.ym && typeof parse === 'function' && st.posts.some(p => parse(p.text, new Date(p.at))?.ym === rel.ym)) st.doneYm = rel.ym;
      }
    } catch (e) { st.lastError = String(e?.message || e); }
    try { await KV.put(KV_KEY, JSON.stringify(st)); } catch { }
  }
  return st.posts || [];
}
export async function arcaXStatus(env) {
  try { const st = await env?.MACRO_STORE?.get?.(KV_KEY, 'json'); if (!st) return null; return { lastCheck: st.lastCheck ? new Date(st.lastCheck).toISOString() : null, lastError: st.lastError || null, doneYm: st.doneYm || null, aiError: st.aiError || null, recent: (st.posts || []).slice(0, 6).map(p => ({ at: p.at, via: p.via || null, images: p.images || 0, text: p.text.slice(0, 260) })) }; } catch { return null; }
}

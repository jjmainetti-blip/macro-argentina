// v205 · Publicaciones de INDEC en X (@INDECArgentina) como fuente rápida del día de publicación.
// INDEC publica sus informes a las 16 h (calendario oficial en calendar-data.mjs) y en el mismo momento postea en X el
// resumen ("En septiembre de 2026, las exportaciones alcanzaron …"). En los días con publicación de INDEC, entre las 16 y
// las 22 h, se leen las publicaciones nuevas cada ~4 minutos hasta capturar todas las del día. El texto se guarda en KV
// (x:indec) y lo usan los mismos lectores que la portada de indec.gob.ar (IPI, ISAC, EMAE, ICA…). Cuando llegan los
// cuadros oficiales, éstos mandan.
import { EVENTS } from './calendar-data.mjs';
import { cleanXToken } from './markets.mjs';

const X_USER = 'INDECArgentina', KV_KEY = 'x:indec';
const arNow = () => { const d = new Date(Date.now() - 3 * 3600e3); return { day: d.toISOString().slice(0, 10), h: d.getUTCHours(), m: d.getUTCMinutes() }; };
export function indecEventsOn(day) { return EVENTS.filter(e => e.agency === 'INDEC' && e.date === day); }

async function xErr(r, label) { let d = ''; try { const j = await r.json(); d = j?.detail || j?.title || j?.errors?.[0]?.message || ''; } catch { } return `${label} ${r.status}${d ? `: ${String(d).slice(0, 160)}` : ''}`; }

// Devuelve el texto de las publicaciones recientes (últimos 4 días). Si corresponde, antes consulta X.
export async function indecXText(env, { force = false } = {}) {
  const KV = env?.MACRO_STORE; if (!KV?.get) return '';
  let st = {}; try { st = (await KV.get(KV_KEY, 'json')) || {}; } catch { }
  const token = cleanXToken(env?.X_BEARER_TOKEN), now = Date.now(), { day, h } = arNow();
  const events = indecEventsOn(day);
  const due = token && (force || (events.length && h >= 16 && h < 22)) && (!st.lastCheck || now - st.lastCheck > 4 * 60 * 1000) && (!st.backoffUntil || now > st.backoffUntil) && !(st.doneDay === day && !force);
  if (due) {
    st.lastCheck = now;
    try {
      const H = { authorization: `Bearer ${token}`, 'user-agent': 'macrodatos.ar' };
      if (!st.userId) { const r = await fetch(`https://api.x.com/2/users/by/username/${X_USER}`, { headers: H }); if (!r.ok) { if ([401, 402, 403, 429].includes(r.status)) st.backoffUntil = now + 30 * 60 * 1000; throw new Error(await xErr(r, 'X INDEC user')); } st.userId = (await r.json())?.data?.id; if (!st.userId) throw new Error('X INDEC: usuario no encontrado'); }
      const q = new URLSearchParams({ max_results: '20', 'tweet.fields': 'created_at,note_tweet', exclude: 'retweets,replies' });
      if (st.sinceId) q.set('since_id', st.sinceId); else q.set('start_time', new Date(now - 4 * 24 * 3600e3).toISOString());
      const r = await fetch(`https://api.x.com/2/users/${st.userId}/tweets?${q}`, { headers: H });
      if ([401, 402, 403, 429].includes(r.status)) { st.backoffUntil = now + 60 * 60 * 1000; st.lastError = await xErr(r, 'X INDEC tweets'); }
      else if (!r.ok) throw new Error(`X INDEC tweets ${r.status}`);
      else {
        const j = await r.json(); if (j?.meta?.newest_id) st.sinceId = j.meta.newest_id;
        const fresh = (j?.data || []).map(t => ({ id: t.id, at: t.created_at, text: String(t.note_tweet?.text || t.text || '').replace(/https?:\/\/\S+/g, ' ').replace(/\s+/g, ' ').trim() }));
        const cut = new Date(now - 4 * 24 * 3600e3).toISOString();
        st.posts = [...fresh, ...(st.posts || [])].filter((p, i, a) => p.at >= cut && a.findIndex(x => x.id === p.id) === i).slice(0, 40);
        st.lastRead = fresh.length; st.lastError = null;
        // ¿Ya están todas las publicaciones de hoy? (una por evento del calendario; se buscan palabras clave del título)
        const todays = (st.posts || []).filter(p => new Date(Date.parse(p.at) - 3 * 3600e3).toISOString().slice(0, 10) === day);
        const key = t => (String(t).match(/\(([A-ZÁÉÍÓÚ]{2,})\)/)?.[1] || String(t).split(/\s+/).slice(0, 3).join(' ')).toLowerCase();
        if (events.length && events.every(e => todays.some(p => p.text.toLowerCase().includes(key(e.title))))) st.doneDay = day;
      }
    } catch (e) { st.lastError = String(e?.message || e); }
    try { await KV.put(KV_KEY, JSON.stringify(st)); } catch { }
  }
  return (st.posts || []).map(p => p.text).join(' . ');
}
export async function indecXStatus(env) { try { const st = await env?.MACRO_STORE?.get?.(KV_KEY, 'json'); if (!st) return null; return { lastCheck: st.lastCheck ? new Date(st.lastCheck).toISOString() : null, lastError: st.lastError || null, doneDay: st.doneDay || null, recent: (st.posts || []).slice(0, 6).map(p => ({ at: p.at, text: p.text.slice(0, 220) })) }; } catch { return null; } }

// ICA: "En septiembre de 2026, las exportaciones alcanzaron USD 8.882 millones … las importaciones … USD 6.696 millones
// … superávit de USD 2.186 millones". Devuelve {ym, exports, imports, balance} o null.
const MESES = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };
const num = s => Number(String(s).replace(/\./g, '').replace(',', '.'));
export function parseIndecIca(text) {
  const t = String(text || '').replace(/\s+/g, ' ');
  const re = /En (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?: de (20\d{2}))?,?([^]{0,600})/gi; let m, best = null;
  while ((m = re.exec(t))) {
    const seg = m[3].split(/ \. |\s#/)[0];
    const ex = seg.match(/exportaciones[^$]{0,80}?(?:USD|US\$|u\$s|\$)\s?([\d.]+(?:,\d+)?)\s*millones/i), im = seg.match(/importaciones[^$]{0,80}?(?:USD|US\$|u\$s|\$)\s?([\d.]+(?:,\d+)?)\s*millones/i);
    if (!ex || !im) continue;
    const bal = seg.match(/(super[aá]vit|d[eé]ficit)[^$]{0,60}?(?:USD|US\$|u\$s|\$)\s?([\d.]+(?:,\d+)?)\s*millones/i);
    const mon = MESES[m[1].toLowerCase()]; let y = m[2] ? +m[2] : null;
    if (!y) { const now = new Date(Date.now() - 3 * 3600e3); y = now.getUTCFullYear(); if (mon > now.getUTCMonth() + 1) y--; }
    const exports = num(ex[1]), imports = num(im[1]); let balance = bal ? num(bal[2]) * (/d[eé]ficit/i.test(bal[1]) ? -1 : 1) : exports - imports;
    if (!Number.isFinite(exports) || !Number.isFinite(imports) || exports < 500 || imports < 500) continue;
    const ym = `${y}-${String(mon).padStart(2, '0')}`; if (!best || ym > best.ym) best = { ym, exports, imports, balance: Math.round(balance * 10) / 10 };
  }
  return best;
}

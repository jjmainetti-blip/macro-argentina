// v196 · Resultado fiscal del mes desde los comunicados de Hacienda (argentina.gob.ar/economia/sechacienda/noticias).
// Economía publica el resultado a media tarde; Datos Argentina recién lo incorpora días después. Del comunicado se
// toman el resultado financiero y el primario del mes (en millones de $); los intereses salen de la diferencia.
const MESES = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };
const NEG = /(d[eé]ficit|deficitari|negativ)/i;
const num = s => Number(String(s).replace(/\./g, '').replace(',', '.'));
function amount(text, what) {
  // primer monto en $ dentro de los 90 caracteres posteriores a "financiero"/"primario"
  const re = new RegExp(`(super[aá]vit|d[eé]ficit|resultado)\\s+${what}([^$]{0,90}?)(-?)\\s*\\$\\s*(-?)\\s*([\\d.]+(?:,\\d+)?)\\s*millones`, 'i');
  const m = String(text).match(re); if (!m) return null;
  const neg = /d[eé]ficit/i.test(m[1]) || NEG.test(m[2]) || m[3] === '-' || m[4] === '-';
  const v = num(m[5]); return Number.isFinite(v) ? (neg ? -v : v) : null;
}
export function parseFiscalNews(text, published) {
  const t = String(text || '').replace(/\s+/g, ' ');
  const mm = t.match(/(?:^|\s)(?:En|Durante)\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b/i);
  if (!mm) return null;
  const m = MESES[mm[1].toLowerCase()], py = Number(String(published || '').slice(0, 4)), pm = Number(String(published || '').slice(5, 7));
  if (!py || !pm) return null;
  const y = m > pm ? py - 1 : py;
  const f = amount(t, 'financiero'), p = amount(t, 'primario');
  if (f == null || p == null) return null;
  return { ym: `${y}-${String(m).padStart(2, '0')}`, primary: p, financial: f, interest: Math.round((p - f) * 10) / 10 };
}
const strip = h => String(h).replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&[a-z]+;/g, ' ').replace(/\s+/g, ' ').trim();
const fecha = s => { const m = String(s).match(/(\d{1,2}) de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre) de (\d{4})/i); return m ? `${m[3]}-${String(MESES[m[2].toLowerCase()]).padStart(2, '0')}-${m[1].padStart(2, '0')}` : null; };
export async function fiscalFromNews({ fetchImpl = fetch, max = 3 } = {}) {
  const base = 'https://www.argentina.gob.ar', H = { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36', 'accept-language': 'es-AR,es;q=.9' };
  const get = async (u, ms = 12000) => { const c = new AbortController(), t = setTimeout(() => c.abort(), ms); try { const r = await fetchImpl(u, { signal: c.signal, headers: H }); if (!r.ok) throw new Error(`${u} ${r.status}`); return await r.text(); } finally { clearTimeout(t); } };
  const html = await get(`${base}/economia/sechacienda/noticias`);
  const items = [...html.matchAll(/<a[^>]+href="(?:https?:\/\/www\.argentina\.gob\.ar)?(\/noticias\/[^"#?]+)"[^>]*>([\s\S]*?)<\/a>/gi)].map(m => ({ href: m[1], text: strip(m[2]) }))
    .filter(x => /Sector P[uú]blico Nacional/i.test(x.text) && /(financier|primari)/i.test(x.text));
  const seen = new Set(), out = {};
  for (const it of items) {
    if (seen.has(it.href) || seen.size >= max) continue; seen.add(it.href);
    const pub = fecha(it.text); if (!pub) continue;
    let r = parseFiscalNews(it.text.slice(it.text.indexOf(' 20') + 5), pub);
    if (!r) { try { const page = strip(await get(base + it.href)); r = parseFiscalNews(page.slice(page.search(/(En|Durante) (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)/i)), pub); } catch { } }
    if (r && !out[r.ym]) out[r.ym] = { ...r, published: pub, url: base + it.href };
  }
  return out;
}

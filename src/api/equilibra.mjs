// v222 · Anticipo de Actividad Económica de Equilibra (equilibra.ar): estimación privada de la variación mensual
// desestacionalizada del EMAE, publicada ~3 semanas después de cerrado el mes. No hay serie descargable: se toman los
// posts "Anticipo de Actividad Económica <mes> <año>" del sitemap de WordPress y se lee el dato del texto.
// El sitio limita las consultas (error 508), así que en cada revisión se leen sólo los posts más nuevos que todavía no
// están en la historia (incluida acá, con los valores tal como se publicaron por primera vez).
export const EQUILIBRA_SITEMAP = 'https://equilibra.ar/wp-sitemap-posts-post-1.xml';
const MES = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };
// Valores de la primera publicación (variación mensual s.e., %) y fecha del post.
export const EQUILIBRA_HISTORY = {
  '2024-07': [1.5, '2024-08-26'], '2024-08': [-0.4, '2024-09-26'], '2024-09': [0.4, '2024-10-24'], '2024-10': [0.5, '2024-11-25'],
  '2024-11': [0.5, '2024-12-23'], '2024-12': [1.0, '2025-01-24'], '2025-01': [0.5, '2025-02-26'], '2025-02': [0.8, '2025-03-28'],
  '2025-03': [-1.0, '2025-04-23'], '2025-04': [-0.8, '2025-05-22'], '2025-05': [-0.3, '2025-07-02'], '2025-06': [0.0, '2025-07-22'],
  '2025-07': [-0.3, '2025-08-21'], '2025-08': [0.5, '2025-09-25'], '2025-09': [-1.0, '2025-10-23'], '2025-11': [-0.5, '2025-12-23'],
  '2025-12': [0.3, '2026-01-22'], '2026-01': [-0.8, '2026-02-25'], '2026-02': [-1.0, '2026-03-30'], '2026-03': [1.0, '2026-04-23'],
  '2026-04': [-1.5, '2026-05-22'], '2026-05': [0.5, '2026-06-30'], '2026-06': [0.0, '2026-07-23'], '2026-07': [-0.5, '2026-08-21'],
  '2026-09': [0.5, '2026-10-22']
};
const NEG = /(ca[ií]d|caer|cae|bajar|baja|merma|contraj|contrac|descen|retroce|disminu|retra)/i;
const POS = /(alza|suba|subi|sub[ie]r|recuper|crec|trep|mejor|expansi|rebot|aument|avanz)/i;
const SA = /(desestacionalizad|desest\.|sin estacionalidad|s\.\s?e\.?\)?)/i;
const num = s => Number(String(s).replace('−', '-').replace(',', '.'));

// Texto del post → variación mensual s.e. del EMAE agregado (antes de la parte "sin agro"/"no primaria").
export function parseEquilibraText(text) {
  let t = String(text || '').replace(/\s+/g, ' ');
  const cut = t.search(/(EMAE (sin|excluyendo|no) ?(el sector )?agro|actividad econ[oó]mica no primaria|EMAE no agropecuario)/i);
  // Se descartan las referencias a meses previos: paréntesis con números y frases "tras/luego de ..." hasta la coma.
  const lead = (cut > 0 ? t.slice(0, cut) : t).replace(/\([^)]*\d[^)]*\)/g, ' ').replace(/(tras|luego de|despu[eé]s de)[^,.;:]*[,;:]/gi, ' ');
  if (/(?:^|[^\d,])0(?:,0)?\s?%\s*(?:mensual\s*)?\(?\s*(?:desestacionalizad|sin estacionalidad|s\.\s?e)/i.test(lead) && !/[+\-−]\s?\d+(?:,\d+)?\s?%\s*(?:mensual\s*)?\(?\s*(?:desestacionalizad|sin estacionalidad|s\.\s?e)/i.test(lead)) return 0;
  // 1) Formato con signo explícito: "+0,5% sin estacionalidad", "-1,5% desestacionalizada".
  let m = lead.match(/([+\-−]\s?\d+(?:,\d+)?)\s?%\s*(?:mensual\s*)?(?:\(?\s*)(?:desestacionalizad|sin estacionalidad|s\.\s?e)/i);
  if (m) return num(m[1].replace(/\s/g, ''));
  // 2) "estable/estancada" sin número.
  if (/(estable|estancad|se mantuvo)[^.]{0,60}(desestacionaliz|sin estacionalidad)|(desestacionaliz|sin estacionalidad)[^.]{0,40}(estable|estancad)/i.test(lead) && !/\d+,\d\s?%[^.]{0,40}(desestacionaliz|sin estacionalidad|mensual)/i.test(lead)) return 0;
  // 3) Frase con número cerca de "desestacionalizada"/"mensual" y verbo que da el signo.
  const sentences = lead.split(/(?<=[.;•])\s/);
  for (const s of sentences) {
    if (!SA.test(s) && !/mensual|serie/i.test(s)) continue;
    const v = signed(s); if (v !== null) return v;
  }
  return null;
}
function signed(s) {
  const re = /(\d+(?:,\d+)?)\s?%/g; let m;
  while ((m = re.exec(s))) {
    const ctx = s.slice(Math.max(0, m.index - 70), m.index + m[0].length + 45);
    if (!SA.test(ctx) && !/mensual|serie/i.test(ctx)) continue;
    if (/interanual|i\.a\./i.test(s.slice(m.index, m.index + m[0].length + 14))) continue;
    const before = s.slice(Math.max(0, m.index - 70), m.index);
    const neg = NEG.test(before) || /^-/.test(s.slice(m.index - 1)), pos = POS.test(before);
    const v = num(m[1]);
    if (neg && !pos) return -v; if (pos && !neg) return v;
    if (neg && pos) return before.search(NEG) > before.search(POS) ? -v : v;
  }
  return null;
}
const slugYm = u => { const m = String(u).match(/anticipo-de-actividad(?:-economica)?-([a-z]+)-(\d{4})/i); return m && MES[m[1].toLowerCase()] ? `${m[2]}-${String(MES[m[1].toLowerCase()]).padStart(2, '0')}` : null; };
const strip = h => String(h).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<header[\s\S]*?<\/header>|<footer[\s\S]*?<\/footer>|<nav[\s\S]*?<\/nav>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&#8211;|&#8212;/g, '-').replace(/&#8220;|&#8221;|&laquo;|&raquo;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

export async function equilibraActivity(get) {
  const monthly = {}, published = {}, warn = [];
  for (const [k, [v, d]] of Object.entries(EQUILIBRA_HISTORY)) { monthly[k] = v; published[k] = d; }
  try {
    const xml = await get(EQUILIBRA_SITEMAP);
    const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]).filter(u => /anticipo-de-actividad/i.test(u)).map(u => ({ u, ym: slugYm(u) })).filter(x => x.ym).sort((a, b) => b.ym.localeCompare(a.ym));
    for (const { u, ym } of urls.filter(x => monthly[x.ym] === undefined).slice(0, 2)) {
      try {
        const html = await get(u), text = strip(html), i = text.search(/Anticipo de Actividad/i);
        const v = parseEquilibraText(i >= 0 ? text.slice(i, i + 3000) : text);
        const d = (html.match(/"datePublished":"(\d{4}-\d{2}-\d{2})/) || html.match(/article:published_time" content="(\d{4}-\d{2}-\d{2})/) || [])[1] || null;
        if (v === null || !Number.isFinite(v) || Math.abs(v) > 15) { warn.push(`${ym}: no se pudo leer el dato`); continue; }
        monthly[ym] = v; if (d) published[ym] = d;
      } catch (e) { warn.push(`${ym}: ${String(e?.message || e).slice(0, 60)}`); }
    }
  } catch (e) { warn.push(`sitemap: ${String(e?.message || e).slice(0, 80)}`); }
  const keys = Object.keys(monthly).sort(), last = keys.at(-1);
  return { status: 'ok', source: 'Equilibra — Anticipo de Actividad Económica', sourceUrl: 'https://equilibra.ar/', monthlySaMom: monthly, published, latest: { ym: last, value: monthly[last], published: published[last] || null }, ...(warn.length ? { warnings: warn } : {}) };
}

// v181 · Series históricas: exportar a Excel, JPEG, Instagram, X y WhatsApp.
// Funciona con cualquier gráfico de la sección (serie principal y reservas): toma los datos del gráfico tal como se ve
// (serie, modo y rango elegidos) y arma una imagen propia con título, fuente y marca para compartir.
(function () {
  'use strict';
  const SITE = 'https://macrodatos.ar';
  const XLSX_URL = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
  const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const CARDS = [{ card: 'historyCard', canvas: 'historyChart', summary: 'periodSummary', key: () => document.getElementById('historyChart')?._seriesKey || 'inflation' },
                 { card: 'reservas', canvas: 'resChart', summary: 'resSummary', key: () => 'reserves' }];
  const touch = () => matchMedia('(pointer:coarse)').matches;
  const $ = (root, sel) => root.querySelector(sel);
  const txt = el => (el?.textContent || '').replace(/\s+/g, ' ').trim();
  const slug = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'serie';
  const today = () => { const d = new Date(); return `${d.getDate()} ${MES[d.getMonth()]} ${d.getFullYear()}`; };

  const ICON = {
    excel: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M14 2v6h6M8.5 11.5l5 6m0-6-5 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    jpeg: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="9" cy="10" r="1.8" fill="currentColor"/><path d="m4 18 5.5-5 3.5 3 3-2.5L20 17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
    instagram: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="17.3" cy="6.7" r="1.2" fill="currentColor"/></svg>',
    x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h4.6l4.1 5.6L17.6 4H20l-6.2 7.2L20.4 20h-4.6l-4.4-6-5.2 6H4l6.5-7.5z" fill="currentColor"/></svg>',
    whatsapp: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M8.8 8.3c.2-.4.5-.4.8-.4h.5c.2 0 .4.1.5.4l.7 1.7c.1.2 0 .4-.1.6l-.5.6c-.1.1-.1.3 0 .5.6 1 1.5 1.9 2.5 2.4.2.1.4.1.5 0l.6-.7c.2-.2.4-.2.6-.1l1.6.8c.2.1.3.3.3.5 0 .8-.6 1.7-1.6 1.8-1.3.2-3-.4-4.6-2-1.6-1.6-2.3-3.3-2.1-4.6.1-.6.3-1.1.4-1.5z" fill="currentColor"/></svg>',
  };

  // ── Datos del gráfico ─────────────────────────────────────────────────────────────────────────────────────
  function meta(def) {
    const card = document.getElementById(def.card), cv = document.getElementById(def.canvas), chart = window.Chart?.getChart?.(cv);
    const title = txt($(card, '.chart-meta h3')) || 'Serie histórica';
    const subtitle = txt($(card, '.chart-meta p'));
    const source = txt($(card, '.chart-meta > span')).replace(/^Fuente:\s*/i, '');
    const summary = txt(document.getElementById(def.summary));
    const note = txt(card.querySelector('#methodNote, #resExplainer'));
    const key = def.key();
    const url = `${SITE}/?serie=${encodeURIComponent(key)}#historicos`;
    return { card, cv, chart, title, subtitle, source, summary, note, key, url };
  }
  function rowsOf(M) {
    const ch = M.chart; if (!ch) return { head: [], rows: [] };
    const labels = ch.data.labels || [], keys = Array.isArray(M.cv._exportKeys) && M.cv._exportKeys.length === labels.length ? M.cv._exportKeys : labels;
    const ds = ch.data.datasets.filter(d => !d.hidden && !d._exportSkip);
    return { head: ['Período', ...ds.map(d => d.label || M.title)], rows: keys.map((k, i) => [k, ...ds.map(d => { const v = d.data[i]; const n = v && typeof v === 'object' ? v.y : v; return n == null || !Number.isFinite(Number(n)) ? null : Number(n); })]) };
  }

  // ── Excel ─────────────────────────────────────────────────────────────────────────────────────────────────
  let xlsxP = null;
  const loadXlsx = () => xlsxP ||= new Promise((ok, ko) => { if (window.XLSX) return ok(window.XLSX); const s = document.createElement('script'); s.src = XLSX_URL; s.onload = () => ok(window.XLSX); s.onerror = () => { xlsxP = null; ko(new Error('No se pudo cargar el generador de Excel.')); }; document.head.appendChild(s); });
  function periodCell(k) {
    k = String(k);
    let m = k.match(/^(\d{4})$/); if (m) return { t: 'n', v: +m[1], z: '0' };
    // Fechas como número de serie de Excel (los Date de JS se corren un día por el huso horario de Argentina).
    const serial = (y, mo, d) => (Date.UTC(y, mo - 1, d) - Date.UTC(1899, 11, 30)) / 864e5;
    m = k.match(/^(\d{4})-(\d{2})$/); if (m) return { t: 'n', v: serial(+m[1], +m[2], 1), z: 'mmm yyyy' };
    m = k.match(/^(\d{4})-(\d{2})-(\d{2})$/); if (m) return { t: 'n', v: serial(+m[1], +m[2], +m[3]), z: 'dd/mm/yyyy' };
    return { t: 's', v: k };
  }
  async function buildWorkbook(def) {
    const M = meta(def), { head, rows } = rowsOf(M);
    if (!rows.length) throw new Error('El gráfico todavía no tiene datos.');
    const X = await loadXlsx();
    const ws = X.utils.aoa_to_sheet([head]);
    rows.forEach((r, i) => {
      const R = i + 1; ws[X.utils.encode_cell({ r: R, c: 0 })] = periodCell(r[0]);
      r.slice(1).forEach((v, j) => { if (v != null) ws[X.utils.encode_cell({ r: R, c: j + 1 })] = { t: 'n', v, z: Math.abs(v) >= 1000 ? '#,##0.0' : '#,##0.00' }; });
    });
    ws['!ref'] = X.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: head.length - 1 } });
    ws['!cols'] = head.map((h, i) => ({ wch: i ? Math.max(14, Math.min(40, h.length + 2)) : 14 }));
    const info = X.utils.aoa_to_sheet([
      ['Serie', M.title], ['Detalle', M.subtitle], ['Fuente', M.source], ['Resumen', M.summary], ['Metodología', M.note],
      ['Descargado', today()], ['Enlace', M.url], ['Sitio', 'macrodatos.ar — Indicadores económicos de Argentina'],
    ]);
    info['!cols'] = [{ wch: 14 }, { wch: 110 }];
    const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, 'Datos'); X.utils.book_append_sheet(wb, info, 'Información');
    return { X, wb, name: `macrodatos-${slug(M.title)}.xlsx` };
  }
  async function exportExcel(def) {
    const { X, wb, name } = await buildWorkbook(def);
    X.writeFile(wb, name, { compression: true });
    toast('Listo: se descargó el Excel con los datos del gráfico.');
  }

  // ── Imagen ────────────────────────────────────────────────────────────────────────────────────────────────
  let logoP = null;
  const loadLogo = () => logoP ||= new Promise(ok => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = '/logo.svg?v=174'; });
  function wrap(ctx, text, maxW, maxLines) {
    const words = String(text || '').split(' '), lines = []; let line = '';
    for (const w of words) { const t = line ? line + ' ' + w : w; if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
    if (line) lines.push(line);
    if (lines.length > maxLines) { const cut = lines.slice(0, maxLines); let l = cut[maxLines - 1]; while (ctx.measureText(l + '…').width > maxW && l.length) l = l.slice(0, -1); cut[maxLines - 1] = l + '…'; return cut; }
    return lines;
  }
  function chartClone(src, w, h, s) {
    const raw = src.config?._config || src.config || {}, o = raw.options || {};
    const font = (f, size, extra) => ({ ...(f || {}), size: Math.round(size * s), ...(extra || {}) });
    const scale = sc => ({ ...(sc || {}), ticks: { ...(sc?.ticks || {}), color: '#52677e', font: font(sc?.ticks?.font, 12), maxTicksLimit: Math.min(sc?.ticks?.maxTicksLimit || 99, 9) }, title: sc?.title ? { ...sc.title, font: font(sc.title.font, 12) } : undefined });
    const scales = {}; for (const [k, sc] of Object.entries(o.scales || {})) scales[k] = scale(sc);
    if (!scales.x) scales.x = scale({}); if (!scales.y) scales.y = scale({});
    const leg = o.plugins?.legend || {};
    const options = { ...o, responsive: false, maintainAspectRatio: false, animation: false, devicePixelRatio: 1, events: [], scales,
      plugins: { ...(o.plugins || {}), tooltip: { enabled: false }, legend: leg.display === false ? { display: false } : { ...leg, labels: { ...(leg.labels || {}), font: font(leg.labels?.font, 12), boxWidth: Math.round(12 * s), padding: Math.round(14 * s) } } } };
    const data = { labels: [...(src.data.labels || [])], datasets: src.data.datasets.map(d => ({ ...d, data: [...d.data], borderWidth: d.borderWidth === 0 ? 0 : (d.borderWidth || 2) * Math.max(1.2, s * .85), pointRadius: (d.type || raw.type) === 'line' || raw.type === 'line' ? 0 : d.pointRadius })) };
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.style.cssText = `position:fixed;left:-99999px;top:0;width:${w}px;height:${h}px`;
    document.body.appendChild(cv);
    const c = new Chart(cv, { type: raw.type, data, options, plugins: raw.plugins || [] });
    return { cv, done: () => { c.destroy(); cv.remove(); } };
  }
  async function compose(def, fmt, type = 'image/jpeg') {
    const M = meta(def); if (!M.chart) throw new Error('El gráfico todavía no tiene datos.');
    const ig = fmt === 'ig', W = ig ? 1080 : 1600, H = ig ? 1350 : 900, P = ig ? 64 : 72, s = ig ? 1.75 : 1.85;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const ctx = cv.getContext('2d');
    const F = (w, px) => `${w} ${px}px Inter, -apple-system, "Segoe UI", Roboto, Arial, sans-serif`;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#0b5bd3'; ctx.fillRect(0, 0, W, 10);
    // Marca y fecha
    const logo = await loadLogo(); let y = P + 6;
    if (logo) ctx.drawImage(logo, P, y - 4, 44, 44);
    ctx.fillStyle = '#071b35'; ctx.font = F(800, 26); ctx.textBaseline = 'middle'; ctx.fillText('MACRODATOS', P + (logo ? 58 : 0), y + 18);
    ctx.font = F(600, 22); ctx.fillStyle = '#63758b'; ctx.textAlign = 'right'; ctx.fillText(today(), W - P, y + 18); ctx.textAlign = 'left';
    y += 44 + (ig ? 44 : 34); ctx.textBaseline = 'alphabetic';
    // Título, detalle y resumen
    ctx.fillStyle = '#071b35'; ctx.font = F(800, ig ? 56 : 54);
    for (const l of wrap(ctx, M.title, W - 2 * P, 2)) { y += ig ? 60 : 58; ctx.fillText(l, P, y); }
    ctx.fillStyle = '#52677e'; ctx.font = F(500, ig ? 28 : 26);
    for (const l of wrap(ctx, M.subtitle, W - 2 * P, 2)) { y += ig ? 38 : 36; ctx.fillText(l, P, y); }
    if (M.summary) {
      ctx.font = F(700, ig ? 28 : 26); const lines = wrap(ctx, M.summary, W - 2 * P - 40, ig ? 3 : 2), bh = lines.length * (ig ? 38 : 36) + 26;
      y += 26; ctx.fillStyle = '#eef5ff'; roundRect(ctx, P, y, W - 2 * P, bh, 14); ctx.fill(); ctx.fillStyle = '#0b5bd3'; ctx.fillRect(P, y, 6, bh);
      ctx.fillStyle = '#12233a'; lines.forEach((l, i) => ctx.fillText(l, P + 26, y + 13 + (i + 1) * (ig ? 38 : 36) - 8)); y += bh;
    }
    // Gráfico
    const footH = ig ? 120 : 92, top = y + 28, ch = H - footH - top - 10;
    const g = chartClone(M.chart, W - 2 * P + 16, ch, s);
    try { ctx.drawImage(g.cv, P - 8, top); } finally { g.done(); }
    // Pie: fuente y sitio
    ctx.strokeStyle = '#dce6f1'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(P, H - footH + 6); ctx.lineTo(W - P, H - footH + 6); ctx.stroke();
    ctx.font = F(800, ig ? 30 : 28); ctx.fillStyle = '#0b5bd3'; ctx.textAlign = 'right'; const site = 'macrodatos.ar'; ctx.fillText(site, W - P, H - footH / 2 + 18); const sw = ctx.measureText(site).width; ctx.textAlign = 'left';
    ctx.font = F(500, ig ? 24 : 22); ctx.fillStyle = '#63758b';
    wrap(ctx, M.source ? `Fuente: ${M.source}` : '', W - 2 * P - sw - 40, ig ? 2 : 1).forEach((l, i, a) => ctx.fillText(l, P, H - footH / 2 + 18 - (a.length - 1 - i) * 30));
    const blob = await new Promise(ok => cv.toBlob(ok, type, .92));
    return { blob, M, name: `macrodatos-${slug(M.title)}${ig ? '-instagram' : ''}.${type === 'image/png' ? 'png' : 'jpg'}` };
  }
  function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function download(blob, name) { const a = document.createElement('a'), u = URL.createObjectURL(blob); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); }
  const shareText = M => `${M.title}${M.summary ? ` · ${M.summary}` : ''} — vía macrodatos.ar`;

  // Compartir: en el celular abre el menú nativo con la imagen (ahí aparecen Instagram, X y WhatsApp); en la
  // computadora abre X / WhatsApp Web con el texto y el enlace, y deja la imagen copiada para pegarla.
  async function nativeShare(def, fmt) {
    const { blob, M, name } = await compose(def, fmt);
    const file = new File([blob], name, { type: 'image/jpeg' });
    if (!navigator.canShare?.({ files: [file] })) return false;
    try { await navigator.share({ files: [file], title: M.title, text: `${shareText(M)} ${M.url}` }); } catch (e) { if (e?.name !== 'AbortError') throw e; }
    return true;
  }
  async function shareTo(def, net) {
    if (touch() && navigator.share) { if (await nativeShare(def, net === 'instagram' ? 'ig' : 'wide')) return; }
    if (net === 'instagram') {
      const { blob, name } = await compose(def, 'ig'); download(blob, name);
      toast('Se descargó la imagen en formato Instagram (4:5). Subila desde la app o desde instagram.com.'); return;
    }
    const M = meta(def), png = compose(def, 'wide', 'image/png');
    let copied = false;
    if (navigator.clipboard?.write && window.ClipboardItem) {
      try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': png.then(r => r.blob) })]); copied = true; } catch { copied = false; }
    }
    const r = await png;
    if (!copied) download(r.blob, r.name);
    const text = shareText(M);
    const href = net === 'x' ? `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(M.url)}` : `https://wa.me/?text=${encodeURIComponent(`${text} ${M.url}`)}`;
    const w = window.open(href, '_blank'); if (w) try { w.opener = null; } catch {}
    const where = net === 'x' ? 'el posteo' : 'el chat';
    const how = copied ? `La imagen quedó copiada: pegala en ${where} con Ctrl+V (⌘V en Mac).` : `Se descargó la imagen para que la adjuntes en ${where}.`;
    toast(w ? how : `${how} <a href="${href}" target="_blank" rel="noopener">Abrir ${net === 'x' ? 'X' : 'WhatsApp'}</a>`, 9000);
  }

  // ── UI ────────────────────────────────────────────────────────────────────────────────────────────────────
  let toastEl = null, toastT = null;
  function toast(html, ms = 6000) {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'share-toast'; toastEl.setAttribute('role', 'status'); document.body.appendChild(toastEl); }
    toastEl.innerHTML = html; toastEl.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('show'), ms);
  }
  function bar(def) {
    const card = document.getElementById(def.card), cv = document.getElementById(def.canvas); if (!card || !cv || card.querySelector('.share-bar')) return;
    const el = document.createElement('div'); el.className = 'share-bar'; el.setAttribute('role', 'group'); el.setAttribute('aria-label', 'Exportar y compartir el gráfico');
    el.innerHTML = `<span>Exportar</span>${[['excel', 'Excel'], ['jpeg', 'JPEG'], ['instagram', 'Instagram'], ['x', 'X'], ['whatsapp', 'WhatsApp']].map(([k, l]) => `<button type="button" data-share="${k}" title="${k === 'excel' ? 'Descargar los datos en Excel' : k === 'jpeg' ? 'Descargar el gráfico como imagen' : `Compartir en ${l}`}">${ICON[k]}<b>${l}</b></button>`).join('')}`;
    (cv.closest('.chart-wrap') || cv.parentElement).after(el);
    el.addEventListener('click', async e => {
      const b = e.target.closest('[data-share]'); if (!b || b.disabled) return;
      b.disabled = true; b.classList.add('busy');
      try {
        const k = b.dataset.share;
        if (k === 'excel') await exportExcel(def);
        else if (k === 'jpeg') { const { blob, name } = await compose(def, 'wide'); download(blob, name); toast('Listo: se descargó la imagen del gráfico.'); }
        else await shareTo(def, k);
      } catch (err) { toast(String(err?.message || err)); }
      finally { b.disabled = false; b.classList.remove('busy'); }
    });
  }
  function init() { CARDS.forEach(bar); }
  window.__macroShare = { compose, rowsOf: d => rowsOf(meta(d)), cards: CARDS, buildWorkbook };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  // Enlace compartido: /?serie=imports#historicos abre esa serie.
  const wanted = new URLSearchParams(location.search).get('serie');
  if (wanted && /^[\w-]{2,30}$/.test(wanted)) window.addEventListener('load', () => setTimeout(() => document.querySelector(`#historicos [data-series="${wanted}"], [data-series="${wanted}"]`)?.click(), 50));
})();

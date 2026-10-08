// v152 · Calculadora de actualización: cronograma de ajustes según la frecuencia pactada (mensual, bimestral,
// trimestral, cuatrimestral, semestral, anual u otra) y botones para compartir el resultado (WhatsApp, mail, copiar).
// Convención: el ajuste N ocurre N × frecuencia meses después de la fecha "Desde" y lleva el monto inicial por el
// cociente índice(fecha del ajuste) / índice(fecha inicial), igual que el cálculo punta a punta de la calculadora.
(() => {
  const $ = id => document.getElementById(id);
  const form = $('updateCalc'); if (!form) return;
  const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const MES_L = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pctF = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const idxF = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  const FREQ_LABEL = { 1: 'mensual', 2: 'bimestral', 3: 'trimestral', 4: 'cuatrimestral', 6: 'semestral', 12: 'anual' };
  const NAME = { ipc: 'IPC (INDEC)', icl: 'ICL (BCRA)', cer: 'CER (BCRA)', uva: 'UVA (BCRA)' };

  // ── Frecuencia ──────────────────────────────────────────────────────────────
  const freqSel = $('updateFreq'), otherWrap = $('updateFreqOtherWrap'), otherIn = $('updateFreqOther');
  freqSel?.addEventListener('change', () => { if (otherWrap) otherWrap.hidden = freqSel.value !== 'other'; if (freqSel.value === 'other') otherIn?.focus(); });
  function months() {
    const v = freqSel?.value || '';
    if (v === 'other') { const n = Math.round(Number(String(otherIn?.value || '').replace(',', '.'))); return n >= 1 && n <= 120 ? n : NaN; }
    const n = Number(v); return n >= 1 ? n : 0;
  }
  const freqText = (n, plural = true) => FREQ_LABEL[n] ? FREQ_LABEL[n] + (plural ? 'es' : '') : `cada ${n} meses`;

  // ── Fechas ──────────────────────────────────────────────────────────────────
  const isDay = k => /^\d{4}-\d{2}-\d{2}$/.test(k);
  const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
  function addMonths(k, n) {
    const [y, m, d] = k.split('-').map(Number), t = (m - 1) + n, yy = y + Math.floor(t / 12), mm = ((t % 12) + 12) % 12 + 1;
    const base = `${yy}-${String(mm).padStart(2, '0')}`;
    return isDay(k) ? `${base}-${String(Math.min(d, lastDay(yy, mm))).padStart(2, '0')}` : base;
  }
  function label(k) {
    if (isDay(k)) { const [y, m, d] = k.split('-'); return `${Number(d)} ${MES[+m - 1]} ${y}`; }
    const [y, m] = k.split('-'); return `${MES_L[+m - 1]} ${y}`;
  }
  // Valor del índice para la fecha del ajuste; si ese día no tiene dato (fin de semana/feriado en una serie diaria),
  // se usa el último anterior disponible, nunca uno futuro.
  function valueAt(map, k, keys) {
    if (Number(map[k]) > 0) return { key: k, value: Number(map[k]) };
    if (!isDay(k)) return null;
    let lo = 0, hi = keys.length - 1, best = -1; while (lo <= hi) { const mid = (lo + hi) >> 1; if (keys[mid] <= k) { best = mid; lo = mid + 1; } else hi = mid - 1; }
    if (best < 0 || keys[best].slice(0, 7) < addMonths(k, -1).slice(0, 7)) return null;
    return { key: keys[best], value: Number(map[keys[best]]) };
  }

  // ── Cronograma ──────────────────────────────────────────────────────────────
  function schedule({ kind, a, b, amt, map }) {
    const n = months(); if (!n) return null;
    const keys = Object.keys(map).filter(k => isDay(a) ? isDay(k) : /^\d{4}-\d{2}$/.test(k)).sort();
    const base = Number(map[a]); if (!(base > 0)) return null;
    const rows = []; let prev = base, k = 1, pending = null;
    for (; k <= 1200; k++) {
      const d = addMonths(a, n * k); if (d > b) break;
      const v = valueAt(map, d, keys);
      if (!v) { pending = d; break; }
      rows.push({ n: k, date: d, used: v.key, index: v.value, step: (v.value / prev - 1) * 100, total: (v.value / base - 1) * 100, amount: amt > 0 ? amt * v.value / base : null });
      prev = v.value;
    }
    let next = pending || addMonths(a, n * k);
    return { n, kind, a, b, amt, base, rows, pending, next };
  }

  function render(S, el) {
    const box = document.createElement('div'); box.className = 'upd-schedule';
    if (!S.rows.length && !S.pending) {
      box.innerHTML = `<h4>Ajustes ${freqText(S.n)}</h4><p>No hubo ajustes entre ${label(S.a)} y ${label(S.b)}: el primero corresponde a <strong>${label(S.next)}</strong>.</p>`;
    } else {
      const last = S.rows.at(-1);
      const head = `<h4>${S.rows.length} ajuste${S.rows.length === 1 ? '' : 's'} ${freqText(S.n, S.rows.length !== 1)} entre ${label(S.a)} y ${label(S.b)}</h4>`;
      const body = S.rows.map(r => `<tr><td>${r.n}</td><td>${label(r.date)}${r.used !== r.date ? `<small>índice del ${label(r.used)}</small>` : ''}</td><td>${idxF.format(r.index)}</td><td>${r.step >= 0 ? '+' : ''}${pctF.format(r.step)}%</td><td>${r.total >= 0 ? '+' : ''}${pctF.format(r.total)}%</td>${S.amt > 0 ? `<td><strong>${money.format(r.amount)}</strong></td>` : ''}</tr>`).join('');
      box.innerHTML = `${head}<div class="upd-table-wrap"><table class="upd-table"><thead><tr><th>#</th><th>Fecha</th><th>Índice</th><th>Ajuste</th><th>Acumulado</th>${S.amt > 0 ? '<th>Monto</th>' : ''}</tr></thead><tbody>
        <tr class="upd-base"><td>0</td><td>${label(S.a)}<small>inicio</small></td><td>${idxF.format(S.base)}</td><td>—</td><td>—</td>${S.amt > 0 ? `<td>${money.format(S.amt)}</td>` : ''}</tr>${body}</tbody></table></div>
        ${last && S.amt > 0 ? `<p class="upd-current">Monto vigente desde ${label(last.date)}: <strong>${money.format(last.amount)}</strong></p>` : ''}
        ${S.pending ? `<p class="upd-next">El ajuste de <strong>${label(S.pending)}</strong> todavía no puede calcularse: el ${S.kind.toUpperCase()} de esa fecha aún no está publicado.</p>` : `<p class="upd-next">Próximo ajuste: <strong>${label(S.next)}</strong>.</p>`}
        <small class="upd-note">Cada ajuste aplica al monto inicial la variación del índice entre la fecha de inicio y la del ajuste${S.kind === 'ipc' ? ' (IPC del mes del ajuste vs. IPC del mes de inicio)' : ''}. Revisá en tu contrato qué meses del índice se toman.</small>`;
    }
    el.appendChild(box);
  }

  // ── Compartir ───────────────────────────────────────────────────────────────
  function shareText(kind, a, b, amt, f, S) {
    const L = [`Actualización por ${NAME[kind] || kind.toUpperCase()}`, `Desde ${label(a)} hasta ${label(b)}: ${f >= 1 ? '+' : ''}${pctF.format((f - 1) * 100)}%`];
    if (amt > 0) L.push(`${money.format(amt)} → ${money.format(amt * f)}`);
    if (S) {
      if (S.rows.length) {
        L.push('', `Ajustes ${freqText(S.n)}:`);
        for (const r of S.rows) L.push(`${r.n}) ${label(r.date)}: ${r.step >= 0 ? '+' : ''}${pctF.format(r.step)}%${r.amount != null ? ` → ${money.format(r.amount)}` : ''}`);
      } else L.push('', `Sin ajustes ${freqText(S.n)} en el período.`);
      L.push(S.pending ? `Ajuste de ${label(S.pending)}: pendiente de publicación del índice.` : `Próximo ajuste: ${label(S.next)}.`);
    }
    L.push('', 'Calculado en macrodatos.ar/#calculadoras');
    return L.join('\n');
  }
  function shareBar(text, subject) {
    const bar = document.createElement('div'); bar.className = 'upd-share';
    const wa = `https://wa.me/?text=${encodeURIComponent(text)}`, mail = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
    bar.innerHTML = `<span>Compartir:</span><a class="share-btn wa" href="${wa}" target="_blank" rel="noopener">WhatsApp</a><a class="share-btn mail" href="${mail}">Mail</a><button type="button" class="share-btn copy">Copiar</button>${navigator.share ? '<button type="button" class="share-btn more">Más…</button>' : ''}`;
    bar.querySelector('.copy').addEventListener('click', async e => { try { await navigator.clipboard.writeText(text); e.target.textContent = '¡Copiado!'; } catch { e.target.textContent = 'No se pudo copiar'; } setTimeout(() => { e.target.textContent = 'Copiar'; }, 2000); });
    bar.querySelector('.more')?.addEventListener('click', () => navigator.share({ title: subject, text }).catch(() => { }));
    return bar;
  }

  // Lo llama app.js después de calcular la variación punta a punta.
  window.renderUpdateSchedule = ({ kind, a, b, amt, map, f, el }) => {
    try {
      el.querySelectorAll('.upd-schedule,.upd-share,.upd-warn').forEach(x => x.remove());
      const n = months();
      if (Number.isNaN(n)) { const w = document.createElement('p'); w.className = 'upd-warn'; w.textContent = 'Indicá cada cuántos meses se actualiza (entre 1 y 120).'; el.appendChild(w); }
      const S = n ? schedule({ kind, a, b, amt, map }) : null;
      if (S) render(S, el);
      el.appendChild(shareBar(shareText(kind, a, b, amt, f, S), `Actualización por ${NAME[kind] || kind.toUpperCase()} · ${label(a)} a ${label(b)}`));
    } catch (e) { console.warn('[update schedule]', e); }
  };
})();

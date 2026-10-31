// v226 · Conversor de monedas (pestaña Dólar). Datos: /api/fx-converter (DolarApi + tipos de cambio internacionales).
// Precio en pesos de 1 unidad: ARS = 1; USD = dólar elegido (compra, venta o promedio); otra moneda X = dólar elegido ÷ (X por USD).
(() => {
  const box = document.getElementById('fxConv'); if (!box) return;
  const $ = id => document.getElementById(id);
  const NAMES = { ARS: 'Peso argentino', USD: 'Dólar', EUR: 'Euro', BRL: 'Real brasileño', UYU: 'Peso uruguayo', CLP: 'Peso chileno', PYG: 'Guaraní', BOB: 'Boliviano', PEN: 'Sol peruano', COP: 'Peso colombiano', MXN: 'Peso mexicano', GBP: 'Libra esterlina', CHF: 'Franco suizo', JPY: 'Yen', CNY: 'Yuan', CAD: 'Dólar canadiense', AUD: 'Dólar australiano' };
  const DOLLAR = { bna: 'BNA', mep: 'MEP', blue: 'Blue', ccl: 'CCL' }, SIDE = { buy: 'compra', sell: 'venta', mid: 'promedio' };
  const st = { dollar: 'bna', side: 'sell', data: null };
  try { const p = JSON.parse(localStorage.getItem('macroFxConv') || 'null'); if (p) { if (DOLLAR[p.dollar]) st.dollar = p.dollar; if (SIDE[p.side]) st.side = p.side; if (p.from) st.from = p.from; if (p.to) st.to = p.to; } } catch { }
  const save = () => { try { localStorage.setItem('macroFxConv', JSON.stringify({ dollar: st.dollar, side: st.side, from: $('fxcFrom').value, to: $('fxcTo').value })); } catch { } };
  const parseAmount = s => {
    let t = String(s || '').trim().replace(/\s/g, ''); if (!t) return null;
    if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
    const v = Number(t); return Number.isFinite(v) ? v : null;
  };
  const fmt = (v, cur) => { const a = Math.abs(v), d = a === 0 ? 0 : a >= 1000 ? 2 : a >= 1 ? 2 : a >= 0.01 ? 4 : 6; return new Intl.NumberFormat('es-AR', { minimumFractionDigits: cur === 'ARS' || cur === 'USD' ? 2 : Math.min(2, d), maximumFractionDigits: d }).format(v); };
  const dollarPrice = (q, side) => { if (!q) return null; const b = q.buy, s = q.sell; if (side === 'buy') return b || null; if (side === 'sell') return s || null; return b && s ? (b + s) / 2 : (b || s || null); };
  const arsPer = cur => {
    const q = st.data?.dollars?.[st.dollar], usd = dollarPrice(q, st.side);
    if (cur === 'ARS') return 1; if (!usd) return null; if (cur === 'USD') return usd;
    const r = st.data?.rates?.[cur]; return r ? usd / r : null;
  };
  function fillSelects() {
    const curs = ['USD', 'ARS', ...(st.data?.currencies || [])];
    for (const [id, def] of [['fxcFrom', st.from || 'USD'], ['fxcTo', st.to || 'ARS']]) {
      const sel = $(id), want = sel.dataset.touched ? sel.value : def;
      sel.innerHTML = curs.map(c => `<option value="${c}">${c} · ${NAMES[c] || c}</option>`).join('');
      sel.value = curs.includes(want) ? want : (id === 'fxcFrom' ? 'USD' : 'ARS');
    }
  }
  function paintButtons() {
    box.querySelectorAll('[data-fxc-dollar]').forEach(b => b.classList.toggle('active', b.dataset.fxcDollar === st.dollar));
    box.querySelectorAll('[data-fxc-side]').forEach(b => b.classList.toggle('active', b.dataset.fxcSide === st.side));
  }
  function paintQuotes() {
    const D = st.data?.dollars || {}, n = v => v ? `$ ${new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)}` : '—';
    $('fxcQuotes').innerHTML = Object.keys(DOLLAR).map(k => { const q = D[k]; return `<button type="button" class="fxc-quote${k === st.dollar ? ' active' : ''}" data-fxc-dollar="${k}"><b>${DOLLAR[k]}</b><span>Compra ${n(q?.buy)}</span><span>Venta ${n(q?.sell)}</span></button>`; }).join('');
  }
  function compute() {
    const out = $('fxcResult'), amt = parseAmount($('fxcAmount').value), from = $('fxcFrom').value, to = $('fxcTo').value;
    if (!st.data) return;
    if (amt === null) { out.innerHTML = 'Ingresá un monto (por ejemplo, 1.000 o 1.500,50).'; return; }
    const a = arsPer(from), b = arsPer(to);
    if (!a || !b) { out.innerHTML = `No hay cotización ${st.side==='mid'?'promedio':'de '+SIDE[st.side]} del dólar ${DOLLAR[st.dollar]} disponible en este momento.`; return; }
    const res = amt * a / b, unit = a / b;
    const viaUsd = ![from, to].every(c => c === 'ARS' || c === 'USD') && from !== to;
    out.innerHTML = `<strong>${fmt(res, to)} ${to}</strong><br>${fmt(amt, from)} ${from} = ${fmt(res, to)} ${to} · ${unit < 0.01 ? `1 ${to} = ${fmt(1 / unit, from)} ${from}` : `1 ${from} = ${fmt(unit, to)} ${to}`}<br><small>Dólar ${DOLLAR[st.dollar]}, cotización ${st.side==='mid'?'promedio':'de '+SIDE[st.side]}${viaUsd ? ', con el dólar como puente' : ''}.</small>`;
  }
  function paintMeta() {
    const d = st.data; if (!d) return;
    const q = d.dollars?.[st.dollar], when = q?.updatedAt ? new Date(q.updatedAt) : null;
    const hora = when && !isNaN(when) ? new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(when) : null;
    $('fxcSource').textContent = `${q?.source || 'DolarApi'}${hora ? ` · ${hora}` : ''}`;
    $('fxcNote').textContent = `Para otras monedas se usa el dólar elegido como puente: el precio en pesos de 1 unidad es el dólar ${DOLLAR[st.dollar]} dividido por cuántas unidades de esa moneda vale 1 USD en el mercado internacional${d.ratesSource ? ` (${d.ratesSource}${d.ratesDate ? `, ${d.ratesDate.split('-').reverse().join('/')}` : ''})` : ''}. Valores de referencia; no incluyen impuestos ni comisiones.`;
  }
  const all = () => { paintButtons(); paintQuotes(); paintMeta(); compute(); save(); };
  box.addEventListener('click', e => {
    const d = e.target.closest('[data-fxc-dollar]'), s = e.target.closest('[data-fxc-side]');
    if (d) { st.dollar = d.dataset.fxcDollar; all(); }
    if (s) { st.side = s.dataset.fxcSide; all(); }
  });
  $('fxcSwap').addEventListener('click', () => { const f = $('fxcFrom'), t = $('fxcTo'), x = f.value; f.value = t.value; t.value = x; f.dataset.touched = t.dataset.touched = '1'; compute(); save(); });
  for (const id of ['fxcFrom', 'fxcTo']) $(id).addEventListener('change', e => { e.target.dataset.touched = '1'; compute(); save(); });
  $('fxcAmount').addEventListener('input', compute);
  async function load() {
    try {
      const r = await fetch('/api/fx-converter', { headers: { accept: 'application/json' }, cache: 'no-cache' });
      const j = await r.json(); if (j?.dollars) { st.data = j; fillSelects(); all(); return; }
      throw new Error('sin datos');
    } catch (e) { if (!st.data) $('fxcResult').textContent = 'No se pudieron cargar las cotizaciones. Probá de nuevo en unos minutos.'; console.warn('[conversor]', e); }
  }
  paintButtons(); load(); setInterval(() => { if (!document.hidden) load(); }, 5 * 60e3);
})();

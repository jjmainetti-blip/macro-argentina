// v139 · Calculadora de cuota de crédito hipotecario UVA (sistema francés).
// Tasas por banco: /api/uva-loans (BCRA, Régimen de Transparencia; respaldo local uva-loans.json).
// UVA del día: serie diaria del BCRA que ya usa la calculadora de actualización (uvaDaily, de app.js).
// Dólar: último dato de "Mercados ahora" (oficial BNA venta o MEP).
(() => {
  const $ = id => document.getElementById(id);
  const form = $('uvaCalc'); if (!form) return;
  const nf = (d = 0) => new Intl.NumberFormat('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const pct = v => `${nf(2).format(v).replace(/,00$/, '')}%`;
  const parse = v => (typeof parseAmountAR === 'function' ? parseAmountAR(v) : Number(String(v).replace(/\./g, '').replace(',', '.')));
  const dmy = d => { const [y, m, dd] = String(d).split('-'); return dd ? `${dd}/${m}/${y}` : d; };
  let BANKS = [], SRC = null;

  function uvaToday() {
    // El BCRA publica la UVA por adelantado (hasta el día 15 del mes siguiente): se usa la del día de hoy.
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
    const tryMap = m => { const k = Object.keys(m || {}).filter(x => /^\d{4}-\d{2}(-\d{2})?$/.test(x) && Number(m[x]) > 0 && x <= today).sort().at(-1); return k ? { date: k, value: Number(m[k]) } : null; };
    try { return tryMap(typeof uvaDaily !== 'undefined' ? uvaDaily : null) || tryMap(typeof uvaMonthly !== 'undefined' ? uvaMonthly : null); } catch { return null; }
  }
  function fxToday() {
    let L = {};
    try { L = (typeof marketsShown !== 'undefined' && marketsShown) || {}; } catch { }
    if (!L.bna && !L.dollar) { try { L = JSON.parse(localStorage.getItem('macroMarketsSnapshot') || 'null')?.latest || {}; } catch { } }
    if (!L.bna && !L.dollar && window.__MARKETS__?.latest) L = window.__MARKETS__.latest;
    const kind = $('uvaFx').value;
    if (kind === 'mep' && Number(L.dollar?.value) > 0) return { value: Number(L.dollar.value), label: 'MEP', date: L.dollar.date };
    if (Number(L.bna?.sell) > 0) return { value: Number(L.bna.sell), label: 'oficial BNA venta', date: L.bna.date };
    if (Number(L.dollar?.value) > 0) return { value: Number(L.dollar.value), label: 'MEP', date: L.dollar.date };
    return null;
  }

  function fillBanks() {
    const sel = $('uvaBank');
    const opts = ['<option value="">Elegí un banco…</option>'];
    for (const b of BANKS) opts.push(`<option value="${b.code}">${b.name} — ${pct(b.tna)} TNA</option>`);
    opts.push('<option value="manual">Otra tasa (ingresarla a mano)</option>');
    sel.innerHTML = opts.join('');
    const when = SRC?.fetchedAt ? new Date(SRC.fetchedAt).toLocaleDateString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' }) : '';
    $('uvaBankInfo').textContent = BANKS.length ? `${BANKS.length} entidades con línea UVA para vivienda única · BCRA, Régimen de Transparencia${when ? ` · consultado el ${when}` : ''}${SRC?.status === 'snapshot' ? ' (último dato guardado)' : ''}.` : 'No se pudieron cargar las tasas de los bancos: ingresá una tasa a mano.';
  }
  function showBank() {
    const v = $('uvaBank').value, b = BANKS.find(x => String(x.code) === v);
    if (!b) { if (v === 'manual') { $('uvaBankInfo').textContent = 'Ingresá la tasa nominal anual (TNA) que te ofrecen.'; $('uvaRate').focus(); } return; }
    $('uvaRate').value = nf(2).format(b.tna).replace(/,00$/, '');
    const parts = [`TNA ${pct(b.tna)} (TEA ${pct(b.tea)})`, b.beneficiary ? `tasa para ${b.beneficiary.charAt(0).toLowerCase() + b.beneficiary.slice(1)}` : null,
      b.maxTermMonths ? `plazo máximo ${Math.round(b.maxTermMonths / 12)} años` : null, b.ltv ? `financia hasta el ${nf(0).format(Math.min(b.ltv, 100))}% del valor` : null,
      b.installmentToIncome ? `cuota de hasta el ${nf(0).format(b.installmentToIncome)}% del ingreso` : null, b.date ? `informado al BCRA el ${dmy(b.date)}` : null].filter(Boolean);
    $('uvaBankInfo').textContent = `${b.name}${b.product ? ` · ${b.product}` : ''}: ${parts.join(' · ')}.`;
  }
  // Monto ingresado → UVAs (el crédito se expresa en UVAs).
  function amountInUva() {
    const amt = parse($('uvaAmount').value), unit = $('uvaUnit').value, U = uvaToday(), F = fxToday();
    if (!(amt > 0)) return { error: 'Ingresá el monto del crédito.' };
    if (!U) return { error: 'Todavía no se cargó el valor de la UVA. Probá de nuevo en unos segundos.' };
    let uvas = null;
    if (unit === 'uva') uvas = amt;
    if (unit === 'ars') uvas = amt / U.value;
    if (unit === 'usd') { if (!F) return { error: 'Todavía no se cargó la cotización del dólar.' }; uvas = amt * F.value / U.value; }
    return { amt, unit, uvas, U, F, ars: uvas * U.value, usd: F ? uvas * U.value / F.value : null };
  }
  function showEquiv() {
    const x = amountInUva(), el = $('uvaEquiv');
    if (x.error) { el.textContent = $('uvaAmount').value.trim() ? x.error : 'Ingresá un monto para ver su equivalente.'; return; }
    const bits = [];
    if (x.unit !== 'uva') bits.push(`${nf(0).format(x.uvas)} UVAs`);
    if (x.unit !== 'ars') bits.push(`$ ${nf(0).format(x.ars)}`);
    if (x.unit !== 'usd' && x.usd) bits.push(`US$ ${nf(0).format(x.usd)}`);
    el.textContent = `Equivale a ${bits.join(' · ')} — UVA $ ${nf(2).format(x.U.value)} (${dmy(x.U.date)})${x.F ? ` · dólar ${x.F.label} $ ${nf(2).format(x.F.value)}` : ''}.`;
  }
  function calc(e) {
    e?.preventDefault();
    const out = $('uvaResult'), x = amountInUva(), tna = parse($('uvaRate').value), years = Number($('uvaTerm').value), n = years * 12;
    if (x.error) { out.textContent = x.error; return; }
    if (!(tna >= 0) || tna > 100) { out.textContent = 'Elegí un banco o ingresá una tasa nominal anual válida (por ejemplo 7,5).'; return; }
    const i = tna / 1200, cuotaUva = i === 0 ? x.uvas / n : x.uvas * i / (1 - Math.pow(1 + i, -n));
    const cuotaArs = cuotaUva * x.U.value, cuotaUsd = x.F ? cuotaArs / x.F.value : null, totalUva = cuotaUva * n;
    const b = BANKS.find(z => String(z.code) === $('uvaBank').value), rci = b?.installmentToIncome || 25;
    const warn = [];
    if (b?.maxTermMonths && n > b.maxTermMonths) warn.push(`${b.name} informa un plazo máximo de ${Math.round(b.maxTermMonths / 12)} años para esta línea.`);
    out.innerHTML = `<div class="uva-out"><div class="big">$ ${nf(0).format(cuotaArs)}<small>cuota inicial por mes</small></div>
      <dl><dt>Cuota en UVAs (fija)</dt><dd>${nf(2).format(cuotaUva)} UVAs</dd>
      ${cuotaUsd ? `<dt>Equivalente en dólares</dt><dd>US$ ${nf(0).format(cuotaUsd)}</dd>` : ''}
      <dt>Capital</dt><dd>${nf(0).format(x.uvas)} UVAs ≈ $ ${nf(0).format(x.ars)}${x.usd ? ` ≈ US$ ${nf(0).format(x.usd)}` : ''}</dd>
      <dt>Tasa</dt><dd>${pct(tna)} TNA · ${pct((Math.pow(1 + i, 12) - 1) * 100)} TEA</dd>
      <dt>Plazo</dt><dd>${years} años · ${n} cuotas</dd>
      <dt>Total a pagar</dt><dd>${nf(0).format(totalUva)} UVAs (intereses: ${nf(0).format(totalUva - x.uvas)} UVAs)</dd>
      <dt>Ingreso mínimo orientativo</dt><dd>$ ${nf(0).format(cuotaArs / (rci / 100))} <small>(cuota = ${nf(0).format(rci)}% del ingreso)</small></dd></dl>
      ${warn.map(w => `<div class="uva-warn">${w}</div>`).join('')}
      <small>Valores en pesos con la UVA del ${dmy(x.U.date)} ($ ${nf(2).format(x.U.value)})${x.F ? ` y el dólar ${x.F.label} ($ ${nf(2).format(x.F.value)})` : ''}. La cuota en pesos sube cada mes con la UVA.</small></div>`;
  }

  async function load() {
    for (const u of ['/api/uva-loans', '/uva-loans.json?v=139']) {
      try { const r = await fetch(u, { headers: { accept: 'application/json' } }); if (!r.ok) continue; const j = await r.json(); if (j?.banks?.length) { BANKS = j.banks; SRC = j; break; } } catch { }
    }
    fillBanks();
  }
  $('uvaBank').addEventListener('change', () => { showBank(); if ($('uvaAmount').value.trim()) calc(); });
  $('uvaRate').addEventListener('input', () => { const b = BANKS.find(z => String(z.code) === $('uvaBank').value); if (b && parse($('uvaRate').value) !== b.tna) { $('uvaBank').value = 'manual'; $('uvaBankInfo').textContent = 'Tasa ingresada a mano.'; } });
  for (const id of ['uvaAmount', 'uvaUnit', 'uvaFx']) $(id).addEventListener(id === 'uvaAmount' ? 'input' : 'change', showEquiv);
  form.addEventListener('submit', calc);
  load();
})();

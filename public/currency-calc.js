// v243: sin selector de moneda (se usa la vigente en la fecha) y el resultado también en dólares de hoy.
// v241 · Calculadora "¿Cuánto vale hoy?": un monto de cualquier época (pesos moneda nacional, pesos ley 18.188, pesos
// argentinos, australes o pesos) llevado a pesos de hoy. Usa la misma cadena mensual del IPC del sitio (app.js:
// `inflationIndex`, 1943 en adelante) y las equivalencias oficiales entre signos monetarios.
(() => {
  // Cuántos pesos actuales vale 1 unidad de cada moneda (sólo por los cambios de signo monetario, sin inflación).
  const CUR = [
    { id: 'mn', name: 'Pesos moneda nacional (m$n)', lname: 'pesos moneda nacional (m$n)', short: 'm$n', toPeso: 1e-13, from: '1881-11', to: '1969-12' },
    { id: 'ley', name: 'Pesos ley 18.188 ($L)', lname: 'pesos ley 18.188 ($L)', short: '$L', toPeso: 1e-11, from: '1970-01', to: '1983-05' },
    { id: 'pa', name: 'Pesos argentinos ($a)', lname: 'pesos argentinos ($a)', short: '$a', toPeso: 1e-7, from: '1983-06', to: '1985-05' },
    { id: 'aus', name: 'Australes (A)', lname: 'australes (A)', short: 'A', toPeso: 1e-4, from: '1985-06', to: '1991-12' },
    { id: 'peso', name: 'Pesos ($)', lname: 'pesos ($)', short: '$', toPeso: 1, from: '1992-01', to: '9999-12' }
  ];
  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const $ = id => document.getElementById(id);
  const curAt = ym => CUR.find(c => ym >= c.from && ym <= c.to) || CUR.at(-1);
  const label = ym => `${MONTHS[+ym.slice(5) - 1]} de ${ym.slice(0, 4)}`;
  const idx = () => { try { return typeof inflationIndex === 'object' ? inflationIndex : null; } catch { return null; } };
  const parse = v => { try { if (typeof parseAmountAR === 'function') return parseAmountAR(v); } catch {} const n = Number(String(v).replace(/\./g, '').replace(',', '.')); return n; };
  // Montos muy chicos o muy grandes (un peso moneda nacional de 1950 son 0,0000000000001 pesos de 1992).
  const money = v => {
    if (!Number.isFinite(v)) return '—';
    const a = Math.abs(v);
    if (a >= 0.01 && a < 1e15) return '$ ' + new Intl.NumberFormat('es-AR', { minimumFractionDigits: a < 100 ? 2 : 0, maximumFractionDigits: 2 }).format(v);
    const [m, e] = v.toExponential(2).split('e'); return `$ ${m.replace('.', ',')} × 10<sup>${Number(e)}</sup>`;
  };

  function fill() {
    const ys = $('ccYear'), ms = $('ccMonth'); if (!ys || ys.options.length) return;
    const now = new Date().getFullYear();
    for (let y = now; y >= 1943; y--) ys.add(new Option(String(y), String(y)));
    MONTHS.forEach((m, i) => ms.add(new Option(m[0].toUpperCase() + m.slice(1), String(i + 1).padStart(2, '0'))));
    ys.value = '1985'; ms.value = '06';
    const hint = () => { const ym = `${ys.value}-${ms.value}`; $('ccHint').textContent = `En ${label(ym)} circulaban ${curAt(ym).lname}: el monto se toma en esa moneda.`; };
    ys.addEventListener('change', hint); ms.addEventListener('change', hint); hint();
  }

  async function calc(e) {
    e?.preventDefault();
    const out = $('ccResult'), I = idx();
    const amount = parse($('ccAmount').value), ym = `${$('ccYear').value}-${$('ccMonth').value}`;
    if (!Number.isFinite(amount) || amount <= 0) { out.textContent = 'Ingresá un monto mayor que cero.'; return; }
    if (!I || !Object.keys(I).length) { out.textContent = 'Todavía se está cargando la inflación histórica. Probá de nuevo en unos segundos.'; return; }
    const keys = Object.keys(I).sort(), last = keys.at(-1), first = keys[0];
    if (ym > last) { out.textContent = `El último dato de inflación es de ${label(last)}: elegí una fecha anterior.`; return; }
    if (ym < first) { out.textContent = `La inflación mensual del sitio empieza en ${label(first)}.`; return; }
    const cur = curAt(ym);
    const nominalPesos = amount * cur.toPeso, factor = I[last] / I[ym], today = nominalPesos * factor;
    const fmtN = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 });
    const mult = factor >= 1e6 ? `${(factor).toExponential(2).replace('.', ',').replace('e+', ' × 10^')}` : fmtN.format(factor);
    const fx = await dollars(), usd = (q, name) => q?.sell ? `<li><b>${usdFmt(today / q.sell)}</b> al dólar ${name} de hoy ($ ${fmtN.format(q.sell)})</li>` : '';
    const usdHtml = fx ? `<ul class="cc-usd">${usd(fx.bna, 'oficial BNA')}${usd(fx.mep, 'MEP')}</ul>` : '<small>No se pudo consultar el dólar de hoy.</small>';
    out.innerHTML = `<strong>${cur.short} ${fmtN.format(amount)} de ${label(ym)}</strong> equivalen hoy a <b class="cc-big">${money(today)}</b>
      <small>a precios de ${label(last)} (último IPC publicado).</small>${usdHtml}
      <ul class="cc-detail"><li>Sólo por el cambio de moneda: ${money(nominalPesos)} actuales.</li><li>Los precios se multiplicaron por ${mult} desde ${label(ym)}.</li></ul>`;
  }
  // Dólar de hoy (venta), del mismo servicio que el conversor de monedas.
  let fxP = null;
  const dollars = () => (fxP ??= fetch('/api/fx-converter', { headers: { accept: 'application/json' }, cache: 'no-cache' }).then(r => r.ok ? r.json() : null).then(j => j?.dollars || null).catch(() => { fxP = null; return null; }));
  const usdFmt = v => { if (!Number.isFinite(v)) return '—'; const a = Math.abs(v); if (a >= 0.01 && a < 1e15) return 'US$ ' + new Intl.NumberFormat('es-AR', { minimumFractionDigits: a < 100 ? 2 : 0, maximumFractionDigits: a < 100 ? 2 : 0 }).format(v); const [m, e] = v.toExponential(2).split('e'); return `US$ ${m.replace('.', ',')} × 10<sup>${Number(e)}</sup>`; };

  function init() { if (!$('currencyCalc')) return; fill(); $('currencyCalc').addEventListener('submit', calc); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

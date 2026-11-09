// v234 · Portada: "Indicadores clave", "Pulso económico" plegable y anticipo de la agenda.
// Sólo presentación: copia los valores que app.js ya muestra en las tarjetas del pulso y en la franja de
// mercados (no consulta ninguna fuente). Al tocar una tarjeta clave se abre el mismo gráfico que la original.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const txt = el => (el?.textContent || '').trim();
  const kpi = key => $(`#kpiGrid .kpi[data-kpi="${key}"]`);
  const LEVELS = ['green', 'yellow', 'red'];

  function paintTile(key, { label, value, sub, level, tone }) {
    const t = $(`#keyGrid [data-key="${key}"]`); if (!t) return;
    if (label) t.querySelector('.key-label').textContent = label;
    if (value) {
      const v = t.querySelector('.key-value'), m = value.match(/^(US\$)\s*([\d.,]+)\s*(M)$/);
      if (m) { v.textContent = ''; const u1 = document.createElement('small'), u2 = document.createElement('small'); u1.textContent = 'US$ '; u2.textContent = ' M'; v.append(u1, m[2], u2); }
      else v.textContent = value;
    }
    const s = t.querySelector('.key-sub b'), dot = t.querySelector('.key-sub i');
    if (sub != null) s.textContent = sub;
    s.className = tone ? `tone-${tone}` : '';
    dot.className = LEVELS.includes(level) ? `lvl-${level}` : 'lvl-none';
    t.classList.toggle('is-loading', !value || value === '—');
  }

  function fromKpi(key, base) {
    const c = kpi(key); if (!c) return;
    const value = txt(c.querySelector('[data-value]')), period = txt(c.querySelector('[data-period]'));
    const detail = txt(c.querySelector('[data-detail]'));
    const yoy = detail.match(/([−+\-]?[\d.,]+%)\s*interanual/);
    const when = period.split('·')[0].trim();
    paintTile(key, {
      label: when ? `${base} · ${when}` : base,
      value,
      sub: yoy ? `${yoy[1]} interanual` : detail.split('·')[0].trim(),
      level: c.querySelector('[data-signal]')?.dataset.level
    });
  }

  function toneOf(el) {
    const c = el?.className || '';
    return /positive/.test(c) ? 'pos' : /negative/.test(c) ? 'neg' : 'flat';
  }

  function fromMarket(key, id) {
    const v = txt(document.getElementById(id)), ch = document.getElementById(id + 'Change');
    if (!v || v === '—') return;
    paintTile(key, { value: v.replace(/\s*venta$/, ''), sub: txt(ch) || txt(document.getElementById(id + 'Date')), tone: toneOf(ch) });
  }

  function reserves() {
    const d = txt(document.getElementById('heroBcraDate')), m = d.match(/reservas US\$\s*([\d.]+)\s*M/);
    if (!m) return;
    const ch = document.getElementById('heroBcraChange'), c = txt(ch);
    paintTile('reserves', { value: `US$ ${m[1]} M`, sub: c && c !== '—' ? `compras ${c}` : 'brutas', tone: toneOf(ch) });
  }

  // "Pulso económico": se muestran las primeras tarjetas (las publicadas más recientemente) y el resto con un botón.
  let expanded = false;
  function paintMore() {
    const grid = document.getElementById('kpiGrid'), btn = document.getElementById('kpiMore'); if (!grid || !btn) return;
    const n = [...grid.querySelectorAll('.kpi[data-kpi]')].filter(c => !c.hidden).length;
    const lim = matchMedia('(max-width:620px)').matches ? 6 : 8;
    grid.classList.toggle('kpi-collapsed', !expanded);
    btn.hidden = n <= lim;
    btn.textContent = expanded ? 'Mostrar menos' : `Ver los ${n - lim} indicadores restantes`;
    btn.setAttribute('aria-expanded', String(expanded));
    const head = $('#clave .home-head a'); if (head && n) head.textContent = `Ver los ${n} indicadores →`;
  }

  function agenda() {
    const box = document.getElementById('teaserAgenda'), items = [...document.querySelectorAll('#agendaList article')].slice(0, 2);
    if (!box || !items.length) return;
    box.innerHTML = '';
    for (const a of items) {
      const row = document.createElement('span'), name = document.createElement('span'), when = document.createElement('b');
      row.className = 'teaser-row'; name.textContent = txt(a.querySelector('h3')); when.textContent = txt(a.querySelector('time')).replace(/\s+/g, ' ').toLowerCase();
      row.append(name, when); box.append(row);
    }
  }

  function render() {
    try {
      fromKpi('ipc', 'Inflación'); fromKpi('emae', 'Actividad');
      fromMarket('bna', 'heroBna'); fromMarket('risk', 'heroRisk'); reserves();
      paintMore(); agenda();
    } catch (e) { console.warn('[portada]', e); }
  }

  let queued = false;
  const schedule = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; render(); }); };

  function init() {
    document.getElementById('keyGrid')?.addEventListener('click', e => {
      const t = e.target.closest('[data-key]'); if (!t || t.tagName === 'A') return;
      const k = t.dataset.key;
      if (k === 'ipc' || k === 'emae') kpi(k)?.click();
      else document.getElementById(k === 'bna' ? 'heroBna' : 'heroRisk')?.closest('.market-card')?.click();
    });
    document.getElementById('kpiMore')?.addEventListener('click', () => {
      expanded = !expanded; paintMore();
      if (!expanded) document.getElementById('tablero')?.scrollIntoView({ block: 'start' });
    });
    // Los enlaces "Ver los N indicadores" abren el pulso completo.
    document.addEventListener('click', e => {
      const a = e.target.closest?.('a[href="#tablero"]'); if (a && a.closest('#inicio,#clave')) { expanded = true; paintMore(); }
    });
    const mo = new MutationObserver(schedule), opts = { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'data-level', 'hidden'] };
    for (const r of [$('.hero-panel'), document.getElementById('kpiGrid'), document.getElementById('agendaList')]) if (r) mo.observe(r, opts);
    matchMedia('(max-width:620px)').addEventListener?.('change', paintMore);
    render();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

// v161 · Pestañas: "Dólar", "Series históricas", "Cuando naciste" y "Calculadoras" se ven en su propia pestaña; el
// resto del sitio queda en "Inicio". La pestaña se elige por el enlace (#tipo-cambio, #historicos, #reservas,
// #nacimiento o #nacimiento-AAAA-MM, #calculadoras); así siguen funcionando los enlaces compartidos.
(() => {
  const root = document.documentElement;
  const MAP = { 'tipo-cambio': 'dolar', dolar: 'dolar', historicos: 'historicos', reservas: 'historicos', nacimiento: 'naciste', calculadoras: 'calculadoras', updateCalc: 'calculadoras', uvaCalc: 'calculadoras' };
  const FIRST = { dolar: 'tipo-cambio', historicos: 'historicos', naciste: 'nacimiento', calculadoras: 'calculadoras', inicio: 'inicio' };
  const tabFor = h => MAP[h] || (/^nacimiento-/.test(h) ? 'naciste' : 'inicio');
  function paintNav(tab) {
    document.querySelectorAll('[data-tab-link]').forEach(a => {
      const on = a.dataset.tabLink === tab && (!a.classList.contains('sub') || false);
      a.classList.toggle('active', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }
  function show(hash, { scroll = true } = {}) {
    const h = decodeURIComponent(String(hash || '').replace(/^#/, '')), tab = tabFor(h), prev = root.getAttribute('data-tab');
    root.setAttribute('data-tab', tab); paintNav(tab);
    if (prev !== tab) {
      // Los gráficos que se dibujaron ocultos toman el tamaño correcto al mostrarse.
      requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
      document.dispatchEvent(new CustomEvent('macro:tab', { detail: { tab } }));
    }
    if (!scroll) return;
    const target = h && document.getElementById(h);
    if ((tab !== 'inicio' && (!target || h === FIRST[tab])) || h === 'inicio') window.scrollTo({ top: 0 });
    else if (target) requestAnimationFrame(() => target.scrollIntoView({ block: 'start' }));
    else window.scrollTo({ top: 0 });
  }
  document.addEventListener('click', e => {
    const a = e.target.closest?.('a[href^="#"]'); if (!a) return;
    const h = a.getAttribute('href'); if (h === '#' || h === '#main') return;
    const id = h.slice(1), el = document.getElementById(id);
    if (!el && !MAP[id] && !/^nacimiento-/.test(id)) return;
    e.preventDefault();
    if (location.hash !== h) history.pushState(null, '', h);
    show(h);
    const nav = document.getElementById('nav'), btn = document.getElementById('menuBtn');
    if (nav?.classList.contains('open')) { nav.classList.remove('open'); btn?.setAttribute('aria-expanded', 'false'); }
  });
  window.addEventListener('popstate', () => show(location.hash));
  window.addEventListener('hashchange', () => show(location.hash));
  // Al cargar: la pestaña ya la eligió el script del <head>; acá sólo se marca el menú (el desplazamiento al
  // enlace lo maneja app.js mientras termina de cargar la página).
  show(location.hash, { scroll: false });
})();

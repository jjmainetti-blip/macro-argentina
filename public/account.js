// v164 · "Mi cuenta": ingreso con enlace por mail, contratos con su fórmula de actualización y avisos por mail.
// Todo el cálculo lo hace el Worker (/api/account/*), el mismo que después manda los recordatorios.
(() => {
  const app = document.getElementById('acctApp'); if (!app) return;
  const navLink = document.getElementById('navAccount');
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = n => n == null ? '—' : new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  const pct = n => n == null ? '—' : `${n >= 0 ? '+' : '−'}${new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(n))}%`;
  const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const MES_L = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const day = k => { if (!k) return '—'; const [y, m, d] = k.split('-'); return d ? `${Number(d)} ${MES[+m - 1]} ${y}` : `${MES_L[+m - 1]} ${y}`; };
  const INDEX = { ipc: 'IPC (INDEC)', icl: 'ICL (BCRA)', cer: 'CER (BCRA)', uva: 'UVA (BCRA)', fixed: 'Porcentaje fijo' };
  const FREQ = { 1: 'mensual', 2: 'bimestral', 3: 'trimestral', 4: 'cuatrimestral', 6: 'semestral', 12: 'anual' };
  const freqText = n => FREQ[n] || `cada ${n} meses`;

  async function api(path, opts = {}) {
    const r = await fetch(`/api/account${path}`, { method: opts.method || 'GET', credentials: 'same-origin', headers: opts.body ? { 'content-type': 'application/json' } : {}, body: opts.body ? JSON.stringify(opts.body) : undefined, cache: 'no-store' });
    let j = null; try { j = await r.json(); } catch { }
    if (!r.ok) { const e = new Error(j?.errors?.join(' ') || j?.error || `Error ${r.status}`); e.status = r.status; e.errors = j?.errors; throw e; }
    return j;
  }
  const state = { user: null, mail: true, contracts: [], data: {}, today: '', editing: null, loaded: false };
  const setNav = () => { if (navLink) navLink.textContent = state.user ? 'Mi cuenta ✓' : 'Mi cuenta'; };
  const clearHash = () => { try { history.replaceState(null, '', '#cuenta'); } catch { } };

  // ── Vistas sin sesión ──────────────────────────────────────────────────────────────────────────────────────
  function viewLogin(msg = '') {
    app.innerHTML = `<div class="acct-grid">
      <form class="acct-card acct-login" id="acctLoginForm" novalidate>
        <h3>Entrá o creá tu cuenta</h3>
        <p>Escribí tu mail y te mandamos un enlace para entrar. No hace falta contraseña: si es la primera vez, la cuenta se crea sola.</p>
        <label>Mail<input type="email" id="acctEmail" autocomplete="email" inputmode="email" required placeholder="tu@mail.com"></label>
        <button class="btn primary" type="submit">Enviarme el enlace</button>
        <p class="acct-msg" id="acctMsg" role="status">${esc(msg)}</p>
        ${state.mail ? '' : '<p class="acct-warn">El envío de mails todavía no está configurado en el sitio.</p>'}
      </form>
      <div class="acct-card acct-features"><h3>Qué podés hacer</h3><ul>
        <li><b>Contratos</b> — cargá el monto inicial, la fecha, el índice (IPC, ICL, CER, UVA o un porcentaje fijo) y cada cuánto se actualiza.</li>
        <li><b>Cronograma</b> — mirá el monto vigente, todos los ajustes y el próximo, con el porcentaje de cada uno.</li>
        <li><b>Avisos por mail</b> — a vos y a otra persona (por ejemplo, el inquilino o el propietario), todos los meses o sólo cuando hay un ajuste.</li>
        <li><b>Resúmenes por mail</b> — diario y/o semanal, con lo que elijas: dólar, riesgo país, Merval, compras del BCRA, datos publicados, REM y agenda.</li>
        <li><b>Alertas</b> — un mail cuando el dólar, el riesgo país o el Merval se mueven más que el porcentaje que fijes.</li>
        <li><b>Tu seguimiento</b> — acciones, bonos, letras, ON y CEDEARs de BYMA, y empresas argentinas en Wall Street, con su variación en cada resumen.</li>
      </ul></div></div>`;
    const f = document.getElementById('acctLoginForm');
    f.addEventListener('submit', async e => {
      e.preventDefault();
      const email = document.getElementById('acctEmail').value.trim(), m = document.getElementById('acctMsg'), b = f.querySelector('button');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { m.textContent = 'Revisá la dirección de mail.'; return; }
      b.disabled = true; m.textContent = 'Enviando…';
      try { await api('/login', { method: 'POST', body: { email } }); viewSent(email); }
      catch (err) { m.textContent = err.message; b.disabled = false; }
    });
  }
  function viewSent(email) {
    app.innerHTML = `<div class="acct-card acct-center"><div class="acct-big">✉</div><h3>Revisá tu mail</h3><p>Te mandamos un enlace a <b>${esc(email)}</b>. Abrilo desde este dispositivo o cualquier otro para entrar; vence en 15 minutos.</p><p class="acct-note">¿No llegó? Revisá spam o promociones. <button type="button" class="link-btn" id="acctBack">Usar otro mail</button></p></div>`;
    document.getElementById('acctBack').onclick = () => viewLogin();
  }
  function viewVerify(token) {
    app.innerHTML = `<div class="acct-card acct-center"><h3>Entrar a Macrodatos</h3><p>Confirmá para iniciar sesión en este dispositivo.</p><button class="btn primary" id="acctVerify">Entrar</button><p class="acct-msg" id="acctMsg" role="status"></p></div>`;
    const b = document.getElementById('acctVerify');
    b.onclick = async () => {
      b.disabled = true; document.getElementById('acctMsg').textContent = 'Entrando…';
      try { const j = await api('/verify', { method: 'POST', body: { token } }); clearHash(); state.user = { email: j.email }; setNav(); await loadContracts(); }
      catch (err) { document.getElementById('acctMsg').innerHTML = `${esc(err.message)} <button type="button" class="link-btn" id="acctRetry">Pedir otro enlace</button>`; document.getElementById('acctRetry').onclick = () => { clearHash(); viewLogin(); }; }
    };
  }
  async function viewRecipient(token, kind) {
    app.innerHTML = '<div class="acct-card acct-center">Cargando…</div>';
    let info; try { info = await api('/recipient', { method: 'POST', body: { token, action: 'info' } }); }
    catch (err) { app.innerHTML = `<div class="acct-card acct-center"><h3>Enlace no válido</h3><p>${esc(err.message)}</p></div>`; return; }
    const confirm = kind === 'confirmar';
    app.innerHTML = `<div class="acct-card acct-center"><h3>${confirm ? 'Avisos de un contrato' : 'Dejar de recibir avisos'}</h3>
      <p>${confirm ? `<b>${esc(info.owner)}</b> te agregó como destinatario de los avisos de actualización del contrato <b>${esc(info.contract)}</b>.` : (info.kind === 'digest' ? 'Vas a dejar de recibir los resúmenes y las alertas por mail. Podés volver a activarlos desde tu cuenta.' : `Vas a dejar de recibir los avisos del contrato <b>${esc(info.contract)}</b>.`)}</p>
      <div class="acct-actions">${confirm ? '<button class="btn primary" data-a="confirm">Sí, quiero recibirlos</button><button class="btn ghost-dark" data-a="unsubscribe">No, gracias</button>' : '<button class="btn primary" data-a="unsubscribe">Darme de baja</button>'}</div>
      <p class="acct-msg" id="acctMsg" role="status"></p></div>`;
    app.querySelectorAll('[data-a]').forEach(b => b.onclick = async () => {
      app.querySelectorAll('[data-a]').forEach(x => x.disabled = true);
      try { const j = await api('/recipient', { method: 'POST', body: { token, action: b.dataset.a } }); document.getElementById('acctMsg').textContent = j.status === 'ok' ? 'Listo: vas a recibir los avisos de este contrato.' : (info.kind === 'digest' ? 'Listo: no vas a recibir más resúmenes ni alertas.' : 'Listo: no vas a recibir más avisos de este contrato.'); clearHash(); }
      catch (err) { document.getElementById('acctMsg').textContent = err.message; }
    });
  }

  // ── Con sesión: contratos ──────────────────────────────────────────────────────────────────────────────────
  async function loadContracts() {
    try { const j = await api('/contracts'); Object.assign(state, { user: { email: j.email }, mail: j.mail, contracts: j.contracts, data: j.data, today: j.today, loaded: true }); setNav(); viewAccount(); }
    catch (err) { if (err.status === 401) { state.user = null; setNav(); viewLogin(); } else app.innerHTML = `<div class="acct-card">No se pudo cargar tu cuenta: ${esc(err.message)}</div>`; }
  }
  function remindersText(c) {
    const r = c.reminders || {};
    if (r.mode === 'off') return 'Sin avisos por mail';
    const when = r.mode === 'monthly' ? `todos los meses (día ${r.day})` : `cuando hay un ajuste${r.daysBefore ? ` (${r.daysBefore} ${r.daysBefore === 1 ? 'día' : 'días'} antes)` : ''}`;
    const who = [r.self !== false ? 'a vos' : null, ...(c.recipients || []).map(x => `${esc(x.email)}${x.status === 'pending' ? ' <i>(falta que confirme)</i>' : x.status === 'off' ? ' <i>(se dio de baja)</i>' : ''}`)].filter(Boolean);
    return `Aviso ${when}${who.length ? ` · ${who.join(', ')}` : ' · <i>sin destinatarios</i>'}`;
  }
  function indexText(c) { return c.index === 'fixed' ? `${String(c.fixedPct).replace('.', ',')}% fijo` : INDEX[c.index] + (c.index === 'ipc' ? ` · rezago ${c.lag}` : ''); }
  function nextHtml(c) {
    if (c.ended) return '<span class="acct-tag">Contrato finalizado</span>';
    if (c.baseError) return `<span class="acct-warn">No hay datos del índice para la fecha de inicio (${esc(day(c.baseError))}).</span>`;
    const n = c.next; if (!n) return '';
    return `<div class="acct-next"><span>Próximo ajuste · ${esc(day(n.date))}</span>${n.pending ? `<b>Pendiente</b><small>Se conoce ${esc(n.hint)}</small>` : `<b>${money(n.amount)}</b><small>${pct(n.stepPct)}${n.window ? ` · ${esc(n.window)}` : ''}</small>`}</div>`;
  }
  function scheduleTable(c) {
    const rows = [...c.rows];
    return `<div class="upd-table-wrap"><table class="upd-table acct-table"><thead><tr><th>#</th><th>Fecha</th><th>Monto</th><th>Ajuste</th><th>Acumulado</th></tr></thead><tbody>
      ${c.totalRows > rows.length ? `<tr class="upd-base"><td colspan="5">… ${c.totalRows - rows.length} ajustes anteriores</td></tr>` : `<tr class="upd-base"><td>0</td><td>${esc(day(c.start))}<small>inicio</small></td><td>${money(c.amount)}</td><td>—</td><td>—</td></tr>`}
      ${rows.map(r => `<tr class="${r.past ? '' : 'acct-future'}"><td>${r.k}</td><td>${esc(day(r.date))}${r.window ? `<small>${esc(r.window)}</small>` : ''}</td><td>${r.pending ? '<i>pendiente</i>' : `<strong>${money(r.amount)}</strong>`}</td><td>${r.pending ? '—' : pct(r.stepPct)}</td><td>${r.pending ? `<small>${esc(r.hint)}</small>` : pct(r.totalPct)}</td></tr>`).join('')}
    </tbody></table></div>`;
  }
  // ── v168 · Ventana emergente (mismo estilo que las tarjetas de Pulso económico) ──────────────────────────────
  let modalEl = null, lastFocus = null;
  function openModal(cls = '') {
    if (!modalEl) {
      modalEl = document.createElement('div'); modalEl.className = 'kpi-modal acct-modal'; modalEl.hidden = true;
      modalEl.innerHTML = '<div class="kpi-modal-backdrop" data-close></div><section class="kpi-modal-panel" role="dialog" aria-modal="true"><button class="kpi-modal-close" type="button" data-close aria-label="Cerrar">×</button><div class="acct-modal-body"></div></section>';
      document.body.appendChild(modalEl);
      modalEl.querySelectorAll('[data-close]').forEach(x => x.addEventListener('click', closeModal));
      document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modalEl.hidden) closeModal(); });
    }
    lastFocus = document.activeElement;
    modalEl.querySelector('.kpi-modal-panel').className = `kpi-modal-panel ${cls}`;
    modalEl.hidden = false; modalEl.setAttribute('aria-hidden', 'false'); document.body.classList.add('modal-open');
    const body = modalEl.querySelector('.acct-modal-body'); body.innerHTML = '';
    requestAnimationFrame(() => modalEl.querySelector('.kpi-modal-close').focus());
    return body;
  }
  function closeModal() { if (!modalEl) return; modalEl.hidden = true; modalEl.setAttribute('aria-hidden', 'true'); document.body.classList.remove('modal-open'); state.editing = null; lastFocus?.focus?.(); }

  // Tarjeta de contrato con el formato de Pulso económico.
  function contractCard(c) {
    const n = c.next, badge = c.index === 'fixed' ? `${String(c.fixedPct).replace('.', ',')}%` : c.index.toUpperCase();
    let em = '', cls = '';
    if (c.ended) { em = 'Contrato finalizado'; cls = 'neutral'; }
    else if (c.baseError) { em = 'Sin datos del índice al inicio'; cls = 'down'; }
    else if (n?.pending) { em = `Próximo: ${day(n.date)} · pendiente`; cls = 'neutral'; }
    else if (n) { em = `Próximo: ${day(n.date)} · ${pct(n.stepPct)}`; cls = n.stepPct >= 0 ? '' : 'down'; }
    const rem = c.reminders?.mode === 'off' ? 'Sin avisos por mail' : c.reminders?.mode === 'monthly' ? 'Aviso mensual por mail' : 'Aviso por mail en cada ajuste';
    const pendingRcpt = (c.recipients || []).some(x => x.status === 'pending');
    return `<article class="kpi acct-kpi" data-id="${esc(c.id)}" tabindex="0" role="button" aria-label="Ver detalle de ${esc(c.name)}">
      <div class="kpi-top"><span>${esc(c.name)}</span><b>${esc(badge)}</b></div>
      <strong>${money(c.current?.amount)}</strong>
      <p>Vigente desde ${esc(day(c.current?.date))} · ${esc(freqText(c.freq))}</p>
      <em class="${cls}">${esc(em)}</em>
      <div class="data-health ${c.reminders?.mode === 'off' ? 'cached' : 'live'}">${rem}${pendingRcpt ? ' · falta una confirmación' : ''}</div>
    </article>`;
  }
  function openContract(c) {
    const body = openModal('acct-modal-wide');
    body.innerHTML = `<div class="kpi-modal-head"><div><span class="kpi-modal-agency">${esc(indexText(c))} · ajuste ${esc(freqText(c.freq))}</span><h2>${esc(c.name)}</h2><p>Desde ${esc(day(c.start))}${c.end ? ` hasta ${esc(day(c.end))}` : ''} · monto inicial ${money(c.amount)}</p></div><strong>${money(c.current?.amount)}<small class="acct-modal-sub">vigente desde ${esc(day(c.current?.date))}</small></strong></div>
      ${nextHtml(c)}
      <p class="acct-rem">${remindersText(c)}</p>
      ${c.notes ? `<p class="acct-note">Nota: ${esc(c.notes)}</p>` : ''}
      <h3 class="acct-h3b">Ajustes</h3>${c.baseError ? '' : scheduleTable(c)}
      <div class="acct-actions"><button class="btn primary" data-act="edit">Editar</button>${c.reminders?.mode !== 'off' && state.mail ? '<button class="btn small" data-act="test">Enviarme un mail de prueba</button>' : ''}<button class="btn small danger" data-act="del">Eliminar</button></div>
      <p class="acct-msg" role="status"></p>`;
    const msg = body.querySelector('.acct-msg');
    body.querySelectorAll('[data-act]').forEach(b => b.onclick = async () => {
      const act = b.dataset.act;
      if (act === 'edit') openForm(c);
      if (act === 'test') { b.disabled = true; msg.textContent = 'Enviando…'; try { await api(`/contracts/${c.id}/test`, { method: 'POST' }); msg.textContent = `Listo: revisá ${state.user.email}.`; } catch (err) { msg.textContent = err.message; } b.disabled = false; }
      if (act === 'del') { if (!confirm(`¿Eliminar "${c.name}"?`)) return; try { await api(`/contracts/${c.id}`, { method: 'DELETE' }); closeModal(); await loadContracts(); } catch (err) { msg.textContent = err.message; } }
    });
  }
  function viewAccount() {
    const d = state.data || {};
    const dataNote = [d.ipc ? `IPC hasta ${day(d.ipc)}` : null, d.icl ? `ICL hasta ${day(d.icl)}` : null, d.cer ? `CER hasta ${day(d.cer)}` : null, d.uva ? `UVA hasta ${day(d.uva)}` : null].filter(Boolean).join(' · ');
    app.innerHTML = `<div class="acct-bar"><span>Sesión iniciada como <b>${esc(state.user.email)}</b></span><span class="acct-bar-actions"><button class="link-btn" id="acctLogout">Cerrar sesión</button></span></div>
      ${state.mail ? '' : '<p class="acct-warn">El envío de mails todavía no está configurado en el sitio: los contratos se guardan, pero los avisos no van a salir.</p>'}
      <div class="acct-section-head"><h3>Tus contratos</h3><span class="acct-note">Tocá una tarjeta para ver todos los ajustes.</span></div>
      <div class="kpi-grid acct-kpis">${state.contracts.map(contractCard).join('')}
        <button type="button" class="kpi acct-kpi-add" id="acctAdd"><span>+</span><b>Agregar contrato</b><small>Monto, fecha, índice y frecuencia de ajuste</small></button></div>
      <p class="acct-data">${esc(dataNote)}</p>
      <div class="acct-card acct-prefs-bar"><div><h3>Resúmenes, alertas y seguimiento</h3><p id="acctPrefsSummary" class="acct-note">Cargando…</p></div><button class="btn primary" id="acctPrefsBtn" type="button">Configurar resúmenes y alertas</button></div>
      <details class="acct-danger"><summary>Eliminar mi cuenta</summary><p>Se borran tus contratos y dejás de recibir avisos. No se puede deshacer.</p><button class="btn small danger" id="acctDelete">Eliminar mi cuenta</button></details>`;
    document.getElementById('acctAdd').onclick = () => openForm(null);
    document.getElementById('acctPrefsBtn').onclick = () => openPrefs();
    loadPrefs();
    document.getElementById('acctLogout').onclick = async () => { try { await api('/logout', { method: 'POST' }); } catch { } state.user = null; setNav(); viewLogin(); };
    document.getElementById('acctDelete').onclick = async () => { if (!confirm('¿Eliminar tu cuenta y todos tus contratos?')) return; try { await api('', { method: 'DELETE' }); } catch { } state.user = null; setNav(); viewLogin('Tu cuenta fue eliminada.'); };
    app.querySelectorAll('.acct-kpi').forEach(card => {
      const c = state.contracts.find(x => x.id === card.dataset.id);
      card.addEventListener('click', () => openContract(c));
      card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openContract(c); } });
    });
  }

  // ── v166 · Resúmenes y alertas ─────────────────────────────────────────────────────────────────────────────
  const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  let prefsData = null;
  function prefsSummary(P) {
    if (!P) return '';
    const D = P.digest, bits = [];
    if (D.daily.on) bits.push(`resumen diario (${D.daily.slot === 'am' ? '8:30' : '18:30'})`);
    if (D.weekly.on) bits.push(`resumen semanal (${DIAS[D.weekly.day].toLowerCase()})`);
    const al = P.alerts.filter(a => a.on).length; if (al) bits.push(`${al} ${al === 1 ? 'alerta' : 'alertas'} de mercado`);
    const w = (D.watch || []).length; if (w) bits.push(`${w} ${w === 1 ? 'instrumento' : 'instrumentos'} en seguimiento`);
    return bits.length ? `Activo: ${bits.join(' · ')}.` : 'No tenés resúmenes ni alertas activos.';
  }
  async function loadPrefs() {
    const el = document.getElementById('acctPrefsSummary');
    try { prefsData = await api('/prefs'); if (el) el.textContent = prefsSummary(prefsData.prefs); }
    catch (err) { if (el) el.textContent = `No se pudieron cargar: ${err.message}`; }
  }
  async function openPrefs() {
    const box = openModal('acct-modal-wide');
    box.innerHTML = '<p class="acct-note">Cargando…</p>';
    if (!prefsData) { try { prefsData = await api('/prefs'); } catch (err) { box.innerHTML = `<p class="acct-warn">${esc(err.message)}</p>`; return; } }
    renderPrefs(box, prefsData);
  }
  function renderPrefs(box, j) {
    const P = j.prefs, D = P.digest, slotOpts = v => Object.entries(j.slots).map(([k, l]) => `<option value="${k}"${v === k ? ' selected' : ''}>${esc(l)}</option>`).join('');
    box.innerHTML = `<form class="acct-card acct-prefs" id="acctPrefsForm" novalidate>
      <h3>Resúmenes por mail</h3><p>Llegan a ${esc(state.user.email)}. El diario sale sólo en días hábiles.</p>
      <div class="acct-prefs-grid">
        <div class="acct-pref"><label class="acct-check"><input type="checkbox" name="dailyOn"${D.daily.on ? ' checked' : ''}> <b>Resumen diario</b></label>
          <label>Horario<select name="dailySlot">${slotOpts(D.daily.slot)}</select></label></div>
        <div class="acct-pref"><label class="acct-check"><input type="checkbox" name="weeklyOn"${D.weekly.on ? ' checked' : ''}> <b>Resumen semanal</b></label>
          <div class="acct-row2"><label>Día<select name="weeklyDay">${DIAS.map((d, i) => `<option value="${i}"${D.weekly.day === i ? ' selected' : ''}>${d}</option>`).join('')}</select></label>
          <label>Horario<select name="weeklySlot">${slotOpts(D.weekly.slot)}</select></label></div></div>
      </div>
      <fieldset class="acct-fs"><legend>Qué incluir</legend><div class="acct-items">${Object.entries(j.items).map(([k, l]) => `<label class="acct-check"><input type="checkbox" name="item" value="${k}"${D.items.includes(k) ? ' checked' : ''}> ${esc(l)}</label>`).join('')}</div></fieldset>
      <fieldset class="acct-fs acct-watch"><legend>Tu seguimiento: acciones, bonos y ADRs</legend>
        <p class="acct-note">Elegí hasta 20 instrumentos de BYMA (acciones, bonos, letras, ON, CEDEARs) o empresas argentinas en Wall Street. Aparecen en tus resúmenes con su precio y su variación (diaria; en el semanal, también de la semana).</p>
        <div class="acct-watch-add"><input id="watchInput" list="watchList" placeholder="Buscá un ticker: GGAL, AL30, GD30D, YPF…" autocomplete="off" aria-label="Agregar instrumento"><datalist id="watchList"></datalist><button class="btn small" type="button" id="watchAdd">Agregar</button></div>
        <div class="acct-chips" id="watchChips"></div><p class="acct-note" id="watchInfo"></p></fieldset>
      <h3 class="acct-h3b">Alertas de mercado</h3><p>Te avisamos cuando la variación del día supera tu umbral. Se revisa cada 5 minutos en días hábiles (10:30 a 18 h); llega un mail por activo y dirección, y otro si el movimiento llega al doble, al triple…</p>
      <div class="acct-alerts">${P.alerts.map(a => `<div class="acct-alert" data-asset="${a.asset}"><label class="acct-check"><input type="checkbox" name="on"${a.on ? ' checked' : ''}> <b>${esc(j.assets[a.asset])}</b></label>
        <label>Umbral (%)<input name="pct" inputmode="decimal" value="${String(a.pct).replace('.', ',')}"></label>
        <label>Dirección<select name="dir"><option value="both"${a.dir === 'both' ? ' selected' : ''}>Sube o baja</option><option value="up"${a.dir === 'up' ? ' selected' : ''}>Sólo si sube</option><option value="down"${a.dir === 'down' ? ' selected' : ''}>Sólo si baja</option></select></label></div>`).join('')}</div>
      <div class="acct-actions"><button class="btn primary" type="submit">Guardar</button><button class="btn small" type="button" data-test="daily">Probar resumen diario</button><button class="btn small" type="button" data-test="weekly">Probar resumen semanal</button></div>
      <p class="acct-msg" id="acctPrefsMsg" role="status"></p></form>`;
    const f = document.getElementById('acctPrefsForm'), msg = document.getElementById('acctPrefsMsg');
    // v167 · Lista de seguimiento.
    const watch = [...(D.watch || [])], quotes = {};
    const MK = { ar: 'Acción BYMA', bono: 'Bono', letra: 'Letra', on: 'ON', cedear: 'CEDEAR', us: 'Wall Street' };
    const chips = document.getElementById('watchChips'), info = document.getElementById('watchInfo'), inp = document.getElementById('watchInput');
    const fmtQ = q => q?.price == null ? 'sin cotización' : `${q.currency === 'ARS' ? '$' : 'US$'} ${new Intl.NumberFormat('es-AR', { maximumFractionDigits: q.price < 1000 ? 2 : 0 }).format(q.price)}${q.pct == null ? '' : ` <b class="${q.pct >= 0 ? 'up' : 'down'}">${q.pct >= 0 ? '+' : '−'}${new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(q.pct))}%</b>`}`;
    const paintChips = () => {
      chips.innerHTML = watch.length ? watch.map(id => { const [m, sym] = id.split(':'), q = quotes[id]; return `<span class="acct-chip"><b>${esc(sym)}</b><small>${esc(q?.name ? `${q.name} · ` : '')}${esc(MK[m] || m)}</small><span class="acct-chip-q">${q ? fmtQ(q) : '…'}</span><button type="button" data-rm="${esc(id)}" aria-label="Quitar ${esc(sym)}">×</button></span>`; }).join('') : '<span class="acct-note">Todavía no agregaste instrumentos.</span>';
      chips.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { watch.splice(watch.indexOf(b.dataset.rm), 1); paintChips(); });
    };
    const refreshQuotes = async () => { if (!watch.length) return paintChips(); try { const r = await api('/prefs/watch', { method: 'POST', body: { ids: watch } }); for (const q of r.quotes || []) quotes[q.id] = q; } catch { } paintChips(); };
    let catalog = null, catLoading = null;
    const loadCatalog = () => catLoading ||= api('/prefs/instruments').then(c => { catalog = c.rows || []; document.getElementById('watchList').innerHTML = catalog.map(r => `<option value="${esc(r[1])} · ${esc(r[2])}${r[3] ? ` · ${esc(r[3])}` : ''}"></option>`).join(''); info.textContent = `${catalog.length} instrumentos disponibles · ${c.source}.`; }).catch(err => { info.textContent = `No se pudo cargar la lista de instrumentos: ${err.message}`; catLoading = null; });
    inp.addEventListener('focus', loadCatalog, { once: true });
    const add = async () => {
      await loadCatalog(); const v = inp.value.trim(); if (!v) return;
      const [sym, lab] = v.split(' · ').map(x => x.trim()), S = sym.toUpperCase();
      const cands = (catalog || []).filter(r => r[1] === S && (!lab || r[2] === lab));
      const pick = cands.find(r => r[0].startsWith('us:')) && !lab ? (cands.find(r => r[0].startsWith('ar:')) || cands[0]) : cands[0];
      if (!pick) { info.textContent = `No encontré "${v}". Elegilo de la lista que aparece al escribir.`; return; }
      if (watch.includes(pick[0])) { inp.value = ''; return; }
      if (watch.length >= 20) { info.textContent = 'Podés seguir hasta 20 instrumentos.'; return; }
      watch.push(pick[0]); quotes[pick[0]] = { id: pick[0], price: pick[4], pct: pick[5], name: pick[3], currency: pick[0].startsWith('us:') ? 'USD' : (S.length > 3 && /D$/.test(S) ? 'USD' : S.length > 3 && /C$/.test(S) ? 'USD cable' : 'ARS') };
      const it = f.querySelector('[name=item][value=watch]'); if (it) it.checked = true;
      inp.value = ''; paintChips(); info.textContent = 'Agregado. Acordate de guardar.';
    };
    document.getElementById('watchAdd').onclick = add;
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
    paintChips(); refreshQuotes();
    const read = () => ({
      digest: { daily: { on: f.dailyOn.checked, slot: f.dailySlot.value }, weekly: { on: f.weeklyOn.checked, day: Number(f.weeklyDay.value), slot: f.weeklySlot.value }, items: [...f.querySelectorAll('[name=item]:checked')].map(x => x.value), watch: [...watch] },
      alerts: [...f.querySelectorAll('.acct-alert')].map(el => ({ asset: el.dataset.asset, on: el.querySelector('[name=on]').checked, pct: el.querySelector('[name=pct]').value, dir: el.querySelector('[name=dir]').value })),
    });
    f.addEventListener('submit', async e => {
      e.preventDefault(); const b = f.querySelector('[type=submit]'); b.disabled = true; msg.textContent = 'Guardando…';
      try { const r = await api('/prefs', { method: 'POST', body: read() }); prefsData = { ...j, prefs: r.prefs }; const sm = document.getElementById('acctPrefsSummary'); if (sm) sm.textContent = prefsSummary(r.prefs); renderPrefs(box, prefsData); document.getElementById('acctPrefsMsg').textContent = 'Guardado.'; }
      catch (err) { msg.textContent = err.message; b.disabled = false; }
    });
    f.querySelectorAll('[data-test]').forEach(b => b.onclick = async () => {
      b.disabled = true; msg.textContent = 'Enviando…';
      try { await api('/prefs/test', { method: 'POST', body: { kind: b.dataset.test, prefs: read() } }); msg.textContent = `Listo: revisá ${state.user.email}.`; }
      catch (err) { msg.textContent = err.message; }
      b.disabled = false;
    });
  }

  // ── Formulario de contrato con vista previa ────────────────────────────────────────────────────────────────
  function openForm(c) {
    state.editing = c;
    const box = openModal('acct-modal-wide'), r = c?.reminders || { mode: 'adjust', day: 1, daysBefore: 0, self: true };
    const freqVal = c ? (FREQ[c.freq] ? String(c.freq) : 'other') : '3';
    const amountTxt = c ? String(c.amount).replace('.', ',') : '';
    box.innerHTML = `<form class="acct-card acct-form" id="acctContractForm" novalidate>
      <h3>${c ? 'Editar contrato' : 'Nuevo contrato'}</h3>
      <div class="acct-fields">
        <label class="wide">Nombre<input name="name" maxlength="80" placeholder="Ej.: Alquiler depto Palermo" value="${esc(c?.name || '')}"></label>
        <label>Monto inicial ($)<input name="amount" inputmode="decimal" placeholder="500.000" value="${esc(amountTxt)}"></label>
        <label>Fecha de inicio<input name="start" type="date" value="${esc(c?.start || '')}"></label>
        <label>Fin (opcional)<input name="end" type="date" value="${esc(c?.end || '')}"></label>
        <label>Índice<select name="index">${Object.entries(INDEX).map(([k, v]) => `<option value="${k}"${(c?.index || 'ipc') === k ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
        <label data-show="ipc">Meses de IPC que se toman<select name="lag"><option value="2"${(c?.lag ?? 2) === 2 ? ' selected' : ''}>Últimos publicados al ajustar (rezago 2)</option><option value="1"${c?.lag === 1 ? ' selected' : ''}>Meses del período (rezago 1)</option><option value="3"${c?.lag === 3 ? ' selected' : ''}>Rezago 3</option><option value="0"${c?.lag === 0 ? ' selected' : ''}>Sin rezago</option></select></label>
        <label data-show="fixed">Aumento por ajuste (%)<input name="fixedPct" inputmode="decimal" placeholder="10" value="${esc(c?.fixedPct != null ? String(c.fixedPct).replace('.', ',') : '')}"></label>
        <label>Frecuencia<select name="freq">${Object.entries(FREQ).map(([k, v]) => `<option value="${k}"${freqVal === k ? ' selected' : ''}>${v[0].toUpperCase() + v.slice(1)}</option>`).join('')}<option value="other"${freqVal === 'other' ? ' selected' : ''}>Otra</option></select></label>
        <label data-show-freq>Cada cuántos meses<input name="freqOther" inputmode="numeric" value="${freqVal === 'other' ? c.freq : ''}"></label>
      </div>
      <fieldset class="acct-fs"><legend>Avisos por mail</legend>
        <div class="acct-fields">
          <label>Cuándo<select name="mode"><option value="adjust"${r.mode === 'adjust' ? ' selected' : ''}>Sólo cuando hay un ajuste</option><option value="monthly"${r.mode === 'monthly' ? ' selected' : ''}>Todos los meses</option><option value="off"${r.mode === 'off' ? ' selected' : ''}>No enviar</option></select></label>
          <label data-show-mode="adjust">Anticipación<select name="daysBefore">${[0, 1, 2, 3, 5, 7, 10, 15].map(n => `<option value="${n}"${(r.daysBefore || 0) === n ? ' selected' : ''}>${n ? `${n} ${n === 1 ? 'día' : 'días'} antes` : 'El día del ajuste'}</option>`).join('')}</select></label>
          <label data-show-mode="monthly">Día del mes<select name="day">${Array.from({ length: 28 }, (_, i) => `<option value="${i + 1}"${(r.day || 1) === i + 1 ? ' selected' : ''}>${i + 1}</option>`).join('')}</select></label>
          <label class="acct-check" data-hide-mode="off"><input type="checkbox" name="self"${r.self !== false ? ' checked' : ''}> Enviarme a mí (${esc(state.user.email)})</label>
          <label class="wide" data-hide-mode="off">Otras direcciones (hasta 3, separadas por coma)<input name="others" placeholder="inquilino@mail.com" value="${esc((c?.recipients || []).map(x => x.email).join(', '))}"><small>Cada dirección nueva recibe un mail para confirmar antes de empezar a recibir avisos.</small></label>
        </div>
      </fieldset>
      <label class="wide">Notas (opcional, se incluyen en los mails)<input name="notes" maxlength="300" value="${esc(c?.notes || '')}"></label>
      <div class="acct-preview" id="acctPreview"><p class="acct-note">Completá monto, fecha e índice para ver el cronograma.</p></div>
      <div class="acct-actions"><button class="btn primary" type="submit">${c ? 'Guardar cambios' : 'Guardar contrato'}</button><button class="btn ghost-dark" type="button" id="acctCancel">Cancelar</button></div>
      <p class="acct-msg" id="acctFormMsg" role="status"></p>
    </form>`;
    const f = document.getElementById('acctContractForm');
    const sync = () => {
      const idx = f.index.value, mode = f.mode.value;
      f.querySelectorAll('[data-show]').forEach(el => el.hidden = el.dataset.show !== idx);
      f.querySelector('[data-show-freq]').hidden = f.freq.value !== 'other';
      f.querySelectorAll('[data-show-mode]').forEach(el => el.hidden = el.dataset.showMode !== mode);
      f.querySelectorAll('[data-hide-mode]').forEach(el => el.hidden = el.dataset.hideMode === mode);
    };
    const read = () => ({
      name: f.name.value, amount: f.amount.value, start: f.start.value, end: f.end.value, index: f.index.value, lag: Number(f.lag.value), fixedPct: f.fixedPct.value,
      freq: f.freq.value === 'other' ? Number(f.freqOther.value) : Number(f.freq.value), notes: f.notes.value,
      reminders: { mode: f.mode.value, day: Number(f.day.value), daysBefore: Number(f.daysBefore.value), self: f.self.checked, others: f.others.value },
    });
    let t = null, seq = 0;
    const preview = () => {
      clearTimeout(t); t = setTimeout(async () => {
        const box = document.getElementById('acctPreview'); if (!box || !f.isConnected) return;
        const body = read(), my = ++seq;
        if (!body.amount || !body.start) return;
        try {
          const j = await api('/preview', { method: 'POST', body }); if (my !== seq || !box.isConnected) return;
          const p = j.contract;
          box.innerHTML = `<div class="acct-preview-head"><div><span>Monto vigente hoy</span><b>${money(p.current.amount)}</b><small>desde ${esc(day(p.current.date))}</small></div>${p.next ? `<div><span>Próximo ajuste · ${esc(day(p.next.date))}</span><b>${p.next.pending ? 'Pendiente' : money(p.next.amount)}</b><small>${p.next.pending ? esc(p.next.hint) : `${pct(p.next.stepPct)}${p.next.window ? ` · ${esc(p.next.window)}` : ''}`}</small></div>` : ''}</div>
            ${p.baseError ? `<p class="acct-warn">No hay datos del índice para la fecha de inicio (${esc(day(p.baseError))}).</p>` : scheduleTable(p)}`;
        } catch (err) { if (my === seq && box.isConnected) box.innerHTML = `<p class="acct-warn">${esc(err.message)}</p>`; }
      }, 350);
    };
    f.addEventListener('input', () => { sync(); preview(); }); f.addEventListener('change', () => { sync(); preview(); });
    sync(); preview();
    document.getElementById('acctCancel').onclick = () => { if (c) openContract(c); else closeModal(); };
    f.addEventListener('submit', async e => {
      e.preventDefault(); const m = document.getElementById('acctFormMsg'), b = f.querySelector('[type=submit]');
      b.disabled = true; m.textContent = 'Guardando…';
      try { await api(c ? `/contracts/${c.id}` : '/contracts', { method: c ? 'PUT' : 'POST', body: read() }); closeModal(); await loadContracts(); }
      catch (err) { m.textContent = err.message; b.disabled = false; }
    });
  }

  // ── Arranque ───────────────────────────────────────────────────────────────────────────────────────────────
  async function route() {
    const h = decodeURIComponent((location.hash || '').slice(1));
    let m;
    if ((m = h.match(/^acceso=([\w-]{20,100})$/))) return viewVerify(m[1]);
    if ((m = h.match(/^(confirmar|baja)=([\w-]{20,100})$/))) return viewRecipient(m[2], m[1]);
    if (h !== 'cuenta' && state.loaded) return;
    if (state.user) return state.loaded ? viewAccount() : loadContracts();
    viewLogin();
  }
  (async () => {
    try { const s = await api('/status'); state.mail = s.mail; state.user = s.user; setNav(); } catch { }
    await route();
  })();
  window.addEventListener('hashchange', () => { if (document.documentElement.getAttribute('data-tab') === 'cuenta') route(); });
  document.addEventListener('macro:tab', e => { if (e.detail?.tab === 'cuenta' && state.user && !state.loaded) loadContracts(); });
})();

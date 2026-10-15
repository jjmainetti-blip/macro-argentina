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
    try { const j = await api('/contracts'); Object.assign(state, { user: { email: j.email }, mail: j.mail, contracts: j.contracts, loans: j.loans || [], staff: j.staff || [], staffScale: j.staffScale || null, data: j.data, today: j.today, loaded: true }); setNav(); viewAccount(); }
    catch (err) { if (err.status === 401) { state.user = null; setNav(); viewLogin(); } else app.innerHTML = `<div class="acct-card">No se pudo cargar tu cuenta: ${esc(err.message)}</div>`; }
  }
  function remindersText(c) {
    const r = c.reminders || {};
    if (r.mode === 'off') return 'Sin avisos por mail';
    const when = r.mode === 'monthly' ? `todos los meses (día ${r.day})` : `cuando hay un ajuste${r.daysBefore ? ` (${r.daysBefore} ${r.daysBefore === 1 ? 'día' : 'días'} antes)` : ''}`;
    const who = [r.self !== false ? 'a vos' : null, ...(c.recipients || []).map(x => `${esc(x.email)}${x.status === 'pending' ? ' <i>(falta que confirme)</i>' : x.status === 'off' ? ' <i>(se dio de baja)</i>' : ''}`)].filter(Boolean);
    return `Aviso ${when}${Number.isInteger(r.hour) ? ` a las ${String(r.hour).padStart(2, '0')}:00` : ''}${who.length ? ` · ${who.join(', ')}` : ' · <i>sin destinatarios</i>'}`;
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

  // ── v171 · Créditos ───────────────────────────────────────────────────────────────────────────────────────
  const SYS = { frances: 'Francés (cuota constante)', aleman: 'Alemán (amortización constante)', americano: 'Americano (capital al final)' };
  const uvaFmt = n => n == null ? '—' : new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  const loanFactsTxt = L => `${L.adjust === 'uva' ? 'UVA' : 'Pesos, tasa fija'} · TNA ${String(L.rate).replace('.', ',')}% · ${SYS[L.system].split(' (')[0]} · ${L.term} cuotas`;
  function loanCard(L) {
    const n = L.next, badge = L.adjust === 'uva' ? 'UVA' : '$';
    let strong = '—', p = '', em = '', cls = '';
    if (L.error) { em = L.error; cls = 'down'; }
    else if (L.finished) { strong = 'Cancelado'; p = `Última cuota: ${day(L.lastDue)}`; cls = 'neutral'; }
    else { strong = money(n.quotaArs); p = `Cuota ${n.k} de ${L.term} · vence ${day(n.date)}${n.estimated ? ' · estimada' : ''}`; em = `Saldo ${money(L.balanceArs)}${L.adjust === 'uva' ? ` · ${uvaFmt(L.balanceUnits)} UVA` : ''}`; cls = 'neutral'; }
    const rem = L.reminders?.mode === 'off' ? 'Sin avisos por mail' : `Aviso por mail ${L.reminders?.daysBefore ? `${L.reminders.daysBefore} días antes de` : 'el día de'} cada vencimiento`;
    return `<article class="kpi acct-kpi" data-loan="1" data-id="${esc(L.id)}" tabindex="0" role="button" aria-label="Ver detalle de ${esc(L.name)}">
      <div class="kpi-top"><span>${esc(L.name)}</span><b>${badge}</b></div>
      <strong>${strong}</strong><p>${esc(p)}</p><em class="${cls}">${esc(em)}</em>
      <div class="data-health ${L.reminders?.mode === 'off' ? 'cached' : 'live'}">${rem}</div></article>`;
  }
  function loanTable(L) {
    const uva = L.adjust === 'uva';
    return `<div class="upd-table-wrap acct-loan-table"><table class="upd-table acct-table"><thead><tr><th>#</th><th>Vencimiento</th>${uva ? '<th>Cuota UVA</th><th>Valor UVA</th>' : ''}<th>Cuota $</th><th>Interés $</th><th>Capital $</th><th>Saldo ${uva ? 'UVA' : '$'}</th></tr></thead><tbody>
      ${L.rows.map(r => `<tr class="${r.past ? '' : 'acct-future'}${L.next && r.k === L.next.k ? ' acct-next-row' : ''}"><td>${r.k}</td><td>${esc(day(r.date))}</td>${uva ? `<td>${uvaFmt(r.quota)}</td><td>${r.uva ? `$ ${uvaFmt(r.uva)}${r.estimated ? '<small>estimado</small>' : ''}` : '—'}</td>` : ''}<td><strong>${money(r.quotaArs)}</strong></td><td>${money(r.interestArs)}</td><td>${money(r.capitalArs)}</td><td>${uva ? uvaFmt(r.balance) : money(r.balanceArs)}</td></tr>`).join('')}
    </tbody></table></div>`;
  }
  function openLoan(L) {
    const body = openModal('acct-modal-wide'), n = L.next, uva = L.adjust === 'uva';
    body.innerHTML = `<div class="kpi-modal-head"><div><span class="kpi-modal-agency">${esc(loanFactsTxt(L))}</span><h2>${esc(L.name)}</h2><p>Otorgado el ${esc(day(L.start))} por ${L.principalUnit === 'uva' ? `${uvaFmt(L.principal)} UVA` : money(L.principal)}${uva && L.baseUva ? ` (${uvaFmt(L.principalUnits)} UVA a $ ${uvaFmt(L.baseUva.value)})` : ''}</p></div>
      <strong>${L.error ? '—' : L.finished ? 'Cancelado' : money(n.quotaArs)}<small class="acct-modal-sub">${L.finished || L.error ? '' : `cuota ${n.k} · vence ${esc(day(n.date))}`}</small></strong></div>
      ${L.error ? `<p class="acct-warn">${esc(L.error)}</p>` : `<div class="acct-loan-sum">
        <div><span>Cuotas pagadas</span><b>${L.paidCount} de ${L.term}</b></div>
        <div><span>Saldo de capital</span><b>${money(L.balanceArs)}</b>${uva ? `<small>${uvaFmt(L.balanceUnits)} UVA${L.uvaToday ? ` × $ ${uvaFmt(L.uvaToday.value)}` : ''}</small>` : ''}</div>
        <div><span>Intereses totales</span><b>${uva ? `${uvaFmt(L.totalInterest)} UVA` : money(L.totalInterest)}</b></div>
        <div><span>Última cuota</span><b>${esc(day(L.lastDue))}</b></div></div>
      ${n && uva && n.estimated ? `<p class="acct-note">La UVA del ${esc(day(n.date))} todavía no se publicó: la cuota en pesos está estimada con el último valor (${esc(day(n.uvaDate))}).</p>` : ''}`}
      <p class="acct-rem">${remindersText({ ...L, reminders: { ...L.reminders, mode: L.reminders.mode === 'due' ? 'adjust' : L.reminders.mode } }).replace('cuando hay un ajuste', 'antes de cada vencimiento')}</p>
      ${L.notes ? `<p class="acct-note">Nota: ${esc(L.notes)}</p>` : ''}
      <h3 class="acct-h3b">Cronograma de cuotas</h3>${L.error ? '' : loanTable(L)}
      <p class="acct-note">Cálculo orientativo sin IVA sobre intereses, seguros ni otros cargos del banco.</p>
      <div class="acct-actions"><button class="btn primary" data-act="edit">Editar</button>${L.reminders?.mode !== 'off' && state.mail && !L.error ? '<button class="btn small" data-act="test">Enviarme un mail de prueba</button>' : ''}<button class="btn small danger" data-act="del">Eliminar</button></div>
      <p class="acct-msg" role="status"></p>`;
    const msg = body.querySelector('.acct-msg');
    requestAnimationFrame(() => { const row = body.querySelector('.acct-next-row'), wrap = body.querySelector('.acct-loan-table'); if (row && wrap) wrap.scrollTop = Math.max(0, row.offsetTop - wrap.clientHeight / 2); });
    body.querySelectorAll('[data-act]').forEach(b => b.onclick = async () => {
      const act = b.dataset.act;
      if (act === 'edit') openLoanForm(L);
      if (act === 'test') { b.disabled = true; msg.textContent = 'Enviando…'; try { await api(`/loans/${L.id}/test`, { method: 'POST' }); msg.textContent = `Listo: revisá ${state.user.email}.`; } catch (err) { msg.textContent = err.message; } b.disabled = false; }
      if (act === 'del') { if (!confirm(`¿Eliminar "${L.name}"?`)) return; try { await api(`/loans/${L.id}`, { method: 'DELETE' }); closeModal(); await loadContracts(); } catch (err) { msg.textContent = err.message; } }
    });
  }
  function openLoanForm(L) {
    const box = openModal('acct-modal-wide'), r = L?.reminders || { mode: 'due', daysBefore: 3, self: true };
    const num = v => v == null ? '' : String(v).replace('.', ',');
    box.innerHTML = `<form class="acct-card acct-form" id="loanForm" novalidate>
      <h3>${L ? 'Editar crédito' : 'Nuevo crédito'}</h3>
      <div class="acct-fields">
        <label class="wide">Nombre<input name="name" maxlength="80" placeholder="Ej.: Hipotecario Banco Nación" value="${esc(L?.name || '')}"></label>
        <label>Tipo de ajuste<select name="adjust"><option value="uva"${(L?.adjust || 'uva') === 'uva' ? ' selected' : ''}>UVA (capital ajustable por inflación)</option><option value="fijo"${L?.adjust === 'fijo' ? ' selected' : ''}>Tradicional en pesos (tasa fija)</option></select></label>
        <label>Monto del crédito<input name="principal" inputmode="decimal" placeholder="50.000.000" value="${esc(num(L?.principal))}"></label>
        <label data-uva>Monto expresado en<select name="principalUnit"><option value="ars"${(L?.principalUnit || 'ars') === 'ars' ? ' selected' : ''}>Pesos (al valor UVA del otorgamiento)</option><option value="uva"${L?.principalUnit === 'uva' ? ' selected' : ''}>UVAs</option></select></label>
        <label>Fecha de otorgamiento<input name="start" type="date" value="${esc(L?.start || '')}"></label>
        <label>Primer vencimiento (opcional)<input name="firstDue" type="date" value="${esc(L?.firstDue || '')}"><small>Si lo dejás vacío, un mes después del otorgamiento.</small></label>
        <label>Plazo (meses)<input name="term" inputmode="numeric" placeholder="240" value="${esc(L?.term ?? '')}"></label>
        <label>Tasa nominal anual (TNA, %)<input name="rate" inputmode="decimal" placeholder="4,5" value="${esc(num(L?.rate))}"></label>
        <label>Sistema de amortización<select name="system">${Object.entries(SYS).map(([k, v]) => `<option value="${k}"${(L?.system || 'frances') === k ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
      </div>
      <fieldset class="acct-fs"><legend>Avisos por mail</legend><div class="acct-fields">
        <label>Cuándo<select name="mode"><option value="due"${r.mode === 'due' ? ' selected' : ''}>Antes de cada vencimiento</option><option value="off"${r.mode === 'off' ? ' selected' : ''}>No enviar</option></select></label>
        <label data-due>Anticipación<select name="daysBefore">${[0, 1, 2, 3, 5, 7, 10, 15].map(k => `<option value="${k}"${(r.daysBefore || 0) === k ? ' selected' : ''}>${k ? `${k} ${k === 1 ? 'día' : 'días'} antes` : 'El día del vencimiento'}</option>`).join('')}</select></label>
        <label data-due>Hora del aviso<select name="hour">${Array.from({ length: 24 }, (_, h) => `<option value="${h}"${(r.hour ?? 9) === h ? ' selected' : ''}>${String(h).padStart(2, '0')}:00</option>`).join('')}</select></label>
        <label class="acct-check" data-due><input type="checkbox" name="self"${r.self !== false ? ' checked' : ''}> Enviarme a mí (${esc(state.user.email)})</label>
        <label class="wide" data-due>Otras direcciones (hasta 3, separadas por coma)<input name="others" value="${esc((L?.recipients || []).map(x => x.email).join(', '))}"><small>Cada dirección nueva recibe un mail para confirmar antes de empezar a recibir avisos.</small></label>
      </div></fieldset>
      <label class="wide">Notas (opcional, se incluyen en los mails)<input name="notes" maxlength="300" value="${esc(L?.notes || '')}"></label>
      <div class="acct-preview" id="loanPreview"><p class="acct-note">Completá monto, fecha, plazo y tasa para ver el cronograma.</p></div>
      <div class="acct-actions"><button class="btn primary" type="submit">${L ? 'Guardar cambios' : 'Guardar crédito'}</button><button class="btn ghost-dark" type="button" id="loanCancel">Cancelar</button></div>
      <p class="acct-msg" id="loanFormMsg" role="status"></p></form>`;
    const f = document.getElementById('loanForm');
    const sync = () => { f.querySelectorAll('[data-uva]').forEach(el => el.hidden = f.adjust.value !== 'uva'); f.querySelectorAll('[data-due]').forEach(el => el.hidden = f.mode.value === 'off'); };
    const read = () => ({ name: f.name.value, adjust: f.adjust.value, principal: f.principal.value, principalUnit: f.principalUnit.value, start: f.start.value, firstDue: f.firstDue.value, term: Number(f.term.value), rate: f.rate.value, system: f.system.value, notes: f.notes.value, reminders: { mode: f.mode.value, daysBefore: Number(f.daysBefore.value), hour: Number(f.hour.value), self: f.self.checked, others: f.others.value } });
    let t = null, seq = 0;
    const preview = () => { clearTimeout(t); t = setTimeout(async () => {
      const pv = document.getElementById('loanPreview'); if (!pv || !f.isConnected) return;
      const b = read(), my = ++seq; if (!b.principal || !b.start || !b.term || b.rate === '') return;
      try { const j = await api('/loans/preview', { method: 'POST', body: b }); if (my !== seq || !pv.isConnected) return; const P = j.loan;
        if (P.error) { pv.innerHTML = `<p class="acct-warn">${esc(P.error)}</p>`; return; }
        const first = P.rows[0];
        pv.innerHTML = `<div class="acct-preview-head"><div><span>Primera cuota · ${esc(day(first.date))}</span><b>${money(first.quotaArs)}</b><small>${P.adjust === 'uva' ? `${uvaFmt(first.quota)} UVA${first.estimated ? ' · UVA estimada' : ''}` : 'capital + interés'}</small></div>${P.next && P.next.k !== 1 ? `<div><span>Próxima cuota · ${esc(day(P.next.date))}</span><b>${money(P.next.quotaArs)}</b><small>cuota ${P.next.k} de ${P.term}</small></div>` : ''}<div><span>Saldo hoy</span><b>${money(P.balanceArs)}</b><small>${P.paidCount} cuotas pagadas</small></div></div>${loanTable(P)}`;
      } catch (err) { if (my === seq && pv.isConnected) pv.innerHTML = `<p class="acct-warn">${esc(err.message)}</p>`; }
    }, 350); };
    f.addEventListener('input', () => { sync(); preview(); }); f.addEventListener('change', () => { sync(); preview(); });
    sync(); preview();
    document.getElementById('loanCancel').onclick = () => { if (L) openLoan(L); else closeModal(); };
    f.addEventListener('submit', async e => {
      e.preventDefault(); const m = document.getElementById('loanFormMsg'), b = f.querySelector('[type=submit]'); b.disabled = true; m.textContent = 'Guardando…';
      try { await api(L ? `/loans/${L.id}` : '/loans', { method: L ? 'PUT' : 'POST', body: read() }); closeModal(); await loadContracts(); }
      catch (err) { m.textContent = err.message; b.disabled = false; }
    });
  }

  // ── v175 · Personal de casas particulares ─────────────────────────────────────────────────────────────────
  const WD = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const CATS = { supervisor: 'Supervisor/a', especificas: 'Tareas específicas (cocina, etc.)', caseros: 'Caseros/as', cuidado: 'Asistencia y cuidado de personas', generales: 'Tareas generales (limpieza, etc.)' };
  const FREQS = { jornada: 'Por jornada', semanal: 'Semanal', quincenal: 'Quincenal', mensual: 'Mensual' };
  const staffFreqTxt = S => S.freq === 'semanal' ? `Semanal · ${WD[S.payDay]}` : S.freq === 'mensual' ? `Mensual · día ${S.payDay}` : S.freq === 'jornada' ? `Por jornada · ${S.workDays.map(d => WD[d].slice(0, 3)).join(', ')}` : 'Quincenal · 15 y fin de mes';
  const pctTxt = n => `${n > 0 ? '+' : n < 0 ? '−' : ''}${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }).format(Math.abs(n))}%`;
  function staffCard(S) {
    const n = S.next, ok = S.gapPct == null ? null : !S.below;
    return `<article class="kpi acct-kpi" data-staff="1" data-id="${esc(S.id)}" tabindex="0" role="button" aria-label="Ver detalle de ${esc(S.name)}">
      <div class="kpi-top"><span>${esc(S.name)}</span><b>${esc(FREQS[S.freq])}</b></div>
      <strong>${n ? money(n.expected) : '—'}</strong>
      <p>${n ? `Próximo pago · ${esc(day(n.date))}${n.carryIn > 0 ? ` · incluye ${money(n.carryIn)} anterior` : n.carryIn < 0 ? ` · descuenta ${money(-n.carryIn)} pagados de más` : ''}` : 'Sin pagos próximos'}</p>
      <em class="${ok === false ? 'down' : ok ? '' : 'neutral'}">${S.hourly ? `${money(S.hourly)}/h · oficial ${money(S.official?.hour)}/h${S.gapPct != null ? ` (${pctTxt(S.gapPct)})` : ''}` : ''}</em>
      <div class="data-health ${S.pendingCount ? 'cached' : 'live'}">${S.pendingCount ? `${S.pendingCount} ${S.pendingCount === 1 ? 'pago sin registrar' : 'pagos sin registrar'}` : 'Pagos al día'}</div></article>`;
  }
  function openStaff(S) {
    const body = openModal('acct-modal-wide'), o = S.official, nx = S.nextOfficial;
    const rows = [...S.rows].reverse();
    body.innerHTML = `<div class="kpi-modal-head"><div><span class="kpi-modal-agency">${esc(CATS[S.category])}${S.category === 'caseros' ? '' : ` · ${S.retiro} retiro`}${S.zona ? ' · zona desfavorable' : ''}</span><h2>${esc(S.name)}</h2><p>${esc(staffFreqTxt(S))} · ${money(S.current.amount)} por ${S.current.hours} h</p></div>
      <strong>${S.next ? money(S.next.expected) : '—'}<small class="acct-modal-sub">${S.next ? `próximo pago · ${esc(day(S.next.date))}` : ''}</small></strong></div>
      <div class="acct-loan-sum">
        <div><span>Valor por hora</span><b>${money(S.hourly)}</b></div>
        <div><span>Mínimo oficial por hora</span><b>${money(o?.hour)}</b><small>escala de ${esc(day(o?.from))}</small></div>
        <div><span>Diferencia</span><b class="${S.below ? 'acct-bad' : 'acct-good'}">${S.gapPct == null ? '—' : pctTxt(S.gapPct)}</b><small>${S.below ? 'por debajo del mínimo' : 'por encima del mínimo'}</small></div>
        <div><span>Próxima escala</span><b>${nx ? money(nx.hour) : '—'}</b><small>${nx ? `desde ${esc(day(nx.from))} (+${String(nx.pct).replace('.', ',')}%)` : 'sin aumentos acordados'}</small></div></div>
      ${S.below ? `<p class="acct-warn">Para llegar al mínimo oficial, el pago de ${S.current.hours} h debería ser de al menos <b>${money(o.hour * S.current.hours)}</b>.</p>` : ''}
      ${o?.month ? `<p class="acct-note">Mínimo mensual oficial de la categoría (jornada completa): ${money(o.month)}. Escala de la Comisión Nacional de Trabajo en Casas Particulares${S.zona ? ', con el adicional por zona desfavorable' : ''}; no incluye antigüedad (1% por año).</p>` : ''}
      <p class="acct-rem">${remindersText({ ...S, reminders: { ...S.reminders, mode: S.reminders.mode === 'due' ? 'adjust' : S.reminders.mode } }).replace('cuando hay un ajuste', 'antes de cada pago')}${S.reminders.scale !== false ? ' · aviso cuando cambia la escala oficial' : ''}</p>
      <div id="sacBox"></div>
      <h3 class="acct-h3b">Pagos</h3>
      <div class="upd-table-wrap acct-loan-table"><table class="upd-table acct-table acct-pay-table"><thead><tr><th>Fecha</th><th>A pagar</th><th>Pagado</th><th>Diferencia</th><th></th></tr></thead><tbody>
      ${rows.map(r => `<tr class="${r.past || r.today ? '' : 'acct-future'}${S.next && r.date === S.next.date ? ' acct-next-row' : ''}" data-date="${r.date}"><td>${esc(day(r.date))}${r.carryIn ? `<small>${r.carryIn > 0 ? '+' : '−'}${money(Math.abs(r.carryIn))} anterior</small>` : ''}</td><td><strong>${money(r.expected)}</strong></td>
        <td>${r.paid != null ? `${money(r.paid)}<small>${r.carry ? 'diferencia pasada al siguiente' : r.diff ? 'diferencia no se arrastra' : ''}${r.note ? `${r.carry || r.diff ? ' · ' : ''}${esc(r.note)}` : ''}</small>` : (r.past || r.today ? (r.date >= (S.trackFrom || S.start) ? '<i class="acct-bad">sin registrar</i>' : '<i>no registrado</i>') : '—')}</td>
        <td>${r.paid != null ? (r.diff ? money(r.diff) : '—') : ''}</td>
        <td>${r.paid != null ? '<button class="link-btn" data-unpay>Deshacer</button>' : (r.past || r.today || r === S.next || (S.next && r.date === S.next.date)) ? '<button class="btn small" data-pay>Registrar</button>' : ''}</td></tr>`).join('')}
      </tbody></table></div>
      <div class="acct-payform" id="payForm" hidden></div>
      ${S.notes ? `<p class="acct-note">Nota: ${esc(S.notes)}</p>` : ''}
      <div class="acct-actions"><button class="btn primary" data-act="edit">Editar</button><button class="btn small" data-act="import">Importar pagos (CSV)</button>${S.reminders?.mode !== 'off' && state.mail ? '<button class="btn small" data-act="test">Enviarme un mail de prueba</button>' : ''}<button class="btn small danger" data-act="del">Eliminar</button></div>
      <div class="acct-payform" id="importForm" hidden></div>
      <p class="acct-msg" role="status"></p>`;
    const msg = body.querySelector('.acct-msg'), pf = body.querySelector('#payForm');
    renderSac(S, body.querySelector('#sacBox'), 'current');
    const refresh = async j => { const i = state.staff.findIndex(x => x.id === S.id); if (j?.staff && i >= 0) state.staff[i] = j.staff; openStaff(state.staff[i]); viewAccountKeepModal(); };
    body.querySelectorAll('[data-pay]').forEach(b => b.onclick = () => {
      const tr = b.closest('tr'), r = S.rows.find(x => x.date === tr.dataset.date);
      pf.hidden = false;
      pf.innerHTML = `<h4>Registrar el pago del ${esc(day(r.date))}</h4><div class="acct-fields"><label>Monto pagado<input name="paid" inputmode="decimal" value="${String(r.expected).replace('.', ',')}"></label>
        <label class="acct-check"><input type="checkbox" name="carry" checked> Sumar (o descontar) la diferencia en el pago siguiente</label></div>
        <p class="acct-note" id="payDiff"></p><div class="acct-actions"><button class="btn primary" type="button" id="paySave">Guardar pago</button><button class="btn ghost-dark" type="button" id="payCancel">Cancelar</button></div>`;
      const inp = pf.querySelector('[name=paid]'), dif = pf.querySelector('#payDiff');
      const upd = () => { const v = Number(inp.value.replace(/\./g, '').replace(',', '.')), d = r.expected - v; dif.textContent = Number.isFinite(v) && Math.abs(d) >= 0.01 ? (d > 0 ? `Quedan ${money(d)} sin pagar.` : `Se pagaron ${money(-d)} de más.`) : ''; };
      inp.oninput = upd; upd(); inp.focus(); inp.select(); pf.scrollIntoView({ block: 'nearest' });
      pf.querySelector('#payCancel').onclick = () => { pf.hidden = true; };
      pf.querySelector('#paySave').onclick = async () => { try { refresh(await api(`/staff/${S.id}/pay`, { method: 'POST', body: { date: r.date, paid: inp.value, carry: pf.querySelector('[name=carry]').checked } })); } catch (err) { dif.textContent = err.message; } };
    });
    body.querySelectorAll('[data-unpay]').forEach(b => b.onclick = async () => { const d = b.closest('tr').dataset.date; try { refresh(await api(`/staff/${S.id}/pay`, { method: 'POST', body: { date: d, remove: true } })); } catch (err) { msg.textContent = err.message; } });
    requestAnimationFrame(() => { const row = body.querySelector('.acct-next-row'), wrap = body.querySelector('.acct-loan-table'); if (row && wrap) wrap.scrollTop = Math.max(0, row.offsetTop - wrap.clientHeight / 2); });
    body.querySelectorAll('[data-act]').forEach(b => b.onclick = async () => {
      const act = b.dataset.act;
      if (act === 'edit') openStaffForm(S);
      if (act === 'import') openImport(S, body);
      if (act === 'test') { b.disabled = true; msg.textContent = 'Enviando…'; try { await api(`/staff/${S.id}/test`, { method: 'POST' }); msg.textContent = `Listo: revisá ${state.user.email}.`; } catch (err) { msg.textContent = err.message; } b.disabled = false; }
      if (act === 'del') { if (!confirm(`¿Eliminar "${S.name}" y su registro de pagos?`)) return; try { await api(`/staff/${S.id}`, { method: 'DELETE' }); closeModal(); await loadContracts(); } catch (err) { msg.textContent = err.message; } }
    });
  }
  // Repinta las tarjetas sin cerrar la ventana abierta.
  function viewAccountKeepModal() { const grid = app.querySelectorAll('.acct-kpis')[2]; if (!grid) return; grid.querySelectorAll('.acct-kpi[data-staff]').forEach(card => { const S = state.staff.find(x => x.id === card.dataset.id); if (S) { const t = document.createElement('div'); t.innerHTML = staffCard(S); const n = t.firstElementChild; card.replaceWith(n); n.addEventListener('click', () => openStaff(state.staff.find(x => x.id === n.dataset.id))); } }); }

  // v176 · Importar pagos desde un CSV: columnas fecha (o fecha_pago), monto y, opcionales, semana, arrastrar_diferencia y nota.
  function parseCsv(text) {
    const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim()); if (!lines.length) return [];
    const d = (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length ? ';' : ',';
    const split = l => { const out = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === d && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out.map(x => x.trim()); };
    const H = split(lines[0]).map(h => h.toLowerCase());
    const col = re => H.findIndex(h => re.test(h));
    let cDate = col(/fecha/), cAmt = col(/monto|importe|pagado/), cWeek = col(/semana/), cCarry = col(/arrastr/), cNote = col(/nota|detalle|obs/);
    const hasHeader = cDate >= 0 || cAmt >= 0; if (!hasHeader) { cDate = 0; cAmt = 1; }
    const toIso = v => { v = String(v || '').trim(); let m = v.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`; m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/); if (m) { const y = m[3].length === 2 ? `20${m[3]}` : m[3]; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; } return null; };
    const toNum = v => { v = String(v || '').replace(/[$\s]/g, ''); if (/,\d{1,2}$/.test(v)) v = v.replace(/\./g, '').replace(',', '.'); else v = v.replace(/[.,](?=\d{3}(\D|$))/g, ''); return Number(v); };
    return lines.slice(hasHeader ? 1 : 0).map(l => { const c = split(l); return { date: toIso(c[cDate]), week: cWeek >= 0 ? toIso(c[cWeek]) : null, amount: toNum(c[cAmt]), carry: cCarry >= 0 && /^(s[ií]|si|x|1|true)$/i.test(c[cCarry] || ''), note: cNote >= 0 ? c[cNote] : '' }; }).filter(r => (r.date || r.week) && Number.isFinite(r.amount));
  }
  function openImport(S, body) {
    const box = body.querySelector('#importForm'); box.hidden = false;
    box.innerHTML = `<h4>Importar pagos de ${esc(S.name)}</h4><p class="acct-note">Archivo CSV con columnas <b>fecha</b> (o fecha_pago) y <b>monto</b>; opcionales: <b>semana</b>, <b>arrastrar_diferencia</b> (sí/no) y <b>nota</b>. Los pagos de un mismo período se suman.</p>
      <input type="file" accept=".csv,text/csv,text/plain" id="impFile">
      <div class="acct-fields"><label class="acct-check"><input type="checkbox" id="impRates" checked> Armar el historial de montos con los del archivo</label>
      <label class="acct-check"><input type="checkbox" id="impStart" checked> Adelantar el inicio al primer pago del archivo</label>
      <label class="acct-check"><input type="checkbox" id="impReplace" checked> Reemplazar pagos ya registrados en esas fechas</label></div>
      <p class="acct-note" id="impInfo"></p><div class="acct-actions"><button class="btn primary" type="button" id="impGo" disabled>Importar</button><button class="btn ghost-dark" type="button" id="impCancel">Cancelar</button></div>`;
    let rows = [];
    box.querySelector('#impFile').onchange = async e => { const f = e.target.files[0]; if (!f) return; rows = parseCsv(await f.text()); const tot = rows.reduce((a, r) => a + r.amount, 0), ds = rows.map(r => r.date || r.week).sort(); box.querySelector('#impInfo').textContent = rows.length ? `${rows.length} pagos entre ${day(ds[0])} y ${day(ds.at(-1))} · total ${money(tot)}.` : 'No se encontraron filas con fecha y monto.'; box.querySelector('#impGo').disabled = !rows.length; };
    box.querySelector('#impCancel').onclick = () => { box.hidden = true; };
    box.querySelector('#impGo').onclick = async () => {
      const b = box.querySelector('#impGo'), info = box.querySelector('#impInfo'); b.disabled = true; info.textContent = 'Importando…';
      try { const j = await api(`/staff/${S.id}/import`, { method: 'POST', body: { rows, options: { rates: box.querySelector('#impRates').checked, moveStart: box.querySelector('#impStart').checked, replace: box.querySelector('#impReplace').checked } } });
        const i = state.staff.findIndex(x => x.id === S.id); if (i >= 0) state.staff[i] = j.staff; openStaff(state.staff[i]); viewAccountKeepModal();
        const m = document.querySelector('.acct-modal .acct-msg'); if (m) m.textContent = `Listo: ${j.imported} pagos importados${j.kept ? `, ${j.kept} ya registrados se mantuvieron` : ''}${j.unmatched ? `, ${j.unmatched} filas no coincidieron con ninguna fecha de pago` : ''}.`;
      } catch (err) { info.textContent = err.message; b.disabled = false; }
    };
  }

  // v177 · Medio aguinaldo (SAC).
  function renderSac(S, box, which) {
    const A = S.sac?.[which]; if (!A || !box) return;
    const MESL = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    const months = Object.entries(A.months);
    box.innerHTML = `<div class="acct-sac"><div class="acct-sac-head"><h3>Medio aguinaldo</h3><div class="segmented compact"><button type="button" data-sem="current" class="${which === 'current' ? 'active' : ''}">Semestre actual</button><button type="button" data-sem="previous" class="${which === 'previous' ? 'active' : ''}">Anterior</button></div></div>
      <div class="acct-loan-sum"><div><span>${esc(A.label)}</span><b>${money(A.amount)}</b><small>${A.projected ? 'estimado al cierre del semestre' : 'devengado'}${A.full ? '' : ` · proporcional ${A.workedDays}/${A.semDays} días`}</small></div>
        <div><span>Mayor mes</span><b>${money(A.best?.amount)}</b><small>${A.best ? esc(MESL[Number(A.best.ym.slice(5)) - 1] + ' ' + A.best.ym.slice(0, 4)) : ''}</small></div>
        ${A.toDate != null ? `<div><span>Proporcional a hoy</span><b>${money(A.toDate)}</b><small>si la relación terminara hoy</small></div>` : ''}
        <div><span>Vence</span><b>${esc(day(A.due))}</b><small>${A.paid ? `pagado: ${money(A.paid.paid)}` : 'sin registrar'}</small></div></div>
      <div class="acct-sac-months">${months.map(([k, M]) => `<span class="${A.best?.ym === k ? 'best' : ''}${M.projected ? ' proj' : ''}"><b>${MESL[Number(k.slice(5)) - 1]}</b>${money(M.accrued)}<small>${M.periods} ${M.periods === 1 ? 'pago' : 'pagos'}${M.projected ? ' · estimado' : ''}</small></span>`).join('')}</div>
      <p class="acct-note">50% de la mayor remuneración mensual devengada del semestre (Ley 26.844); si no trabajó el semestre completo, proporcional a los días. Se calcula con los montos de cada pago (sin diferencias arrastradas ni pagos extra); no incluye antigüedad.</p>
      <div class="acct-actions">${A.paid ? `<button class="link-btn" data-sacundo>Deshacer pago registrado</button>` : `<input class="acct-sac-input" inputmode="decimal" value="${String(A.amount).replace('.', ',')}" aria-label="Monto pagado"><button class="btn small" data-sacpay>Registrar pago del aguinaldo</button>`}</div></div>`;
    box.querySelectorAll('[data-sem]').forEach(b => b.onclick = () => renderSac(S, box, b.dataset.sem));
    const upd = j => { const i = state.staff.findIndex(x => x.id === S.id); if (i >= 0 && j?.staff) { state.staff[i] = j.staff; renderSac(j.staff, box, which); } };
    box.querySelector('[data-sacpay]')?.addEventListener('click', async () => { try { upd(await api(`/staff/${S.id}/sac`, { method: 'POST', body: { key: A.key, paid: box.querySelector('.acct-sac-input').value } })); } catch (e) { alert(e.message); } });
    box.querySelector('[data-sacundo]')?.addEventListener('click', async () => { try { upd(await api(`/staff/${S.id}/sac`, { method: 'POST', body: { key: A.key, remove: true } })); } catch (e) { alert(e.message); } });
  }
  function openStaffForm(S) {
    const box = openModal('acct-modal-wide'), r = S?.reminders || { mode: 'due', daysBefore: 1, self: true, scale: true };
    const num = v => v == null ? '' : String(v).replace('.', ',');
    box.innerHTML = `<form class="acct-card acct-form" id="staffForm" novalidate>
      <h3>${S ? 'Editar' : 'Agregar persona'}</h3>
      <div class="acct-fields">
        <label class="wide">Nombre<input name="name" maxlength="80" placeholder="Ej.: María (limpieza)" value="${esc(S?.name || '')}"></label>
        <label>Categoría (escala oficial)<select name="category">${Object.entries(CATS).map(([k, v]) => `<option value="${k}"${(S?.category || 'generales') === k ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
        <label data-ret>Modalidad<select name="retiro"><option value="con"${(S?.retiro || 'con') === 'con' ? ' selected' : ''}>Con retiro (no vive en la casa)</option><option value="sin"${S?.retiro === 'sin' ? ' selected' : ''}>Sin retiro (vive en la casa)</option></select></label>
        <label class="acct-check"><input type="checkbox" name="zona"${S?.zona ? ' checked' : ''}> Zona desfavorable (Patagonia)</label>
        <label>Frecuencia de pago<select name="freq">${Object.entries(FREQS).map(([k, v]) => `<option value="${k}"${(S?.freq || 'semanal') === k ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
        <label data-f="semanal">Día de pago<select name="payDayW">${WD.map((d, i) => `<option value="${i}"${(S?.freq === 'semanal' ? S.payDay : 5) === i ? ' selected' : ''}>${d[0].toUpperCase() + d.slice(1)}</option>`).join('')}</select></label>
        <label data-f="mensual">Día del mes<select name="payDayM">${Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}"${(S?.freq === 'mensual' ? S.payDay : 1) === i + 1 ? ' selected' : ''}>${i + 1}</option>`).join('')}</select></label>
        <div class="wide acct-days" data-f="jornada"><span>Días que trabaja (se paga cada jornada)</span>${WD.map((d, i) => `<label class="acct-check"><input type="checkbox" name="wd" value="${i}"${(S?.workDays || [1, 3, 5]).includes(i) ? ' checked' : ''}> ${d.slice(0, 3)}</label>`).join('')}</div>
        <label>Monto por <span id="perLbl">período</span> ($)<input name="amount" inputmode="decimal" placeholder="100.000" value="${esc(num(S?.amount))}"></label>
        <label>Horas por <span id="perLbl2">período</span><input name="hours" inputmode="decimal" placeholder="12" value="${esc(num(S?.hours))}"></label>
        <label>Pagos desde<input name="start" type="date" value="${esc(S?.start || state.today || '')}"></label>
        ${S ? `<label>Si cambiás monto u horas, rige desde<input name="effective" type="date" value="${esc(state.today || '')}"><small>Los pagos anteriores quedan como estaban.</small></label>` : ''}
      </div>
      <div class="acct-preview" id="staffPreview"></div>
      <fieldset class="acct-fs"><legend>Avisos por mail</legend><div class="acct-fields">
        <label>Antes de cada pago<select name="mode"><option value="due"${r.mode === 'due' ? ' selected' : ''}>Avisarme</option><option value="off"${r.mode === 'off' ? ' selected' : ''}>No avisar</option></select></label>
        <label data-due>Anticipación<select name="daysBefore">${[0, 1, 2, 3, 5, 7].map(k => `<option value="${k}"${(r.daysBefore || 0) === k ? ' selected' : ''}>${k ? `${k} ${k === 1 ? 'día' : 'días'} antes` : 'El mismo día'}</option>`).join('')}</select></label>
        <label data-due>Hora del aviso<select name="hour">${Array.from({ length: 24 }, (_, h) => `<option value="${h}"${(r.hour ?? 9) === h ? ' selected' : ''}>${String(h).padStart(2, '0')}:00</option>`).join('')}</select></label>
        <label class="acct-check" data-due><input type="checkbox" name="skipPaid"${r.skipPaid !== false ? ' checked' : ''}> No avisar si ese pago ya está registrado</label>
        <label class="acct-check"><input type="checkbox" name="scale"${r.scale !== false ? ' checked' : ''}> Avisarme cuando cambie la escala oficial</label>
        <label class="acct-check"><input type="checkbox" name="self"${r.self !== false ? ' checked' : ''}> Enviarme a mí (${esc(state.user.email)})</label>
        <label class="wide">Otras direcciones (hasta 3, separadas por coma)<input name="others" value="${esc((S?.recipients || []).map(x => x.email).join(', '))}"><small>Cada dirección nueva recibe un mail para confirmar antes de empezar a recibir avisos.</small></label>
      </div></fieldset>
      <label class="wide">Notas (opcional)<input name="notes" maxlength="300" value="${esc(S?.notes || '')}"></label>
      <div class="acct-actions"><button class="btn primary" type="submit">${S ? 'Guardar cambios' : 'Guardar'}</button><button class="btn ghost-dark" type="button" id="staffCancel">Cancelar</button></div>
      <p class="acct-msg" id="staffFormMsg" role="status"></p></form>`;
    const f = document.getElementById('staffForm');
    const PER = { jornada: 'jornada', semanal: 'semana', quincenal: 'quincena', mensual: 'mes' };
    const sync = () => { f.querySelectorAll('[data-f]').forEach(el => el.hidden = el.dataset.f !== f.freq.value); f.querySelector('[data-ret]').hidden = f.category.value === 'caseros'; f.querySelectorAll('[data-due]').forEach(el => el.hidden = f.mode.value === 'off'); document.getElementById('perLbl').textContent = PER[f.freq.value]; document.getElementById('perLbl2').textContent = PER[f.freq.value]; };
    const read = () => ({ name: f.name.value, category: f.category.value, retiro: f.retiro.value, zona: f.zona.checked, freq: f.freq.value, payDay: f.freq.value === 'semanal' ? Number(f.payDayW.value) : Number(f.payDayM.value), workDays: [...f.querySelectorAll('[name=wd]:checked')].map(x => Number(x.value)), amount: f.amount.value, hours: f.hours.value, start: f.start.value, effective: f.effective?.value || '', notes: f.notes.value,
      reminders: { mode: f.mode.value, daysBefore: Number(f.daysBefore.value), hour: Number(f.hour.value), skipPaid: f.skipPaid.checked, scale: f.scale.checked, self: f.self.checked, others: f.others.value } });
    let t = null, seq = 0;
    const preview = () => { clearTimeout(t); t = setTimeout(async () => {
      const pv = document.getElementById('staffPreview'); if (!pv || !f.isConnected) return;
      const b = read(), my = ++seq; if (!b.amount || !b.hours || !b.start) { pv.innerHTML = ''; return; }
      try { const j = await api('/staff/preview', { method: 'POST', body: b }); if (my !== seq || !pv.isConnected) return; const P = j.staff;
        pv.innerHTML = `<div class="acct-preview-head"><div><span>Valor por hora</span><b>${money(P.hourly)}</b><small>${money(P.current.amount)} / ${P.current.hours} h</small></div><div><span>Mínimo oficial por hora</span><b>${money(P.official.hour)}</b><small>escala desde ${esc(day(P.official.from))}</small></div><div><span>Diferencia</span><b class="${P.below ? 'acct-bad' : 'acct-good'}">${pctTxt(P.gapPct)}</b><small>${P.below ? `mínimo: ${money(P.official.hour * P.current.hours)} por ${PER[P.freq]}` : 'por encima del mínimo'}</small></div>${P.next ? `<div><span>Próximo pago</span><b>${money(P.next.expected)}</b><small>${esc(day(P.next.date))}</small></div>` : ''}</div>`;
      } catch (err) { if (my === seq && pv.isConnected) pv.innerHTML = `<p class="acct-warn">${esc(err.message)}</p>`; }
    }, 300); };
    f.addEventListener('input', () => { sync(); preview(); }); f.addEventListener('change', () => { sync(); preview(); });
    sync(); preview();
    document.getElementById('staffCancel').onclick = () => { if (S) openStaff(S); else closeModal(); };
    f.addEventListener('submit', async e => {
      e.preventDefault(); const m = document.getElementById('staffFormMsg'), b = f.querySelector('[type=submit]'); b.disabled = true; m.textContent = 'Guardando…';
      try { await api(S ? `/staff/${S.id}` : '/staff', { method: S ? 'PUT' : 'POST', body: read() }); closeModal(); await loadContracts(); }
      catch (err) { m.textContent = err.message; b.disabled = false; }
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
      <div class="acct-section-head"><h3>Tus créditos</h3><span class="acct-note">Hipotecarios, prendarios o personales, en UVA o en pesos.</span></div>
      <div class="kpi-grid acct-kpis">${(state.loans || []).map(loanCard).join('')}
        <button type="button" class="kpi acct-kpi-add" id="loanAdd"><span>+</span><b>Agregar crédito</b><small>Monto, tasa, plazo, sistema de amortización y ajuste</small></button></div>
      <div class="acct-section-head"><h3>Personal de casas particulares</h3><span class="acct-note">Pagos, registro de lo abonado y comparación con la escala oficial.</span></div>
      <div class="kpi-grid acct-kpis">${(state.staff || []).map(staffCard).join('')}
        <button type="button" class="kpi acct-kpi-add" id="staffAdd"><span>+</span><b>Agregar persona</b><small>Monto, frecuencia, día de pago y horas</small></button></div>
      <p class="acct-data">${esc(dataNote)}</p>
      <div class="acct-card acct-prefs-bar"><div><h3>Resúmenes, alertas y seguimiento</h3><p id="acctPrefsSummary" class="acct-note">Cargando…</p></div><button class="btn primary" id="acctPrefsBtn" type="button">Configurar resúmenes y alertas</button></div>
      <details class="acct-danger"><summary>Eliminar mi cuenta</summary><p>Se borran tus contratos y dejás de recibir avisos. No se puede deshacer.</p><button class="btn small danger" id="acctDelete">Eliminar mi cuenta</button></details>`;
    document.getElementById('acctAdd').onclick = () => openForm(null);
    document.getElementById('acctPrefsBtn').onclick = () => openPrefs();
    loadPrefs();
    document.getElementById('acctLogout').onclick = async () => { try { await api('/logout', { method: 'POST' }); } catch { } state.user = null; setNav(); viewLogin(); };
    document.getElementById('acctDelete').onclick = async () => { if (!confirm('¿Eliminar tu cuenta y todos tus contratos?')) return; try { await api('', { method: 'DELETE' }); } catch { } state.user = null; setNav(); viewLogin('Tu cuenta fue eliminada.'); };
    document.getElementById('loanAdd').onclick = () => openLoanForm(null);
    document.getElementById('staffAdd').onclick = () => openStaffForm(null);
    app.querySelectorAll('.acct-kpi[data-staff]').forEach(card => {
      const S = state.staff.find(x => x.id === card.dataset.id);
      card.addEventListener('click', () => openStaff(S));
      card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openStaff(S); } });
    });
    app.querySelectorAll('.acct-kpi[data-loan]').forEach(card => {
      const L = state.loans.find(x => x.id === card.dataset.id);
      card.addEventListener('click', () => openLoan(L));
      card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openLoan(L); } });
    });
    app.querySelectorAll('.acct-kpi:not([data-loan]):not([data-staff])').forEach(card => {
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
          <label data-hide-mode="off">Hora del aviso<select name="hour">${Array.from({ length: 24 }, (_, h) => `<option value="${h}"${(r.hour ?? 9) === h ? ' selected' : ''}>${String(h).padStart(2, '0')}:00</option>`).join('')}</select></label>
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
      reminders: { mode: f.mode.value, day: Number(f.day.value), daysBefore: Number(f.daysBefore.value), hour: Number(f.hour.value), self: f.self.checked, others: f.others.value },
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

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
      </ul><p class="acct-soon">Próximamente: resúmenes diarios y semanales, alertas de dólar, riesgo país y Merval, y seguimiento de acciones, bonos y ADRs.</p></div></div>`;
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
      <p>${confirm ? `<b>${esc(info.owner)}</b> te agregó como destinatario de los avisos de actualización del contrato <b>${esc(info.contract)}</b>.` : `Vas a dejar de recibir los avisos del contrato <b>${esc(info.contract)}</b>.`}</p>
      <div class="acct-actions">${confirm ? '<button class="btn primary" data-a="confirm">Sí, quiero recibirlos</button><button class="btn ghost-dark" data-a="unsubscribe">No, gracias</button>' : '<button class="btn primary" data-a="unsubscribe">Darme de baja</button>'}</div>
      <p class="acct-msg" id="acctMsg" role="status"></p></div>`;
    app.querySelectorAll('[data-a]').forEach(b => b.onclick = async () => {
      app.querySelectorAll('[data-a]').forEach(x => x.disabled = true);
      try { const j = await api('/recipient', { method: 'POST', body: { token, action: b.dataset.a } }); document.getElementById('acctMsg').textContent = j.status === 'ok' ? 'Listo: vas a recibir los avisos de este contrato.' : 'Listo: no vas a recibir más avisos de este contrato.'; clearHash(); }
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
  function viewAccount() {
    const d = state.data || {};
    const dataNote = [d.ipc ? `IPC hasta ${day(d.ipc)}` : null, d.icl ? `ICL hasta ${day(d.icl)}` : null, d.cer ? `CER hasta ${day(d.cer)}` : null, d.uva ? `UVA hasta ${day(d.uva)}` : null].filter(Boolean).join(' · ');
    app.innerHTML = `<div class="acct-bar"><span>Sesión iniciada como <b>${esc(state.user.email)}</b></span><span class="acct-bar-actions"><button class="btn primary" id="acctAdd">+ Agregar contrato</button><button class="link-btn" id="acctLogout">Cerrar sesión</button></span></div>
      ${state.mail ? '' : '<p class="acct-warn">El envío de mails todavía no está configurado en el sitio: los contratos se guardan, pero los avisos no van a salir.</p>'}
      <div id="acctForm"></div>
      <div class="acct-list">${state.contracts.length ? state.contracts.map(c => `
        <article class="acct-card acct-contract" data-id="${esc(c.id)}">
          <div class="acct-contract-head"><div><h3>${esc(c.name)}</h3><p>${esc(indexText(c))} · ajuste ${esc(freqText(c.freq))} · desde ${esc(day(c.start))}${c.end ? ` hasta ${esc(day(c.end))}` : ''}</p></div>
            <div class="acct-now"><span>Monto vigente</span><b>${money(c.current?.amount)}</b><small>desde ${esc(day(c.current?.date))}</small></div></div>
          ${nextHtml(c)}
          ${c.pendingNote || ''}
          <p class="acct-rem">${remindersText(c)}</p>
          <div class="acct-actions"><button class="btn small" data-act="sched">Ver ajustes</button><button class="btn small" data-act="edit">Editar</button>${c.reminders?.mode !== 'off' && state.mail ? '<button class="btn small" data-act="test">Enviarme un mail de prueba</button>' : ''}<button class="btn small danger" data-act="del">Eliminar</button></div>
          <div class="acct-sched" hidden></div><p class="acct-msg" role="status"></p>
        </article>`).join('') : '<div class="acct-card acct-empty"><h3>Todavía no cargaste contratos</h3><p>Agregá el primero con su monto inicial, la fecha de inicio y el índice de actualización.</p></div>'}</div>
      <p class="acct-data">${esc(dataNote)}</p>
      <details class="acct-danger"><summary>Eliminar mi cuenta</summary><p>Se borran tus contratos y dejás de recibir avisos. No se puede deshacer.</p><button class="btn small danger" id="acctDelete">Eliminar mi cuenta</button></details>`;
    document.getElementById('acctAdd').onclick = () => openForm(null);
    document.getElementById('acctLogout').onclick = async () => { try { await api('/logout', { method: 'POST' }); } catch { } state.user = null; setNav(); viewLogin(); };
    document.getElementById('acctDelete').onclick = async () => { if (!confirm('¿Eliminar tu cuenta y todos tus contratos?')) return; try { await api('', { method: 'DELETE' }); } catch { } state.user = null; setNav(); viewLogin('Tu cuenta fue eliminada.'); };
    app.querySelectorAll('.acct-contract').forEach(card => {
      const c = state.contracts.find(x => x.id === card.dataset.id), msg = card.querySelector('.acct-msg');
      card.querySelectorAll('[data-act]').forEach(b => b.onclick = async () => {
        const act = b.dataset.act;
        if (act === 'sched') { const s = card.querySelector('.acct-sched'); s.hidden = !s.hidden; if (!s.hidden) s.innerHTML = scheduleTable(c); b.textContent = s.hidden ? 'Ver ajustes' : 'Ocultar ajustes'; }
        if (act === 'edit') openForm(c);
        if (act === 'test') { b.disabled = true; msg.textContent = 'Enviando…'; try { await api(`/contracts/${c.id}/test`, { method: 'POST' }); msg.textContent = `Listo: revisá ${state.user.email}.`; } catch (err) { msg.textContent = err.message; } b.disabled = false; }
        if (act === 'del') { if (!confirm(`¿Eliminar "${c.name}"?`)) return; try { await api(`/contracts/${c.id}`, { method: 'DELETE' }); await loadContracts(); } catch (err) { msg.textContent = err.message; } }
      });
    });
  }

  // ── Formulario de contrato con vista previa ────────────────────────────────────────────────────────────────
  function openForm(c) {
    state.editing = c;
    const box = document.getElementById('acctForm'), r = c?.reminders || { mode: 'adjust', day: 1, daysBefore: 0, self: true };
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
    document.getElementById('acctCancel').onclick = () => { box.innerHTML = ''; state.editing = null; };
    f.addEventListener('submit', async e => {
      e.preventDefault(); const m = document.getElementById('acctFormMsg'), b = f.querySelector('[type=submit]');
      b.disabled = true; m.textContent = 'Guardando…';
      try { await api(c ? `/contracts/${c.id}` : '/contracts', { method: c ? 'PUT' : 'POST', body: read() }); state.editing = null; await loadContracts(); }
      catch (err) { m.textContent = err.message; b.disabled = false; }
    });
    f.scrollIntoView({ block: 'start', behavior: 'smooth' });
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

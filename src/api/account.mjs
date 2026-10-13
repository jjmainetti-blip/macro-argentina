// v164 · Cuentas de usuario (ingreso con enlace por mail), contratos y recordatorios por mail.
//
// Almacenamiento (Workers KV, MACRO_STORE):
//   acct:user:<email>        documento del usuario: contratos, sesiones, contadores
//   acct:sess:<sha256>       sesión → email (30 días)
//   acct:login:<sha256>      enlace de ingreso → email (15 minutos, un solo uso)
//   acct:rcpt:<token>        destinatario de recordatorios → {owner, cid, to} (confirmar / darse de baja)
//   acct:rl:<tipo>:<clave>   límites de pedidos (1 hora)
//   acct:run:<fecha>         marca de la corrida diaria de recordatorios
// Mails: Resend (secreto RESEND_API_KEY; remitente MAIL_FROM, por defecto "Macrodatos <avisos@macrodatos.ar>").
import { BUNDLED_SOURCES } from './bundled-history.mjs';
import { normalizeLoan, computeLoan, SYSTEMS, ADJUST } from './loans-core.mjs';
import { normalizeContract, computeContract, INDEX_NAMES, freqText, dateLabel, monthLabel, ipcWindowText, pendingHint, addDays } from './contracts-core.mjs';

const SNAP_CORE = 'macro:snapshot:v131:core';
const SESSION_DAYS = 30, LOGIN_MINUTES = 15, MAX_CONTRACTS = 20, MAX_RECIPIENTS = 3;
const COOKIE = 'md_sess';
const TZ = 'America/Argentina/Buenos_Aires';

// ── Utilidades ────────────────────────────────────────────────────────────────────────────────────────────────
export const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...headers } });
export const todayAR = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
export const site = env => String(env?.SITE_URL || 'https://macrodatos.ar').replace(/\/+$/, '');
const validEmail = e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 120;
const normEmail = e => String(e || '').trim().toLowerCase();
export const userKey = email => `acct:user:${email}`;
export function randomToken(bytes = 32) { const a = new Uint8Array(bytes); crypto.getRandomValues(a); return btoa(String.fromCharCode(...a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
async function sha256(s) { const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join(''); }
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const money = n => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const pct = n => `${n >= 0 ? '+' : '−'}${new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Math.abs(n))}%`;
const idxNum = n => new Intl.NumberFormat('es-AR', { maximumFractionDigits: 4 }).format(n);
function cookie(request, name) { const m = (request.headers.get('cookie') || '').match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`)); return m ? decodeURIComponent(m[1]) : null; }
export async function readJson(request) { try { return await request.json(); } catch { return null; } }
export const kvGet = async (env, k) => { try { return await env.MACRO_STORE.get(k, 'json'); } catch { return null; } };
export const kvPut = (env, k, v, opts) => env.MACRO_STORE.put(k, JSON.stringify(v), opts);

export async function rateLimit(env, kind, key, max) {
  const k = `acct:rl:${kind}:${key}:${Math.floor(Date.now() / 3600000)}`;
  let n = 0; try { n = Number(await env.MACRO_STORE.get(k)) || 0; } catch { }
  if (n >= max) return false;
  try { await env.MACRO_STORE.put(k, String(n + 1), { expirationTtl: 3700 }); } catch { }
  return true;
}

// ── Mail (Resend) ─────────────────────────────────────────────────────────────────────────────────────────────
// v165: la clave se busca por nombre exacto y, si no, por cualquier variable cuyo nombre contenga "RESEND" (por si
// se cargó como RESEND_KEY, resend_api_key, con espacios, etc.). Se limpian comillas y espacios del valor.
function resendKey(env) {
  const pick = v => typeof v === 'string' ? v.trim().replace(/^["']+|["']+$/g, '').replace(/^Bearer\s+/i, '').trim() : '';
  let k = pick(env?.RESEND_API_KEY);
  if (!k) for (const n of Object.keys(env || {})) if (/RESEND/i.test(n) && pick(env[n]).startsWith('re_')) { k = pick(env[n]); break; }
  return k || null;
}
export const mailConfigured = env => !!resendKey(env);
// Diagnóstico (sólo nombres, nunca valores).
export function mailDiag(env) {
  const names = Object.keys(env || {}).filter(n => /resend|mail|api.?key/i.test(n)).map(n => JSON.stringify(n));
  const k = resendKey(env);
  return { configured: !!k, keyShape: k ? { length: k.length, prefix: k.slice(0, 3) } : null, varNames: names, from: env?.MAIL_FROM ? 'personalizado' : 'por defecto' };
}
export async function sendMail(env, { to, subject, html, text, unsubscribe }) {
  const key = resendKey(env); if (!key) throw new Error('El envío de mails no está configurado (falta RESEND_API_KEY).');
  const headers = {};
  if (unsubscribe) { headers['List-Unsubscribe'] = `<${unsubscribe.post}>`; headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click'; }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: env.MAIL_FROM || 'Macrodatos <avisos@macrodatos.ar>', to: [to], subject, html, text, headers, ...(env.MAIL_REPLY_TO ? { reply_to: env.MAIL_REPLY_TO } : {}) }),
  });
  if (!r.ok) { let m = ''; try { m = (await r.json())?.message || ''; } catch { } throw new Error(`Resend ${r.status}${m ? `: ${m}` : ''}`); }
  return true;
}
export function layout(env, { title, intro = '', body = '', button = null, footer = '' }) {
  const s = site(env);
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(title)}</title></head>
<body style="margin:0;background:#f6f9fc;font-family:Inter,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#12233a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f9fc;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid #dce6f1;border-radius:16px;overflow:hidden">
<tr><td style="background:#071b35;padding:18px 24px;color:#fff;font-weight:800;letter-spacing:.06em;font-size:14px">MACRODATOS <span style="font-weight:400;opacity:.7;font-size:11px;letter-spacing:.2em">ECONOMÍA ARGENTINA</span></td></tr>
<tr><td style="padding:26px 24px 8px"><h1 style="font-size:20px;line-height:1.3;margin:0 0 10px">${esc(title)}</h1>${intro ? `<p style="margin:0 0 14px;color:#40556e;font-size:14px;line-height:1.5">${intro}</p>` : ''}${body}
${button ? `<p style="margin:22px 0 6px"><a href="${esc(button.href)}" style="display:inline-block;background:#0b5bd3;color:#fff;text-decoration:none;font-weight:800;font-size:14px;padding:12px 20px;border-radius:10px">${esc(button.label)}</a></p>` : ''}</td></tr>
<tr><td style="padding:18px 24px 22px;color:#63758b;font-size:11px;line-height:1.5;border-top:1px solid #edf2f7">${footer}${footer ? '<br>' : ''}<a href="${s}/#cuenta" style="color:#0b5bd3">macrodatos.ar</a> · Información para análisis; no constituye asesoramiento financiero ni legal.</td></tr>
</table></td></tr></table></body></html>`;
  return html;
}
export const row = (k, v, strong = false) => `<tr><td style="padding:7px 0;color:#63758b;font-size:13px;border-bottom:1px solid #edf2f7">${esc(k)}</td><td align="right" style="padding:7px 0;font-size:${strong ? 17 : 13}px;font-weight:${strong ? 800 : 600};border-bottom:1px solid #edf2f7">${v}</td></tr>`;
export const table = rows => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 4px">${rows.join('')}</table>`;

// ── Sesión ────────────────────────────────────────────────────────────────────────────────────────────────────
async function currentUser(request, env) {
  const t = cookie(request, COOKIE); if (!t) return null;
  const s = await kvGet(env, `acct:sess:${await sha256(t)}`); if (!s?.email) return null;
  const u = await kvGet(env, userKey(s.email)); return u ? { user: u, token: t } : null;
}
const sessionCookie = (t, maxAge) => `${COOKIE}=${t ? encodeURIComponent(t) : ''}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
export const saveUser = (env, u) => kvPut(env, userKey(u.email), u);

// ── Datos de índices para el cálculo ──────────────────────────────────────────────────────────────────────────
let IDX_MEMO = null;
export async function indexData(env) {
  if (IDX_MEMO && Date.now() - IDX_MEMO.at < 30 * 60 * 1000) return IDX_MEMO.idx;
  const idx = { ipc: { '2016-12': 100 }, icl: {}, cer: {}, uva: {} };
  for (const r of BUNDLED_SOURCES.ipc?.monthly || []) if (Number(r.index) > 0) idx.ipc[r.date] = Number(r.index);
  try {
    const r = await env.ASSETS.fetch(new Request(`${site(env)}/contract-indices.json`));
    if (r.ok) {
      const c = await r.json();
      for (const k of ['icl', 'cer', 'uva']) {
        const s = c.series?.[k]; if (!s?.start || !Array.isArray(s.values)) continue;
        let t = Date.parse(s.start + 'T00:00:00Z');
        for (const v of s.values) { if (v !== null && Number(v) > 0) idx[k][new Date(t).toISOString().slice(0, 10)] = Number(v); t += 864e5; }
      }
    }
  } catch { }
  try {
    const S = (await kvGet(env, SNAP_CORE))?.sources || {};
    for (const r of Array.isArray(S.ipc?.monthly) ? S.ipc.monthly : []) if (/^\d{4}-\d{2}$/.test(r?.date) && Number(r.index) > 0) idx.ipc[r.date] = Number(r.index);
    const daily = { icl: S.icl?.daily, cer: S.contractIndices?.cer?.daily, uva: S.contractIndices?.uva?.daily };
    for (const [k, m] of Object.entries(daily)) for (const [d, v] of Object.entries(m || {})) if (/^\d{4}-\d{2}-\d{2}$/.test(d) && Number(v) > 0) idx[k][d] = Number(v);
  } catch { }
  IDX_MEMO = { at: Date.now(), idx };
  return idx;
}
function lastData(idx) {
  const last = m => Object.keys(m || {}).sort().at(-1) || null;
  return { ipc: last(idx.ipc), icl: last(idx.icl), cer: last(idx.cer), uva: last(idx.uva) };
}

// ── Vista del contrato para el navegador ─────────────────────────────────────────────────────────────────────
function publicContract(c, idx, today) {
  const R = computeContract(c, idx, today, { horizon: 3 });
  const rows = R.rows.slice(-36).map(r => ({ k: r.k, date: r.date, past: r.past, pending: !!r.pending, amount: r.amount ?? null, stepPct: r.stepPct ?? null, totalPct: r.totalPct ?? null, from: r.from || null, to: r.to || null, window: ipcWindowText(c, r.date) || null, hint: r.pending ? pendingHint(c, r.missing) : null }));
  return {
    id: c.id, name: c.name, amount: c.amount, start: c.start, end: c.end || '', index: c.index, lag: c.lag, fixedPct: c.fixedPct, freq: c.freq, notes: c.notes || '',
    reminders: { ...c.reminders, others: (c.recipients || []).map(r => r.email) },
    recipients: (c.recipients || []).map(r => ({ email: r.email, status: r.status })),
    current: R.current, next: R.next ? rows.find(r => r.k === R.next.k) : null, rows, baseError: R.baseError, ended: R.ended,
    totalRows: R.rows.length, createdAt: c.createdAt, updatedAt: c.updatedAt,
  };
}

// ── Recordatorios: contenido de los mails ────────────────────────────────────────────────────────────────────
function contractFacts(c) {
  const idx = c.index === 'fixed' ? `${INDEX_NAMES.fixed} (${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(c.fixedPct)}% por ajuste)` : INDEX_NAMES[c.index];
  return `${idx} · ajuste ${freqText(c.freq)}${c.index === 'ipc' ? ` · rezago de ${c.lag} ${c.lag === 1 ? 'mes' : 'meses'}` : ''}`;
}
function unsubLinks(env, token) { const s = site(env); return { page: `${s}/#baja=${token}`, post: `${s}/api/account/unsubscribe?t=${token}` }; }
function footerFor(env, rcpt, ownerEmail) {
  const u = unsubLinks(env, rcpt.token);
  return rcpt.self
    ? `Recibís este aviso porque lo configuraste en tu cuenta de Macrodatos. <a href="${u.page}" style="color:#0b5bd3">Dejar de recibir avisos de este contrato</a>.`
    : `Recibís este aviso porque ${esc(ownerEmail)} te agregó como destinatario y lo confirmaste. <a href="${u.page}" style="color:#0b5bd3">Darte de baja</a>.`;
}
export function adjustMail(env, c, r, next, today, rcpt, owner) {
  const future = r.date > today;
  const title = `${c.name}: ${future ? 'desde el' : 'nuevo monto desde el'} ${dateLabel(r.date)}`;
  const lines = [
    row('Monto anterior', money(r.prevAmount)),
    row(future ? 'Nuevo monto (a partir del ajuste)' : 'Nuevo monto', money(r.amount), true),
    row('Aumento', pct(r.stepPct)),
    row('Acumulado desde el inicio', pct(r.totalPct)),
  ];
  if (c.index === 'ipc') lines.push(row('Inflación considerada', esc(ipcWindowText(c, r.date))));
  if (r.from && r.to && c.index !== 'fixed') lines.push(row(`${c.index.toUpperCase()} usado`, `${idxNum(r.from.value)} → ${idxNum(r.to.value)}`));
  if (next) lines.push(row('Próximo ajuste', esc(dateLabel(next.date))));
  const intro = `${esc(contractFacts(c))}. Ajuste n.º ${r.k} del contrato iniciado el ${esc(dateLabel(c.start))} con un monto de ${money(c.amount)}.`;
  const subject = `${c.name}: ${money(r.amount)} (${pct(r.stepPct)}) desde el ${dateLabel(r.date)}`;
  const text = [`${title}`, '', `Monto anterior: ${money(r.prevAmount)}`, `Nuevo monto: ${money(r.amount)}`, `Aumento: ${pct(r.stepPct)}`, `Acumulado desde el inicio: ${pct(r.totalPct)}`, c.index === 'ipc' ? `Inflación considerada: ${ipcWindowText(c, r.date)}` : '', next ? `Próximo ajuste: ${dateLabel(next.date)}` : '', '', contractFacts(c), '', `Ver en ${site(env)}/#cuenta`, `Darse de baja: ${unsubLinks(env, rcpt.token).page}`].filter(x => x !== '').join('\n');
  return { subject, text, html: layout(env, { title, intro, body: table(lines) + (c.notes ? `<p style="font-size:12px;color:#63758b;margin:10px 0 0">Nota: ${esc(c.notes)}</p>` : ''), button: { href: `${site(env)}/#cuenta`, label: 'Ver el contrato' }, footer: footerFor(env, rcpt, owner) }) };
}
export function pendingMail(env, c, r, rcpt, owner) {
  const title = `${c.name}: el ajuste del ${dateLabel(r.date)} todavía no puede calcularse`;
  const hint = pendingHint(c, r.missing);
  const body = `<p style="font-size:14px;color:#40556e;line-height:1.5">El nuevo monto se va a poder calcular ${esc(hint)}. Te vamos a escribir de nuevo apenas esté disponible.</p>` + table([row('Monto vigente hasta el ajuste', money(r.prevAmount ?? c.amount), true)]);
  const text = `${title}\n\nEl nuevo monto se va a poder calcular ${hint}. Te vamos a escribir apenas esté disponible.\n\n${contractFacts(c)}\n\nDarse de baja: ${unsubLinks(env, rcpt.token).page}`;
  return { subject: title, text, html: layout(env, { title, intro: esc(contractFacts(c)), body, button: { href: `${site(env)}/#cuenta`, label: 'Ver el contrato' }, footer: footerFor(env, rcpt, owner) }) };
}
export function monthlyMail(env, c, R, today, rcpt, owner) {
  const ym = today.slice(0, 7), cur = R.current, next = R.next;
  const title = `${c.name}: monto vigente en ${monthLabel(ym)}`;
  const lines = [row('Monto vigente', money(cur.amount), true), row('Vigente desde', esc(dateLabel(cur.date)))];
  const thisMonth = R.rows.filter(r => r.date.slice(0, 7) === ym);
  for (const r of thisMonth) lines.push(row(r.past ? `Ajuste del ${dateLabel(r.date)}` : `Ajuste del ${dateLabel(r.date)} (este mes)`, r.pending ? 'pendiente de publicación del índice' : `${money(r.amount)} (${pct(r.stepPct)})`));
  if (next && !thisMonth.includes(next)) lines.push(row('Próximo ajuste', `${esc(dateLabel(next.date))}${next.pending ? '' : ` · ${money(next.amount)} (${pct(next.stepPct)})`}`));
  for (const r of R.pendingPast) if (!thisMonth.includes(r)) lines.push(row(`Ajuste del ${dateLabel(r.date)}`, `pendiente: se conoce ${esc(pendingHint(c, r.missing))}`));
  const text = `${title}\n\nMonto vigente: ${money(cur.amount)} (desde el ${dateLabel(cur.date)})\n${next ? `Próximo ajuste: ${dateLabel(next.date)}${next.pending ? '' : ` · ${money(next.amount)}`}\n` : ''}\n${contractFacts(c)}\n\nDarse de baja: ${unsubLinks(env, rcpt.token).page}`;
  return { subject: `${c.name}: ${money(cur.amount)} · ${monthLabel(ym)}`, text, html: layout(env, { title, intro: esc(contractFacts(c)), body: table(lines), button: { href: `${site(env)}/#cuenta`, label: 'Ver el contrato' }, footer: footerFor(env, rcpt, owner) }) };
}

// ── v171 · Créditos ──────────────────────────────────────────────────────────────────────────────────────────
const uvaN = n => new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
function loanFacts(L) { return `${ADJUST[L.adjust]} · TNA ${new Intl.NumberFormat('es-AR', { maximumFractionDigits: 3 }).format(L.rate)}% · sistema ${SYSTEMS[L.system].split(' (')[0].toLowerCase()} · ${L.term} cuotas`; }
const r2 = v => v == null ? null : Math.round(v * 100) / 100;
function publicLoan(L, idx, today) {
  const R = computeLoan(L, idx, today);
  const base = { id: L.id, type: 'loan', name: L.name, adjust: L.adjust, principal: L.principal, principalUnit: L.principalUnit, start: L.start, firstDue: L.firstDue || '', term: L.term, rate: L.rate, system: L.system, notes: L.notes || '',
    reminders: { ...L.reminders, others: (L.recipients || []).map(r => r.email) }, recipients: (L.recipients || []).map(r => ({ email: r.email, status: r.status })), createdAt: L.createdAt };
  if (R.error) return { ...base, error: R.error };
  const row = r => r && { k: r.k, date: r.date, past: r.past, quota: r2(r.quota), interest: r2(r.interest), capital: r2(r.capital), balance: r2(r.balance), uva: r.uva ?? null, uvaDate: r.uvaDate ?? null, estimated: !!r.estimated, quotaArs: r2(r.quotaArs), interestArs: r2(r.interestArs), capitalArs: r2(r.capitalArs), balanceArs: r2(r.balanceArs) };
  return { ...base, unit: R.unit, principalUnits: r2(R.principalUnits), baseUva: R.baseUva, paidCount: R.paidCount, finished: R.finished, next: row(R.next), balanceUnits: r2(R.balanceUnits), balanceArs: r2(R.balanceArs), uvaToday: R.uvaToday, totalInterest: r2(R.totalInterest), lastDue: R.lastDue, rows: R.rows.map(row) };
}
export function dueMail(env, L, r, R, today, rcpt, owner) {
  const uva = L.adjust === 'uva', future = r.date > today;
  const title = `${L.name}: cuota ${r.k} de ${L.term} · vence el ${dateLabel(r.date)}`;
  const lines = [row(`Cuota ${r.k} de ${L.term}`, money(r.quotaArs), true)];
  if (uva) { lines.push(row('Cuota en UVA', `${uvaN(r.quota)} UVA`)); lines.push(row(r.estimated ? `Valor UVA (último publicado, ${dateLabel(r.uvaDate)})` : `Valor UVA del ${dateLabel(r.uvaDate)}`, `$ ${uvaN(r.uva)}`)); }
  lines.push(row('Intereses', money(r.interestArs)), row('Amortización de capital', money(r.capitalArs)), row('Saldo de capital después de la cuota', money(r.balanceArs) + (uva ? ` (${uvaN(r.balance)} UVA)` : '')));
  const nx = R.rows.find(x => x.k === r.k + 1); if (nx) lines.push(row('Próximo vencimiento', esc(dateLabel(nx.date))));
  const note = uva && r.estimated ? `<p style="font-size:12px;color:#8a5a00;margin:10px 0 0">El valor de la UVA del ${esc(dateLabel(r.date))} todavía no se publicó: el monto en pesos está estimado con el último valor disponible y puede variar levemente.</p>` : '';
  const subject = `${L.name}: cuota ${r.k}/${L.term} ${money(r.quotaArs)}${uva && r.estimated ? ' (estimada)' : ''} · vence ${dateLabel(r.date)}`;
  const text = [title, '', `Cuota: ${money(r.quotaArs)}${uva ? ` (${uvaN(r.quota)} UVA × $ ${uvaN(r.uva)}${r.estimated ? ', valor estimado' : ''})` : ''}`, `Intereses: ${money(r.interestArs)}`, `Capital: ${money(r.capitalArs)}`, `Saldo: ${money(r.balanceArs)}`, '', loanFacts(L), '', `Ver en ${site(env)}/#cuenta`, `Darse de baja: ${unsubLinks(env, rcpt.token).page}`].join('\n');
  return { subject, text, html: layout(env, { title: future ? title : `${L.name}: cuota ${r.k} de ${L.term} (venció el ${dateLabel(r.date)})`, intro: esc(loanFacts(L)) + (L.notes ? `. ${esc(L.notes)}` : ''), body: table(lines) + note + '<p style="font-size:11px;color:#63758b;margin:10px 0 0">Cálculo orientativo sin IVA sobre intereses, seguros ni otros cargos del banco.</p>', button: { href: `${site(env)}/#cuenta`, label: 'Ver el crédito' }, footer: footerFor(env, rcpt, owner).replace('de este contrato', 'de este crédito') }) };
}
function markPastLoan(L, idx, today) {
  L.notified = {};
  const R = computeLoan(L, idx, today); if (R.error) return;
  for (const r of R.rows) if (r.date < today) L.notified[r.k] = 'past';
}
const findItem = (u, id) => (u?.contracts || []).find(x => x.id === id) || (u?.loans || []).find(x => x.id === id);

// ── Destinatarios ─────────────────────────────────────────────────────────────────────────────────────────────
function recipientsFor(u, c) {
  const out = [];
  if (c.reminders?.self !== false) out.push({ to: u.email, token: c.selfToken, self: true });
  for (const r of c.recipients || []) if (r.status === 'ok') out.push({ to: r.email, token: r.token, self: false });
  return out;
}
async function syncRecipients(env, u, c, prev, wanted) {
  const old = new Map((prev?.recipients || []).map(r => [r.email, r]));
  const list = [];
  for (const email of wanted.filter(e => e !== u.email)) {
    const r = old.get(email);
    if (r) { list.push(r); old.delete(email); continue; }
    const token = randomToken(24);
    await kvPut(env, `acct:rcpt:${token}`, { owner: u.email, cid: c.id, to: email });
    const rec = { email, status: 'pending', token, invitedAt: new Date().toISOString() };
    list.push(rec);
    if (await rateLimit(env, 'invite', u.email, 10)) {
      const s = site(env), isLoan = c.type === 'loan', what = isLoan ? 'de las cuotas del crédito' : 'de actualización del contrato', title = `${u.email} quiere enviarte avisos ${isLoan ? 'de un crédito' : 'de un contrato'}`;
      try {
        await sendMail(env, {
          to: email, subject: title,
          text: `${u.email} te agregó como destinatario de los avisos ${what} "${c.name}" en Macrodatos.\n\nPara recibirlos, confirmá en: ${s}/#confirmar=${token}\n\nSi no conocés a esta persona, ignorá este mail: no vas a recibir nada más.`,
          html: layout(env, { title, intro: `${esc(u.email)} te agregó como destinatario de los avisos ${what} <strong>${esc(c.name)}</strong> (${esc(isLoan ? loanFacts(c) : contractFacts(c))}).`, body: '<p style="font-size:14px;color:#40556e">Para empezar a recibirlos tenés que confirmarlo. Si no conocés a esta persona, ignorá este mail: no vas a recibir nada más.</p>', button: { href: `${s}/#confirmar=${token}`, label: 'Confirmar' } }),
        });
      } catch (e) { rec.inviteError = String(e?.message || e).slice(0, 160); }
    } else rec.inviteError = 'Se alcanzó el límite de invitaciones por hora.';
  }
  for (const r of old.values()) { try { await env.MACRO_STORE.delete(`acct:rcpt:${r.token}`); } catch { } }
  return list;
}

// ── Corrida diaria de recordatorios ──────────────────────────────────────────────────────────────────────────
export async function runReminders(env, { force = false, today = todayAR(), only = null, dryRun = false } = {}) {
  if (!env?.MACRO_STORE?.list) return { skipped: 'sin KV' };
  const runKey = `acct:run:${today}`;
  if (!force && !only) { try { if (await env.MACRO_STORE.get(runKey)) return { skipped: 'ya corrió hoy' }; } catch { } }
  if (!mailConfigured(env) && !dryRun) return { skipped: 'mail no configurado' };
  const idx = await indexData(env);
  const log = { today, users: 0, sent: 0, errors: [], mails: [] };
  let cursor;
  do {
    const page = only ? { keys: [{ name: userKey(only) }], list_complete: true } : await env.MACRO_STORE.list({ prefix: 'acct:user:', cursor });
    cursor = page.list_complete ? null : page.cursor;
    for (const { name } of page.keys) {
      const u = await kvGet(env, name); if (!u?.contracts?.length && !u?.loans?.length) continue;
      log.users++; let changed = false;
      // v171 · Créditos: aviso antes de cada vencimiento.
      for (const L of u.loans || []) {
        if ((L.reminders?.mode || 'off') === 'off') continue;
        const R = computeLoan(L, idx, today); if (R.error) continue;
        const rcpts = recipientsFor(u, L); if (!rcpts.length) continue;
        L.notified ||= {}; const queue = [];
        for (const r of R.rows) {
          if (L.notified[r.k]) continue;
          if (today < addDays(r.date, -(L.reminders.daysBefore || 0))) break;
          if (r.date < addDays(today, -3)) { L.notified[r.k] = 'past'; changed = true; continue; }
          queue.push(rc => dueMail(env, L, r, R, today, rc, u.email)); L.notified[r.k] = 'sent';
        }
        if (!queue.length) continue;
        changed = true;
        for (const make of queue) for (const rc of rcpts) {
          const m = make(rc);
          if (dryRun) { log.mails.push({ to: rc.to, subject: m.subject }); continue; }
          try { await sendMail(env, { to: rc.to, subject: m.subject, html: m.html, text: m.text, unsubscribe: unsubLinks(env, rc.token) }); log.sent++; }
          catch (e) { log.errors.push(`${L.id}: ${String(e?.message || e).slice(0, 120)}`); }
        }
      }
      for (const c of u.contracts || []) {
        const mode = c.reminders?.mode || 'off'; if (mode === 'off') continue;
        const R = computeContract(c, idx, today, { horizon: 2 });
        if (R.ended || R.baseError) continue;
        const rcpts = recipientsFor(u, c); if (!rcpts.length) continue;
        const queue = [];
        if (mode === 'adjust') {
          c.notified ||= {};
          const nextAfter = r => R.rows.find(x => x.k === r.k + 1) || null;
          for (const r of R.rows) {
            const st = c.notified[r.k];
            if (st === 'sent' || st === 'past') continue;
            if (today < addDays(r.date, -(c.reminders.daysBefore || 0))) continue;
            if (!r.pending) { queue.push(rc => adjustMail(env, c, r, nextAfter(r), today, rc, u.email)); c.notified[r.k] = 'sent'; }
            else if (today >= r.date && st !== 'pending') { queue.push(rc => pendingMail(env, c, r, rc, u.email)); c.notified[r.k] = 'pending'; }
          }
        } else if (mode === 'monthly') {
          const ym = today.slice(0, 7);
          if (Number(today.slice(8)) >= (c.reminders.day || 1) && c.lastMonthly !== ym) { queue.push(rc => monthlyMail(env, c, R, today, rc, u.email)); c.lastMonthly = ym; }
        }
        if (!queue.length) continue;
        changed = true;
        for (const make of queue) for (const rc of rcpts) {
          const m = make(rc);
          if (dryRun) { log.mails.push({ to: rc.to, subject: m.subject }); continue; }
          try { await sendMail(env, { to: rc.to, subject: m.subject, html: m.html, text: m.text, unsubscribe: unsubLinks(env, rc.token) }); log.sent++; }
          catch (e) { log.errors.push(`${c.id}: ${String(e?.message || e).slice(0, 120)}`); }
        }
      }
      if (changed && !dryRun) await saveUser(env, u);
    }
  } while (cursor);
  if (!only && !dryRun) { try { await env.MACRO_STORE.put(runKey, JSON.stringify({ at: new Date().toISOString(), sent: log.sent, users: log.users, errors: log.errors.slice(0, 10) }), { expirationTtl: 40 * 86400 }); } catch { } }
  return log;
}

// Al crear o modificar un contrato, los ajustes ya ocurridos y calculables no se avisan (sólo los que vienen).
function markPast(c, idx, today) {
  c.notified = {};
  const R = computeContract(c, idx, today, { horizon: 1 });
  for (const r of R.rows) if (r.date < today && !r.pending) c.notified[r.k] = 'past';
  c.lastMonthly = Number(today.slice(8)) >= (c.reminders.day || 1) ? today.slice(0, 7) : null;
}

// ── API ───────────────────────────────────────────────────────────────────────────────────────────────────────
export async function accountApi(request, env, ctx, url) {
  const p = url.pathname;
  if (!p.startsWith('/api/account')) return null;
  if (!env?.MACRO_STORE) return json({ error: 'Almacenamiento no disponible.' }, 503);
  const method = request.method;
  // Los cambios sólo se aceptan desde el propio sitio (protección CSRF; la cookie además es SameSite=Lax).
  if (method !== 'GET' && p !== '/api/account/unsubscribe') {
    const origin = request.headers.get('origin');
    if (!origin || origin !== url.origin) return json({ error: 'Origen no permitido.' }, 403);
  }
  const today = todayAR();

  if (p === '/api/account/status' && method === 'GET') {
    const me = await currentUser(request, env);
    return json({ mail: mailConfigured(env), user: me ? { email: me.user.email } : null });
  }

  // Ingreso: se pide un enlace por mail.
  if (p === '/api/account/login' && method === 'POST') {
    const b = await readJson(request), email = normEmail(b?.email);
    if (!validEmail(email)) return json({ error: 'Revisá la dirección de mail.' }, 400);
    if (!mailConfigured(env)) return json({ error: 'El envío de mails todavía no está configurado en el sitio.' }, 503);
    const ip = request.headers.get('cf-connecting-ip') || 'x';
    if (!(await rateLimit(env, 'login-ip', ip, 20)) || !(await rateLimit(env, 'login', email, 5))) return json({ error: 'Pediste demasiados enlaces. Probá de nuevo en una hora.' }, 429);
    const token = randomToken();
    await kvPut(env, `acct:login:${await sha256(token)}`, { email, at: Date.now() }, { expirationTtl: LOGIN_MINUTES * 60 });
    const s = site(env), link = `${s}/#acceso=${token}`;
    try {
      await sendMail(env, {
        to: email, subject: 'Tu enlace para entrar a Macrodatos',
        text: `Para entrar a tu cuenta de Macrodatos abrí este enlace (vence en ${LOGIN_MINUTES} minutos y sirve una sola vez):\n\n${link}\n\nSi no lo pediste, ignorá este mail.`,
        html: layout(env, { title: 'Entrá a tu cuenta', intro: `Tocá el botón para entrar a Macrodatos. El enlace vence en ${LOGIN_MINUTES} minutos y sirve una sola vez. Si es la primera vez, se crea tu cuenta.`, button: { href: link, label: 'Entrar a Macrodatos' }, footer: 'Si no pediste este enlace, ignorá este mail: nadie puede entrar sin él.' }),
      });
    } catch (e) { return json({ error: `No se pudo enviar el mail (${String(e?.message || e).slice(0, 120)}).` }, 502); }
    return json({ ok: true });
  }

  // Confirmación del enlace (POST desde la página, así los antivirus que abren los links no lo consumen).
  if (p === '/api/account/verify' && method === 'POST') {
    const b = await readJson(request), token = String(b?.token || '');
    if (!token || token.length > 100) return json({ error: 'Enlace inválido.' }, 400);
    const k = `acct:login:${await sha256(token)}`, rec = await kvGet(env, k);
    if (!rec?.email) return json({ error: 'El enlace venció o ya se usó. Pedí uno nuevo.' }, 400);
    try { await env.MACRO_STORE.delete(k); } catch { }
    const now = new Date().toISOString();
    let u = await kvGet(env, userKey(rec.email));
    if (!u) u = { email: rec.email, createdAt: now, contracts: [], sessions: [] };
    const st = randomToken(), sh = await sha256(st);
    await kvPut(env, `acct:sess:${sh}`, { email: u.email, at: now }, { expirationTtl: SESSION_DAYS * 86400 });
    u.sessions = [...(u.sessions || []), { h: sh, at: now }].slice(-10);
    u.lastLogin = now;
    await saveUser(env, u);
    return json({ ok: true, email: u.email }, 200, { 'set-cookie': sessionCookie(st, SESSION_DAYS * 86400) });
  }

  // Destinatarios: confirmar o darse de baja (sin sesión, con el token del mail).
  if ((p === '/api/account/recipient' || p === '/api/account/unsubscribe') && method === 'POST') {
    const b = p === '/api/account/recipient' ? await readJson(request) : null;
    const token = String(b?.token || url.searchParams.get('t') || ''), action = p === '/api/account/unsubscribe' ? 'unsubscribe' : b?.action;
    if (!token || !['confirm', 'unsubscribe', 'info'].includes(action)) return json({ error: 'Pedido inválido.' }, 400);
    const ref = await kvGet(env, `acct:rcpt:${token}`); if (!ref) return json({ error: 'El enlace ya no es válido.' }, 404);
    if (ref.kind === 'digest') {
      const D = await import('./digest.mjs');
      if (action === 'info') return json({ ok: true, contract: 'resúmenes y alertas', self: true, kind: 'digest' });
      if (action === 'unsubscribe') await D.unsubscribeDigest(env, ref.owner);
      return json({ ok: true, contract: 'resúmenes y alertas', status: action === 'confirm' ? 'ok' : 'off' });
    }
    const u = await kvGet(env, userKey(ref.owner)), c = findItem(u, ref.cid);
    if (!c) return json({ error: 'El contrato o crédito ya no existe.' }, 404);
    if (action === 'info') return json({ ok: true, contract: c.name, owner: ref.self ? null : ref.owner, self: !!ref.self });
    if (ref.self) { if (action === 'unsubscribe') c.reminders.self = false; }
    else { const r = (c.recipients || []).find(x => x.token === token); if (!r) return json({ error: 'El enlace ya no es válido.' }, 404); r.status = action === 'confirm' ? 'ok' : 'off'; r.changedAt = new Date().toISOString(); }
    await saveUser(env, u);
    return json({ ok: true, contract: c.name, status: action === 'confirm' ? 'ok' : 'off' });
  }

  // Desde acá, todo requiere sesión.
  const me = await currentUser(request, env);
  if (!me) return json({ error: 'Tenés que iniciar sesión.' }, 401);
  const u = me.user;

  if (p === '/api/account/logout' && method === 'POST') {
    const h = await sha256(me.token);
    try { await env.MACRO_STORE.delete(`acct:sess:${h}`); } catch { }
    u.sessions = (u.sessions || []).filter(s => s.h !== h); await saveUser(env, u);
    return json({ ok: true }, 200, { 'set-cookie': sessionCookie('', 0) });
  }
  // v166: resúmenes y alertas.
  if (p.startsWith('/api/account/prefs')) { const r = await (await import('./digest.mjs')).prefsApi(request, env, url, u); if (r) return r; }
  if (p === '/api/account' && method === 'DELETE') {
    try { await (await import('./digest.mjs')).removeSubscriber(env, u.email); } catch { }
    for (const s of u.sessions || []) { try { await env.MACRO_STORE.delete(`acct:sess:${s.h}`); } catch { } }
    for (const c of [...(u.contracts || []), ...(u.loans || [])]) for (const t of [c.selfToken, ...(c.recipients || []).map(r => r.token)]) { if (t) try { await env.MACRO_STORE.delete(`acct:rcpt:${t}`); } catch { } }
    await env.MACRO_STORE.delete(userKey(u.email));
    return json({ ok: true }, 200, { 'set-cookie': sessionCookie('', 0) });
  }

  const idx = await indexData(env);
  if (p === '/api/account/contracts' && method === 'GET') {
    return json({ email: u.email, mail: mailConfigured(env), today, data: lastData(idx), contracts: (u.contracts || []).map(c => publicContract(c, idx, today)), loans: (u.loans || []).map(L => publicLoan(L, idx, today)) });
  }
  // v171 · Créditos.
  if (p === '/api/account/loans/preview' && method === 'POST') {
    const { loan, errors } = normalizeLoan(await readJson(request), { maxRecipients: MAX_RECIPIENTS });
    if (errors.length) return json({ errors }, 400);
    return json({ loan: publicLoan({ ...loan, id: 'preview' }, idx, today) });
  }
  if (p === '/api/account/loans' && method === 'POST') {
    if ((u.loans || []).length >= 10) return json({ errors: ['Podés guardar hasta 10 créditos.'] }, 400);
    const { loan, errors } = normalizeLoan(await readJson(request), { maxRecipients: MAX_RECIPIENTS });
    if (errors.length) return json({ errors }, 400);
    const now = new Date().toISOString(), L = { ...loan, id: randomToken(9), createdAt: now, updatedAt: now, selfToken: randomToken(24) };
    const others = L.reminders.others; delete L.reminders.others;
    await kvPut(env, `acct:rcpt:${L.selfToken}`, { owner: u.email, cid: L.id, to: u.email, self: true });
    L.recipients = await syncRecipients(env, u, L, null, others);
    markPastLoan(L, idx, today);
    u.loans = [...(u.loans || []), L]; await saveUser(env, u);
    return json({ ok: true, loan: publicLoan(L, idx, today) });
  }
  const ml = p.match(/^\/api\/account\/loans\/([\w-]{6,20})(\/test)?$/);
  if (ml) {
    const i = (u.loans || []).findIndex(x => x.id === ml[1]); if (i < 0) return json({ error: 'No existe ese crédito.' }, 404);
    const prev = u.loans[i];
    if (ml[2] && method === 'POST') {
      if (!(await rateLimit(env, 'test', u.email, 5))) return json({ error: 'Llegaste al límite de mails de prueba por hora.' }, 429);
      const R = computeLoan(prev, idx, today); if (R.error) return json({ error: R.error }, 400);
      const r = R.next || R.rows.at(-1), rc = { to: u.email, token: prev.selfToken, self: true }, mail = dueMail(env, prev, r, R, today, rc, u.email);
      try { await sendMail(env, { to: u.email, subject: `[Prueba] ${mail.subject}`, html: mail.html, text: mail.text, unsubscribe: unsubLinks(env, rc.token) }); }
      catch (e) { return json({ error: `No se pudo enviar (${String(e?.message || e).slice(0, 120)}).` }, 502); }
      return json({ ok: true });
    }
    if (method === 'DELETE') {
      for (const t of [prev.selfToken, ...(prev.recipients || []).map(r => r.token)]) { if (t) try { await env.MACRO_STORE.delete(`acct:rcpt:${t}`); } catch { } }
      u.loans.splice(i, 1); await saveUser(env, u); return json({ ok: true });
    }
    if (method === 'PUT') {
      const { loan, errors } = normalizeLoan(await readJson(request), { maxRecipients: MAX_RECIPIENTS });
      if (errors.length) return json({ errors }, 400);
      const L = { ...prev, ...loan, id: prev.id, updatedAt: new Date().toISOString() };
      const others = L.reminders.others; delete L.reminders.others;
      L.recipients = await syncRecipients(env, u, L, prev, others);
      if (['principal', 'principalUnit', 'adjust', 'start', 'firstDue', 'term', 'rate', 'system'].some(k => prev[k] !== L[k]) || prev.reminders?.mode !== L.reminders.mode) markPastLoan(L, idx, today);
      u.loans[i] = L; await saveUser(env, u);
      return json({ ok: true, loan: publicLoan(L, idx, today) });
    }
  }
  if (p === '/api/account/preview' && method === 'POST') {
    const { contract, errors } = normalizeContract(await readJson(request), { maxRecipients: MAX_RECIPIENTS });
    if (errors.length) return json({ errors }, 400);
    return json({ contract: publicContract({ ...contract, id: 'preview' }, idx, today) });
  }
  if (p === '/api/account/contracts' && method === 'POST') {
    if ((u.contracts || []).length >= MAX_CONTRACTS) return json({ errors: [`Podés guardar hasta ${MAX_CONTRACTS} contratos.`] }, 400);
    const { contract, errors } = normalizeContract(await readJson(request), { maxRecipients: MAX_RECIPIENTS });
    if (errors.length) return json({ errors }, 400);
    const now = new Date().toISOString(), c = { ...contract, id: randomToken(9), createdAt: now, updatedAt: now, selfToken: randomToken(24) };
    const others = c.reminders.others; delete c.reminders.others;
    await kvPut(env, `acct:rcpt:${c.selfToken}`, { owner: u.email, cid: c.id, to: u.email, self: true });
    c.recipients = await syncRecipients(env, u, c, null, others);
    markPast(c, idx, today);
    u.contracts = [...(u.contracts || []), c]; await saveUser(env, u);
    return json({ ok: true, contract: publicContract(c, idx, today) });
  }
  const m = p.match(/^\/api\/account\/contracts\/([\w-]{6,20})(\/test)?$/);
  if (m) {
    const i = (u.contracts || []).findIndex(c => c.id === m[1]); if (i < 0) return json({ error: 'No existe ese contrato.' }, 404);
    const prev = u.contracts[i];
    if (m[2] && method === 'POST') {
      // Mail de prueba al titular con el último ajuste (o el próximo) para ver cómo llega.
      if (!(await rateLimit(env, 'test', u.email, 5))) return json({ error: 'Llegaste al límite de mails de prueba por hora.' }, 429);
      const R = computeContract(prev, idx, today, { horizon: 2 }), rc = { to: u.email, token: prev.selfToken, self: true };
      const target = R.next && !R.next.pending ? R.next : [...R.rows].reverse().find(r => !r.pending);
      const mail = target ? adjustMail(env, prev, target, R.rows.find(x => x.k === target.k + 1), today, rc, u.email) : monthlyMail(env, prev, R, today, rc, u.email);
      try { await sendMail(env, { to: u.email, subject: `[Prueba] ${mail.subject}`, html: mail.html, text: mail.text, unsubscribe: unsubLinks(env, rc.token) }); }
      catch (e) { return json({ error: `No se pudo enviar (${String(e?.message || e).slice(0, 120)}).` }, 502); }
      return json({ ok: true });
    }
    if (method === 'DELETE') {
      for (const t of [prev.selfToken, ...(prev.recipients || []).map(r => r.token)]) { if (t) try { await env.MACRO_STORE.delete(`acct:rcpt:${t}`); } catch { } }
      u.contracts.splice(i, 1); await saveUser(env, u); return json({ ok: true });
    }
    if (method === 'PUT') {
      const { contract, errors } = normalizeContract(await readJson(request), { maxRecipients: MAX_RECIPIENTS });
      if (errors.length) return json({ errors }, 400);
      const c = { ...prev, ...contract, id: prev.id, updatedAt: new Date().toISOString() };
      const others = c.reminders.others; delete c.reminders.others;
      c.recipients = await syncRecipients(env, u, c, prev, others);
      const calcKeys = ['amount', 'start', 'end', 'index', 'lag', 'fixedPct', 'freq'];
      if (calcKeys.some(k => prev[k] !== c[k]) || prev.reminders?.mode !== c.reminders.mode || prev.reminders?.day !== c.reminders.day) markPast(c, idx, today);
      u.contracts[i] = c; await saveUser(env, u);
      return json({ ok: true, contract: publicContract(c, idx, today) });
    }
  }
  return json({ error: 'No encontrado.' }, 404);
}

// Para /api/status: estado de la corrida diaria (sin datos personales).
export async function remindersStatus(env) {
  try {
    const t = todayAR(), y = addDays(t, -1);
    const [a, b] = await Promise.all([kvGet(env, `acct:run:${t}`), kvGet(env, `acct:run:${y}`)]);
    return { mailConfigured: mailConfigured(env), mail: mailDiag(env), today: a, yesterday: b };
  } catch { return null; }
}

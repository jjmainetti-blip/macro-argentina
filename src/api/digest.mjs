// v166 · Etapa 2 de "Mi cuenta": resúmenes diario y semanal por mail (con contenido a elección) y alertas cuando el
// dólar, el riesgo país o el Merval se mueven más que un porcentaje.
//
// KV:
//   acct:subs          { <email>: { digest, alerts, alertState, token } } — un solo documento que leen las revisiones
//                      programadas (así no hace falta recorrer todos los usuarios cada 5 minutos)
//   acct:dig:<fecha>:<am|pm>   marca de corrida de los resúmenes de ese horario
//   mkt:closes         { 'YYYY-MM-DD': { dollar, bna, risk, merval } } — cierres propios para las variaciones semanales
import { buildReleases } from '../../public/releases.js';
import { latestMarketsBody } from './markets.mjs';
import { agendaEvents } from './calendar-data.mjs';
import { BUNDLED_SOURCES } from './bundled-history.mjs';
import { isBusinessDay, closeDay } from './market-days.mjs';
import { computeContract } from './contracts-core.mjs';
import { computeLoan } from './loans-core.mjs';
import { watchQuotes, catalog, MARKETS as Q_MARKETS } from './quotes.mjs';
import { json, todayAR, site, esc, kvGet, kvPut, sendMail, layout, row, table, money, randomToken, readJson, rateLimit, userKey, indexData } from './account.mjs';

const TZ = 'America/Argentina/Buenos_Aires';
const SUBS = 'acct:subs';
const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
export const SLOTS = { am: { h: 8, m: 30, label: '8:30 (antes de la apertura)' }, pm: { h: 18, m: 30, label: '18:30 (después del cierre)' } };
export const ITEMS = {
  dollar: 'Dólar MEP', bna: 'Dólar oficial (BNA)', risk: 'Riesgo país', merval: 'Merval', bcra: 'Compras del BCRA y reservas',
  published: 'Datos publicados en el período', economy: 'Panorama: último dato de cada indicador', rem: 'Expectativas (REM)',
  agenda: 'Próximos datos a publicarse', contracts: 'Tus contratos y créditos: próximos ajustes y cuotas', watch: 'Tus acciones, bonos y ADRs',
};
export const ASSETS = { dollar: 'Dólar MEP', bna: 'Dólar oficial (BNA)', risk: 'Riesgo país', merval: 'Merval' };
// Último dato de mercados leído directo de KV (lo escribe la actualización de cada revisión), sin la memoria de 2 minutos.
async function freshMarkets(env) { try { const v = await env.MACRO_STORE.get('markets:latest'); if (v) return JSON.parse(v)?.latest || {}; } catch { } try { return JSON.parse((await latestMarketsBody(env)) || '{}')?.latest || {}; } catch { return {}; } }
const DEFAULT_ALERT_PCT = { dollar: 2, bna: 2, risk: 5, merval: 4 };

const fmt0 = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
const fmt2 = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pctS = n => n == null || !Number.isFinite(n) ? '—' : `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmt2.format(Math.abs(n))}%`;
const dayLabel = d => { const [y, m, dd] = d.split('-'); return `${Number(dd)} ${MES[+m - 1]} ${y}`; };
const addDays = (d, n) => { const t = new Date(d + 'T12:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
const weekday = d => new Date(d + 'T12:00:00Z').getUTCDay();
const localHM = (t = new Date()) => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(t).map(x => [x.type, x.value])); return Number(p.hour) % 24 * 60 + Number(p.minute); };
const VALUE = {
  dollar: x => `$ ${fmt2.format(x.value)}`, bna: x => `$ ${fmt2.format(x.sell ?? x.value)}`,
  risk: x => `${fmt0.format(x.value)} pb`, merval: x => `${fmt0.format(x.value)} pts`,
};
const rawValue = (k, x) => Number(k === 'bna' ? (x?.sell ?? x?.value) : x?.value);

// ── Preferencias ─────────────────────────────────────────────────────────────────────────────────────────────
export function defaultPrefs() {
  return {
    digest: { daily: { on: false, slot: 'pm' }, weekly: { on: false, day: 5, slot: 'pm' }, items: ['dollar', 'bna', 'risk', 'merval', 'watch', 'bcra', 'published', 'rem', 'agenda'], last: {}, watch: [] },
    alerts: Object.keys(ASSETS).map(asset => ({ asset, on: false, pct: DEFAULT_ALERT_PCT[asset], dir: 'both' })),
  };
}
function normalizePrefs(x, prev) {
  const d = defaultPrefs(), D = x?.digest || {};
  const slot = s => SLOTS[s] ? s : 'pm';
  return {
    digest: {
      daily: { on: !!D.daily?.on, slot: slot(D.daily?.slot) },
      weekly: { on: !!D.weekly?.on, day: [0, 1, 2, 3, 4, 5, 6].includes(Number(D.weekly?.day)) ? Number(D.weekly.day) : 5, slot: slot(D.weekly?.slot) },
      items: Array.isArray(D.items) ? [...new Set(D.items.filter(k => ITEMS[k]))] : d.digest.items,
      last: prev?.digest?.last || {},
      // v167: lista de seguimiento (hasta 20 instrumentos: 'ar:GGAL', 'bono:AL30', 'us:YPF', …).
      watch: [...new Set((Array.isArray(D.watch) ? D.watch : prev?.digest?.watch || []).map(x => String(x || '').trim().toUpperCase().replace(/^([A-Z]+):/, (m, a) => a.toLowerCase() + ':')).filter(x => /^[a-z]+:[A-Z0-9.]{1,12}$/.test(x) && Q_MARKETS[x.split(':')[0]]))].slice(0, 20),
    },
    alerts: Object.keys(ASSETS).map(asset => {
      const a = (Array.isArray(x?.alerts) ? x.alerts : []).find(r => r?.asset === asset) || {};
      const pct = Math.round(Number(String(a.pct ?? DEFAULT_ALERT_PCT[asset]).replace(',', '.')) * 100) / 100;
      return { asset, on: !!a.on, pct: pct >= 0.1 && pct <= 50 ? pct : DEFAULT_ALERT_PCT[asset], dir: ['both', 'up', 'down'].includes(a.dir) ? a.dir : 'both' };
    }),
  };
}
const readSubs = async env => (await kvGet(env, SUBS)) || {};
const active = p => !!(p?.digest?.daily?.on || p?.digest?.weekly?.on || p?.alerts?.some(a => a.on));

// ── Datos para los resúmenes ─────────────────────────────────────────────────────────────────────────────────
export async function digestData(env) {
  const markets = await freshMarkets(env);
  const closes = (await kvGet(env, 'mkt:closes')) || {};
  const fin = (await kvGet(env, 'macro:snapshot:v131:markets'))?.sources?.financialHistorical?.daily || {};
  const R = {}, names = ['ipc', 'ipcCaba', 'arca', 'salary', 'icg', 'autos', 'rem', 'bopHistorical', 'activityPulse', 'came', 'industryHistorical', 'isacHistorical'];
  for (const n of names) if (BUNDLED_SOURCES[n]) R[n] = BUNDLED_SOURCES[n];
  for (const g of ['core', 'external', 'activity', 'history']) { const snap = await kvGet(env, `macro:snapshot:v131:${g}`); for (const n of names) if (snap?.sources?.[n]) R[n] = snap.sources[n]; }
  let releases = []; try { releases = buildReleases(R).filter(r => r.title && r.value); } catch { }
  // Una sola entrada por indicador (la más reciente).
  const byTitle = new Map(); for (const r of releases) { const k = r.title, prev = byTitle.get(k); if (!prev || String(r.releaseDate) >= String(prev.releaseDate)) byTitle.set(k, r); }
  const ipcLast = (Array.isArray(R.ipc?.monthly) ? R.ipc.monthly : []).filter(r => Number.isFinite(Number(r.value))).map(r => String(r.date).slice(0, 7)).sort().at(-1) || null;
  const agenda = await agendaEvents(env, { limit: 40 }).catch(() => []);
  return { agenda, ipcLast, markets, closes, fin, releases: [...byTitle.values()].sort((a, b) => String(b.releaseDate).localeCompare(String(a.releaseDate))), rem: R.rem || null };
}
// Valor de cierre de un activo en la fecha d o la anterior más cercana (hasta 6 días antes).
function closeAt(data, k, d) {
  for (let i = 0; i < 7; i++) {
    const day = addDays(d, -i), c = data.closes[day]?.[k];
    if (Number(c) > 0) return { date: day, value: Number(c) };
    const f = k === 'risk' ? data.fin.risk?.[day] : k === 'merval' ? data.fin.mervalPoints?.[day] : null;
    if (Number(f) > 0) return { date: day, value: Number(f) };
  }
  return null;
}
export async function recordCloses(env, today = todayAR()) {
  if (!isBusinessDay(today)) return;
  const L = await freshMarkets(env);
  const day = {}; for (const k of Object.keys(ASSETS)) { const x = closeDay(L[k]); if (x?.date === today && rawValue(k, x) > 0) day[k] = rawValue(k, x); }
  if (!Object.keys(day).length) return;
  const closes = (await kvGet(env, 'mkt:closes')) || {}; closes[today] = { ...(closes[today] || {}), ...day };
  for (const d of Object.keys(closes).sort().slice(0, -60)) delete closes[d];
  await kvPut(env, 'mkt:closes', closes);
}

// ── Armado del resumen ───────────────────────────────────────────────────────────────────────────────────────
const h2 = t => `<h2 style="font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:#0b5bd3;margin:22px 0 4px">${esc(t)}</h2>`;
const small = t => `<p style="font-size:11px;color:#63758b;margin:4px 0 0">${t}</p>`;
export function buildDigest(env, kind, prefs, data, today, extra = {}) {
  const items = new Set(prefs.digest.items), weekly = kind === 'weekly';
  const since = weekly ? (prefs.digest.last?.weekly && prefs.digest.last.weekly < today ? prefs.digest.last.weekly : addDays(today, -7)) : (prefs.digest.last?.daily && prefs.digest.last.daily < today ? prefs.digest.last.daily : addDays(today, -1));
  const parts = [], text = [], subjectBits = [];
  // Mercados
  const mk = Object.keys(ASSETS).filter(k => items.has(k));
  if (mk.length) {
    const rows = [], tl = [];
    for (const k of mk) {
      const x = closeDay(data.markets[k]); if (!x || !(rawValue(k, x) > 0)) continue;
      const v = rawValue(k, x), d = Number(x.changePct);
      let w = null; if (weekly) { const c = closeAt(data, k, addDays(x.date, -7)); if (c) w = (v / c.value - 1) * 100; }
      const chg = weekly ? `${pctS(w)} semana · ${pctS(d)} día` : pctS(d);
      rows.push(row(`${ASSETS[k]}${x.date !== today ? ` · cierre ${dayLabel(x.date)}` : ''}`, `${VALUE[k](x)} <span style="font-weight:600;color:${(k === 'risk' || k === 'dollar' || k === 'bna') ? ((weekly ? w : d) > 0 ? '#c43d4b' : '#0d8a67') : ((weekly ? w : d) >= 0 ? '#0d8a67' : '#c43d4b')}">${chg}</span>`));
      tl.push(`${ASSETS[k]}: ${VALUE[k](x)} (${chg})`);
      if (k === 'dollar' || k === 'risk' || k === 'merval') subjectBits.push(`${k === 'dollar' ? 'MEP' : k === 'risk' ? 'Riesgo' : 'Merval'} ${k === 'risk' ? fmt0.format(v) : k === 'dollar' ? '$' + fmt0.format(v) : pctS(weekly ? w : d)}`);
    }
    if (rows.length) { parts.push(h2('Mercados') + table(rows)); text.push('MERCADOS', ...tl, ''); }
  }
  if (items.has('watch') && extra.watch?.length) {
    const fmtP = (v, cur) => v == null ? '—' : `${cur === 'ARS' ? '$' : 'US$'} ${new Intl.NumberFormat('es-AR', { minimumFractionDigits: v < 1000 ? 2 : 0, maximumFractionDigits: v < 1000 ? 2 : 0 }).format(v)}`;
    const col = n => n == null ? '#63758b' : n >= 0 ? '#0d8a67' : '#c43d4b';
    const rows = extra.watch.map(w => row(`${w.symbol}${w.name ? ` · ${w.name}` : ''} · ${w.label}${w.currency === 'USD cable' ? ' (cable)' : ''}`, w.price == null ? '<span style="color:#63758b;font-weight:400">sin cotización</span>' : `${fmtP(w.price, w.currency)} <span style="font-weight:600;color:${col(weekly ? w.week : w.pct)}">${weekly ? `${pctS(w.week)} semana · ${pctS(w.pct)} día` : pctS(w.pct)}</span>`));
    parts.push(h2('Tu seguimiento') + table(rows) + small('Precios de BYMA y Wall Street vía data912.com, con demora. Bonos: precio cada 100 nominales.'));
    text.push('TU SEGUIMIENTO', ...extra.watch.map(w => `${w.symbol}${w.name ? ` (${w.name})` : ''}: ${w.price == null ? 'sin cotización' : fmtP(w.price, w.currency)} ${weekly ? `${pctS(w.week)} semana · ${pctS(w.pct)} día` : pctS(w.pct)}`), '');
  }
  if (items.has('bcra') && data.markets.bcra) {
    const b = data.markets.bcra, rows = [];
    if (Number.isFinite(Number(b.value))) rows.push(row(`Compras del BCRA · ${dayLabel(b.date)}${b.preliminary ? ' (preliminar)' : ''}`, `USD ${fmt0.format(b.value)} M`));
    if (Number.isFinite(Number(b.monthToDate))) rows.push(row('Acumulado del mes', `USD ${fmt0.format(b.monthToDate)} M`));
    if (Number(b.reserves) > 0) rows.push(row(`Reservas brutas · ${dayLabel(b.reservesDate || b.date)}`, `USD ${fmt0.format(b.reserves)} M`));
    if (rows.length) { parts.push(h2('BCRA') + table(rows)); text.push('BCRA', ...rows.map(r => r.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()), ''); }
  }
  if (items.has('published')) {
    const list = data.releases.filter(r => String(r.releaseDate).slice(0, 10) > since && String(r.releaseDate).slice(0, 10) <= today);
    parts.push(h2(weekly ? 'Publicado en la semana' : 'Publicado desde el último resumen') + (list.length ? table(list.map(r => row(`${r.title} · ${dayLabel(String(r.releaseDate).slice(0, 10))}`, esc(r.value)))) : small('No hubo publicaciones nuevas de los indicadores que sigue el sitio.')));
    text.push(weekly ? 'PUBLICADO EN LA SEMANA' : 'PUBLICADO', ...(list.length ? list.map(r => `${r.title}: ${r.value}`) : ['Sin publicaciones nuevas.']), '');
    if (list.length) subjectBits.unshift(list.map(r => r.title.split(' · ')[0]).slice(0, 2).join(', '));
  }
  if (items.has('economy') && data.releases.length) {
    parts.push(h2('Panorama') + table(data.releases.slice(0, 14).map(r => row(`${r.title}${r.displayDate ? ` · ${String(r.displayDate).replace(/^Publicado /, '').replace(/ · período /, ' · ')}` : ''}`, esc(r.value)))));
    text.push('PANORAMA', ...data.releases.slice(0, 14).map(r => `${r.title}: ${r.value}`), '');
  }
  if (items.has('rem') && data.rem?.latest) {
    const L = data.rem.latest, exp = data.rem.cpiExpected?.monthly || {}, rows = [];
    const next = Object.keys(exp).filter(k => /^\d{4}-\d{2}$/.test(k) && k > (data.ipcLast || today.slice(0, 7)) && Number.isFinite(Number(exp[k]))).sort().slice(0, 2);
    for (const k of next) rows.push(row(`Inflación esperada ${MES[+k.slice(5) - 1]} ${k.slice(0, 4)}`, `${fmt2.format(exp[k]).replace(/0$/, '')}%`));
    if (Number.isFinite(Number(L.inflationNext12))) rows.push(row('Inflación próximos 12 meses', `${fmt2.format(L.inflationNext12).replace(/0$/, '')}%`));
    if (Number.isFinite(Number(L.fxDec))) rows.push(row(`Dólar oficial dic ${L.fxDecYear || ''}`, `$ ${fmt0.format(L.fxDec)}`));
    if (Number.isFinite(Number(L.gdp))) rows.push(row(`PIB ${L.gdpYear || ''}`, `${fmt2.format(L.gdp).replace(/0$/, '')}%`));
    if (rows.length) { const sv = L.survey ? `${MES[+L.survey.slice(5) - 1]} ${L.survey.slice(0, 4)}` : ''; parts.push(h2(`Expectativas · REM ${sv}`) + table(rows)); text.push(`REM ${sv}`, ...rows.map(r => r.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()), ''); }
  }
  if (items.has('agenda')) {
    const until = addDays(today, weekly ? 8 : 3), ev = (data.agenda || []).filter(e => e.status !== 'pendiente' && e.date > (kind === 'daily' && prefs.digest.daily.slot === 'am' ? addDays(today, -1) : today) && e.date <= until).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 12);
    parts.push(h2(weekly ? 'Agenda de la semana próxima' : 'Próximos datos') + (ev.length ? table(ev.map(e => row(`${DIAS[weekday(e.date)]} ${dayLabel(e.date)}`, `${esc(e.title)}<br><span style="font-weight:400;color:#63758b;font-size:11px">${esc(e.agency)}${e.period ? ` · ${esc(e.period)}` : ''}</span>`))) : small('Sin publicaciones confirmadas en los próximos días.')));
    text.push('AGENDA', ...(ev.length ? ev.map(e => `${dayLabel(e.date)}: ${e.title} (${e.agency})`) : ['Sin publicaciones confirmadas.']), '');
  }
  if (items.has('contracts') && extra.contracts?.length) {
    const rows = [];
    for (const c of extra.contracts) {
      const n = c.R.next; if (!n) continue;
      if (c.loan) { rows.push(row(`${c.name} · cuota ${n.k}/${c.term} · ${dayLabel(n.date)}`, `${money(n.quotaArs)}${n.estimated ? ' (estimada)' : ''}`)); continue; }
      rows.push(row(`${c.name} · ${dayLabel(n.date)}`, n.pending ? 'ajuste pendiente de publicación del índice' : `${money(n.amount)} (${pctS(n.stepPct)})`));
    }
    if (rows.length) { parts.push(h2('Tus contratos y créditos') + table(rows)); text.push('TUS CONTRATOS Y CRÉDITOS', ...rows.map(r => r.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()), ''); }
  }
  const title = weekly ? `Resumen semanal · ${dayLabel(today)}` : `Resumen diario · ${DIAS[weekday(today)]} ${dayLabel(today)}`;
  const subject = `${weekly ? 'Semana' : 'Macrodatos'} ${dayLabel(today)}${subjectBits.length ? ': ' + subjectBits.filter(Boolean).slice(0, 3).join(' · ') : ''}`;
  const unsub = `${site(env)}/#baja=${extra.token || ''}`;
  const footer = `Recibís este resumen porque lo activaste en tu cuenta. <a href="${site(env)}/#cuenta" style="color:#0b5bd3">Cambiar qué incluye</a> · <a href="${unsub}" style="color:#0b5bd3">Dejar de recibir resúmenes y alertas</a>.`;
  return { subject, html: layout(env, { title, body: parts.join('') || small('No elegiste contenido para el resumen.'), button: { href: `${site(env)}/`, label: 'Ver el tablero' }, footer }), text: `${title}\n\n${text.join('\n')}\nCambiar el contenido: ${site(env)}/#cuenta\nDejar de recibir: ${unsub}` };
}

async function watchFor(p, kind, today) {
  const ids = p.digest?.items?.includes('watch') ? (p.digest.watch || []) : []; if (!ids.length) return [];
  try { return await watchQuotes(ids, { weekly: kind === 'weekly', since: addDays(today, -7) }); } catch { return []; }
}
async function contractsFor(env, email, today) {
  const u = await kvGet(env, userKey(email)); if (!u?.contracts?.length && !u?.loans?.length) return [];
  const idx = await indexData(env);
  const cs = (u.contracts || []).map(c => ({ name: c.name, R: computeContract(c, idx, today, { horizon: 1 }) })).filter(c => !c.R.ended && !c.R.baseError);
  const ls = (u.loans || []).map(L => ({ name: L.name, loan: true, term: L.term, R: computeLoan(L, idx, today) })).filter(c => !c.R.error && c.R.next);
  return [...cs, ...ls];
}
const unsubHeaders = (env, token) => ({ page: `${site(env)}/#baja=${token}`, post: `${site(env)}/api/account/unsubscribe?t=${token}` });

// ── Corridas programadas ─────────────────────────────────────────────────────────────────────────────────────
// Se llama en cada revisión de 5 minutos: si ya pasó el horario de un resumen (y no más de 3 horas), lo manda.
export async function digestTick(env, now = new Date()) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(now), hm = localHM(now), out = [];
  for (const [slot, S] of Object.entries(SLOTS)) {
    const t0 = S.h * 60 + S.m; if (hm < t0 || hm >= t0 + 180) continue;
    const guard = `acct:dig:${today}:${slot}`;
    try { if (await env.MACRO_STORE.get(guard)) continue; } catch { continue; }
    await env.MACRO_STORE.put(guard, new Date().toISOString(), { expirationTtl: 3 * 86400 });
    if (slot === 'pm') { try { await recordCloses(env, today); } catch { } }
    out.push(await runDigests(env, slot, { today }));
  }
  return out;
}
export async function runDigests(env, slot, { today = todayAR(), only = null, kinds = null, test = false } = {}) {
  const subs = await readSubs(env), log = { slot, today, sent: 0, errors: [] }, biz = isBusinessDay(today);
  const due = [];
  for (const [email, p] of Object.entries(subs)) {
    if (only && email !== only) continue;
    const D = p.digest || {}, k = [];
    if (kinds) k.push(...kinds);
    else {
      if (D.daily?.on && D.daily.slot === slot && biz && D.last?.daily !== today) k.push('daily');
      if (D.weekly?.on && D.weekly.slot === slot && weekday(today) === D.weekly.day && D.last?.weekly !== today) k.push('weekly');
    }
    if (k.length) due.push([email, p, k]);
  }
  if (!due.length) return log;
  const data = await digestData(env);
  for (const [email, p, kinds2] of due) {
    for (const kind of kinds2) {
      try {
        const contracts = p.digest.items?.includes('contracts') ? await contractsFor(env, email, today) : [];
        const watch = await watchFor(p, kind, today);
        const m = buildDigest(env, kind, p, data, today, { contracts, watch, token: p.token });
        await sendMail(env, { to: email, subject: test ? `[Prueba] ${m.subject}` : m.subject, html: m.html, text: m.text, unsubscribe: unsubHeaders(env, p.token) });
        log.sent++;
        if (!test) { p.digest.last = { ...(p.digest.last || {}), [kind]: today }; }
      } catch (e) { log.errors.push(String(e?.message || e).slice(0, 140)); }
    }
  }
  if (!test) { const fresh = await readSubs(env); for (const [email, p] of due) if (fresh[email]) fresh[email].digest.last = p.digest.last; await kvPut(env, SUBS, fresh); }
  return log;
}

// Alertas: después de cada actualización de mercados, en días hábiles entre las 10:30 y las 18:00.
export async function checkAlerts(env, now = new Date()) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(now), hm = localHM(now);
  if (!isBusinessDay(today) || hm < 10 * 60 + 30 || hm > 18 * 60) return { skipped: true };
  const subs = await readSubs(env);
  const anyOn = Object.values(subs).some(p => p.alerts?.some(a => a.on)); if (!anyOn) return { skipped: 'sin alertas' };
  const L = await freshMarkets(env);
  const log = { sent: 0, errors: [] }; let changed = false;
  for (const [email, p] of Object.entries(subs)) {
    for (const a of p.alerts || []) {
      if (!a.on) continue;
      const x = closeDay(L[a.asset]); if (!x || x.date !== today) continue;
      const chg = Number(x.changePct); if (!Number.isFinite(chg) || chg === 0) continue;
      if ((a.dir === 'up' && chg < 0) || (a.dir === 'down' && chg > 0)) continue;
      const level = Math.floor(Math.abs(chg) / a.pct + 1e-9); if (level < 1) continue;
      const st = p.alertState?.date === today ? p.alertState : (p.alertState = { date: today, levels: {} });
      const key = `${a.asset}${chg > 0 ? '+' : '-'}`; if ((st.levels[key] || 0) >= level) continue;
      st.levels[key] = level; changed = true;
      try { const m = alertMail(env, a, x, chg, level, p.token); await sendMail(env, { to: email, subject: m.subject, html: m.html, text: m.text, unsubscribe: unsubHeaders(env, p.token) }); log.sent++; }
      catch (e) { log.errors.push(String(e?.message || e).slice(0, 140)); }
    }
  }
  if (changed) { const fresh = await readSubs(env); for (const [email, p] of Object.entries(subs)) if (fresh[email] && p.alertState) fresh[email].alertState = p.alertState; await kvPut(env, SUBS, fresh); }
  return log;
}
export function alertMail(env, a, x, chg, level, token) {
  const name = ASSETS[a.asset], v = VALUE[a.asset](x), verb = chg > 0 ? 'sube' : 'baja';
  const prev = Number(x.previous) > 0 ? Number(x.previous) : rawValue(a.asset, x) / (1 + chg / 100);
  const hm = x.updatedAt ? new Date(x.updatedAt).toLocaleTimeString('es-AR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }) : null;
  const title = `${name} ${verb} ${pctS(chg).replace(/^[+−]/, '')} hoy`;
  const rows = [row('Valor', `${v}`, true), row('Variación del día', pctS(chg)), row('Cierre anterior', VALUE[a.asset]({ value: prev, sell: prev })), row('Tu umbral', `${fmt2.format(a.pct).replace(/,00$/, '')}%${level > 1 ? ` (superado ${level} veces)` : ''}`)];
  if (a.asset === 'risk' && Number.isFinite(Number(x.changeBp))) rows.splice(2, 0, row('En puntos básicos', `${Number(x.changeBp) > 0 ? '+' : ''}${fmt0.format(x.changeBp)} pb`));
  const footer = `Alerta configurada en tu cuenta (${pctS(a.pct).replace('+', '')} ${a.dir === 'up' ? 'al alza' : a.dir === 'down' ? 'a la baja' : 'en cualquier dirección'}). <a href="${site(env)}/#cuenta" style="color:#0b5bd3">Cambiar</a> · <a href="${site(env)}/#baja=${token}" style="color:#0b5bd3">Dejar de recibir resúmenes y alertas</a>.`;
  return {
    subject: `Alerta: ${name} ${verb} ${pctS(chg).replace(/^[+−]/, '')} (${v})`,
    html: layout(env, { title, intro: `Dato de ${esc(x.source || 'mercado')}${hm ? ` a las ${hm}` : ''}.`, body: table(rows), button: { href: `${site(env)}/#tipo-cambio`, label: 'Ver en Macrodatos' }, footer }),
    text: `${title}\n\nValor: ${v}\nVariación del día: ${pctS(chg)}\nTu umbral: ${a.pct}%\n\nCambiar: ${site(env)}/#cuenta\nDejar de recibir: ${site(env)}/#baja=${token}`,
  };
}

// ── API (requiere sesión; la llama accountApi) ───────────────────────────────────────────────────────────────
export async function prefsApi(request, env, url, user) {
  const p = url.pathname, method = request.method, email = user.email;
  if (p === '/api/account/prefs' && method === 'GET') {
    const subs = await readSubs(env), cur = subs[email] || defaultPrefs();
    return json({ prefs: { digest: cur.digest, alerts: cur.alerts }, items: ITEMS, assets: ASSETS, slots: Object.fromEntries(Object.entries(SLOTS).map(([k, v]) => [k, v.label])) });
  }
  if (p === '/api/account/prefs' && method === 'POST') {
    const subs = await readSubs(env), prev = subs[email];
    const next = normalizePrefs(await readJson(request), prev);
    if (active(next)) {
      let token = prev?.token;
      if (!token) { token = randomToken(24); await kvPut(env, `acct:rcpt:${token}`, { owner: email, kind: 'digest', self: true }); }
      subs[email] = { ...next, alertState: prev?.alertState || null, token };
    } else if (prev) { subs[email] = { ...next, alertState: null, token: prev.token }; }
    else return json({ ok: true, prefs: next });
    await kvPut(env, SUBS, subs);
    return json({ ok: true, prefs: { digest: subs[email].digest, alerts: subs[email].alerts } });
  }
  if (p === '/api/account/prefs/instruments' && method === 'GET') {
    try { return json(await catalog()); } catch (e) { return json({ error: `No se pudieron obtener las cotizaciones (${String(e?.message || e).slice(0, 100)}).` }, 502); }
  }
  if (p === '/api/account/prefs/watch' && method === 'POST') {
    const b = await readJson(request), ids = (Array.isArray(b?.ids) ? b.ids : []).slice(0, 20).map(String);
    try { return json({ quotes: await watchQuotes(ids) }); } catch (e) { return json({ error: String(e?.message || e).slice(0, 120) }, 502); }
  }
  if (p === '/api/account/prefs/test' && method === 'POST') {
    if (!(await rateLimit(env, 'test', email, 5))) return json({ error: 'Llegaste al límite de mails de prueba por hora.' }, 429);
    const b = await readJson(request), kind = b?.kind === 'weekly' ? 'weekly' : 'daily';
    const subs = await readSubs(env); let cur = subs[email];
    const draft = normalizePrefs(b?.prefs || cur || defaultPrefs(), cur);
    if (!cur?.token) { const token = randomToken(24); await kvPut(env, `acct:rcpt:${token}`, { owner: email, kind: 'digest', self: true }); cur = subs[email] = { ...draft, token }; await kvPut(env, SUBS, subs); }
    const today = todayAR(), data = await digestData(env);
    const contracts = draft.digest.items.includes('contracts') ? await contractsFor(env, email, today) : [];
    const watch = await watchFor(draft, kind, today);
    const m = buildDigest(env, kind, { ...draft, digest: { ...draft.digest, last: {} } }, data, today, { contracts, watch, token: cur.token });
    try { await sendMail(env, { to: email, subject: `[Prueba] ${m.subject}`, html: m.html, text: m.text, unsubscribe: unsubHeaders(env, cur.token) }); }
    catch (e) { return json({ error: `No se pudo enviar (${String(e?.message || e).slice(0, 120)}).` }, 502); }
    return json({ ok: true });
  }
  return null;
}
// Baja de un clic (desde el mail): apaga resúmenes y alertas.
export async function unsubscribeDigest(env, email) {
  const subs = await readSubs(env), p = subs[email]; if (!p) return;
  p.digest.daily.on = false; p.digest.weekly.on = false; for (const a of p.alerts || []) a.on = false;
  await kvPut(env, SUBS, subs);
}
export async function removeSubscriber(env, email) {
  const subs = await readSubs(env); if (!subs[email]) return;
  try { if (subs[email].token) await env.MACRO_STORE.delete(`acct:rcpt:${subs[email].token}`); } catch { }
  delete subs[email]; await kvPut(env, SUBS, subs);
}
export async function digestStatus(env) {
  const t = todayAR(); const subs = await readSubs(env), v = Object.values(subs);
  const g = k => env.MACRO_STORE.get(k).catch(() => null), [am, pm] = await Promise.all([g(`acct:dig:${t}:am`), g(`acct:dig:${t}:pm`)]);
  return { subscribers: v.length, daily: v.filter(p => p.digest?.daily?.on).length, weekly: v.filter(p => p.digest?.weekly?.on).length, alerts: v.filter(p => p.alerts?.some(a => a.on)).length, ranToday: { am: !!am, pm: !!pm } };
}

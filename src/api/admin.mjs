// v210 · Pestaña "Sitio" de Mi cuenta (sólo administrador; el control de acceso está en account.mjs, antes de llegar acá).
import { json, readJson, kvGet, kvPut, todayAR } from './account.mjs';
import { readStats, flushStats } from './stats.mjs';
import { SERIES, SERIES_BY_ID, YM_RE, OVERRIDES_KEY, readOverrides, setOverridesMemo, overrideState } from './overrides.mjs';

const daysAgo = n => new Date(Date.now() - 3 * 3600e3 - n * 86400e3).toISOString().slice(0, 10);

async function listUsers(env) {
  const names = []; let cursor;
  do { const r = await env.MACRO_STORE.list({ prefix: 'acct:user:', cursor }); names.push(...r.keys.map(k => k.name)); cursor = r.list_complete ? null : r.cursor; } while (cursor && names.length < 2000);
  const users = [];
  for (let i = 0; i < names.length && i < 500; i += 25) users.push(...(await Promise.all(names.slice(i, i + 25).map(n => kvGet(env, n)))).filter(Boolean));
  return { total: names.length, users };
}

async function stats(env) {
  await flushStats(env, true).catch(() => { });
  const [hits, mails, U, subs] = await Promise.all([readStats(env, 'hit', 60), readStats(env, 'mail', 60), listUsers(env), kvGet(env, 'acct:subs')]);
  const sumDays = (S, f, n) => Object.entries(S).filter(([d]) => d > daysAgo(n)).reduce((a, [, v]) => a + (v[f] || 0), 0);
  const d7 = daysAgo(7), d30 = daysAgo(30), at = s => String(s || '').slice(0, 10);
  const users = U.users, S = Object.values(subs || {});
  const recent = [...users].sort((a, b) => String(b.lastLogin || b.createdAt || '').localeCompare(String(a.lastLogin || a.createdAt || ''))).slice(0, 25)
    .map(u => ({ email: u.email, createdAt: u.createdAt || null, lastLogin: u.lastLogin || null, contracts: (u.contracts || []).length, loans: (u.loans || []).length, staff: (u.staff || []).length }));
  const mailKinds = {}; for (const v of Object.values(mails)) for (const [k, n] of Object.entries(v)) if (k.startsWith('k_') && v) mailKinds[k.slice(2)] = (mailKinds[k.slice(2)] || 0) + n;
  let cards = [], xIndec = null;
  try { const M = await import('./macro-data.mjs'); cards = await M.freshnessReport(env); } catch { }
  try { const X = await import('./indec-x.mjs'); xIndec = await X.indecXStatus(env); } catch { }
  return {
    generatedAt: new Date().toISOString(), today: todayAR(), since: Object.keys(hits).sort()[0] || null,
    visits: { days: hits, today: hits[todayAR()] || {}, views7: sumDays(hits, 'views', 7), visitors7: sumDays(hits, 'visitors', 7), views30: sumDays(hits, 'views', 30), visitors30: sumDays(hits, 'visitors', 30) },
    mails: { days: mails, total7: sumDays(mails, 'total', 7), total30: sumDays(mails, 'total', 30), kinds: mailKinds },
    users: {
      total: U.total, new7: users.filter(u => at(u.createdAt) > d7).length, new30: users.filter(u => at(u.createdAt) > d30).length,
      active7: users.filter(u => at(u.lastLogin) > d7).length, active30: users.filter(u => at(u.lastLogin) > d30).length,
      withContracts: users.filter(u => (u.contracts || []).length).length, contracts: users.reduce((a, u) => a + (u.contracts || []).length, 0),
      withLoans: users.filter(u => (u.loans || []).length).length, loans: users.reduce((a, u) => a + (u.loans || []).length, 0),
      withStaff: users.filter(u => (u.staff || []).length).length, staff: users.reduce((a, u) => a + (u.staff || []).length, 0),
      recent
    },
    subs: { subscribers: S.length, daily: S.filter(p => p.digest?.daily?.on).length, weekly: S.filter(p => p.digest?.weekly?.on).length, alerts: S.filter(p => p.alerts?.some(a => a.on)).length, watching: S.filter(p => (p.digest?.watch || []).length).length, watchItems: S.reduce((a, p) => a + (p.digest?.watch || []).length, 0) },
    cards: cards.map(c => ({ key: c.key, title: c.title, state: c.state, latestLabel: c.latestLabel || null, nextLabel: c.nextLabel || null, expected: c.expected || null, daysLate: c.daysLate ?? null })),
    xIndec: xIndec ? { lastCheck: xIndec.lastCheck, lastError: xIndec.lastError, doneDay: xIndec.doneDay } : null
  };
}

// Últimos valores de cada serie en el snapshot guardado (para ver qué hay antes de cargar).
function recentValues(snap, s, n = 6) {
  if (!snap?.sources) return [];
  if (s.kind === 'ipcMom') {
    const M = (snap.sources.ipc?.monthly || []).filter(r => Number(r.index) > 0).sort((a, b) => String(a.date).localeCompare(String(b.date)));
    return M.slice(-n - 1).map((r, i, a) => i ? [String(r.date).slice(0, 7), Math.round((r.index / a[i - 1].index - 1) * 1e4) / 100] : null).filter(Boolean);
  }
  let o = snap.sources; for (const k of s.path) o = o?.[k];
  return Object.entries(o || {}).filter(([k, v]) => YM_RE.test(k) && Number.isFinite(Number(v))).sort(([a], [b]) => a.localeCompare(b)).slice(-n).map(([k, v]) => [k, Number(v)]);
}

async function dataView(env) {
  const M = await import('./macro-data.mjs');
  const groups = [...new Set(SERIES.map(s => s.group))], snaps = {};
  await Promise.all(groups.map(async g => { snaps[g] = await M.readSnapshotFor(env, g).catch(() => null); }));
  const OV = await readOverrides(env, { fresh: true });
  return {
    series: SERIES.map(s => ({ id: s.id, label: s.label, unit: s.unit, group: s.group, recent: recentValues(snaps[s.group], s) })),
    entries: OV.entries.map(e => ({ ...e, label: SERIES_BY_ID[e.id]?.label || e.id, unit: SERIES_BY_ID[e.id]?.unit || '', ...(overrideState(e, snaps[SERIES_BY_ID[e.id]?.group]) || {}) }))
      .sort((a, b) => String(b.at).localeCompare(String(a.at)))
  };
}

export async function adminApi(request, env, ctx, url, user) {
  const p = url.pathname, method = request.method;
  if (p === '/api/account/admin/stats' && method === 'GET') return json(await stats(env));
  if (p === '/api/account/admin/data' && method === 'GET') return json(await dataView(env));
  if (p === '/api/account/admin/data' && (method === 'POST' || method === 'DELETE')) {
    const b = method === 'POST' ? await readJson(request) : { id: url.searchParams.get('id'), ym: url.searchParams.get('ym') };
    const S = SERIES_BY_ID[String(b?.id || '')], ym = String(b?.ym || '');
    if (!S) return json({ error: 'Serie desconocida.' }, 400);
    if (!YM_RE.test(ym)) return json({ error: 'El mes tiene que ser AAAA-MM.' }, 400);
    const OV = await readOverrides(env, { fresh: true }), entries = OV.entries.filter(e => !(e.id === S.id && e.ym === ym));
    if (method === 'POST') {
      const value = Number(String(b.value ?? '').replace(',', '.'));
      if (!Number.isFinite(value) || Math.abs(value) > 1e7) return json({ error: 'Revisá el valor (número, con punto o coma decimal).' }, 400);
      if (ym > todayAR().slice(0, 7)) return json({ error: 'El mes no puede ser futuro.' }, 400);
      if (entries.length >= 500) return json({ error: 'Hay demasiados datos cargados; borrá los que ya publicó la fuente.' }, 400);
      entries.push({ id: S.id, ym, value, mode: b.mode === 'replace' ? 'replace' : 'fill', note: String(b.note || '').slice(0, 140), at: new Date().toISOString(), by: user.email });
    } else if (entries.length === OV.entries.length) return json({ error: 'Ese dato no estaba cargado.' }, 404);
    const next = { entries, updatedAt: new Date().toISOString() };
    await kvPut(env, OVERRIDES_KEY, next); setOverridesMemo(next);
    let applied = null; try { const M = await import('./macro-data.mjs'); applied = await M.applyOverridesNow(env, S.group); } catch (e) { applied = `error: ${String(e?.message || e).slice(0, 120)}`; }
    return json({ ok: true, applied, ...(await dataView(env)) });
  }
  // Forzar la actualización de un grupo de fuentes (lo mismo que hace la revisión programada).
  if (p === '/api/account/admin/refresh' && method === 'POST') {
    const b = await readJson(request), M = await import('./macro-data.mjs'), g = String(b?.group || '');
    if (!M.GROUPS[g]) return json({ error: 'Grupo inválido.' }, 400);
    const r = await M.default(env, ctx, new Request(`https://admin.invalid/api/macro-data?group=${g}`), { force: true });
    const j = await r.json().catch(() => ({}));
    const errors = Object.entries(j.sources || {}).filter(([, v]) => v?.refreshError || v?.status === 'error').map(([k, v]) => `${k}: ${String(v.refreshError || v.error || '').slice(0, 100)}`);
    try { await M.latestReleaseFor(env, null, { force: true }); } catch { }
    return json({ ok: r.ok, stored: j.stored || null, errors });
  }
  return json({ error: 'Not found' }, 404);
}

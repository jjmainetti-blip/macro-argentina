#!/usr/bin/env python3
"""v123 · Construye public/birth-economy.json ("La economía cuando naciste").

Entradas (descargadas de fuentes oficiales; ver README):
  series.json  -> Datos Argentina / Banco Mundial (IPC histórico INDEC, IPC San Luis, IPC Nacional,
                  tipo de cambio BCRA en $ equivalentes, SMVM, RIPTE, PIB 1935-62, precios promedio INDEC)
  uscpi.csv    -> FRED CPIAUCNS (IPC-U EE.UU., mensual desde 1913)
  people/*.json, wp.json -> presidentes, ministros y fotos (Wikipedia / Wikimedia Commons)
  goods.json, staples.json -> precios de auto 0 km, m² en CABA, pan, asado, leche (con fuente)
  public/fx-daily.json, public/macro-history.json -> dólar libre diario 1991+ y anual histórico

Todos los montos se guardan en "pesos actuales equivalentes" (moneda vigente desde 1992);
el navegador los convierte a la moneda de cada época y a valores de hoy con el IPC encadenado.
Uso: python3 scripts/build-birth-economy.py <carpeta-de-insumos>
"""
import json, sys, csv, datetime, os

W = sys.argv[1] if len(sys.argv) > 1 else '.'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
S = json.load(open(os.path.join(W, 'series.json')))
ym = lambda d: d[:7]
def mp(rows): return {ym(a): b for a, b in rows if b is not None}

START = '1943-01'
def months(a, b):
    y, m = map(int, a.split('-')); out = []
    while f'{y}-{m:02d}' <= b:
        out.append(f'{y}-{m:02d}'); m += 1
        if m > 12: m = 1; y += 1
    return out

# ---------- IPC encadenado (misma regla que el gráfico de inflación del sitio) ----------
H, SL, N = mp(S['cpiHist']), mp(S['cpiSL']), mp(S['cpiNat'])
last_cpi = max(N)
M = months(START, last_cpi)
idx = {START: 1.0}
for prev, cur in zip(M, M[1:]):
    y = int(cur[:4])
    src = H if y <= 2006 else SL if y <= 2016 else N
    if prev in src and cur in src:
        idx[cur] = idx[prev] * src[cur] / src[prev]
    else:
        raise SystemExit(f'IPC sin dato en {cur}')
base = idx[last_cpi]
cpi = {k: v / base for k, v in idx.items()}           # 1.0 = último mes publicado

# ---------- Tipo de cambio oficial BCRA ($ equivalentes) + extensión con fx-daily ----------
def expand(s):
    out = {}; dt = datetime.date.fromisoformat(s['start'])
    for d, v in zip(s['d'], s['v']):
        dt = dt + datetime.timedelta(days=d or 0)
        if v is not None: out[dt.isoformat()] = v
    return out
fxd = json.load(open(os.path.join(ROOT, 'public', 'fx-daily.json')))
def monthly_avg(daily):
    acc = {}
    for d, v in daily.items(): acc.setdefault(d[:7], []).append(v)
    return {k: sum(v) / len(v) for k, v in acc.items()}
off_m = monthly_avg(expand(fxd['official'])); free_m = monthly_avg(expand(fxd['free']))
fx = mp(S['fxEq'])
for k, v in off_m.items():
    if k > max(fx): fx[k] = v                               # meses posteriores a la serie BCRA
hist = json.load(open(os.path.join(ROOT, 'public', 'macro-history.json')))
fx_free_annual = hist['marketsHistory']['exchangeHistorical']['free']['nominal']   # $ actuales, anual

# ---------- Salarios ----------
CUR = [('1970-01', 1e-13), ('1983-06', 1e-11), ('1985-07', 1e-7), ('1992-01', 1e-4), ('9999-12', 1.0)]
def factor(k):  # pesos actuales por unidad de la moneda vigente en el mes k (regla mensual de la serie SMVM)
    for lim, f in CUR:
        if k < lim: return f
    return 1.0
today = datetime.date.today().strftime('%Y-%m')
smvm = {k: v * factor(k) for k, v in mp(S['smvm']).items() if k <= max(today, last_cpi)}
ripte = mp(S['ripte'])

# ---------- IPC EE.UU. ----------
us = {}
with open(os.path.join(W, 'uscpi.csv')) as f:
    for r in csv.DictReader(f):
        try: us[r['observation_date'][:7]] = float(r['CPIAUCNS'])
        except ValueError: pass

# Oct-2025 no se publicó (cierre del gobierno federal de EE.UU.): se interpola geométricamente entre meses vecinos.
_um = months(min(us), max(us))
for i in range(1, len(_um) - 1):
    k = _um[i]
    if k not in us and _um[i-1] in us and _um[i+1] in us: us[k] = (us[_um[i-1]] * us[_um[i+1]]) ** 0.5
# ---------- Arrays mensuales ----------
END = max(last_cpi, max(fx), max(ripte))
AM = months(START, END)
def r6(x):
    if x is None: return None
    return float(f'{x:.6g}')
arr = lambda d: [r6(d.get(k)) for k in AM]
fx_free = {k: v for k, v in free_m.items() if k >= '1991-04'}

# ---------- PIB (variación anual real) ----------
gdp = {}
lv = {int(a[:4]): b for a, b in S['gdp1935']}
for y in range(1936, 1961):
    if y in lv and y - 1 in lv: gdp[y] = round((lv[y] / lv[y - 1] - 1) * 100, 1)
for y, v in S['wbGdp']:
    if v is not None and int(y) >= 1961: gdp[int(y)] = round(v, 1)

# ---------- Personas ----------
wp = json.load(open(os.path.join(W, 'wp.json')))
def person(x, kind):
    key = x.get('wiki') or x['name']; w = wp.get(key) or {}
    o = {'name': x['name'], 'start': x['start'], 'end': x['end']}
    if kind == 'p': o['type'] = x.get('type')
    else: o['ministry'] = x.get('ministry')
    if w and not w.get('missing'):
        o['wiki'] = w.get('url'); o['photo'] = (w.get('thumb') or '').split('?')[0] or None
    if x.get('note'): o['note'] = x['note']
    if 'Junta' in x['name']: o['photo'] = None
    return o
P = [person(x, 'p') for x in json.load(open(os.path.join(W, 'people', 'presidents.json')))]
Mn = [person(x, 'm') for x in json.load(open(os.path.join(W, 'people', 'ministers.json')))]

# ---------- Bienes ----------
goods = json.load(open(os.path.join(W, 'people', 'goods.json')))
staples = json.load(open(os.path.join(W, 'people', 'staples.json')))
CURF = {'m$n': 1e-13, '$ley': 1e-11, '$a': 1e-7, 'A': 1e-4, '$': 1.0}
def pts(g, usd=False):
    out = []
    for p in g.get('points', []):
        if p.get('doubtful'): continue
        o = {'p': p['period'], 'src': p['source']}
        if p.get('model'): o['model'] = p['model']
        if usd: o['usd'] = p['price']
        else:
            if p['currency'] not in CURF: continue
            o['ars'] = r6(p['price'] * CURF[p['currency']]); o['cur'] = p['currency']; o['nominal'] = p['price']
        if p.get('note') and 'intervened' in p['note']: o['flag'] = 'INDEC intervenido (2007–2015): precios oficiales subestimados'
        out.append(o)
    return out
nat_prices = {'bread': mp(S['bread']), 'beef': mp(S['beef']), 'milk': mp(S['milk'])}
basket = {}
for key, label in [('bread', 'Pan francés (1 kg)'), ('beef', 'Asado (1 kg)'), ('milk', 'Leche entera (1 litro)')]:
    pp = pts(staples.get(key, {}))
    have = {p['p'] for p in pp}
    for k, v in nat_prices[key].items():   # serie mensual INDEC 2016-04+ (precios promedio GBA)
        if k not in have: pp.append({'p': k, 'ars': r6(v), 'cur': '$', 'nominal': v, 'src': 'https://www.indec.gob.ar/ftp/cuadros/economia/sh_ipc_precios_promedio.xls'})
    pp.sort(key=lambda x: x['p'])
    basket[key] = {'label': label, 'area': 'GBA', 'points': pp}
basket['car'] = {'label': 'Auto 0 km más barato', 'points': pts(goods['car'])}
basket['apartment'] = {'label': 'Departamento de 50 m² usado en CABA', 'm2': 50, 'points': pts(goods['apartment'], usd=True),
                       'note': '2001–2011: precio de oferta promedio (GCBA, Planeamiento); 2016+: departamentos usados de 2 ambientes (IDECBA). Series no empalmadas.'}

out = {
    'schema': 1, 'generated': today, 'start': START, 'end': END, 'cpiBase': last_cpi,
    'notes': {
        'cpi': 'IPC INDEC (GBA) 1943–2006; IPC San Luis 2007–2016 (INDEC intervenido); IPC Nacional INDEC desde 2017.',
        'fx': 'Tipo de cambio oficial/de referencia BCRA (series históricas monetarias); desde mayo 2026, promedio mensual del oficial. Dólar libre: promedio mensual desde 1991 y referencia anual antes.',
        'salary': 'Sueldo promedio: RIPTE (desde julio 1994). Antes no existe una serie oficial de sueldo promedio: se muestra el salario mínimo, vital y móvil (desde 1965).',
        'gdp': 'PIB a precios constantes: Cuentas Nacionales 1935–1962 (Secretaría de Asuntos Económicos) hasta 1960; Banco Mundial (INDEC) desde 1961.',
    },
    'cpi': arr(cpi), 'usCpi': arr(us), 'fx': arr(fx), 'fxFree': arr(fx_free), 'smvm': arr(smvm), 'ripte': arr(ripte),
    'fxFreeAnnual': {k: r6(v) for k, v in fx_free_annual.items()},
    'gdp': gdp,
    'currencies': [
        {'from': '1881-11-05', 'to': '1969-12-31', 'name': 'Peso moneda nacional', 'sym': 'm$n', 'f': 1e-13},
        {'from': '1970-01-01', 'to': '1983-05-31', 'name': 'Peso ley 18.188', 'sym': '$ ley', 'f': 1e-11},
        {'from': '1983-06-01', 'to': '1985-06-14', 'name': 'Peso argentino', 'sym': '$a', 'f': 1e-7},
        {'from': '1985-06-15', 'to': '1991-12-31', 'name': 'Austral', 'sym': '₳', 'f': 1e-4},
        {'from': '1992-01-01', 'to': None, 'name': 'Peso', 'sym': '$', 'f': 1.0},
    ],
    'presidents': P, 'ministers': Mn, 'basket': basket,
}
dst = os.path.join(ROOT, 'public', 'birth-economy.json')
json.dump(out, open(dst, 'w'), ensure_ascii=False, separators=(',', ':'))
print('ok', dst, os.path.getsize(dst), 'meses', len(AM), AM[0], AM[-1], 'IPC base', last_cpi)

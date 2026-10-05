#!/usr/bin/env python3
"""v135 · "Un día como hoy": arma public/efemerides.json con un hecho económico por día del año (366).

Fuentes, en orden de prioridad:
  1. data/efemerides-curadas.json: hechos verificados uno por uno (fecha exacta + fuente).
  2. Asunciones de ministros de Economía/Hacienda (public/birth-economy.json, Wikipedia).
  3. Movimientos extremos de mercado calculados con las series diarias del sitio: Merval (desde 1996) y
     riesgo país (desde 1999), con controles de datos aislados y, desde 2013, control cruzado con el Merval en USD.
     (El dólar diario no se usa: la serie oficial mezcla fuentes y no es apta para fechar saltos de un día.)
Cada día muestra el hecho de mayor peso; los demás quedan como "también un día como hoy".
"""
import json, os, datetime, math

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = lambda *a: os.path.join(ROOT, *a)
MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
fnum = lambda x, d=1: f"{x:,.{d}f}".replace(',', 'X').replace('.', ',').replace('X', '.')

events = []
for e in json.load(open(P('data', 'efemerides-curadas.json'))):
    events.append({'date': e['date'], 'title': e['title'], 'text': e['text'], 'cat': e['cat'], 'w': int(e['w']), 'source': e['source'], 'kind': 'hecho'})

# ---------- Ministros ----------
BIG = {'Alfredo Gómez Morales': 60, 'Álvaro Alsogaray': 62, 'Adalbert Krieger Vasena': 70, 'José Ber Gelbard': 65, 'Celestino Rodrigo': 66,
       'José Alfredo Martínez de Hoz': 72, 'Lorenzo Sigaut': 55, 'Roberto Alemann': 55, 'Juan Vital Sourrouille': 70, 'Juan Carlos Pugliese': 55,
       'Miguel Ángel Roig': 55, 'Néstor Rapanelli': 55, 'Antonio Erman González': 60, 'Domingo Cavallo': 75, 'Roque Fernández': 58,
       'José Luis Machinea': 60, 'Ricardo López Murphy': 60, 'Jorge Remes Lenicov': 62, 'Roberto Lavagna': 68, 'Felisa Miceli': 45,
       'Martín Lousteau': 50, 'Amado Boudou': 50, 'Axel Kicillof': 62, 'Alfonso Prat-Gay': 60, 'Nicolás Dujovne': 55, 'Hernán Lacunza': 55,
       'Martín Guzmán': 60, 'Silvina Batakis': 55, 'Sergio Massa': 65, 'Luis Caputo': 72, 'Ramón Cereijo': 50, 'Federico Pinedo': 62,
       'Raúl Prebisch': 60, 'Roberto Teodoro Alemann': 55, 'Federico Pinedo (hijo)': 55}
be = json.load(open(P('public', 'birth-economy.json')))
seen = set()
for m in be['ministers']:
    if not m.get('start') or m['start'] < '1900': continue
    name = m['name']
    nth = sum(1 for x in be['ministers'] if x['name'] == name and x['start'] < m['start'])
    w = BIG.get(name, 35) - (8 if nth else 0)
    cargo = (m.get('ministry') or 'Ministerio de Economía').replace('Ministerio de ', 'ministro de ')
    events.append({'date': m['start'], 'title': f"Asume {name}{' por segunda vez' if nth else ''}", 'cat': 'ministro', 'w': w, 'kind': 'ministro',
                   'text': f"{name} jura como {cargo}{' y vuelve al cargo que ya había ocupado' if nth else ''}."
                           + (f" Permanece hasta el {int(m['end'][8:])} de {MESES[int(m['end'][5:7]) - 1]} de {m['end'][:4]}." if m.get('end') else ' Sigue en funciones.'),
                   'source': m.get('wiki') or ''})

# ---------- Series diarias ----------
def decode(s):
    d0 = datetime.date.fromisoformat(s['start']); out = []; cur = d0
    for i, (dd, v) in enumerate(zip(s['d'], s['v'])):
        cur = cur + datetime.timedelta(days=dd) if i else d0
        if v is not None: out.append((cur, float(v)))
    return out
md = json.load(open(P('public', 'markets-daily.json')))
fx = json.load(open(P('public', 'fx-daily.json')))
SER = {
    'merval': (decode(md['mervalPoints']), 'Merval', 'puntos'),
    'risk': (decode(md['countryRisk']), 'riesgo país', 'pb'),
    'official': (decode(fx['official']), 'dólar oficial', '$'),
    'free': (decode(fx['free']), 'dólar libre', '$'),
}
moves = []
# Control cruzado del Merval (desde 2013): la serie en USD (Merval CCL) es independiente de la de puntos.
# El CCL implícito del día debe moverse parecido al dólar libre; si no, el dato en puntos es dudoso.
usd = dict((d, v) for d, v in decode(md['mervalUsd']))
blue = dict(SER['free'][0])
def merval_ok(d0, a, d1, b):
    if d1.weekday() >= 5: return False
    if d1.year < 2013: return True
    ua, ub, fa, fb = usd.get(d0), usd.get(d1), blue.get(d0), blue.get(d1)
    if not (ua and ub): return False
    ccl = ((b / a) / (ub / ua) - 1) * 100
    fx_ch = ((fb / fa) - 1) * 100 if fa and fb else 0
    return abs(ccl - fx_ch) <= 6
# Cambios de composición del índice EMBI (no son movimientos de mercado) y fechas dudosas.
RISK_SKIP = {'2005-06-13', '2005-06-14', '2005-06-30', '2005-11-30', '2014-07-30', '2014-07-31', '2016-04-27', '2020-09-10'}
RISK_FALLS = {'2025-09-22', '2025-10-27', '2025-04-15'}
# Contexto de las ruedas extremas que tienen una causa conocida (se agrega al texto del dato de mercado).
CONTEXT = {
    '1998-08-27': 'Es el contagio de la crisis rusa, que acababa de declarar el default de su deuda.',
    '1998-09-11': 'Rebote tras las semanas de pánico por la crisis rusa.',
    '1999-01-13': 'Brasil devalúa el real y el temor al contagio golpea a la plaza local.',
    '1999-01-15': 'Rebote después del sacudón por la devaluación brasileña.',
    '2001-07-12': 'Al día siguiente del anuncio del plan de «déficit cero» de Cavallo, en plena corrida contra la convertibilidad.',
    '2001-12-04': 'Primeros días del corralito, que restringió el retiro de efectivo de los bancos.',
    '2007-02-27': 'Contagio del derrumbe de la Bolsa de Shanghái, que arrastró a los mercados del mundo.',
    '2008-09-19': 'Rebote global tras el anuncio del rescate financiero en EE.UU., días después de la quiebra de Lehman Brothers.',
    '2008-09-29': 'El Congreso de EE.UU. rechaza en primera votación el plan de rescate financiero.',
    '2008-10-22': 'Un día después del anuncio de la estatización de las AFJP, en plena crisis financiera global.',
    '2008-11-24': 'Rebote global tras el rescate de Citigroup en EE.UU.',
    '2011-08-08': 'Primera rueda tras la rebaja de la calificación de la deuda de EE.UU. por S&P.',
    '2012-11-26': 'Tras el fallo del juez Griesa que ordenó pagar a los fondos buitre.',
    '2014-07-31': 'Al día siguiente del default selectivo por el fallo de Griesa a favor de los holdouts.',
    '2015-08-24': 'El «lunes negro» de los mercados por el derrumbe de la Bolsa china.',
    '2019-08-09': 'Última rueda antes de las PASO, con encuestas que anticipaban un resultado parejo.',
    '2019-08-13': 'Segunda rueda tras la derrota del oficialismo en las PASO.',
    '2020-03-09': 'Derrumbe mundial por el avance del COVID-19 y la guerra de precios del petróleo.',
    '2020-03-16': 'Pánico global por la pandemia de COVID-19.',
    '2020-03-18': 'Pánico global por la pandemia de COVID-19.',
    '2020-03-23': 'En plena caída global por la pandemia y con la deuda argentina camino a reestructurarse.',
    '2023-08-15': 'Primera rueda tras las PASO y la devaluación del 22% del dólar oficial.',
    '2023-08-16': 'Rebote de las acciones después de las PASO y la devaluación.',
    '2023-11-21': 'Primera rueda tras el triunfo de Javier Milei en el balotaje del 19 de noviembre.',
    '2025-04-04': 'Derrumbe global por los aranceles anunciados por EE.UU.',
    '2025-04-09': 'Rebote global cuando EE.UU. suspende por 90 días buena parte de los aranceles.',
    '2025-04-15': 'Segunda rueda tras la salida del cepo y el nuevo esquema de bandas cambiarias.',
    '2025-09-08': 'Primera rueda tras la derrota del oficialismo en las elecciones bonaerenses del 7 de septiembre.',
    '2025-10-27': 'Primera rueda tras el triunfo del oficialismo en las elecciones legislativas del 26 de octubre.',
}
CLOSED = {'01-01', '12-25'}   # sin ruedas: un dato ahí es un error de la serie
def spiky(rows, i):
    """Dato aislado: el valor vuelve casi por completo al anterior (en el punto siguiente) o el previo era un pico."""
    (d0, a), (d1, b), (d2, c) = rows[i - 1], rows[i], rows[i + 1]
    ch = b / a - 1
    if c > 0 and abs(c / a - 1) < abs(ch) * 0.25: return True
    if i >= 2:
        z = rows[i - 2][1]
        if z > 0 and abs(a / z - 1) >= 0.05 and abs(b / z - 1) < abs(a / z - 1) * 0.25: return True
    return False
for key in ('merval', 'risk'):
    rows, label, unit = SER[key]
    for i in range(2, len(rows) - 1):
        (d0, a), (d1, b) = rows[i - 1], rows[i]
        if (d1 - d0).days > 4 or a <= 0 or b <= 0 or d1.weekday() >= 5 or d1.isoformat()[5:] in CLOSED: continue
        ch = (b / a - 1) * 100
        if abs(ch) < 5 or spiky(rows, i): continue
        if key == 'merval' and abs(ch) >= 6 and merval_ok(d0, a, d1, b):
            w = min(78, 18 + abs(ch) * 3.2)
            t = f"El Merval {'se desploma' if ch < 0 else 'se dispara'} {fnum(abs(ch))}% en una rueda" if abs(ch) >= 10 else f"El Merval {'cae' if ch < 0 else 'sube'} {fnum(abs(ch))}% en el día"
            txt = f"El índice de la Bolsa porteña pasa de {fnum(a, 0)} a {fnum(b, 0)} puntos, una de las {'mayores caídas' if ch < 0 else 'mayores subas'} diarias de su historia."
            moves.append({'date': d1.isoformat(), 'title': t, 'text': txt, 'cat': 'bolsa', 'w': round(w), 'mag': abs(ch)})
        elif key == 'risk' and d1.isoformat() not in RISK_SKIP and ((ch >= 12 or (b - a) >= 250) or (ch <= -15 and d1.isoformat() in RISK_FALLS)):
            w = min(70, 16 + abs(ch) * 1.6 + abs(b - a) / 40)
            t = f"El riesgo país {'salta' if ch > 0 else 'se derrumba'} {fnum(abs(b - a), 0)} puntos en un día"
            txt = f"El índice EMBI de J.P. Morgan pasa de {fnum(a, 0)} a {fnum(b, 0)} puntos básicos ({'+' if ch > 0 else '−'}{fnum(abs(ch))}%)."
            moves.append({'date': d1.isoformat(), 'title': t, 'text': txt, 'cat': 'riesgo', 'w': round(w), 'mag': abs(ch)})
# Si un hecho curado ya explica ese día (mismo año y fecha), no se repite el dato de mercado.
curated_dates = {e['date'] for e in events if e['kind'] == 'hecho'}
for m in moves:
    if m['date'] in curated_dates: continue
    if m['date'] in CONTEXT: m['text'] += ' ' + CONTEXT[m['date']]; m['w'] += 8
    m.update(kind='mercado', source='Series diarias de macrodatos.ar: Merval (BYMA vía zion.ar) y riesgo país EMBI (J.P. Morgan vía ArgentinaDatos)')
    events.append(m)

# Respaldo para días sin ningún hecho: el mayor movimiento del Merval de esa fecha en cualquier año.
by_day = {}
for e in events: by_day.setdefault(e['date'][5:], []).append(e)
mer = SER['merval'][0]
best = {}
for i in range(2, len(mer) - 1):
    (d0, a), (d1, b) = mer[i - 1], mer[i]
    if (d1 - d0).days > 4 or a <= 0 or spiky(mer, i) or not merval_ok(d0, a, d1, b): continue
    ch = (b / a - 1) * 100; k = d1.isoformat()[5:]
    if k not in best or abs(ch) > abs(best[k][2]): best[k] = (d1, a, ch, b)
all_days = [(datetime.date(2024, 1, 1) + datetime.timedelta(days=i)).isoformat()[5:] for i in range(366)]
for k in all_days:
    if by_day.get(k) or k not in best: continue
    d1, a, ch, b = best[k]
    by_day[k] = [{'date': d1.isoformat(), 'title': f"El Merval {'cae' if ch < 0 else 'sube'} {fnum(abs(ch))}% en el día", 'cat': 'bolsa', 'w': 10, 'kind': 'mercado',
                  'text': f"Es la variación diaria más grande registrada en esta fecha: el índice pasa de {fnum(a, 0)} a {fnum(b, 0)} puntos.",
                  'source': 'Serie diaria del Merval de macrodatos.ar (BYMA vía zion.ar)'}]

out, missing = {}, []
for k in all_days:
    lst = sorted(by_day.get(k, []), key=lambda e: (-e['w'], e['date']))
    if not lst: missing.append(k); continue
    clean = lambda e: {x: e[x] for x in ('date', 'title', 'text', 'cat', 'source', 'kind') if e.get(x)}
    out[k] = {'main': clean(lst[0]), 'more': [clean(e) for e in lst[1:4]]}
doc = {'schema': 1, 'generated': datetime.date.today().isoformat(),
       'notes': 'Un hecho por día: hechos verificados (data/efemerides-curadas.json), asunciones de ministros y movimientos extremos de mercado calculados con las series diarias del sitio.',
       'days': out}
json.dump(doc, open(P('public', 'efemerides.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
kinds = {}
for v in out.values(): kinds[v['main']['kind']] = kinds.get(v['main']['kind'], 0) + 1
print('días', len(out), '| sin hecho', missing, '| principal por tipo', kinds, '| movimientos', len(moves))

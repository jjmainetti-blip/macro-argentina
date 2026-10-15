# Macrodatos (macrodatos.ar) — Cloudflare

Migración de la v63 desde Netlify a Cloudflare Workers + Static Assets.

## Arquitectura
- `public/`: frontend estático.
- `src/worker.mjs`: router del Worker.
- `src/api/macro-data.mjs`: backend de `/api/macro-data`.
- `src/api/calendar-data.mjs`: backend de `/api/calendar-data`.
- `wrangler.jsonc`: configuración de Cloudflare.

## Deploy recomendado (Cloudflare Dashboard + GitHub)
1. Subir este proyecto a un repositorio GitHub.
2. En Cloudflare: Workers & Pages → Create → Import a repository.
3. Seleccionar el repositorio.
4. Build command: dejar vacío (no hay build del frontend).
5. Deploy command: `npx wrangler deploy`.
6. Cloudflare detectará `wrangler.jsonc` y publicará frontend + APIs como una sola aplicación.

## Deploy desde terminal
```bash
npm install
npx wrangler login
npm run deploy
```

## Desarrollo local
```bash
npm install
npm run dev
```

Las URLs del navegador permanecen iguales: `/api/macro-data` y `/api/calendar-data`.


## v66
- Explorador de tarjetas: últimas 12 observaciones disponibles.
- Resultado fiscal: histórico mensual primario y financiero incorporado desde publicaciones oficiales de Hacienda.
- Mora bancaria: histórico reciente total/familias/empresas incorporado desde Informe sobre Bancos del BCRA.
- Las tarjetas sin histórico verificable siguen sin interpolación artificial.


## v66
Tarjetas: últimas 12 observaciones disponibles. Se incorporan históricos de resultado fiscal, cemento AFCP, ISAC INDEC, patentamientos ACARA, crédito BCRA y mora bancaria.

## v103 — históricos snapshot-first

La API `/api/macro-data` conserva el último snapshot válido por fuente y fusiona las actualizaciones sin permitir que una respuesta parcial recorte una serie histórica ya almacenada.

Persistencia:
- `MACRO_STORE` (Cloudflare KV, recomendado): conserva el snapshot entre isolates y despliegues.
- Sin KV: el Worker conserva snapshot durante la vida del isolate y el navegador conserva el último `/api/macro-data` válido en `localStorage` (`macroArgentinaSnapshotV102`).
- Los mercados intradiarios continúan fuera de este snapshot y se consultan por `/api/markets`.

Para activar persistencia durable, crear un namespace KV en Cloudflare y vincularlo al Worker con el nombre de binding exacto `MACRO_STORE`. No se incluye un `namespace_id` ficticio en `wrangler.jsonc` porque impediría desplegar el proyecto en otra cuenta.


## v104 — snapshot histórico completo
IPC, IPI, ISAC, balanza comercial, recaudación e ICG se incluyen localmente. Las fuentes remotas sólo refrescan o agregan períodos nuevos; una respuesta más corta no elimina historia local.


## v113 — tarjetas sin gráfico histórico
Síntoma: inflación nacional, inflación CABA, EMAE, IPI, recaudación, ICG, patentamientos, ISAC, resultado fiscal, crédito privado y mora bancaria abrían el explorador sin gráfico.

Causas corregidas:
1. `/api/macro-data` fallaba siempre: llamaba a `activityPulse()`, que no existía (ReferenceError). Se implementó la función y cada fuente corre aislada, de modo que un error en una no tumba la respuesta completa.
2. El histórico local (`macro-history.json`) se guardaba en `kpiSourceCache.sources.*`, pero las tarjetas leen `kpiSourceCache.*`; además la respuesta de la API reemplazaba el objeto entero. Ahora hay dos capas (local y API) que se fusionan siempre.
3. EMAE e ISAC llegan de Datos Argentina como fracción (0,064 = 6,4%) y se redondeaban a 0,1. Se convierten a %.
4. EMAE, crédito, mora, resultado fiscal y patentamientos no tenían histórico local: se agregaron a `macro-history.json` y a `bundled-history.mjs`.
5. Caché de `fetch` del Worker sin vencimiento (datos viejos mientras viviera el isolate): ahora 10 minutos.
6. Mora: los meses del Informe sobre Bancos se calculan dinámicamente (antes, lista fija hasta jul-2026) y la base es la serie oficial `332.2_SISTEMA_FIADA__53`.

Fuentes de los históricos agregados:
- EMAE: `143.3_ICE_SERVIA_2004_A_25` · Crédito: `91.1_PEFPC_0_0_35` · Mora: `332.2_SISTEMA_FIADA__53` + Informe sobre Bancos (may–jul 2026).
- Resultado fiscal: IMIG `452.3_RESULTADO_RIO_0_M_18_54` y `452.3_RESULTADO_ERO_0_M_20_25`, acumulado en el año sobre PIB nominal INDEC `4.4_OGP_2004_T_17` (promedio de trimestres anualizados; para el año en curso el PIB se estima con el año anterior × variación de los trimestres publicados). Se refresca en vivo.
- Patentamientos: ACARA/SIOMAA (informes mensuales). ACARA no ofrece una API pública, así que esta serie **se actualiza a mano**: agregar el mes nuevo en `autosMonthly` (`public/macro-history.json`) y en `activityPulse.autos` (`src/api/bundled-history.mjs`).

Chequeo: `npm run validate:snapshot`.


## v114 — EMAE, crédito y mora
- **EMAE**: la tarjeta muestra grande la variación mensual desestacionalizada y abajo la interanual del mismo mes. El gráfico muestra los últimos 60 meses de la variación mensual s.e. (`143.3_ICE_SER_VM_2004_A_34`, INDEC vía Datos Argentina).
- **Crédito privado**: el gráfico muestra la variación mensual real sin estacionalidad de los préstamos en pesos al sector privado, tal como la publica el BCRA en el Informe Monetario Mensual (no hay serie descargable). Nov-2021 y feb-2024 quedan como hueco porque el BCRA no publicó la cifra total. El Worker lee los últimos informes para incorporar meses nuevos.
- **Mora bancaria**: gráfico de líneas con total, familias y empresas, últimos 10 años (121 meses), desde el Anexo del Informe sobre Bancos (hoja "Calidad de Cartera (por líneas)"). El Worker lee esa hoja directamente.


## v115 — tarjetas: orden, semáforo y presentación única
- **Orden**: las tarjetas se ordenan por período de referencia, del más reciente al más antiguo (empates: orden original). Se reordenan solas cuando llega un dato nuevo.
- **Presentación**: todas las tarjetas se arman en `renderKpiCards()` (app.js) desde los mismos datos que los gráficos.
  - Inflación nacional y CABA: grande la variación mensual; abajo p.p. vs mes anterior e interanual.
  - EMAE, IPI e ISAC: grande variación mensual desestacionalizada; abajo interanual (IPI `453.1_SERIE_DESEADA_0_0_24_58`, ISAC `33.2_ISAC_SIN_EDAD_0_M_23_56`). Sus gráficos pasan a la misma medida.
  - Recaudación: grande interanual real; abajo interanual nominal.
  - Crédito: grande mensual real s.e.; abajo interanual nominal.
  - Cemento y patentamientos: grande interanual; abajo volumen del mes.
  - Confianza en el gobierno: grande variación mensual; abajo puntos e interanual.
  - Niveles (una variación no tiene sentido): pobreza, balanza, resultado fiscal y mora; abajo la comparación en p.p. o USD.
- **Semáforo** (verde favorable / amarillo neutral / rojo desfavorable; el motivo aparece al pasar el mouse):
  - Inflación: baja/sube más de 0,1 p.p. vs mes anterior. Mora: ídem. Pobreza: ±0,3 p.p.
  - EMAE, IPI, ISAC, crédito: variación mensual s.e. mayor/menor a ±0,1%.
  - Recaudación real, cemento, patentamientos: interanual mayor/menor a ±0,5%.
  - Confianza: variación mensual mayor/menor a ±1%.
  - Balanza: verde superávit ≥ año anterior; amarillo superávit menor; rojo déficit.
  - Resultado fiscal: verde superávit primario y financiero; amarillo sólo primario; rojo déficit primario.
  - Los umbrales están en `computeKpiCards()` (función `signalFrom(valor, banda, mayorEsMejor)`).


## v116 — ILA e IGA
- **Índice Líder de Actividad (ILA-ARG)**, CICEc (Bolsas de Comercio de Santa Fe y Rosario). El Worker busca el Excel vigente en `cicec.ar/base-de-datos` (`Data_ARG_AAAAMM.xlsx`, hoja "CICEC") y lee nivel, tasa mensual, interanual e índice de difusión. Ojo: en esa hoja los meses son números de Excel y octubre llega como `AAAA.1`; el lector lo contempla. Tarjeta: grande variación mensual; abajo interanual e índice de difusión. Gráfico: variación mensual, últimos 60 meses. CICEc publica ~fin de cada mes.
- **Índice General de Actividad (IGA-OJF)**, Orlando J. Ferreres & Asociados. El Worker toma el enlace vigente a la síntesis pública (PDF en Google Drive) desde `ojf.com/Informes-Libre-Acceso`, lo descarga y lee la tabla de los últimos ~37 meses con un extractor de texto de PDF propio (sin dependencias). Tarjeta: grande variación mensual desestacionalizada; abajo interanual (igual que EMAE). Gráfico: variación mensual s.e. de los meses publicados. La serie completa de OJF es sólo para clientes; el sitio acumula los meses nuevos a medida que salen (con KV), sin borrar los anteriores. Los últimos 4 meses los revisa OJF y se actualizan solos.
- Si OJF cambia el formato del PDF o CICEc el de la planilla, el sitio sigue mostrando el último dato incluido y la API informa el error en `refreshError`.


## v117 — gráficos de dólar, riesgo país, Merval, tasa y salario
**Causa**: una sola llamada a `/api/macro-data` hacía 66+ pedidos externos. Cloudflare limita los pedidos por invocación (50 en el plan gratuito) y los que exceden fallan; esos cinco gráficos no tenían histórico local, así que quedaban vacíos.

**Cambios**
- La API se divide en grupos: `/api/macro-data?group=core|history|markets|activity|leading` (entre 4 y 24 pedidos cada uno). El sitio los pide en paralelo y procesa cada uno al llegar. Sin `group` sigue devolviendo todo (compatibilidad), pero el sitio ya no lo usa.
- Snapshot por grupo en KV (`macro:snapshot:v117:<grupo>`).
- Histórico local para mercados y salario (`marketsHistory` en `macro-history.json` y en `bundled-history.mjs`), generado con las mismas funciones del backend sobre datos reales al 30-sep-2026. Diario: últimos 400 días; el resto mensual/anual. La API agrega el diario completo cuando responde.
- RIPTE: la página de argentina.gob.ar pasa a ser opcional (antes, si no respondía, se perdía toda la serie aunque el CSV oficial ya se hubiera leído).
- CPI de EE.UU. (BLS): si la API no responde se usa el respaldo; antes se perdía el tipo de cambio real (TCR).


## v118 — calculadora de actualización (ICL, CER, UVA)
- **Causa**: ICL, CER y UVA dependían sólo de la API, que los lee del archivo plano del BCRA (`tas5_ser.txt`, ~3,8 MB). Si el BCRA rechaza o demora el pedido desde Cloudflare, la calculadora los deshabilitaba y sólo quedaba el IPC.
- **Respaldo local**: `public/contract-indices.json` (≈165 KB) con las series diarias completas — ICL (7988) desde 2020, CER (3540) desde 2002, UVA (7913) desde 2016 — en formato compacto (fecha inicial + valores consecutivos). La API suma los días nuevos cuando responde.
- Los pedidos a sitios oficiales (BCRA, INDEC, argentina.gob.ar) se hacen con un agente de navegador estándar.
- Resultado con más precisión: índices con hasta 4 decimales, variación con 2 y factor con 4.
- Para actualizar el respaldo a mano: descargar `tas5_ser.txt` del BCRA y regenerar el JSON (series 7988, 3540, 7913).


## v119 — Merval y riesgo país diarios; RIPTE en ARS constantes
- **Merval** diario desde el 8-oct-1996 (`public/markets-daily.json`, formato compacto). Selector: **USD constantes (TCR)** (por defecto) o **Puntos**.
  - USD: 1996–2001 a 1 peso = 1 USD (convertibilidad); ene–mar 2002 sin tipo de cambio diario (hueco); mar-2002–2010 ÷ dólar mayorista A3500 (BCRA, `168.1_T_CAMBI500_D_0_0_17`); 2011–2012 ÷ dólar libre como aproximación al CCL; desde 2013 Merval CCL (zion.ar).
  - USD constantes: se ajusta por CPI-U de EE.UU. (FRED `CPIAUCNS`) al último mes disponible.
- **Riesgo país** diario desde el 22-ene-1999 hasta el último cierre (ArgentinaDatos).
- La API (`group=markets`) agrega los últimos 400 días de ambas series; el histórico completo viene del archivo local.
- El gráfico histórico acepta datos diarios: rango 5/10/20 años, selector de período por año y zoom.
- **RIPTE**: por defecto en ARS constantes. Si la cadena IPC completa no está disponible, se deflacta con el IPC INDEC mensual (histórico local desde 2017) y, hacia atrás, la inflación anual dic/dic repartida por mes.


## v120 — "Mercados ahora" en vivo (cada 30 s)
- **Refresco**: el bloque consulta `/api/markets` cada 30 segundos mientras la pestaña está visible, y de inmediato al volver a ella. La insignia muestra la hora de la última actualización.
- **Sello de tiempo** en cada valor: "Hoy · HH:MM · fuente" si es de la rueda del día; "Cierre dd/mm/aaaa · fuente" si es un cierre anterior.
- **Riesgo país**: Ámbito (JSON público) → Rava (sólo si dice "actualizado" hoy) → Infobae → último cierre de ArgentinaDatos. Antes se caía casi siempre al último cierre (fecha de ayer).
- **Merval**: BYMA (API pública BYMADATA, cotización del día y cierre anterior) → Rava (~10 min de demora) → zion.ar (último cierre).
- **Carga sobre las fuentes**: `/api/markets` comparte una respuesta de 20 s (Cache API + memoria del isolate); los históricos usados para el cierre anterior se reutilizan 1 hora.


## v131 — mora bancaria en un grupo propio

- En macrodatos.ar (plan pago ya activo) todos los grupos respondían salvo `activity`, que seguía con error 1102 en ~0,6 s: el anexo xlsx del Informe sobre Bancos del BCRA es un libro grande y leerlo entero supera la memoria por invocación.
- La mora (`arrearsHistorical`) pasa a un grupo propio (`/api/macro-data?group=banks`) y del anexo se lee sólo la hoja “Calidad de Cartera (por líneas)” en modo compacto. Si aun así fallara, sólo afecta a esa tarjeta (EMAE, ISAC, crédito, fiscal y cemento quedan independientes).

## v130 — nuevo nombre: Macrodatos (macrodatos.ar)

- Marca, título, descripción y etiquetas para compartir (Open Graph, `canonical` → https://macrodatos.ar/). Los pedidos del Worker a las fuentes se identifican como `Macrodatos/1.0 (+https://macrodatos.ar)`.
- **Límite de CPU (error 1102):** en macrodatos.ar varias llamadas a `/api/macro-data` devolvían “Worker exceeded resource limits”: el plan gratuito permite 10 ms de CPU por invocación y descargar/parsear las fuentes y fusionar los históricos lo supera. Ahora las visitas leen el snapshot de KV (< 2 ms) si tiene menos de 15 minutos; el trabajo pesado queda para la revisión programada. Para que esa revisión no se corte, se recomienda el plan Workers Paid (30 s de CPU por invocación).
- El nombre interno del Worker (`macro-argentina-dashboard`) se mantiene a propósito: cambiarlo crearía un Worker nuevo en Cloudflare y perdería el dominio, el KV y las tareas programadas ya configuradas.

## v130 — más precios históricos para “La economía cuando naciste”

- `data/precios.xlsx`: +174 observaciones (columna nueva **Mes** y **Origen** = “v130 búsqueda complementaria”), con la misma metodología: precio nominal en la moneda de cada fecha, fuente y tipo de dato. Principales fuentes: informes de IPC de INDEC con precios promedio (2002–2008 y 2016+), IDECBA (precios de diciembre 2012–2020), Revista Corsa / Parabrisas / Test del Ayer (autos y nafta), CECHA y prensa (nafta), IDECBA (m² 2012–2014).
- Excluidas: testimonios sin fuente documental (leche 1989), datos de otra provincia (pan 2010, La Pampa), precios “filtrados” del INDEC intervenido cuando hay alternativa de mercado (pan 2012) y referencias de m² de segmentos de lujo o redondeadas (1981, 1982, 1990, 1992, 1996).
- Autos con precio publicado en dólares (1991–1998) se pasan a pesos con el tipo de cambio del mes; departamentos con precio en pesos (2000) se pasan a USD/m².

## v129 — “La economía cuando naciste”: salarios 1940–1993 y más precios

- **Salarios:** hasta diciembre de 1993 se usa el salario medio industrial nominal mensual (`data/salarios.xlsx`, con su moneda por fila); desde julio de 1994, el RIPTE. Enero–junio de 1994 se interpola en términos reales con el IPC (los niveles empalman: dic-1993 $ 862,5; jul-1994 $ 874,9). Se dejó de usar el SMVM.
- **Precios:** se incorporó `data/precios.xlsx` (1940–2026; pan, leche, asado, aceite, harina, pescado, papa, pollo, azúcar, manteca, vino, nafta, huevos, café, yerba, arroz, moto, autos 0 km y USD/m² de departamentos) a los precios que ya tenía la sección. Cada observación se fecha en su mes (diciembre/julio/mes indicado; promedios anuales a julio). Autos: el más barato del período.
- **Regla de estimación:** precio exacto del mes si existe; si no, interpolación del precio **real** (IPC; IPC-U de EE.UU. para valores en dólares) entre la observación anterior y la siguiente cuando están separadas por **hasta 24 meses**; en los extremos, la observación más cercana (hasta 6 meses) actualizada por IPC. Si no se cumple, el bien **no se muestra**. Lo mismo para los indicadores sin dato (no hay más “sin dato”).
- Control de calidad: se excluye una observación cuyo precio real salta más de 3 veces contra la vecina (pescado 1955: m$n 12,48 vs 2,05 en 1954).
- Para regenerar: `python3 scripts/build-birth-economy.py <carpeta-de-insumos>` (lee `data/*.xlsx`).

## v128 — actualización automática general de todas las tarjetas

**Diagnóstico.** Había tres tipos de problema:
1. Tarjetas sin fuente en vivo (sólo la línea de base incluida en el sitio): **patentamientos**, **inflación CABA** y **pobreza**. El cemento se consultaba sólo desde el navegador (sin revisión programada ni KV).
2. Lecturas que nunca llegaban al último dato: la API de series de Datos Argentina devuelve como máximo 1.000 filas y se pedían las **más antiguas** (series diarias o largas quedaban truncadas). Ahora se piden las más recientes (`sort=desc`).
3. Fechas fijas que iban a romperse en 2027 (`end_date=2026-12-31` en RIPTE y balanza comercial; cemento con `after=2026-08`). Ahora son dinámicas.

**Fuentes nuevas** (`src/api/live-sources.mjs`):
- Patentamientos: comunicado mensual de **ACARA** (API pública de su sitio, `api.acara.org.ar/api/v1/views/index`); toma el mes nuevo, el mes anterior revisado y el mismo mes del año previo.
- Inflación CABA: IPCBA nivel general (IDECBA) vía Datos Argentina (`193.2_NIVEL_GENERAL_2021_0_13_2`).
- Pobreza: INDEC EPH, personas, por semestre (`64.2_POBLACION_NUA_0_0_34_74`). La tarjeta compara contra el mismo semestre del año anterior y contra el semestre previo.
- Cemento: AFCP desde el Worker (grupo `activity`), además de la consulta existente del navegador.

**Motor de frescura** (`src/api/freshness.mjs`): cada tarjeta tiene su frecuencia, grupo y fecha esperada de publicación (calendario oficial cuando existe —INDEC, ARCA, BCRA, Economía— y si no, el rezago habitual del organismo). Estados: *al día*, *esperando* (ya debería estar publicado) y *demorado* (más de 20 días).

**Revisión programada cada 5 minutos** (dos Cron Triggers desfasados): cada ejecución refresca un grupo; si hay tarjetas “esperando”, 2 de cada 3 ejecuciones se dedican a esos grupos. Resultado: el dato nuevo se captura entre 5 y 20 minutos después de publicado, sin visitas.

**Transparencia:** `GET /api/status` devuelve el estado de cada tarjeta; cada tarjeta muestra abajo “Próximo dato (mes): ~fecha”, “Buscando … · previsto …” o “demorado en la fuente”.

## v127 — “Último dato publicado”

- Bug: `applyReleases` usaba un formateador inexistente (`moneyMillionsToBillions`); cada vez que ARCA respondía, la función fallaba y el bloque quedaba fijo en el ICG. Se agregó el formateador.
- El bloque ahora se ordena por **fecha de publicación** (ARCA: “Publicado dd/mm/aaaa” del comunicado; ICG; balanza de pagos INDEC; IPC y RIPTE con su calendario habitual cuando la fuente no informa la fecha) y usa los datos fusionados (API + respaldo), así funciona aunque la API falle.
- Recaudación: muestra monto, variación nominal y real (marcada “est. REM” mientras no hay IPC).

## v126 — recaudación real estimada con el REM

- Mientras INDEC no publica el IPC del mes, la tarjeta de recaudación calcula la variación **real** con la inflación mensual esperada por el **REM del BCRA** (mediana): índice IPC del último mes publicado × (1 + REM). Hasta dos meses encadenados.
- La tarjeta lo indica: “interanual real estimada” y “IPC estimado con REM (1,8% en sep 2026)”; el gráfico marca ese mes como “(est.)”. Cuando INDEC publica el IPC, se reemplaza solo por el cálculo oficial.
- Backend: `rem()` ahora lee el Excel de tablas del REM más reciente (`relevamiento-expectativas-mercado-tablas-AAAA-MM.xlsx`, hoja “Cuadros de resultados”, bloque IPC nivel general, filas “var. % mensual”) → `sources.rem.cpiExpected.monthly`. Línea de base: REM de agosto 2026 en `macro-history.json` (`remCpiExpected`).

## v125 — revisión automática y memoria permanente (Cloudflare KV + Cron)

- `wrangler.jsonc`: KV `MACRO_STORE` (namespace `macro-argentina-store`, id `e8a8039f8ebd44eaac002420f0174a38`) y Cron Trigger `17 * * * *`.
- `src/worker.mjs` → `scheduled()`: cada hora actualiza un grupo de `/api/macro-data` (horas pares: `core`; impares: rotan `history`, `markets`, `activity`, `leading`, `external`). Así cada invocación respeta el límite de 50 pedidos externos del plan gratuito.
- Snapshots en KV (`macro:snapshot:v125:<grupo>`): sólo se escriben si cambian los datos y como máximo cada 20 minutos por grupo en visitas (la revisión programada siempre puede escribir) → < 500 escrituras/día, dentro del límite gratuito de 1.000.
- Control: Workers → macro-argentina-dashboard → Logs muestra `cron <grupo>: guardado=kv|unchanged …` en cada ejecución.

## v124 — recaudación ARCA: se toma siempre el último comunicado

- Causa del atraso: el Worker leía siempre la misma página de ARCA (la novedad de agosto, `id=5882`), pero ARCA publica cada mes una novedad nueva con otro `id`. Además, el dato leído quedaba sólo como “último dato” y no se agregaba a la serie que usa la tarjeta.
- Ahora el Worker abre la última novedad conocida, sigue los enlaces “Recaudación tributaria de <mes>” del recuadro *Últimas novedades* y se queda con el mes más reciente; ese mes se agrega al histórico (tarjeta y gráfico). El año se deduce de la fecha “Publicado: dd/mm/aaaa” (la de diciembre sale en enero).
- Lectura de texto más tolerante (acentos como entidades HTML, “incremento/aumento interanual”, montos en millones o billones) y agente de navegador para ARCA.
- Línea de base actualizada con septiembre 2026: $ 21.358.918 millones, +38,3% interanual. Mientras INDEC no publique el IPC de septiembre, la tarjeta muestra la variación nominal; cuando salga, pasa sola a real.

## v123 — “La economía cuando naciste”

- Nueva sección (menú: **Cuando naciste**, ancla `#nacimiento`, se puede compartir un mes con `#nacimiento-AAAA-MM`). Se elige mes y año (enero 1943 → hoy) y muestra:
  - **Presidente/a y ministro/a de Economía** de ese mes, con foto (Wikipedia / Wikimedia Commons) y período en el cargo; si hubo cambios durante el mes, se listan también.
  - **Inflación** mensual e interanual (IPC INDEC 1943–2006, IPC San Luis 2007–2016, IPC Nacional desde 2017; la misma cadena del gráfico histórico).
  - **PBI**: variación real del año (Cuentas Nacionales 1935–62 hasta 1960; Banco Mundial/INDEC desde 1961).
  - **Sueldo a valores de hoy**: RIPTE desde julio 1994. Antes no existe una serie oficial de sueldo promedio, así que se usa el **salario mínimo, vital y móvil** (desde 1965), con la aclaración en pantalla. Se compara con el valor actual de la misma serie.
  - **Dólar oficial** en la moneda de la época y a valores de hoy (**TCR bilateral**: ajustado por IPC de Argentina y de EE.UU.); dólar libre y brecha cuando hay dato (mensual desde 1991, referencia anual antes).
  - **Moneda vigente** (m$n, $ ley 18.188, $a, austral, peso) y su equivalencia con el peso actual; avisa si la moneda cambió ese mes.
  - **¿Cuánto costaba?**: pan, asado, leche (INDEC, precios promedio GBA), auto 0 km más barato y departamento de 50 m² en CABA, expresados en sueldos (o kg/litros por sueldo) entonces y hoy. Se usa el precio publicado más cercano (≤ 12 meses para alimentos, ≤ 18 para auto y departamento) y cada precio enlaza a su fuente. No se estima nada: sin dato, se indica “Sin dato para esa época”.
- Datos: `public/birth-economy.json` (≈165 KB, se carga sólo cuando la sección se acerca a la pantalla) y `public/birth.js`. Todos los montos están guardados en pesos actuales equivalentes; el navegador los convierte a la moneda de cada época.
- Para regenerar el JSON: `python3 scripts/build-birth-economy.py <carpeta>` con los insumos descriptos en el encabezado del script.

## v122 — tarjeta de balanza de pagos (INDEC)

- Nueva tarjeta **Balanza de pagos** (INDEC, trimestral): grande el saldo de la cuenta corriente en millones de USD (superávit/déficit); abajo la diferencia contra el mismo trimestre del año anterior y la variación de reservas internacionales por transacciones.
- Semáforo: verde = superávit igual o mayor que un año atrás; amarillo = superávit menor, o déficit pero menor que un año atrás; rojo = déficit igual o mayor.
- Gráfico (últimos 10 años): barras apiladas con los saldos de bienes, servicios, ingreso primario e ingreso secundario, y línea con el saldo de la cuenta corriente.
- Actualización automática: el Worker lee el archivo SDMX oficial `https://www.indec.gob.ar/ftp/cuadros/economia/BOP.xml`, que INDEC reemplaza en cada publicación trimestral. Va en un grupo propio de la API (`/api/macro-data?group=external`, 1 pedido externo) para no sumar CPU a los otros grupos. Si INDEC no responde, se usa el último snapshot o la línea de base incluida (2006-T1 a 2026-T2, publicada el 29/09/2026).
- `scripts/validate-snapshot.mjs` verifica que la cuenta corriente sea igual a la suma de sus componentes en todos los trimestres.

## v121 — gráfico del dólar: series diarias y mensuales desde 1991
- `public/fx-daily.json` (≈120 KB, formato compacto) con el dólar **libre** y el **oficial** diarios desde el 1-abr-1991:
  - 1991-04 a 2001-12: 1 peso = 1 USD (convertibilidad, días hábiles).
  - Libre: desde 2002-01-11 dólar informal/blue (Ámbito, `mercados.ambito.com/dolar/informal/historico-general`).
  - Oficial: 2002-01-11 a 2002-04-08 mayorista; desde 2002-04-09 oficial BNA (Ámbito).
  - Días posteriores al último dato de Ámbito: ArgentinaDatos (que redondea a pesos enteros en 2011-2012, por eso no se usa en ese tramo).
- En el navegador se derivan, con un único método para todo el período: **mensual** (último dato del mes), **ARS constantes** (IPC INDEC mensual; antes de 2017, inflación anual dic/dic repartida por mes), **TCR** (ARS constantes × CPI-U EE.UU.) y **brecha** diaria y mensual (antes la brecha mensual no existía).
- La frecuencia **anual** mantiene la serie larga del backend (desde 1928).
- La API (`group=markets`) envía sólo los últimos 400 días diarios del dólar; el resto viene del archivo local.

## v132 — salario histórico sin saltos artificiales
- La serie mensual de `data/salarios.xlsx` (1943–1993) tenía escalones de un mes a otro que no son económicos: mensualizaciones hechas año por año (salto en cada enero: 1945–49, 1964–67, 1973–77, 1982, 1985, 1986, 1989, 1991, 1992), empalmes con crecimiento nominal constante todo el año (1982, 1985, 1989: +31,2 % todos los meses) y trimestres planos (1975–1981). Ej.: dic-1988 → ene-1989 subía +93,5 % nominal (+78 % real).
- `scripts/build-birth-economy.py` reconstruye la trayectoria con benchmarking tipo Denton: minimiza los cambios mensuales del salario real (deflactado por IPC) con la restricción de que el **promedio nominal de cada año sea exactamente el de la serie original** (se verifica con assert). En años derivados de un índice mensual oficial (1983–84, 1986–88, 1990, 1992–93) se conserva su perfil mensual, suavizado con media móvil de 5 meses para quitar picos estacionales.
- Resultado: entre 1943 y 1993 ningún mes varía más de ±7 % real. Los únicos cambios mensuales grandes que quedan son reales y en RIPTE: abril 2002 (−9 %), diciembre 2023 (−14 %) y la recuperación de abril 2024.
- Limitación: en años con sólo un promedio anual (p. ej. 1989, 1975) la serie no puede mostrar la caída y recuperación dentro del año (hiperinflación, Rodrigazo); el nivel anual sí es el correcto.

## v133 — “Mercados ahora” muestra siempre el último dato al abrir
- Antes, al entrar se veían unos segundos valores viejos (los escritos en `index.html` o una copia local de otro día) hasta que respondía `/api/markets`, que en frío tarda 1–5 s porque consulta BYMA, Rava, dolarapi, etc.
- Ahora el Worker atiende también la portada (`run_worker_first` incluye `/` y `/index.html`) y escribe en el HTML, con `HTMLRewriter`, los últimos valores guardados en KV (`markets:latest`). El navegador recibe además ese dato en `window.__MARKETS__`.
- `/api/markets` guarda cada respuesta en KV, responde desde KV si tiene menos de 60 s y nunca retrocede: si una fuente falla o devuelve un cierre más viejo que el guardado, conserva el más reciente. El cron renueva ese dato en cada ejecución (cada 5 min) aunque nadie visite el sitio.
- En el navegador, cada indicador sólo se reemplaza por uno de igual o mayor fecha (HTML del servidor, copia local o API). `index.html` ya no trae valores fijos: si todo falla muestra “—”.

## v134 — “Último dato publicado” también abre con el dato correcto
- La lógica que elige la publicación más reciente pasó a `public/releases.js` y la usan **el navegador y el Worker** (misma función, mismo texto).
- El Worker la calcula sobre los snapshots de KV (grupos core, external y activity), guarda el resultado chico en KV (`release:latest`, se recalcula cada 10 min en segundo plano y en cada ejecución del cron) y lo escribe en el HTML de la portada junto con “Mercados ahora”.
- En el navegador ya no se pinta primero el ICG fijo ni datos parciales mientras llegan los grupos: se muestra el dato del servidor o la copia local, el más reciente, y sólo se reemplaza por una publicación de igual o mayor fecha.

## v135 — sección “Un día como hoy”
- Nueva sección después de “Pulso económico” (y en el menú): un hecho económico por cada día del año (366, incluido el 29 de febrero), con año, “hace N años”, categoría, texto breve y fuente; botones para recorrer días anteriores/siguientes y “También un día como hoy” con hasta 3 hechos más de la misma fecha.
- `scripts/build-efemerides.py` arma `public/efemerides.json` con prioridad por importancia (campo `w`):
  1. `data/efemerides-curadas.json`: 340 hechos con fecha exacta y fuente (planes, cambios de moneda, devaluaciones, defaults y canjes, acuerdos con el FMI, leyes, renuncias, crisis bancarias, privatizaciones). Para agregar o corregir uno, editar ese archivo y volver a correr el script.
  2. Asunciones de ministros de Economía/Hacienda (de `birth-economy.json`), con más peso para los más relevantes (Cavallo, Martínez de Hoz, Krieger Vasena, Sourrouille, Caputo, etc.).
  3. Ruedas extremas calculadas con las series del sitio: caídas/subas del Merval ≥ 6% (desde 1996) y saltos del riesgo país (desde 1999), con filtros de datos aislados, control cruzado con el Merval en USD desde 2013 y contexto cuando la causa es conocida.
- Resultado: 240 días con un hecho histórico como principal, 23 con una asunción de ministro y 103 con un dato extremo de mercado.

## v136 — menú móvil
- El botón ☰ de la versión móvil no tenía código asociado (el CSS esperaba la clase `open` en `#nav`, pero nadie la ponía). Ahora abre y cierra el menú (cambia a ✕), y se cierra al elegir una sección, al tocar fuera, con Escape o al agrandar la ventana.

## v137 — pobreza semestral, ISAC interanual y ventas minoristas CAME
- **Pobreza:** el gráfico histórico y el de la tarjeta muestran las dos mediciones semestrales de INDEC (1S y 2S) en 2003–2006 y desde 2016 (claves AAAA-06 / AAAA-12 en la serie histórica). Antes se veía un solo semestre por año (y mezclaba el 2.º semestre hasta 2024 con el 1.º desde 2025).
- **ISAC:** la API de Datos Argentina entrega la variación interanual como fracción (−0,045 = −4,5%). La conversión a porcentaje se saltaba porque exigía que todos los valores fueran ≤1,5 en módulo y el rebote de abril 2021 (+240%) lo impedía: la tarjeta mostraba 0,0%. Ahora la serie de la API se convierte siempre, y `fractionMapToPct` decide por el percentil 80.
- **Ventas minoristas pyme (CAME):** tarjeta nueva en Pulso económico (interanual real; abajo, variación mensual desestacionalizada y acumulada del año), gráfico con barras interanuales + línea mensual, entrada en “Último dato publicado” y en el motor de frescura. Histórico ene-2024–sep-2026 tomado de la Tabla 1 del informe de septiembre 2026 (en dic-2025 la variación mensual se toma del gráfico del informe, −5,2%, porque la tabla la muestra sin signo). Actualización automática: `cameLive()` lee los comunicados de redcame.org.ar/prensa.

## v138 — tablero ordenado por fecha de publicación; pobreza en línea; PIB en barras
- Las tarjetas de Pulso económico se ordenan por **fecha de publicación del dato que muestran** (la más reciente primero). La fecha sale de `cardPublication()` en `public/releases.js` (compartido navegador/Worker): (1) fecha exacta que informa la fuente (IPC, ARCA, ACARA, CAME, ICG, balanza de pagos); (2) el día en que el sitio detectó el período nuevo — el Worker lo guarda en KV (`cards:seen`) en cada revisión y lo inyecta en la portada como `window.__CARD_PUB__`; (3) si no, el calendario habitual del organismo (`PUB_RULES`). El HTML trae las tarjetas ya en ese orden para que no se reacomoden al cargar.
- Gráfico de la tarjeta de pobreza: línea (mediciones semestrales).
- Series históricas → PIB: barras verdes (crecimiento) y rojas (caída), con los mismos colores que los gráficos de las tarjetas.

## v139 — calculadoras al final del sitio y cuota de crédito UVA
- **Montos con decimales:** el campo de monto ya no exige múltiplos de 100 (era un `type=number step=100`). Ahora acepta cualquier valor, con coma o punto decimal (`parseAmountAR`: “1.234.567,89”, “1234567.89”, “1,5”), y el resultado muestra centavos.
- La sección **Calculadoras** pasó al final del sitio (y al final del menú).
- **Cuota de crédito hipotecario UVA** (`public/uva-calc.js`): banco o tasa propia (TNA), monto en USD, UVAs o pesos (con su equivalente en las otras unidades), dólar oficial BNA o MEP, plazo 5–30 años. Calcula con sistema francés la cuota inicial en UVAs, pesos y dólares, total a pagar, intereses e ingreso mínimo orientativo (relación cuota/ingreso del banco, 25% por defecto). Avisa si el plazo supera el máximo del banco.
- **Tasas por banco siempre actualizadas:** `/api/uva-loans` (`src/api/uva-loans.mjs`) consulta la API del Régimen de Transparencia del BCRA (`/transparencia/v1.0/Prestamos/Hipotecarios`), toma la línea UVA para vivienda única y permanente y, por entidad, la menor tasa para clientes (sueldo en el banco, cuenta o todos los clientes; si sólo hay otros segmentos lo indica). Caché de 30 min en el edge y 3 h en KV (`uva:loans`); si el BCRA no responde usa el último guardado y, como último recurso, `public/uva-loans.json`. La API informa TEA; la TNA se obtiene como 12 × ((1+TEA)^(1/12) − 1).

## v140 — cemento con cifras provisorias y Expectativas con el último REM
- **Cemento:** AFCP publica primero las cifras **provisorias** (`afcp.info/ESTADISTICAS/DESPACHO-MENSUAL/PAAAAMM/PAAAAMM.html`, enlazadas desde afcp.org.ar/despacho-mensual, en los primeros días del mes) y semanas después las definitivas. El sitio sólo leía las definitivas, por eso septiembre no aparecía. `cement-monthly.mjs` prueba la definitiva y, si no existe, la provisoria (`parseProvisional`: variación interanual del despacho total y toneladas del mes). La revisión automática empieza a buscar el dato nuevo desde el día 4 de cada mes. Septiembre 2026 incorporado: +4,5% interanual, 964 mil toneladas (provisorio).
- **Expectativas:** la sección era texto fijo (REM de agosto). Ahora se arma con el último REM que lee el Worker (`rem()`): PIB del año, dólar de diciembre, inflación de los próximos 12 meses (nuevo: se lee de la tabla xlsx), participantes y fecha de publicación; sin años fijos en las expresiones. REM de septiembre 2026 incorporado como respaldo (también actualiza la inflación esperada que usa la tarjeta de recaudación).

## v141 — Expectativas: REM en lugar de EcoGo y gráficos de evolución
- La tarjeta destacada de EcoGo (texto fijo) se reemplazó por la **inflación del mes esperada en el último REM** (primer mes del relevamiento sin dato oficial de INDEC).
- Las cuatro tarjetas de Expectativas se pueden tocar, como las del tablero, y muestran los **últimos 5 REM** (líneas, de claro a oscuro) contra el **dato oficial** (barras) cuando ya existe:
  - Inflación mensual: trayectoria mensual esperada en cada REM vs. IPC de INDEC.
  - Inflación a 12 meses: para cada REM, la inflación interanual implícita desde el mes del relevamiento (IPC ya publicado + inflación mensual esperada) y el valor esperado para los próximos 12 meses; barras: inflación interanual observada.
  - Dólar: tipo de cambio promedio mensual esperado vs. el oficial mayorista observado.
  - PIB: variación trimestral desestacionalizada esperada vs. la del EMAE desestacionalizado (aproximación del PIB; sólo trimestres completos).
- Datos: `macro-history.json → remSurveys` trae los relevamientos feb–sep 2026 (archivo histórico del REM del BCRA). Cada REM nuevo se agrega solo: `rem()` resume la tabla del mes con `remSurveyFromRows()` y lo guarda en `rem.surveys` (KV).

## v142 — IPI e ISAC el mismo día que publica INDEC; ISAC en la agenda y en “Último dato publicado”
- **Por qué no se actualizaban:** el sitio leía IPI e ISAC sólo de la API de Datos Argentina, que incorpora el mes nuevo varios días después del informe de INDEC. Ahora, además, se lee la portada de INDEC (`indec.gob.ar/indec/Portada`), que resume cada informe del día (“En agosto de 2026, el índice … cayó 3,2% respecto a igual mes … la serie desestacionalizada subió 1,9% …”) con `parseIndecNews()`. Si ese mes es más nuevo que el de Datos Argentina, se agrega; cuando Datos Argentina lo publica, su serie lo reemplaza.
- Agosto 2026 incorporado (y revisiones de 2025–2026 de los cuadros 1 de ambos informes): IPI −3,2% i.a. / +1,9% mensual s.e.; ISAC −4,4% i.a. / +0,4% mensual s.e.
- **Agenda:** se agregó el ISAC (7 oct, 6 nov y 9 dic) y se corrigió la fecha del IPI de septiembre (6 nov, no 9 nov), según el calendario oficial de INDEC. También se agregó la balanza de pagos del 3T (22 dic).
- **Último dato publicado:** incluye IPI e ISAC (con la fecha oficial del calendario de INDEC). Si el mismo día se publican varios datos, se muestran juntos.

## v143 — nuevo logo, portada centrada y compras del BCRA
- **Logo:** `public/logo.svg` (cuatro barras ascendentes en azules, vectorial a partir de la imagen enviada) en el encabezado y el pie, sobre un recuadro blanco para que se lea sobre el fondo oscuro; `public/favicon.svg` como ícono del sitio.
- **Portada:** el título “La economía argentina, en perspectiva.” es más chico y está centrado, con el texto y los botones; “Mercados ahora” pasa debajo, a todo el ancho, con las tarjetas alineadas en una fila (5 en escritorio, 3 en tablet, 2 o 1 en celular).
- **Compras BCRA:** nueva tarjeta en “Mercados ahora” con la última compra/venta neta de divisas del BCRA (API de Estadísticas del BCRA, variable 78 “Variación de reservas internacionales por compra de divisas”, millones de USD), el acumulado del mes y el nivel de reservas (variable 1). El BCRA publica este dato con 1–3 días hábiles de rezago; la tarjeta muestra la fecha de la operación.

## v144 — compras del BCRA del día (preliminar)
- La API oficial del BCRA (variable 78) incorpora la compra/venta diaria con 2–3 días hábiles de rezago (hoy, 7/10, llega hasta el 2/10). El BCRA informa el monto a la prensa al cierre de cada rueda, así que para los días que la API todavía no tiene se toma el monto de los titulares del día (Google Noticias, `bcraPressDays()`): por cada rueda se usa el monto que más se repite entre medios distintos, se descartan totales semanales o acumulados y las notas publicadas antes de las 15 h se asignan a la rueda anterior.
- La tarjeta indica “(preliminar)” mientras el dato no es oficial y lo reemplaza por el del BCRA cuando éste lo publica. Los días preliminares se guardan en KV para que el acumulado del mes no se pierda. Si falta alguna rueda en el acumulado del mes, se marca con “*”.

## v145 — compras del BCRA desde su cuenta de X
- Fuente principal del dato del día: la publicación de @BancoCentral_AR en X (API v2, `X_BEARER_TOKEN` cargado como secreto del Worker). `parseBcraPost()` toma el monto comprado/vendido y, si figura, el nivel de reservas.
- Para minimizar el costo (pago por publicación leída): sólo días hábiles de 16 a 21 h, como mucho una consulta cada 10 minutos (control en KV `x:bcra`), sólo publicaciones nuevas (`since_id`) y ninguna consulta cuando el dato del día ya se obtuvo. Ante 401/402/403/429 se suspende una hora.
- Prioridad: dato oficial del BCRA (API de Estadísticas) > publicación en X > titulares de prensa. `/api/status` muestra el estado de la lectura de X (`xBcra`: última consulta, último error, días leídos).

## v147 — diagnóstico del token de X
- El token `X_BEARER_TOKEN` se limpia antes de usarse (espacios, comillas o un "Bearer " pegado de más).
- `/api/status` → `xBcra.tokenShape` informa el largo y el tipo de credencial detectado (nunca el valor), y `lastError` incluye el detalle que devuelve X.
- Al cargar un token nuevo se reintenta enseguida, sin esperar el freno por un error anterior.

## v148 — muestra de publicaciones del BCRA en X
- `/api/status` → `xBcra.recent` muestra las últimas publicaciones leídas (texto recortado) y si se pudo extraer el dato; `lastRead` indica cuántas trajo la última consulta.
- Al cambiar el lector de publicaciones se vuelven a leer los últimos 8 días.

## v149 — compras del BCRA desde la placa #DataBCRA
- El BCRA publica en X la placa "Principales variables" (#DataBCRA): reservas y compra/venta de divisas vienen **en la imagen**, no en el texto.
- Se lee primero el texto del posteo y el texto alternativo de la imagen; si no traen el dato, la imagen se lee con **Workers AI** (binding `AI` en wrangler.jsonc; modelos `@cf/meta/llama-4-scout-17b-16e-instruct` y, de respaldo, `@cf/google/gemma-3-12b-it`). Se valida el resultado (compra/venta ≤ 5.000 M, reservas entre 10.000 y 200.000 M) y se toma la fecha escrita en la placa.
- Como mucho 6 lecturas de imagen por consulta (v150: de la más nueva a la más vieja) y sólo si falta el dato de ese día.
- `/api/status` → `xBcra.aiConfigured`, `aiError` y, en `recent`, `via` (texto, alt o imagen).

## v151 — "Mercados ahora" arriba del título
- El panel de mercados pasa arriba del título de la portada, con tarjetas compactas: textos de hora de actualización, fuente y reservas del mes más chicos.
- "Último dato publicado" muestra sólo el nombre corto del índice (IPI, ISAC, IPC…) y la fecha, sin el valor.

## v152 — promedio en el TCR, cronograma de ajustes y portada siempre fresca
- Gráfico del dólar: opción "Mostrar promedio del período" (línea punteada) para el rango elegido (5/10/20 años, máximo o fechas propias). El promedio se pondera por tiempo para que los tramos anuales, mensuales y diarios cuenten según el período que cubren. El resumen indica cuánto está el último dato por encima o por debajo del promedio.
- Calculadora de actualización: frecuencia de ajuste (mensual, bimestral, trimestral, cuatrimestral, semestral, anual u otra) con la tabla de todos los ajustes del período (índice, ajuste, acumulado y monto), el monto vigente y la fecha del próximo ajuste. Botones para compartir por WhatsApp, mail, copiar o el menú del sistema (public/update-schedule.js).
- Portada: el HTML se pide a los assets sin encabezados condicionales y sale con `cache-control: no-store`, sin ETag ni Last-Modified. Antes, un 304 hacía que el navegador reusara una copia vieja con valores de mercado de días atrás. También se pide el dato al instante si la página vuelve del caché de atrás/adelante.

## v153 — enlaces con ancla
- `macrodatos.ar/#calculadoras` (y cualquier otra sección) llega a la sección pedida: mientras la página termina de cargar se mantiene en pantalla aunque los gráficos de arriba crezcan; se deja de hacerlo cuando la persona se mueve o a los 12 s.

## v154 — Fuentes al final
- La sección "Fuentes y metodología" pasa al final del sitio, después de las calculadoras (también último en el menú).

## v155 — más precios en "La economía cuando naciste"
Búsqueda complementaria con el mismo criterio (precio nominal observado en su época, con moneda, mes, lugar y fuente enlazada en data/precios.xlsx, origen "v155 búsqueda complementaria"):
- INDEC, informes de prensa del IPC-GBA (cuadro "Precios al consumidor de un conjunto de alimentos y bebidas"): nov-2000, jun-2001 y dic-2001 para pan, harina, arroz, asado, pollo, aceite, leche, manteca, huevos, papa, azúcar, vino, café y yerba; mar/abr-2008 para pollo y papa.
- Secretaría de Energía, Anuarios de Combustibles 1976–1994: precio oficial de la nafta común en cada fecha de vigencia y, desde 1991, promedio mensual sugerido por YPF en Capital Federal (en 1991 se expresa en australes).
- Otras fuentes verificadas: INDEC 2003–2008 y 2017–2025 (copias de informes de prensa), IDECBA 2012–2020, Decreto PBA 545/1973, precios máximos de octubre de 1987, INDEC enero 1992 citado por El Día.
- No se incorporan valores reconstruidos con porcentajes (salvo el asado de enero 2010, calculado de la variación publicada por IPCVA), promedios anuales de dudosa naturaleza ni datos del INDEC intervenido posteriores a 2008.

## v156 — Inflación CABA el mismo día que publica IDECBA
- Datos Argentina replica el IPCBA días después de su publicación. Ahora, si falta el mes nuevo, el Worker busca el informe de resultados de IDECBA (`/eyc/publicaciones/ipcba-ciudad-de-buenos-aires-<mes>-de-<año>/` → PDF `ir_AAAA_NNNN.pdf`) y lee la variación mensual, interanual y acumulada del texto ("Durante el mes de septiembre el Índice … registró un incremento de 1,8%").
- `src/api/pdf-text.mjs`: extractor mínimo de texto de PDF (streams FlateDecode con DecompressionStream) que corre en Workers.
- La fecha de publicación sale del Last-Modified del PDF; con ella el IPC CABA entra en "Último dato publicado".
- Calendario habitual del IPCBA: día 8 del mes siguiente (antes 15), para que el sitio lo busque con prioridad desde ese día.
- Septiembre 2026 (1,8% mensual; 32,9% interanual) agregado al respaldo local.

## v157 — IPC CABA en "Último dato publicado", dólar real sin serrucho y semáforo
- IPC CABA: si Datos Argentina no responde (se cortaba por tiempo y anulaba todo), se parte del respaldo local y se completa igual con el informe de IDECBA. El informe del último mes se lee también cuando ya está en la serie, para obtener la fecha de publicación; se guarda en memoria 6 h por mes.
- Dólar en pesos constantes y TCR (series diarias): índice de precios diario interpolado geométricamente entre los meses (IPC ubicado a mitad de mes; igual para el CPI de EE.UU.). Elimina el salto del día 1 de cada mes con inflación alta.
- Nueva sección "Semáforo de la economía" debajo de "Pulso económico": 15 indicadores mensuales × últimos 5 meses, con la misma regla de color que cada tarjeta; detalle al pasar el cursor o tocar cada punto. La inflación figura una sola vez (IPC nacional del INDEC).

## v158 — IPC CABA en "Último dato publicado" (causa real)
- El "Último dato publicado" del servidor (KV release:latest y HTML inicial) se arma con una lista fija de fuentes y no incluía `ipcCaba`. Agregada.
- Errores de lectura de IDECBA visibles: `/api/status` → `ipcCaba` (fuente, último mes, latest, idecbaError) y `/api/status?probe=idecba` prueba en vivo la conexión con IDECBA y la lectura del PDF del último mes.
- Un fallo de IDECBA se reintenta a los 10 minutos (antes 1 hora); tiempos de espera de 30 s (página) y 40 s (PDF).
- Una fuente que se actualiza bien deja de arrastrar el `refreshError` de un intento anterior.

## v159 — lectura del PDF de IDECBA en Cloudflare
- En Workers, DecompressionStream descarta el stream completo si hay bytes sobrantes después de los datos comprimidos (el salto de línea antes de `endstream`). Ahora cada stream se recorta con su `/Length` (o quitando esos saltos de línea) y se omiten los ASCII85 (imágenes). Probado simulando el comportamiento estricto: antes 0 caracteres; ahora el texto completo.

## v160 — Reservas brutas y netas del BCRA (Históricos)
- Nuevo gráfico en "Series históricas": reservas brutas (desde 1996) y netas desde 2003 con tres metodologías a elección: de mercado, metodología FMI (acuerdo 2025, desde ene-2025) y líquidas. El tooltip muestra la cuenta completa de cada mes.
- `/api/reserves` (src/api/reserves.mjs): lee de la API del BCRA las reservas (var 1), encajes en dólares (var 1243), repos con bancos del exterior (var 76) y la valuación en USD de las asignaciones de DEG de 2009 (var 83, para pasar DEG a dólares); toma la posición mensual de Argentina en el FMI (tenencias de DEG y crédito vigente) de la página oficial del FMI, guardada en KV (`imfpos:v1`) y completada de a poco por la revisión programada (8 meses por ejecución; unas 6 horas para todo 2003–2026). Respuesta en KV `reserves:v1` (6 h; 30 min mientras se completa el FMI).
- `public/reserves-components.json`: swap con China (CNY y tipo de cambio), BIS y otros pasivos de corto plazo, SEDESA, oro (toneladas y precio), con notas y fuentes. Actualizar `through` y los componentes cuando cambien (p. ej., pagos del BIS o el swap).
- `/api/status` → `reserves`: cuántos meses del FMI ya se cargaron y el último error.

## v191 — Proyecciones REM también con Desde/Hasta

- PIB e Inflación: al elegir un período con los selectores Desde/Hasta, las proyecciones/expectativas del REM se siguen mostrando siempre que "Hasta" sea el último dato observado (antes se ocultaban con cualquier período personalizado). Si "Hasta" es anterior, no se agregan.

## v190 — Inflación con expectativas del REM

- Series históricas · Inflación: nuevo selector "Sin REM / Con expectativas REM" (activado por defecto). Toma la última encuesta REM con IPC mensual (`rem.surveys[*].ipcM`, mediana) y sólo los meses consecutivos posteriores al último dato oficial.
  - Mensual: agrega esos meses como barras claras con borde ("oct 2026 (REM)" …).
  - Anual: si el REM cubre hasta diciembre, estima el año en curso encadenando los meses oficiales de INDEC con los del REM ("2026 (est.)"), tanto punta a punta como promedio anual; si además cubriera un año completo siguiente, también lo estima. Si no alcanza, lo aclara y se ve sólo en la serie mensual.
- El resumen acumulado sigue usando sólo datos oficiales; la imagen y el Excel exportados incluyen las estimaciones identificadas.

## v189 — Dólar: compartir y 20 años por defecto

- Gráfico del dólar (libre, oficial y brecha): barra Exportar (Excel, JPEG, Instagram, X, WhatsApp), con la serie, el modo de pesos (corrientes, constantes o TCR), la frecuencia y el rango elegidos. Enlace compartido: `https://macrodatos.ar/#tipo-cambio`.
- Rango por defecto: 20 años (antes Máximo). Los campos Desde/Hasta muestran el período visible.

## v188 — Resultado fiscal: unidad como subtítulo

- Detalle de Resultado fiscal: "Como % del PBI" pasa a ser un subtítulo chico debajo del título; se quita de "Último dato" y del valor principal. En la tarjeta, el período queda sólo con el mes (la unidad ya figura debajo de cada valor). La imagen compartida lleva la unidad en la línea de detalle.

## v187 — Compartir el semáforo y resultado fiscal desde 2021

- Semáforo de la economía: barra Exportar (Excel, JPEG, Instagram, X, WhatsApp). La imagen redibuja la tabla (indicador, organismo y un punto por mes) con la leyenda y un resumen del último mes; la apaisada crece con la cantidad de indicadores y la de Instagram es 1080×1350. El Excel trae estado y dato de cada mes por indicador. `renderSemaforo` deja los datos en `#semaforoTable._semData`.
- Resultado fiscal: el detalle muestra 2021 a 2026 (antes los últimos 3 años); el año en curso resaltado y los anteriores a 2024 en grises. La serie de resultado financiero de Datos Argentina viene con decenas de meses en null: se reconstruye como primario − intereses netos (IMIG, identidad verificada mes a mes). Base incluida ene-2021 a ago-2026 en `src/api/fiscal-base.mjs` (primario, intereses y PIB trimestral); la API agrega o corrige meses.

## v186 — Compartir desde las tarjetas de Pulso económico y Expectativas

- El detalle de cada tarjeta (las 24 de Pulso económico y Expectativas, que comparten el mismo modal) suma la barra Exportar: Excel, JPEG, Instagram, X y WhatsApp, con el mismo armado que en Series históricas (título, organismo y último dato, valor con su comparación, gráfico, fuente y marca).
- El Excel usa los períodos reales del gráfico (`kpiSeries(key).rawPeriods`) y una columna por serie (p. ej. IPC oficial + cada encuesta REM).
- Enlace compartible por tarjeta: `https://macrodatos.ar/?kpi=ipc#inicio` abre el detalle de esa tarjeta cuando ya tiene datos.

## v185 — PIB con proyecciones del REM

- Series históricas · PIB real: nuevo selector "Sin proyección / Con proyección REM 2026–2027". Agrega al final del gráfico el año en curso y el siguiente con la mediana de la última encuesta REM del BCRA que traiga PIB anual (`rem.surveys[*].gdpY`), en barras claras con borde y rótulo "(proy.)". Sólo se agregan años que todavía no tienen dato observado; el resumen acumulado sigue usando datos observados.
- Las proyecciones también salen en las imágenes y en el Excel exportados (período "2026 (proyección REM 2026-09)").

## v184 — Comercio exterior en barras

- Series históricas: Balanza comercial (superávit en verde, déficit en rojo), Exportaciones e Importaciones (azul) se dibujan en barras, también en las imágenes exportadas. El detalle de la tarjeta de Balanza comercial ya era de barras.

## v183 — Inflación en barras

- Series históricas: la inflación (anual y mensual) se dibuja en barras azules (deflación en verde), como el PIB. También en las imágenes que se exportan.
- Pulso económico: los gráficos del detalle de Inflación nacional e Inflación CABA pasan a barras.

## v182 — Inflación 2017+ completa y últimos 20 años por defecto

- Inflación: Datos Argentina devuelve el IPC nacional (148.3, 2017+) con muchos meses en null y la cadena terminaba en 2016. El tramo 2017+ ahora sale del IPC oficial que ya trae el sitio (`ipc.monthly`, INDEC, dic-2016 = 100); la serie de Datos Argentina sólo completa meses que falten. La cadena se rearma cuando llega la API.
- Series históricas: el período por defecto pasa a ser "20 años" (antes "Máximo"), también al cambiar de serie. 20 años = exactamente 20 observaciones anuales (2006–2025) o 240 meses.
- Los selectores Desde/Hasta muestran el período que se ve.

## v181 — Exportar y compartir las series históricas

- Debajo de cada gráfico de "Series históricas" (incluidas las reservas) hay una barra "Exportar" con Excel, JPEG, Instagram, X y WhatsApp (`public/share.js`). Siempre exporta lo que se ve: la serie, el modo (ARS/USD, constantes/corrientes, etc.) y el rango elegidos.
- **Excel**: hoja "Datos" (período como fecha/año real de Excel y una columna por serie) y hoja "Información" (detalle, fuente, resumen, metodología, fecha y enlace). Se genera en el navegador con SheetJS 0.18.5, que se carga recién al apretar el botón.
- **JPEG**: imagen 1600×900 armada aparte (no una captura): marca, título, detalle, resumen del período, gráfico redibujado en alta resolución, fuente y macrodatos.ar.
- **Instagram**: imagen 1080×1350 (4:5). **X / WhatsApp**: en el celular se abre el menú de compartir del sistema con la imagen, el texto y el enlace; en la computadora se abre X o WhatsApp Web con texto y enlace, y la imagen queda copiada para pegarla (si el navegador no deja copiarla, se descarga).
- Enlace compartible por serie: `https://macrodatos.ar/?serie=imports#historicos` abre directamente esa serie.

## v180 — Importaciones y comercio exterior sin depender de Datos Argentina

- El navegador ya no pide a Datos Argentina las series anuales de exportaciones, importaciones y saldo (74.1_*): la de importaciones vuelve vacía, y hasta que llegaba el grupo `history` del backend el gráfico de Importaciones quedaba sin datos. Ahora se lee `public/trade-annual.json` (misma tabla que `src/api/trade-annual.mjs`, más la serie anual de industria), que sólo completa años que el backend todavía no trajo.
- Con la API caída y sin conexión a Datos Argentina, Balanza comercial, Exportaciones, Importaciones e Industria igual se dibujan completas.

## v179 — Series de industria y comercio exterior sin huecos

- Datos Argentina devuelve `null` en muchas observaciones (las importaciones y el saldo anual del ICA perdieron decenas de años) y `Number(null)` las convertía en 0: balanza, exportaciones e importaciones mostraban años en cero. `seriesRows` (worker) y `publicSeries` (navegador) ahora descartan los nulls.
- Nueva tabla anual completa 1910–2025 de exportaciones, importaciones y saldo (`src/api/trade-annual.mjs`): saldo = expo − impo cuando falta uno, suma del saldo mensual ICA desde 1992, y en 17 años previos a 1991 sin importaciones ni saldo, importaciones del balance de pagos llevadas a CIF (relación ICA/BP de años vecinos ≈ 1,086; quedan listados en `estimatedImports`). La API sólo agrega o corrige años con dato real.
- Industria: 2015 y 2016 faltaban (EMI termina en 2014 y la primera variación del IPI es 2017); se empalman con el EMAE · industria manufacturera. El año en curso se compara con los mismos meses del año anterior (antes ene–ago contra todo el año previo). Serie anual incluida como respaldo.
- `repairHistorical` corrige al vuelo los snapshots guardados con ceros.

## v178 — Medio aguinaldo como botón y aviso configurable

- En el detalle de cada persona, el medio aguinaldo pasa a ser un botón (con el monto estimado y el vencimiento) que despliega el cálculo al apretarlo.
- Nueva opción en "Avisos por mail": "Avisarme cuando haya que pagar el medio aguinaldo", con anticipación de 1, 3, 5, 7 (por defecto), 10 o 15 días. Es independiente de los avisos de cada pago y usa la misma hora; no se envía si el aguinaldo ya está registrado como pagado.

## v177 — Medio aguinaldo del personal de casas particulares

- En el detalle de cada persona: medio aguinaldo del semestre actual (estimado al cierre, con los pagos que faltan al monto vigente) y del anterior. 50% de la mayor remuneración mensual devengada del semestre (Ley 26.844), proporcional a los días si empezó a trabajar dentro del semestre; muestra lo devengado mes por mes, el mayor mes, el proporcional a hoy y el vencimiento (30/6 y 31/12).
- Se puede registrar el pago del aguinaldo; si no está registrado, llega un aviso por mail 7 días antes del vencimiento (a la hora elegida).
- Cálculo en `computeSac` (`src/api/staff-core.mjs`): suma de los montos de cada pago del mes (sin diferencias arrastradas ni pagos extra); no incluye antigüedad.

## v176 — Importar pagos y hora de los avisos

- Personal de casas particulares → **Importar pagos (CSV)**: columnas fecha (o fecha_pago) y monto; opcionales semana, arrastrar_diferencia (sí/no) y nota. Cada fila se asigna a una fecha de pago de la tarjeta (por la semana o por la fecha más cercana) y las filas del mismo período se suman. Opciones: armar el historial de montos (un monto nuevo rige cuando se repite 3 períodos seguidos; aguinaldos y pagos sueltos no lo cambian), adelantar el inicio al primer pago y reemplazar pagos ya registrados.
- Avisos de contratos, créditos y personal: **hora de envío** elegible (00 a 23 h; por defecto 9). La revisión pasa a ser cada hora (`acct:run:<fecha>:<hora>`).
- Personal: opción **"No avisar si ese pago ya está registrado"** (activada por defecto).

## v175 — Personal de casas particulares en Mi cuenta

- Nueva sección junto a contratos y créditos: nombre, categoría de la escala oficial (supervisor/a, tareas específicas, caseros, cuidado de personas, tareas generales), con o sin retiro, zona desfavorable, frecuencia de pago (por jornada con los días que trabaja, semanal con el día, quincenal o mensual con el día del mes), monto y horas por período → valor por hora.
- Registro de pagos: en cada fecha se marca cuánto se pagó; si fue menos (o más), se elige si la diferencia se suma (o descuenta) en el pago siguiente. Cambios de monto u horas con fecha "vigente desde" sin alterar los pagos anteriores.
- Comparación con la escala oficial de la Comisión Nacional de Trabajo en Casas Particulares (`src/api/casas-scale.mjs`, historia dic 2023–dic 2026, resoluciones CNTCP; zona desfavorable +30%/+31%): mínimo por hora vigente, diferencia en %, próxima escala acordada y monto mínimo sugerido si se paga por debajo.
- Avisos por mail antes de cada pago (incluye la diferencia arrastrada) y cuando empieza una escala oficial nueva. **Actualizar `casas-scale.mjs` cuando la CNTCP publique una resolución nueva** (la última cargada llega a diciembre 2026).

## v174 — Logo nuevo

- Logo: M maciza azul marino cruzada por una línea de tendencia ascendente celeste (`public/logo.svg`); favicon con la misma idea y trazos más gruesos para que se lea en 16 px (`public/favicon.svg`).

## v173 — Carga más rápida en el celular

- La causa principal: la fecha de hoy (`currentDateAR`) creaba un `Intl.DateTimeFormat` en cada llamada y se usaba dentro de filtros sobre miles de fechas diarias (ICL, CER, UVA) cada vez que llegaba un grupo de datos. En un celular eso bloqueaba la página ~7 s. Ahora se calcula una vez por minuto.
- Los 7 grupos de /api/macro-data se aplican juntos (antes cada uno recalculaba y redibujaba todo) y la copia local se guarda una sola vez al final.
- Los gráficos de las pestañas ocultas (Series históricas, Dólar) se dibujan recién al abrirlas.
- El menú móvil se activa con un script chico al final del HTML (antes esperaba a que terminara de cargar app.js) y tabs.js carga antes que app.js.
- Medido con un celular simulado (CPU 4× más lenta): tareas que bloquean la página 33 s → 1 s; el menú responde a 1,6 s de abrir la página (antes ~35 s).

## v172 — IPC nacional directo de INDEC

- El IPC dependía sólo de Datos Argentina, que se actualiza días después de la publicación (y últimamente con huecos). Ahora la fuente principal es el CSV oficial de INDEC (`serie_ipc_divisiones.csv`, nivel general nacional), que se actualiza el mismo día; Datos Argentina y la línea de base local quedan de respaldo y se combinan por mes. Variaciones mensual, interanual y acumulada calculadas del índice, sólo entre meses consecutivos. Fecha de publicación: la del archivo de INDEC o la del calendario oficial.
- Línea de base: septiembre 2026 (1,9% mensual, 33,4% interanual, 23,6% acumulado) para que el dato aparezca aunque INDEC esté saturado.

## v171 — Créditos en Mi cuenta

- Además de los contratos, se pueden cargar **créditos**: tipo de ajuste (UVA o tradicional en pesos a tasa fija), monto (en pesos o en UVAs), fecha de otorgamiento, primer vencimiento opcional, plazo en meses, TNA y sistema de amortización (francés, alemán o americano).
- Tarjeta con la próxima cuota y el saldo; al tocarla, ventana con cuotas pagadas, saldo de capital (en UVA y en pesos), intereses totales y el cronograma completo (cuota en UVA, valor UVA del vencimiento, cuota en pesos, interés, capital y saldo). En los UVA, si el valor del día del vencimiento todavía no se publicó, la cuota se estima con el último valor y se marca.
- Avisos por mail antes de cada vencimiento (0 a 15 días), a vos y a otras direcciones confirmadas; mail de prueba. Los próximos vencimientos también aparecen en los resúmenes (ítem "Tus contratos y créditos").
- Cálculo en `src/api/loans-core.mjs`. Sin IVA sobre intereses, seguros ni otros cargos.

## v170 — Corrección de la inflación CABA

- Datos Argentina empezó a devolver series con meses salteados; la variación mensual se calculaba contra el último mes disponible y un hueco hacía que un mes mostrara la suba de dos (septiembre figuraba 3,6% en vez de 1,8%, y el interanual 46,3% en vez de 32,9%). Ahora la variación sólo se calcula entre meses consecutivos, los meses del respaldo verificado tienen prioridad y el valor del informe oficial de IDECBA siempre manda sobre cualquier cálculo.
- Mismo arreglo para las variaciones mensuales desestacionalizadas del IPI y el ISAC calculadas desde Datos Argentina.
- El "latest" de IPC CABA se reemplaza en cada actualización (antes se mezclaba con el anterior y arrastraba campos viejos).

## v169 — Consumo en Pulso económico y agenda completa

- **Consumo en supermercados (INDEC)**: índice de ventas a precios constantes de la Encuesta de supermercados (`serie_supermercados.xlsx`, Cuadro 1): variación interanual, mensual desestacionalizada y acumulada del año; historia desde 2017. Grupo `activity`, fuente `supermarkets`.
- **Consumo masivo (Scentia)**: variación interanual en unidades del total multicanal. Scentia no publica una página fija: se leen los títulos de Google Noticias y se toma el dato sólo si dos medios coinciden (`scentiaLive` en `live-sources.mjs`). Historia desde mayo de 2025 (antes la prensa difundía sólo el canal self-service, no comparable). Fuente `scentia`.
- Ambas tarjetas tienen gráfico en la ventana emergente, entran al Semáforo, a "Último dato publicado", a la agenda y a los resúmenes por mail.
- **Agenda**: muestra la próxima publicación de cada tarjeta del tablero (fecha oficial cuando existe; si no, la habitual, marcada como estimada) más el REM y otras fechas oficiales, hasta 10. Si un dato ya debía salir y no salió, aparece primero como pendiente. La revisión programada guarda las fechas en KV (`cards:status`).

## v168 — Mi cuenta más ordenada

- Los contratos se muestran como tarjetas con el formato de Pulso económico (nombre, índice, monto vigente, próximo ajuste y estado de los avisos) más una tarjeta "Agregar contrato". Al tocar una tarjeta se abre una ventana con todos los detalles y el cronograma de ajustes, con Editar, Enviarme un mail de prueba y Eliminar; el formulario también se abre en esa ventana.
- Debajo, el recuadro "Resúmenes, alertas y seguimiento" resume lo que está activo y el botón "Configurar resúmenes y alertas" abre la configuración en la misma ventana.

## v167 — Acciones, bonos y ADRs en los resúmenes (etapa 3)

- **Mi cuenta → Resúmenes → Tu seguimiento**: buscador con todos los instrumentos de BYMA (acciones, bonos, letras, ON, CEDEARs) y las empresas argentinas que cotizan en Wall Street (ADRs de GGAL, YPF, PAM, BMA, BBAR, SUPV, CEPU, EDN, TEO, TGS, CRESY, IRS, LOMA, TX, TS y acciones de MELI, GLOB, VIST, BIOX, CAAP, DESP). Hasta 20 por usuario, con precio y variación en el momento.
- En los resúmenes: precio y variación del día; en el semanal, también la variación contra el cierre de hace una semana. Moneda según el ticker (D = dólar MEP, C = cable; Wall Street en dólares). Bonos: precio cada 100 nominales.
- Fuente: data912.com (API pública y gratuita, datos con demora). Código: `src/api/quotes.mjs`.

## v166 — Resúmenes por mail y alertas de mercado (etapa 2)

- **Mi cuenta → Resúmenes por mail**: diario (sólo días hábiles) y/o semanal (día a elección), a las 8:30 o a las 18:30. Contenido a elección: dólar MEP, dólar oficial BNA, riesgo país, Merval (variación del día; en el semanal también de la semana), compras del BCRA y reservas, datos publicados desde el último resumen, panorama con el último dato de cada indicador, REM, próximos datos a publicarse y próximos ajustes de los contratos. Botones para recibir un resumen de prueba.
- **Alertas**: dólar MEP, dólar oficial, riesgo país y Merval; umbral en % de variación diaria y dirección (sube, baja o ambas). Se revisa después de cada actualización de mercados (cada 5 minutos, días hábiles de 10:30 a 18:00); un mail por activo y dirección, y otro cada vez que el movimiento llega a otro múltiplo del umbral.
- Baja de un clic en cada mail (apaga resúmenes y alertas). Preferencias en KV `acct:subs`; cierres diarios propios en `mkt:closes` (para la variación semanal del dólar). Estado en `/api/status` → `digests`.
- Código: `src/api/digest.mjs` (se engancha en la revisión programada de `src/worker.mjs`).

## v165 — Diagnóstico del envío de mails

- La clave de Resend se acepta como `RESEND_API_KEY` o con otro nombre que contenga "RESEND" (se limpian comillas, espacios y un "Bearer " pegado por error).
- `/api/status` → `reminders.mail`: si está configurado, largo y prefijo de la clave (nunca el valor) y los nombres de variables relacionadas.

## v164 — Cuentas, contratos y avisos por mail (etapa 1)

- Nueva pestaña **Mi cuenta** (`#cuenta`): ingreso con enlace por mail (sin contraseña; la cuenta se crea al primer ingreso). Sesión de 30 días en cookie HttpOnly/Secure/SameSite=Lax; los cambios sólo se aceptan con `Origin` del propio sitio.
- **Contratos**: monto inicial, fecha de inicio (y fin opcional), índice (IPC con rezago 0–3, ICL, CER, UVA o porcentaje fijo) y frecuencia (mensual… anual u "otra"). Vista previa del cronograma mientras se completa el formulario; monto vigente, próximo ajuste y todos los ajustes. Cálculo en `src/api/contracts-core.mjs` (lo usan la página y los mails).
- **Avisos por mail** (Resend): sólo cuando hay un ajuste (con 0–15 días de anticipación) o todos los meses (día elegido). Si el índice del ajuste todavía no se publicó, avisa que está pendiente y vuelve a escribir apenas se puede calcular. Hasta 3 direcciones además de la propia; cada una confirma antes de recibir nada. Todos los mails llevan baja de un clic (List-Unsubscribe).
- Corrida diaria a las 08:47 (cron `47 11 * * *`; si se pierde, la revisión de cada 5 minutos la hace más tarde ese día). Estado en `/api/status` → `reminders`.
- Datos en KV con prefijo `acct:` (ver encabezado de `src/api/account.mjs`).

### Configuración necesaria (una sola vez)
1. Crear cuenta en resend.com → *Domains* → agregar `macrodatos.ar` y cargar en Cloudflare DNS los registros que indica (DKIM/SPF y, opcional, DMARC). Esperar a que figure *Verified*.
2. *API Keys* → crear una con permiso *Sending access*.
3. Cloudflare → Workers → macro-argentina → Settings → Variables and Secrets: agregar el secreto `RESEND_API_KEY`. Opcionales: `MAIL_FROM` (por defecto `Macrodatos <avisos@macrodatos.ar>`), `MAIL_REPLY_TO`.
4. Plan gratuito de Resend: 100 mails por día / 3.000 por mes.

## v163 — Menú, Expectativas y cierres de fin de semana

- Menú: Semáforo, Expectativas y Agenda se subrayan al visitarlas (por clic o al desplazarse por Inicio).
- Expectativas: las tarjetas muestran la "manito" y el realce al pasar el cursor, como las del tablero.
- Mercados: los fines de semana y feriados (nacionales y no laborables con fines turísticos) Merval, MEP, riesgo país y BNA se fechan en el último día hábil ("Cierre 09/10/2026") en vez de "Hoy · hora". Calendario en `src/api/market-days.mjs` (y copia en `app.js`); hay que sumar los feriados móviles de 2027 cuando se publiquen.

## v162 — Reservas netas FMI y líquidas

- Causa: la conversión de DEG a dólares usaba la variable 83 del BCRA, que es una serie de flujos (todo ceros), así que nunca se calculaban las tenencias de DEG ni el crédito del FMI en dólares; sin eso, «Líquidas» y «Metodología FMI» quedaban vacías.
- `public/reserves-components.json` suma `usdPerSdr`: dólares por DEG a fin de cada mes 2003-01…2026-09, inversa de la tabla «SDRs per Currency unit» del FMI (ene–mar 2003 no publicados: se usa abr 2003). Desde octubre 2026 se usa la cotización diaria del FMI (`rms_sdrv.aspx`).
- Caché KV renovada (`reserves:v4`).

## v161 — Pestañas, reservas dentro de Series históricas y FMI completo
- Pestañas: "Dólar", "Series históricas", "Cuando naciste" y "Calculadoras" se ven en su propia pestaña; el resto queda en "Inicio" (public/tabs.js + script temprano en `<head>` que elige la pestaña según el enlace, sin parpadeo). Los enlaces existentes (#tipo-cambio, #historicos, #reservas, #nacimiento-AAAA-MM, #calculadoras) abren su pestaña.
- Reservas BCRA: ahora es una opción más del selector de "Series históricas" (reemplaza al gráfico principal al elegirla).
- Netas FMI y líquidas: el lector de la página del FMI no reconocía el formato real ("IV." y "V." en celdas separadas) y no cargaba ningún mes. Corregido y verificado contra la página real; la posición mensual 2003-01…2026-09 (DEG y crédito) queda incluida en `public/reserves-components.json` (`imfPos`) y la revisión programada sólo agrega los meses nuevos. KV `reserves:v2`.

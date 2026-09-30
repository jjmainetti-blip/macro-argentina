# Macro Argentina — Cloudflare v121

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


## v121 — gráfico del dólar: series diarias y mensuales desde 1991
- `public/fx-daily.json` (≈120 KB, formato compacto) con el dólar **libre** y el **oficial** diarios desde el 1-abr-1991:
  - 1991-04 a 2001-12: 1 peso = 1 USD (convertibilidad, días hábiles).
  - Libre: desde 2002-01-11 dólar informal/blue (Ámbito, `mercados.ambito.com/dolar/informal/historico-general`).
  - Oficial: 2002-01-11 a 2002-04-08 mayorista; desde 2002-04-09 oficial BNA (Ámbito).
  - Días posteriores al último dato de Ámbito: ArgentinaDatos (que redondea a pesos enteros en 2011-2012, por eso no se usa en ese tramo).
- En el navegador se derivan, con un único método para todo el período: **mensual** (último dato del mes), **ARS constantes** (IPC INDEC mensual; antes de 2017, inflación anual dic/dic repartida por mes), **TCR** (ARS constantes × CPI-U EE.UU.) y **brecha** diaria y mensual (antes la brecha mensual no existía).
- La frecuencia **anual** mantiene la serie larga del backend (desde 1928).
- La API (`group=markets`) envía sólo los últimos 400 días diarios del dólar; el resto viene del archivo local.

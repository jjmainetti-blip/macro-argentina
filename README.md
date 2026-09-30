# Macro Argentina — Cloudflare v115

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

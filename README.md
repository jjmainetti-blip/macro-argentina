# Macro Argentina — Cloudflare v65

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


## v65
- Explorador de tarjetas: últimas 12 observaciones disponibles.
- Resultado fiscal: histórico mensual primario y financiero incorporado desde publicaciones oficiales de Hacienda.
- Mora bancaria: histórico reciente total/familias/empresas incorporado desde Informe sobre Bancos del BCRA.
- Las tarjetas sin histórico verificable siguen sin interpolación artificial.


## v65
Tarjetas: últimas 12 observaciones disponibles. Se incorporan históricos de resultado fiscal, cemento AFCP, ISAC INDEC, patentamientos ACARA, crédito BCRA y mora bancaria.

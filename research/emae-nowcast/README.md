# Estimador anticipado del EMAE — prueba (no integrado al sitio)

Prototipo corrido en el navegador sobre datos de Datos Argentina (series API + CSV de infra.datos.gob.ar) e INDEC
(sh_emae_actividad_base2004.xls, sh_emae_mensual_base2004.xls). Pendiente de aprobación antes de pasarlo al Worker.

## Método
- Ponderaciones del EMAE (base 2004) recuperadas por MCO del índice total sobre los 16 sectores (error medio 0,03%):
  A 8,1 · B 0,3 · C 5,1 · D 18,9 · E 1,9 · F 3,2 · G 12,3 · H 1,4 · I 6,3 · J 3,2 · K 10,9 · L 4,8 · M 3,6 · N 2,5 · O 2,8 · Impuestos 14,9.
- Cada sector: regresión de la variación interanual (log) sobre la interanual de sus indicadores, ventana creciente,
  sólo con datos que existían (objetivo hasta t−2), sin el período COVID (mar-2020 a jun-2021). Agregación con
  ponderaciones × nivel de hace un año. Corrección por sesgo: se resta ρ·error(t−2), ρ estimado en forma recursiva.
- Tres momentos (vintages):
  - V1 ≈ día 5 del mes siguiente: demanda eléctrica CAMMESA (grandes usuarios, comercial/industrial, total), producción
    ADEFA, ventas de importados, impuesto a débitos y créditos real, IVA DGA en USD, despachos de cemento, faena,
    cosecha (estimación por campaña × calendario), crudo/gas del mes anterior, IVA DGI del mes anterior.
  - V2 ≈ día 25: + crudo y gas del mes, acero, gasoil, petróleo procesado, IPI del mes anterior.
  - V3 ≈ 2 semanas antes del EMAE: + IPI e ISAC de INDEC del mes, IVA DGI del mes.
  - Servicios (L, M, N, O, K, J): autorregresivos (t−2, t−3) + débitos y créditos / IVA.

## Resultados (interanual, pp; 2016–ago 2026 sin COVID)
| | MAE | RMSE | signo | MAE 2023+ |
|---|---|---|---|---|
| Ingenuo (último dato) | 2,68 | 3,34 | 79% | 2,91 |
| V1 | 1,45 | 1,78 | 86% | 1,61 |
| V2 | 1,36 | 1,67 | 86% | 1,49 |
| V3 | 1,18 | 1,45 | 91% | 1,18 |

Variación mensual s.e. (derivada del nivel): sin capacidad predictiva (MAE 1,4–1,6 vs 0,93 de "0"). Achicada ×0,3 iguala a "0".

## Limitaciones
- Datos revisados (no las versiones de cada momento); IPC efectivo para deflactar (en tiempo real: REM/estimación).
- Sector agro (MAE 5 pp) y pesca dependen de estimaciones de cosecha; en tiempo real hay que cargar la campaña.
- 41.3/367.3 en la API de series vienen vacías para algunas columnas: se leyeron los CSV completos.

## Variante 2: variación mensual s.e. con pocos indicadores (23-oct-2026)
- Indicadores: demanda eléctrica grandes usuarios + comercial/industrial (CAMMESA), despachos de cemento (ISAC insumo,
  ≈ AFCP), impuesto a débitos y créditos real, IVA DGI real (actividad del mes anterior a la recaudación).
- Desestacionalización simple en tiempo real: variación mensual del indicador menos el promedio de esa misma variación en
  el mismo mes de los 5 años previos (sin COVID); más diferencia de días hábiles contra ese promedio.
- Regresión de la variación mensual s.e. del EMAE (log) sobre esos cuatro + días hábiles, ventana creciente, sin COVID.
- Prueba fuera de muestra 2019–ago 2026 (n=75): MAE 0,87 pp vs 1,04 de suponer 0; correlación 0,58; signo 71%;
  signo en meses con movimiento ≥1% 82%. Efecto de 1σ: cemento 0,49 pp, electricidad 0,32, débitos y créditos 0,28, IVA 0,19.
- Sin cemento (2016+): correlación 0,37, MAE 0,89 vs 0,93 — el cemento es el indicador que más aporta.
- Techo de referencia: el IPI s.e. de INDEC (que sale después) tiene correlación 0,65 con el EMAE s.e. mensual.
- Probado y descartado: Δ interanual + estacionalidad de hace un año (peor que 0); X-11 simplificado con dummies (corr 0,45).
- Limpieza por temperatura (23-oct): grados de calefacción (<16 °C) y refrigeración (>21 °C) con la temperatura media mensual
  de CAMMESA, coeficientes recursivos. La temperatura explica 52–67% de la variación mensual s.e. de la demanda
  (6% en grandes usuarios), pero limpiar casi no mejora la relación con el EMAE: demanda total 0,34→0,37;
  modelo completo con demanda total limpia MAE 0,85 / corr 0,60 (vs 0,87 / 0,58). GU + comercial limpias empeoran.
- Recaudación con REM (23-oct): deflactor del mes = IPC(t−1) × (1 + REM de la encuesta de t−1 para t); la historia usa IPC
  efectivo (en tiempo real ya se conoce). Datos Argentina tiene el REM hasta dic-2025 → prueba 2019–ene 2026, n=74.
  - Elec + cemento: MAE 0,92 vs 1,01 de 0, corr 0,47. + DyC con IPC efectivo 0,51; + DyC con REM 0,49. + IVA cobrado
    en el mes (REM o IPC t−1): no suma (0,47–0,48).
  - CORRECCIÓN: el 0,58 anterior usaba el IVA cobrado en t+1 (actividad de t), que recién se publica el día 1 de t+2. No
    está disponible al cierre del mes; sirve para una segunda estimación ~3 semanas antes del EMAE.
  - Por régimen: la recaudación no rinde más con inflación baja. DyC suma +0,06 de corr en 2019–may-2024 y nada en
    jun-2024–ago-2026. En ese tramo reciente elec+cemento tiene corr 0,65 pero subestima la magnitud (MAE 0,93 vs 0,99).
  - Error medio del REM: 0,46 pp con inflación <3% vs 1,26 pp con ≥3%.
- Corrección de tamaño (23-oct), elec + cemento + días hábiles, 2019–2023 / 2024–ago 2026, todo fuera de muestra:
  ampliada MAE 0,95 / 0,87 (0: 1,11 / 0,96); ventanas móviles 48/60/84m: 0,94–0,96 / 0,86–0,91; recalibración con la
  pendiente de los últimos 12/24/36 meses (tope 2 o 3): 0,95–1,06 / 0,87–0,89. Ninguna mejora → se descarta.
  Motivo: con R² ~0,25 la estimación óptima es "achicada"; inflarla agranda el error cuando falla.
- Calibración por tramos (2019+): estimado < −0,5 → bajó 91% (n=11; real −1,17 vs est −0,81); > +0,5 → subió 79%
  (n=14; +0,96 vs +0,86); entre −0,15 y +0,15 → 50%. Promedios por tramo bien calibrados.
  Propuesta: mostrar señal en tres zonas (baja / sin señal clara / sube) más el valor estimado.
- IGA-OJF (23-oct): sólo hay ~3 años (PDF vigente de OJF, sep-2023→ago-2026, valores revisados). n=36: 2ª estimación
  (elec+cem+IVA) MAE 0,85 / corr 0,67; IGA s.e. solo 0,82 / 0,69; promedio simple 50/50 0,75 / 0,75 / signo 75%.
  Se integra como promedio simple (sin pesos estimados, para no sobreajustar con 36 meses).
- Integrado en v218 (public/emae-signal.js + src/api/nowcast-inputs.mjs).
- v219: el IGA ya no se promedia con el modelo; se muestran por separado modelo (3 etapas), IGA e ILA. ILA: regresión
  EMAE s.e. sobre ILA mensual del mismo mes (corr 0,33; las estimaciones caen casi siempre en "sin señal clara").

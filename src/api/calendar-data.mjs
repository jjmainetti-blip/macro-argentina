const TZ='America/Argentina/Buenos_Aires';
function todayAR(){return new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
const events=[
['2026-10-01','ARCA','Recaudación tributaria','septiembre 2026'],
['2026-10-06','BCRA','Relevamiento de Expectativas de Mercado (REM)','septiembre 2026'],
['2026-10-07','INDEC','Índice de producción industrial manufacturero (IPI)','agosto 2026'],
['2026-10-13','INDEC','Índice de precios al consumidor (IPC)','septiembre 2026'],
['2026-10-16','Ministerio de Economía','Resultado fiscal','septiembre 2026'],
['2026-10-19','INDEC','Intercambio comercial argentino (ICA)','septiembre 2026'],
['2026-10-21','INDEC','Estimador mensual de actividad económica (EMAE)','agosto 2026'],
['2026-11-02','ARCA','Recaudación tributaria','octubre 2026'],
['2026-11-05','BCRA','Relevamiento de Expectativas de Mercado (REM)','octubre 2026'],
['2026-11-09','INDEC','Índice de producción industrial manufacturero (IPI)','septiembre 2026'],
['2026-11-12','INDEC','Índice de precios al consumidor (IPC)','octubre 2026'],
['2026-11-16','Ministerio de Economía','Resultado fiscal','octubre 2026'],
['2026-11-19','INDEC','Intercambio comercial argentino (ICA)','octubre 2026'],
['2026-11-24','INDEC','Estimador mensual de actividad económica (EMAE)','septiembre 2026'],
['2026-12-01','ARCA','Recaudación tributaria','noviembre 2026'],
['2026-12-09','INDEC','Índice de producción industrial manufacturero (IPI)','octubre 2026'],
['2026-12-15','INDEC','Índice de precios al consumidor (IPC)','noviembre 2026'],
['2026-12-17','Ministerio de Economía','Resultado fiscal','noviembre 2026'],
['2026-12-18','INDEC','Intercambio comercial argentino (ICA)','noviembre 2026'],
['2026-12-18','INDEC','Mercado de trabajo','tercer trimestre 2026'],
['2026-12-21','INDEC','Estimador mensual de actividad económica (EMAE)','octubre 2026']
].map(([date,agency,title,period])=>({date,agency,title,period,status:'confirmada'}));
export const EVENTS=events;
export default async()=>{const today=todayAR(),next=events.filter(e=>e.date>=today).sort((a,b)=>a.date.localeCompare(b.date)||a.title.localeCompare(b.title)).slice(0,10);return new Response(JSON.stringify({version:64,generatedAt:new Date().toISOString(),monitored:['IPC','EMAE','IPI manufacturero','Mercado de trabajo','Balanza comercial','Recaudación ARCA','Resultado fiscal','REM','ICC UTDT','Indicador CAMARCO'],events:next,notes:['UTDT ICC y CAMARCO sólo se incorporan cuando existe fecha futura confirmada; no se proyectan por patrón.']}),{headers:{'content-type':'application/json; charset=utf-8','cache-control':'public, max-age=3600, s-maxage=21600, stale-while-revalidate=86400','access-control-allow-origin':'*'}})};

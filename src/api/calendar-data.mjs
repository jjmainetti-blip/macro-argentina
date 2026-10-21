const TZ='America/Argentina/Buenos_Aires';
function todayAR(){return new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
const events=[
['2026-10-01','ARCA','Recaudación tributaria','septiembre 2026'],
['2026-10-06','BCRA','Relevamiento de Expectativas de Mercado (REM)','septiembre 2026'],
['2026-10-07','INDEC','Índice de producción industrial manufacturero (IPI)','agosto 2026'],
['2026-10-07','INDEC','Indicador sintético de la actividad de la construcción (ISAC)','agosto 2026'],
['2026-10-13','INDEC','Índice de precios al consumidor (IPC)','septiembre 2026'],
['2026-10-16','Ministerio de Economía','Resultado fiscal','septiembre 2026'],
['2026-10-19','INDEC','Intercambio comercial argentino (ICA)','septiembre 2026'],
['2026-10-21','INDEC','Estimador mensual de actividad económica (EMAE)','agosto 2026'],
['2026-10-21','INDEC','Índice de salarios','agosto 2026'],
['2026-10-22','INDEC','Encuesta de supermercados','agosto 2026'],
['2026-11-02','ARCA','Recaudación tributaria','octubre 2026'],
['2026-11-05','BCRA','Relevamiento de Expectativas de Mercado (REM)','octubre 2026'],
['2026-11-06','INDEC','Índice de producción industrial manufacturero (IPI)','septiembre 2026'],
['2026-11-06','INDEC','Indicador sintético de la actividad de la construcción (ISAC)','septiembre 2026'],
['2026-11-12','INDEC','Índice de precios al consumidor (IPC)','octubre 2026'],
['2026-11-13','INDEC','Índice de salarios','septiembre 2026'],
['2026-11-16','Ministerio de Economía','Resultado fiscal','octubre 2026'],
['2026-11-19','INDEC','Intercambio comercial argentino (ICA)','octubre 2026'],
['2026-11-24','INDEC','Estimador mensual de actividad económica (EMAE)','septiembre 2026'],
['2026-11-25','INDEC','Encuesta de supermercados','septiembre 2026'],
['2026-12-01','ARCA','Recaudación tributaria','noviembre 2026'],
['2026-12-09','INDEC','Índice de producción industrial manufacturero (IPI)','octubre 2026'],
['2026-12-09','INDEC','Indicador sintético de la actividad de la construcción (ISAC)','octubre 2026'],
['2026-12-15','INDEC','Índice de precios al consumidor (IPC)','noviembre 2026'],
['2026-12-17','Ministerio de Economía','Resultado fiscal','noviembre 2026'],
['2026-12-18','INDEC','Intercambio comercial argentino (ICA)','noviembre 2026'],
['2026-12-18','INDEC','Mercado de trabajo','tercer trimestre 2026'],
['2026-12-22','INDEC','Balanza de pagos','tercer trimestre 2026'],
['2026-12-21','INDEC','Estimador mensual de actividad económica (EMAE)','octubre 2026'],
['2026-12-28','INDEC','Encuesta de supermercados','octubre 2026']
].map(([date,agency,title,period])=>({date,agency,title,period,status:'confirmada'}));
export const EVENTS=events;
// v169 · La agenda suma la próxima publicación de cada tarjeta del tablero (calendario oficial cuando existe; si no, el
// rezago habitual del organismo) a las fechas oficiales que no tienen tarjeta (REM, mercado de trabajo…). Máximo 10.
// Las fechas de las tarjetas las guarda la revisión programada en KV (cards:status) para no recalcularlas en cada visita.
const CARD_TITLE={ipc:'Inflación (IPC)',ipcCaba:'Inflación CABA',arca:'Recaudación tributaria',icg:'Índice de Confianza en el Gobierno',autos:'Patentamientos 0 km',came:'Ventas minoristas pyme',super:'Consumo en supermercados',scentia:'Consumo masivo',emae:'Actividad económica (EMAE)',isac:'Construcción (ISAC)',fiscal:'Resultado fiscal',cement:'Despachos de cemento',credit:'Crédito al sector privado',arrears:'Mora bancaria',ipi:'Industria manufacturera (IPI)',trade:'Intercambio comercial (ICA)',ila:'Índice Líder (ILA)',iga:'Índice General de Actividad (IGA-OJF)',bop:'Balanza de pagos',poverty:'Pobreza e indigencia'};
let MEMO=null;
export async function agendaEvents(env,{limit=10,today=todayAR()}={}){
  let cards=null;
  if(MEMO&&Date.now()-MEMO.at<5*60*1000)cards=MEMO.cards;
  else{try{cards=await env?.MACRO_STORE?.get?.('cards:status','json');}catch{}if(cards)MEMO={at:Date.now(),cards};}
  const { CARDS, AGENCY } = await import('./freshness.mjs');
  if(!cards){try{const {BUNDLED_SOURCES}=await import('./bundled-history.mjs');const {cardStatus}=await import('./freshness.mjs');cards=cardStatus([BUNDLED_SOURCES],today);}catch{cards=[];}}
  const cals=CARDS.filter(c=>c.cal).map(c=>c.cal);
  const out=[];
  for(const c of cards||[]){
    if(!c?.expected||!c.nextLabel)continue;
    const pending=c.expected<today;
    out.push({date:c.expected,agency:AGENCY[c.key]||'',title:CARD_TITLE[c.key]||c.title,period:c.nextLabel,status:pending?'pendiente':(c.expectedBasis==='calendario oficial'?'confirmada':'estimada'),key:c.key});
  }
  for(const e of events)if(e.date>=today&&!cals.some(re=>re.test(e.title)))out.push(e);
  // Pendientes (ya debían salir) primero; después por fecha.
  out.sort((a,b)=>(a.status==='pendiente'?0:1)-(b.status==='pendiente'?0:1)||a.date.localeCompare(b.date)||a.title.localeCompare(b.title));
  return out.slice(0,limit);
}
export async function saveCardStatus(env,statuses){
  if(!env?.MACRO_STORE?.put||!Array.isArray(statuses))return;
  const compact=statuses.map(s=>({key:s.key,title:s.title,next:s.next||null,nextLabel:s.nextLabel||null,expected:s.expected||null,expectedBasis:s.expectedBasis||null,state:s.state}));
  const body=JSON.stringify(compact);
  try{const prev=await env.MACRO_STORE.get('cards:status');if(prev===body)return;await env.MACRO_STORE.put('cards:status',body);MEMO={at:Date.now(),cards:compact};}catch{}
}
export default async(env)=>{const next=await agendaEvents(env);return new Response(JSON.stringify({version:169,generatedAt:new Date().toISOString(),events:next,notes:['Próxima publicación de cada indicador del tablero: calendario oficial cuando existe; si no, fecha estimada según el calendario habitual del organismo.']}),{headers:{'content-type':'application/json; charset=utf-8','cache-control':'public, max-age=300','access-control-allow-origin':'*'}});};

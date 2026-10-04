const round=(n,d=2)=>Number(Number(n).toFixed(d));
async function fetchJson(url,ms=4500){const c=new AbortController(),t=setTimeout(()=>c.abort(),ms);try{const r=await fetch(url,{signal:c.signal,headers:{accept:'application/json','user-agent':'Macrodatos/1.0 (+https://macrodatos.ar)'}});if(!r.ok)throw new Error(`${r.status}`);return await r.json();}finally{clearTimeout(t)}}
async function fetchText(url,ms=4500){const c=new AbortController(),t=setTimeout(()=>c.abort(),ms);try{const r=await fetch(url,{signal:c.signal,headers:{accept:'text/html','user-agent':'Mozilla/5.0 Macrodatos/1.0 (+https://macrodatos.ar)'}});if(!r.ok)throw new Error(`${r.status}`);return await r.text();}finally{clearTimeout(t)}}
// v120: históricos pesados (sólo para el cierre anterior) se reutilizan 1 hora dentro del isolate.
const HIST_CACHE=new Map();
async function fetchJsonCached(url,ttl=3600000,ms=6000){const h=HIST_CACHE.get(url);if(h&&Date.now()-h.at<ttl)return h.data;const data=await fetchJson(url,ms);HIST_CACHE.set(url,{at:Date.now(),data});return data;}
const numAR=s=>Number(String(s??'').replace(/\./g,'').replace(',','.').replace('%','').trim());
const MONTHS_ES={enero:'01',febrero:'02',marzo:'03',abril:'04',mayo:'05',junio:'06',julio:'07',agosto:'08',septiembre:'09',setiembre:'09',octubre:'10',noviembre:'11',diciembre:'12'};
function obs(x){if(Array.isArray(x))return x;if(Array.isArray(x?.data))return x.data;if(Array.isArray(x?.results))return x.results;if(x&&typeof x==='object')return [x];return []}
function rows(x,valueKeys=['valor','value','venta','close','price']){return obs(x).map(r=>{let v=NaN;for(const k of valueKeys){const n=Number(r?.[k]);if(Number.isFinite(n)){v=n;break}}return {date:String(r?.fecha??r?.date??r?.fechaActualizacion??r?.updatedAt??'').slice(0,10),value:v}}).filter(r=>r.date&&Number.isFinite(r.value)).sort((a,b)=>a.date.localeCompare(b.date))}
function priorClose(x,liveDate,valueKeys){const a=rows(x,valueKeys);const prior=a.filter(r=>r.date<liveDate).at(-1);return prior?.value??null}
function withChange(o,previous){const value=Number(o.value);return {...o,previous:Number.isFinite(Number(previous))?Number(previous):null,changePct:Number.isFinite(value)&&Number.isFinite(Number(previous))&&Number(previous)!==0?round((value/Number(previous)-1)*100):null}}
function isoDateAR(){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
async function risk(){
  const today=isoDateAR();
  let hist=null, previous=null;
  try{
    hist=await fetchJsonCached('https://api.argentinadatos.com/v1/finanzas/indices/riesgo-pais');
    previous=priorClose(hist,today,['valor','value']);
  }catch{}

  // v120 · Fuente principal: Ámbito (JSON público, se actualiza durante la rueda).
  const candidates=[];
  try{
    const x=await fetchJson('https://mercados.ambito.com//riesgopais/variacion',4000);
    const value=numAR(x?.ultimo),fm=String(x?.fecha||'').match(/(\d{2})-(\d{2})-(\d{4})/),pct=numAR(x?.variacion);
    if(Number.isFinite(value)&&value>=100&&value<=10000&&fm){const date=`${fm[3]}-${fm[2]}-${fm[1]}`;const prev=Number.isFinite(pct)&&pct!==-100?(pct===0?value:value/(1+pct/100)):previous;
      candidates.push({...withChange({date,value,updatedAt:new Date().toISOString()},date===today?(Number.isFinite(previous)?previous:prev):prev),changeBp:Number.isFinite(date===today?previous:prev)?round(value-(date===today?previous:prev),0):null,live:date===today,source:'Ámbito'});}
  }catch{}
  if(candidates[0]?.live)return candidates[0];
  // v120 · Rava: la meta descripción indica valor y fecha ("hoy: 607 (actualizado al 30 de septiembre de 2026)").
  try{
    const html=await fetchText('https://www.rava.com/cotizaciones/historico/riesgo-pais/hoy/',5000);
    const m=html.match(/Riesgo Pa[ií]s hoy:\s*([\d.]+)\s*\(actualizado al (\d{1,2}) de ([a-záéíóú]+) de (\d{4})\)/i);
    if(m){const value=numAR(m[1]),date=`${m[4]}-${MONTHS_ES[m[3].toLowerCase()]||'00'}-${String(m[2]).padStart(2,'0')}`;const pc=html.match(/CIERRE ANTERIOR[\s\S]{0,160}?hoy-detail-val[^>]*>\s*([\d.]+)/i);const prev=pc?numAR(pc[1]):previous;
      if(Number.isFinite(value)&&value>=100){const r={...withChange({date,value,updatedAt:new Date().toISOString()},prev),changeBp:Number.isFinite(prev)?round(value-prev,0):null,live:date===today,source:'Rava'};if(r.live)return r;candidates.push(r);}}
  }catch{}
  // Primary live source: Infobae's economy market strip, identified on-page as Reuters - Real Time.
  // Unlike the historical feed, this can move during the current trading session.
  try{
    const html=await fetchText('https://www.infobae.com/economia/',5500);
    const plain=html.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/\s+/g,' ');
    const patterns=[
      /Riesgo\s*Pa[ií]s\s*\*?\s*(\d{3,4})\b/i,
      /Riesgo\s*Pa[ií]s.{0,80}?(\d{3,4})\b/i
    ];
    let m=null; for(const re of patterns){m=plain.match(re);if(m)break}
    if(m){
      const value=Number(m[1]);
      if(Number.isFinite(value)&&value>=100&&value<=10000){
        return {...withChange({date:today,value,updatedAt:new Date().toISOString()},previous),changeBp:Number.isFinite(previous)?round(value-previous,0):null,live:true,source:'Reuters Real Time vía Infobae'};
      }
    }
  }catch{}

  // Secondary live source: Rava, but only when the page explicitly says it was updated today.
  // This prevents a prior-session value from being relabeled as today's live quote.
  try{
    const html=await fetchText('https://www.rava.com/cotizaciones/historico/riesgo-pais/hoy/',5000);
    const plain=html.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/\s+/g,' ');
    const dm=plain.match(/Actualizado\s+al\s+(\d{1,2})\s+de\s+([a-záéíóú]+)\s+de\s+(\d{4})/i);
    const months={enero:'01',febrero:'02',marzo:'03',abril:'04',mayo:'05',junio:'06',julio:'07',agosto:'08',septiembre:'09',octubre:'10',noviembre:'11',diciembre:'12'};
    const pageDate=dm?`${dm[3]}-${months[dm[2].toLowerCase()]||'00'}-${String(dm[1]).padStart(2,'0')}`:'';
    const vm=plain.match(/Riesgo\s+Pa[ií]s\s+hoy\s+(\d{3,4})\b/i)||plain.match(/Riesgo\s+Pa[ií]s.{0,80}?(\d{3,4})\s+puntos/i);
    if(pageDate===today&&vm){
      const value=Number(vm[1]);
      if(Number.isFinite(value))return {...withChange({date:today,value,updatedAt:new Date().toISOString()},previous),changeBp:Number.isFinite(previous)?round(value-previous,0):null,live:true,source:'Rava'};
    }
  }catch{}

  if(candidates.length)return candidates.sort((x,y)=>String(y.date).localeCompare(String(x.date)))[0];
  // Last resort is explicitly non-live: latest consolidated historical observation.
  try{
    const a=rows(hist||await fetchJson('https://api.argentinadatos.com/v1/finanzas/indices/riesgo-pais'),['valor','value']);
    const z=a.at(-1),p=a.at(-2);if(z)return {...withChange(z,p?.value),changeBp:p?round(z.value-p.value,0):null,live:false,source:'ArgentinaDatos (último cierre)'};
  }catch{}
  return null;
}
async function liveDollar(casa){
  const live=await fetchJson(`https://dolarapi.com/v1/dolares/${casa}`);
  const value=Number(live?.venta),buy=Number(live?.compra),date=String(live?.fechaActualizacion||'').slice(0,10)||isoDateAR();
  if(!Number.isFinite(value))throw new Error(`sin valor ${casa}`);
  let previous=null;
  try{const hist=await fetchJsonCached(`https://api.argentinadatos.com/v1/cotizaciones/dolares/${casa==='bolsa'?'bolsa':casa}`);previous=priorClose(hist,date,['venta','value','valor'])}catch{}
  return {...withChange({date,value,buy:Number.isFinite(buy)?buy:null,sell:value,updatedAt:live?.fechaActualizacion||null},previous),live:true,source:'DolarApi'};
}
async function mep(){try{return await liveDollar('bolsa')}catch{}try{const h=await fetchJson('https://api.argentinadatos.com/v1/cotizaciones/dolares/bolsa');const a=rows(h,['venta']);const z=a.at(-1),p=a.at(-2);return z?{...withChange(z,p?.value),live:false}:null}catch{}return null}
async function bna(){
  // Ámbito/DolarApi exposes Banco Nación explicitly and includes the intraday variation vs previous close.
  try{
    const x=await fetchJson('https://dolarapi.com/v1/ambito/dolares/bna');
    const sell=Number(x?.venta),buy=Number(x?.compra),pct=Number(x?.variacion),date=String(x?.fechaActualizacion||'').slice(0,10)||isoDateAR();
    if(Number.isFinite(sell)){
      const previous=Number.isFinite(pct)&&pct!==-100?sell/(1+pct/100):null;
      return {date,value:sell,sell,buy:Number.isFinite(buy)?buy:null,previous:Number.isFinite(previous)?previous:null,changePct:Number.isFinite(pct)?round(pct):null,updatedAt:x?.fechaActualizacion||null,live:true,source:'Ámbito'};
    }
  }catch{}
  try{return await liveDollar('oficial')}catch{}
  return null;
}
// v120 · Merval: BYMA (API pública de BYMADATA, cotización del día y cierre anterior) → Rava → zion.ar (último cierre).
async function merval(){
  try{
    const c=new AbortController(),tm=setTimeout(()=>c.abort(),5000);
    try{const r=await fetch('https://open.bymadata.com.ar/vanoms-be-core/rest/api/bymadata/free/index-price',{method:'POST',signal:c.signal,headers:{'content-type':'application/json',accept:'application/json','user-agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',origin:'https://open.bymadata.com.ar',referer:'https://open.bymadata.com.ar/'},body:'{}'});
      if(!r.ok)throw new Error(`BYMA ${r.status}`);const j=await r.json();const x=(j?.data||[]).find(d=>d?.symbol==='M'||/S&P MERVAL$/i.test(String(d?.description||'')));
      const value=Number(x?.price),prev=Number(x?.previousClosingPrice);
      if(Number.isFinite(value)&&value>0){const date=String(x.date||isoDateAR()).slice(0,10);return {...withChange({date,value,updatedAt:new Date().toISOString(),high:Number(x.highValue)||null,low:Number(x.minValue)||null},prev),live:date===isoDateAR(),source:'BYMA'};}
    }finally{clearTimeout(tm)}
  }catch{}
  try{
    const html=await fetchText('https://www.rava.com/cotizaciones/historico/merval/hoy/',5000);
    const m=html.match(/<meta name="description" content="\$([\d.]+)\s*\(([+-]?[\d,]+)%\)/i);
    if(m){const value=numAR(m[1]),pct=numAR(m[2]);if(Number.isFinite(value)&&value>0){const prev=Number.isFinite(pct)&&pct!==-100?value/(1+pct/100):null;return {date:isoDateAR(),value,previous:prev?round(prev,2):null,changePct:Number.isFinite(pct)?pct:null,updatedAt:new Date().toISOString(),live:false,source:'Rava (demora ~10 min)'};}}
  }catch{}
  for(const u of ['https://zion.ar/api/v1/indicators/merval/history?limit=2','https://zion.ar/api/v1/indicators/merval/history?limit=5']){try{const a=rows(await fetchJson(u));const z=a.at(-1),p=a.at(-2);if(z)return {...withChange(z,p?.value),live:false,source:'zion.ar (último cierre)'}}catch{}}
  return null;
}
// v120: el sitio consulta cada 30 s. Se comparte una respuesta de 20 s por colo (Cache API) y por isolate,
// para no multiplicar pedidos a las fuentes cuando hay muchos visitantes.
// v133: el último dato se guarda también en KV (markets:latest). Sirve para (1) escribir los valores en el HTML de
// la portada, (2) responder al instante si tiene menos de 60 s y (3) no retroceder nunca: si una fuente falla o
// devuelve un cierre más viejo que el ya guardado, se conserva el más reciente.
let MEMO={at:0,body:null};
const KV_KEY='markets:latest';
const newer=(n,p)=>{if(!n)return p||null;if(!p)return n;return String(n.date||'').slice(0,10)>=String(p.date||'').slice(0,10)?n:p;};
export async function latestMarketsBody(env){
  if(MEMO.body&&Date.now()-MEMO.at<120000)return MEMO.body;
  try{const r=await env?.MACRO_STORE?.getWithMetadata?.(KV_KEY);if(r?.value){if(!MEMO.body||(r.metadata?.savedAt||0)>MEMO.at)MEMO={at:r.metadata?.savedAt||Date.now()-60000,body:r.value};return MEMO.body;}}catch{}
  return MEMO.body;
}
const json=(body,tag)=>new Response(body,{headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-markets-cache':tag}});
export default async(request=null,ctx=null,env=null,opts={})=>{
  const cacheKey=new Request('https://macro-cache.internal/api/markets/v133');
  if(!opts.force){
    if(MEMO.body&&Date.now()-MEMO.at<20000)return json(MEMO.body,'memory');
    try{const hit=await caches?.default?.match(cacheKey);if(hit){const body=await hit.text();MEMO={at:Date.now(),body};return json(body,'edge');}}catch{}
  }
  let prev=null,prevAt=0;
  try{const r=await env?.MACRO_STORE?.getWithMetadata?.(KV_KEY);if(r?.value){prev=JSON.parse(r.value);prevAt=r.metadata?.savedAt||0;if(!opts.force&&Date.now()-prevAt<60000){MEMO={at:prevAt,body:r.value};return json(r.value,'kv');}}}catch{}
  const [a,b,c,d]=await Promise.allSettled([merval(),mep(),risk(),bna()]);
  const val=x=>x.status==='fulfilled'?x.value:null,P=prev?.latest||{};
  const latest={merval:newer(val(a),P.merval),dollar:newer(val(b),P.dollar),risk:newer(val(c),P.risk),bna:newer(val(d),P.bna)};
  const body=JSON.stringify({version:133,generatedAt:new Date().toISOString(),mode:'live',refreshSeconds:30,latest});
  MEMO={at:Date.now(),body};
  try{const put=caches?.default?.put(cacheKey,new Response(body,{headers:{'content-type':'application/json','cache-control':'public, max-age=20'}}));if(put&&ctx?.waitUntil)ctx.waitUntil(put);}catch{}
  try{if(env?.MACRO_STORE?.put&&Object.values(latest).some(Boolean)){const w=env.MACRO_STORE.put(KV_KEY,body,{metadata:{savedAt:Date.now()}});if(ctx?.waitUntil)ctx.waitUntil(w);else await w;}}catch{}
  return json(body,'miss');
};

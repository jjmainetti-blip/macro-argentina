const round=(n,d=2)=>Number(Number(n).toFixed(d));
async function fetchJson(url,ms=4500){const c=new AbortController(),t=setTimeout(()=>c.abort(),ms);try{const r=await fetch(url,{signal:c.signal,headers:{accept:'application/json','user-agent':'MacroArgentinaDashboard/5.0'}});if(!r.ok)throw new Error(`${r.status}`);return await r.json();}finally{clearTimeout(t)}}
async function fetchText(url,ms=4500){const c=new AbortController(),t=setTimeout(()=>c.abort(),ms);try{const r=await fetch(url,{signal:c.signal,headers:{accept:'text/html','user-agent':'Mozilla/5.0 MacroArgentinaDashboard/5.0'}});if(!r.ok)throw new Error(`${r.status}`);return await r.text();}finally{clearTimeout(t)}}
function obs(x){if(Array.isArray(x))return x;if(Array.isArray(x?.data))return x.data;if(Array.isArray(x?.results))return x.results;if(x&&typeof x==='object')return [x];return []}
function rows(x,valueKeys=['valor','value','venta','close','price']){return obs(x).map(r=>{let v=NaN;for(const k of valueKeys){const n=Number(r?.[k]);if(Number.isFinite(n)){v=n;break}}return {date:String(r?.fecha??r?.date??r?.fechaActualizacion??r?.updatedAt??'').slice(0,10),value:v}}).filter(r=>r.date&&Number.isFinite(r.value)).sort((a,b)=>a.date.localeCompare(b.date))}
function priorClose(x,liveDate,valueKeys){const a=rows(x,valueKeys);const prior=a.filter(r=>r.date<liveDate).at(-1);return prior?.value??null}
function withChange(o,previous){const value=Number(o.value);return {...o,previous:Number.isFinite(Number(previous))?Number(previous):null,changePct:Number.isFinite(value)&&Number.isFinite(Number(previous))&&Number(previous)!==0?round((value/Number(previous)-1)*100):null}}
function isoDateAR(){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
async function risk(){
  // Live: Rava homepage publishes the current intraday EMBI+ value. Historical API is used only as previous close.
  try{
    const html=await fetchText('https://www.rava.com/');
    const plain=html.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/\s+/g,' ');
    const m=plain.match(/RIESGO\s*PAIS\s+(\d{3,4})(?:\s|,|\.)/i)||plain.match(/Riesgo\s+Pa[ií]s.{0,100}?(\d{3,4})\b/i);
    if(m){
      const value=Number(m[1]),date=isoDateAR();
      const hist=await fetchJson('https://api.argentinadatos.com/v1/finanzas/indices/riesgo-pais');
      const previous=priorClose(hist,date,['valor','value']);
      return {...withChange({date,value},previous),changeBp:Number.isFinite(previous)?round(value-previous,0):null,live:true,source:'Rava'};
    }
  }catch{}
  // Fallback: latest published API observation, never a hard-coded value.
  try{
    const hist=await fetchJson('https://api.argentinadatos.com/v1/finanzas/indices/riesgo-pais');
    const a=rows(hist,['valor','value']);const z=a.at(-1),p=a.at(-2);if(z)return {...withChange(z,p?.value),changeBp:p?round(z.value-p.value,0):null,live:false,source:'ArgentinaDatos'};
  }catch{}
  return null;
}
async function liveDollar(casa){
  const live=await fetchJson(`https://dolarapi.com/v1/dolares/${casa}`);
  const value=Number(live?.venta),buy=Number(live?.compra),date=String(live?.fechaActualizacion||'').slice(0,10)||isoDateAR();
  if(!Number.isFinite(value))throw new Error(`sin valor ${casa}`);
  let previous=null;
  try{const hist=await fetchJson(`https://api.argentinadatos.com/v1/cotizaciones/dolares/${casa==='bolsa'?'bolsa':casa}`);previous=priorClose(hist,date,['venta','value','valor'])}catch{}
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
      return {date,value:sell,sell,buy:Number.isFinite(buy)?buy:null,previous:Number.isFinite(previous)?previous:null,changePct:Number.isFinite(pct)?round(pct):null,updatedAt:x?.fechaActualizacion||null,live:true,source:'DolarApi / Ámbito (BNA)'};
    }
  }catch{}
  try{return await liveDollar('oficial')}catch{}
  return null;
}
async function merval(){for(const u of ['https://zion.ar/api/v1/indicators/merval/history?limit=2','https://zion.ar/api/v1/indicators/merval/history?limit=5']){try{const a=rows(await fetchJson(u));const z=a.at(-1),p=a.at(-2);if(z)return {...withChange(z,p?.value),live:false}}catch{}}return null}
export default async()=>{const [a,b,c,d]=await Promise.allSettled([merval(),mep(),risk(),bna()]);const val=x=>x.status==='fulfilled'?x.value:null;return new Response(JSON.stringify({version:99,generatedAt:new Date().toISOString(),mode:'live',latest:{merval:val(a),dollar:val(b),risk:val(c),bna:val(d)}}),{headers:{'content-type':'application/json; charset=utf-8','cache-control':'public, max-age=30, s-maxage=30, stale-while-revalidate=30','access-control-allow-origin':'*'}})};

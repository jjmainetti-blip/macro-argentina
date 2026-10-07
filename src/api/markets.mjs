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
// v143 · Compras/ventas de divisas del BCRA (variable 78 de la API de Estadísticas: "Variación de reservas
// internacionales por compra de divisas", millones de USD, dato diario con 1–3 días hábiles de rezago) y reservas (var. 1).
let BCRA_FX={at:0,value:null};
// v144 · El BCRA informa la compra del día a la prensa al cierre (~17 h), pero la API oficial la incorpora con 2–3 días
// hábiles de rezago. Para los días que la API todavía no tiene, se toma el monto informado en los titulares del día
// (Google Noticias, "El BCRA compró US$ 41 millones…"): por cada rueda se usa el monto que más se repite entre medios
// distintos. Se marca como preliminar y se reemplaza por el dato oficial apenas el BCRA lo publica.
const AR_OFFSET=-3*3600e3;
const prevBizDay=d=>{const x=new Date(d+'T12:00:00Z');do{x.setUTCDate(x.getUTCDate()-1);}while([0,6].includes(x.getUTCDay()));return x.toISOString().slice(0,10);};
export function bcraPressDays(rss){
  const votes={};
  for(const m of String(rss||'').matchAll(/<item>[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<pubDate>([\s\S]*?)<\/pubDate>/g)){
    const title=m[1].replace(/<!\[CDATA\[|\]\]>/g,'').replace(/&amp;/g,'&').replace(/&quot;/g,'"'),pub=Date.parse(m[2]);if(!Number.isFinite(pub))continue;
    const head=title.replace(/\s+-\s+[^-]+$/,''),source=(title.match(/\s+-\s+([^-]+)$/)||[])[1]||'';
    if(/en lo que va|acumul|en la semana|en una semana|semanal/i.test(head))continue;
    const x=head.match(/(?:BCRA|Banco Central)\s+(?:[a-záéíóúñ]+\s+){0,3}?(compró|adquirió|sumó|vendió|se desprendió de)\s+(?:otros\s+|unos?\s+)?(?:(?:US\$|U\$S|u\$s|USD|US)\s?)?([\d.,]+)\s*(?:millones|milones|M)\b(?:\s+de\s+d[oó]lares)?(.{0,40})/i);if(!x)continue;
    if(/^\s*(en|durante)\s+(la|el|lo|una|dos|tres|cuatro|cinco|\d+)\s+(semana|mes|d[ií]as|ruedas|jornadas|año)/i.test(x[3]))continue;
    if(!/(US\$|U\$S|u\$s|USD|US|d[oó]lares)/i.test(x[0]))continue;
    const v=Number(x[2].replace(/\./g,'').replace(',','.'))*(/vendi|desprendi/i.test(x[1])?-1:1);if(!Number.isFinite(v)||Math.abs(v)>3000)continue;
    const ar=new Date(pub+AR_OFFSET),hour=ar.getUTCHours();let day=ar.toISOString().slice(0,10);
    if(hour<15)day=prevBizDay(day);if([0,6].includes(new Date(day+'T12:00:00Z').getUTCDay()))continue;
    ((votes[day]??={})[v]??=new Set()).add(source.trim().toLowerCase()||title);
  }
  const out={};
  for(const [day,byV] of Object.entries(votes)){const best=Object.entries(byV).sort((a,b)=>b[1].size-a[1].size)[0];const tie=Object.values(byV).filter(z=>z.size===best[1].size).length>1;if(!tie)out[day]={value:Number(best[0]),sources:best[1].size};}
  return out;
}
async function bcraPress(){
  try{const r=await fetch('https://news.google.com/rss/search?q=%22BCRA%22+OR+%22Banco+Central%22+compr%C3%B3+OR+vendi%C3%B3+millones+when:7d&hl=es-419&gl=AR&ceid=AR:es-419',{headers:{'user-agent':'Mozilla/5.0 (compatible; macrodatos.ar)',accept:'application/rss+xml,text/xml'},cf:{cacheTtl:600,cacheEverything:true}});if(!r.ok)return {};return bcraPressDays(await r.text());}catch{return {};}
}
// v145 · Cuenta oficial del BCRA en X (@BancoCentral_AR) vía API v2 (pago por uso: se cobra cada publicación leída).
// Para gastar lo mínimo: sólo días hábiles entre las 16 y las 21 h (Argentina), como mucho una consulta cada 10 minutos
// entre todas las instancias (KV), sólo publicaciones nuevas (since_id) y nada si el dato del día ya se obtuvo.
// Token: secreto X_BEARER_TOKEN del Worker. Estado en KV: x:bcra {userId, sinceId, lastCheck, days{AAAA-MM-DD:{value,reserves,id}}}.
const X_USER='BancoCentral_AR';
export function parseBcraPost(text){
  const t=String(text||'').replace(/\s+/g,' ');
  const m=t.match(/(compr[oó]|adquiri[oó]|vendi[oó]|incorpor[oó])\s+(?:hoy\s+|en el d[ií]a de hoy\s+|en la jornada de hoy\s+)?(?:un total de\s+)?(?:USD|US\$|U\$S|u\$s)\s?([\d.,]+)\s*(millones|M)\b/i);
  if(!m){const alt=t.match(/(compras?|ventas?)(?: netas?)? de (?:divisas|d[oó]lares)[^0-9]{0,30}?([+-]?)\s?(?:USD|US\$|U\$S|u\$s)?\s?([\d.,]+)\s*(millones|M)\b/i);
    if(alt&&!/semana|en lo que va|acumul|en el mes|en el año/i.test(t)){const v=Number(alt[3].replace(/\./g,'').replace(',','.'))*(/venta/i.test(alt[1])||alt[2]==='-'?-1:1);if(Number.isFinite(v)&&Math.abs(v)<=5000){const r=t.match(/reservas[^.]{0,80}?(?:USD|US\$|U\$S|u\$s)\s?([\d.,]+)\s*millones/i);const res=r?Number(r[1].replace(/\./g,'').replace(',','.')):null;return {value:v,reserves:Number.isFinite(res)&&res>1000?res:null};}}
    return null;}
  if(/semana|en lo que va|acumul|en el mes|en el año|en (?:dos|tres|cuatro|\d+) (?:ruedas|d[ií]as|jornadas)/i.test(t.slice(Math.max(0,m.index-40),m.index+m[0].length+30)))return null;
  const v=Number(m[2].replace(/\./g,'').replace(',','.'))*(/vendi/i.test(m[1])?-1:1);if(!Number.isFinite(v)||Math.abs(v)>5000)return null;
  const r=t.match(/reservas[^.]{0,80}?(?:USD|US\$|U\$S|u\$s)\s?([\d.,]+)\s*millones/i);const res=r?Number(r[1].replace(/\./g,'').replace(',','.')):null;
  return {value:v,reserves:Number.isFinite(res)&&res>1000?res:null};
}
// v147 · El token se limpia (espacios, comillas, "Bearer " pegado de más) y se informa su forma —nunca el valor— en /api/status.
export function cleanXToken(raw){return String(raw||'').trim().replace(/^["'`]+|["'`]+$/g,'').replace(/^Bearer\s+/i,'').replace(/\s+/g,'');}
export function xTokenShape(raw){
  const r=String(raw||''),t=cleanXToken(r);
  const kind=/^A{10,}/.test(t)?'bearer (correcto)':/^\d+-[A-Za-z0-9]+$/.test(t)?'parece Access Token (no sirve: hace falta el Bearer Token)':t.length===25&&/^[A-Za-z0-9]+$/.test(t)?'parece API Key (no sirve: hace falta el Bearer Token)':t.length===50&&/^[A-Za-z0-9]+$/.test(t)?'parece API Key Secret o Access Token Secret (no sirve)':/^[A-Za-z0-9_-]{30,40}$/.test(t)?'parece Client ID/Secret de OAuth 2.0 (no sirve)':'desconocido';
  return {length:t.length,kind,cleaned:t!==r,hadSpacesOrQuotes:/^\s|\s$|["'`]/.test(r),hadBearerPrefix:/^\s*["'`]?Bearer\s/i.test(r)};
}
// Texto de la placa "Principales variables" (texto alternativo o lectura de la imagen).
const numBCRA=x=>Number(String(x).replace(/\s/g,'').replace(/\.(?=\d{3}(\D|$))/g,'').replace(',','.'));
export function parseBcraCard(t){
  t=String(t||'').replace(/\s+/g,' ');
  const c1=t.match(/(compras?|ventas?) de divisas(?: netas?)?(?: en millones de USD)?(?:\s*\(\d\))?\s*[:=]\s*([+\-−–]?\s?\d[\d.,]*\d|\d)/i);
  const c2=c1?null:t.match(/([+\-−–]?\s?\d[\d.,]*\d|\d)\s*(?:millones de USD\s*)?(?:\(\d\)\s*)?(compras?|ventas?) de divisas/i);
  if(!c1&&!c2)return null;
  const raw=(c1?c1[2]:c2[1]).replace(/\s/g,''),lab=c1?c1[1]:c2[2],neg=/^[\-−–]/.test(raw)||/venta/i.test(lab);
  const v=numBCRA(raw.replace(/^[+\-−–]/,''))*(neg?-1:1);if(!Number.isFinite(v)||Math.abs(v)>5000)return null;
  const r=t.match(/reservas(?: internacionales)?(?: en millones de USD)?(?:\s*\(\d\))?\s*[:=]\s*(?:USD\s*)?(\d[\d.,]*\d)/i)||t.match(/(\d[\d.,]*\d)\s*(?:\(\d\)\s*)?reservas/i);
  const res=r?numBCRA(r[1]):null;
  return {value:v,reserves:Number.isFinite(res)&&res>10000&&res<200000?res:null};
}
const AI_MODELS=['@cf/meta/llama-4-scout-17b-16e-instruct','@cf/google/gemma-3-12b-it'];
const MESES={enero:1,febrero:2,marzo:3,abril:4,mayo:5,junio:6,julio:7,agosto:8,septiembre:9,setiembre:9,octubre:10,noviembre:11,diciembre:12};
async function readBcraCard(env,url,createdAt){
  const img=await fetch(url+(url.includes('?')?'':'?name=medium'));if(!img.ok)throw new Error(`imagen ${img.status}`);
  const buf=new Uint8Array(await img.arrayBuffer());let bin='';for(let i=0;i<buf.length;i+=0x8000)bin+=String.fromCharCode(...buf.subarray(i,i+0x8000));
  const data=`data:${img.headers.get('content-type')||'image/jpeg'};base64,${btoa(bin)}`;
  const prompt='Esta es una placa del Banco Central de la República Argentina con "Principales variables". Copiá EXACTAMENTE como aparecen escritos (como texto, sin convertir separadores): la fecha, el número de "Reservas en millones de USD" y el número de la fila de compra o venta de divisas, con su signo si lo tiene, y el rótulo de esa fila. Respondé sólo con JSON: {"fecha":"...","reservas":"...","divisas":"...","rotulo":"..."}';
  let last='';
  for(const model of AI_MODELS){
    try{
      const out=await env.AI.run(model,{messages:[{role:'user',content:[{type:'text',text:prompt},{type:'image_url',image_url:{url:data}}]}],max_tokens:200,temperature:0});
      const txt=typeof out?.response==='string'?out.response:JSON.stringify(out?.response??out);last=txt;
      const m=txt.match(/\{[\s\S]*\}/);if(!m)continue;const o=JSON.parse(m[0]);
      const raw=String(o.divisas||'').replace(/\s/g,''),neg=/^[\-−–]/.test(raw)||/venta|vend/i.test(String(o.rotulo||''));
      const v=numBCRA(raw.replace(/^[+\-−–]/,''))*(neg?-1:1);if(!Number.isFinite(v)||Math.abs(v)>5000)continue;
      const res=numBCRA(String(o.reservas||''));
      // Fecha de la placa ("Miércoles 7 de octubre de 2026"); si no se entiende, se usa la de la publicación.
      let date=null;const f=String(o.fecha||'').toLowerCase().match(/(\d{1,2})\s+de\s+([a-záéíóú]+)\s+de\s+(20\d{2})/);
      if(f&&MESES[f[2]])date=`${f[3]}-${String(MESES[f[2]]).padStart(2,'0')}-${f[1].padStart(2,'0')}`;
      const pub=new Date(Date.parse(createdAt)-3*3600e3).toISOString().slice(0,10);if(date&&(date>pub||date<pub.slice(0,8)+'01'&&date.slice(0,7)!==pub.slice(0,7)))date=null;
      return {value:v,reserves:Number.isFinite(res)&&res>10000&&res<200000?res:null,date,model};
    }catch(e){last=String(e?.message||e);}
  }
  throw new Error(`IA sin resultado: ${last.slice(0,150)}`);
}
async function xErr(r,label){let d='';try{const j=await r.json();d=j?.detail||j?.title||j?.errors?.[0]?.message||'';}catch{}return `${label} ${r.status}${d?`: ${String(d).slice(0,160)}`:''}`;}
export async function bcraX(env){
  const token=cleanXToken(env?.X_BEARER_TOKEN),KV=env?.MACRO_STORE;if(!token||!KV?.get)return {};
  let st={};try{st=(await KV.get('x:bcra','json'))||{};}catch{}
  // Si se cargó un token nuevo, se reintenta enseguida (sin esperar el freno por error anterior).
  let fp=0;for(const c of token)fp=(fp*31+c.charCodeAt(0))>>>0;
  if(st.tokenFp!==fp){st.tokenFp=fp;st.backoffUntil=null;st.lastCheck=null;}
  // v148 · Si cambia el lector de publicaciones, se vuelven a leer los últimos 8 días.
  const PARSER=3;if(st.parser!==PARSER){st.parser=PARSER;st.sinceId=null;st.lastCheck=null;}
  const now=Date.now(),ar=new Date(now-3*3600e3),today=ar.toISOString().slice(0,10),h=ar.getUTCHours(),wd=ar.getUTCDay();
  const days=st.days||{};
  const due=wd>=1&&wd<=5&&h>=16&&h<21&&!days[today]&&(!st.lastCheck||now-st.lastCheck>10*60*1000)&&(!st.backoffUntil||now>st.backoffUntil);
  if(!due)return days;
  st.lastCheck=now;
  try{
    const H={authorization:`Bearer ${token}`,'user-agent':'macrodatos.ar'};
    if(!st.userId){const r=await fetch(`https://api.x.com/2/users/by/username/${X_USER}`,{headers:H});if(!r.ok){if([401,402,403,429].includes(r.status))st.backoffUntil=now+30*60*1000;throw new Error(await xErr(r,'X user'));}st.userId=(await r.json())?.data?.id;if(!st.userId)throw new Error('X: usuario no encontrado');}
    const q=new URLSearchParams({max_results:'10','tweet.fields':'created_at,attachments',expansions:'attachments.media_keys','media.fields':'url,alt_text,type',exclude:'retweets,replies'});if(st.sinceId)q.set('since_id',st.sinceId);else{q.set('start_time',new Date(now-8*24*3600e3).toISOString());q.set('max_results','25');}
    const r=await fetch(`https://api.x.com/2/users/${st.userId}/tweets?${q}`,{headers:H});
    if(r.status===429||r.status===402||r.status===401||r.status===403){st.backoffUntil=now+60*60*1000;st.lastError=await xErr(r,'X tweets');}
    else if(!r.ok)throw new Error(`X tweets ${r.status}`);
    else{const j=await r.json();if(j?.meta?.newest_id)st.sinceId=j.meta.newest_id;
      const media=Object.fromEntries((j?.includes?.media||[]).map(m=>[m.media_key,m]));
      const seen=[];let aiUsed=0;
      // Las más viejas primero, así el día más reciente queda último.
      for(const tw of [...(j?.data||[])].reverse()){
        const imgs=(tw.attachments?.media_keys||[]).map(k=>media[k]).filter(m=>m&&m.type==='photo');
        const alt=imgs.map(m=>m.alt_text||'').join(' ');
        const dataPost=/#?data\s?bcra|principales variables/i.test(tw.text+' '+alt);
        let p=parseBcraPost(tw.text)||(alt?parseBcraCard(alt)||parseBcraPost(alt):null),via=p?(parseBcraPost(tw.text)?'texto':'alt'):null;
        // v149 · #DataBCRA "Principales variables": el dato viene sólo en la imagen → se lee con Workers AI (binding AI).
        const postDay=new Date(Date.parse(tw.created_at)-3*3600e3).toISOString().slice(0,10);
        if(!p&&dataPost&&imgs[0]?.url&&env?.AI&&aiUsed<3&&!days[postDay]){aiUsed++;try{p=await readBcraCard(env,imgs[0].url,tw.created_at);via=p?'imagen':null;}catch(e){st.aiError=String(e?.message||e).slice(0,200);}}
        seen.push({id:tw.id,at:tw.created_at,text:String(tw.text||'').replace(/\s+/g,' ').slice(0,160),alt:alt.slice(0,160)||null,images:imgs.length,dataPost,parsed:p,via});
        if(!p)continue;
        const day=p.date||postDay;days[day]={value:p.value,reserves:p.reserves,id:tw.id,via};
      }
      if(seen.length)st.recent=[...seen.reverse(),...(st.recent||[])].slice(0,12);
      st.lastRead=seen.length;
      st.lastError=null;}
  }catch(e){st.lastError=String(e?.message||e);}
  // Se guardan sólo los últimos 40 días.
  st.days=Object.fromEntries(Object.entries(days).sort(([a],[b])=>a.localeCompare(b)).slice(-40));
  try{await KV.put('x:bcra',JSON.stringify(st));}catch{}
  return st.days;
}
async function bcraFx(prev=null,env=null){
  if(BCRA_FX.value&&Date.now()-BCRA_FX.at<10*60*1000)return BCRA_FX.value;
  const d=new Date(),to=d.toISOString().slice(0,10);d.setUTCDate(d.getUTCDate()-70);const from=d.toISOString().slice(0,10);
  const get=async id=>{const j=await fetchJson(`https://api.bcra.gob.ar/estadisticas/v4.0/monetarias/${id}?desde=${from}&hasta=${to}`,8000);return (j?.results?.[0]?.detalle||[]).filter(x=>x&&x.fecha&&Number.isFinite(Number(x.valor))).map(x=>({date:String(x.fecha).slice(0,10),value:Number(x.valor)})).sort((a,b)=>a.date.localeCompare(b.date));};
  const [fx,res,press,xdays]=await Promise.allSettled([get(78),get(1),bcraPress(),bcraX(env)]);
  const off=fx.status==='fulfilled'?fx.value:[];const lastOff=off.at(-1)?.date||'';
  // Días preliminares: los guardados antes (KV) más los nuevos titulares, sólo posteriores al último dato oficial.
  const pdays={...(prev?.pressDays||{}),...(press.status==='fulfilled'?press.value:{})};
  // La publicación del BCRA en X tiene prioridad sobre los titulares de prensa.
  const xd=xdays.status==='fulfilled'?xdays.value:{};for(const [k,o] of Object.entries(xd))pdays[k]={value:o.value,sources:'x',reserves:o.reserves};
  const prelim=Object.entries(pdays).filter(([k])=>k>lastOff).map(([date,o])=>({date,value:Number(o.value),prelim:true,sources:o.sources,reserves:o.reserves??null,fromX:o.sources==='x'})).sort((a,b)=>a.date.localeCompare(b.date));
  const rows=[...off,...prelim];if(!rows.length)return null;
  const last=rows.at(-1),month=last.date.slice(0,7),mtd=rows.filter(r=>r.date.slice(0,7)===month).reduce((a,r)=>a+r.value,0);
  let R=res.status==='fulfilled'?res.value.at(-1):null;const lastX=prelim.filter(p=>p.fromX&&p.reserves).at(-1);if(lastX&&(!R||lastX.date>R.date))R={date:lastX.date,value:lastX.reserves};
  const keep=Object.fromEntries(prelim.map(r=>[r.date,{value:r.value,sources:r.sources,...(r.reserves?{reserves:r.reserves}:{})}]));
  // ¿Falta alguna rueda entre el último dato oficial y el último preliminar? Entonces el acumulado del mes es parcial.
  let mtdPartial=false;if(prelim.length&&lastOff){const have=new Set(rows.map(r=>r.date));let k=lastOff;const x=new Date(k+'T12:00:00Z');while(true){x.setUTCDate(x.getUTCDate()+1);k=x.toISOString().slice(0,10);if(k>last.date)break;if([0,6].includes(x.getUTCDay()))continue;if(k.slice(0,7)===month&&!have.has(k)){mtdPartial=true;break;}}}
  const value={date:last.date,value:Math.round(last.value*10)/10,preliminary:!!last.prelim,monthToDate:Math.round(mtd*10)/10,mtdPartial,month,officialThrough:lastOff||null,pressDays:keep,reserves:R?.value??null,reservesDate:R?.date??null,history:rows.slice(-45),source:last.prelim?(last.fromX?'BCRA en X (preliminar)':'BCRA (informado a la prensa; preliminar)'):'BCRA',viaX:!!last.fromX,updatedAt:new Date().toISOString()};
  BCRA_FX={at:Date.now(),value};return value;
}
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
  const [a,b,c,d,e]=await Promise.allSettled([merval(),mep(),risk(),bna(),bcraFx(prev?.latest?.bcra,env)]);
  const val=x=>x.status==='fulfilled'?x.value:null,P=prev?.latest||{};
  const latest={merval:newer(val(a),P.merval),dollar:newer(val(b),P.dollar),risk:newer(val(c),P.risk),bna:newer(val(d),P.bna),bcra:newer(val(e),P.bcra)};
  const body=JSON.stringify({version:133,generatedAt:new Date().toISOString(),mode:'live',refreshSeconds:30,latest});
  MEMO={at:Date.now(),body};
  try{const put=caches?.default?.put(cacheKey,new Response(body,{headers:{'content-type':'application/json','cache-control':'public, max-age=20'}}));if(put&&ctx?.waitUntil)ctx.waitUntil(put);}catch{}
  try{if(env?.MACRO_STORE?.put&&Object.values(latest).some(Boolean)){const w=env.MACRO_STORE.put(KV_KEY,body,{metadata:{savedAt:Date.now()}});if(ctx?.waitUntil)ctx.waitUntil(w);else await w;}}catch{}
  return json(body,'miss');
};

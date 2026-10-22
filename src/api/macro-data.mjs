import { cardPublication } from '../../public/releases.js';
import * as XLSX from 'xlsx';
import { BUNDLED_SOURCES } from './bundled-history.mjs';
import { TRADE_ANNUAL, INDUSTRY_BRIDGE, INDUSTRY_ANNUAL } from './trade-annual.mjs';
import { FISCAL_BASE } from './fiscal-base.mjs';
import { fiscalFromNews } from './fiscal-news.mjs';
import { indecEmae, indecIpi, indecIsac, indecIca, indecPib, indecEph, bcraDaily, monthlyAvg, annualAvg, indecAvgPrices } from './indec-official.mjs';
import { autosLive, ipcCabaLive, povertyLive, cementLive, cameLive, scentiaLive } from './live-sources.mjs';
import { readOverrides, applyOverrides } from './overrides.mjs';
import { cardStatus, CARDS, periodEndYm, todayAR, ymShift } from './freshness.mjs';
import { EVENTS } from './calendar-data.mjs';
import { ipcMonthlyChain, ipcAnnualAvg, ipcAnnualAvgInflation } from './ipc-chain.mjs';
import { indecXText, parseIndecIca } from './indec-x.mjs';
/* Macrodatos (antes Macro Argentina) v8 — stable server-side data contract.
   Each adapter fails independently. The browser keeps its bundled last-known value
   when a source is temporarily unavailable or changes format. */
const SERIES_API='https://apis.datos.gob.ar/series/api/series/';
const IPC_ID='148.3_INIVELNAL_DICI_M_26';
const URLS={
  arca:'https://servicioscf.arca.gob.ar/publico/sitio/contenido/novedad/ver.aspx?id=5938',
  icg:'https://www.utdt.edu/ver_contenido.php?id_contenido=1439&id_item_menu=2964',
  rem:'https://www.bcra.gob.ar/relevamiento-expectativas-mercado-rem/',
  bcra:'https://www.bcra.gob.ar/principales-variables/',
  calendar:'https://www.bcra.gob.ar/calendario-de-informes/'
};
const GET_CACHE=new Map();
const GET_TTL_MS=10*60*1000; // v113: evita que un isolate sirva datos viejos indefinidamente
async function get(url,type='text'){
  const key=`${type}:${url}`;
  const hit=GET_CACHE.get(key);
  if(hit&&Date.now()-hit.at<GET_TTL_MS)return hit.promise;
  const promise=(async()=>{
    const c=new AbortController(); const t=setTimeout(()=>c.abort(),25000);
    // v118: algunos sitios oficiales (BCRA) rechazan agentes no-navegador; se usa uno estándar.
    const ua=/bcra\.gob\.ar|argentina\.gob\.ar|indec\.gob\.ar|arca\.gob\.ar|afip\.gob\.ar/.test(url)?'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36':'Macrodatos/1.0 (+https://macrodatos.ar)';
    try{const r=await fetch(url,{signal:c.signal,headers:{'user-agent':ua,'accept-language':'es-AR,es;q=.9'}});if(!r.ok)throw new Error(`${r.status} ${r.statusText}`);return type==='json'?r.json():type==='buf'?r.arrayBuffer():r.text();}
    finally{clearTimeout(t)}
  })();
  GET_CACHE.set(key,{promise,at:Date.now()});
  try{return await promise}catch(e){GET_CACHE.delete(key);throw e}
}
const round=(n,d=1)=>n==null?null:Number(n.toFixed(d));
const pct=(a,b)=>b?(a/b-1)*100:null;
async function seriesRows(id,{start='1900-01-01',end=`${new Date().getUTCFullYear()+1}-12-31`}={}){
  // v128: la API devuelve como máximo 1.000 filas. Con sort=desc se reciben SIEMPRE las más recientes
  // (antes, una serie diaria o muy larga devolvía las primeras 1.000 y nunca llegaba al último dato).
  const url=`${SERIES_API}?ids=${encodeURIComponent(id)}&start_date=${start}&end_date=${end}&limit=1000&sort=desc&format=json`;
  const j=await get(url,'json'); const rows=(j?.data||[]).slice().sort((a,b)=>String(a[0]).localeCompare(String(b[0])));
  if(!Array.isArray(rows)||!rows.length)throw new Error(`sin datos para ${id}`);
  // v179: Datos Argentina devuelve null en observaciones faltantes; Number(null) es 0 y se colaba como dato.
  return {rows:rows.filter(r=>r[1]!==null&&r[1]!==undefined&&r[1]!=='').map(r=>({date:String(r[0]),value:Number(r[1])})).filter(r=>Number.isFinite(r.value)),url};
}
function annualFromRows(rows,mode='last'){
  const by={}; for(const r of rows){const m=r.date.match(/(19|20)\d{2}/);if(!m)continue;(by[+m[0]]??=[]).push(r.value)}
  const out={}; for(const [y,a] of Object.entries(by))out[y]=round(mode==='avg'?a.reduce((x,z)=>x+z,0)/a.length:mode==='sum'?a.reduce((x,z)=>x+z,0):a.at(-1),1); return out;
}
// v179: variación anual del promedio de los niveles mensuales; el año en curso (incompleto) se compara con los
// mismos meses del año anterior (antes se comparaba, p. ej., ene–ago 2026 contra el promedio de todo 2025).
function growthFromMonthlyYtd(rows){const lv={};for(const r of rows){const k=String(r.date).slice(0,7);if(/^\d{4}-\d{2}$/.test(k)&&Number.isFinite(r.value))lv[k]=r.value;}
  const by={};for(const k of Object.keys(lv))(by[k.slice(0,4)]??=[]).push(k.slice(5));const out={};
  for(const y of Object.keys(by).sort()){const p=String(+y-1);if(!by[p])continue;const ms=by[y].filter(m=>lv[`${p}-${m}`]!=null);if(!ms.length)continue;if(by[y].length===12&&by[p].length<12)continue;
    const a=ms.reduce((s,m)=>s+lv[`${y}-${m}`],0),b=ms.reduce((s,m)=>s+lv[`${p}-${m}`],0);out[y]=round(pct(a,b),1);}
  return out;}
// v197: completa con el respaldo (Datos Argentina) sólo las claves que la fuente oficial no trae.
function fillMissing(target,backup){for(const [k,v] of Object.entries(backup||{}))if(target[k]==null&&v!=null)target[k]=v;return target;}
function growthFromAnnualLevels(levels){const out={},ys=Object.keys(levels).map(Number).sort((a,b)=>a-b);for(const y of ys)if(levels[y-1]!=null)out[y]=round(pct(levels[y],levels[y-1]),1);return out;}
function yoyFromRows(rows){const levels={};for(const r of rows||[]){const k=String(r.date||'').slice(0,7);if(/^\d{4}-\d{2}$/.test(k)&&Number.isFinite(Number(r.value)))levels[k]=Number(r.value);}const out={};for(const [k,v] of Object.entries(levels)){const [y,m]=k.split('-');const prev=`${Number(y)-1}-${m}`;if(Number.isFinite(levels[prev]))out[k]=round(pct(v,levels[prev]),1);}return out;}
// v113: algunas series de Datos Argentina (EMAE, ISAC) llegan como fracción (0,064 = 6,4%).
// v137: antes exigía que TODOS los valores fueran ≤1,5 en módulo; con los rebotes de 2021 (ISAC +144% = 1,44… o más)
// la serie quedaba sin convertir y la tarjeta mostraba 0,0%. Ahora decide por el percentil 80 de los valores absolutos.
function fractionMapToPct(map){const vals=Object.values(map||{}).map(Number).filter(Number.isFinite);const abs=vals.map(Math.abs).sort((a,b)=>a-b),p80=abs[Math.floor(abs.length*0.8)]??0;if(vals.length>=12&&p80<=1.5){const out={};for(const [k,v] of Object.entries(map))out[k]=round(Number(v)*100,1);return out;}return map;}
const MONTHS_ES=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const periodEs=ym=>`${MONTHS_ES[Number(ym.slice(5,7))-1]} ${ym.slice(0,4)}`;
const strip=s=>s.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(+n)).replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCharCode(parseInt(n,16))).replace(/&([aeiouAEIOU])(acute|uml);/g,'$1').replace(/&([nN])tilde;/g,(_,c)=>c==='n'?'ñ':'Ñ').replace(/&amp;/gi,'&').replace(/&[a-z]+;/gi,' ').replace(/\s+/g,' ').trim();

function parseCsv(text){
  const first=(text.split(/\r?\n/).find(Boolean)||''); const sep=(first.match(/;/g)||[]).length>(first.match(/,/g)||[]).length?';':',';
  const rows=[]; let row=[],cell='',q=false;
  for(let i=0;i<text.length;i++){const c=text[i],n=text[i+1];if(c==='"'){if(q&&n==='"'){cell+='"';i++;}else q=!q;}else if(c===sep&&!q){row.push(cell.trim());cell='';}else if((c==='\n'||c==='\r')&&!q){if(c==='\r'&&n==='\n')i++;row.push(cell.trim());if(row.some(Boolean))rows.push(row);row=[];cell='';}else cell+=c;} if(cell||row.length){row.push(cell.trim());rows.push(row)} return rows;
}
const norm=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'_');
async function ipcHistorical(){
  const id='178.1_NL_GENERAL_0_0_13:end_of_period';
  const url=`${SERIES_API}?ids=${encodeURIComponent(id)}&collapse=year&start_date=1943-01-01&end_date=2006-12-31&limit=1000&format=json&metadata=none`;
  const j=await get(url,'json'); const levels={};
  for(const r of (j?.data||[])){const m=String(r[0]).match(/(19|20)\d{2}/),v=r[1]==null?NaN:Number(r[1]);if(m&&Number.isFinite(v))levels[+m[0]]=v;}
  const annual=growthFromAnnualLevels(levels);
  if(Object.keys(annual).length<40)throw new Error(`IPC histórico incompleto: ${Object.keys(annual).length} años`);
  return {status:'ok',source:'Datos Argentina / INDEC — IPC GBA histórico',sourceUrl:url,annual};
}

async function catalogPackage(query){
  const api='https://datos.gob.ar/api/3/action/package_search?q='+encodeURIComponent(query);
  const j=await get(api,'json'); return (j?.result?.results||[])[0]||null;
}
function numberAR(v){
  const t=String(v??'').trim(); if(!t)return NaN;
  // CSVs from Datos Argentina normally use dot decimals; comma decimal is accepted too.
  const clean=t.replace(/\s/g,''); if(/^-?\d{1,3}(?:\.\d{3})+,\d+$/.test(clean))return Number(clean.replace(/\./g,'').replace(',','.')); if(clean.includes(',')&&!clean.includes('.'))return Number(clean.replace(',','.')); return Number(clean);
}
function annualGrowthFromCsv(text,minYear,maxYear){
  const rows=parseCsv(text); if(rows.length<5)return {};
  const h=rows[0].map(norm);
  const dc=h.findIndex(x=>/indice_tiempo|fecha|periodo|time/.test(x));
  const yc=h.findIndex(x=>/^anio$|^ano$|year/.test(x));
  let vc=h.findIndex(x=>/^(pib|producto_interno_bruto|producto_bruto_interno|total|pbi_precios_mercado|pbi_costo_factores|pib_costo_factores|pib_cf_trim|producto_interno_bruto_precios_mercado)$/.test(x));
  if(vc<0)vc=h.findIndex(x=>/(producto.*interno.*bruto|pib.*mercado|pbi.*mercado|pib.*factores|pbi.*factores|pib_cf|pbi_cf)/.test(x)&&!/(variacion|porcentaje|sector|precio.*corriente)/.test(x));
  if(vc<0)return {};
  const vals={};
  for(const r of rows.slice(1)){
    let y=NaN;if(dc>=0){const m=String(r[dc]).match(/(19|20)\d{2}/);if(m)y=+m[0]}else if(yc>=0)y=+r[yc];
    const v=numberAR(r[vc]); if(!Number.isFinite(y)||!Number.isFinite(v)||y<minYear||y>maxYear)continue;
    (vals[y]??=[]).push(v);
  }
  const levels={}; for(const [y,a] of Object.entries(vals))levels[y]=a.reduce((x,z)=>x+z,0); // quarterly sum; annual rows remain one value
  const out={},ys=Object.keys(levels).map(Number).sort((a,b)=>a-b);
  for(const y of ys){if(levels[y-1]!=null)out[y]=round(pct(levels[y],levels[y-1]),1)}
  return out;
}
async function gdpHistorical(){
  const annual={},segments=[];
  try{
    const {rows,url}=await seriesRows('250.1_PPRECIOADO_0_0_19',{start:'1935-01-01',end:'1964-12-31'});
    Object.assign(annual,growthFromAnnualLevels(annualFromRows(rows)));
    segments.push({query:'PIB a precios de mercado, base 1950',range:'1936–1964',sourceUrl:url});
  }catch{}
  const specs=[
    ['Cuentas Nacionales 1935-1962',1935,1964],
    ['Producto Interno Bruto 1950-1964',1950,1964],
    ['Cuentas Nacionales 1970-1980 Base 1960',1970,1980],
    ['Cuentas Nacionales 1980-1996',1980,1996],
    ['Producto Interno Bruto a precios de mercado Valor Agregado Bruto Base 1993',1993,2006]
  ];
  for(const [q,a,b] of specs){
    try{
      const pack=await catalogPackage(q); if(!pack)continue;
      const resources=(pack.resources||[]).filter(r=>String(r.format).toLowerCase()==='csv');
      let best={}; let url='';
      for(const r of resources.slice(0,3)){
        try{const x=annualGrowthFromCsv(await get(r.url),a,b);if(Object.keys(x).length>Object.keys(best).length){best=x;url=r.url}}catch{}
      }
      if(Object.keys(best).length){Object.assign(annual,best);segments.push({query:q,range:`${Math.min(...Object.keys(best).map(Number))}–${Math.max(...Object.keys(best).map(Number))}`,sourceUrl:url})}
    }catch{}
  }
  // v197: INDEC (sh_oferta_demanda, cuadro 1, precios de 2004) es la fuente primaria desde 2005; los CSV del
  // catálogo de Datos Argentina quedan para los años anteriores y como respaldo.
  const quarterlyYoy={};let official=null;
  try{official=await indecPib(1);const g=growthFromAnnualLevels(official.annual);for(const [y,v] of Object.entries(g))annual[y]=v;
    const Q=official.quarters;for(const k of Object.keys(Q)){const [y,q]=k.split('-Q');const pv=Q[`${+y-1}-Q${q}`];if(pv)quarterlyYoy[`${y}-T${q}`]=round(pct(Q[k],pv),1);}
    segments.push({query:'INDEC — Oferta y demanda globales, cuadro 1 (precios de 2004)',range:`2005–${Object.keys(Q).sort().at(-1).replace('-Q','-T')}`,sourceUrl:official.url});
  }catch(e){console.warn('PIB INDEC',e);}
  if(Object.keys(annual).length<10)throw new Error('series históricas de PIB no disponibles');
  if(!Object.keys(quarterlyYoy).length)try{
    const x=await seriesRows('6.2_PIBPM_2004_T_38',{start:'2020-01-01'});
    const qrows=x.rows.filter(r=>r?.date&&Number.isFinite(Number(r.value))).map(r=>[String(r.date).slice(0,10),Number(r.value)]).sort((a,b)=>a[0].localeCompare(b[0]));
    for(let i=4;i<qrows.length;i++){
      const [d,v]=qrows[i],[pd,pv]=qrows[i-4]; if(!pv)continue;
      const m=Number(d.slice(5,7)),qtr=Math.floor((m-1)/3)+1;
      quarterlyYoy[`${d.slice(0,4)}-T${qtr}`]??=round(pct(v,pv),1);
    }
    if(Object.keys(quarterlyYoy).length)segments.push({query:'PIB trimestral a precios constantes, base 2004',range:'2020–presente',sourceUrl:x.url});
  }catch{}
  fillMissing(quarterlyYoy,{'2025-T3':3.3,'2025-T4':2.1,'2026-T1':2.3,'2026-T2':2.0});
  return {status:'ok',source:official?'INDEC — Cuentas nacionales (oferta y demanda globales); años previos: series históricas INDEC vía Datos Argentina':'INDEC / Datos Argentina — Cuentas Nacionales históricas (respaldo)',...(official?{sourceUrl:official.url}:{}),annual,quarterlyYoy,segments};
}

async function packageById(id){const j=await get(`https://datos.gob.ar/api/3/action/package_show?id=${id}`,'json');return j?.result;}
async function bestCsv(id, scoreFn){
  const p=await packageById(id); if(!p)throw new Error(`dataset ${id} no encontrado`);
  const rs=(p.resources||[]).filter(r=>String(r.format).toLowerCase()==='csv').sort((a,b)=>(scoreFn?.(b)||0)-(scoreFn?.(a)||0));
  for(const r of rs){try{return {text:await get(r.url),url:r.url,title:r.name||r.description||p.title}}catch{}}
  throw new Error(`sin CSV accesible en ${id}`);
}
function annualColumn(text, valueMatchers, reducer='last'){
  const rows=parseCsv(text); if(rows.length<3)return {};
  const h=rows[0].map(norm), dc=h.findIndex(x=>/indice_tiempo|fecha|periodo|time/.test(x));
  let vc=-1; for(const re of valueMatchers){vc=h.findIndex(x=>re.test(x));if(vc>=0)break;} if(dc<0||vc<0)return {};
  const vals={}; for(const r of rows.slice(1)){const m=String(r[dc]).match(/(19|20)\d{2}/);const v=numberAR(r[vc]);if(!m||!Number.isFinite(v))continue;(vals[+m[0]]??=[]).push(v);}
  const out={}; for(const [y,a] of Object.entries(vals)){out[y]=round(reducer==='avg'?a.reduce((x,z)=>x+z,0)/a.length:reducer==='sum'?a.reduce((x,z)=>x+z,0):a.at(-1),1);} return out;
}
// v115: variación mensual (%) de una serie desestacionalizada en niveles.
async function saMomFromLevels(id,start='2020-06-01'){const x=await seriesRows(id,{start});const lv={};for(const r of x.rows){const k=String(r.date).slice(0,7);if(/^\d{4}-\d{2}$/.test(k)&&Number.isFinite(r.value))lv[k]=r.value;}const ks=Object.keys(lv).sort(),out={};for(let i=1;i<ks.length;i++)if(ymShift(ks[i-1],1)===ks[i])out[ks[i]]=round((lv[ks[i]]/lv[ks[i-1]]-1)*100,1)+0;/* v170: sólo meses consecutivos */if(Object.keys(out).length<12)throw new Error(`serie s.e. corta: ${id}`);return out;}
// v142 · INDEC publica el informe técnico a las 16 h, pero Datos Argentina recién incorpora el mes días después.
// La portada de INDEC (indec.gob.ar/indec/Portada) trae el resumen de cada informe del día ("En agosto de 2026, el
// índice ... cayó 3,2% respecto a igual mes de 2025 ... la serie desestacionalizada subió 1,9% ..."). Se usa para
// incorporar el mes nuevo ni bien sale; cuando Datos Argentina lo publica, su serie lo reemplaza.
let INDEC_NEWS={at:0,text:''};
let INDEC_X_TEXT=''; // v205: publicaciones de @INDECArgentina en X (se cargan antes de correr los jobs)
async function indecNewsText(){try{const t=await indecPortadaText();return INDEC_X_TEXT?`${INDEC_X_TEXT} . ${t}`:t;}catch(e){if(INDEC_X_TEXT)return INDEC_X_TEXT;throw e;}}
async function indecPortadaText(){
  if(INDEC_NEWS.text&&Date.now()-INDEC_NEWS.at<10*60*1000)return INDEC_NEWS.text;
  const c=new AbortController(),tm=setTimeout(()=>c.abort(),15000);
  try{const r=await fetch('https://www.indec.gob.ar/indec/Portada',{signal:c.signal,headers:{'user-agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36','accept-language':'es-AR,es;q=.9'},cf:{cacheTtl:600,cacheEverything:true}});if(!r.ok)throw new Error(`INDEC portada ${r.status}`);
    const html=await r.text();const i=html.search(/Noticias/i);const part=i>=0?html.slice(i,i+400000):html.slice(0,400000);
    INDEC_NEWS={at:Date.now(),text:part.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(+n)).replace(/&nbsp;/g,' ').replace(/\s+/g,' ')};return INDEC_NEWS.text;}
  finally{clearTimeout(tm);}
}
const MESES_NEWS={enero:1,febrero:2,marzo:3,abril:4,mayo:5,junio:6,julio:7,agosto:8,septiembre:9,setiembre:9,octubre:10,noviembre:11,diciembre:12};
const NEWS_DOWN=/(cay|ca[ií]d|baj|disminu|descen|retroce|contraj|contracci|negativ|redujo|merma)/i;
export function parseIndecNews(text,subject){
  // subject: regex del nombre del indicador tal como aparece en la noticia.
  const re=new RegExp(`En (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre) de (20\\d{2}),? (?:el|la) ${subject}([^.%]{0,60}?)\\s([\\d.,]+)%\\s+respecto a igual mes`,'i');
  const m=String(text||'').match(re);if(!m)return null;
  const ym=`${m[2]}-${String(MESES_NEWS[m[1].toLowerCase()]).padStart(2,'0')}`,yoy=Number(m[4].replace(',','.'))*(NEWS_DOWN.test(m[3])?-1:1);
  const rest=String(text).slice(m.index,m.index+700);
  const sa=rest.match(/serie desestacionalizada (?:muestra una variaci[oó]n (positiva|negativa) de|([^.%\d]{1,40}?))\s+([\d.,]+)%/i);
  let mom=null;if(sa){const v=Number(sa[3].replace(',','.'));mom=sa[1]?(sa[1].toLowerCase()==='negativa'?-v:v):(NEWS_DOWN.test(sa[2])?-v:v);}
  return Number.isFinite(yoy)?{ym,yoy:Math.round(yoy*10)/10,mom:Number.isFinite(mom)?Math.round(mom*10)/10:null}:null;
}
// Fecha oficial de publicación (calendario INDEC) del último mes de la serie.
const MES_LBL=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
function withCalendarDate(out,calRe){const last=Object.keys(out.monthlyYoy||{}).sort().at(-1);if(!last)return out;const lbl=`${MES_LBL[+last.slice(5)-1]} ${last.slice(0,4)}`;const ev=EVENTS.find(e=>calRe.test(e.title)&&String(e.period).toLowerCase()===lbl);out.latest={...(out.latest||{}),ym:last,yoy:out.monthlyYoy[last],mom:out.monthlySaMom?.[last]??null,...(ev?{published:ev.date}:{})};return out;}
async function addIndecNews(out,subject){
  try{const n=parseIndecNews(await indecNewsText(),subject);if(!n)return out;
    const last=Object.keys(out.monthlyYoy||{}).sort().at(-1);
    if(!last||n.ym>last){out.monthlyYoy={...(out.monthlyYoy||{}),[n.ym]:n.yoy};if(n.mom!==null)out.monthlySaMom={...(out.monthlySaMom||{}),[n.ym]:n.mom};out.indecNews={ym:n.ym,source:'INDEC — informe técnico (portada indec.gob.ar)'};}
  }catch{}
  return out;
}
async function industryHistorical(){
  const annual={}; const segments=[];
  try{const x=await seriesRows('12.1_E_2004_A_3',{start:'1994-01-01',end:'2015-12-31'});Object.assign(annual,growthFromAnnualLevels(annualFromRows(x.rows,'avg')));segments.push({range:'EMI hasta 2015',sourceUrl:x.url});}catch{}
  // v197: IPI manufacturero desde el cuadro de INDEC (primario); Datos Argentina sólo completa meses faltantes.
  let monthlyYoy={},off=null;try{off=await indecIpi();const rows=Object.entries(off.level).map(([k,v])=>({date:k,value:v}));Object.assign(annual,growthFromMonthlyYtd(rows));monthlyYoy={...off.monthlyYoy};segments.push({range:'IPI desde 2016 (INDEC)',sourceUrl:off.url});}catch(e){console.warn('IPI INDEC',e);}
  try{const x=await seriesRows('453.1_SERIE_ORIGNAL_0_0_14_46',{start:'2016-01-01'});fillMissing(annual,growthFromMonthlyYtd(x.rows));fillMissing(monthlyYoy,yoyFromRows(x.rows));if(!off)segments.push({range:'IPI desde 2016 (Datos Argentina, respaldo)',sourceUrl:x.url});}catch{}
  if(!Object.keys(annual).length&&!Object.keys(monthlyYoy).length)throw new Error('series industriales no disponibles');
  for(const [y,v] of Object.entries(INDUSTRY_ANNUAL))if(annual[y]==null)annual[y]=v;
  // v179: puente 2015–2016 (EMI termina en 2014; la primera variación del IPI es 2017) con el EMAE industria.
  try{const x=await seriesRows('11.1_VMASD_2004_A_23',{start:'2013-01-01',end:'2016-12-31'});const g=growthFromAnnualLevels(annualFromRows(x.rows,'avg'));for(const y of [2015,2016])if(annual[y]==null&&Number.isFinite(g[y]))annual[y]=g[y];}catch{}
  for(const [y,v] of Object.entries(INDUSTRY_BRIDGE))if(annual[y]==null)annual[y]=v;
  if(annual[2015]!=null)segments.push({range:'2015–2016: EMAE industria manufacturera (empalme)'});
  let monthlySaMom=off&&Object.keys(off.monthlySaMom).length?{...off.monthlySaMom}:undefined;try{const b=await saMomFromLevels('453.1_SERIE_DESEADA_0_0_24_58');monthlySaMom=fillMissing(monthlySaMom||{},b);}catch{}
  return await addIndecNews({status:'ok',source:off?'INDEC — IPI manufacturero (cuadros oficiales); EMI histórico':'INDEC / Datos Argentina — EMI + IPI manufacturero (respaldo)',...(off?{sourceUrl:off.url}:{}),annual,monthlyYoy,...(monthlySaMom?{monthlySaMom}:{}),segments},'[ií]ndice de producci[oó]n industrial manufacturero(?: \\(IPI manufacturero\\))?').then(o=>withCalendarDate(o,/manufacturero \(IPI\)/i));
}
async function unemploymentHistorical(){
  // v197: EPH (cuadros de INDEC, promedio de los 4 trimestres) es la fuente primaria desde 2017; Datos Argentina
  // completa los años anteriores (desde 2003) y hace de respaldo.
  const annual={};let off=null,url=null;
  try{off=await indecEph();Object.assign(annual,off.annual);url=off.url;}catch(e){console.warn('EPH INDEC',e);}
  try{const x=await seriesRows('45.1_ECTDT_0_A_33',{start:'2003-01-01'});
    // Normalizar ANTES de redondear: 0.074 -> 7.4, no 0.1 -> 10.0.
    const normalized=x.rows.map(r=>({...r,value:Math.abs(r.value)<=1?r.value*100:r.value}));
    fillMissing(annual,annualFromRows(normalized));url??=x.url;}catch(e){if(!off)throw e;}
  if(Object.keys(annual).length<(off?5:15))throw new Error('serie anual EPH incompleta');
  return {status:'ok',source:off?'INDEC — EPH continua (cuadros oficiales), promedio anual de las tasas trimestrales':'INDEC / Datos Argentina — EPH continua (respaldo)',sourceUrl:url,annual,...(off?{quarterly:off.quarterly}:{})};
}
function usCpiAnnual(){
  // BLS CPI-U, U.S. city average, all items, annual averages (1982-84=100).
  // Bundled snapshot avoids API rate/range failures in serverless execution.
  return {1913:9.9,1914:10.0,1915:10.1,1916:10.9,1917:12.8,1918:15.1,1919:17.3,1920:20.0,1921:17.9,1922:16.8,1923:17.1,1924:17.1,1925:17.5,1926:17.7,1927:17.4,1928:17.1,1929:17.1,1930:16.7,1931:15.2,1932:13.7,1933:13.0,1934:13.4,1935:13.7,1936:13.9,1937:14.4,1938:14.1,1939:13.9,1940:14.0,1941:14.7,1942:16.3,1943:17.3,1944:17.6,1945:18.0,1946:19.5,1947:22.3,1948:24.1,1949:23.8,1950:24.1,1951:26.0,1952:26.5,1953:26.7,1954:26.9,1955:26.8,1956:27.2,1957:28.1,1958:28.9,1959:29.1,1960:29.6,1961:29.9,1962:30.2,1963:30.6,1964:31.0,1965:31.5,1966:32.4,1967:33.4,1968:34.8,1969:36.7,1970:38.8,1971:40.5,1972:41.8,1973:44.4,1974:49.3,1975:53.8,1976:56.9,1977:60.6,1978:65.2,1979:72.6,1980:82.4,1981:90.9,1982:96.5,1983:99.6,1984:103.9,1985:107.6,1986:109.6,1987:113.6,1988:118.3,1989:124.0,1990:130.7,1991:136.2,1992:140.3,1993:144.5,1994:148.2,1995:152.4,1996:156.9,1997:160.5,1998:163.0,1999:166.6,2000:172.2,2001:177.1,2002:179.9,2003:184.0,2004:188.9,2005:195.3,2006:201.6,2007:207.342,2008:215.303,2009:214.537,2010:218.056,2011:224.939,2012:229.594,2013:232.957,2014:236.736,2015:237.017,2016:240.007,2017:245.12,2018:251.107,2019:255.657,2020:258.811,2021:270.97,2022:292.655,2023:304.702,2024:313.689,2025:321.943};
}

// v201: memo de 10 min (lo usan el deflactor y el TCR en la misma corrida).
let US_CPI_MEMO=null;
async function usCpiMonthly(){if(US_CPI_MEMO&&Date.now()-US_CPI_MEMO.at<600000)return US_CPI_MEMO.p;const p=usCpiMonthlyRaw();US_CPI_MEMO={at:Date.now(),p};p.catch(()=>{US_CPI_MEMO=null;});return p;}
async function usCpiMonthlyRaw(){
  // BLS CPI-U All items, U.S. city average, not seasonally adjusted (CUUR0000SA0).
  // Public API supports a 20-year window without a key; 2007-current covers the modern FX series.
  const end=new Date().getFullYear(), start=Math.max(2024,end-2);
  const c=new AbortController(); const t=setTimeout(()=>c.abort(),9000);
  try{
    let rows=[];const monthly={};
    // v117: si BLS no responde se usa el respaldo (antes se perdía el TCR completo).
    try{const r=await fetch('https://api.bls.gov/publicAPI/v2/timeseries/data/',{method:'POST',signal:c.signal,headers:{'content-type':'application/json','user-agent':'Macrodatos/1.0 (+https://macrodatos.ar)'},body:JSON.stringify({seriesid:['CUUR0000SA0'],startyear:String(start),endyear:String(end)})});
    if(!r.ok)throw new Error(`BLS ${r.status}`); const j=await r.json();rows=j?.Results?.series?.[0]?.data||[];}catch(e){console.warn('BLS',e);}
    for(const x of rows){if(!/^M(0[1-9]|1[0-2])$/.test(x.period))continue;const v=Number(x.value);if(Number.isFinite(v))monthly[`${x.year}-${x.period.slice(1)}`]=v;}
    // Snapshot de respaldo para que la base nunca retroceda si la API BLS limita el rango o falla parcialmente.
    const fallback={'2025-08':323.976,'2026-07':333.918,'2026-08':334.980};
    for(const [k,v] of Object.entries(fallback)) if(monthly[k]==null) monthly[k]=v;
    if(!Object.keys(monthly).length)throw new Error('BLS sin observaciones mensuales');
    return {monthly,source:'BLS CPI-U All items, U.S. city average, not seasonally adjusted',seriesId:'CUUR0000SA0'};
  }finally{clearTimeout(t)}
}
function latestCommonMonth(a,b){const common=Object.keys(a||{}).filter(k=>b?.[k]!=null).sort();return common.at(-1)||null;}
async function tradeHistorical(){
  // v179: la base es la tabla anual completa (trade-annual.mjs); la API sólo agrega o corrige años con dato real.
  const [ex,im,bal]=await Promise.allSettled([
    seriesRows('74.1_IET_0_A_16',{start:'1900-01-01'}),
    seriesRows('74.1_IIT_0_A_25',{start:'1900-01-01'}),
    seriesRows('74.1_SC_0_A_15',{start:'1900-01-01'})
  ]);
  const live=x=>x.status==='fulfilled'?annualFromRows(x.value.rows):{};
  const exports={...TRADE_ANNUAL.exports,...live(ex)}, imports={...TRADE_ANNUAL.imports}, balance={...TRADE_ANNUAL.balance};
  const est=new Set(TRADE_ANNUAL.estimated);
  for(const [y,v] of Object.entries(live(im))){imports[y]=v;est.delete(y);}
  for(const [y,v] of Object.entries(live(bal)))balance[y]=v;
  // v197: ICA de INDEC (cuadro c1) primario para el último año completo y los meses recientes.
  let ica=null;try{ica=await indecIca();for(const [y,v] of Object.entries(ica.annual.exports)){exports[y]=v;imports[y]=ica.annual.imports[y];balance[y]=ica.annual.balance[y];est.delete(y);}}catch(e){console.warn('ICA INDEC',e);}
  for(const y of Object.keys(exports)){if(imports[y]==null&&balance[y]!=null)imports[y]=round(exports[y]-balance[y],1);if(balance[y]==null&&imports[y]!=null)balance[y]=round(exports[y]-imports[y],1);}
  let real=null;
  try{const cpi=usCpiAnnual(),bls=await usCpiMonthly(),basePeriod=Object.keys(bls.monthly).sort().at(-1),base=bls.monthly[basePeriod],rx={},ri={},rb={};for(const y of Object.keys(exports)){if(!cpi[y])continue;const f=base/cpi[y];rx[y]=round(exports[y]*f,1);if(imports[y]!=null)ri[y]=round(imports[y]*f,1);if(balance[y]!=null)rb[y]=round(balance[y]*f,1);}real={basePeriod,baseIndex:base,exports:rx,imports:ri,balance:rb};}catch{}
  // Serie mensual ICA. La API histórica puede quedar rezagada; completamos el tramo reciente
  // con las cifras mensuales publicadas por INDEC, sin interpolar observaciones.
  let monthlyBalance={...(ica?.monthlyBalance||{})};
  try{const m=await seriesRows('74.3_ISC_0_M_19',{start:'2021-01-01'});for(const r of m.rows){const k=String(r.date).slice(0,7);if(/^\d{4}-(0[1-9]|1[0-2])$/.test(k))monthlyBalance[k]??=round(r.value,1);}}catch{}
  const indecRecent={
    '2024-01':797,'2024-02':1432,'2024-03':2160,'2024-04':1807,'2024-05':2654,'2024-06':1880,'2024-07':1459,'2024-08':1875,'2024-09':982,'2024-10':912,'2024-11':1277,'2024-12':1682,
    '2025-01':162,'2025-02':275,'2025-03':623,'2025-04':214,'2025-05':607,'2025-06':879,'2025-07':907,'2025-08':1402,
    '2026-07':2115,'2026-08':2187
  };
  fillMissing(monthlyBalance,indecRecent);
  // v205: el mes recién publicado (X de INDEC o portada) si todavía no está en el cuadro.
  let icaNews=null;try{const n=parseIndecIca(await indecNewsText());const last=Object.keys(monthlyBalance).sort().at(-1);if(n&&(!last||n.ym>last)){monthlyBalance[n.ym]=n.balance;icaNews={ym:n.ym,exports:n.exports,imports:n.imports,source:'INDEC — informe técnico (X / portada)'};}}catch{}
  return {status:'ok',source:'INDEC — Intercambio Comercial Argentino (ICA, cuadros oficiales; Datos Argentina de respaldo); CPI-U BLS para USD constantes',sourceUrl:ica?.url||'https://www.indec.gob.ar/indec/web/Nivel4-Tema-3-2-40',balance,exports,imports,real,monthlyBalance,...(icaNews?{indecNews:icaNews}:{}),estimatedImports:[...est].sort()};
}

function annualLastGeneric(rows){
  const out={};
  for(const r of rows||[]){const d=String(r.fecha||r.date||r.fechaHora||'');const m=d.match(/(19|20)\d{2}/);const v=Number(r.valor??r.value??r.venta);if(m&&Number.isFinite(v))out[+m[0]]=round(v,2);}
  return out;
}
function annualAvgGeneric(rows){
  const by={}; for(const r of rows||[]){const d=String(r.fecha||r.date||'');const m=d.match(/(19|20)\d{2}/);const v=Number(r.valor??r.value);if(m&&Number.isFinite(v))(by[+m[0]]??=[]).push(v);}
  const out={};for(const [y,a] of Object.entries(by))out[y]=round(a.reduce((x,z)=>x+z,0)/a.length,2);return out;
}
function findObservations(x){
  if(Array.isArray(x)&&x.length&&x.some(r=>r&&typeof r==='object'&&('fecha'in r||'date'in r||'fechaHora'in r)&&('valor'in r||'value'in r||'venta'in r||'compra'in r)))return x;
  if(x&&typeof x==='object')for(const v of Object.values(x)){const a=findObservations(v);if(a?.length)return a;} return [];
}
// v201 · Inflación anual = variación del índice PROMEDIO del año, calculada con la cadena mensual única del sitio
// (ipc-chain.mjs: INDEC histórico ≤2006 → San Luis 2007–2016 → INDEC nacional 2017+). Ya no hay tabla aparte.
const IPC_CHAIN_BUNDLED=ipcMonthlyChain(BUNDLED_SOURCES.ipc?.monthly||[]);
const dashboardInflationAnnual=ipcAnnualAvgInflation(IPC_CHAIN_BUNDLED);
async function liveIpcChain(){try{return ipcMonthlyChain((await ipc()).monthly||[]);}catch{return IPC_CHAIN_BUNDLED;}}
function latestGeneric(rows){const a=(rows||[]).map(r=>({date:String(r.fecha||r.date||r.fechaHora||''),value:Number(r.valor??r.value??r.venta)})).filter(x=>x.date&&Number.isFinite(x.value)).sort((a,b)=>a.date.localeCompare(b.date));return a.at(-1)||null;}
function latestWithChange(rows){const a=(rows||[]).map(r=>({date:String(r.fecha||r.date||r.fechaHora||''),value:Number(r.valor??r.value??r.venta)})).filter(x=>x.date&&Number.isFinite(x.value)).sort((a,b)=>a.date.localeCompare(b.date));const cur=a.at(-1),prev=a.at(-2);return cur?{...cur,previous:prev?.value??null,changePct:prev&&prev.value?round((cur.value/prev.value-1)*100,2):null}:null;}
async function financialHistorical(){
  const result={status:'ok',source:'BYMA / Banco Nación / J.P. Morgan; proveedores secundarios identificados cuando corresponde',countryRisk:{},mervalUsdCcl:{},mervalPoints:{},freeDollar:{nominal:{},real:{},baseYear:2025},interestRate:{nominal:{},real:{}},latest:{},sources:{risk:'J.P. Morgan EMBI+ Argentina',riskProvider:'ArgentinaDatos (republicación)',merval:'BYMA / S&P Merval',mervalProvider:'Zion / Yahoo Finance (fallback sin credenciales BYMA)',dollar:'BYMA / Índice Dólar BYMA (MEP)',dollarProvider:'ArgentinaDatos (fallback sin credenciales BYMA)',bna:'Banco de la Nación Argentina'}};
  const errors=[];
  // v119: últimos 400 días diarios (el histórico diario completo viaja en public/markets-daily.json).
  const cutoff=new Date(Date.now()-400*864e5).toISOString().slice(0,10);
  const recentDaily=(rows,valKeys=['valor','value','venta'])=>{const o={};for(const r of rows||[]){const d=String(r.fecha||r.date||'').slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(d)||d<cutoff)continue;let v=NaN;for(const k of valKeys){const n=Number(r?.[k]);if(Number.isFinite(n)){v=n;break;}}if(Number.isFinite(v))o[d]=round(v,2);}return o;};
  result.daily={risk:{},mervalPoints:{},mervalUsd:{}};
  try{
    const j=await get('https://api.argentinadatos.com/v1/finanzas/indices/riesgo-pais','json');
    result.daily.risk=recentDaily(Array.isArray(j)?j:findObservations(j),['valor','value']);
    result.countryRisk=annualLastGeneric(j);
    result.latest.risk=latestWithChange(j);
    // Último cierre verificado: evita que una API rezagada deje la portada un día atrás.
    // Sólo actúa mientras la fuente primaria no tenga una fecha igual o posterior.
    try{
      const u=await get('https://api.argentinadatos.com/v1/finanzas/indices/riesgo-pais/ultimo','json');
      const uv=Number(u?.valor??u?.value), ud=String(u?.fecha??u?.date??'');
      if(Number.isFinite(uv)&&ud&&(!result.latest.risk||ud>String(result.latest.risk.date||''))){
        const prev=result.latest.risk?.value;
        result.latest.risk={date:ud,value:uv,previous:prev??null,changePct:prev&&prev!==uv?round((uv/prev-1)*100,2):result.latest.risk?.changePct??null};
      }
    }catch{}
    try{
      const m=await get('https://monedapi.ar/api/v2/arg/riesgo','json');
      const mv=Number(m?.sell??m?.buy??m?.value), md=String(m?.updatedAt??m?.date??'').slice(0,10);
      if(Number.isFinite(mv)&&md&&(!result.latest.risk||md>String(result.latest.risk.date||'').slice(0,10))){
        result.latest.risk={date:md,value:mv,previous:Number(m?.change?.referenceValue)||null,changePct:Number.isFinite(Number(m?.change?.percent))?Number(m.change.percent):null};
        result.sources.riskProvider='ArgentinaDatos (histórico) + MonedAPI (último dato, fallback)';
      }
    }catch{}
    if(Object.keys(result.countryRisk).length<20)throw new Error('cobertura EMBI+ insuficiente');
  }catch(e){errors.push('riesgo país: '+e.message)}
  try{const j=await get('https://zion.ar/api/v1/indicators/merval-usd-ccl/history?limit=100000','json');const rows=findObservations(j);result.mervalUsdCcl=annualLastGeneric(rows);result.daily.mervalUsd=recentDaily(rows,['value','valor']);result.latest.mervalUsd=latestWithChange(rows);for(const y of Object.keys(result.mervalUsdCcl))if(+y<2013)delete result.mervalUsdCcl[y];if(Object.keys(result.mervalUsdCcl).length<10)throw new Error('cobertura Merval USD CCL insuficiente');}catch(e){errors.push('Merval USD CCL: '+e.message)}
  try{const j=await get('https://zion.ar/api/v1/indicators/merval/history?limit=100000','json');const rows=findObservations(j);result.mervalPoints=annualLastGeneric(rows);result.daily.mervalPoints=recentDaily(rows,['value','valor']);result.latest.merval=latestWithChange(rows);if(!result.latest.merval)throw new Error('sin observaciones');}catch(e){errors.push('Merval puntos: '+e.message)}
  try{const j=await get('https://api.argentinadatos.com/v1/cotizaciones/dolares/blue','json');result.freeDollar.nominal=annualLastGeneric(j);/* v201: cierre de año → índice de diciembre (o del último mes del año en curso) */const M=await liveIpcChain(),lastK=Object.keys(M).at(-1);for(const [y,v] of Object.entries(result.freeDollar.nominal)){const k=M[`${y}-12`]?`${y}-12`:(lastK.startsWith(`${y}-`)?lastK:null);if(+y<2011||!k)continue;result.freeDollar.real[y]=round(v*M[lastK]/M[k],2);}result.freeDollar.basePeriod=lastK;if(Object.keys(result.freeDollar.nominal).length<10)throw new Error('cobertura dólar blue insuficiente');}catch(e){errors.push('dólar libre histórico: '+e.message)}
  try{const j=await get('https://api.argentinadatos.com/v1/cotizaciones/dolares/bolsa','json');result.latest.dollar=latestWithChange(j);if(!result.latest.dollar)throw new Error('sin observaciones MEP');}catch(e){errors.push('dólar MEP portada: '+e.message)}

  try{
    const html=await get('https://www.bna.com.ar/Personas','text');
    const plain=String(html).replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/\s+/g,' ');
    const matches=[...plain.matchAll(/(\d{1,2}\/\d{1,2}\/\d{4})\s+Compra\s+Venta\s+Dolar U\.S\.A\s+([\d.,]+)\s+([\d.,]+)/gi)];
    const parseAr=x=>Number(String(x).replace(/\./g,'').replace(',','.'));
    if(!matches.length)throw new Error('cotización billete no reconocida');
    const m=matches[0],parts=m[1].split('/');
    const current={date:`${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`,buy:parseAr(m[2]),sell:parseAr(m[3]),changePct:null};
    try{
      const hist=await get('https://www.bna.com.ar/Cotizador/HistoricoPrincipales','text');
      const hp=String(hist).replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/\s+/g,' ');
      const vals=[...hp.matchAll(/(\d{1,2}\/\d{1,2}\/\d{4}).{0,120}?Dolar U\.S\.A.{0,80}?([\d.,]+).{0,30}?([\d.,]+)/gi)].map(x=>({date:x[1],sell:parseAr(x[3])})).filter(x=>Number.isFinite(x.sell));
      const prev=vals.find(x=>x.date!==m[1]&&x.sell>0); if(prev)current.changePct=round((current.sell/prev.sell-1)*100,2);
    }catch{}
    result.latest.bna=current;
  }catch(e){errors.push('dólar oficial BNA: '+e.message)}

  // v197: BCRA (API de Estadísticas, var. 12: depósitos a plazo fijo a 30 días, % n.a.) primario; Datos Argentina de respaldo.
  // v201: tasa real = rendimiento de renovar el plazo fijo a 30 días cada mes del año (TNA del mes × 30/365) contra la
  // inflación de esos mismos meses (cadena mensual del IPC): ∏(1+i_m)/∏(1+π_m) − 1. Si al año le faltan meses de tasa,
  // se usa Fisher con la tasa promedio y la inflación promedio del año.
  try{let bc={},bcUrl=null,bcM={};try{const d=await bcraDaily(12,'1990-01-01');bc=annualAvg(d);bcM=monthlyAvg(d);bcUrl='https://api.bcra.gob.ar/estadisticas/v4.0/monetarias/12';}catch(e){errors.push('tasa BCRA: '+e.message);}
    let x=null;try{x=await seriesRows('89.1_TIPF35D_0_0_35',{start:'1990-01-01'});}catch(e){if(!Object.keys(bc).length)throw e;}
    result.interestRate.nominal=fillMissing({...bc},x?annualAvgGeneric(x.rows.map(r=>({fecha:r.date,valor:r.value}))):{});result.interestRate.source=bcUrl?'BCRA — tasa de depósitos a plazo fijo a 30 días (API de Estadísticas)':'Datos Argentina (respaldo)';x={url:bcUrl||x.url};const IM=await liveIpcChain(),INF=ipcAnnualAvgInflation(IM);
    for(const [y,i] of Object.entries(result.interestRate.nominal)){let g=1,ok=true;
      for(let m=1;m<=12;m++){const k=`${y}-${String(m).padStart(2,'0')}`,pk=m===1?`${+y-1}-12`:`${y}-${String(m-1).padStart(2,'0')}`;if(!Number.isFinite(bcM[k])||!IM[k]||!IM[pk]){ok=false;break;}g*=(1+bcM[k]/100*30/365)/(IM[k]/IM[pk]);}
      if(ok){result.interestRate.real[y]=round((g-1)*100,2);continue;}
      const pi=INF[y];if(pi==null)continue;result.interestRate.real[y]=round(((1+i/100)/(1+pi/100)-1)*100,2);}result.interestRate.sourceUrl=x.url;if(Object.keys(result.interestRate.nominal).length<10)throw new Error('cobertura tasa insuficiente');}catch(e){errors.push('tasa: '+e.message)}
  result.errors=errors; if(!Object.keys(result.countryRisk).length&&!Object.keys(result.mervalUsdCcl).length&&!Object.keys(result.freeDollar.nominal).length&&!Object.keys(result.interestRate.nominal).length)throw new Error(errors.join('; ')||'sin series financieras');
  return result;
}

async function exchangeHistorical(){
  const out={status:'ok',source:'BCRA / FMI / FRED-PWT / ArgentinaDatos; empalme por régimen',free:{nominal:{},real:{},tcr:{},monthly:{nominal:{},real:{},tcr:{}},daily:{nominal:{},real:{},tcr:{}},basePeriod:null},official:{nominal:{},real:{},tcr:{},monthly:{nominal:{},real:{},tcr:{}},daily:{nominal:{},real:{},tcr:{}},basePeriod:null},gap:{},dailyGap:{},regimes:[
    {from:1931,to:1958,label:'Controles y tipos múltiples'},{from:1964,to:1966,label:'Restricciones / mercados diferenciados'},{from:1981,to:1989,label:'Controles y mercado paralelo'},{from:2002,to:2002,label:'Mercado dual de emergencia (enero)'},{from:2011,to:2015,label:'Restricciones cambiarias'},{from:2019,to:2025,label:'Restricciones cambiarias'}],breaks:[
    {year:1931,label:'Inicio del control de cambios'},{year:1959,label:'Mercado unificado/libre'},{year:1981,label:'Reaparición de mercados diferenciados'},{year:1989,label:'Unificación (19 dic.)'},{year:1991,label:'Convertibilidad'},{year:2002,label:'Fin de Convertibilidad'},{year:2011,label:'Nuevas restricciones cambiarias'}]};
  const errors=[];

  // BCRA: promedios anuales de mercado oficial y libre expresados en pesos actuales por USD.
  // La conversión preserva la unidad: $m/n -> peso actual = / 1e13.
  const bcraOfficial={
    1934:3.3937e-13,1935:3.4636e-13,1936:3.2334e-13,1937:3.2334e-13,1938:3.3059e-13,1939:3.8328e-13,1940:4.2289e-13
  };
  const bcraFree={
    1928:2.8583e-13,1934:3.9527e-13,1935:3.8022e-13,1936:3.5947e-13,1937:3.3289e-13,1938:3.9157e-13,1939:4.3280e-13,1940:4.3683e-13,1941:4.2358e-13,1942:4.2328e-13,1943:4.0506e-13,1944:4.0246e-13,
    1976:246.41e-11,1977:409.89e-11,1978:798.81e-11,1979:1319.88e-11,1980:1840.79e-11,1981:2880.08e-11
  };
  Object.assign(out.official.nominal,bcraOfficial);
  Object.assign(out.free.nominal,bcraFree);

  // PWT/FRED: tipo de cambio anual en unidades de moneda nacional por USD, ya expresado en pesos actuales.
  // Se usa como serie oficial/de referencia 1950-2010. En 1959-63 y 1990-2010 el mercado estaba unificado,
  // por lo que también representa el dólar de mercado. No se fuerza esa igualdad en años con controles.
  const pwt={1950:3.77e-13,1951:5.11e-13,1952:5.37e-13,1953:5.27e-13,1954:5.43e-13,1955:6.08e-13,1956:1.38e-12,1957:1.82e-12,1958:2.24e-12,1959:5.92e-12,1960:6.4e-12,1961:7e-12,1962:8.72e-12,1963:1.39e-11,1964:1.4e-11,1965:1.7e-11,1966:2.09e-11,1967:3.33e-11,1968:3.5e-11,1969:3.5e-11,1970:3.79e-11,1971:4.52e-11,1972:5e-11,1973:5e-11,1974:5e-11,1975:3.66e-10,1976:1.4e-9,1977:4.08e-9,1978:7.96e-9,1979:1.32e-8,1980:1.84e-8,1981:4.4e-8,1982:2.59e-7,1983:1.05e-6,1984:6.76e-6,1985:6.01809e-5,1986:9.43032e-5,1987:2.1443e-4,1988:8.7526e-4,1989:0.042333961,1990:0.487589083,1991:0.953554417,1992:0.990641667,1993:0.998945833,1994:0.999008333,1995:0.99975,1996:0.9996625,1997:0.9995,1998:0.9995,1999:0.9995,2000:0.9995,2001:0.9995,2002:3.063256667,2003:2.900629167,2004:2.923300819,2005:2.9036575,2006:3.054313333,2007:3.095648849,2008:3.14416456,2009:3.710106831,2010:3.896295155};
  Object.assign(out.official.nominal,pwt);
  for(let y=1959;y<=1963;y++)out.free.nominal[y]=pwt[y];
  for(let y=1990;y<=2010;y++)out.free.nominal[y]=pwt[y];

  // FMI: promedio anual del tipo paralelo, convertido a pesos actuales, para el tramo 1984-1989.
  // Sustituye cualquier aproximación oficial en el dólar libre y permite calcular la brecha histórica.
  const imfParallel={1984:0.000008831,1985:0.000069423,1986:0.000105410,1987:0.000273300,1988:0.001098900,1989:0.047581250};
  const imfOfficial={1984:0.000006774,1985:0.000060156,1986:0.000094150,1987:0.000214600,1988:0.000872100,1989:0.039715750};
  Object.assign(out.free.nominal,imfParallel);
  Object.assign(out.official.nominal,imfOfficial);

  // Serie moderna automatizada. Se conserva punta vendedora de cierre anual desde 2011.
  let blueRows=[],offRows=[];
  const ingestModern=(rows,target)=>{
    rows.sort((a,b)=>String(a.fecha||a.date||'').localeCompare(String(b.fecha||b.date||'')));
    for(const r of rows){
      const d=String(r.fecha||r.date||'').slice(0,10),v=Number(r.venta??r.valor??r.value??r.compra);
      if(!/^\d{4}-\d{2}-\d{2}$/.test(d)||!Number.isFinite(v))continue;
      target.daily.nominal[d]=v; target.monthly.nominal[d.slice(0,7)]=v; target.nominal[d.slice(0,4)]=round(v,2);
    }
  };
  try{const blue=await get('https://api.argentinadatos.com/v1/cotizaciones/dolares/blue','json');blueRows=findObservations(blue);ingestModern(blueRows,out.free);if(!blueRows.length)throw new Error('respuesta sin observaciones reconocibles');}catch(e){errors.push('libre moderno: '+e.message)}
  try{const off=await get('https://api.argentinadatos.com/v1/cotizaciones/dolares/oficial','json');offRows=findObservations(off);ingestModern(offRows,out.official);if(!offRows.length)throw new Error('respuesta sin observaciones reconocibles');}catch(e){errors.push('oficial moderno: '+e.message)}

  // Deflactor ARS al último IPC publicado. La base se mueve automáticamente con cada nuevo dato mensual.
  try{
    const latestIpc=await ipc();
    // v201 · Un solo índice: la cadena mensual del IPC (1943+), extendida hacia atrás con el costo de vida de la
    // Ciudad de Buenos Aires (Dirección de Estadística Social, base 1929=100; Biblioteca INDEC, 1914–1945), empalmado en
    // el promedio de 1944. Cada dato se deflacta con el índice de su mismo período: promedios anuales con el índice
    // promedio del año; datos mensuales y diarios con el índice del mes. Base: último mes publicado.
    const M=ipcMonthlyChain(latestIpc.monthly||[]),A=ipcAnnualAvg(M);
    const costOfLiving1929={1914:76,1915:82,1916:88,1917:103,1918:130,1919:122,1920:143,1921:127,1922:107,1923:105,1924:107,1925:104,1926:101,1927:100,1928:99,1929:100,1930:101,1931:87,1932:78,1933:88,1934:78,1935:83,1936:91,1937:93,1938:92,1939:93,1940:95,1941:98,1942:103,1943:104,1944:102};
    const idx={...A};
    for(const [y,v] of Object.entries(costOfLiving1929))if(+y<1944)idx[y]=A[1944]*Number(v)/costOfLiving1929[1944];
    // Base: último mes con IPC de Argentina y de EE.UU. (el mismo que usa el TCR), así pesos constantes y TCR comparten base.
    let usM={};try{usM=(await usCpiMonthly()).monthly||{};}catch{}
    const basePeriod=latestCommonMonth(M,usM)||Object.keys(M).at(-1),baseLatest=M[basePeriod];
    out.free.basePeriod=basePeriod;out.official.basePeriod=basePeriod;
    if(baseLatest){
      for(const [y,v] of Object.entries(out.free.nominal)){const yy=+y;if(idx[yy])out.free.real[y]=round(v*baseLatest/idx[yy],4);}
      for(const [y,v] of Object.entries(out.official.nominal)){const yy=+y;if(idx[yy])out.official.real[y]=round(v*baseLatest/idx[yy],4);}
      // Meses posteriores al último IPC publicado: a precios del último mes (factor 1).
      const fac=ym=>M[ym]?baseLatest/M[ym]:(ym>basePeriod?1:null);
      const dailyReal=(daily,dest)=>{for(const [d,v] of Object.entries(daily)){const f=fac(d.slice(0,7));if(f)dest[d]=round(v*f,4);}};
      dailyReal(out.free.daily.nominal,out.free.daily.real);dailyReal(out.official.daily.nominal,out.official.daily.real);
      const monthlyReal=(monthly,dest)=>{for(const [ym,v] of Object.entries(monthly)){const f=fac(ym);if(f)dest[ym]=round(v*f,4);}};
      monthlyReal(out.free.monthly.nominal,out.free.monthly.real);monthlyReal(out.official.monthly.nominal,out.official.monthly.real);
      // La frecuencia anual moderna se deriva del último mes REAL disponible, no de una cadena anual separada.
      // Así 2026 aparece en ARS constantes hasta el último IPC publicado (actualmente ago-2026).
      const rollRealAnnual=(monthlyRealMap,annualRealMap)=>{for(const [ym,v] of Object.entries(monthlyRealMap).sort(([a],[b])=>a.localeCompare(b))){annualRealMap[ym.slice(0,4)]=v;}};
      rollRealAnnual(out.free.monthly.real,out.free.real);rollRealAnnual(out.official.monthly.real,out.official.real);
    }
  }catch(e){errors.push('deflactor histórico: '+e.message)}

  // Tipo de cambio real bilateral: ARS constantes corregidos por la pérdida de poder adquisitivo del USD.
  // TCR_t = TC_t * (IPC_ARG_base/IPC_ARG_t) * (CPI_US_t/CPI_US_base).
  try{
    const bls=await usCpiMonthly(); const usM=bls.monthly, usA=usCpiAnnual();
    const latestIpc=await ipc(); const arM=Object.fromEntries(latestIpc.monthly.map(x=>[x.date,x.index]));
    const basePeriod=latestCommonMonth(arM,usM); if(!basePeriod)throw new Error('sin mes común ARG-EE.UU.');
    const usBase=usM[basePeriod]; out.realBase={period:basePeriod,argIndex:arM[basePeriod],usIndex:usBase,usSeries:'CUUR0000SA0'};
    out.free.basePeriod=basePeriod; out.official.basePeriod=basePeriod;
    const applyAnnual=(obj)=>{for(const [y,arsReal] of Object.entries(obj.real)){const yy=+y;let us=usA[yy];if(yy===+basePeriod.slice(0,4)){const vals=Object.entries(usM).filter(([ym])=>ym.startsWith(`${yy}-`)&&ym<=basePeriod).map(([,v])=>v);if(vals.length)us=vals.reduce((a,b)=>a+b,0)/vals.length;}if(us&&usBase)obj.tcr[y]=round(Number(arsReal)*us/usBase,4);}};
    const applyMonthly=(obj)=>{for(const [ym,arsReal] of Object.entries(obj.monthly.real)){const us=usM[ym]??usA[+ym.slice(0,4)];if(us&&usBase)obj.monthly.tcr[ym]=round(Number(arsReal)*us/usBase,4);}};
    const applyDaily=(obj)=>{for(const [d,arsReal] of Object.entries(obj.daily.real)){const ym=d.slice(0,7),us=usM[ym]??usA[+d.slice(0,4)];if(us&&usBase)obj.daily.tcr[d]=round(Number(arsReal)*us/usBase,4);}};
    applyAnnual(out.free);applyAnnual(out.official);applyMonthly(out.free);applyMonthly(out.official);applyDaily(out.free);applyDaily(out.official);
  }catch(e){errors.push('TCR bilateral: '+e.message)}

  for(const y of new Set([...Object.keys(out.free.nominal),...Object.keys(out.official.nominal)])){
    const f=Number(out.free.nominal[y]),o=Number(out.official.nominal[y]);
    if(Number.isFinite(f)&&Number.isFinite(o)&&o!==0)out.gap[y]=round((f/o-1)*100,2);
  }
  for(const d of new Set([...Object.keys(out.free.daily.nominal),...Object.keys(out.official.daily.nominal)])){const f=Number(out.free.daily.nominal[d]),o=Number(out.official.daily.nominal[d]);if(Number.isFinite(f)&&Number.isFinite(o)&&o!==0)out.dailyGap[d]=round((f/o-1)*100,2);}
  out.coverage={free:{first:Math.min(...Object.keys(out.free.nominal).map(Number)),last:Math.max(...Object.keys(out.free.nominal).map(Number)),count:Object.keys(out.free.nominal).length},official:{first:Math.min(...Object.keys(out.official.nominal).map(Number)),last:Math.max(...Object.keys(out.official.nominal).map(Number)),count:Object.keys(out.official.nominal).length},gap:{first:Math.min(...Object.keys(out.gap).map(Number)),last:Math.max(...Object.keys(out.gap).map(Number)),count:Object.keys(out.gap).length}};
  out.notes=['No se interpolan años sin cotización libre verificable. El deflactor histórico se extiende a 1914 con la serie oficial de costo de vida (base 1929=100) empalmada al IPC desde 1944.','1990–2010: mercado unificado; dólar libre = tipo de cambio de mercado/de referencia.','1984–1989: paralelo y oficial según FMI; 1930s/1970s: mercado libre/oficial según publicaciones BCRA.','ARS constantes y TCR bilateral usan automáticamente el último mes común disponible entre IPC Argentina e IPC-U EE.UU.; no se mezclan meses de base.'];
  // v121: el histórico diario completo viaja en public/fx-daily.json; la API envía sólo los últimos 400 días.
  {const cut=new Date(Date.now()-400*864e5).toISOString().slice(0,10);const trim=o=>{for(const k of Object.keys(o||{}))if(k<cut)delete o[k];};
  for(const side of [out.free,out.official])for(const k of ['nominal','real','tcr'])trim(side?.daily?.[k]);trim(out.dailyGap);}
  out.errors=errors;return out;
}
// v172 · IPC: fuente principal el CSV oficial de INDEC (serie_ipc_divisiones.csv, se actualiza el día de la
// publicación a las 16 h); respaldo Datos Argentina (que suele tardar días y a veces viene con huecos) y la línea de
// base local. Se combinan por mes (INDEC > Datos Argentina > respaldo) y las variaciones salen siempre del índice.
export function parseIndecIpcCsv(text){
  const lines=String(text||'').replace(/^﻿/,'').split(/\r?\n/).filter(l=>l.trim());if(lines.length<3)return [];
  const delim=(lines[0].match(/;/g)||[]).length>=(lines[0].match(/,/g)||[]).length?';':',';
  const split=l=>l.split(delim).map(x=>x.trim().replace(/^"|"$/g,''));
  const H=split(lines[0]).map(h=>h.toLowerCase());
  const ci=n=>H.findIndex(h=>n.test(h));
  const cCod=ci(/^c[oó]digo/),cDesc=ci(/^descripci/),cPer=ci(/^periodo/),cIdx=ci(/^indice/),cReg=ci(/^regi[oó]n/);
  if(cPer<0||cIdx<0)return [];
  const num=v=>{const x=String(v||'').replace(/\./g,(m,o,str)=>/,/.test(str)?'':'.').replace(',','.');const n=Number(x);return Number.isFinite(n)?n:null;};
  const out={};
  for(const l of lines.slice(1)){const c=split(l);
    const reg=cReg>=0?c[cReg]:'Nacional';if(!/nacional/i.test(reg))continue;
    const general=(cCod>=0&&c[cCod]==='0')||(cDesc>=0&&/nivel general/i.test(c[cDesc]));if(!general)continue;
    const per=String(c[cPer]||'').replace(/\D/g,'');if(!/^\d{6}$/.test(per))continue;
    const v=num(c[cIdx]);if(v&&v>0)out[`${per.slice(0,4)}-${per.slice(4,6)}`]=v;}
  return Object.keys(out).sort().map(date=>({date,index:out[date]}));
}
async function ipc(){
  const byDate=new Map(),errors=[];let source=[],publishedAt=null;
  for(const r of BUNDLED_SOURCES.ipc?.monthly||[])if(Number(r.index)>0)byDate.set(String(r.date).slice(0,7),{date:String(r.date).slice(0,7),index:Number(r.index)});
  try{const raw=await get(`${SERIES_API}?ids=${encodeURIComponent(IPC_ID)}&limit=1000&format=json`,'json');
    for(const r of raw.data||[])if(r[1]!=null&&Number(r[1])>0){const d=String(r[0]).slice(0,7);byDate.set(d,{date:d,index:Number(r[1])});}source.push('Datos Argentina');}
  catch(e){errors.push(`Datos Argentina: ${String(e?.message||e).slice(0,80)}`);}
  try{const c=new AbortController(),tm=setTimeout(()=>c.abort(),25000);
    try{const r=await fetch('https://www.indec.gob.ar/ftp/cuadros/economia/serie_ipc_divisiones.csv',{signal:c.signal,headers:{'user-agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'}});
      if(!r.ok)throw new Error(`HTTP ${r.status}`);
      const buf=await r.arrayBuffer();let text=new TextDecoder('utf-8').decode(buf);if(text.includes('�'))text=new TextDecoder('latin1').decode(buf);
      const rows=parseIndecIpcCsv(text);if(rows.length<24)throw new Error('CSV sin la serie nacional');
      for(const x of rows)byDate.set(x.date,x);source.push('INDEC (CSV oficial)');
      const lm=r.headers.get('last-modified');if(lm&&!Number.isNaN(Date.parse(lm)))publishedAt=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires'}).format(new Date(lm));
    }finally{clearTimeout(tm);}}
  catch(e){errors.push(`INDEC: ${String(e?.message||e).slice(0,80)}`);}
  const rows=[...byDate.values()].sort((a,b)=>a.date.localeCompare(b.date));
  if(rows.length<14)throw new Error('observaciones insuficientes');
  // Sólo meses consecutivos para la variación mensual.
  const monthly=[];for(let i=1;i<rows.length;i++)if(ymShift(rows[i-1].date,1)===rows[i].date)monthly.push({...rows[i],value:round(pct(rows[i].index,rows[i-1].index),1)});
  const last=rows.at(-1),byD=Object.fromEntries(rows.map(r=>[r.date,r.index])),prevYear=byD[ymShift(last.date,-12)];
  const year=last.date.slice(0,4),decPrev=byD[`${Number(year)-1}-12`];
  // Fecha de publicación: la del calendario oficial del período si el CSV no la informa.
  if(!publishedAt||publishedAt.slice(0,7)<=last.date){const lbl=`${['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'][Number(last.date.slice(5))-1]} ${year}`;const ev=EVENTS.find(e=>/precios al consumidor/i.test(e.title)&&String(e.period).toLowerCase()===lbl);if(ev)publishedAt=ev.date;}
  return {status:'ok',source:`INDEC — IPC Nacional (${source.join(' + ')||'respaldo local'})`,sourceUrl:'https://www.indec.gob.ar/indec/web/Nivel4-Tema-3-5-31',updated:last.date,publishedAt,latest:{date:last.date,value:monthly.at(-1).value,yoy:prevYear?round(pct(last.index,prevYear),1):null,ytd:decPrev?round(pct(last.index,decPrev),1):null},monthly,displayMonthly:monthly.slice(-7),...(errors.length?{fetchErrors:errors}:{})};
}
const ARCA_MONTHS={enero:1,febrero:2,marzo:3,abril:4,mayo:5,junio:6,julio:7,agosto:8,septiembre:9,setiembre:9,octubre:10,noviembre:11,diciembre:12};
export function parseArcaRelease(text,now=new Date()){
  const t=String(text||'').replace(/\s+/g,' ');const MON='(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)';
  const re=new RegExp(`(?:recursos tributarios|recaudaci[oó]n(?: tributaria)?(?: total)?(?: nacional)?)[^.]{0,60}?\\b${MON}\\b(?:\\s+(?:de|del)?\\s*(20\\d{2}))?([^%]{0,400}?)(-?[\\d.]+(?:,\\d+)?)\\s*%`,'gi');
  let m;const found=[];
  while((m=re.exec(t))){
    const mid=m[3]||'';if(!/interanual|respecto (?:de|a|al) (?:igual|mismo)|i\.a\./i.test(mid+t.slice(re.lastIndex,re.lastIndex+40)))continue;
    if(!/(variaci[oó]n|increment|aument|suba|crec|ca[ií]d|baj)/i.test(mid))continue;
    const amt=mid.match(/\$\s*([\d.]+(?:,\d+)?)\s*(millones|billones|mil millones)?/i);
    const month=ARCA_MONTHS[m[1].toLowerCase()];let year=m[2]?Number(m[2]):now.getUTCFullYear();
    if(!m[2]&&month>now.getUTCMonth()+1)year--;
    let yoy=Number(m[4].replace(/\./g,'').replace(',','.'));if(/ca[ií]d|baj/i.test(mid)&&yoy>0)yoy=-yoy;
    let value=null;if(amt){value=Number(amt[1].replace(/\./g,'').replace(',','.'));const u=(amt[2]||'millones').toLowerCase();if(u==='billones')value*=1e6;else if(u==='mil millones')value*=1e3;}
    if(Number.isFinite(yoy)&&Math.abs(yoy)<1000)found.push({ym:`${year}-${String(month).padStart(2,'0')}`,yoy:round(yoy,1),value,period:`${m[1].toLowerCase()} ${year}`});
  }
  return found.sort((a,b)=>b.ym.localeCompare(a.ym))[0]||null;
}
async function arca(){
  const history={'2025-09':20.2,'2025-10':26.5,'2025-11':19.7,'2025-12':27.0,'2026-01':22.0,'2026-02':20.1,'2026-03':26.2,'2026-04':27.2,'2026-05':35.6,'2026-06':23.7,'2026-07':35.1,'2026-08':33.5,'2026-09':38.3};
  try{const x=await seriesRows('142.3_TOTAL_2001_M_26',{start:'2020-01-01'});const levels={};for(const r of x.rows){const d=String(r.date).slice(0,7);if(/^\d{4}-\d{2}$/.test(d))levels[d]=r.value;}for(const [d,v] of Object.entries(levels)){const [y,m]=d.split('-');const prev=`${Number(y)-1}-${m}`;if(Number.isFinite(levels[prev]))history[d]??=round(pct(v,levels[prev]),1);}}catch{} // v197: DA sólo completa
  try{
    const x=await bestCsv('sspm-recursos-tributarios-totales-por-tributo',r=>/mensual/i.test(`${r.name||''} ${r.description||''}`)?10:0);
    const rows=parseCsv(x.text),h=rows[0].map(norm),dc=h.findIndex(v=>/indice_tiempo|fecha|periodo/.test(v));
    let vc=h.findIndex(v=>/^total_recaudacion$|^total$|recursos_tributarios_totales/.test(v));
    if(vc<0)vc=h.findIndex(v=>/total/.test(v)&&!/iva|ganancias|seguridad|aduan/.test(v));
    const levels={}; if(dc>=0&&vc>=0)for(const r of rows.slice(1)){const d=String(r[dc]||'').slice(0,7),v=numberAR(r[vc]);if(/^\d{4}-\d{2}$/.test(d)&&Number.isFinite(v))levels[d]=v;}
    for(const [d,v] of Object.entries(levels)){const y=Number(d.slice(0,4)),prev=`${y-1}${d.slice(4)}`;if(levels[prev])history[d]??=round(pct(v,levels[prev]),1);}
  }catch{}
  // v124: ARCA publica cada mes una novedad NUEVA ("Recaudación tributaria de <mes>", con otro id).
  // Antes se leía siempre la misma página (id fija), por eso el sitio quedaba en el mes anterior.
  // Ahora se lee la última novedad conocida y su recuadro "Últimas novedades", se siguen los enlaces
  // de recaudación y se toma el mes más reciente. El dato se agrega también al histórico.
  try{
    const base=URLS.arca,pages=[{url:base,html:await get(base)}];
    const re=/titulo-noticia-anterior">\s*Recaudaci(?:ó|o|&oacute;)n tributaria de [^<]*<\/h3>\s*<a href="(ver\.aspx\?id=(\d+))"/gi;let m;const seen=new Set([base]);
    const links=[];while((m=re.exec(pages[0].html)))links.push({id:+m[2],url:new URL(m[1],base).href});
    for(const l of links.sort((a,b)=>b.id-a.id).slice(0,2)){if(seen.has(l.url))continue;seen.add(l.url);try{pages.push({url:l.url,html:await get(l.url)});}catch{}}
    let best=null;
    for(const pg of pages){const text=strip(pg.html);const pub=text.match(/publicado:?\s*(\d{1,2})\/(\d{1,2})\/(20\d{2})/i);const ref=pub?new Date(Date.UTC(+pub[3],+pub[2]-1,+pub[1])):new Date();
      const p=parseArcaRelease(text,ref);if(p&&(!best||p.ym>best.ym))best={...p,url:pg.url,published:pub?ref.toISOString().slice(0,10):null};}
    if(best){history[best.ym]=best.yoy;return {status:'ok',source:'ARCA — Recursos Tributarios',sourceUrl:best.url,history,historyMeasure:'Variación interanual nominal (%)',latest:{value:best.value,yoy:best.yoy,period:best.period,ym:best.ym,published:best.published}};}
  }catch{}
  return {status:'ok',source:'ARCA — Recursos Tributarios',sourceUrl:URLS.arca,history,historyMeasure:'Variación interanual nominal (%)',latest:{value:21358918,yoy:38.3,period:'septiembre 2026',ym:'2026-09',published:'2026-10-01'}};
}
async function icg(){
  const history={'2025-09':1.943966,'2025-10':2.10,'2025-11':2.47,'2025-12':2.46,'2026-01':2.40,'2026-02':2.38,'2026-03':2.30,'2026-04':2.02,'2026-05':1.99,'2026-06':2.07,'2026-07':1.94,'2026-08':2.06,'2026-09':1.94};
  // Backfill histórico público (fuente primaria UTDT). Resolver el dataset por catálogo,
  // no asumir que el slug visible es también el ID interno de CKAN.
  let historicalCount=0, historicalError=null;
  try{
    const pkg=await catalogPackage('Índice de Confianza en el Gobierno');
    if(!pkg)throw new Error('dataset ICG no encontrado en catálogo');
    const resources=(pkg.resources||[]).filter(r=>String(r.format||'').toLowerCase()==='csv')
      .sort((a,b)=>(/confianza|gobierno|mensual|serie/i.test(`${b.name||''} ${b.description||''}`)?1:0)-(/confianza|gobierno|mensual|serie/i.test(`${a.name||''} ${a.description||''}`)?1:0));
    if(!resources.length)throw new Error('dataset ICG sin recurso CSV');
    // Un dataset puede exponer recursos anuales y mensuales. No aceptar el primer
    // CSV interpretable: evaluar todos y conservar el de mayor cobertura mensual.
    let bestHistory=null,bestCount=0,bestResource='';
    for(const res of resources){
      try{
        const rows=parseCsv(await get(res.url)); if(rows.length<3)continue;
        const h=rows[0].map(norm),dc=h.findIndex(v=>/indice_tiempo|fecha|periodo|time/.test(v));
        let vc=h.findIndex(v=>/(indice.*confianza.*gobierno|^icg$|confianza_gobierno|nivel_general|valor)/.test(v)&&!/(variacion|region)/.test(v));
        if(vc<0)vc=h.findIndex((v,i)=>i!==dc&&/confianza|gobierno|icg/.test(v)&&!/(variacion|region)/.test(v));
        if(vc<0&&h.length===2)vc=dc===0?1:0;
        if(dc<0||vc<0)continue;
        const candidate={};
        for(const r of rows.slice(1)){
          const raw=String(r[dc]||'').trim();
          // Aceptar YYYY-MM, YYYY/MM y fechas completas, pero nunca reducir a YYYY.
          const m=raw.match(/((?:19|20)\d{2})[-\/](\d{1,2})(?:[-\/]\d{1,2})?/);
          if(!m)continue;
          const month=Number(m[2]); if(month<1||month>12)continue;
          const d=`${m[1]}-${String(month).padStart(2,'0')}`,v=numberAR(r[vc]);
          if(Number.isFinite(v))candidate[d]=round(v,2);
        }
        const count=Object.keys(candidate).length;
        if(count>bestCount){bestHistory=candidate;bestCount=count;bestResource=res.name||res.url||'';}
      }catch{}
    }
    if(!bestHistory||bestCount<100)throw new Error(`no se encontró recurso mensual completo del ICG (máximo: ${bestCount} meses)`);
    fillMissing(history,bestHistory); // v197: los meses verificados contra UTDT tienen prioridad
    historicalCount=Object.keys(history).length;
    if(historicalCount<100)throw new Error(`histórico ICG incompleto: ${historicalCount} observaciones`);
  }catch(e){historicalError=String(e?.message||e);}
  const monthNum={enero:'01',febrero:'02',marzo:'03',abril:'04',mayo:'05',junio:'06',julio:'07',agosto:'08',septiembre:'09',octubre:'10',noviembre:'11',diciembre:'12'};
  const monthAbbr={enero:'ene',febrero:'feb',marzo:'mar',abril:'abr',mayo:'may',junio:'jun',julio:'jul',agosto:'ago',septiembre:'sep',octubre:'oct',noviembre:'nov',diciembre:'dic'};
  try{
    const text=strip(await get(URLS.icg));
    const re=/(Enero|Febrero|Marzo|Abril|Mayo|Junio|Julio|Agosto|Septiembre|Octubre|Noviembre|Diciembre)\s+(20\d{2})\s+El ICG de\s+\1\s+fue de\s*([\d,]+)\s*puntos[^.]*?(aumento|incremento|disminuci[oó]n|ca[ií]da|retroceso)\s+(?:del?\s+)?([\d,]+)%/ig;
    const found=[];let m;while((m=re.exec(text))){const mon=m[1].toLowerCase(),year=m[2],value=Number(m[3].replace(',','.')),raw=Number(m[5].replace(',','.')),down=/dismin|ca[ií]da|retroceso/i.test(m[4]);found.push({ym:`${year}-${monthNum[mon]}`,value,mom:down?-raw:raw,period:`${monthAbbr[mon]} ${year}`});}
    if(found.length){
      found.sort((a,b)=>a.ym.localeCompare(b.ym));
      for(const r of found)history[r.ym]=r.value;
      const x=found.at(-1), knownYm=Object.keys(history).sort().at(-1);
      // UTDT puede tardar en actualizar la página histórica. Nunca reemplazar un dato
      // verificado más reciente por el último mes que todavía figure en esa página.
      if(!knownYm || x.ym>=knownYm){
        history[x.ym]=x.value;
        return {status:historicalError?'partial':'ok',source:'Universidad Torcuato Di Tella — ICG',sourceUrl:URLS.icg,publicationDate:'2026-09-28',history,historicalCount:Object.keys(history).length,historicalError,latest:{value:x.value,mom:x.mom,period:x.period}};
      }
    }
  }catch{}
  return {status:historicalError?'partial':'ok',source:'Universidad Torcuato Di Tella — ICG',sourceUrl:URLS.icg,publicationDate:'2026-09-28',history,historicalCount:Object.keys(history).length,historicalError,latest:{value:1.94,mom:-5.9,period:'sep 2026'},note:'Fallback verificado para septiembre 2026; el parser toma automáticamente la publicación más reciente cuando UTDT actualiza la página.'};
}
async function bcra(){
  const text=strip(await get(URLS.bcra));
  const inf=text.match(/Inflaci[oó]n mensual[^|%]*?([0-9]{2}\/[0-9]{2}\/20[0-9]{2})[^\d]*([\d,]+)/i);
  const exp=text.match(/Inflaci[oó]n esperada[^%]*?(?:[0-9]{2}\/[0-9]{2}\/20[0-9]{2})[^\d]*([\d,]+)/i);
  return {status:'ok',source:'BCRA',sourceUrl:URLS.bcra,latest:{inflation:inf?Number(inf[2].replace(',','.')):null,expected12m:exp?Number(exp[1].replace(',','.')):null}};
}
// v126: además de los datos del texto, se leen las tablas del REM (xlsx) para tener la inflación mensual
// esperada (mediana) de cada mes. La tarjeta de recaudación la usa para estimar la variación real
// mientras INDEC no publica el IPC del mes.
const REM_CPI_FALLBACK={survey:'2026-09',published:'2026-10-06',monthly:{'2026-09':1.9,'2026-10':1.7,'2026-11':1.62,'2026-12':1.8,'2027-01':1.6,'2027-02':1.6,'2027-03':1.7},next12:21.05,fxDec:{year:2026,value:1614}};
// v141 · Un relevamiento del REM resumido (medianas) para graficar la evolución de las expectativas:
// ipcM {AAAA-MM: % mensual}, ipc12 (% i.a. próximos 12 meses), fxM {AAAA-MM: $/USD}, gdpQ {AAAA-Qn: % trim. s.e.}, gdpY {AAAA: %}.
export function remSurveyFromRows(rows){
  const out={ipcM:{},ipc12:null,fxM:{},gdpQ:{},gdpY:{}};let block='';
  const ymOf=v=>{if(v instanceof Date)return `${v.getUTCFullYear()}-${String(v.getUTCMonth()+1).padStart(2,'0')}`;if(typeof v==='number'&&v>20000&&v<80000){const d=new Date(Math.round((v-25569)*864e5));return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;}const m=String(v??'').match(/^(20\d{2})-(\d{2})/);return m?`${m[1]}-${m[2]}`:null;};
  const ROMAN={I:1,II:2,III:3,IV:4};
  for(const r of rows||[]){
    if(!r)continue;const cells=r.filter(v=>v!==null&&v!==undefined&&v!=='');if(!cells.length)continue;
    if(cells.length===1&&typeof cells[0]==='string'){block=cells[0];continue;}
    const iRef=r.findIndex(v=>typeof v==='string'&&/(var\.|\$\/USD|TNA|millones|% de la PEA)/i.test(v));if(iRef<1)continue;
    const ref=String(r[iRef]),per=r[iRef-1],med=Number(r[iRef+1]);if(!Number.isFinite(med))continue;
    const isIpc=/IPC nivel general/i.test(block),isFx=/Tipo de cambio/i.test(block),isGdp=/PIB/i.test(block);
    const ym=ymOf(per),q=String(per??'').match(/Trim\.?\s*(I{1,3}|IV)-(\d{2})/i),yr=String(per??'').match(/^(20\d{2})$/);
    if(isIpc&&/mensual/i.test(ref)&&ym)out.ipcM[ym]=round(med,2);
    else if(isIpc&&/pr[oó]x\.?\s*12/i.test(String(per)))out.ipc12=round(med,2);
    else if(isFx&&/^\$\/USD$/i.test(ref.trim())&&ym)out.fxM[ym]=Math.round(med*100)/100;
    else if(isGdp&&q)out.gdpQ[`20${q[2]}-Q${ROMAN[q[1].toUpperCase()]}`]=round(med,2);
    else if(isGdp&&yr&&/anual/i.test(ref))out.gdpY[yr[1]]=round(med,2);
  }
  return out;
}
async function remCpiMonthly(html){
  const links=[...String(html||'').matchAll(/href="([^"]*relevamiento-expectativas-mercado-tablas-(\d{4})-(\d{2})\.xlsx)"/gi)].map(m=>({url:new URL(m[1],URLS.rem).href,ym:`${m[2]}-${m[3]}`})).sort((a,b)=>b.ym.localeCompare(a.ym));
  const cand=links[0]||(()=>{const d=new Date();const p=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()-1,1));const ym=`${p.getUTCFullYear()}-${String(p.getUTCMonth()+1).padStart(2,'0')}`;return {ym,url:`https://www.bcra.gob.ar/archivos/Pdfs/PublicacionesEstadisticas/informes/relevamiento-expectativas-mercado-tablas-${ym}.xlsx`};})();
  const c=new AbortController(),tm=setTimeout(()=>c.abort(),20000);
  try{
    const r=await fetch(cand.url,{signal:c.signal,headers:{'user-agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'}});if(!r.ok)throw new Error(`REM xlsx ${r.status}`);
    const wb=XLSX.read(await r.arrayBuffer(),{type:'array'});const ws=wb.Sheets[wb.SheetNames.find(n=>/cuadros/i.test(n))||wb.SheetNames[0]];
    const rows=XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:null});
    const start=rows.findIndex(r=>r&&r.some(v=>/IPC nivel general/i.test(String(v??''))));if(start<0)throw new Error('REM: bloque IPC no encontrado');
    const monthly={};
    for(const r of rows.slice(start+1,start+20)){
      if(!r||r.every(v=>v==null))break;
      const ref=r.find(v=>/var\.?\s*%\s*mensual/i.test(String(v??'')));if(!ref)continue;
      const iRef=r.indexOf(ref),per=r[iRef-1],med=Number(r[iRef+1]);let ym=null;
      if(typeof per==='number'){const d=new Date(Math.round((per-25569)*864e5));ym=`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;}
      else if(per instanceof Date)ym=`${per.getUTCFullYear()}-${String(per.getUTCMonth()+1).padStart(2,'0')}`;
      else{const m=String(per??'').match(/(20\d{2})-(\d{2})/);if(m)ym=`${m[1]}-${m[2]}`;}
      if(ym&&Number.isFinite(med))monthly[ym]=round(med,2);
    }
    if(Object.keys(monthly).length<3)throw new Error('REM: pocas filas mensuales');
    // v140: inflación esperada próximos 12 meses (mismo bloque IPC) y tipo de cambio esperado para diciembre del año.
    let next12=null;for(const r of rows.slice(start+1,start+20)){if(r&&/pr[oó]x\.?\s*12\s*meses/i.test(String(r.find(v=>v!=null)??''))){const i=r.findIndex(v=>/var\.?\s*%\s*i\.?a/i.test(String(v??'')));const v=Number(r[i+1]);if(Number.isFinite(v))next12=round(v,2);break;}}
    let fxDec=null;const fxStart=rows.findIndex(r=>r&&r.some(v=>/Tipo de cambio nominal/i.test(String(v??''))));
    if(fxStart>=0)for(const r of rows.slice(fxStart+1,fxStart+20)){const ref=r?.find(v=>/\$\/USD;\s*dic-(\d{2})/i.test(String(v??'')));if(ref){const yy=2000+Number(String(ref).match(/dic-(\d{2})/i)[1]),v=Number(r[r.indexOf(ref)+1]);if(Number.isFinite(v)&&(!fxDec||yy<fxDec.year))fxDec={year:yy,value:Math.round(v)};}}
    let entry=null;try{entry=remSurveyFromRows(rows);}catch{}
    return {survey:cand.ym,url:cand.url,monthly,next12,fxDec,entry};
  }finally{clearTimeout(tm);}
}
async function rem(){
  let html='',text='';try{html=await get(URLS.rem);text=strip(html);}catch{}
  const participants=text.match(/contemplando a\s*(\d+)\s*participantes, entre\s*(\d+)\s*consultoras[^\d]+(\d+)\s*entidades financieras/i);
  // v140: sin años fijos — "nivel de PIB real 1,5% superior al promedio de 2025" → 2026: +1,5%.
  const gdpM=text.match(/PIB real\s*([\d,]+)%\s*(superior|inferior)\s+al promedio de\s+(20\d{2})/i);
  const gdp=gdpM?[gdpM[0],(gdpM[2].toLowerCase()==='inferior'?'-':'')+gdpM[1]]:null,gdpYear=gdpM?+gdpM[3]+1:null;
  const fxM=text.match(/diciembre de\s+(20\d{2})[^$]{0,100}\$\s*([\d\.]+)\/USD/i);
  const fx=fxM?[fxM[0],fxM[2]]:null,fxYear=fxM?+fxM[1]:null;
  let cpi=null;try{cpi=await remCpiMonthly(html);}catch(e){cpi={...REM_CPI_FALLBACK,fallback:true,error:String(e?.message||e)};}
  if(!text&&cpi.fallback)throw new Error('REM no disponible');
  const pub=text.match(/publicado el d[ií]a\s+(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s+de\s+(20\d{2})/i);
  const MES={enero:1,febrero:2,marzo:3,abril:4,mayo:5,junio:6,julio:7,agosto:8,septiembre:9,setiembre:9,octubre:10,noviembre:11,diciembre:12};
  const surveyM=text.match(/RESUMEN EJECUTIVO\s*\|\s*(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s+DE\s+(20\d{2})/i);
  const survey=surveyM?`${surveyM[2]}-${String(MES[surveyM[1].toLowerCase()]).padStart(2,'0')}`:(cpi?.survey||null);
  // v140: si el texto y el xlsx corresponden a relevamientos distintos, no se mezclan.
  const sameSurvey=!cpi?.survey||!survey||cpi.survey===survey;
  const surveys=(sameSurvey&&cpi?.entry&&cpi?.survey&&!cpi.fallback)?{[cpi.survey]:{...cpi.entry,published:pub?`${pub[3]}-${String(MES[pub[2].toLowerCase()]).padStart(2,'0')}-${String(+pub[1]).padStart(2,'0')}`:null}}:undefined;
  return {status:'ok',source:'REM BCRA',sourceUrl:URLS.rem,...(surveys?{surveys}:{}),latest:{survey,published:pub?`${pub[3]}-${String(MES[pub[2].toLowerCase()]).padStart(2,'0')}-${String(+pub[1]).padStart(2,'0')}`:null,participants:participants?+participants[1]:null,consultants:participants?+participants[2]:null,banks:participants?+participants[3]:null,gdpYear,gdp:gdp?Number(gdp[1].replace(',','.')):null,gdp2026:gdp&&gdpYear===2026?Number(gdp[1].replace(',','.')):null,fxDecYear:fxYear||(sameSurvey?cpi?.fxDec?.year:null)||null,fxDec:fx?Number(fx[1].replace(/\./g,'')):(sameSurvey&&cpi?.fxDec?cpi.fxDec.value:null),fxDec2026:fx&&fxYear===2026?Number(fx[1].replace(/\./g,'')):(sameSurvey&&cpi?.fxDec?.year===2026?cpi.fxDec.value:null),inflationNext12:sameSurvey&&Number.isFinite(cpi?.next12)?cpi.next12:null},cpiExpected:cpi};
}
// v211 · Índice de salarios (INDEC, base octubre 2016=100): total, privado registrado, público, total registrado y
// privado no registrado. Primaria: CSV oficial de INDEC (se reemplaza en cada informe); respaldo: Datos Argentina
// (serie 149.1, suele llegar un mes después). El mes recién publicado se toma también del texto del informe (portada de
// INDEC o su publicación en X): "el índice de salarios se incrementó 2,7% mensual … subas de 2,8% en el sector privado
// registrado, 2,3% en el sector público y 3,0% en el sector privado no registrado".
const WAGE_KEYS=['privReg','pub','totalReg','nonReg','total'];
export function parseWagesCsv(t){
  const M=Object.fromEntries(WAGE_KEYS.map(k=>[k,{}]));const lines=String(t||'').split(/\r?\n/).filter(Boolean);if(lines.length<10)throw new Error('CSV de salarios vacío');
  const head=lines[0].split(';').map(x=>x.trim().toLowerCase());
  const col={privReg:head.indexOf('is_sector_privado_registrado'),pub:head.indexOf('is_sector_publico'),totalReg:head.indexOf('is_total_registrado'),nonReg:head.indexOf('is_sector_no_registrado'),total:head.indexOf('is_indice_total')};
  if(col.total<0||col.privReg<0)throw new Error('CSV de salarios: columnas inesperadas');
  for(const l of lines.slice(1)){const c=l.split(';');const d=String(c[0]||'').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);if(!d)continue;const ym=`${d[3]}-${d[2].padStart(2,'0')}`;
    for(const k of WAGE_KEYS){if(col[k]<0)continue;const v=Number(String(c[col[k]]||'').trim().replace(/\./g,'').replace(',','.'));if(Number.isFinite(v)&&v>0)M[k][ym]=v;}}
  return M;
}
export function parseWagesNews(text){
  const t=String(text||'').replace(/\s+/g,' ');
  const m=t.match(/En (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre) de (20\d{2}),? el [ií]ndice de salarios (?:se increment[oó]|aument[oó]|creci[oó]|subi[oó]|registr[oó] una suba de|baj[oó]|cay[oó]|disminuy[oó])\s*(?:un |de )?(-?[\d]+,?\d*)\s*% mensual(?: y (-?[\d]+,?\d*)\s*% interanual)?([^]{0,400})/i);
  if(!m)return null;const MES={enero:1,febrero:2,marzo:3,abril:4,mayo:5,junio:6,julio:7,agosto:8,septiembre:9,setiembre:9,octubre:10,noviembre:11,diciembre:12};
  const num=x=>x==null?null:Number(String(x).replace(',','.')),neg=/baj[oó]|cay[oó]|disminuy[oó]/i.test(m[0].slice(0,120));
  const rest=m[5]||'',sec=re=>{const r=rest.match(re);return r?num(r[1]):null;};
  return {ym:`${m[2]}-${String(MES[m[1].toLowerCase()]).padStart(2,'0')}`,total:(neg?-1:1)*Math.abs(num(m[3])),yoy:num(m[4]),
    privReg:sec(/(-?[\d]+,?\d*)\s*% en el sector privado registrado/i),pub:sec(/(-?[\d]+,?\d*)\s*% en el sector p[uú]blico/i),nonReg:sec(/(-?[\d]+,?\d*)\s*% en el sector privado no registrado/i)};
}
async function wagesIndec(){
  const url='https://www.indec.gob.ar/ftp/cuadros/sociedad/indice_salarios.csv';let M=null,src=[],errors=[];
  try{M=parseWagesCsv(await get(url,'text'));src.push('INDEC (CSV oficial)');}catch(e){errors.push(`INDEC: ${String(e?.message||e).slice(0,80)}`);}
  M??=Object.fromEntries(WAGE_KEYS.map(k=>[k,{}]));
  const DA={privReg:'149.1_SOR_PRIADO_OCTU_0_25',pub:'149.1_SOR_PUBICO_OCTU_0_14',totalReg:'149.1_TL_REGIADO_OCTU_0_16',nonReg:'149.1_SOR_PRIADO_OCTU_0_28',total:'149.1_TL_INDIIOS_OCTU_0_21'};
  const lastOf=o=>Object.keys(o||{}).sort().at(-1)||'';
  // Respaldo sólo si el CSV falló o quedó atrás (un pedido con las cinco series).
  try{const j=await get(`${SERIES_API}?ids=${Object.values(DA).join(',')}&start_date=2015-10-01&limit=1000&format=json&metadata=none`,'json');let used=false;
    const keys=Object.keys(DA);for(const r of j?.data||[]){const ym=String(r[0]).slice(0,7);keys.forEach((k,i)=>{const raw=r[i+1],v=Number(raw);if(raw!=null&&Number.isFinite(v)&&v>0&&M[k][ym]==null){M[k][ym]=v;used=true;}});}
    if(used)src.push('Datos Argentina (respaldo)');}catch(e){errors.push(`Datos Argentina: ${String(e?.message||e).slice(0,80)}`);}
  // Mes recién publicado desde el texto del informe (si el CSV todavía no lo tiene).
  let news=null;try{const n=parseWagesNews(await indecNewsText());const prev=n?ymPrev(n.ym):null;
    if(n&&n.ym>lastOf(M.total)&&M.total[prev]){for(const k of ['total','privReg','pub','nonReg'])if(Number.isFinite(n[k])&&M[k][prev])M[k][n.ym]=round(M[k][prev]*(1+n[k]/100),2);news={ym:n.ym,from:'informe INDEC'};src.push('informe de prensa INDEC');}}catch(e){}
  const last=lastOf(M.total);if(!last)throw new Error(errors.join(' · ')||'índice de salarios sin datos');
  return {status:'ok',source:`INDEC — Índice de salarios (base oct-2016=100)${src.length?` · ${src.join(', ')}`:''}`,sourceUrl:'https://www.indec.gob.ar/indec/web/Nivel4-Tema-4-31-61',monthly:M,latest:{ym:last,period:periodEs(last),...(news?.ym===last?{fromNews:true}:{})},...(errors.length?{warnings:errors}:{})};
}
const ymPrev=ym=>{let [y,m]=ym.split('-').map(Number);m--;if(!m){m=12;y--;}return `${y}-${String(m).padStart(2,'0')}`;};
async function salaryRipte(){
  // Serie oficial Datos Argentina: mensual desde julio de 1994. Se completa con la publicación vigente de Seguridad Social.
  const seriesUrl=`https://apis.datos.gob.ar/series/api/series/?ids=158.1_REPTE_0_0_5&start_date=1994-07-01&end_date=${new Date().getUTCFullYear()+1}-12-31&limit=1000&sort=desc&format=json&metadata=none`;
  const officialUrl='https://www.argentina.gob.ar/node/201033';
  const monthly={...(BUNDLED_SOURCES.salary?.monthly||{})}; // v192: base incluida; las fuentes sólo agregan o corrigen meses
  // Recurso CSV oficial completo (1994+). Es la vía primaria porque la API de series puede devolver ventanas parciales.
  const csvUrl='https://infra.datos.gob.ar/catalog/sspm/dataset/158/distribution/158.1/download/remuneracion-imponible-promedio-trabajadores-estables-ripte-total-pais-pesos-serie-mensual.csv';
  try{
    const rows=parseCsv(await get(csvUrl,'text'));
    const h=(rows[0]||[]).map(norm),dc=h.findIndex(x=>/indice_tiempo|fecha|periodo/.test(x)),vc=h.findIndex(x=>/^ripte$|repte/.test(x));
    if(dc>=0&&vc>=0)for(const row of rows.slice(1)){const ym=String(row[dc]||'').slice(0,7),v=numberAR(row[vc]);if(/^\d{4}-\d{2}$/.test(ym)&&Number.isFinite(v)&&v>0&&ym>='1994-07')monthly[ym]=v;}
  }catch(e){}
  // Fallback/complemento: API oficial de series.
  try{
    const j=JSON.parse(await get(seriesUrl,'text'));
    for(const row of (j.data||[])){
      const ym=String(row?.[0]||'').slice(0,7),v=row?.[1]==null||row?.[1]===''?NaN:Number(row?.[1]); // v192: Datos Argentina manda null en meses faltantes (antes pisaba el CSV con 0)
      if(/^\d{4}-\d{2}$/.test(ym)&&Number.isFinite(v)&&v>0&&ym>='1994-07')monthly[ym]=v;
    }
  }catch(e){}
  // La página oficial es la autoridad para los meses más recientes y además evita depender de que el catálogo replique inmediatamente la publicación.
  // v117: la página oficial es opcional; si no responde (frecuente desde Cloudflare) no se pierde la serie ya leída del CSV/API.
  try{
  const text=strip(await get(officialUrl)), monthMap={enero:'01',febrero:'02',marzo:'03',abril:'04',mayo:'05',junio:'06',julio:'07',agosto:'08',septiembre:'09',octubre:'10',noviembre:'11',diciembre:'12'};
  const direct=new RegExp('(Enero|Febrero|Marzo|Abril|Mayo|Junio|Julio|Agosto|Septiembre|Octubre|Noviembre|Diciembre)\\s*\\/?\\s*(20\\d{2}|19\\d{2})\\s*\\$?\\s*([\\d.]+(?:,\\d{1,2})?)','gi');
  let m;while((m=direct.exec(text))){const ym=`${m[2]}-${monthMap[m[1].toLowerCase()]}`,v=Number(m[3].replace(/\./g,'').replace(',','.'));if(ym>='1994-07'&&Number.isFinite(v))monthly[ym]=v;}
  }catch(e){console.warn('RIPTE página oficial',e);}
  const fallback={'2025-01':1234658.40,'2025-02':1310357.80,'2025-03':1363510.33,'2025-04':1402606.61,'2025-05':1428661.30,'2025-06':1468135.75,'2025-07':1510680.81,'2025-08':1530297.32,'2025-09':1551831.75,'2025-10':1593047.33,'2025-11':1611851.61,'2025-12':1633547,'2026-01':1646344.54,'2026-02':1734357.18,'2026-03':1775664.12,'2026-04':1837609.35,'2026-05':1849727.96,'2026-06':1915878.76,'2026-07':1946028.12};for(const [k,v] of Object.entries(fallback))monthly[k]=v;
  const annual={};for(const [ym,v] of Object.entries(monthly).sort())annual[ym.slice(0,4)]=v;
  const k=Object.keys(monthly).sort().at(-1);
  if(Object.keys(monthly).length<200)throw new Error(`RIPTE histórico incompleto (${Object.keys(monthly).length} meses)`);
  return {status:'ok',source:'Secretaría de Seguridad Social / Datos Argentina — RIPTE',sourceUrl:officialUrl,seriesUrl,csvUrl,monthly,annual,coverage:{first:Object.keys(monthly).sort()[0],last:k,count:Object.keys(monthly).length},latest:k?{period:k,value:monthly[k]}:null};
}
async function icl(){
  // BCRA TXT estandarizado: codigo;dd/mm/aaaa;valor. Serie 7988 = ICL (base 30/06/2020 = 1).
  const urls=['https://www.bcra.gob.ar/archivos/Pdfs/PublicacionesEstadisticas/tas5_ser.txt','https://www.bcra.gob.ar/Pdfs/PublicacionesEstadisticas/tas5_ser.txt'];
  let text='',url=urls[0],lastErr=null;
  for(const u of urls){try{text=await get(u,'text');url=u;if(text)break;}catch(e){lastErr=e;}}
  if(!text)throw lastErr||new Error('no se pudo descargar ICL BCRA');
  const daily={};
  for(const line of String(text).split(/\r?\n/)){
    const m=line.trim().match(/^7988;(\d{2})\/(\d{2})\/(\d{4});(-?[0-9]+(?:[.,][0-9]+)?)$/);
    if(!m)continue;
    const [,dd,mm,yyyy,raw]=m,v=Number(raw.replace(',','.'));
    if(!Number.isFinite(v)||+yyyy<2020)continue;
    daily[`${yyyy}-${mm}-${dd}`]=v;
  }
  if(Object.keys(daily).length<365)throw new Error('serie ICL 7988 BCRA no reconocida');
  // La calculadora selecciona mes/año: usa el primer valor disponible de cada mes.
  const monthly={};for(const [d,v] of Object.entries(daily).sort())if(monthly[d.slice(0,7)]==null)monthly[d.slice(0,7)]=v;
  const all=Object.keys(daily).sort(),published=all.at(-1),today=new Date().toISOString().slice(0,10),k=all.filter(d=>d<=today).at(-1);
  return {status:'ok',source:'BCRA — Índice para Contratos de Locación (ICL), serie 7988',sourceUrl:url,daily,monthly,latest:k?{date:k,value:daily[k]}:null,publishedLatest:published?{date:published,value:daily[published]}:null};
}

function parseBcraFlatSeries(text,code){
  const out={};
  const rx=new RegExp(`^${code};(\\d{2})\\/(\\d{2})\\/(\\d{4});(-?[0-9]+(?:[.,][0-9]+)?)$`);
  for(const line of String(text).split(/\r?\n/)){
    const m=line.trim().match(rx); if(!m)continue;
    const v=Number(m[4].replace(',','.')); if(!Number.isFinite(v))continue;
    out[`${m[3]}-${m[2]}-${m[1]}`]=v;
  }
  return out;
}
async function contractIndices(){
  // BCRA tas5_ser.txt: 3540 = CER; 7913 = UVA. Same official flat file used by the ICL adapter.
  const urls=['https://www.bcra.gob.ar/archivos/Pdfs/PublicacionesEstadisticas/tas5_ser.txt','https://www.bcra.gob.ar/Pdfs/PublicacionesEstadisticas/tas5_ser.txt'];
  let text='',used='',lastErr=null;
  for(const u of urls){try{text=await get(u,'text');if(text){used=u;break;}}catch(e){lastErr=e;}}
  if(!text)throw lastErr||new Error('no se pudo descargar tas5_ser.txt BCRA');
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),defs={cer:'3540',uva:'7913'};
  const result={status:'ok',source:'BCRA — CER/UVA, archivo plano tas5_ser.txt'};
  for(const [key,code] of Object.entries(defs)){
    const daily=parseBcraFlatSeries(text,code),valid=Object.entries(daily).filter(([d])=>d<=today).sort(([a],[b])=>a.localeCompare(b));
    if(valid.length<30){result[key]={status:'error',error:`serie ${code} no reconocida`};continue;}
    const monthly={};for(const [d,v] of valid)if(monthly[d.slice(0,7)]==null)monthly[d.slice(0,7)]=v;
    const [k,v]=valid.at(-1),published=Object.keys(daily).sort().at(-1);
    result[key]={status:'ok',seriesCode:code,sourceUrl:used,daily:Object.fromEntries(valid),monthly,latest:{date:k,value:v},publishedLatest:published?{date:published,value:daily[published]}:null};
  }
  return result;
}

async function calendar(){
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const events=[];
  const add=(date,agency,title,category='Estadísticas',status='confirmada',sourceUrl='')=>{if(date>=today)events.push({date,agency,title,category,status,sourceUrl});};

  // BCRA: calendario oficial anual, leído en cada actualización.
  try{
    const text=strip(await get(URLS.calendar));
    const map={ene:'01',feb:'02',mar:'03',abr:'04',may:'05',jun:'06',jul:'07',ago:'08',sep:'09',oct:'10',nov:'11',dic:'12'};
    const rx=/(\d{1,2})\s+(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)\s+(20\d{2})\s+([^0-9]{3,180}?)(?=\s+\d{1,2}\s+(?:ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)\s+20\d{2}|$)/gi;
    let m;while((m=rx.exec(text))){const title=m[4].trim().replace(/\s+/g,' ').slice(0,150);add(`${m[3]}-${map[m[2].toLowerCase()]}-${String(+m[1]).padStart(2,'0')}`,'BCRA',title,/REM|Monetario|Estabilidad|Bancos|Deuda|Cambios|Pagos|Crédito|Inversión|Inclusión/i.test(title)?'Monetaria y financiera':'Estadísticas','confirmada',URLS.calendar);}
  }catch(e){}

  // INDEC: calendario anticipado oficial, segundo semestre 2026 (actualizado 9/9/2026).
  const indec='https://www.indec.gob.ar/ftp/cuadros/publicaciones/calendario_2sem2026.pdf';
  const I={
  '2026-10-01':['Evolución de la distribución del ingreso (EPH). Segundo trimestre de 2026'],
  '2026-10-02':['Medición de la productividad 2016-2025 y stock de capital 2004-2025'],
  '2026-10-06':['Índice de producción industrial pesquero (IPI pesquero). Agosto de 2026'],
  '2026-10-07':['Índice de producción industrial manufacturero (IPI manufacturero). Agosto de 2026','Indicadores de coyuntura de la actividad de la construcción. Agosto de 2026'],
  '2026-10-08':['Índice de producción industrial minero (IPI minero). Agosto de 2026','Indicador sintético de servicios públicos (ISSP). Julio de 2026'],
  '2026-10-13':['Índice de precios al consumidor (IPC). Septiembre de 2026','Índices de patentamientos. Tercer trimestre de 2026','Canasta básica alimentaria (CBA) y total (CBT). Septiembre de 2026'],
  '2026-10-15':['Utilización de la capacidad instalada en la industria (UCII). Agosto de 2026','Cuenta de generación del ingreso e insumo de mano de obra. Segundo trimestre de 2026'],
  '2026-10-16':['Canasta de crianza. Septiembre de 2026','Sistema de índices de precios mayoristas (SIPM). Septiembre de 2026','Índice del costo de la construcción (ICC). Septiembre de 2026'],
  '2026-10-19':['Intercambio comercial argentino (ICA). Septiembre de 2026'],
  '2026-10-20':['Tendencia de negocios: supermercados y autoservicios mayoristas. Expectativas oct-dic 2026','Tendencia de negocios: industria manufacturera. Expectativas oct-dic 2026'],
  '2026-10-21':['Estimador mensual de actividad económica (EMAE). Agosto de 2026','Índice de salarios. Agosto de 2026'],
  '2026-10-22':['Encuesta de supermercados. Agosto de 2026','Encuesta de autoservicios mayoristas. Agosto de 2026','Encuesta nacional de centros de compras. Agosto de 2026'],
  '2026-10-26':['Estadísticas de turismo internacional. Septiembre y tercer trimestre de 2026'],
  '2026-10-28':['INDEC Informa'],
  '2026-10-30':['Dotación de personal de la APN, empresas y sociedades. Septiembre de 2026'],
  '2026-11-03':['Índices de precios y cantidades del comercio exterior. Tercer trimestre de 2026'],
  '2026-11-04':['Condiciones de vida de los hogares (EPH). Primer semestre de 2026','Microdatos EPH. Segundo trimestre de 2026'],
  '2026-11-05':['IPI pesquero. Septiembre de 2026','Argentine Foreign Trade Statistics. Nueve meses de 2026'],
  '2026-11-06':['IPI minero. Septiembre de 2026'],
  '2026-11-09':['IPI manufacturero. Septiembre de 2026','Actividad de la construcción. Septiembre de 2026'],
  '2026-11-11':['Indicador sintético de servicios públicos (ISSP). Agosto de 2026'],
  '2026-11-12':['IPC nacional. Octubre de 2026','CBA y CBT. Octubre de 2026'],
  '2026-11-13':['Índice de salarios. Septiembre de 2026','UCII. Septiembre de 2026'],
  '2026-11-16':['Canasta de crianza. Octubre de 2026'],
  '2026-11-17':['ICC construcción. Octubre de 2026','SIPM. Octubre de 2026'],
  '2026-11-18':['Dosier estadístico por el Día Mundial del Niño'],
  '2026-11-19':['Intercambio comercial argentino (ICA). Octubre de 2026','Tendencia de negocios: supermercados y autoservicios mayoristas. Expectativas nov 2026-ene 2027','Tendencia de negocios: industria manufacturera. Expectativas nov 2026-ene 2027'],
  '2026-11-24':['EMAE. Septiembre de 2026'],
  '2026-11-25':['Encuesta de supermercados. Septiembre de 2026','Encuesta nacional de centros de compras. Septiembre de 2026','Encuesta de autoservicios mayoristas. Septiembre de 2026','Comercios de electrodomésticos y artículos para el hogar. Tercer trimestre de 2026'],
  '2026-11-27':['Industria de maquinaria agrícola. Tercer trimestre de 2026','Turismo internacional. Octubre de 2026'],
  '2026-11-30':['Dotación de personal APN, empresas y sociedades. Octubre de 2026','INDEC Informa'],
  '2026-12-02':['Sistema integrado de estadísticas sociales (SIES). Actualización diciembre 2026'],
  '2026-12-03':['Formación bruta de capital fijo del gobierno general. Año 2025','Cuentas por sectores institucionales: gobierno general. Año 2025','Cuentas por sectores institucionales: sociedades financieras. Año 2025','Cuentas por sectores institucionales: resto del mundo. Año 2025'],
  '2026-12-04':['Accesos a internet. Tercer trimestre de 2026','IPI pesquero. Octubre de 2026'],
  '2026-12-09':['IPI manufacturero. Octubre de 2026','IPI minero. Octubre de 2026','Actividad de la construcción. Octubre de 2026'],
  '2026-12-10':['ISSP. Septiembre de 2026'],
  '2026-12-15':['IPC nacional. Noviembre de 2026','CBA y CBT. Noviembre de 2026'],
  '2026-12-16':['UCII. Octubre de 2026','Informe de avance del nivel de actividad. Tercer trimestre de 2026','Índice de salarios. Octubre de 2026'],
  '2026-12-17':['Canasta de crianza. Noviembre de 2026','ICC construcción. Noviembre de 2026','SIPM. Noviembre de 2026'],
  '2026-12-18':['Intercambio comercial argentino (ICA). Noviembre de 2026','Mercado de trabajo. Tercer trimestre de 2026'],
  '2026-12-21':['Industria farmacéutica. Tercer trimestre de 2026','Indicadores del sector energético. Tercer trimestre de 2026','EMAE. Octubre de 2026'],
  '2026-12-22':['Balanza de pagos, PII y deuda externa. Tercer trimestre de 2026','Tendencia de negocios: supermercados y autoservicios. Expectativas dic 2026-feb 2027','Tendencia de negocios: industria manufacturera. Expectativas dic 2026-feb 2027'],
  '2026-12-23':['Distribución del ingreso (EPH). Tercer trimestre de 2026','Turismo internacional. Noviembre de 2026'],
  '2026-12-28':['Encuesta de supermercados. Octubre de 2026','Encuesta de autoservicios mayoristas. Octubre de 2026','Encuesta nacional de centros de compras. Octubre de 2026'],
  '2026-12-29':['Estadísticas de productos industriales (EPI)'],
  '2026-12-30':['Dotación de personal APN, empresas y sociedades. Noviembre de 2026','INDEC Informa']};
  for(const [d,titles] of Object.entries(I))for(const title of titles)add(d,'INDEC',title,'Estadísticas','confirmada',indec);

  // Ministerio de Economía / Hacienda: calendario oficial de resultado fiscal y recaudación.
  const econ='https://www.argentina.gob.ar/economia/sechacienda/calendariodepublicacion';
  for(const [d,title] of [['2026-10-01','Recaudación tributaria de septiembre'],['2026-10-16','Resultado fiscal de septiembre'],['2026-11-02','Recaudación tributaria de octubre'],['2026-11-16','Resultado fiscal de octubre'],['2026-12-01','Recaudación tributaria de noviembre'],['2026-12-17','Resultado fiscal de noviembre']])add(d,title.startsWith('Recaudación')?'ARCA':'Economía',title,title.startsWith('Recaudación')?'Fiscal y tributaria':'Fiscal y tributaria','confirmada',econ);

  // UTDT: fechas confirmadas del cronograma 2026 del Índice Líder. ICC/EI se monitorean pero sólo se incorporan cuando existe fecha exacta legible.
  const utdt='https://www.utdt.edu/ver_contenido.php?id_contenido=3160&id_item_menu=6230';
  for(const d of ['2026-10-20','2026-11-19','2026-12-22'])add(d,'UTDT','Índice Líder (IL)','Privados','confirmada',utdt);

  // CAMARCO no publica un cronograma anual de fechas futuras: no se proyectan fechas por patrón.
  const unique=new Map();for(const e of events){const k=`${e.date}|${e.agency}|${e.title}`;if(!unique.has(k))unique.set(k,e);}
  const sorted=[...unique.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.agency.localeCompare(b.agency)||a.title.localeCompare(b.title));
  return {status:'ok',source:'Agenda multifuente',sourceUrl:indec,events:sorted,coverage:{agencies:['INDEC','BCRA','Ministerio de Economía','ARCA','UTDT','CAMARCO'],notes:['INDEC: calendario anticipado oficial','BCRA: calendario anual leído automáticamente','Economía/ARCA: calendario fiscal oficial','UTDT: se agregan cronogramas con fecha exacta confirmada','CAMARCO: monitoreado; sin fechas futuras inferidas cuando no hay cronograma oficial']}};
}

async function isacHistorical(){
  // v197: cuadro oficial de INDEC primario; Datos Argentina completa los meses que falten.
  let off=null;try{off=await indecIsac();}catch(e){console.warn('ISAC INDEC',e);}
  const monthly={}; let sourceUrl='';
  let fromApi=false;try{const x=await seriesRows('33.2_I_2004_M_4',{start:'2020-01-01'});sourceUrl=x.url;for(const r of x.rows){const k=String(r.date).slice(0,7);if(/^\d{4}-\d{2}$/.test(k)&&Number.isFinite(Number(r.value)))monthly[k]=Number(r.value)*100;}fromApi=Object.keys(monthly).length>=24;}catch{}  // la API entrega fracción (0,045 = 4,5%)
  if(Object.keys(monthly).length<24){
    try{const x=await bestCsv('sspm-indicador-sintetico-actividad-construccion-isac-base-2004',r=>/valores mensuales|nivel general|isac/i.test(`${r.name||''} ${r.description||''}`)?10:0);sourceUrl=x.url;const rows=parseCsv(x.text),h=rows[0].map(norm),dc=h.findIndex(v=>/indice_tiempo|fecha|periodo/.test(v)),vc=h.findIndex(v=>/isac_variacion_interanual/.test(v));if(dc>=0&&vc>=0)for(const r of rows.slice(1)){const d=String(r[dc]||'').slice(0,7),v=numberAR(r[vc]);if(/^\d{4}-\d{2}$/.test(d)&&Number.isFinite(v))monthly[d]=v;}}catch{}
  }
  if(!Object.keys(monthly).length&&!off)throw new Error('serie ISAC interanual no disponible');
  const pctMonthly=fromApi?monthly:fractionMapToPct(monthly);for(const k of Object.keys(pctMonthly))monthly[k]=round(Number(pctMonthly[k]),1)+0;
  let monthlySaMom;try{monthlySaMom=await saMomFromLevels('33.2_ISAC_SIN_EDAD_0_M_23_56');}catch{}
  if(off){Object.assign(monthly,off.monthlyYoy);monthlySaMom={...(monthlySaMom||{}),...off.monthlySaMom};sourceUrl=off.url;}
  return await addIndecNews({status:'ok',source:off?'INDEC — ISAC (cuadros oficiales; Datos Argentina de respaldo)':'INDEC / Datos Argentina — ISAC (respaldo)',sourceUrl,monthlyYoy:monthly,...(monthlySaMom?{monthlySaMom}:{})},'indicador sint[eé]tico de la actividad de la construcci[oó]n(?: \\(ISAC\\))?').then(o=>withCalendarDate(o,/construcci[oó]n \(ISAC\)/i));
}

async function emaeHistorical(){
  // v114: la tarjeta muestra la variación mensual desestacionalizada (143.3_ICE_SER_VM_2004_A_34) y, abajo, la interanual.
  const [yoyR,saR]=await Promise.allSettled([seriesRows('143.3_ICE_SERVIA_2004_A_25',{start:'2018-01-01'}),seriesRows('143.3_ICE_SER_VM_2004_A_34',{start:'2015-01-01'})]);
  const toPct=rows=>{const m={};for(const r of rows){const k=String(r.date).slice(0,7);if(/^\d{4}-\d{2}$/.test(k)&&Number.isFinite(Number(r.value)))m[k]=Number(r.value);}const p=fractionMapToPct(m);for(const k of Object.keys(p))p[k]=round(Number(p[k]),1)+0;return p;};
  const out={status:'ok',source:'INDEC / Datos Argentina — EMAE (respaldo)'};
  if(yoyR.status==='fulfilled'){out.monthlyYoy=toPct(yoyR.value.rows);out.sourceUrl=yoyR.value.url;}
  if(saR.status==='fulfilled')out.monthlySaMom=toPct(saR.value.rows);
  // v197: cuadro oficial de INDEC (sh_emae_mensual_base2004) primario; Datos Argentina sólo completa.
  try{const off=await indecEmae();out.monthlyYoy={...(out.monthlyYoy||{}),...Object.fromEntries(Object.entries(off.monthlyYoy).filter(([k])=>k>='2018-01'))};out.monthlySaMom={...(out.monthlySaMom||{}),...Object.fromEntries(Object.entries(off.monthlySaMom).filter(([k])=>k>='2015-01'))};out.sourceUrl=off.url;out.source='INDEC — EMAE (cuadros oficiales; Datos Argentina de respaldo)';}catch(e){console.warn('EMAE INDEC',e);}
  // v205: el mes recién publicado (X de INDEC o portada) antes de que llegue el cuadro.
  try{const n=parseIndecNews(await indecNewsText(),'estimador mensual de actividad econ[oó]mica(?: \\(EMAE\\))?');const last=Object.keys(out.monthlyYoy||{}).sort().at(-1);
    if(n&&(!last||n.ym>last)){out.monthlyYoy={...(out.monthlyYoy||{}),[n.ym]:n.yoy};if(n.mom!==null)out.monthlySaMom={...(out.monthlySaMom||{}),[n.ym]:n.mom};out.indecNews={ym:n.ym,source:'INDEC — informe técnico (X / portada)'};}}catch{}
  if(!out.monthlyYoy&&!out.monthlySaMom)throw new Error('series EMAE no disponibles');
  return out;
}


// ===================== v116 · ILA-ARG (CICEc) e IGA-OJF =====================
// ILA: base de datos pública de CICEc (Bolsas de Comercio de Santa Fe y Rosario), hoja "CICEC".
// Columna A = año.mes como número de Excel (ojo: octubre llega como 2026.1), G = ILA nivel, H = tasa mensual, I = interanual, J = índice de difusión.
async function ilaHistorical(){
  let url=null;
  try{const html=await get('https://cicec.ar/base-de-datos');const m=html.match(/href="([^"]*Data_ARG_\d{6}\.xlsx)"/i);if(m)url=new URL(m[1],'https://cicec.ar/').href;}catch{}
  if(!url){const d=new Date();const prev=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()-1,1));url=`https://cicec.ar/sites/default/files/base-datos-${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}/Data_ARG_${prev.getUTCFullYear()}${String(prev.getUTCMonth()+1).padStart(2,'0')}.xlsx`;}
  const c=new AbortController(),tm=setTimeout(()=>c.abort(),25000);
  try{
    const r=await fetch(url,{signal:c.signal,headers:{'user-agent':'Mozilla/5.0 (compatible; Macrodatos/1.0; +https://macrodatos.ar)'}});if(!r.ok)throw new Error(`CICEc ${r.status}`);
    const wb=XLSX.read(await r.arrayBuffer(),{type:'array'});const name=wb.SheetNames.find(n=>/^cicec$/i.test(n.trim()));if(!name)throw new Error('CICEc: hoja CICEC no encontrada');
    const rows=XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,raw:true,defval:null});
    // Ubicar columnas por encabezado (fila con "ILA-ARG"); si no, usar G..J.
    let cL=6,cM=7,cY=8,cD=9;const hdr=rows.find(r=>r&&r.some(v=>/^ILA-ARG$/i.test(String(v??'').trim())));
    if(hdr){cL=hdr.findIndex(v=>/^ILA-ARG$/i.test(String(v??'').trim()));cM=cL+1;cY=cL+2;cD=cL+3;}
    const monthly={};
    for(const r of rows){const a=r?.[0];if(a==null)continue;let y,m;const sA=String(a).trim(),ms=sA.match(/^(\d{4})\.(\d{2})$/);
      if(ms){y=+ms[1];m=+ms[2];}else{const n=Number(a);if(!Number.isFinite(n)||n<1990||n>2100)continue;y=Math.floor(n);m=Math.round((n-y)*100);}
      if(m<1||m>12)continue;const lv=Number(r[cL]);if(r[cL]==null||!Number.isFinite(lv))continue;
      const f=v=>v==null||!Number.isFinite(Number(v))?null:Number(v);const mom=f(r[cM]),yoy=f(r[cY]),dif=f(r[cD]);
      monthly[`${y}-${String(m).padStart(2,'0')}`]={level:round(lv,4),mom:mom===null?null:round(mom*100,2),yoy:yoy===null?null:round(yoy*100,2),diffusion:dif===null?null:round(dif,1)};}
    if(Object.keys(monthly).length<60)throw new Error(`ILA: serie corta (${Object.keys(monthly).length})`);
    return {status:'ok',source:'CICEc — Bolsas de Comercio de Santa Fe y Rosario (ILA-ARG)',sourceUrl:url,monthly};
  }finally{clearTimeout(tm)}
}
// Extracción mínima de texto de PDF (streams Flate + operadores Tj/TJ), sin dependencias.
async function inflatePartial(bytes){const ds=new DecompressionStream('deflate');const w=ds.writable.getWriter();w.write(bytes).catch(()=>{});w.close().catch(()=>{});const rd=ds.readable.getReader();const parts=[];try{while(true){const {done,value}=await rd.read();if(done)break;parts.push(value);}}catch{}let n=0;for(const p of parts)n+=p.length;const o=new Uint8Array(n);let i=0;for(const p of parts){o.set(p,i);i+=p.length;}return o;}
async function pdfTextLines(buf){
  const u8=new Uint8Array(buf),latin=new TextDecoder('latin1'),s=latin.decode(u8),contents=[];
  const re=/<<([^]*?)>>\s*stream\r?\n/g;let m;
  while((m=re.exec(s))){const dict=m[1],start=m.index+m[0].length,L=dict.match(/\/Length\s+(\d+)(?!\s+\d+\s+R)/),end=L?start+Number(L[1]):s.indexOf('endstream',start);re.lastIndex=Math.max(end,start);
    if(!/FlateDecode/.test(dict)||/Length1|Subtype\s*\/Image/.test(dict))continue;const txt=latin.decode(await inflatePartial(u8.slice(start,end)));
    if(txt.length<60000&&/\bBT\r?\n/.test(txt)&&/\bT[Jj]\b/.test(txt))contents.push(txt);}
  const lines=[];
  for(const t of contents){const items=[];let x=0,y=0;const r2=/(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) Tm|(-?[\d.]+) (-?[\d.]+) T[dD]|\[([^\]]*)\] ?TJ|\(((?:\\.|[^\\)])*)\) ?Tj/g;let k;
    while((k=r2.exec(t))){if(k[5]!==undefined){x=+k[5];y=+k[6];}else if(k[7]!==undefined){x+=+k[7];y+=+k[8];}else{const raw=k[9]!==undefined?(k[9].match(/\((?:\\.|[^\\)])*\)/g)||[]).map(z=>z.slice(1,-1)).join(''):k[10];const txt=raw.replace(/\\(\d{3})/g,(_,o)=>String.fromCharCode(parseInt(o,8))).replace(/\\(.)/g,'$1');if(txt.trim())items.push({x,y,txt});}}
    const byY=new Map();for(const it of items){const kk=Math.round(it.y);if(!byY.has(kk))byY.set(kk,[]);byY.get(kk).push(it);}
    for(const [,a] of [...byY.entries()].sort((p,q)=>q[0]-p[0]))lines.push(a.sort((p,q)=>p.x-q.x).map(i=>i.txt).join(' ').replace(/\s+/g,' ').trim());}
  return lines;
}
// IGA: la síntesis pública de OJF (PDF en Google Drive) trae una tabla con los últimos ~37 meses.
async function igaHistorical(){
  let id=null;
  try{const html=await get('https://www.ojf.com/Informes-Libre-Acceso');const i=html.search(/Informe-IGA|IGA-OJF/i);const seg=i>=0?html.slice(i):html;const m=seg.match(/drive\.google\.com\/file\/d\/([A-Za-z0-9_-]{20,})/);if(m)id=m[1];}catch{}
  if(!id)id='14ZK0npNpAWn4m3Ml-XPKcHIBwB92pQHG';
  const url=`https://drive.google.com/uc?export=download&id=${id}`;
  const c=new AbortController(),tm=setTimeout(()=>c.abort(),25000);
  try{
    const r=await fetch(url,{signal:c.signal,redirect:'follow',headers:{'user-agent':'Mozilla/5.0 (compatible; Macrodatos/1.0; +https://macrodatos.ar)'}});if(!r.ok)throw new Error(`IGA PDF ${r.status}`);
    const buf=await r.arrayBuffer();if(new TextDecoder('latin1').decode(new Uint8Array(buf).slice(0,4))!=='%PDF')throw new Error('IGA: la descarga no es un PDF');
    const lines=await pdfTextLines(buf);const M={ene:1,feb:2,mar:3,abr:4,may:5,jun:6,jul:7,ago:8,sep:9,sept:9,set:9,oct:10,nov:11,dic:12};
    const n=v=>Number(String(v).replace(/\./g,'').replace(',','.'));const monthly={};
    for(const l of lines){const m=l.match(/^(ene|feb|mar|abr|may|jun|jul|ago|sept?|set|oct|nov|dic)-(\d{2}) ([\d.,]+) (-?[\d,]+) ?% ([\d.,]+) (-?[\d,]+) ?%/i);if(!m)continue;
      const k=`20${m[2]}-${String(M[m[1].toLowerCase()]).padStart(2,'0')}`;monthly[k]={level:n(m[3]),yoy:n(m[4]),levelSa:n(m[5]),momSa:n(m[6])};}
    if(Object.keys(monthly).length<12)throw new Error(`IGA: tabla no identificada (${Object.keys(monthly).length})`);
    return {status:'ok',source:'Orlando J. Ferreres & Asociados — IGA-OJF',sourceUrl:`https://drive.google.com/file/d/${id}/view`,monthly};
  }finally{clearTimeout(tm)}
}

// v114: variación mensual real s.e. de los préstamos en pesos, según el Informe Monetario Mensual del BCRA.
// v213 · Crédito en pesos al sector privado, variación mensual real sin estacionalidad, del Informe Monetario Mensual del
// BCRA. Primaria: planilla de indicadores del informe (fila "Préstamos al sector privado no financiero", columna
// "Mensual · Real s.e."); el resumen de la página dejó de traer el número (ej. septiembre 2026: sólo "contracción").
// Respaldo: el texto de la página, como antes. También se guarda la fecha de publicación ("Publicado el 7 Oct 2026").
const MES_ABR={ene:1,feb:2,mar:3,abr:4,may:5,jun:6,jul:7,ago:8,sep:9,set:9,oct:10,nov:11,dic:12};
export function parseImmIndicators(rows){
  const hdr=rows.findIndex(r=>(r||[]).some(v=>/^real s\.?\s?e\.?$/i.test(String(v??'').trim())));if(hdr<0)throw new Error('IMM: encabezado "Real s.e." no encontrado');
  const top=rows.slice(0,hdr).reverse().find(r=>(r||[]).some(v=>/^mensual$/i.test(String(v??'').trim())))||[];
  const mCol=top.findIndex(v=>/^mensual$/i.test(String(v??'').trim()));
  let col=-1;for(let c=Math.max(0,mCol);c<(rows[hdr]||[]).length;c++)if(/^real s\.?\s?e\.?$/i.test(String(rows[hdr][c]??'').trim())){col=c;break;}
  if(col<0)throw new Error('IMM: columna mensual real s.e. no encontrada');
  const row=rows.slice(hdr+1).find(r=>/^pr[eé]stamos al sector privado no financiero\s*\d*$/i.test(String(r?.[0]??'').trim()));
  const v=Number(row?.[col]);if(!Number.isFinite(v)||Math.abs(v)>0.5)throw new Error('IMM: valor de préstamos inválido');
  return round(v*100,1)+0;
}
async function immCreditSaMom(){
  const monthsEs=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const now=new Date(),out={},published={};
  const tries=[];for(let i=1;i<=3;i++){const d=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-i,1));tries.push([`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`,monthsEs[d.getUTCMonth()],d.getUTCFullYear()]);}
  await Promise.allSettled(tries.map(async([k,mon,y])=>{
    let html=null,page=null;for(const slug of [`informe-monetario-mensual-${mon}-de-${y}`,`informe-monetario-mensual-${mon}-${y}`]){try{page=await get(`https://www.bcra.gob.ar/publicaciones/${slug}/`);html=strip(page);break;}catch{}}
    const pm=String(html||'').match(/Publicado el (\d{1,2}) (ene|feb|mar|abr|may|jun|jul|ago|sep|set|oct|nov|dic)[a-z]* (20\d{2})/i);
    if(pm)published[k]=`${pm[3]}-${String(MES_ABR[pm[2].toLowerCase()]).padStart(2,'0')}-${pm[1].padStart(2,'0')}`;
    // 1) Planilla de indicadores (link de la página o nombre habitual).
    const urls=[...new Set([...(String(page||'').match(/https?:\/\/www\.bcra\.gob\.ar\/[^"' ]*informe-monetario-mensual-indicadores[^"' ]*\.xlsx/gi)||[]),`https://www.bcra.gob.ar/archivos/Pdfs/PublicacionesEstadisticas/informes/informe-monetario-mensual-indicadores-${k}.xlsx`])];
    for(const url of urls){try{const buf=await get(url,'buf');const wb=XLSX.read(buf,{type:'array',dense:true,cellStyles:false,cellHTML:false,cellFormula:false});
      const name=wb.SheetNames.find(n=>/principales variables/i.test(n))||wb.SheetNames[0];
      out[k]=parseImmIndicators(XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,raw:true,defval:null}));if(!published[k])published[k]=null;return;}catch(e){}}
    // 2) Respaldo: texto de la página.
    if(!html)return;
    const sentences=html.split(/(?<=\.)\s+(?=[A-ZÁÉÍÓÚ])/);
    for(const s of sentences){if(!/(pr[eé]stamos|cr[eé]dito) (?:bancarios? )?en pesos al sector privado/i.test(s)||!/(s\.\s?e|estacionalidad)/i.test(s))continue;
      const m=s.match(/(-?\d{1,2}(?:,\d)?)\s?%/);if(!m)continue;let v=Number(m[1].replace(',','.'));
      if(v>0&&/(ca[ií]d|cay[oe]|contraj|contrac|disminu|merma|retroc)/i.test(s.slice(0,m.index)))v=-v;out[k]=round(v,1)+0;break;}
  }));
  for(const k of Object.keys(published))if(out[k]==null||!published[k])delete published[k];
  return {values:out,published};
}
async function creditHistorical(){
  // v197: BCRA (API de Estadísticas) primario; Datos Argentina de respaldo. v214: var. 117 (préstamos al sector privado EN PESOS);
  // antes se usaba la 26, que suma también los préstamos en dólares convertidos a pesos (crédito bimonetario).
  const [bc,lv,imm]=await Promise.allSettled([bcraDaily(117,'2018-01-01'),seriesRows('91.1_PEFPC_0_0_35',{start:'2019-01-01'}),immCreditSaMom()]);
  const out={status:'ok',source:'BCRA — préstamos al sector privado'};
  if(bc.status==='fulfilled'){const m=monthlyAvg(bc.value),last=Object.keys(bc.value).sort().at(-1);/* v213: el mes en curso nunca se usa (promedio incompleto) */const curM=new Date(Date.now()-3*3600e3).toISOString().slice(0,7);delete m[curM];if(last&&last.slice(0,7)<curM&&Number(last.slice(8))<20)delete m[last.slice(0,7)];out.monthlyYoy=yoyFromRows(Object.entries(m).map(([date,value])=>({date,value})));out.sourceUrl='https://api.bcra.gob.ar/estadisticas/v4.0/monetarias/117';}
  if(lv.status==='fulfilled'){out.monthlyYoy=fillMissing(out.monthlyYoy||{},yoyFromRows(lv.value.rows));out.sourceUrl??=lv.value.url;}
  if(imm.status==='fulfilled'&&Object.keys(imm.value.values).length){out.monthlySaRealMom=imm.value.values;if(Object.keys(imm.value.published).length)out.published=imm.value.published;}
  if(!out.monthlyYoy&&!out.monthlySaRealMom)throw new Error('crédito sin datos');
  return out;
}
async function arrearsFromOfficialWorkbook(){
  // v114: hoja "Calidad de Cartera (por líneas)": secciones "1. Total Sector Privado", "2. Familias - Total", "3. Empresas - Total";
  // en cada una, la fila "Cartera irregular total" y la fila de fechas ("En porcentaje", fechas seriales de Excel).
  const url='https://www.bcra.gob.ar/archivos/Pdfs/PublicacionesEstadisticas/informes/informe-bancos-anexo.xlsx';
  const c=new AbortController(),t=setTimeout(()=>c.abort(),20000);
  try{
    const r=await fetch(url,{signal:c.signal,headers:{'user-agent':'Mozilla/5.0 (compatible; Macrodatos/1.0; +https://macrodatos.ar)'}}); if(!r.ok)throw new Error(`anexo BCRA ${r.status}`);
    // v131: el anexo es un libro grande. Se leen primero sólo los nombres de hoja y después únicamente la hoja
    // necesaria (en modo "dense"), para no superar la memoria por invocación del Worker (error 1102).
    const buf=await r.arrayBuffer();
    const names=XLSX.read(buf,{type:'array',bookSheets:true}).SheetNames||[];
    const name=names.find(n=>/calidad de cartera.*l[ií]neas/i.test(n));if(!name)throw new Error('anexo BCRA: hoja por líneas no encontrada');
    const wb=XLSX.read(buf,{type:'array',sheets:[name],dense:true,cellStyles:false,cellHTML:false,cellFormula:false});
    const rows=XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,raw:true,defval:null});
    const label=i=>String(rows[i]?.[0]??'').trim();
    const ym=v=>{const n=Number(v);if(!Number.isFinite(n)||n<20000)return null;const d=new Date(Date.UTC(1899,11,30)+n*86400000);return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;};
    const section=re=>{const s=rows.findIndex((_,i)=>re.test(label(i)));if(s<0)return {};let dr=-1,vr=-1;for(let i=s+1;i<Math.min(rows.length,s+12);i++){if(dr<0&&/^En porcentaje/i.test(label(i)))dr=i;if(/^Cartera irregular total/i.test(label(i))){vr=i;break;}}if(dr<0||vr<0)return {};const out={};for(let j=1;j<rows[dr].length;j++){const k=ym(rows[dr][j]),v=Number(rows[vr][j]);if(k&&Number.isFinite(v))out[k]=round(v,1)+0;}return out;};
    const total=section(/^1\.\s*Total Sector Privado/i),families=section(/^2\.\s*Familias/i),companies=section(/^3\.\s*Empresas/i);
    if(Object.keys(total).length<36)throw new Error(`anexo BCRA: serie de mora no identificada (${Object.keys(total).length})`);
    return {url,monthlyTotal:total,monthlyFamilies:families,monthlyCompanies:companies};
  }finally{clearTimeout(t)}
}
async function arrearsHistorical(){
  // v113: base oficial mensual (Datos Argentina 332.2_SISTEMA_FIADA__53) + anexo xlsx + últimos Informes sobre Bancos.
  const total={}; let sourceUrl='https://www.bcra.gob.ar/informe-sobre-bancos/'; let latest=null;
  try{const x=await seriesRows('332.2_SISTEMA_FIADA__53',{start:'2019-01-01'});for(const r of x.rows){const k=String(r.date).slice(0,7);if(/^\d{4}-\d{2}$/.test(k)&&Number.isFinite(r.value)&&r.value>0&&r.value<40)total[k]=round(r.value,1);}sourceUrl=x.url;}catch(e){console.warn('mora serie oficial',e);}
  const families={},companies={};
  try{const x=await arrearsFromOfficialWorkbook();Object.assign(total,x.monthlyTotal);Object.assign(families,x.monthlyFamilies);Object.assign(companies,x.monthlyCompanies);sourceUrl=x.url;}catch(e){console.warn('anexo BCRA mora',e);}
  // Meses recientes calculados dinámicamente (el informe se publica con ~2 meses de rezago).
  const monthsEs=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const now=new Date(),recent=[];
  for(let i=1;i<=8;i++){const d=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-i,1));recent.push([`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`,monthsEs[d.getUTCMonth()],d.getUTCFullYear()]);}
  const num=s=>Number(String(s).replace(',','.'));
  const rs=await Promise.allSettled(recent.map(async([k,mon,y])=>{
    const url=`https://www.bcra.gob.ar/publicaciones/informe-sobre-bancos-${mon}-de-${y}/`;const html=strip(await get(url));
    const m=html.match(/(?:ratio de )?irregularidad (?:del cr[eé]dito|de las financiaciones) al sector privado[^%]{0,300}?(?:ubic[oó]|ubicarse|alcanz[oó]|ascendi[oó]|totaliz[oó])[^0-9]{0,80}(\d{1,2}(?:[,.]\d+)?)%/i);
    if(!m)throw new Error(`mora ${k}`);
    const fam=html.match(/familias[^0-9%]{0,60}(\d{1,2}(?:[,.]\d+)?)%/i);
    const emp=html.match(/empresas[^0-9%]{0,60}(\d{1,2}(?:[,.]\d+)?)%/i);
    return {k,total:num(m[1]),families:fam?num(fam[1]):null,companies:emp?num(emp[1]):null};
  }));
  for(const r of rs)if(r.status==='fulfilled'){const v=r.value;total[v.k]=round(v.total,1);if(Number.isFinite(v.families))families[v.k]=round(v.families,1);if(Number.isFinite(v.companies))companies[v.k]=round(v.companies,1);if(!latest||v.k>latest.k)latest=v;}
  if(Object.keys(total).length<24)throw new Error(`histórico de mora insuficiente: ${Object.keys(total).length}`);
  const out={status:'ok',source:'BCRA — Informe sobre Bancos (Anexo)',sourceUrl,monthlyTotal:total,monthlyFamilies:families,monthlyCompanies:companies};
  if(!latest){const k=Object.keys(total).sort().at(-1);if(k&&Number.isFinite(families[k])&&Number.isFinite(companies[k]))latest={k,total:total[k],families:families[k],companies:companies[k]};}
  if(latest&&Number.isFinite(latest.families)&&Number.isFinite(latest.companies))out.latest={period:periodEs(latest.k),total:round(latest.total,1),families:round(latest.families,1),companies:round(latest.companies,1)};
  return out;
}

// v113: resultado fiscal acumulado en el año como % del PIB nominal.
// IMIG mensual (primario y financiero) / PIB INDEC a precios corrientes (trimestres anualizados: se promedian).
// Para el año en curso, el PIB se estima con el PIB del año anterior × variación de los trimestres ya publicados.
async function fiscalPctGdp(){
  // v187: desde 2021; base incluida (fiscal-base.mjs) + lo que devuelva la API. Financiero = primario − intereses
  // cuando la serie de resultado financiero viene sin el mes.
  const [pr,fr,ir,gr,og]=await Promise.allSettled([
    seriesRows('452.3_RESULTADO_RIO_0_M_18_54',{start:'2021-01-01'}),
    seriesRows('452.3_RESULTADO_ERO_0_M_20_25',{start:'2021-01-01'}),
    seriesRows('452.3_INTERESES_TOS_0_M_15_62',{start:'2021-01-01'}),
    seriesRows('4.4_OGP_2004_T_17',{start:'2020-01-01'}),indecPib(8)]);
  const toMap=x=>x.status==='fulfilled'?Object.fromEntries(x.value.rows.map(r=>[String(r.date).slice(0,7),Number(r.value)]).filter(([k,v])=>/^\d{4}-\d{2}$/.test(k)&&Number.isFinite(v))):{};
  // v197: prioridad oficial — comunicado de Hacienda > IMIG (base incluida, Secretaría de Hacienda) > Datos Argentina;
  // PIB nominal: cuadro 8 de INDEC > base incluida > Datos Argentina.
  const offQ={};if(og.status==='fulfilled')for(const [k,v] of Object.entries(og.value.quarters)){const [y,q]=k.split('-Q');offQ[`${y}-${String(q*3-2).padStart(2,'0')}`]=v;}
  const P=fillMissing({...FISCAL_BASE.primary},toMap(pr)),I=fillMissing({...FISCAL_BASE.interest},toMap(ir)),Q=fillMissing({...FISCAL_BASE.gdpQ,...offQ},toMap(gr)),F=toMap(fr);
  // v196: el mes recién publicado (comunicado de Hacienda) antes de que llegue a Datos Argentina.
  let news={};try{news=await fiscalFromNews();}catch(e){console.warn('fiscal comunicado',e);}
  for(const [k,n] of Object.entries(news)){P[k]=n.primary;I[k]=n.interest;F[k]=n.financial;}
  // Financiero = primario − intereses (identidad del IMIG); la serie de Datos Argentina sólo cubre lo que falte.
  for(const k of Object.keys(P))if(news[k]==null&&Number.isFinite(I[k])&&Number.isFinite(P[k]))F[k]=P[k]-I[k];
  const qm=['01','04','07','10'];
  const gdpYear=y=>{const qs=qm.map(m=>Q[`${y}-${m}`]);if(qs.every(Number.isFinite))return qs.reduce((a,b)=>a+b,0)/4;const prevYear=qm.map(m=>Q[`${y-1}-${m}`]);if(!prevYear.every(Number.isFinite))return null;const base=prevYear.reduce((a,b)=>a+b,0)/4;const idx=qs.map((v,i)=>Number.isFinite(v)?i:-1).filter(i=>i>=0);if(!idx.length)return null;return base*idx.reduce((a,i)=>a+qs[i],0)/idx.reduce((a,i)=>a+prevYear[i],0);};
  const primary={},financial={};const years=[...new Set(Object.keys(P).map(k=>Number(k.slice(0,4))))].sort();
  for(const y of years){const g=gdpYear(y);if(!g)continue;let cp=0,cf=0;for(let m=1;m<=12;m++){const k=`${y}-${String(m).padStart(2,'0')}`;if(!Number.isFinite(P[k])||!Number.isFinite(F[k]))break;cp+=P[k];cf+=F[k];primary[k]=round(cp/g*100,2);financial[k]=round(cf/g*100,2);}}
  const last=Object.keys(primary).sort().at(-1);if(!last)throw new Error('resultado fiscal sin datos');
  const nl=news[last];return {period:periodEs(last),...(nl?{newsSource:{ym:last,published:nl.published,url:nl.url}}:{}),source:'Secretaría de Hacienda — IMIG y comunicados mensuales; PIB nominal INDEC (Datos Argentina de respaldo)',sourceUrl:nl?.url||'https://www.argentina.gob.ar/economia/sechacienda/informacion-fiscal',historyPctGDP:{primary,financial}};
}
// v113: esta función faltaba y hacía fallar TODO /api/macro-data (ReferenceError).
// Devuelve sólo lo que puede refrescarse en vivo; el resto proviene del snapshot incluido (bundled-history.mjs).
async function activityPulse(){
  const out={status:'ok',source:'Economía / AFCP / INDEC / ACARA / BCRA'};
  // v117: ISAC y mora se toman de sus propias fuentes (mismo grupo) en el handler; aquí no se vuelven a descargar.
  const [fiscal,credit]=await Promise.allSettled([fiscalPctGdp(),immCreditSaMom()]);
  if(credit.status==='fulfilled'){const e=Object.entries(credit.value.values||{}).sort(([a],[b])=>a.localeCompare(b)).at(-1);if(e)out.creditLatest={ym:e[0],period:periodEs(e[0]),arsRealMom:e[1]};}
  if(fiscal.status==='fulfilled')out.fiscal=fiscal.value;
  return out;
}

// sin KV se conserva al menos durante la vida del isolate y el frontend mantiene otra copia local.
let MEMORY_SNAPSHOT=null;
const SNAPSHOT_PREFIX='macro:snapshot:v131:';
const MEMORY_SNAPSHOTS={};
function isPlainObject(v){return !!v&&typeof v==='object'&&!Array.isArray(v);}
// v179 · Repara snapshots guardados antes del arreglo de nulls (Datos Argentina → 0): completa la industria con la
// serie anual incluida y reemplaza en comercio exterior los años en 0 o faltantes por la tabla anual completa.
function repairHistorical(S){
  const I=S?.industryHistorical;if(I&&typeof I==='object'){I.annual={...(I.annual||{})};for(const [y,v] of Object.entries(INDUSTRY_ANNUAL))if(!Number.isFinite(Number(I.annual[y])))I.annual[y]=v;}
  // v192: RIPTE guardado con meses en 0 (null de Datos Argentina): se reemplazan por la serie incluida y se recalcula el anual (último mes de cada año).
  const R=S?.salary;if(R&&typeof R==='object'&&R.monthly){const B=BUNDLED_SOURCES.salary?.monthly||{},m={};let bad=false;
    for(const [k,v] of Object.entries(R.monthly)){if(Number(v)>0)m[k]=Number(v);else{bad=true;if(Number(B[k])>0)m[k]=Number(B[k]);}}
    for(const [k,v] of Object.entries(B))if(m[k]==null&&Number(v)>0){m[k]=Number(v);bad=true;}
    if(bad){R.monthly=Object.fromEntries(Object.entries(m).sort(([a],[b])=>a.localeCompare(b)));const an={};for(const [k,v] of Object.entries(R.monthly))an[k.slice(0,4)]=v;R.annual=an;}}
  const T=S?.tradeHistorical;if(T&&typeof T==='object'){let fixed=false;
    for(const k of ['exports','imports','balance']){T[k]={...(T[k]||{})};for(const [y,v] of Object.entries(TRADE_ANNUAL[k])){const c=Number(T[k][y]);if(!Number.isFinite(c)||c===0){T[k][y]=v;fixed=true;}}}
    if(fixed&&T.real?.baseIndex){const cpi=usCpiAnnual(),b=T.real.baseIndex;for(const k of ['exports','imports','balance']){T.real[k]={...(T.real[k]||{})};for(const y of Object.keys(T[k]))if(cpi[y])T.real[k][y]=round(T[k][y]*b/cpi[y],1);}}}
}
function mergeSnapshot(oldValue,newValue){
  if(Array.isArray(oldValue)||Array.isArray(newValue)){
    const a=Array.isArray(oldValue)?oldValue:[],b=Array.isArray(newValue)?newValue:[];
    // Series [{date,...}]: merge by month/date so a shorter refresh can never truncate the baseline.
    if([...a,...b].every(x=>x&&typeof x==='object'&&!Array.isArray(x)&&x.date)){
      const by=new Map(a.map(x=>[String(x.date).slice(0,7),x]));
      for(const x of b)by.set(String(x.date).slice(0,7),{...(by.get(String(x.date).slice(0,7))||{}),...x});
      return [...by.values()].sort((x,y)=>String(x.date).localeCompare(String(y.date)));
    }
    return b.length>=a.length?b:a;
  }
  // v215: un valor simple nuevo reemplaza a un objeto viejo (antes se conservaba el objeto, y un dato mal guardado no se corregía nunca).
  if(isPlainObject(oldValue)&&newValue!==null&&newValue!==undefined&&typeof newValue!=='object')return newValue;
  if(isPlainObject(oldValue)||isPlainObject(newValue)){
    const out={...(isPlainObject(oldValue)?oldValue:{})};
    for(const [k,v] of Object.entries(isPlainObject(newValue)?newValue:{})){
      if(v===null||v===undefined||v==='')continue;
      out[k]=mergeSnapshot(out[k],v);
    }
    return out;
  }
  return newValue===null||newValue===undefined?oldValue:newValue;
}
async function readSnapshot(env,group){
  if(env?.MACRO_STORE?.get){try{const x=await env.MACRO_STORE.get(SNAPSHOT_PREFIX+group,'json');if(x?.sources)return x;}catch{}}
  return MEMORY_SNAPSHOTS[group]||null;
}
// v125: con KV activo, el plan gratuito permite 1.000 escrituras por día. Sólo se escribe si los datos
// cambiaron y como máximo una vez cada 20 minutos por grupo (la revisión programada siempre puede escribir).
function snapshotHash(sources){const t=JSON.stringify(sources||{},(k,v)=>/^(snapshotFallback|refreshError|generatedAt|checkedAt|fetchedAt)$/.test(k)?undefined:v);let h=2166136261;for(let i=0;i<t.length;i++){h^=t.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0).toString(36)+':'+t.length;}
async function writeSnapshot(env,ctx,snapshot,group,stored=null,force=false){
  MEMORY_SNAPSHOTS[group]=snapshot;
  if(!env?.MACRO_STORE?.put)return 'memory';
  const hash=snapshotHash(snapshot.sources);
  if(stored?.hash===hash)return 'unchanged';
  if(!force&&stored?.savedAt&&Date.now()-Date.parse(stored.savedAt)<20*60*1000)return 'throttled';
  const savedAt=new Date().toISOString();
  const job=env.MACRO_STORE.put(SNAPSHOT_PREFIX+group,JSON.stringify({...snapshot,hash,savedAt}),{metadata:{savedAt,hash}});
  if(ctx?.waitUntil&&!force)ctx.waitUntil(job.catch(()=>{}));else{try{await job}catch{return 'error'}}
  return 'kv';
}
// ===================== v122 · Balanza de pagos (INDEC) =====================
// INDEC publica la balanza de pagos trimestral completa en SDMX-ML (estructura IMF BOP 1.8):
// https://www.indec.gob.ar/ftp/cuadros/economia/BOP.xml (2006-T1 en adelante, se reemplaza en cada publicación).
// Se recorren sólo los encabezados <Series> (≈420) y se leen las observaciones de las series necesarias.
const BOP_URL='https://www.indec.gob.ar/ftp/cuadros/economia/BOP.xml';
const BOP_WANT={ // clave: [REF_SECTOR, ACCOUNTING_ENTRY, INT_ACC_ITEM, FUNCTIONAL_CAT, INSTR_ASSET|null]
  CA:['S1','B','CA','_Z',null],G:['S1','B','G','_Z',null],S:['S1','B','S','_Z',null],IN1:['S1','B','IN1','_Z',null],IN2:['S1','B','IN2','_Z',null],
  KA:['S1','B','KA','_Z',null],FA:['S1','N','FA','_T','F'],EO:['S1','N','EO','_Z',null],RES:['S121','A','FA','R','F']
};
export function parseBopXml(t){
  const out={};let prepared=null;const pm=t.match(/<message:Prepared>([^<]+)</);if(pm)prepared=pm[1].slice(0,10);
  let pos=0;
  while(true){
    const i=t.indexOf('<Series ',pos);if(i<0)break;const j=t.indexOf('>',i);const head=t.slice(i+8,j);const end=t.indexOf('</Series>',j);pos=end<0?j:end;
    const a={};for(const m of head.matchAll(/(\w+)="([^"]*)"/g))a[m[1]]=m[2];
    if(a.FREQ!=='Q'||a.COUNTERPART_AREA!=='W1'||a.UNIT_MEASURE!=='USD')continue;
    for(const [k,[sec,acc,item,cat,inst]] of Object.entries(BOP_WANT)){
      if(out[k]||a.REF_SECTOR!==sec||a.ACCOUNTING_ENTRY!==acc||a.INT_ACC_ITEM!==item||a.FUNCTIONAL_CAT!==cat||(inst&&a.INSTR_ASSET!==inst))continue;
      const mult=10**(Number(a.UNIT_MULT||6)-6),q={};
      for(const o of t.slice(j,end).matchAll(/TIME_PERIOD="(\d{4})-Q([1-4])" OBS_VALUE="(-?[\d.eE+-]+)"/g)){const v=Number(o[3])*mult;if(Number.isFinite(v))q[`${o[1]}-Q${o[2]}`]=Math.round(v*10)/10;}
      if(Object.keys(q).length)out[k]=q;
    }
    if(end<0)break;
  }
  return {prepared,series:out};
}
async function bopHistorical(){
  const c=new AbortController(),tm=setTimeout(()=>c.abort(),25000);
  try{
    const r=await fetch(BOP_URL,{signal:c.signal,headers:{'user-agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36','accept':'application/xml,text/xml,*/*'}});
    if(!r.ok)throw new Error(`INDEC BOP ${r.status}`);
    const {prepared,series}=parseBopXml(await r.text());
    if(!series.CA||Object.keys(series.CA).length<20)throw new Error('INDEC BOP: cuenta corriente no encontrada');
    const last=Object.keys(series.CA).sort().at(-1);
    return {status:'ok',source:'INDEC — Balanza de pagos (SDMX)',url:BOP_URL,prepared,latest:last,quarterly:series};
  }finally{clearTimeout(tm);}
}
// v117: el endpoint se divide en grupos. Cloudflare limita los pedidos externos por invocación
// (50 en el plan gratuito); con todas las fuentes juntas se superaban (66+) y las últimas fallaban.
// Cada grupo queda holgadamente por debajo del límite y tiene su propio snapshot.

// v169 · Consumo en supermercados (INDEC, Encuesta de supermercados): índice de ventas a precios constantes.
// Cuadro 1 de serie_supermercados.xlsx: período | serie original | var. i.a. | var. acumulada | — | desestacionalizada | var. mensual | — | tendencia | var.
async function supermarkets(){
  const url='https://www.indec.gob.ar/ftp/cuadros/economia/serie_supermercados.xlsx';
  const c=new AbortController(),tm=setTimeout(()=>c.abort(),25000);
  try{
    const r=await fetch(url,{signal:c.signal,headers:{'user-agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'}});
    if(!r.ok)throw new Error(`Supermercados xlsx ${r.status}`);
    const lm=r.headers.get('last-modified'),published=lm&&!Number.isNaN(Date.parse(lm))?new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires'}).format(new Date(lm)):null;
    const wb=XLSX.read(await r.arrayBuffer(),{type:'array',cellDates:true,sheets:['Cuadro 1']});
    const ws=wb.Sheets['Cuadro 1']||wb.Sheets[wb.SheetNames.find(n=>/cuadro\s*1\b/i.test(n))];if(!ws)throw new Error('Supermercados: no está el Cuadro 1');
    const rows=XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:null});
    const num=v=>typeof v==='number'&&Number.isFinite(v)?v:null,r2=v=>Math.round(v*100)/100;
    const ymOf=v=>{if(v instanceof Date)return `${v.getUTCFullYear()}-${String(v.getUTCMonth()+1).padStart(2,'0')}`;if(typeof v==='number'&&v>20000){const d=new Date(Math.round((v-25569)*864e5));return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;}return null;};
    const monthlyYoy={},ytd={},monthlySaMom={},index={},saIndex={};
    for(const row of rows){const ym=ymOf(row[0]);if(!ym)continue;
      // Columnas numéricas en orden (se saltean las vacías de separación).
      // Columnas fijas; si INDEC quita la columna vacía de separación, se corren una posición.
      const P=(row[4]==null&&num(row[5])!==null)?[1,2,3,5,6]:[1,2,3,4,5];const [orig,yoy,acc,sa,mom]=P.map(i=>num(row[i]));
      if(orig!==null&&orig!==undefined)index[ym]=Math.round(orig*1000)/1000;if(yoy!=null)monthlyYoy[ym]=r2(yoy);if(acc!=null)ytd[ym]=r2(acc);if(sa!=null)saIndex[ym]=Math.round(sa*1000)/1000;if(mom!=null)monthlySaMom[ym]=r2(mom);}
    const last=Object.keys(monthlyYoy).sort().at(-1);if(!last)throw new Error('Supermercados: sin datos');
    return {status:'ok',source:'INDEC — Encuesta de supermercados (ventas a precios constantes)',sourceUrl:'https://www.indec.gob.ar/indec/web/Nivel4-Tema-3-1-34',monthlyYoy,ytd,monthlySaMom,index,saIndex,latest:{ym:last,published}};
  }finally{clearTimeout(tm);}
}
// v207 · Compras netas de divisas del BCRA (variación de reservas por compra de divisas, API de Estadísticas var. 78,
// diaria desde ene-2003, millones de USD): sumas mensuales.
async function bcraPurchasesHistorical(){
  // v208: + compras netas al Tesoro Nacional (var. 48, efecto monetario en millones de $, convertido a USD con el tipo
  // de cambio mayorista Com. A 3500 del mismo día, var. 5). Total = mercado (sector privado) + Tesoro.
  const [d,t,fx]=await Promise.all([bcraDaily(78,'2003-01-01'),bcraDaily(48,'2003-01-01').catch(()=>({})),bcraDaily(5,'2003-01-01').catch(()=>({}))]);
  const monthly={},treasury={};
  for(const [k,v] of Object.entries(d)){const m=k.slice(0,7);monthly[m]=(monthly[m]||0)+Number(v);}
  const fxk=Object.keys(fx).sort();let j=0,last=null;
  for(const k of Object.keys(t).sort()){const v=Number(t[k]);while(j<fxk.length&&fxk[j]<=k){last=fx[fxk[j]];j++;}if(!v||!last)continue;const m=k.slice(0,7);treasury[m]=(treasury[m]||0)+v/last;}
  for(const k of Object.keys(monthly)){monthly[k]=round(monthly[k],1)+0;if(Object.keys(t).length)treasury[k]=round(treasury[k]||0,1)+0;}
  if(Object.keys(monthly).length<200)throw new Error('compras BCRA: serie corta');
  return {status:'ok',source:'BCRA — compras netas de divisas: sector privado (var. 78, USD) y Tesoro Nacional (var. 48, $ convertidos al mayorista A3500)',sourceUrl:'https://api.bcra.gob.ar/estadisticas/v4.0/monetarias/78',lastDay:Object.keys(d).sort().at(-1),monthly,...(Object.keys(treasury).length?{treasury}:{})};
}
const JOBS={wages:()=>wagesIndec(),bcraPurchasesHistorical:()=>bcraPurchasesHistorical(),supermarkets:()=>supermarkets(),scentia:()=>scentiaLive(),ipcHistorical:()=>ipcHistorical(),gdpHistorical:()=>gdpHistorical(),emaeHistorical:()=>emaeHistorical(),industryHistorical:()=>industryHistorical(),unemploymentHistorical:()=>unemploymentHistorical(),tradeHistorical:()=>tradeHistorical(),financialHistorical:()=>financialHistorical(),exchangeHistorical:()=>exchangeHistorical(),ipc:()=>ipc(),arca:()=>arca(),icg:()=>icg(),bcra:()=>bcra(),rem:()=>rem(),salary:()=>salaryRipte(),icl:()=>icl(),contractIndices:()=>contractIndices(),isacHistorical:()=>isacHistorical(),creditHistorical:()=>creditHistorical(),arrearsHistorical:()=>arrearsHistorical(),activityPulse:()=>activityPulse(),ilaHistorical:()=>ilaHistorical(),igaHistorical:()=>igaHistorical(),bopHistorical:()=>bopHistorical(),autos:()=>autosLive(),ipcCaba:()=>ipcCabaLive(),poverty:()=>povertyLive(),cement:()=>cementLive(),came:()=>cameLive()};
export const GROUPS={
  core:['ipc','arca','icg','bcra','rem','salary','wages','icl','contractIndices','autos','ipcCaba','came'],
  history:['ipcHistorical','gdpHistorical','industryHistorical','unemploymentHistorical','tradeHistorical'],
  markets:['financialHistorical','exchangeHistorical'],
  activity:['emaeHistorical','isacHistorical','creditHistorical','activityPulse','cement','supermarkets','scentia'],
  banks:['arrearsHistorical','bcraPurchasesHistorical'], // v131: grupo propio (anexo xlsx del BCRA, pesado en memoria)
  leading:['ilaHistorical','igaHistorical'],
  external:['bopHistorical','poverty'] // v122/v128: XML de INDEC y pobreza en un grupo propio
};
// v128: estado de frescura de todas las tarjetas (lee el último snapshot de cada grupo).
// Sin fusiones profundas (cuidan la CPU de la revisión programada): se toma el último período de cada tarjeta
// tanto en el snapshot guardado como en la línea de base, y se queda con el más nuevo.
// v134 · "Último dato publicado" para la portada: se calcula con la misma función del navegador
// (public/releases.js) sobre los snapshots guardados y se guarda chico en KV (release:latest).
const RELEASE_KEY='release:latest:v198';
const CARD_ORDER=[['ipi','IPI manufacturero','INDEC'],['isac','ISAC construcción','INDEC'],['cement','Despachos de cemento','AFCP'],['came','Ventas minoristas pyme','CAME'],['super','Consumo en supermercados','INDEC'],['scentia','Consumo masivo','Scentia'],['arca','Recaudación','ARCA'],['autos','Patentamientos 0 km','ACARA'],['bop','Balanza de pagos','INDEC'],['icg','Confianza gobierno','UTDT'],['ila','Índice Líder (ILA)','CICEc'],['poverty','Pobreza','INDEC'],['iga','IGA','OJF'],['emae','EMAE','INDEC'],['credit','Crédito privado','BCRA'],['arrears','Mora bancaria','BCRA'],['trade','Balanza comercial','INDEC'],['fiscal','Resultado fiscal','Economía'],['wages','Índice de salarios','INDEC'],['ipcCaba','Inflación CABA','IDECBA'],['ipc','Inflación nacional','INDEC']];
const MES_CORTO=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
export function topCardRelease(R,seen={}){
  const rows=[];
  CARD_ORDER.forEach(([key,name,agency],order)=>{const c=CARDS.find(x=>x.key===key);if(!c)return;let p=null;try{p=c.latest(R);}catch{}const ym=p?periodEndYm(p):null;if(!ym)return;
    const pub=cardPublication(key,ym,R,seen);if(!pub)return;rows.push({key,name,agency,order,ym,period:p,pub});});
  rows.sort((a,b)=>b.pub.date.localeCompare(a.pub.date)||b.ym.localeCompare(a.ym)||a.order-b.order);
  const t=rows[0];if(!t)return null;
  const per=/^\d{4}-\d{2}$/.test(t.period)?`${MES_CORTO[+t.period.slice(5)-1]} ${t.period.slice(0,4)}`:String(t.period).replace(/^(\d{4})-Q([1-4])$/,'$2T $1').replace(/^(\d{4})-S([12])$/,'$2S $1');
  const [y,m,d]=t.pub.date.split('-');
  return {title:`${t.name} · ${t.agency}`,value:'',date:t.pub.basis==='habitual'?`Período ${per}`:`Publicado ${+d} ${MES_CORTO[+m-1]} ${y} · período ${per}`,sortKey:t.pub.date,key:t.key,fromGrid:true};
}
let RELEASE_MEMO=null;
export async function latestReleaseFor(env,ctx=null,opts={}){
  if(!opts.force&&RELEASE_MEMO&&Date.now()-RELEASE_MEMO.at<60000)return RELEASE_MEMO.value;
  let cached=null;
  if(!opts.force){try{const r=await env?.MACRO_STORE?.getWithMetadata?.(RELEASE_KEY,'json');if(r?.value){cached=r.value;if(Date.now()-(r.metadata?.savedAt||0)<10*60*1000){RELEASE_MEMO={at:Date.now(),value:cached};return cached;}}}catch{}}
  const compute=async()=>{
    // v198: el "Último dato publicado" es la primera tarjeta del tablero (el mismo orden que usa el navegador:
    // fecha de publicación, después período más nuevo y orden original). El valor lo completa el navegador.
    const R={...BUNDLED_SOURCES};
    for(const g of Object.keys(GROUPS)){const snap=await readSnapshot(env,g);if(snap?.sources)Object.assign(R,snap.sources);}
    let seen={};try{seen=await cardsSeen(env);}catch{}
    const value=topCardRelease(R,seen);
    if(value){RELEASE_MEMO={at:Date.now(),value};if(env?.MACRO_STORE?.put&&(!cached||JSON.stringify(cached)!==JSON.stringify(value)||opts.force)){try{await env.MACRO_STORE.put(RELEASE_KEY,JSON.stringify(value),{metadata:{savedAt:Date.now()}});}catch{}}}
    return value;
  };
  // Con un dato guardado (aunque tenga más de 10 min) se responde ya y se recalcula en segundo plano.
  if(cached&&ctx?.waitUntil){ctx.waitUntil(compute().catch(()=>{}));RELEASE_MEMO={at:Date.now(),value:cached};return cached;}
  return await compute();
}
// v138 · Cuando una revisión detecta que una tarjeta pasó a un período nuevo, se guarda ese día como fecha de
// publicación observada (KV cards:seen). Sirve para ordenar el tablero por fecha de publicación.
async function recordSeen(env,ctx,group,prevSources,outSources){
  if(!env?.MACRO_STORE?.get||!env.MACRO_STORE.put)return;
  const cards=CARDS.filter(c=>c.group===group);if(!cards.length)return;
  let seen={};try{seen=(await env.MACRO_STORE.get('cards:seen','json'))||{};}catch{}
  let changed=false;
  for(const c of cards){let a=null,b=null;try{a=c.latest(prevSources||{});}catch{}try{b=c.latest(outSources||{});}catch{}
    const ea=a?periodEndYm(a):null,eb=b?periodEndYm(b):null;
    if(ea&&eb&&eb>ea&&seen[c.key]?.ym!==eb){seen[c.key]={ym:eb,date:todayAR()};changed=true;}}
  if(changed){const job=env.MACRO_STORE.put('cards:seen',JSON.stringify(seen));if(ctx?.waitUntil)ctx.waitUntil(job.catch(()=>{}));else{try{await job;}catch{}}}
}
export async function cardsSeen(env){try{return (await env?.MACRO_STORE?.get?.('cards:seen','json'))||{};}catch{return {};}}
export async function freshnessReport(env){
  const snaps={};
  for(const g of Object.keys(GROUPS)){const snap=await readSnapshot(env,g);if(snap?.sources)Object.assign(snaps,snap.sources);}
  return cardStatus([snaps,BUNDLED_SOURCES]);
}
// v203 · Marcas efímeras en la caché del edge (no gastan escrituras de KV): "revisado hace poco" y "actualizando".
const EDGE=typeof caches!=='undefined'&&caches?.default?caches.default:null;
const edgeKey=k=>new Request(`https://macrodatos.ar/__edge/${k}`);
async function edgeHas(k){try{return !!(EDGE&&await EDGE.match(edgeKey(k)));}catch{return false;}}
async function edgeMark(k,sec){try{if(EDGE)await EDGE.put(edgeKey(k),new Response('1',{headers:{'cache-control':`max-age=${sec}`}}));}catch{}}
const FRESH_MS=10*60*1000;
const macroData=async(env={},ctx=null,request=null,opts={})=>{
  let group='all';try{const g=new URL(request?.url||'http://x/').searchParams.get('group');if(g&&GROUPS[g])group=g;}catch{}
  const names=group==='all'?Object.keys(JOBS):GROUPS[group];
  // v203 · Siempre responde al instante con el último snapshot guardado (KV), sin importar su antigüedad. Si tiene
  // más de 10 minutos y nadie lo revisó hace poco, se actualiza en segundo plano (ctx.waitUntil); la próxima consulta
  // del navegador (que vuelve a preguntar sola) ya recibe el dato nuevo. Antes, pasados 15 minutos, la visita
  // esperaba la actualización completa (~10 s) y mientras tanto se veían los datos viejos.
  if(!opts.force&&group!=='all'&&env?.MACRO_STORE?.getWithMetadata){
    try{const {value,metadata}=await env.MACRO_STORE.getWithMetadata(SNAPSHOT_PREFIX+group,'text');
      if(value&&metadata?.savedAt){
        const age=Date.now()-Date.parse(metadata.savedAt);
        let state='kv';
        if(age>=FRESH_MS&&!(await edgeHas(`checked/${group}`))){
          state='kv-stale';
          if(ctx?.waitUntil&&!(await edgeHas(`refreshing/${group}`))){
            await edgeMark(`refreshing/${group}`,120);
            ctx.waitUntil(macroData(env,null,request,{force:true,background:true}).catch(e=>console.log(`refresh ${group}: ${e?.message||e}`)));
          }
        }
        return new Response(value,{status:200,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-cache','access-control-allow-origin':'*','x-macrodatos-cache':state,'x-macrodatos-age':String(Math.round(age/1000))}});
      }
    }catch{}
  }
  const stored=await readSnapshot(env,group);
  const bundled={};for(const n of names)if(BUNDLED_SOURCES[n])bundled[n]=BUNDLED_SOURCES[n];
  const previous=mergeSnapshot({version:131,sources:bundled},stored||{});
  const out={version:131,group,generatedAt:new Date().toISOString(),snapshotMode:env?.MACRO_STORE?.get?'kv+bundled':'bundled+isolate',sources:{}};
  try{INDEC_X_TEXT=await indecXText(env);}catch{}
  const results=await Promise.allSettled(names.map(n=>Promise.resolve().then(JOBS[n])));
  results.forEach((j,i)=>{
    const name=names[i],old=previous?.sources?.[name];
    if(j.status==='fulfilled'){const m=mergeSnapshot(old,j.value);if(m&&typeof m==='object'){delete m.refreshError;delete m.snapshotFallback;if(j.value&&!('idecbaError' in j.value))delete m.idecbaError;if(name==='ipcCaba'&&j.value){if(!('baseError' in j.value))delete m.baseError;if(j.value.latest)m.latest=j.value.latest;}}out.sources[name]=m;}
    else if(old){out.sources[name]={...old,status:old.status==='error'?'snapshot':'ok',snapshotFallback:true,refreshError:String(j.reason?.message||j.reason)};}
    else out.sources[name]={status:'error',error:String(j.reason?.message||j.reason)};
  });
  for(const [name,old] of Object.entries(previous?.sources||{}))if(!out.sources[name])out.sources[name]=old;
  repairHistorical(out.sources);
  // v210: datos cargados a mano desde la pestaña "Sitio" (sólo el administrador).
  try{const OV=await readOverrides(env);const manual={};for(const g of group==='all'?Object.keys(GROUPS):[group])Object.assign(manual,applyOverrides(out.sources,g,OV.entries,stored?.manual));if(Object.keys(manual).length)out.manual=manual;}catch(e){console.warn('datos manuales',e);}
  alignCards(out.sources);
  try{await recordSeen(env,ctx,group,previous?.sources,out.sources);}catch{}
  const ok=Object.values(out.sources).some(x=>x.status==='ok'||x.status==='snapshot');
  if(ok)out.stored=await writeSnapshot(env,ctx,out,group,stored,!!opts.force);
  // Revisado: aunque no haya cambiado nada (y por eso no se reescriba KV), no se vuelve a revisar por 10 minutos.
  if(ok&&group!=='all')await edgeMark(`checked/${group}`,FRESH_MS/1000);
  return new Response(JSON.stringify(out),{status:ok?200:503,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-cache','access-control-allow-origin':'*'}});
};
export default macroData;
// v210 · Al guardar o borrar un dato manual se aplica enseguida sobre el snapshot guardado (sin esperar la próxima
// actualización de las fuentes) y se recalcula el "Último dato publicado".
export async function applyOverridesNow(env,group){
  if(!GROUPS[group])return 'grupo inválido';
  const stored=await readSnapshot(env,group);if(!stored?.sources)return 'sin snapshot';
  const OV=await readOverrides(env,{fresh:true});
  const snap=JSON.parse(JSON.stringify(stored));delete snap.hash;delete snap.savedAt;
  const manual=applyOverrides(snap.sources,group,OV.entries,stored.manual);if(Object.keys(manual).length)snap.manual=manual;else delete snap.manual;
  alignCards(snap.sources);
  const r=await writeSnapshot(env,null,snap,group,stored,true);
  try{await latestReleaseFor(env,null,{force:true});}catch{}
  return r;
}
// Tarjetas: alinear ISAC, mora y crédito con sus series (mismo grupo "activity").
function alignCards(sources){
  const out={sources};
  const AP=out.sources.activityPulse;
  if(AP){
    const lastOf=o=>Object.entries(o||{}).filter(([k,v])=>/^\d{4}-\d{2}$/.test(k)&&Number.isFinite(Number(v))).sort(([a],[b])=>a.localeCompare(b)).at(-1);
    const iy=lastOf(out.sources.isacHistorical?.monthlyYoy);
    if(iy&&AP.isac&&iy[0]>(AP.isac.ym||'')){const sa=out.sources.isacHistorical?.monthlySaMom?.[iy[0]];AP.isac={...AP.isac,ym:iy[0],period:periodEs(iy[0]),yoy:iy[1],mom:Number.isFinite(Number(sa))?Number(sa):null};}
    const A=out.sources.arrearsHistorical;const at=lastOf(A?.monthlyTotal);
    if(at&&(!AP.arrears||at[0]>(AP.arrears.ym||ymFromPeriodEs(AP.arrears.period)||''))){const f=A.monthlyFamilies?.[at[0]],c=A.monthlyCompanies?.[at[0]];AP.arrears={...(AP.arrears||{}),ym:at[0],period:periodEs(at[0]),total:at[1],families:Number.isFinite(Number(f))?Number(f):null,companies:Number.isFinite(Number(c))?Number(c):null};}
    /* v214/v215: un AP.credit o creditLatest inválido (v213 guardó uno roto) se reemplaza */const okCr=x=>x&&/^\d{4}-\d{2}$/.test(String(x.ym||''))&&Number.isFinite(Number(x.arsRealMom));if(AP.credit&&!okCr(AP.credit))AP.credit={source:'BCRA',ym:''};if(AP.creditLatest&&!okCr(AP.creditLatest))delete AP.creditLatest;
    {const H=sources.creditHistorical?.monthlySaRealMom,k=Object.keys(H||{}).filter(x=>/^\d{4}-\d{2}$/.test(x)&&Number.isFinite(Number(H[x]))).sort().at(-1);if(k&&(!AP.creditLatest||k>AP.creditLatest.ym))AP.creditLatest={ym:k,period:periodEs(k),arsRealMom:Number(H[k])};}
    if(AP.creditLatest&&AP.credit&&AP.creditLatest.ym>(AP.credit.ym||'')){AP.credit={source:AP.credit.source,ym:AP.creditLatest.ym,period:AP.creditLatest.period,arsRealMom:AP.creditLatest.arsRealMom};}
  }
}
function ymFromPeriodEs(s){const m=String(s||'').match(/(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)[a-z]*\s+(20\d{2})/i);if(!m)return null;const i=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'].indexOf(m[1].toLowerCase());return `${m[2]}-${String(i+1).padStart(2,'0')}`;}
export const readSnapshotFor=(env,g)=>readSnapshot(env,g);

// v212 · "La economía cuando naciste": extensión automática de public/birth-economy.json (que se arma a mano cada tanto).
// Últimos 24 meses de: IPC (índice; el navegador lo encadena), IPC de EE.UU., dólar oficial y libre (promedio mensual de
// los cierres diarios), RIPTE y precios promedio de INDEC (GBA) de los bienes de la tabla "¿Cuánto costaba?".
// Precios: archivo sh_ipc_precios_promedio.xls de INDEC (primaria; incluye el mes recién publicado) y series 105.1 de
// Datos Argentina (respaldo). `f` = factor de unidad (manteca: INDEC 200 g → 1 kg; café: INDEC 500 g → 250 g).
const BIRTH_PRICES={bread:['pan frances tipo flauta','105.1_I2PFF_2016_M_27',1],beef:['asado','105.1_I2A_2016_M_14',1],milk:['leche fresca entera','105.1_I2LFES_2016_M_35',1],
  sugar:['azucar','105.1_I2A_2016_M_15',1],flour:['harina de trigo comun','105.1_I2HTC_2016_M_27',1],rice:['arroz blanco simple','105.1_I2ABS_2016_M_28',1],butter:['manteca','105.1_I2M_2016_M_16',5],
  eggs:['huevos de gallina','105.1_I2HG_2016_M_23',1],yerba:['yerba mate','105.1_I2YM_2016_M_19',1],coffee:['cafe molido','105.1_I2CM_2016_M_20',.5],wine:['vino comun','105.1_I2VC_2016_M_19',1],
  oil15:['aceite de girasol','105.1_I2AG_2016_M_23',1],chicken:['pollo entero','105.1_I2PE_2016_M_21',1],potato:['papa','105.1_I2P_2016_M_13',1]};
export async function birthExtension(env){
  const now=new Date(Date.now()-3*3600e3),from=`${now.getUTCFullYear()-2}-${String(now.getUTCMonth()+1).padStart(2,'0')}`;
  const recent=o=>Object.fromEntries(Object.entries(o||{}).filter(([k,v])=>/^\d{4}-\d{2}$/.test(k)&&k>=from&&Number.isFinite(Number(v))&&Number(v)>0).map(([k,v])=>[k,Number(v)]).sort(([a],[b])=>a.localeCompare(b)));
  const out={generatedAt:new Date().toISOString(),cpi:{},usCpi:{},fx:{},fxFree:{},ripte:{},prices:{},sources:{},errors:[]};
  const [core,mk]=await Promise.all([readSnapshot(env,'core'),readSnapshot(env,'markets')]);
  const S={...(BUNDLED_SOURCES||{}),...(core?.sources||{}),...(mk?.sources||{})};
  out.cpi=recent(Object.fromEntries((S.ipc?.monthly||[]).map(r=>[String(r.date).slice(0,7),Number(r.index)])));
  out.ripte=recent(S.salary?.monthly);
  const avg=daily=>{const a={};for(const [d,v] of Object.entries(daily||{})){if(!/^\d{4}-\d{2}-\d{2}$/.test(d)||!(Number(v)>0))continue;(a[d.slice(0,7)]??=[]).push(Number(v));}return Object.fromEntries(Object.entries(a).map(([k,xs])=>[k,round(xs.reduce((s,x)=>s+x,0)/xs.length,2)]));};
  out.fx=recent(avg(S.exchangeHistorical?.official?.daily?.nominal));out.fxFree=recent(avg(S.exchangeHistorical?.free?.daily?.nominal));
  try{out.usCpi=recent((await usCpiMonthly())?.monthly);}catch(e){out.errors.push(`IPC EE.UU.: ${String(e?.message||e).slice(0,80)}`);}
  // Precios promedio: INDEC (archivo) y Datos Argentina para lo que falte.
  let ip=null;try{ip=await indecAvgPrices();out.sources.prices=`INDEC — precios promedio GBA (${ip.end})`;}catch(e){out.errors.push(`INDEC precios: ${String(e?.message||e).slice(0,100)}`);}
  for(const [key,[name,,f]] of Object.entries(BIRTH_PRICES)){
    const k=ip?Object.keys(ip.prices).find(n=>n===name||n.startsWith(name+' ')||n.startsWith(name+',')):null;
    if(k)out.prices[key]=Object.fromEntries(Object.entries(recent(ip.prices[k])).map(([m,v])=>[m,round(v*f,2)]));
  }
  try{const ids=Object.values(BIRTH_PRICES).map(x=>x[1]);const j=await get(`${SERIES_API}?ids=${ids.join(',')}&start_date=${from}-01&limit=1000&format=json&metadata=none`,'json');
    Object.keys(BIRTH_PRICES).forEach((key,i)=>{const f=BIRTH_PRICES[key][2];for(const r of j?.data||[]){const v=Number(r[i+1]),ym=String(r[0]).slice(0,7);if(r[i+1]==null||!(v>0))continue;(out.prices[key]??={})[ym]??=round(v*f,2);}});
    out.sources.pricesBackup='Datos Argentina (serie 105.1)';}catch(e){out.errors.push(`Datos Argentina precios: ${String(e?.message||e).slice(0,80)}`);}
  for(const k of Object.keys(out.prices))out.prices[k]=Object.fromEntries(Object.entries(out.prices[k]).sort(([a],[b])=>a.localeCompare(b)));
  return out;
}

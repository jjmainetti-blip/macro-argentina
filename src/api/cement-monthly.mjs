const AFCP='https://afcp.info/ESTADISTICAS/DATOS-DEFINITIVOS';
function urlFor(y,m){const ym=`${y}${String(m).padStart(2,'0')}`;return `${AFCP}/${ym}${y>=2022?'-ProDesp':''}/estadistica02.html`;}
function textify(html){return String(html).replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&[a-z]+;/gi,' ').replace(/\s+/g,' ');}
function pct(s){const n=Number(String(s).replace(',','.'));return Number.isFinite(n)?n:null;}
function yoyFromPage(text,y){const re=new RegExp(`${y}\\s*\\/\\s*${y-1}\\s+([+-]?\\d+(?:[.,]\\d+)?)\\s*%`,'i');const m=text.match(re);return m?pct(m[1]):null;}
function nextMonth(period){let [y,m]=period.split('-').map(Number);m++;if(m===13){m=1;y++;}return [y,m];}
function monthKey(y,m){return `${y}-${String(m).padStart(2,'0')}`;}
// v140: AFCP publica primero las cifras PROVISORIAS (afcp.info/ESTADISTICAS/DESPACHO-MENSUAL/PAAAAMM/PAAAAMM.html,
// enlazadas desde afcp.org.ar/despacho-mensual, en los primeros días del mes) y semanas después las DEFINITIVAS.
// Se prueba primero la definitiva y, si todavía no existe, la provisoria: así el dato entra ni bien se publica.
const AFCP_PROV='https://afcp.info/ESTADISTICAS/DESPACHO-MENSUAL';
const MESES=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const numAR=s=>Number(String(s).replace(/\./g,'').replace(',','.'));
export function parseProvisional(text,y,m){
  const t=String(text).replace(/\s+/g,' ');
  const d=t.indexOf('DESPACHO'),c=t.indexOf('CONSUMO',d>=0?d:0);const block=d>=0?t.slice(d,c>d?c:undefined):t;
  const yy=block.match(/Var\.\s*A[ñn]o anterior\s+([+-]?\d+(?:,\d+)?)\s*%/i);if(!yy)return null;
  const row=block.match(new RegExp(`${MESES[m-1]}\\s+${y}\\s+((?:[\\d.]+\\s+){5}[\\d.]+)`,'i'));
  const nums=row?row[1].trim().split(/\s+/).map(numAR):null;
  return {yoy:pct(yy[1]),tons:nums&&Number.isFinite(nums[4])?nums[4]:null};
}
const fetchOpts={headers:{'user-agent':'Macrodatos/1.0 (+https://macrodatos.ar)'},cf:{cacheTtl:900,cacheEverything:true}};
export async function one(y,m){
  const u=urlFor(y,m); const r=await fetch(u,fetchOpts);
  if(r.ok){const v=yoyFromPage(textify(await r.text()),y);if(Number.isFinite(v))return {period:monthKey(y,m),yoy:v,source:'AFCP',sourceUrl:u,status:'definitivo'};}
  else if(r.status!==404)throw new Error(`${r.status} ${u}`);
  const ym=`${y}${String(m).padStart(2,'0')}`,pu=`${AFCP_PROV}/P${ym}/P${ym}.html`;
  const rp=await fetch(pu,fetchOpts);if(rp.status===404)return null;if(!rp.ok)throw new Error(`${rp.status} ${pu}`);
  const p=parseProvisional(textify(await rp.text()),y,m);
  return p&&Number.isFinite(p.yoy)?{period:monthKey(y,m),yoy:p.yoy,tons:p.tons,source:'AFCP (cifras provisorias)',sourceUrl:pu,status:'provisorio'}:null;
}
export default async(request)=>{
  const u=new URL(request.url),after=/^\d{4}-(0[1-9]|1[0-2])$/.test(u.searchParams.get('after')||'')?u.searchParams.get('after'):(()=>{const d=new Date();d.setUTCMonth(d.getUTCMonth()-3);return d.toISOString().slice(0,7);})();
  let [y,m]=nextMonth(after); const now=new Date(); const maxY=now.getUTCFullYear(),maxM=now.getUTCMonth()+1; const fresh=[];
  // Sólo meses posteriores al histórico local; máximo 3 subrequests por visita.
  for(let i=0;i<3 && (y<maxY || (y===maxY&&m<=maxM));i++){
    try{const x=await one(y,m);if(x)fresh.push(x);else break;}catch{break;}
    m++;if(m===13){m=1;y++;}
  }
  return new Response(JSON.stringify({status:'ok',after,fresh,observations:fresh.length,source:'AFCP — Despacho Nacional de Cemento'}),{headers:{'content-type':'application/json; charset=utf-8','cache-control':'public, max-age=900, s-maxage=900, stale-while-revalidate=1800','access-control-allow-origin':'*'}});
};

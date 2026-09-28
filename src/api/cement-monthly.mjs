const AFCP='https://afcp.info/ESTADISTICAS/DATOS-DEFINITIVOS';
function urlFor(y,m){
  const ym=`${y}${String(m).padStart(2,'0')}`;
  return `${AFCP}/${ym}${y>=2022?'-ProDesp':''}/estadistica02.html`;
}
function textify(html){return String(html).replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&[a-z]+;/gi,' ').replace(/\s+/g,' ');}
function pct(s){const n=Number(String(s).replace(',','.'));return Number.isFinite(n)?n:null;}
function yoyFromPage(text,y){
  // La primera tasa después de "AAAA / AAAA-1" corresponde a Despacho Nacional · Del Mes.
  const re=new RegExp(`${y}\\s*\\/\\s*${y-1}\\s+([+-]?\\d+(?:[.,]\\d+)?)\\s*%`,'i');
  const m=text.match(re); return m?pct(m[1]):null;
}
async function one(y,m){
  const u=urlFor(y,m),r=await fetch(u,{headers:{'user-agent':'MacroArgentinaDashboard/6.0'},cf:{cacheTtl:86400,cacheEverything:true}});
  if(!r.ok)throw new Error(`${r.status} ${u}`);
  const v=yoyFromPage(textify(await r.text()),y); if(!Number.isFinite(v))throw new Error(`sin variación ${y}-${m}`);
  return [`${y}-${String(m).padStart(2,'0')}`,v];
}
export default async(request)=>{
  const u=new URL(request.url),year=Number(u.searchParams.get('year'));
  if(!Number.isInteger(year)||year<2021||year>2026)return new Response(JSON.stringify({status:'error',error:'year inválido'}),{status:400,headers:{'content-type':'application/json'}});
  const first=year===2021?9:1,last=year===2026?8:12;
  const jobs=[];for(let m=first;m<=last;m++)jobs.push(one(year,m));
  const settled=await Promise.allSettled(jobs),monthlyYoy={};
  for(const x of settled)if(x.status==='fulfilled')monthlyYoy[x.value[0]]=x.value[1];
  const expected=last-first+1,observations=Object.keys(monthlyYoy).length;
  return new Response(JSON.stringify({status:observations===expected?'ok':'partial',year,monthlyYoy,observations,expected,failed:expected-observations,source:'AFCP — Despacho Nacional de Cemento, variación interanual mensual',sourceUrl:'https://www.afcp.org.ar/copia-de-produccion-de-cemento-y-cl'}),{status:200,headers:{'content-type':'application/json; charset=utf-8','cache-control':'public, max-age=21600, s-maxage=21600, stale-while-revalidate=86400','access-control-allow-origin':'*'}});
};

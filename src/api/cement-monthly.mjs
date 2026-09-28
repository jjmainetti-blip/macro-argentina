const AFCP='https://afcp.info/ESTADISTICAS/DATOS-DEFINITIVOS';
function urlFor(y,m){
  const ym=`${y}${String(m).padStart(2,'0')}`;
  return `${AFCP}/${ym}${y>=2023?'-ProDesp':''}/estadistica02.html`;
}
function textify(html){return String(html).replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&[a-z]+;/gi,' ').replace(/\s+/g,' ');}
function firstDispatch(text,year){
  const i=text.search(new RegExp(`Año\\s+${year}\\b`,'i')); if(i<0)return null;
  const chunk=text.slice(i,i+700);
  const m=chunk.match(/Año\s+\d{4}\s+([\d.]{5,})/i); if(!m)return null;
  const n=Number(m[1].replace(/\./g,'')); return Number.isFinite(n)?n:null;
}
async function one(y,m){
  const u=urlFor(y,m),r=await fetch(u,{headers:{'user-agent':'MacroArgentinaDashboard/4.0'},cf:{cacheTtl:21600,cacheEverything:true}});
  if(!r.ok)throw new Error(`${r.status} ${u}`); const t=textify(await r.text());
  return {y,m,url:u,cur:firstDispatch(t,y),prev:firstDispatch(t,y-1)};
}
export default async()=>{
  const jobs=[];
  for(let m=1;m<=12;m++)jobs.push(one(2023,m)); // aporta 2022 y 2023
  for(let m=1;m<=12;m++)jobs.push(one(2025,m)); // aporta 2024 y 2025
  for(let m=1;m<=8;m++)jobs.push(one(2026,m));  // aporta ene-ago 2026
  for(let m=9;m<=12;m++)jobs.push(one(2022,m)); // completa sep-dic 2021
  const settled=await Promise.allSettled(jobs),tons={};
  for(const j of settled){if(j.status!=='fulfilled')continue;const {y,m,cur,prev}=j.value,k=String(m).padStart(2,'0');if(Number.isFinite(prev))tons[`${y-1}-${k}`]=prev;if(Number.isFinite(cur))tons[`${y}-${k}`]=cur;}
  const periods=Object.keys(tons).sort().slice(-60),monthlyTons=Object.fromEntries(periods.map(k=>[k,tons[k]])),monthlyYoy={};
  for(const k of periods){const p=`${Number(k.slice(0,4))-1}${k.slice(4)}`;if(Number.isFinite(tons[p])&&tons[p]!==0)monthlyYoy[k]=Math.round(((tons[k]/tons[p])-1)*1000)/10;}
  const ok=Object.keys(monthlyYoy).length>=48;
  return new Response(JSON.stringify({status:ok?'ok':'partial',source:'AFCP — Despacho de Cemento y Consumo del Mercado Interno',sourceUrl:'https://www.afcp.org.ar/copia-de-produccion-de-cemento-y-cl',monthlyTons,monthlyYoy,observations:Object.keys(monthlyYoy).length,failed:settled.filter(x=>x.status==='rejected').length}),{status:200,headers:{'content-type':'application/json; charset=utf-8','cache-control':'public, max-age=21600, s-maxage=21600, stale-while-revalidate=86400','access-control-allow-origin':'*'}});
};

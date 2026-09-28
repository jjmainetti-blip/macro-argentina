const AFCP='https://afcp.info/ESTADISTICAS/DATOS-DEFINITIVOS';
function urlFor(y,m){
  const ym=`${y}${String(m).padStart(2,'0')}`;
  return `${AFCP}/${ym}${y>=2023?'-ProDesp':''}/estadistica02.html`;
}
function textify(html){return String(html).replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&[a-z]+;/gi,' ').replace(/\s+/g,' ');}
function num(s){const n=Number(String(s).replace(/\./g,'').replace(',','.'));return Number.isFinite(n)?n:null;}
function dispatchForYear(text,year){
  const re=new RegExp(`(?:Año\\s*)?${year}\\b([\\s\\S]{0,320})`,'i'),m=text.match(re); if(!m)return null;
  const vals=[...m[1].matchAll(/\b(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d{6,7}(?:,\d+)?)\b/g)].map(x=>num(x[1])).filter(n=>n>=300000&&n<=2000000);
  return vals.length?vals[0]:null;
}
async function page(y,m){
  const u=urlFor(y,m),r=await fetch(u,{headers:{'user-agent':'MacroArgentinaDashboard/5.0'},cf:{cacheTtl:21600,cacheEverything:true}});
  if(!r.ok)throw new Error(`${r.status} ${u}`); return {m,text:textify(await r.text()),url:u};
}
export default async()=>{
  // Cada ficha mensual de AFCP contiene la comparación del mismo mes para varios años.
  // 12 requests bastan para reconstruir 2020-2026 y calcular 60 variaciones i.a.
  const jobs=[]; for(let m=1;m<=8;m++)jobs.push(page(2026,m)); for(let m=9;m<=12;m++)jobs.push(page(2025,m));
  const settled=await Promise.allSettled(jobs),tons={};
  for(const j of settled){if(j.status!=='fulfilled')continue;const {m,text}=j.value,k=String(m).padStart(2,'0');for(let y=2020;y<=2026;y++){if(y===2026&&m>8)continue;const v=dispatchForYear(text,y);if(Number.isFinite(v))tons[`${y}-${k}`]=v;}}
  const all=Object.keys(tons).sort(); const monthlyYoy={};
  for(const k of all){const p=`${Number(k.slice(0,4))-1}${k.slice(4)}`;if(Number.isFinite(tons[p])&&tons[p]!==0)monthlyYoy[k]=Math.round(((tons[k]/tons[p])-1)*1000)/10;}
  const yoyKeys=Object.keys(monthlyYoy).sort().slice(-60), levelKeys=Object.keys(tons).sort().slice(-72);
  const outYoy=Object.fromEntries(yoyKeys.map(k=>[k,monthlyYoy[k]])),outLevels=Object.fromEntries(levelKeys.map(k=>[k,tons[k]]));
  const continuous=yoyKeys.length===60&&yoyKeys.every((k,i)=>!i||(()=>{const a=yoyKeys[i-1],d=new Date(`${a}-01T00:00:00Z`);d.setUTCMonth(d.getUTCMonth()+1);return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`===k;})());
  return new Response(JSON.stringify({status:continuous?'ok':'partial',source:'AFCP — Despacho de Cemento y Consumo del Mercado Interno',sourceUrl:'https://www.afcp.org.ar/copia-de-produccion-de-cemento-y-cl',monthlyLevels:outLevels,monthlyYoy:outYoy,levelObservations:levelKeys.length,observations:yoyKeys.length,continuous,first:yoyKeys[0]||null,last:yoyKeys.at(-1)||null,failed:settled.filter(x=>x.status==='rejected').length}),{status:200,headers:{'content-type':'application/json; charset=utf-8','cache-control':'public, max-age=21600, s-maxage=21600, stale-while-revalidate=86400','access-control-allow-origin':'*'}});
};

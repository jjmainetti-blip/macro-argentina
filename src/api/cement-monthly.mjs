const AFCP='https://afcp.info/ESTADISTICAS/DATOS-DEFINITIVOS';
function urlFor(y,m){const ym=`${y}${String(m).padStart(2,'0')}`;return `${AFCP}/${ym}${y>=2022?'-ProDesp':''}/estadistica02.html`;}
function textify(html){return String(html).replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&[a-z]+;/gi,' ').replace(/\s+/g,' ');}
function pct(s){const n=Number(String(s).replace(',','.'));return Number.isFinite(n)?n:null;}
function yoyFromPage(text,y){const re=new RegExp(`${y}\\s*\\/\\s*${y-1}\\s+([+-]?\\d+(?:[.,]\\d+)?)\\s*%`,'i');const m=text.match(re);return m?pct(m[1]):null;}
function nextMonth(period){let [y,m]=period.split('-').map(Number);m++;if(m===13){m=1;y++;}return [y,m];}
function monthKey(y,m){return `${y}-${String(m).padStart(2,'0')}`;}
export async function one(y,m){
  const u=urlFor(y,m); const r=await fetch(u,{headers:{'user-agent':'Macrodatos/1.0 (+https://macrodatos.ar)'},cf:{cacheTtl:1800,cacheEverything:true}});
  if(r.status===404)return null; if(!r.ok)throw new Error(`${r.status} ${u}`);
  const v=yoyFromPage(textify(await r.text()),y); return Number.isFinite(v)?{period:monthKey(y,m),yoy:v,source:'AFCP',sourceUrl:u}:null;
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

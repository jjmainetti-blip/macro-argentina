const API='https://apis.datos.gob.ar/series/api/series/';
const ID='74.3_ISC_0_M_19';
export default async function tradeMonthly(){
  const end=new Date();
  const start=new Date(Date.UTC(end.getUTCFullYear()-5,end.getUTCMonth()-1,1));
  const iso=d=>d.toISOString().slice(0,10);
  const url=`${API}?ids=${ID}&start_date=${iso(start)}&end_date=${iso(new Date(Date.UTC(end.getUTCFullYear()+1,11,31)))}&limit=1000&format=json`;
  const c=new AbortController(); const t=setTimeout(()=>c.abort(),8000);
  try{
    const r=await fetch(url,{signal:c.signal,headers:{accept:'application/json','user-agent':'Macrodatos/1.0 (+https://macrodatos.ar)'}});
    if(!r.ok)throw new Error(`Series API ${r.status}`);
    const j=await r.json(); const monthly={};
    for(const row of (j?.data||[])){
      const k=String(row?.[0]||'').slice(0,7),v=Number(row?.[1]);
      if(/^\d{4}-(0[1-9]|1[0-2])$/.test(k)&&Number.isFinite(v))monthly[k]=Number(v.toFixed(2));
    }
    const keys=Object.keys(monthly).sort().slice(-60); const data=Object.fromEntries(keys.map(k=>[k,monthly[k]]));
    if(keys.length<55)throw new Error(`Serie mensual incompleta: ${keys.length} observaciones`);
    return new Response(JSON.stringify({status:'ok',source:'INDEC / Datos Argentina',seriesId:ID,count:keys.length,from:keys[0],to:keys.at(-1),monthlyBalance:data}),{headers:{'content-type':'application/json; charset=utf-8','cache-control':'public, max-age=3600, s-maxage=21600, stale-while-revalidate=86400'}});
  }catch(e){return new Response(JSON.stringify({status:'error',error:String(e?.message||e)}),{status:502,headers:{'content-type':'application/json; charset=utf-8'}})}finally{clearTimeout(t)}
}

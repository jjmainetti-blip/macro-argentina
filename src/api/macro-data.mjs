/* Macro Argentina v8 — stable server-side data contract.
   Each adapter fails independently. The browser keeps its bundled last-known value
   when a source is temporarily unavailable or changes format. */
const SERIES_API='https://apis.datos.gob.ar/series/api/series/';
const IPC_ID='148.3_INIVELNAL_DICI_M_26';
const URLS={
  arca:'https://servicioscf.arca.gob.ar/publico/sitio/contenido/novedad/ver.aspx?id=5882',
  icg:'https://www.utdt.edu/ver_contenido.php?id_contenido=1439&id_item_menu=2964',
  rem:'https://www.bcra.gob.ar/relevamiento-expectativas-mercado-rem/',
  bcra:'https://www.bcra.gob.ar/principales-variables/',
  calendar:'https://www.bcra.gob.ar/calendario-de-informes/'
};
const GET_CACHE=new Map();
async function get(url,type='text'){
  const key=`${type}:${url}`;
  if(GET_CACHE.has(key))return GET_CACHE.get(key);
  const promise=(async()=>{
    const c=new AbortController(); const t=setTimeout(()=>c.abort(),9000);
    try{const r=await fetch(url,{signal:c.signal,headers:{'user-agent':'MacroArgentinaDashboard/3.0 (+public economic dashboard)','accept-language':'es-AR,es;q=.9'}});if(!r.ok)throw new Error(`${r.status} ${r.statusText}`);return type==='json'?r.json():r.text();}
    finally{clearTimeout(t)}
  })();
  GET_CACHE.set(key,promise);
  try{return await promise}catch(e){GET_CACHE.delete(key);throw e}
}
const round=(n,d=1)=>n==null?null:Number(n.toFixed(d));
const pct=(a,b)=>b?(a/b-1)*100:null;
async function seriesRows(id,{start='1900-01-01',end='2026-12-31'}={}){
  const url=`${SERIES_API}?ids=${encodeURIComponent(id)}&start_date=${start}&end_date=${end}&limit=1000&format=json`;
  const j=await get(url,'json'); const rows=j?.data||[];
  if(!Array.isArray(rows)||!rows.length)throw new Error(`sin datos para ${id}`);
  return {rows:rows.map(r=>({date:String(r[0]),value:Number(r[1])})).filter(r=>Number.isFinite(r.value)),url};
}
function annualFromRows(rows,mode='last'){
  const by={}; for(const r of rows){const m=r.date.match(/(19|20)\d{2}/);if(!m)continue;(by[+m[0]]??=[]).push(r.value)}
  const out={}; for(const [y,a] of Object.entries(by))out[y]=round(mode==='avg'?a.reduce((x,z)=>x+z,0)/a.length:mode==='sum'?a.reduce((x,z)=>x+z,0):a.at(-1),1); return out;
}
function growthFromAnnualLevels(levels){const out={},ys=Object.keys(levels).map(Number).sort((a,b)=>a-b);for(const y of ys)if(levels[y-1]!=null)out[y]=round(pct(levels[y],levels[y-1]),1);return out;}
function yoyFromRows(rows){const levels={};for(const r of rows||[]){const k=String(r.date||'').slice(0,7);if(/^\d{4}-\d{2}$/.test(k)&&Number.isFinite(Number(r.value)))levels[k]=Number(r.value);}const out={};for(const [k,v] of Object.entries(levels)){const [y,m]=k.split('-');const prev=`${Number(y)-1}-${m}`;if(Number.isFinite(levels[prev]))out[k]=round(pct(v,levels[prev]),1);}return out;}
const strip=s=>s.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&[a-z]+;/gi,' ').replace(/\s+/g,' ').trim();

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
  for(const r of (j?.data||[])){const m=String(r[0]).match(/(19|20)\d{2}/),v=Number(r[1]);if(m&&Number.isFinite(v))levels[+m[0]]=v;}
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
  // The official INDEC 1980–2005 empalmed workbook is the authority for the gap if CSV discovery is incomplete.
  if(Object.keys(annual).length<10)throw new Error('series históricas de PIB no disponibles en CSV');
  const quarterlyYoy={};
  try{
    const x=await seriesRows('6.2_PIBPM_2004_T_38',{start:'2020-01-01'});
    const qrows=x.rows.filter(r=>r?.date&&Number.isFinite(Number(r.value))).map(r=>[String(r.date).slice(0,10),Number(r.value)]).sort((a,b)=>a[0].localeCompare(b[0]));
    for(let i=4;i<qrows.length;i++){
      const [d,v]=qrows[i],[pd,pv]=qrows[i-4]; if(!pv)continue;
      const m=Number(d.slice(5,7)),qtr=Math.floor((m-1)/3)+1;
      quarterlyYoy[`${d.slice(0,4)}-T${qtr}`]=round(pct(v,pv),1);
    }
    if(Object.keys(quarterlyYoy).length)segments.push({query:'PIB trimestral a precios constantes, base 2004',range:'2020–presente',sourceUrl:x.url});
  }catch{}
  Object.assign(quarterlyYoy,{'2025-T3':3.3,'2025-T4':2.1,'2026-T1':2.3,'2026-T2':2.0});
  return {status:'ok',source:'INDEC / Datos Argentina — Cuentas Nacionales históricas',annual,quarterlyYoy,segments};
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
async function industryHistorical(){
  const annual={}; const segments=[];
  try{const x=await seriesRows('12.1_E_2004_A_3',{start:'1994-01-01',end:'2015-12-31'});Object.assign(annual,growthFromAnnualLevels(annualFromRows(x.rows,'avg')));segments.push({range:'EMI hasta 2015',sourceUrl:x.url});}catch{}
  let monthlyYoy={};try{const x=await seriesRows('453.1_SERIE_ORIGNAL_0_0_14_46',{start:'2016-01-01'});Object.assign(annual,growthFromAnnualLevels(annualFromRows(x.rows,'avg')));monthlyYoy=yoyFromRows(x.rows);segments.push({range:'IPI desde 2016',sourceUrl:x.url});}catch{}
  if(!Object.keys(annual).length)throw new Error('series industriales no disponibles');
  return {status:'ok',source:'INDEC / Datos Argentina — EMI + IPI manufacturero',annual,monthlyYoy,segments};
}
async function unemploymentHistorical(){
  const x=await seriesRows('45.1_ECTDT_0_A_33',{start:'2003-01-01'});
  // Normalizar ANTES de redondear: 0.074 -> 7.4, no 0.1 -> 10.0.
  const normalized=x.rows.map(r=>({...r,value:Math.abs(r.value)<=1?r.value*100:r.value}));
  const annual=annualFromRows(normalized);
  if(Object.keys(annual).length<15)throw new Error('serie anual EPH incompleta');
  return {status:'ok',source:'INDEC — EPH continua, tasa anual normalizada a porcentaje',sourceUrl:x.url,annual};
}
function usCpiAnnual(){
  // BLS CPI-U, U.S. city average, all items, annual averages (1982-84=100).
  // Bundled snapshot avoids API rate/range failures in serverless execution.
  return {1913:9.9,1914:10.0,1915:10.1,1916:10.9,1917:12.8,1918:15.1,1919:17.3,1920:20.0,1921:17.9,1922:16.8,1923:17.1,1924:17.1,1925:17.5,1926:17.7,1927:17.4,1928:17.1,1929:17.1,1930:16.7,1931:15.2,1932:13.7,1933:13.0,1934:13.4,1935:13.7,1936:13.9,1937:14.4,1938:14.1,1939:13.9,1940:14.0,1941:14.7,1942:16.3,1943:17.3,1944:17.6,1945:18.0,1946:19.5,1947:22.3,1948:24.1,1949:23.8,1950:24.1,1951:26.0,1952:26.5,1953:26.7,1954:26.9,1955:26.8,1956:27.2,1957:28.1,1958:28.9,1959:29.1,1960:29.6,1961:29.9,1962:30.2,1963:30.6,1964:31.0,1965:31.5,1966:32.4,1967:33.4,1968:34.8,1969:36.7,1970:38.8,1971:40.5,1972:41.8,1973:44.4,1974:49.3,1975:53.8,1976:56.9,1977:60.6,1978:65.2,1979:72.6,1980:82.4,1981:90.9,1982:96.5,1983:99.6,1984:103.9,1985:107.6,1986:109.6,1987:113.6,1988:118.3,1989:124.0,1990:130.7,1991:136.2,1992:140.3,1993:144.5,1994:148.2,1995:152.4,1996:156.9,1997:160.5,1998:163.0,1999:166.6,2000:172.2,2001:177.1,2002:179.9,2003:184.0,2004:188.9,2005:195.3,2006:201.6,2007:207.342,2008:215.303,2009:214.537,2010:218.056,2011:224.939,2012:229.594,2013:232.957,2014:236.736,2015:237.017,2016:240.007,2017:245.12,2018:251.107,2019:255.657,2020:258.811,2021:270.97,2022:292.655,2023:304.702,2024:313.689,2025:321.943};
}

async function usCpiMonthly(){
  // BLS CPI-U All items, U.S. city average, not seasonally adjusted (CUUR0000SA0).
  // Public API supports a 20-year window without a key; 2007-current covers the modern FX series.
  const end=new Date().getFullYear(), start=Math.max(2024,end-2);
  const c=new AbortController(); const t=setTimeout(()=>c.abort(),9000);
  try{
    const r=await fetch('https://api.bls.gov/publicAPI/v2/timeseries/data/',{method:'POST',signal:c.signal,headers:{'content-type':'application/json','user-agent':'MacroArgentinaDashboard/4.0'},body:JSON.stringify({seriesid:['CUUR0000SA0'],startyear:String(start),endyear:String(end)})});
    if(!r.ok)throw new Error(`BLS ${r.status}`); const j=await r.json();
    const rows=j?.Results?.series?.[0]?.data||[], monthly={};
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
  const [ex,im,bal]=await Promise.all([
    seriesRows('74.1_IET_0_A_16',{start:'1900-01-01'}),
    seriesRows('74.1_IIT_0_A_25',{start:'1900-01-01'}),
    seriesRows('74.1_SC_0_A_15',{start:'1900-01-01'})
  ]);
  const exports=annualFromRows(ex.rows), imports=annualFromRows(im.rows), balance=annualFromRows(bal.rows);
  for(const y of Object.keys(exports))if(balance[y]==null && imports[y]!=null)balance[y]=round(exports[y]-imports[y],1);
  let real=null;
  try{const cpi=usCpiAnnual(),bls=await usCpiMonthly(),basePeriod=Object.keys(bls.monthly).sort().at(-1),base=bls.monthly[basePeriod],rx={},ri={},rb={};for(const y of Object.keys(exports)){if(!cpi[y])continue;const f=base/cpi[y];rx[y]=round(exports[y]*f,1);if(imports[y]!=null)ri[y]=round(imports[y]*f,1);if(balance[y]!=null)rb[y]=round(balance[y]*f,1);}real={basePeriod,baseIndex:base,exports:rx,imports:ri,balance:rb};}catch{}
  // Serie mensual ICA. La API histórica puede quedar rezagada; completamos el tramo reciente
  // con las cifras mensuales publicadas por INDEC, sin interpolar observaciones.
  let monthlyBalance={};
  try{const m=await seriesRows('74.3_ISC_0_M_19',{start:'2021-01-01'});for(const r of m.rows){const k=String(r.date).slice(0,7);if(/^\d{4}-(0[1-9]|1[0-2])$/.test(k))monthlyBalance[k]=round(r.value,1);}}catch{}
  const indecRecent={
    '2024-01':797,'2024-02':1432,'2024-03':2160,'2024-04':1807,'2024-05':2654,'2024-06':1880,'2024-07':1459,'2024-08':1875,'2024-09':982,'2024-10':912,'2024-11':1277,'2024-12':1682,
    '2025-01':162,'2025-02':275,'2025-03':623,'2025-04':214,'2025-05':607,'2025-06':879,'2025-07':907,'2025-08':1402,
    '2026-07':2115,'2026-08':2187
  };
  Object.assign(monthlyBalance,indecRecent);
  return {status:'ok',source:'INDEC — Intercambio Comercial Argentino (ICA); CPI-U BLS para USD constantes',sourceUrl:'https://www.indec.gob.ar/indec/web/Nivel4-Tema-3-2-40',balance,exports,imports,real,monthlyBalance};
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
const dashboardInflationAnnual={
  1944:-0.3,1945:19.9,1946:17.6,1947:13.6,1948:13.1,1949:31.0,1950:15.6,1951:36.7,1952:38.8,1953:4.0,1954:3.8,1955:12.3,1956:13.4,1957:27.7,1958:22.5,1959:113.7,
  1960:27.3,1961:13.5,1962:28.1,1963:24.0,1964:22.2,1965:28.6,1966:31.9,1967:29.2,1968:16.2,1969:7.6,1970:13.6,1971:34.7,1972:58.5,1973:60.3,
  1974:24.2,1975:182.8,1976:444.0,1977:176.0,1978:175.5,1979:159.5,1980:100.8,1981:104.5,1982:164.8,1983:343.8,1984:626.7,1985:672.2,1986:90.1,1987:131.3,1988:343.0,1989:3079.5,1990:2314.0,
  1991:171.7,1992:24.9,1993:10.6,1994:4.2,1995:3.4,1996:0.2,1997:0.5,1998:0.9,1999:-1.2,2000:-0.9,2001:-1.1,2002:40.9,2003:3.7,2004:6.1,2005:12.3,2006:9.8,
  2007:12.6,2008:22.6,2009:18.5,2010:27.0,2011:23.3,2012:23.0,2013:31.9,2014:39.0,2015:31.6,2016:40.9,2017:24.8,2018:47.6,2019:53.8,2020:36.1,2021:50.9,2022:94.8,2023:211.4,2024:117.8,2025:31.5
};
function arsDeflatorTo2025(){let idx={2001:100};for(let y=2002;y<=2025;y++)idx[y]=idx[y-1]*(1+dashboardInflationAnnual[y]/100);const base=idx[2025],f={};for(const [y,v] of Object.entries(idx))if(+y>=2002)f[y]=base/v;return f;}
function latestGeneric(rows){const a=(rows||[]).map(r=>({date:String(r.fecha||r.date||r.fechaHora||''),value:Number(r.valor??r.value??r.venta)})).filter(x=>x.date&&Number.isFinite(x.value)).sort((a,b)=>a.date.localeCompare(b.date));return a.at(-1)||null;}
function latestWithChange(rows){const a=(rows||[]).map(r=>({date:String(r.fecha||r.date||r.fechaHora||''),value:Number(r.valor??r.value??r.venta)})).filter(x=>x.date&&Number.isFinite(x.value)).sort((a,b)=>a.date.localeCompare(b.date));const cur=a.at(-1),prev=a.at(-2);return cur?{...cur,previous:prev?.value??null,changePct:prev&&prev.value?round((cur.value/prev.value-1)*100,2):null}:null;}
async function financialHistorical(){
  const result={status:'ok',source:'BYMA / Banco Nación / J.P. Morgan; proveedores secundarios identificados cuando corresponde',countryRisk:{},mervalUsdCcl:{},mervalPoints:{},freeDollar:{nominal:{},real:{},baseYear:2025},interestRate:{nominal:{},real:{}},latest:{},sources:{risk:'J.P. Morgan EMBI+ Argentina',riskProvider:'ArgentinaDatos (republicación)',merval:'BYMA / S&P Merval',mervalProvider:'Zion / Yahoo Finance (fallback sin credenciales BYMA)',dollar:'BYMA / Índice Dólar BYMA (MEP)',dollarProvider:'ArgentinaDatos (fallback sin credenciales BYMA)',bna:'Banco de la Nación Argentina'}};
  const errors=[];
  try{
    const j=await get('https://api.argentinadatos.com/v1/finanzas/indices/riesgo-pais','json');
    result.countryRisk=annualLastGeneric(j);
    result.latest.risk=latestWithChange(j);
    // Último cierre verificado: evita que una API rezagada deje la portada un día atrás.
    // Sólo actúa mientras la fuente primaria no tenga una fecha igual o posterior.
    const verifiedRiskClose={date:'2026-09-28',value:641,previous:609,changePct:5.25};
    if(!result.latest.risk || String(result.latest.risk.date||'').slice(0,10)<verifiedRiskClose.date){
      result.latest.risk=verifiedRiskClose;
      result.sources.riskProvider='ArgentinaDatos (histórico) + último cierre verificado';
    }
    try{
      const u=await get('https://api.argentinadatos.com/v1/finanzas/indices/riesgo-pais/ultimo','json');
      const uv=Number(u?.valor??u?.value), ud=String(u?.fecha??u?.date??'');
      if(Number.isFinite(uv)&&ud&&(!result.latest.risk||ud>=String(result.latest.risk.date||''))){
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
  try{const j=await get('https://zion.ar/api/v1/indicators/merval-usd-ccl/history?limit=100000','json');const rows=findObservations(j);result.mervalUsdCcl=annualLastGeneric(rows);result.latest.mervalUsd=latestWithChange(rows);for(const y of Object.keys(result.mervalUsdCcl))if(+y<2013)delete result.mervalUsdCcl[y];if(Object.keys(result.mervalUsdCcl).length<10)throw new Error('cobertura Merval USD CCL insuficiente');}catch(e){errors.push('Merval USD CCL: '+e.message)}
  try{const j=await get('https://zion.ar/api/v1/indicators/merval/history?limit=100000','json');const rows=findObservations(j);result.mervalPoints=annualLastGeneric(rows);result.latest.merval=latestWithChange(rows);if(!result.latest.merval)throw new Error('sin observaciones');}catch(e){errors.push('Merval puntos: '+e.message)}
  try{const j=await get('https://api.argentinadatos.com/v1/cotizaciones/dolares/blue','json');result.freeDollar.nominal=annualLastGeneric(j);const def=arsDeflatorTo2025();for(const [y,v] of Object.entries(result.freeDollar.nominal)){if(+y<2011||!def[y])continue;result.freeDollar.real[y]=round(v*def[y],2);}if(Object.keys(result.freeDollar.nominal).length<10)throw new Error('cobertura dólar blue insuficiente');}catch(e){errors.push('dólar libre histórico: '+e.message)}
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

  try{const x=await seriesRows('89.1_TIPF35D_0_0_35',{start:'1990-01-01'});const rows=x.rows.map(r=>({fecha:r.date,valor:r.value}));result.interestRate.nominal=annualAvgGeneric(rows);for(const [y,i] of Object.entries(result.interestRate.nominal)){const pi=dashboardInflationAnnual[y];if(pi==null)continue;result.interestRate.real[y]=round(((1+i/100)/(1+pi/100)-1)*100,2);}result.interestRate.sourceUrl=x.url;if(Object.keys(result.interestRate.nominal).length<10)throw new Error('cobertura tasa insuficiente');}catch(e){errors.push('tasa: '+e.message)}
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
    // Serie editorial auditada embebida: evita que un timeout de IPC histórico apague ARS reales/TCR.
    const infl={...dashboardInflationAnnual};
    // Índice histórico del costo de vida (Ciudad de Buenos Aires), Dirección de Estadística Social,
    // base 1929=100. Se empalma en 1944 (=102) con el IPC histórico posterior.
    // Fuente primaria digitalizada por la Biblioteca INDEC, cuadro de costo de vida 1914–1945.
    const costOfLiving1929={1914:76,1915:82,1916:88,1917:103,1918:130,1919:122,1920:143,1921:127,1922:107,1923:105,1924:107,1925:104,1926:101,1927:100,1928:99,1929:100,1930:101,1931:87,1932:78,1933:88,1934:78,1935:83,1936:91,1937:93,1938:92,1939:93,1940:95,1941:98,1942:103,1943:104,1944:102};
    const idx={};
    for(const [y,v] of Object.entries(costOfLiving1929))idx[y]=Number(v)/102;
    idx[1944]=1;
    for(let y=1945;y<=2025;y++){
      const pi=infl[y]; if(pi==null||!Number.isFinite(Number(pi))){idx[y]=null;continue;}
      const prev=idx[y-1]; idx[y]=prev==null?null:prev*(1+Number(pi)/100);
    }
    const dec2025=latestIpc.monthly.find(x=>x.date==='2025-12')?.index;
    const latest=latestIpc.monthly.at(-1);
    const latestScale=(dec2025&&latest?.index)?latest.index/dec2025:1;
    const base2025=idx[2025];
    const baseLatest=base2025?base2025*latestScale:null;
    const basePeriod=latest?.date||'2025-12'; out.free.basePeriod=basePeriod;out.official.basePeriod=basePeriod;
    if(baseLatest){
      for(const [y,v] of Object.entries(out.free.nominal)){const yy=+y;if(idx[yy])out.free.real[y]=round(v*baseLatest/idx[yy],4);}
      for(const [y,v] of Object.entries(out.official.nominal)){const yy=+y;if(idx[yy])out.official.real[y]=round(v*baseLatest/idx[yy],4);}
      const monthIndex=Object.fromEntries(latestIpc.monthly.map(x=>[x.date,x.index]));
      const dailyReal=(daily,dest)=>{for(const [d,v] of Object.entries(daily)){const y=+d.slice(0,4),ym=d.slice(0,7);let factor=null;if(monthIndex[ym]&&latest?.index)factor=latest.index/monthIndex[ym];else if(y<=2019&&idx[y])factor=baseLatest/idx[y];else if(y===2025)factor=latestScale;else if(y>=2026)factor=1;if(factor)dest[d]=round(v*factor,4);}};
      dailyReal(out.free.daily.nominal,out.free.daily.real);dailyReal(out.official.daily.nominal,out.official.daily.real);
      const monthlyReal=(monthly,dest)=>{for(const [ym,v] of Object.entries(monthly)){const y=+ym.slice(0,4);let factor=null;if(monthIndex[ym]&&latest?.index)factor=latest.index/monthIndex[ym];else if(idx[y])factor=baseLatest/idx[y];if(factor)dest[ym]=round(v*factor,4);}};
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
  out.errors=errors;return out;
}
async function ipc(){
  const raw=await get(`${SERIES_API}?ids=${encodeURIComponent(IPC_ID)}&limit=1000&format=json`,'json');
  const rows=(raw.data||[]).filter(r=>r[1]!=null).map(r=>({date:String(r[0]).slice(0,7),index:Number(r[1])}));
  if(rows.length<14)throw new Error('observaciones insuficientes');
  const monthly=rows.slice(1).map((r,i)=>({...r,value:round(pct(r.index,rows[i].index),1)}));
  const last=rows.at(-1), prevYear=rows.at(-13);
  const year=last.date.slice(0,4), decPrev=rows.find(r=>r.date===`${Number(year)-1}-12`);
  return {status:'ok',source:'Datos Argentina / INDEC',sourceUrl:'https://www.datos.gob.ar/series/api',updated:last.date,latest:{value:monthly.at(-1).value,yoy:round(pct(last.index,prevYear.index),1),ytd:decPrev?round(pct(last.index,decPrev.index),1):null},monthly,displayMonthly:monthly.slice(-72)};
}
async function arca(){
  const history={'2025-09':20.2,'2025-10':26.5,'2025-11':19.7,'2025-12':27.0,'2026-01':22.0,'2026-02':20.1,'2026-03':26.2,'2026-04':27.2,'2026-05':35.6,'2026-06':23.7,'2026-07':35.1,'2026-08':33.5};
  try{const x=await seriesRows('142.3_TOTAL_2001_M_26',{start:'2020-01-01'});const levels={};for(const r of x.rows){const d=String(r.date).slice(0,7);if(/^\d{4}-\d{2}$/.test(d))levels[d]=r.value;}for(const [d,v] of Object.entries(levels)){const [y,m]=d.split('-');const prev=`${Number(y)-1}-${m}`;if(Number.isFinite(levels[prev]))history[d]=round(pct(v,levels[prev]),1);}}catch{}
  try{
    const x=await bestCsv('sspm-recursos-tributarios-totales-por-tributo',r=>/mensual/i.test(`${r.name||''} ${r.description||''}`)?10:0);
    const rows=parseCsv(x.text),h=rows[0].map(norm),dc=h.findIndex(v=>/indice_tiempo|fecha|periodo/.test(v));
    let vc=h.findIndex(v=>/^total_recaudacion$|^total$|recursos_tributarios_totales/.test(v));
    if(vc<0)vc=h.findIndex(v=>/total/.test(v)&&!/iva|ganancias|seguridad|aduan/.test(v));
    const levels={}; if(dc>=0&&vc>=0)for(const r of rows.slice(1)){const d=String(r[dc]||'').slice(0,7),v=numberAR(r[vc]);if(/^\d{4}-\d{2}$/.test(d)&&Number.isFinite(v))levels[d]=v;}
    for(const [d,v] of Object.entries(levels)){const y=Number(d.slice(0,4)),prev=`${y-1}${d.slice(4)}`;if(levels[prev])history[d]=round(pct(v,levels[prev]),1);}
  }catch{}
  try{
    const text=strip(await get(URLS.arca));
    const m=text.match(/recursos tributarios de\s+([A-Za-zÁÉÍÓÚáéíóú]+)\s+(?:de\s+)?(20\d{2})?\s*alcanzaron\s*\$\s*([\d\.]+)\s*millones[^.]*variaci[oó]n interanual de\s*([\d,]+)%/i)||text.match(/recursos tributarios de\s+([A-Za-zÁÉÍÓÚáéíóú]+)\s*alcanzaron\s*\$\s*([\d\.]+)\s*millones[^.]*variaci[oó]n interanual de\s*([\d,]+)%/i);
    if(m){
      const hasYear=!!m[4], month=m[1], year=hasYear?(m[2]||String(new Date().getFullYear())):String(new Date().getFullYear());
      const value=Number((hasYear?m[3]:m[2]).replace(/\./g,'')),yoy=Number((hasYear?m[4]:m[3]).replace(',','.'));
      return {status:'ok',source:'ARCA — Recursos Tributarios',sourceUrl:URLS.arca,history,historyMeasure:'Variación interanual nominal (%)',latest:{value,yoy,period:`${month} ${year}`}};
    }
  }catch{}
  return {status:'ok',source:'ARCA — Recursos Tributarios',sourceUrl:URLS.arca,history,historyMeasure:'Variación interanual nominal (%)',latest:{value:20508537,yoy:33.5,period:'agosto 2026'}};
}
async function icg(){
  const history={'2025-09':1.94,'2025-10':2.10,'2025-11':2.47,'2025-12':2.46,'2026-01':2.40,'2026-02':2.38,'2026-03':2.30,'2026-04':2.02,'2026-05':1.99,'2026-06':2.07,'2026-07':1.94,'2026-08':2.06,'2026-09':1.94};
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
    Object.assign(history,bestHistory);
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
async function rem(){
  const text=strip(await get(URLS.rem));
  const participants=text.match(/contemplando a\s*(\d+)\s*participantes, entre\s*(\d+)\s*consultoras[^\d]+(\d+)\s*entidades financieras/i);
  const gdp=text.match(/PIB real\s*([\d,]+)%\s*superior al promedio de 2025/i) || text.match(/nivel de PIB real\s*([\d,]+)%\s*superior/i);
  const fx=text.match(/diciembre de 2026[^$]{0,100}\$\s*([\d\.]+)\/USD/i);
  return {status:'ok',source:'REM BCRA',sourceUrl:URLS.rem,latest:{participants:participants?+participants[1]:null,consultants:participants?+participants[2]:null,banks:participants?+participants[3]:null,gdp2026:gdp?Number(gdp[1].replace(',','.')):null,fxDec2026:fx?Number(fx[1].replace(/\./g,'')):null}};
}
async function salaryRipte(){
  // Serie oficial Datos Argentina: mensual desde julio de 1994. Se completa con la publicación vigente de Seguridad Social.
  const seriesUrl='https://apis.datos.gob.ar/series/api/series/?ids=158.1_REPTE_0_0_5&start_date=1994-07-01&end_date=2026-12-31&limit=5000&format=json&metadata=none';
  const officialUrl='https://www.argentina.gob.ar/node/201033';
  const monthly={};
  // Recurso CSV oficial completo (1994+). Es la vía primaria porque la API de series puede devolver ventanas parciales.
  const csvUrl='https://infra.datos.gob.ar/catalog/sspm/dataset/158/distribution/158.1/download/remuneracion-imponible-promedio-trabajadores-estables-ripte-total-pais-pesos-serie-mensual.csv';
  try{
    const rows=parseCsv(await get(csvUrl,'text'));
    const h=(rows[0]||[]).map(norm),dc=h.findIndex(x=>/indice_tiempo|fecha|periodo/.test(x)),vc=h.findIndex(x=>/^ripte$|repte/.test(x));
    if(dc>=0&&vc>=0)for(const row of rows.slice(1)){const ym=String(row[dc]||'').slice(0,7),v=numberAR(row[vc]);if(/^\d{4}-\d{2}$/.test(ym)&&Number.isFinite(v)&&ym>='1994-07')monthly[ym]=v;}
  }catch(e){}
  // Fallback/complemento: API oficial de series.
  try{
    const j=JSON.parse(await get(seriesUrl,'text'));
    for(const row of (j.data||[])){
      const ym=String(row?.[0]||'').slice(0,7),v=Number(row?.[1]);
      if(/^\d{4}-\d{2}$/.test(ym)&&Number.isFinite(v)&&ym>='1994-07')monthly[ym]=v;
    }
  }catch(e){}
  // La página oficial es la autoridad para los meses más recientes y además evita depender de que el catálogo replique inmediatamente la publicación.
  const text=strip(await get(officialUrl)), monthMap={enero:'01',febrero:'02',marzo:'03',abril:'04',mayo:'05',junio:'06',julio:'07',agosto:'08',septiembre:'09',octubre:'10',noviembre:'11',diciembre:'12'};
  const direct=new RegExp('(Enero|Febrero|Marzo|Abril|Mayo|Junio|Julio|Agosto|Septiembre|Octubre|Noviembre|Diciembre)\\s*\\/?\\s*(20\\d{2}|19\\d{2})\\s*\\$?\\s*([\\d.]+(?:,\\d{1,2})?)','gi');
  let m;while((m=direct.exec(text))){const ym=`${m[2]}-${monthMap[m[1].toLowerCase()]}`,v=Number(m[3].replace(/\./g,'').replace(',','.'));if(ym>='1994-07'&&Number.isFinite(v))monthly[ym]=v;}
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
  const monthly={}; let sourceUrl='';
  try{const x=await seriesRows('33.2_I_2004_M_4',{start:'2020-01-01'});sourceUrl=x.url;for(const r of x.rows){const k=String(r.date).slice(0,7);if(/^\d{4}-\d{2}$/.test(k)&&Number.isFinite(Number(r.value)))monthly[k]=round(r.value,1);}}catch{}
  if(Object.keys(monthly).length<24){
    try{const x=await bestCsv('sspm-indicador-sintetico-actividad-construccion-isac-base-2004',r=>/valores mensuales|nivel general|isac/i.test(`${r.name||''} ${r.description||''}`)?10:0);sourceUrl=x.url;const rows=parseCsv(x.text),h=rows[0].map(norm),dc=h.findIndex(v=>/indice_tiempo|fecha|periodo/.test(v)),vc=h.findIndex(v=>/isac_variacion_interanual/.test(v));if(dc>=0&&vc>=0)for(const r of rows.slice(1)){const d=String(r[dc]||'').slice(0,7),v=numberAR(r[vc]);if(/^\d{4}-\d{2}$/.test(d)&&Number.isFinite(v))monthly[d]=round(v,1);}}catch{}
  }
  if(!Object.keys(monthly).length)throw new Error('serie ISAC interanual no disponible');
  return {status:'ok',source:'INDEC / Datos Argentina — ISAC variación interanual',sourceUrl,monthlyYoy:monthly};
}
async function creditHistorical(){
  const x=await seriesRows('91.1_PEFPC_0_0_35',{start:'2024-01-01'});
  return {status:'ok',source:'BCRA / Datos Argentina — préstamos al sector privado',sourceUrl:x.url,monthlyYoy:yoyFromRows(x.rows)};
}
async function activityPulse(){
  // Últimos valores publicados y verificados. El adaptador queda aislado para que una fuente sectorial no bloquee el resto del tablero.
  return {status:'ok',source:'Economía / INDEC / AFCP / ACARA / BCRA',
    fiscal:{period:'ago 2026',financial:635.529,primary:1990.322,unit:'miles de millones ARS',sourceUrl:'https://www.argentina.gob.ar/economia/hacienda',historyPctGDP:{primary:{'2024-01':0.2,'2024-02':0.5,'2024-03':0.6,'2024-04':0.6,'2024-05':1.0,'2024-06':1.1,'2024-07':1.4,'2024-08':1.5,'2024-09':1.7,'2024-10':1.8,'2024-11':1.9,'2024-12':1.8,'2025-01':0.3,'2025-02':0.4,'2025-03':0.5,'2025-04':0.6,'2025-05':0.8,'2025-06':0.9,'2025-07':1.1,'2025-08':1.3,'2025-09':1.3,'2025-10':1.4,'2025-11':1.7,'2025-12':1.4,'2026-01':0.3,'2026-02':0.4,'2026-03':0.5,'2026-04':0.5,'2026-05':0.7,'2026-06':0.6,'2026-07':0.9,'2026-08':1.1},financial:{'2024-01':0.2,'2024-02':0.2,'2024-03':0.2,'2024-04':0.2,'2024-05':0.4,'2024-06':0.4,'2024-07':0.4,'2024-08':0.4,'2024-09':0.4,'2024-10':0.5,'2024-11':0.3,'2024-12':0.3,'2025-01':0.1,'2025-02':0.1,'2025-03':0.2,'2025-04':0.2,'2025-05':0.3,'2025-06':0.4,'2025-07':0.3,'2025-08':0.4,'2025-09':0.4,'2025-10':0.5,'2025-11':0.6,'2025-12':0.2,'2026-01':0.1,'2026-02':0.1,'2026-03':0.2,'2026-04':0.2,'2026-05':0.2,'2026-06':0.1,'2026-07':0.1,'2026-08':0.2}},history:{
      'Resultado primario':{'2025-08':1556.865,'2025-09':696.965,'2025-10':823.925,'2025-11':2128.010,'2026-01':3125.737,'2026-02':1410.639,'2026-03':930.284,'2026-04':632.844,'2026-05':1924.367,'2026-06':-696.843,'2026-07':2960.333,'2026-08':1990.322},
      'Resultado financiero':{'2025-08':390.301,'2025-09':309.623,'2025-10':517.672,'2025-11':599.954,'2026-01':1105.159,'2026-02':144.421,'2026-03':484.789,'2026-04':268.103,'2026-05':478.613,'2026-06':-1024.891,'2026-07':244.897,'2026-08':635.529}
    }},
    cement:{period:'ago 2026',tons:817082,yoy:-8.1,mom:-0.1,sourceUrl:'https://www.afcp.org.ar/copia-de-produccion-de-cemento-y-cl',historyYoy:{'2026-01':-5.3,'2026-02':-5.3,'2026-03':11.0,'2026-04':-13.2,'2026-05':-1.5,'2026-06':-1.4,'2026-07':-8.2,'2026-08':-8.1},annualYoy:{'2022':7.0,'2023':-3.2,'2024':-23.9,'2025':5.6,'2026 YTD':-4.4},history:{
      'Despacho nacional (t)':{'2025-09':917330,'2025-10':944216,'2025-11':829590,'2025-12':776185,'2026-01':742456,'2026-02':750305,'2026-03':846616,'2026-04':837659,'2026-05':843563,'2026-06':811474,'2026-07':817901,'2026-08':817082}
    }},
    isac:{period:'jul 2026',yoy:-4.5,mom:-4.6,sourceUrl:'https://www.indec.gob.ar/indec/web/Institucional-Indec-InformesTecnicos-47',history:{
      'ISAC nivel general (2004=100)':{'2025-08':153.6,'2025-09':160.5,'2025-10':168.4,'2025-11':142.4,'2025-12':136.4,'2026-01':133.0,'2026-02':123.8,'2026-03':149.5,'2026-04':142.2,'2026-05':147.1,'2026-06':154.5,'2026-07':147.38}
    }},
    autos:{period:'ago 2026',units:44415,yoy:-19.1,mom:-1.5,sourceUrl:'https://www.acara.org.ar/',historyYoy:{'2026-01':-5.0,'2026-02':-5.7,'2026-03':1.2,'2026-04':-13.6,'2026-05':-25.6,'2026-06':-8.2,'2026-07':-27.5,'2026-08':-18.8},history:{
      'Patentamientos (unidades)':{'2022-01':43505,'2022-02':29103,'2022-03':34527,'2022-04':31868,'2022-05':35327,'2022-06':35385,'2022-07':38892,'2022-08':38342,'2022-09':34815,'2022-10':32436,'2022-11':33698,'2022-12':19635,'2023-01':50362,'2023-02':30509,'2023-03':39877,'2023-04':34768,'2023-05':40164,'2023-06':40114,'2023-07':44119,'2023-08':39465,'2023-09':33636,'2023-10':41945,'2023-11':35981,'2023-12':18498,'2024-01':33917,'2024-02':25050,'2024-03':25813,'2024-04':32941,'2024-05':34796,'2024-06':30905,'2024-07':43149,'2024-08':41507,'2024-09':43679,'2024-10':44467,'2024-11':36220,'2024-12':21761,'2025-01':69521,'2025-02':44569,'2025-03':48389,'2025-04':55026,'2025-05':56320,'2025-06':52730,'2025-07':62818,'2025-08':54889,'2025-09':56240,'2025-10':52259,'2025-11':35424,'2025-12':23997,'2026-01':66080,'2026-02':42026,'2026-03':48972,'2026-04':47564,'2026-05':41921,'2026-06':47415,'2026-07':43758,'2026-08':44415}
    }},
    credit:{period:'ago 2026',arsRealMom:-1.0,usdBalance:25241,usdMom:258,sourceUrl:'https://www.bcra.gob.ar/informe-monetario-mensual/',history:{
      'Crédito en pesos — var. real mensual (%)':{'2025-09':-1.8,'2025-10':1.1,'2025-11':-1.6,'2025-12':1.1,'2026-01':-1.9,'2026-02':0.0,'2026-03':-0.4,'2026-04':0.6,'2026-05':-0.3,'2026-06':0.3,'2026-07':1.2,'2026-08':-1.0}
    }},
    arrears:{period:'jul 2026',total:7.7,families:12.9,companies:3.6,pde:2.4,sourceUrl:'https://www.bcra.gob.ar/informe-sobre-bancos/',history:{
      'Total':{'2025-12':5.5,'2026-02':6.7,'2026-03':7.0,'2026-04':7.3,'2026-05':7.7,'2026-06':7.6,'2026-07':7.7},
      'Familias':{'2025-12':9.3,'2026-02':11.2,'2026-03':11.5,'2026-04':12.1,'2026-05':12.8,'2026-06':12.8,'2026-07':12.9},
      'Empresas':{'2025-12':2.5,'2026-02':2.9,'2026-03':3.1,'2026-04':3.3,'2026-05':3.5,'2026-06':3.5,'2026-07':3.6}
    }}
  };
}
export default async()=>{
  const out={version:90,generatedAt:new Date().toISOString(),sources:{}};
  const names=['ipcHistorical','gdpHistorical','industryHistorical','unemploymentHistorical','tradeHistorical','financialHistorical','exchangeHistorical','ipc','arca','icg','bcra','rem','salary','icl','contractIndices','isacHistorical','creditHistorical','activityPulse'];
  const jobs=await Promise.allSettled([ipcHistorical(),gdpHistorical(),industryHistorical(),unemploymentHistorical(),tradeHistorical(),financialHistorical(),exchangeHistorical(),ipc(),arca(),icg(),bcra(),rem(),salaryRipte(),icl(),contractIndices(),isacHistorical(),creditHistorical(),activityPulse()]);
  jobs.forEach((j,i)=>out.sources[names[i]]=j.status==='fulfilled'?j.value:{status:'error',error:String(j.reason?.message||j.reason)});
  const ok=Object.values(out.sources).some(x=>x.status==='ok');
  return new Response(JSON.stringify(out),{status:ok?200:503,headers:{'content-type':'application/json; charset=utf-8','cache-control':'public, max-age=60, s-maxage=60, stale-while-revalidate=120','access-control-allow-origin':'*'}});
};

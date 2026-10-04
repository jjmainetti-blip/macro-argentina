/* Macrodatos (macrodatos.ar) — antes Macro Argentina v113 (base v105) — series auditables, rango personalizado y variación acumulada.
   Las series se cargan directamente desde la API pública cuando es posible y el backend Netlify queda como segunda vía. */

const fmt = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 });
const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });

// Inflación anual. Al iniciar, contiene el tramo de respaldo 2007+.
// La API interna agrega automáticamente el IPC histórico oficial INDEC (1943–2006).
// Criterio editorial: INDEC hasta 2006 → San Luis 2007–2015 → transición 2016 → INDEC nacional 2017+.
const inflation = {
  1944:-0.3,1945:19.9,1946:17.6,1947:13.6,1948:13.1,1949:31.0,1950:15.6,1951:36.7,1952:38.8,1953:4.0,1954:3.8,1955:12.3,1956:13.4,1957:27.7,1958:22.5,1959:113.7,
  1960:27.3,1961:13.5,1962:28.1,1963:24.0,1964:22.2,1965:28.6,1966:31.9,1967:29.2,1968:16.2,1969:7.6,1970:13.6,1971:34.7,1972:58.5,1973:60.3,
  1974:24.2,1975:182.8,1976:444.0,1977:176.0,1978:175.5,1979:159.5,1980:100.8,1981:104.5,1982:164.8,1983:343.8,1984:626.7,1985:672.2,1986:90.1,1987:131.3,1988:343.0,1989:3079.5,1990:2314.0,
  1991:171.7,1992:24.9,1993:10.6,1994:4.2,1995:3.4,1996:0.2,1997:0.5,1998:0.9,1999:-1.2,2000:-0.9,2001:-1.1,2002:40.9,2003:3.7,2004:6.1,2005:12.3,2006:9.8,
  2007:12.6,2008:22.6,2009:18.5,2010:27.0,2011:23.3,2012:23.0,2013:31.9,2014:39.0,2015:31.6,2016:40.9,2017:24.8,2018:47.6,2019:53.8,2020:36.1,2021:50.9,2022:94.8,2023:211.4,2024:117.8,2025:31.5
};

// Variación anual real del PIB (aprox. para herramienta demostrativa; validar antes de uso productivo).
const gdpGrowth = {2007:9.0,2008:4.1,2009:-5.9,2010:10.1,2011:6.0,2012:-1.0,2013:2.4,2014:-2.5,2015:2.7,2016:-2.1,2017:2.8,2018:-2.6,2019:-2.0,2020:-9.9,2021:10.7,2022:5.0,2023:-1.6,2024:-1.3,2025:4.5}; // el backend antepone automáticamente los tramos históricos disponibles

// Pobreza: 2007–2015 se presenta como serie ODSA-UCA/alternativa; luego INDEC cuando hay dato comparable disponible.
const poverty = {
  // INDEC EPH puntual, GBA: onda de octubre (1988–2002).
  1988:32.3,1989:47.3,1990:33.7,1991:21.5,1992:17.8,1993:16.8,1994:19.0,1995:24.8,1996:27.9,1997:26.0,1998:25.9,1999:26.7,2000:28.9,2001:35.4,2002:54.3,
  // INDEC EPH continua, total aglomerados: segundo semestre (2003–2006).
  2003:47.8,2004:40.2,2005:33.8,2006:26.9,
  // ODSA-UCA (criterio editorial solicitado) 2007–2015; INDEC desde 2016.
  2007:37.9,2008:35.0,2009:33.5,2010:31.8,2011:28.2,2012:28.9,2013:27.4,2014:30.9,2015:29.0,2016:30.3,2017:25.7,2018:32.0,2019:35.5,2020:42.0,2021:37.3,2022:39.2,2023:41.7,2024:38.1,2025:31.6,2026:32.3
};

// Series adicionales: se completan automáticamente desde el backend.
const industry = {}, unemployment = {}, tradeBalanceNominal = {}, exportsNominal = {}, importsNominal = {};
const countryRisk = {}, mervalUsdCcl = {}, freeDollarNominal = {}, freeDollarReal = {}, interestNominal = {}, interestReal = {}, salaryRipte = {}, salaryRipteMonthly = {}, salaryArsReal={}, salaryUsdNominal={}, salaryUsdReal={}, salaryArsRealMonthly={}, salaryUsdNominalMonthly={}, salaryUsdRealMonthly={}, iclMonthly = {}, cerMonthly={}, uvaMonthly={}, iclDaily={}, cerDaily={}, uvaDaily={};
const fxOfficialNominal={}, fxOfficialReal={}, fxOfficialTcr={}, fxFreeTcr={}, fxGap={}, fxFreeMonthlyNominal={},fxFreeMonthlyReal={},fxFreeMonthlyTcr={},fxOfficialMonthlyNominal={},fxOfficialMonthlyReal={},fxOfficialMonthlyTcr={},fxFreeDailyNominal={},fxFreeDailyReal={},fxFreeDailyTcr={},fxOfficialDailyNominal={},fxOfficialDailyReal={},fxOfficialDailyTcr={},fxDailyGap={}; let fxSeriesMode='free', fxPriceMode='tcr', fxFrequency='auto', fxRange='max', fxChart, fxZoomFactor=1, fxCustomFrom='',fxCustomTo='',fxBasePeriod='';
let dollarPriceMode='real'; // real | nominal
let interestMode='real'; // real | nominal
let salaryMode='arsReal'; // arsReal | arsNominal | usdReal | usdNominal
// v119: series diarias (Merval y riesgo país). Merval: 'usdReal' = USD constantes (TCR, deflactado por CPI-U) | 'points' = puntos.
const mervalPointsDaily={}, mervalUsdDaily={}, mervalUsdRealDaily={}, countryRiskDaily={}, usCpiMonthlyMap={};
let mervalMode='usdReal', mervalRealBase='';
const DAILY_SERIES=new Set(['countryRisk','mervalUsd']);
function expandCompactDaily(s,target){if(!s?.start||!Array.isArray(s.d)||!Array.isArray(s.v))return;let dt=new Date(s.start+'T00:00:00Z');for(let i=0;i<s.v.length;i++){dt=new Date(dt.getTime()+(Number(s.d[i])||0)*864e5);const v=Number(s.v[i]);if(Number.isFinite(v))target[dt.toISOString().slice(0,10)]=v;}}
function rebuildMervalReal(){for(const k of Object.keys(mervalUsdRealDaily))delete mervalUsdRealDaily[k];
  const months=Object.keys(usCpiMonthlyMap).filter(k=>Number.isFinite(Number(usCpiMonthlyMap[k]))).sort();if(!months.length)return;
  const baseYm=months.at(-1),base=Number(usCpiMonthlyMap[baseYm]);mervalRealBase=baseYm;
  const cpiFor=ym=>{if(usCpiMonthlyMap[ym]!=null)return Number(usCpiMonthlyMap[ym]);if(ym>baseYm)return base;const prev=months.filter(m=>m<=ym).at(-1);return prev?Number(usCpiMonthlyMap[prev]):null;};
  for(const [d,v] of Object.entries(mervalUsdDaily)){const c=cpiFor(d.slice(0,7));if(c)mervalUsdRealDaily[d]=Number((Number(v)*base/c).toFixed(2));}}
function applyMervalMode(){const c=seriesConfig.mervalUsd;if(!c)return;
  if(mervalMode==='points'){c.data=mervalPointsDaily;c.title='Merval';c.subtitle='S&P Merval · puntos · diario';}
  else{c.data=Object.keys(mervalUsdRealDaily).length?mervalUsdRealDaily:mervalUsdDaily;c.title='Merval en USD constantes';c.subtitle=`S&P Merval en USD · constantes de ${mervalRealBase?displayMonth(mervalRealBase):'último CPI-U'} (TCR) · diario`;}}
let marketsDailyPromise=null;
function loadMarketsDaily(){return marketsDailyPromise??=(async()=>{try{const r=await fetch('/markets-daily.json?v=119',{cache:'no-store'});if(!r.ok)return;const j=await r.json();
  expandCompactDaily(j.mervalPoints,mervalPointsDaily);expandCompactDaily(j.mervalUsd,mervalUsdDaily);expandCompactDaily(j.countryRisk,countryRiskDaily);Object.assign(usCpiMonthlyMap,j.usCpiMonthly||{});
  rebuildMervalReal();applyMervalMode();seriesConfig.countryRisk.data=countryRiskDaily;
  if(window.Chart&&DAILY_SERIES.has(currentSeries))renderHistory(currentSeries);}catch(e){console.warn('markets daily',e);}})();}
function displayDay(d){const [y,m,dd]=String(d).split('-');return `${Number(dd)} ${MONTH_LABELS[+m-1]} ${y}`;}
const tradeBalance = {}, exportsSeries = {}, importsSeries = {}, tradeBalanceMonthly = {}, cementMonthlyYoy = {};
let tradePriceMode='real'; // real | nominal
let tradeBasePeriod='';
const US_CPI_BASE_YEAR=2025;
const usCpiAnnual = {};

const SERIES_API_PUBLIC='https://apis.datos.gob.ar/series/api/series/';
// IPC mensual: una única cadena de niveles construida con variaciones mensuales dentro de cada fuente.
// INDEC histórico <= 2006; San Luis 2007-2016; INDEC Nacional >= 2017.
const inflationMonthly = {};      // YYYY-MM -> variación mensual %
const inflationIndex = {};        // YYYY-MM -> índice encadenado sintético
const ipcCalcIndex = {};          // YYYY-MM -> nivel IPC directo del backend; evita carreras de carga en la calculadora
let inflationFrequency='annual';  // annual | monthly
let inflationAnnualMode='eop';    // eop (dic/dic) | avg (promedio anual)
const MONTH_LABELS=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

async function publicSeries(id, params={}){
  const q=new URLSearchParams({ids:id,limit:'1000',format:'json',metadata:'none',...params});
  const r=await fetch(`${SERIES_API_PUBLIC}?${q}`); if(!r.ok) throw new Error(`Series API ${r.status}: ${id}`);
  const j=await r.json(); const rows=(j.data||[]).map(x=>({date:String(x[0]),value:Number(x[1])})).filter(x=>Number.isFinite(x.value));
  if(!rows.length) throw new Error(`Sin datos: ${id}`); return rows;
}

async function worldBankGdpGrowth(){
  const r=await fetch('https://api.worldbank.org/v2/country/ARG/indicator/NY.GDP.MKTP.KD.ZG?format=json&per_page=100&date=1961:2025');
  if(!r.ok) throw new Error(`World Bank API ${r.status}`);
  const j=await r.json(); const out={};
  for(const x of (j?.[1]||[])){const y=Number(x.date),v=Number(x.value);if(Number.isFinite(y)&&Number.isFinite(v))out[y]=Number(v.toFixed(2));}
  if(Object.keys(out).length<50) throw new Error('Serie PIB Banco Mundial incompleta');
  return out;
}
async function worldBankUnemploymentNational(){
  const r=await fetch('https://api.worldbank.org/v2/country/ARG/indicator/SL.UEM.TOTL.NE.ZS?format=json&per_page=100&date=1980:2025');
  if(!r.ok) throw new Error(`World Bank unemployment API ${r.status}`);
  const j=await r.json(); const out={};
  for(const x of (j?.[1]||[])){const y=Number(x.date),v=Number(x.value);if(Number.isFinite(y)&&Number.isFinite(v))out[y]=Number(v.toFixed(2));}
  return out;
}
function bundledUsCpi(){
  // BLS CPI-U, U.S. city average, All items, annual averages. Base 1982-84=100.
  // Snapshot through 2025. Same table used by the Netlify backend: one source, one calculation.
  return {1913:9.9,1914:10.0,1915:10.1,1916:10.9,1917:12.8,1918:15.1,1919:17.3,1920:20.0,1921:17.9,1922:16.8,1923:17.1,1924:17.1,1925:17.5,1926:17.7,1927:17.4,1928:17.1,1929:17.1,1930:16.7,1931:15.2,1932:13.7,1933:13.0,1934:13.4,1935:13.7,1936:13.9,1937:14.4,1938:14.1,1939:13.9,1940:14.0,1941:14.7,1942:16.3,1943:17.3,1944:17.6,1945:18.0,1946:19.5,1947:22.3,1948:24.1,1949:23.8,1950:24.1,1951:26.0,1952:26.5,1953:26.7,1954:26.9,1955:26.8,1956:27.2,1957:28.1,1958:28.9,1959:29.1,1960:29.6,1961:29.9,1962:30.2,1963:30.6,1964:31.0,1965:31.5,1966:32.4,1967:33.4,1968:34.8,1969:36.7,1970:38.8,1971:40.5,1972:41.8,1973:44.4,1974:49.3,1975:53.8,1976:56.9,1977:60.6,1978:65.2,1979:72.6,1980:82.4,1981:90.9,1982:96.5,1983:99.6,1984:103.9,1985:107.6,1986:109.6,1987:113.6,1988:118.3,1989:124.0,1990:130.7,1991:136.2,1992:140.3,1993:144.5,1994:148.2,1995:152.4,1996:156.9,1997:160.5,1998:163.0,1999:166.6,2000:172.2,2001:177.1,2002:179.9,2003:184.0,2004:188.9,2005:195.3,2006:201.6,2007:207.342,2008:215.303,2009:214.537,2010:218.056,2011:224.939,2012:229.594,2013:232.957,2014:236.736,2015:237.017,2016:240.007,2017:245.120,2018:251.107,2019:255.657,2020:258.811,2021:270.970,2022:292.655,2023:304.702,2024:313.689,2025:321.943};
}
Object.assign(usCpiAnnual,bundledUsCpi());

function rebuildRealTrade(){
  for(const o of [tradeBalance,exportsSeries,importsSeries])for(const k of Object.keys(o))delete o[k];
  const base=usCpiAnnual[US_CPI_BASE_YEAR];
  for(const y of Object.keys(exportsNominal)){
    if(Number(y)<1913) continue;
    const cpi=usCpiAnnual[y];
    if(tradePriceMode==='real' && (!base || !cpi)) continue;
    const factor=tradePriceMode==='real'?base/cpi:1;
    exportsSeries[y]=Number((exportsNominal[y]*factor).toFixed(1));
    if(importsNominal[y]!=null)importsSeries[y]=Number((importsNominal[y]*factor).toFixed(1));
    if(tradeBalanceNominal[y]!=null)tradeBalance[y]=Number((tradeBalanceNominal[y]*factor).toFixed(1));
  }
}
function annualAverageFromQuarterly(rows){
  const by={}; for(const r of rows){const y=Number(String(r.date).slice(0,4)); if(!Number.isFinite(y))continue;(by[y]??=[]).push(Number(r.value));}
  const out={}; for(const [y,a] of Object.entries(by)){const vals=a.filter(Number.isFinite);if(vals.length===4)out[y]=Number((vals.reduce((s,v)=>s+v,0)/4).toFixed(1));}
  return out;
}
function annualObject(rows, mode='last'){const by={}; for(const r of rows){const m=r.date.match(/(19|20)\d{2}/);if(!m)continue;(by[+m[0]]??=[]).push(r.value)} const o={}; for(const [y,a] of Object.entries(by)){o[y]=Number((mode==='avg'?a.reduce((s,v)=>s+v,0)/a.length:mode==='sum'?a.reduce((s,v)=>s+v,0):a.at(-1)).toFixed(1))} return o;}
function growthObject(levels){const out={};const ys=Object.keys(levels).map(Number).sort((a,b)=>a-b);for(const y of ys){if(levels[y-1]!=null)out[y]=Number(((levels[y]/levels[y-1]-1)*100).toFixed(1));}return out;}
function rowsToMap(rows){const o={};for(const r of rows)o[r.date.slice(0,7)]=r.value;return o;}
function pct(a,b){return a&&b?((b/a)-1)*100:null;}
function buildInflationChain(histRows,slRows,natRows){
  const H=rowsToMap(histRows), S=rowsToMap(slRows), N=rowsToMap(natRows);
  const months=[]; for(let y=1943;y<=new Date().getFullYear();y++)for(let m=1;m<=12;m++)months.push(`${y}-${String(m).padStart(2,'0')}`);
  let chain=100, started=false;
  for(const ym of months){
    const [ys,ms]=ym.split('-'), y=+ys, m=+ms; const prev=m===1?`${y-1}-12`:`${y}-${String(m-1).padStart(2,'0')}`;
    let r=null;
    if(y<=2006 && H[prev]!=null && H[ym]!=null) r=pct(H[prev],H[ym]);
    else if(y>=2007 && y<=2016 && S[prev]!=null && S[ym]!=null) r=pct(S[prev],S[ym]);
    else if(y>=2017 && N[prev]!=null && N[ym]!=null) r=pct(N[prev],N[ym]);
    if(!started){ if(H[ym]!=null){inflationIndex[ym]=chain;started=true;} continue; }
    if(r!=null){chain*=1+r/100; inflationMonthly[ym]=Number(r.toFixed(2)); inflationIndex[ym]=chain;}
  }
  rebuildAnnualInflation();
}
function rebuildAnnualInflation(){
  const years=[...new Set(Object.keys(inflationIndex).map(x=>+x.slice(0,4)))].sort((a,b)=>a-b);
  for(const k of Object.keys(inflation)) delete inflation[k];
  for(const y of years){
    if(inflationAnnualMode==='avg'){
      const cur=Object.entries(inflationIndex).filter(([d])=>+d.slice(0,4)===y).map(([,v])=>v);
      const prev=Object.entries(inflationIndex).filter(([d])=>+d.slice(0,4)===y-1).map(([,v])=>v);
      if(cur.length===12&&prev.length===12){const a=cur.reduce((x,z)=>x+z,0)/12,b=prev.reduce((x,z)=>x+z,0)/12;inflation[y]=Number(((a/b-1)*100).toFixed(1));}
    }else{
      const a=inflationIndex[`${y-1}-12`],b=inflationIndex[`${y}-12`]; if(a!=null&&b!=null)inflation[y]=Number(((b/a-1)*100).toFixed(1));
    }
  }
}
async function loadPublicHistorical(){
  const results=await Promise.allSettled([
    publicSeries('178.1_NL_GENERAL_0_0_13',{start_date:'1943-01-01',end_date:'2006-12-31'}),
    publicSeries('197.1_NIVEL_GENERAL_2014_0_13',{start_date:'2006-12-01',end_date:'2016-12-31'}),
    publicSeries('148.3_INIVELNAL_DICI_M_26',{start_date:'2016-12-01'}),
    publicSeries('250.1_PPRECIOADO_0_0_19',{start_date:'1935-01-01',end_date:'1964-12-31'}),
    publicSeries('12.1_E_2004_A_3',{start_date:'1994-01-01',end_date:'2015-12-31'}),
    publicSeries('453.1_SERIE_ORIGNAL_0_0_14_46',{start_date:'2016-01-01'}),
    publicSeries('45.1_ECTDT_0_A_33',{start_date:'2003-01-01'}),
    worldBankUnemploymentNational(),
    worldBankGdpGrowth(),
    publicSeries('74.1_IET_0_A_16',{start_date:'1900-01-01'}),
    publicSeries('74.1_IIT_0_A_25',{start_date:'1900-01-01'}),
    publicSeries('74.1_SC_0_A_15',{start_date:'1900-01-01'}),
  ]);
  const [histIpc,slIpc,natIpc,gdpR,emiR,ipiR,unempR,wbUnempR,wbGdpR,expR,impR,balR]=results;
  if(histIpc.status==='fulfilled'&&slIpc.status==='fulfilled'&&natIpc.status==='fulfilled') buildInflationChain(histIpc.value,slIpc.value,natIpc.value);
  if(gdpR.status==='fulfilled')Object.assign(gdpGrowth,growthObject(annualObject(gdpR.value)));
  // 1961+ usa una serie anual continua de crecimiento real para evitar huecos entre bases históricas.
  if(wbGdpR.status==='fulfilled')Object.assign(gdpGrowth,wbGdpR.value);
  if(emiR.status==='fulfilled')Object.assign(industry,growthObject(annualObject(emiR.value,'avg')));
  if(ipiR.status==='fulfilled')Object.assign(industry,growthObject(annualObject(ipiR.value,'avg')));
  if(unempR.status==='fulfilled'){const normalized=unempR.value.map(r=>({...r,value:Math.abs(r.value)<=1?r.value*100:r.value}));Object.assign(unemployment,annualObject(normalized));}
  else if(wbUnempR.status==='fulfilled')Object.assign(unemployment,wbUnempR.value);
  // Control con los cuatro trimestres publicados por INDEC para 2025: 7,9; 7,6; 6,6; 7,5.
  unemployment[2025]=7.4;
  if(expR.status==='fulfilled')Object.assign(exportsNominal,annualObject(expR.value));
  if(impR.status==='fulfilled')Object.assign(importsNominal,annualObject(impR.value));
  if(balR.status==='fulfilled')Object.assign(tradeBalanceNominal,annualObject(balR.value));
  for(const y of Object.keys(exportsNominal)) if(importsNominal[y]!=null && tradeBalanceNominal[y]==null) tradeBalanceNominal[y]=Number((exportsNominal[y]-importsNominal[y]).toFixed(1));
  rebuildRealTrade();
  if(Object.keys(salaryRipte).length)applySalaryMode();
  fillSelect('infStart',inflation,Math.min(...Object.keys(inflation).map(Number))); fillSelect('infEnd',inflation,Math.max(...Object.keys(inflation).map(Number)));
  fillSelect('gdpStart',gdpGrowth,Math.min(...Object.keys(gdpGrowth).map(Number))); fillSelect('gdpEnd',gdpGrowth,Math.max(...Object.keys(gdpGrowth).map(Number)));
  if(window.Chart)renderHistory(currentSeries); updateCoverage(); syncUpdateIndexAvailability(); updateCalcMeta();
  const ok=results.filter(x=>x.status==='fulfilled').length; const el=document.getElementById('autoStatus'); if(el)el.textContent=`Series públicas cargadas directamente: ${ok}/${results.length}. Actualizando últimos datos…`;
}
function updateCoverage(){const coverage=document.getElementById('seriesCoverage');if(!coverage)return;coverage.innerHTML=Object.entries(seriesConfig).map(([k,c])=>{const ys=Object.keys(c.data).map(Number).filter(Number.isFinite).sort((a,b)=>a-b);return `<span><b>${c.title}</b> ${ys.length?`${ys[0]}–${ys.at(-1)} (${ys.length})`:'sin datos'}</span>`}).join('');}


// v119: índice de precios para el RIPTE real. Usa la cadena IPC completa si está cargada;
// si no, IPC INDEC mensual (histórico local, desde dic-2016) y, hacia atrás, la inflación anual dic/dic repartida en partes iguales por mes.
function salaryPriceIndex(months,fromYear=1994){
  const need=months||[];const covered=need.filter(ym=>Number.isFinite(Number(inflationIndex[ym]))).length;
  if(need.length&&covered>=need.length-2)return inflationIndex;
  const out={};const rows=(Array.isArray(kpiSourceCache?.ipc?.monthly)?kpiSourceCache.ipc.monthly:[]).filter(r=>Number.isFinite(Number(r.index))).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
  if(!rows.length)return inflationIndex;
  for(const r of rows)out[String(r.date).slice(0,7)]=Number(r.index);
  let anchorYm=String(rows[0].date).slice(0,7);if(!anchorYm.endsWith('-12')){const y=Number(anchorYm.slice(0,4))-1;if(out[`${y}-12`]==null){const r0=rows[0];if(anchorYm.endsWith('-01')&&Number.isFinite(Number(r0.value)))out[`${y}-12`]=Number(r0.index)/(1+Number(r0.value)/100);else return out;}anchorYm=`${y}-12`;}
  let decIdx=out[anchorYm];
  for(let y=Number(anchorYm.slice(0,4));y>=fromYear;y--){const inf=Number(inflation[y]);if(!Number.isFinite(inf))break;const prevDec=decIdx/(1+inf/100),g=Math.pow(1+inf/100,1/12);
    for(let m=1;m<=12;m++){const k=`${y}-${String(m).padStart(2,'0')}`;if(out[k]==null)out[k]=prevDec*Math.pow(g,m);}decIdx=prevDec;}
  return out;
}
function rebuildSalaryViews(){
  for(const o of [salaryArsReal,salaryUsdNominal,salaryUsdReal,salaryArsRealMonthly,salaryUsdNominalMonthly,salaryUsdRealMonthly])for(const k of Object.keys(o))delete o[k];
  // Vistas mensuales. Nunca se rellenan meses sin los insumos necesarios.
  const ripteMonths=Object.keys(salaryRipteMonthly).sort();
  const P=salaryPriceIndex(ripteMonths);
  const argCommon=ripteMonths.filter(ym=>Number.isFinite(Number(P[ym])));
  const argBaseYm=argCommon.at(-1), argBase=Number(P[argBaseYm]);
  if(Number.isFinite(argBase))for(const ym of argCommon){const sal=Number(salaryRipteMonthly[ym]),idx=Number(P[ym]);if(Number.isFinite(sal)&&Number.isFinite(idx)&&idx>0)salaryArsRealMonthly[ym]=sal*argBase/idx;}
  for(const ym of ripteMonths){
    const sal=Number(salaryRipteMonthly[ym]);
    // Desde 2011 usamos dólar libre mensual. Para 1994–2010, donde la fuente histórica
    // sólo ofrece referencia anual comparable, aplicamos ese valor a los meses del año.
    const monthlyFx=Number(fxFreeMonthlyNominal[ym]);
    const annualFx=Number(freeDollarNominal[ym.slice(0,4)]);
    const fx=Number.isFinite(monthlyFx)&&monthlyFx>0?monthlyFx:annualFx;
    if(!Number.isFinite(sal)||!Number.isFinite(fx)||fx<=0)continue;
    salaryUsdNominalMonthly[ym]=sal/fx;
    // exchangeHistorical ya publica ARS reales y TCR mensual con la misma base común ARG/EE.UU.
    // realFX/TCR = CPI_US_base/CPI_US_mes, por lo que permite expresar el salario en USD constantes.
    const realFxM=Number(fxFreeMonthlyReal[ym]),tcrM=Number(fxFreeMonthlyTcr[ym]);
    const realFxA=Number(freeDollarReal[ym.slice(0,4)]),tcrA=Number(fxFreeTcr[ym.slice(0,4)]);
    const realFx=Number.isFinite(realFxM)?realFxM:realFxA;
    const tcr=Number.isFinite(tcrM)?tcrM:tcrA;
    if(Number.isFinite(realFx)&&Number.isFinite(tcr)&&tcr>0)salaryUsdRealMonthly[ym]=(sal/fx)*(realFx/tcr);
  }
  // Mantener mapas anuales para compatibilidad con cobertura/resúmenes internos.
  const roll=(monthly,annual)=>{for(const [ym,v] of Object.entries(monthly).sort(([a],[b])=>a.localeCompare(b)))annual[ym.slice(0,4)]=v;};
  roll(salaryArsRealMonthly,salaryArsReal);roll(salaryUsdNominalMonthly,salaryUsdNominal);roll(salaryUsdRealMonthly,salaryUsdReal);
}

function applySalaryMode(){
  // La vista nominal no depende de IPC, dólar ni CPI-U: se grafica directamente.
  // Las transformaciones se construyen sólo cuando el usuario las solicita.
  if(salaryMode!=='arsNominal') rebuildSalaryViews();
  const maps={arsNominal:salaryRipteMonthly,arsReal:salaryArsRealMonthly,usdNominal:salaryUsdNominalMonthly,usdReal:salaryUsdRealMonthly};
  let requested=maps[salaryMode]||salaryRipte;
  let effective=salaryMode;
  if(!Object.keys(requested||{}).length){requested=salaryRipteMonthly;effective='arsNominal';}
  seriesConfig.salary.data=requested;
  const labels={arsNominal:'ARS corrientes',arsReal:'ARS constantes al último período',usdNominal:'USD corrientes',usdReal:'USD constantes al último CPI-U'};
  const fxNote=effective.startsWith('usd')?' · dólar libre (referencia anual 1994–2010; mensual desde 2011)':'';
  seriesConfig.salary.subtitle=`RIPTE · ${labels[effective]}${fxNote}${effective!==salaryMode?' · respaldo nominal':''}`;
}

const seriesConfig = {
  inflation:{title:'Inflación',subtitle:'IPC · %',source:'INDEC / San Luis / INDEC',data:inflation,note:'<strong>Metodología:</strong> una cadena mensual construida con niveles del IPC: INDEC histórico hasta dic-2006, IPC San Luis ene-2007–dic-2016 e IPC Nacional desde ene-2017. La vista anual punta a punta compara diciembre contra diciembre; promedio anual compara el índice promedio de 12 meses contra el promedio del año previo.'},
  gdp:{title:'PIB real',subtitle:'Variación anual · %',source:'INDEC / Datos Argentina / Banco Mundial',data:gdpGrowth,note:'<strong>Metodología:</strong> 1936–1960 se deriva de Cuentas Nacionales históricas a precios constantes; desde 1961 se usa la serie continua de crecimiento real del PIB del Banco Mundial (basada en cuentas nacionales oficiales/OCDE). La variación acumulada exige todos los años consecutivos del intervalo y nunca salta observaciones faltantes.'},
  poverty:{title:'Pobreza',subtitle:'Personas bajo la línea de pobreza · %',source:'UCA / INDEC',data:poverty,note:'<strong>Metodología:</strong> 1988–2002: INDEC EPH puntual, GBA, onda de octubre; 2003–2006: INDEC EPH continua, total de aglomerados, segundo semestre; 2007–2015: ODSA-UCA según el criterio solicitado; desde 2016: INDEC. <strong>Hay quiebres de cobertura y metodología:</strong> la línea sirve para contexto histórico, no como una serie homogénea sin ajustes.'},
  industry:{title:'Industria manufacturera',subtitle:'Variación anual del nivel de producción · %',source:'INDEC / Datos Argentina',data:industry,note:'<strong>Metodología:</strong> EMI histórico hasta 2015 e IPI manufacturero desde 2016. En ambos tramos se promedian los niveles mensuales del índice dentro de cada año y luego se calcula la variación anual. El empalme implica un cambio metodológico y se señala expresamente.'},
  unemployment:{title:'Desempleo',subtitle:'Tasa de desocupación · %',source:'INDEC · INDEC · EPH continua anual / OIT-LFS respaldo',data:unemployment,note:'<strong>Metodología:</strong> desde 2003 se usa el promedio anual de la tasa trimestral de desocupación de la EPH continua (total de aglomerados), agregado por la API oficial. Si esa consulta falla, se usa como respaldo la estimación nacional OIT-LFS/Banco Mundial. No se mezcla automáticamente con la EPH puntual anterior a 2003.'},
  tradeBalance:{title:'Balanza comercial',subtitle:'Saldo anual · millones de USD constantes al último CPI-U',source:'INDEC + BLS',data:tradeBalance,note:'<strong>Metodología:</strong> saldo comercial anual deflactado por el CPI-U de Estados Unidos (promedio anual), expresado por defecto en dólares constantes al último CPI-U disponible. Puede alternarse a USD corrientes.'},
  exports:{title:'Exportaciones',subtitle:'Total anual · millones de USD constantes al último CPI-U',source:'INDEC + BLS',data:exportsSeries,note:'<strong>Metodología:</strong> exportaciones FOB anuales deflactadas por CPI-U de EE.UU., expresadas por defecto en dólares constantes al último CPI-U disponible. Puede alternarse a USD corrientes.'},
  imports:{title:'Importaciones',subtitle:'Total anual · millones de USD constantes al último CPI-U',source:'INDEC + BLS',data:importsSeries,note:'<strong>Metodología:</strong> importaciones anuales deflactadas por CPI-U de EE.UU., expresadas por defecto en dólares constantes al último CPI-U disponible; consultar notas de fuente para FOB/CIF según tramo.'},
  countryRisk:{title:'Riesgo país',subtitle:'EMBI Argentina · diario · puntos básicos',source:'J.P. Morgan vía republicadores trazables',data:countryRisk,note:'<strong>Metodología:</strong> EMBI Argentina (J.P. Morgan) en puntos básicos, dato diario hasta el último cierre disponible. Se conserva la serie comparable desde enero de 1999; no se empalma hacia atrás con spreads de bonos de definición diferente.'},
  mervalUsd:{title:'Merval en USD constantes',subtitle:'S&P Merval en USD constantes (TCR) · diario',source:'BYMA vía zion.ar · BCRA (A3500) · ArgentinaDatos · BLS (CPI-U)',data:mervalUsdDaily,note:'<strong>Metodología:</strong> Merval diario desde octubre de 1996. En USD: 1996–2001 a 1 peso = 1 USD (convertibilidad); enero–marzo de 2002 sin tipo de cambio diario (hueco); marzo 2002–2010 dividido por el dólar mayorista A3500 del BCRA; 2011–2012 por el dólar libre como aproximación al CCL; desde 2013 Merval CCL. <b>USD constantes (TCR)</b>: el valor en dólares se ajusta por la inflación de EE.UU. (CPI-U) al último mes disponible. En 2019 el índice pasó a S&P Merval.'},
  freeDollar:{title:'Dólar libre',subtitle:'Venta · ARS constantes al último IPC por USD',source:'ArgentinaDatos / DolarApi + IPC compuesto',data:freeDollarReal,note:'<strong>Metodología:</strong> dólar blue/libre, punta vendedora, cierre anual. En modo real se expresa en pesos constantes al último IPC disponible usando la misma cadena de IPC del dashboard. No se empalma con mercados libres/paralelos históricos de regímenes cambiarios distintos.'},
  interestRate:{title:'Tasa de interés',subtitle:'Plazo fijo 30–59 días · tasa real anual · %',source:'BCRA / Datos Argentina',data:interestReal,note:'<strong>Metodología:</strong> tasa de depósitos a plazo fijo de 30–59 días, promedio anual. La tasa real se calcula exactamente con Fisher: (1+i)/(1+π)−1, usando la inflación anual compatible con el IPC compuesto del dashboard.'},
  salary:{title:'Salario promedio (RIPTE)',subtitle:'Remuneración imponible promedio de trabajadores estables · ARS',source:'Secretaría de Seguridad Social',data:salaryRipte,note:'<strong>Cobertura:</strong> RIPTE mide la remuneración imponible promedio de trabajadores estables registrados con al menos 13 meses continuos bajo las condiciones del SIPA. No representa el salario promedio de toda la población ocupada.'}
};

let historyChart; let currentSeries='inflation'; let currentRange='max'; let zoomFactor=1;
function chartDefaults(){
  Chart.defaults.font.family='Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif';
  Chart.defaults.color='#63758b';
}
function makeCharts(){
  if(!window.Chart) return;
  chartDefaults();
  const hero=document.getElementById('heroChart');
  if(hero) new Chart(hero,{type:'line',data:{labels:['Mar','Abr','May','Jun','Jul','Ago'],datasets:[{data:[3.0,2.8,2.4,2.1,2.1,1.7],borderColor:'#75b6ff',backgroundColor:'rgba(117,182,255,.12)',fill:true,tension:.35,pointRadius:0,borderWidth:2}]},options:{responsive:true,plugins:{legend:{display:false},tooltip:{enabled:true}},scales:{x:{display:false},y:{display:false}},animation:{duration:700}}});
  renderHistory('inflation');
}
function cumulativeSummary(key, shown){
  const el=document.getElementById('periodSummary'); if(!el)return;
  if(!shown || shown.length<2){el.textContent='Seleccioná al menos dos observaciones para calcular la variación acumulada.';return;}
  const a=shown[0][0], b=shown.at(-1)[0];
  // IMPORTANTE: first/last salen directamente de `shown`, el mismo array que
  // alimenta Chart.js. Así gráfico y resumen nunca pueden usar capas distintas.
  const first=Number(shown[0][1]), last=Number(shown.at(-1)[1]);
  const da=key==='salary'?displayMonth(a):DAILY_SERIES.has(key)?displayDay(a):a, db=key==='salary'?displayMonth(b):DAILY_SERIES.has(key)?displayDay(b):b;
  if(key==='gdp'){
    const start=Number(a), end=Number(b); let f=1; const missing=[];
    for(let y=start+1;y<=end;y++){if(gdpGrowth[y]==null){missing.push(y);continue;}f*=1+(+gdpGrowth[y]/100);}
    if(missing.length){el.innerHTML=`<strong>${a}–${b}:</strong> no se calcula el acumulado porque faltan ${missing.length} año(s): ${missing.slice(0,8).join(', ')}${missing.length>8?'…':''}.`;return;}
    const pct=(f-1)*100; el.innerHTML=`<strong>${a}–${b}:</strong> crecimiento real acumulado <b>${pct>=0?'+':''}${fmt.format(pct)}%</b> · índice 100 → ${fmt.format(100*f)}.`;
  } else if(['inflation','industry'].includes(key)){
    let f=1; for(const [,v] of shown) f*=1+(+v/100);
    const pct=(f-1)*100; el.innerHTML=`<strong>${a}–${b}:</strong> variación acumulada <b>${pct>=0?'+':''}${fmt.format(pct)}%</b>.`;
  } else if(['poverty','unemployment'].includes(key)){
    const pp=last-first; el.innerHTML=`<strong>${a}–${b}:</strong> cambio <b>${pp>=0?'+':''}${fmt.format(pp)} puntos porcentuales</b> (${fmt.format(first)}% → ${fmt.format(last)}%).`;
  } else if(key==='tradeBalance'){
    const delta=last-first; const mode=tradePriceMode==='real'?'USD constantes · último CPI-U':'USD corrientes'; el.innerHTML=`<strong>${a}–${b}:</strong> cambio del saldo <b>${delta>=0?'+':''}${fmt.format(delta)} M USD</b> <small>(${mode})</small>.`;
  } else {
    const pct=first!==0?(last/first-1)*100:null;
    const mode=['exports','imports'].includes(key)?` <small>(${tradePriceMode==='real'?'USD constantes · último CPI-U':'USD corrientes'})</small>`:'';
    el.innerHTML=pct==null?`<strong>${da}–${db}:</strong> no puede calcularse una variación porcentual con base cero.`:`<strong>${da}–${db}:</strong> variación acumulada <b>${pct>=0?'+':''}${fmt.format(pct)}%</b>${mode}.`;
  }
}
function displayMonth(ym){const [y,m]=ym.split('-');return `${MONTH_LABELS[+m-1]} ${y}`;}
function inflationDisplayData(){return inflationFrequency==='monthly'?inflationMonthly:inflation;}
function syncPeriodSelectors(data){
  let keys=Object.keys(data).sort(); const monthly=(currentSeries==='inflation'&&inflationFrequency==='monthly')||currentSeries==='salary';
  if(DAILY_SERIES.has(currentSeries))keys=[...new Set(keys.map(k=>k.slice(0,4)))]; if(!keys.length){for(const id of ['periodFrom','periodTo']){const el=document.getElementById(id);if(el)el.innerHTML='<option value="">—</option>';}return;}
  for(const id of ['periodFrom','periodTo']){const el=document.getElementById(id); if(!el)continue; const old=el.value; el.innerHTML=keys.map(k=>`<option value="${k}">${monthly?displayMonth(k):k}</option>`).join(''); el.value=keys.includes(old)?old:(id==='periodFrom'?keys[0]:keys.at(-1));}
}
function seriesValueLabel(key,v){
  if(key==='countryRisk') return `${fmt.format(v)} pb`;
  if(key==='mervalUsd') return mervalMode==='points'?`${fmt.format(v)} pts`:`USD ${fmt.format(v)}`;
  if(key==='salary') return salaryMode.startsWith('usd')?`USD ${fmt.format(v)}`:money.format(v);
  if(key==='freeDollar') return `$ ${fmt.format(v)} / USD`;
  if(['tradeBalance','exports','imports'].includes(key)) return `${fmt.format(v)} M USD`;
  return `${fmt.format(v)}%`;
}
function seriesTickLabel(key,v){
  if(key==='countryRisk') return `${fmt.format(v)} pb`;
  if(key==='mervalUsd') return mervalMode==='points'?new Intl.NumberFormat('es-AR',{notation:'compact',maximumFractionDigits:1}).format(v):`USD ${fmt.format(v)}`;
  if(key==='salary') return salaryMode.startsWith('usd')?`USD ${fmt.format(v)}`:money.format(v);
  if(key==='freeDollar') return `$ ${fmt.format(v)}`;
  if(['tradeBalance','exports','imports'].includes(key)) return fmt.format(v);
  return `${fmt.format(v)}%`;
}
function renderHistory(key){
  const visibility={
    inflationControls:key==='inflation',
    tradeControls:['tradeBalance','exports','imports'].includes(key),
    dollarControls:key==='freeDollar',
    rateControls:key==='interestRate',
    salaryControls:key==='salary',
    mervalControls:key==='mervalUsd'
  };
  for(const [id,show] of Object.entries(visibility)){const el=document.getElementById(id);if(el){el.hidden=!show;el.classList.toggle('hidden',!show);}}
  currentSeries=key; if(key==='mervalUsd')applyMervalMode(); const cfg=seriesConfig[key]; const isDaily=DAILY_SERIES.has(key); const isInflationMonthly=key==='inflation'&&inflationFrequency==='monthly'; const isSalaryMonthly=key==='salary'; const isMonthly=isInflationMonthly||isSalaryMonthly; let data;if(isInflationMonthly)data=inflationMonthly;else if(key==='salary'){applySalaryMode();data=cfg.data;if(!Object.keys(data||{}).length)data=salaryRipteMonthly;}else data=cfg.data;
  // RIPTE usa una ruta explícita: filtra cualquier valor no numérico antes de Chart.js.
  const cleanData=Object.fromEntries(Object.entries(data||{}).filter(([k,v])=>/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(k)&&Number.isFinite(Number(v))).map(([k,v])=>[k,Number(v)]));
  syncPeriodSelectors(cleanData);
  const all=Object.entries(cleanData).sort((a,b)=>a[0].localeCompare(b[0])); let shown=all;
  const from=document.getElementById('periodFrom')?.value, to=document.getElementById('periodTo')?.value;
  if(currentRange==='custom'&&from&&to)shown=all.filter(([x])=>x.slice(0,from.length)>=from&&x.slice(0,to.length)<=to); else if(['5','10','20'].includes(String(currentRange))&&all.length){const lastKey=all.at(-1)[0];const lastYear=Number(String(lastKey).slice(0,4));const cutoffYear=lastYear-Number(currentRange);shown=all.filter(([x])=>Number(String(x).slice(0,4))>=cutoffYear);}
  if(zoomFactor>1&&shown.length>4)shown=shown.slice(-Math.max(4,Math.ceil(shown.length/zoomFactor)));
  const labels=shown.map(x=>isDaily?displayDay(x[0]):isMonthly?displayMonth(x[0]):x[0]), values=shown.map(x=>x[1]);
  const empty=document.getElementById('chartEmpty');if(empty){empty.hidden=shown.length>0;empty.textContent=shown.length?'':`No se recibieron observaciones para ${cfg.title}.`;}
  const annualLabel=inflationAnnualMode==='eop'?'punta a punta (dic./dic.)':'promedio anual';
  document.getElementById('chartTitle').textContent=key==='inflation'?(isInflationMonthly?'Inflación mensual':`Inflación anual · ${annualLabel}`):cfg.title;
  document.getElementById('chartSubtitle').textContent=(key==='inflation'?(isInflationMonthly?'Variación respecto del mes anterior · %':`${annualLabel} · %`):(key==='salary'?cfg.subtitle:cfg.subtitle))+` · ${labels[0]||'—'}–${labels.at(-1)||'—'}`;
  document.getElementById('chartSource').textContent='Fuente: '+cfg.source;document.getElementById('methodNote').innerHTML=cfg.note;
  if(key==='inflation'&&shown.length){const a=shown[0][0],b=shown.at(-1)[0];let accumulated=null;if(isInflationMonthly){const firstIndex=inflationIndex[a], lastIndex=inflationIndex[b];if(firstIndex&&lastIndex)accumulated=(lastIndex/firstIndex-1)*100;}else{let f=1;for(const [,v] of shown)f*=1+v/100;accumulated=(f-1)*100;}document.getElementById('periodSummary').innerHTML=accumulated==null?'':`<strong>${isInflationMonthly?displayMonth(a):a}–${isInflationMonthly?displayMonth(b):b}:</strong> inflación acumulada <b>${fmt.format(accumulated)}%</b>.`;}
  else cumulativeSummary(key,shown);
  if(historyChart)historyChart.destroy();historyChart=new Chart(document.getElementById('historyChart'),{type:'line',data:{labels,datasets:[{label:cfg.title,data:values,borderColor:'#0b5bd3',backgroundColor:'rgba(11,91,211,.08)',fill:true,tension:.18,pointRadius:shown.length>35?0:2,pointHoverRadius:5,borderWidth:2.3}]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>seriesValueLabel(currentSeries,c.raw)}}},scales:{x:{grid:{display:false},ticks:{maxRotation:0,autoSkip:true,maxTicksLimit:12}},y:{grid:{color:'#edf2f7'},ticks:{callback:v=>seriesTickLabel(currentSeries,v)}}}}});
}
document.querySelectorAll('[data-series]').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('[data-series]').forEach(b=>b.classList.remove('active'));btn.classList.add('active');currentRange='max';zoomFactor=1;document.querySelectorAll('[data-range]').forEach(b=>b.classList.toggle('active',b.dataset.range==='max'));renderHistory(btn.dataset.series)}));
document.querySelectorAll('[data-range]').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('[data-range]').forEach(b=>b.classList.remove('active'));btn.classList.add('active');currentRange=btn.dataset.range;zoomFactor=1;renderHistory(currentSeries)}));
['periodFrom','periodTo'].forEach(id=>document.getElementById(id)?.addEventListener('change',()=>{const a=document.getElementById('periodFrom').value,b=document.getElementById('periodTo').value;if(a>b){if(id==='periodFrom')document.getElementById('periodTo').value=String(a);else document.getElementById('periodFrom').value=String(b);}currentRange='custom';document.querySelectorAll('[data-range]').forEach(x=>x.classList.remove('active'));zoomFactor=1;renderHistory(currentSeries);}));
document.querySelectorAll('[data-inf-frequency]').forEach(btn=>btn.addEventListener('click',()=>{inflationFrequency=btn.dataset.infFrequency;document.querySelectorAll('[data-inf-frequency]').forEach(b=>b.classList.toggle('active',b===btn));currentRange='max';renderHistory('inflation');}));
document.querySelectorAll('[data-inf-annual]').forEach(btn=>btn.addEventListener('click',()=>{inflationAnnualMode=btn.dataset.infAnnual;document.querySelectorAll('[data-inf-annual]').forEach(b=>b.classList.toggle('active',b===btn));rebuildAnnualInflation();renderHistory('inflation');}));
document.querySelectorAll('[data-trade-price]').forEach(btn=>btn.addEventListener('click',()=>{tradePriceMode=btn.dataset.tradePrice;document.querySelectorAll('[data-trade-price]').forEach(b=>b.classList.toggle('active',b===btn));if(tradePriceMode==='nominal'){for(const o of [tradeBalance,exportsSeries,importsSeries])for(const k of Object.keys(o))delete o[k];Object.assign(tradeBalance,tradeBalanceNominal);Object.assign(exportsSeries,exportsNominal);Object.assign(importsSeries,importsNominal);}else rebuildRealTrade();const real=tradePriceMode==='real';seriesConfig.tradeBalance.subtitle=`Saldo anual · millones de USD ${real?`constantes de ${tradeBasePeriod||'último CPI-U'}`:'corrientes'}`;seriesConfig.exports.subtitle=`Total anual · millones de USD ${real?`constantes de ${tradeBasePeriod||'último CPI-U'}`:'corrientes'}`;seriesConfig.imports.subtitle=`Total anual · millones de USD ${real?`constantes de ${tradeBasePeriod||'último CPI-U'}`:'corrientes'}`;renderHistory(currentSeries);}));
document.querySelectorAll('[data-dollar-price]').forEach(btn=>btn.addEventListener('click',()=>{dollarPriceMode=btn.dataset.dollarPrice;document.querySelectorAll('[data-dollar-price]').forEach(b=>b.classList.toggle('active',b===btn));seriesConfig.freeDollar.data=dollarPriceMode==='real'?freeDollarReal:freeDollarNominal;seriesConfig.freeDollar.subtitle=`Venta · ARS ${dollarPriceMode==='real'?`constantes de ${tradeBasePeriod||'último CPI-U'}`:'corrientes'} por USD`;renderHistory('freeDollar');}));
document.querySelectorAll('[data-rate-mode]').forEach(btn=>btn.addEventListener('click',()=>{interestMode=btn.dataset.rateMode;document.querySelectorAll('[data-rate-mode]').forEach(b=>b.classList.toggle('active',b===btn));seriesConfig.interestRate.data=interestMode==='real'?interestReal:interestNominal;seriesConfig.interestRate.subtitle=`Plazo fijo 30–59 días · tasa ${interestMode==='real'?'real':'nominal'} anual · %`;renderHistory('interestRate');}));
document.querySelectorAll('[data-salary-mode]').forEach(btn=>btn.addEventListener('click',()=>{salaryMode=btn.dataset.salaryMode;document.querySelectorAll('[data-salary-mode]').forEach(b=>b.classList.toggle('active',b===btn));applySalaryMode();renderHistory('salary');}));
document.querySelectorAll('[data-merval-mode]').forEach(btn=>btn.addEventListener('click',()=>{mervalMode=btn.dataset.mervalMode;document.querySelectorAll('[data-merval-mode]').forEach(b=>b.classList.toggle('active',b===btn));applyMervalMode();renderHistory('mervalUsd');}));
document.getElementById('zoomIn')?.addEventListener('click',()=>{zoomFactor=Math.min(8,zoomFactor*1.6);renderHistory(currentSeries)});
document.getElementById('zoomOut')?.addEventListener('click',()=>{zoomFactor=Math.max(1,zoomFactor/1.6);renderHistory(currentSeries)});

const FX_CONTROL_PERIODS=[
  {from:1931,to:1958,label:'Controles y tipos múltiples'},
  {from:1964,to:1966,label:'Restricciones / mercados diferenciados'},
  {from:1981,to:1989,label:'Controles y mercado paralelo'},
  {from:2002,to:2002,label:'Controles de emergencia / mercado dual'},
  {from:2011,to:2015,label:'Restricciones cambiarias'},
  {from:2019,to:2025,label:'Restricciones cambiarias'}
];
const fxRegimePlugin={id:'fxRegimes',beforeDatasetsDraw(chart){if(!document.getElementById('fxControlsToggle')?.checked)return;const {ctx,chartArea,scales}=chart;if(!chartArea)return;ctx.save();ctx.fillStyle='rgba(245,158,11,.10)';const labels=chart.data.labels||[];for(const r of FX_CONTROL_PERIODS){let a=labels.findIndex(x=>Number(String(x).slice(0,4))>=r.from),b=-1;for(let i=labels.length-1;i>=0;i--)if(Number(String(labels[i]).slice(0,4))<=r.to){b=i;break}if(a<0||b<0||b<a)continue;const x1=scales.x.getPixelForValue(a),x2=scales.x.getPixelForValue(b);ctx.fillRect(x1,chartArea.top,Math.max(2,x2-x1),chartArea.bottom-chartArea.top)}ctx.restore();}};
// v121: serie diaria extendida (1991→hoy) y derivados homogéneos: mensual (último dato del mes), ARS constantes,
// TCR y brecha, todos calculados con el mismo método para todo el período.
const fxMonthlyGap={};const fxFileDaily={free:{},official:{}};let fxFileEnd='';
let fxDailyPromise=null;
function loadFxDaily(){return fxDailyPromise??=(async()=>{try{const r=await fetch('/fx-daily.json?v=121',{cache:'no-store'});if(!r.ok)return;const j=await r.json();
  expandCompactDaily(j.free,fxFileDaily.free);expandCompactDaily(j.official,fxFileDaily.official);fxFileEnd=[j.free?.end,j.official?.end].filter(Boolean).sort().at(0)||'';
  rebuildFxDerived();if(window.Chart)renderFx();}catch(e){console.warn('fx daily',e);}})();}
function rebuildFxDerived(){
  // 1) Diario nominal: el archivo local (más preciso en 2011-2012) manda hasta su última fecha; la API agrega días posteriores.
  const applyFile=(file,dest)=>{const ks=Object.keys(file);if(!ks.length)return;const end=ks.reduce((m,k)=>k>m?k:m,'');
    for(const k of Object.keys(dest))if(k<=end&&file[k]==null)delete dest[k]; // dentro del período del archivo, sólo sus días (evita valores redondeados de otras fuentes)
    Object.assign(dest,file);};
  applyFile(fxFileDaily.free,fxFreeDailyNominal);applyFile(fxFileDaily.official,fxOfficialDailyNominal);
  if(!Object.keys(fxFreeDailyNominal).length&&!Object.keys(fxOfficialDailyNominal).length)return;
  // 2) Mensual nominal = último dato diario de cada mes.
  const lastOfMonth=(daily,dest)=>{const tmp={};for(const k of Object.keys(daily).sort())tmp[k.slice(0,7)]=daily[k];Object.assign(dest,tmp);};
  lastOfMonth(fxFreeDailyNominal,fxFreeMonthlyNominal);lastOfMonth(fxOfficialDailyNominal,fxOfficialMonthlyNominal);
  // 3) Índice de precios mensual (IPC; antes de 2017, inflación anual repartida por mes) y CPI de EE.UU.
  const months=Object.keys({...fxFreeMonthlyNominal,...fxOfficialMonthlyNominal}).sort();
  const P=salaryPriceIndex(months,1990),pKeys=Object.keys(P).filter(k=>Number.isFinite(Number(P[k]))).sort();if(!pKeys.length)return;
  const lastP=pKeys.at(-1),base=(fxBasePeriod&&P[fxBasePeriod]!=null)?fxBasePeriod:lastP;fxBasePeriod=base;
  const pOf=ym=>{if(P[ym]!=null)return Number(P[ym]);if(ym>lastP)return Number(P[lastP]);return null;};
  const usKeys=Object.keys(usCpiMonthlyMap).sort();const usOf=ym=>{if(usCpiMonthlyMap[ym]!=null)return Number(usCpiMonthlyMap[ym]);if(usKeys.length&&ym>usKeys.at(-1))return Number(usCpiMonthlyMap[usKeys.at(-1)]);const a=Number(usCpiAnnual[ym.slice(0,4)]);return Number.isFinite(a)?a:null;};
  const pb=pOf(base),ub=usOf(base);
  const derive=(nom,real,tcr,keyToYm)=>{for(const k of Object.keys(real))delete real[k];for(const k of Object.keys(tcr))delete tcr[k];
    for(const [k,v] of Object.entries(nom)){const ym=keyToYm(k),p=pOf(ym);if(!p||!pb)continue;const r=Number(v)*pb/p;real[k]=Number(r.toFixed(4));const u=usOf(ym);if(u&&ub)tcr[k]=Number((r*u/ub).toFixed(4));}};
  derive(fxFreeMonthlyNominal,fxFreeMonthlyReal,fxFreeMonthlyTcr,k=>k);derive(fxOfficialMonthlyNominal,fxOfficialMonthlyReal,fxOfficialMonthlyTcr,k=>k);
  derive(fxFreeDailyNominal,fxFreeDailyReal,fxFreeDailyTcr,k=>k.slice(0,7));derive(fxOfficialDailyNominal,fxOfficialDailyReal,fxOfficialDailyTcr,k=>k.slice(0,7));
  // 4) Brecha diaria (mismo día; si falta el oficial, el último de los 5 días previos) y mensual.
  for(const k of Object.keys(fxDailyGap))delete fxDailyGap[k];for(const k of Object.keys(fxMonthlyGap))delete fxMonthlyGap[k];
  const offKeys=Object.keys(fxOfficialDailyNominal).sort();let j=0;
  for(const d of Object.keys(fxFreeDailyNominal).sort()){while(j+1<offKeys.length&&offKeys[j+1]<=d)j++;const od=offKeys[j];if(!od||od>d)continue;if((new Date(d)-new Date(od))/864e5>5)continue;const f=Number(fxFreeDailyNominal[d]),o=Number(fxOfficialDailyNominal[od]);if(o>0&&Number.isFinite(f))fxDailyGap[d]=Number(((f/o-1)*100).toFixed(2));}
  for(const [ym,f] of Object.entries(fxFreeMonthlyNominal)){const o=Number(fxOfficialMonthlyNominal[ym]);if(o>0&&Number.isFinite(Number(f)))fxMonthlyGap[ym]=Number(((Number(f)/o-1)*100).toFixed(2));}
}
function fxAnnualData(){if(fxSeriesMode==='gap')return fxGap;if(fxSeriesMode==='official')return fxPriceMode==='tcr'?fxOfficialTcr:fxPriceMode==='real'?fxOfficialReal:fxOfficialNominal;return fxPriceMode==='tcr'?fxFreeTcr:fxPriceMode==='real'?freeDollarReal:freeDollarNominal;}
function fxMonthlyData(){if(fxSeriesMode==='gap')return fxMonthlyGap;if(fxSeriesMode==='official')return fxPriceMode==='tcr'?fxOfficialMonthlyTcr:fxPriceMode==='real'?fxOfficialMonthlyReal:fxOfficialMonthlyNominal;return fxPriceMode==='tcr'?fxFreeMonthlyTcr:fxPriceMode==='real'?fxFreeMonthlyReal:fxFreeMonthlyNominal;}
function fxDailyData(){if(fxSeriesMode==='gap')return fxDailyGap;if(fxSeriesMode==='official')return fxPriceMode==='tcr'?fxOfficialDailyTcr:fxPriceMode==='real'?fxOfficialDailyReal:fxOfficialDailyNominal;return fxPriceMode==='tcr'?fxFreeDailyTcr:fxPriceMode==='real'?fxFreeDailyReal:fxFreeDailyNominal;}
function fxDateKey(k){return /^\d{4}-\d{2}-\d{2}$/.test(k)?k:`${k}-12-31`;}
function fxBaseLabel(){if(!fxBasePeriod)return 'último IPC';const [y,m]=String(fxBasePeriod).split('-');const i=Number(m)-1;const label=Number.isInteger(i)&&i>=0&&i<MONTH_LABELS.length?MONTH_LABELS[i]:m;return `${label||''}-${y||''}`.replace(/^-|-$/g,'')||'último IPC';}
function fxSelectedSpanYears(){
  if(['5','10','20'].includes(String(fxRange))) return Number(fxRange);
  if(fxRange==='custom'&&fxCustomFrom&&fxCustomTo){
    const a=new Date(fxCustomFrom+'T00:00:00'),b=new Date(fxCustomTo+'T00:00:00');
    if(Number.isFinite(a.getTime())&&Number.isFinite(b.getTime())) return Math.max(0,(b-a)/(365.2425*86400000));
  }
  return 999;
}
function fxCombinedData(){const annual=fxAnnualData(),monthly=fxMonthlyData(),daily=fxDailyData(),out={};const spanYears=fxSelectedSpanYears();let f=fxFrequency;if(f==='auto')f=spanYears<=5?'daily':spanYears<=20?'monthly':'annual';if(f==='annual'){for(const [k,v] of Object.entries(annual))out[fxDateKey(k)]=v;}else if(f==='monthly'){for(const [k,v] of Object.entries(monthly))out[`${k}-28`]=v;}else if(f==='daily'){for(const [k,v] of Object.entries(daily))out[k]=v;}return out;}
function renderFx(){if(!window.Chart)return;let all=Object.entries(fxCombinedData()).sort((a,b)=>a[0].localeCompare(b[0]));const last=all.at(-1)?.[0];if(['5','10','20'].includes(String(fxRange))&&last){const d=new Date(last+'T00:00:00');d.setFullYear(d.getFullYear()-Number(fxRange));all=all.filter(([k])=>k>=d.toISOString().slice(0,10));}if(fxRange==='custom'){if(fxCustomFrom)all=all.filter(([k])=>k>=fxCustomFrom);if(fxCustomTo)all=all.filter(([k])=>k<=fxCustomTo);}if(fxZoomFactor>1&&all.length>10)all=all.slice(-Math.max(10,Math.ceil(all.length/fxZoomFactor)));const labels=all.map(x=>x[0]),values=all.map(x=>x[1]);const gap=fxSeriesMode==='gap';document.getElementById('fxTitle').textContent=gap?'Brecha cambiaria':fxSeriesMode==='official'?'Dólar oficial':'Dólar libre / de mercado';document.getElementById('fxSubtitle').textContent=gap?'Diferencia libre vs. oficial · %':fxPriceMode==='tcr'?`TCR bilateral · base ${fxBaseLabel()}`:`ARS ${fxPriceMode==='real'?`constantes de ${fxBaseLabel()}`:'corrientes'} por USD`;document.querySelectorAll('[data-fx-price]').forEach(b=>b.disabled=gap);const e=document.getElementById('fxEmpty');e.hidden=all.length>0;e.textContent=all.length?'':'Sin observaciones verificadas para esta combinación.';if(all.length>1){const f=all[0][1],l=all.at(-1)[1],pct=f?((l/f)-1)*100:null;document.getElementById('fxSummary').innerHTML=gap?`<strong>${labels[0]}–${labels.at(-1)}:</strong> brecha ${fmt.format(f)}% → <b>${fmt.format(l)}%</b>.`:`<strong>${labels[0]}–${labels.at(-1)}:</strong> variación <b>${pct>=0?'+':''}${fmt.format(pct)}%</b> · ${all.length} observaciones.`;}else document.getElementById('fxSummary').textContent='';if(fxChart)fxChart.destroy();fxChart=new Chart(document.getElementById('fxChart'),{type:'line',plugins:[fxRegimePlugin],data:{labels,datasets:[{label:document.getElementById('fxTitle').textContent,data:values,borderColor:'#0b5bd3',backgroundColor:'rgba(11,91,211,.08)',fill:true,tension:all.length>100?0:.15,pointRadius:all.length>80?0:2,pointHoverRadius:5,borderWidth:2.3}]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'nearest',axis:'x',intersect:false},plugins:{legend:{display:false},tooltip:{enabled:true,displayColors:false,callbacks:{title:items=>items.length?items[0].label:'',label:c=>gap?`Brecha: ${fmt.format(c.raw)}%`:`Cotización: $ ${fmt.format(c.raw)} / USD`}}},scales:{x:{grid:{display:false},ticks:{maxTicksLimit:12,callback:function(v){const x=this.getLabelForValue(v);return /^\d{4}-12-31$/.test(x)?x.slice(0,4):x;}}},y:{grid:{color:'#edf2f7'},ticks:{callback:v=>gap?v+'%':fmt.format(v)}}}}});}
document.querySelectorAll('[data-fx-series]').forEach(b=>b.addEventListener('click',()=>{fxSeriesMode=b.dataset.fxSeries;document.querySelectorAll('[data-fx-series]').forEach(x=>x.classList.toggle('active',x===b));fxZoomFactor=1;renderFx()}));
document.querySelectorAll('[data-fx-price]').forEach(b=>b.addEventListener('click',()=>{fxPriceMode=b.dataset.fxPrice;document.querySelectorAll('[data-fx-price]').forEach(x=>x.classList.toggle('active',x===b));renderFx()}));
document.querySelectorAll('[data-fx-frequency]').forEach(b=>b.addEventListener('click',()=>{fxFrequency=b.dataset.fxFrequency;document.querySelectorAll('[data-fx-frequency]').forEach(x=>x.classList.toggle('active',x===b));renderFx()}));
document.querySelectorAll('[data-fx-range]').forEach(b=>b.addEventListener('click',()=>{fxRange=b.dataset.fxRange;fxZoomFactor=1;document.querySelectorAll('[data-fx-range]').forEach(x=>x.classList.toggle('active',x===b));renderFx()}));
document.getElementById('fxZoomIn')?.addEventListener('click',()=>{fxZoomFactor=Math.min(64,fxZoomFactor*2);renderFx()});
document.getElementById('fxZoomOut')?.addEventListener('click',()=>{fxZoomFactor=Math.max(1,fxZoomFactor/2);renderFx()});
document.getElementById('fxApplyPeriod')?.addEventListener('click',()=>{fxCustomFrom=document.getElementById('fxPeriodFrom')?.value||'';fxCustomTo=document.getElementById('fxPeriodTo')?.value||'';if(fxCustomFrom&&fxCustomTo&&fxCustomFrom>fxCustomTo)[fxCustomFrom,fxCustomTo]=[fxCustomTo,fxCustomFrom];fxRange='custom';fxZoomFactor=1;document.querySelectorAll('[data-fx-range]').forEach(x=>x.classList.remove('active'));renderFx()});
document.getElementById('fxControlsToggle')?.addEventListener('change',renderFx);

function fillSelect(id,data,selected){const el=document.getElementById(id);if(!el)return;el.innerHTML='';Object.keys(data).sort((a,b)=>+a-+b).forEach(y=>{const o=document.createElement('option');o.value=y;o.textContent=y;if(+y===selected)o.selected=true;el.appendChild(o)})}
function fillMonthYear(prefix,minYear,maxYear,startYm,endYm){
  const ms=document.getElementById(prefix+'StartMonth'),me=document.getElementById(prefix+'EndMonth'),ys=document.getElementById(prefix+'StartYear'),ye=document.getElementById(prefix+'EndYear'); if(!ms||!me||!ys||!ye)return;
  const monthOpts=MONTH_LABELS.map((m,i)=>`<option value="${String(i+1).padStart(2,'0')}">${m}</option>`).join('');ms.innerHTML=monthOpts;me.innerHTML=monthOpts;
  const years=[];for(let y=minYear;y<=maxYear;y++)years.push(`<option value="${y}">${y}</option>`);ys.innerHTML=years.join('');ye.innerHTML=years.join('');
  const [sy,sm]=startYm.split('-'),[ey,em]=endYm.split('-');ys.value=sy;ms.value=sm;ye.value=ey;me.value=em;
}
function selectedYm(prefix,side){return `${document.getElementById(prefix+side+'Year').value}-${document.getElementById(prefix+side+'Month').value}`}
function monthFactorFromIndex(map,a,b){const A=map[a],B=map[b];return Number.isFinite(A)&&Number.isFinite(B)&&B>0&&A>0?B/A:null}
function gdpApproxFactor(a,b){
  const [ay,am]=a.split('-').map(Number),[by,bm]=b.split('-').map(Number);if(b<=a)return null;let f=1;
  for(let y=ay;y<=by;y++){const from=y===ay?am:1,to=y===by?bm:12;if(to<from)continue;const g=gdpGrowth[y];if(g==null)return null;f*=Math.pow(1+g/100,(to-from+(y===by?0:1))/12);}
  return f;
}
function calcMonthlyFactor(map,a,b){const x=Number(map[a]),y=Number(map[b]);return Number.isFinite(x)&&Number.isFinite(y)&&x>0?y/x:null;}
function currentYmAR(){const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit'}).formatToParts(new Date());const o=Object.fromEntries(parts.map(p=>[p.type,p.value]));return `${o.year}-${o.month}`;}
function monthOffset(ym,delta){const [y,m]=ym.split('-').map(Number);const d=new Date(Date.UTC(y,m-1+delta,1));return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;}
function currentDateAR(){const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());const o=Object.fromEntries(parts.map(p=>[p.type,p.value]));return `${o.year}-${o.month}-${o.day}`;}
function monthlyMapForIndex(kind){return ({icl:iclMonthly,cer:cerMonthly,uva:uvaMonthly}[kind]||{});}
function dailyMapForIndex(kind){return ({icl:iclDaily,cer:cerDaily,uva:uvaDaily}[kind]||{});}
function hasDailyIndex(kind){return Object.keys(dailyMapForIndex(kind)).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&d<=currentDateAR()).length>=2;}
function availableMonthsForIndex(kind){if(kind==='ipc')return Object.keys(ipcCalcIndex).length?Object.keys(ipcCalcIndex).sort():Object.keys(inflationIndex).sort();if(hasDailyIndex(kind))return [...new Set(Object.keys(dailyMapForIndex(kind)).filter(d=>d<=currentDateAR()).map(d=>d.slice(0,7)))].sort();return Object.keys(monthlyMapForIndex(kind)).filter(k=>/^\d{4}-\d{2}$/.test(k)&&k<=currentYmAR()).sort();}
function availableDatesForIndex(kind){const daily={icl:iclDaily,cer:cerDaily,uva:uvaDaily}[kind]||{};return Object.keys(daily).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&d<=currentDateAR()).sort();}
function syncUpdateIndexAvailability(){const sel=document.getElementById('updateIndex');if(!sel)return;for(const opt of sel.options){const ok=(opt.value==='ipc'?availableMonthsForIndex('ipc'):(hasDailyIndex(opt.value)?availableDatesForIndex(opt.value):availableMonthsForIndex(opt.value))).length>=2;opt.disabled=!ok;opt.textContent=opt.textContent.replace(/ · sin datos disponibles$/,'')+(ok?'':' · sin datos disponibles');}if(sel.selectedOptions[0]?.disabled){const first=[...sel.options].find(o=>!o.disabled);if(first)sel.value=first.value;}}
function fillUpdateDates(kind){
  const daily=kind!=='ipc'&&hasDailyIndex(kind), keys=daily?availableDatesForIndex(kind):availableMonthsForIndex(kind).filter(k=>k<=currentYmAR());
  const dayWraps=[document.getElementById('updateStartDayWrap'),document.getElementById('updateEndDayWrap')];dayWraps.forEach(x=>{if(x)x.hidden=!daily;});
  const ids=['updateStartMonth','updateStartYear','updateEndMonth','updateEndYear'];
  if(!keys.length){for(const id of ids){const el=document.getElementById(id);if(el)el.innerHTML='<option value="">—</option>';}return false;}
  const last=keys.at(-1), lastYm=last.slice(0,7), target=monthOffset(lastYm,-12);
  let first;if(daily){first=keys.find(k=>k>=target+'-01')||keys[0];}else first=keys.filter(k=>k<=target).at(-1)||keys[0];
  for(const side of ['Start','End']){const key=side==='Start'?first:last,[y,m,d]=key.split('-'),ys=document.getElementById(`update${side}Year`),ms=document.getElementById(`update${side}Month`);const years=[...new Set(keys.map(k=>k.slice(0,4)))];if(ys){ys.innerHTML=years.map(v=>`<option value="${v}">${v}</option>`).join('');ys.value=y;}if(ms){const months=[...new Set(keys.filter(k=>k.startsWith(y+'-')).map(k=>k.slice(5,7)))];ms.innerHTML=months.map(v=>`<option value="${v}">${MONTH_LABELS[Number(v)-1]}</option>`).join('');ms.value=m;}if(daily)syncUpdateDays(side,d);}
  return true;
}
function syncUpdateMonths(side){const kind=document.getElementById('updateIndex')?.value||'ipc',daily=kind!=='ipc'&&hasDailyIndex(kind),keys=daily?availableDatesForIndex(kind):availableMonthsForIndex(kind),y=document.getElementById(`update${side}Year`)?.value,el=document.getElementById(`update${side}Month`);if(!y||!el)return;const old=el.value,months=[...new Set(keys.filter(k=>k.startsWith(y+'-')).map(k=>k.slice(5,7)))];el.innerHTML=months.map(m=>`<option value="${m}">${MONTH_LABELS[Number(m)-1]}</option>`).join('');el.value=months.includes(old)?old:(side==='Start'?months[0]:months.at(-1));if(daily)syncUpdateDays(side);}
function syncUpdateDays(side,preferred){const kind=document.getElementById('updateIndex')?.value||'ipc';if(kind==='ipc'||!hasDailyIndex(kind))return;const y=document.getElementById(`update${side}Year`)?.value,m=document.getElementById(`update${side}Month`)?.value,el=document.getElementById(`update${side}Day`);if(!y||!m||!el)return;const days=availableDatesForIndex(kind).filter(k=>k.startsWith(`${y}-${m}-`)).map(k=>k.slice(8,10)),old=preferred||el.value;el.innerHTML=days.map(d=>`<option value="${d}">${Number(d)}</option>`).join('');el.value=days.includes(old)?old:(side==='Start'?days[0]:days.at(-1));}
function selectedUpdateDate(side,kind){const y=document.getElementById(`update${side}Year`).value,m=document.getElementById(`update${side}Month`).value;if(kind==='ipc'||!hasDailyIndex(kind))return `${y}-${m}`;return `${y}-${m}-${document.getElementById(`update${side}Day`).value}`;}
function displayCalcDate(k){if(/^\d{4}-\d{2}-\d{2}$/.test(k)){const [y,m,d]=k.split('-');return `${Number(d)} ${MONTH_LABELS[Number(m)-1]} ${y}`;}return displayMonth(k);}
function updateCalcMeta(){syncUpdateIndexAvailability();const kind=document.getElementById('updateIndex')?.value||'ipc',el=document.getElementById('updateLatest'),method=document.getElementById('updateMethod'),has=fillUpdateDates(kind);if(!has){if(el)el.textContent=`${kind.toUpperCase()}: sin datos disponibles.`;return;}if(kind==='ipc'){const ipcMap=Object.keys(ipcCalcIndex).length?ipcCalcIndex:inflationIndex,k=Object.keys(ipcMap).sort().at(-1);if(el)el.innerHTML=k?`Último dato disponible: <strong>${displayMonth(k)}</strong> · IPC mensual INDEC`:'IPC: cargando…';if(method)method.textContent='IPC: actualización por cociente entre los índices de precios de los meses seleccionados.';return;}const daily=hasDailyIndex(kind),map=daily?dailyMapForIndex(kind):monthlyMapForIndex(kind),k=(daily?availableDatesForIndex(kind):availableMonthsForIndex(kind)).at(-1);if(el)el.innerHTML=k?`Último dato vigente: <strong>${displayCalcDate(k)}</strong> · ${kind.toUpperCase()} <strong>${fmt.format(map[k])}</strong> · <em>${daily?'frecuencia diaria':'frecuencia mensual (fallback)'}</em>`:`${kind.toUpperCase()}: sin datos vigentes cargados.`;if(method)method.textContent=daily?`${kind.toUpperCase()}: actualización por cociente entre los valores diarios oficiales del BCRA para las fechas seleccionadas. No se usan observaciones futuras.`:`${kind.toUpperCase()}: el backend disponible aún no expone la serie diaria; se usa temporalmente el valor mensual oficial para mantener operativa la calculadora.`;}
document.getElementById('updateIndex')?.addEventListener('change',updateCalcMeta);
document.getElementById('updateStartYear')?.addEventListener('change',()=>syncUpdateMonths('Start'));document.getElementById('updateEndYear')?.addEventListener('change',()=>syncUpdateMonths('End'));document.getElementById('updateStartMonth')?.addEventListener('change',()=>syncUpdateDays('Start'));document.getElementById('updateEndMonth')?.addEventListener('change',()=>syncUpdateDays('End'));
document.getElementById('updateCalc')?.addEventListener('submit',e=>{e.preventDefault();const kind=document.getElementById('updateIndex').value,a=selectedUpdateDate('Start',kind),b=selectedUpdateDate('End',kind),amt=+document.getElementById('updateAmount').value,el=document.getElementById('updateResult');if(b<=a){el.textContent='La fecha final debe ser posterior a la inicial.';return;}const map=kind==='ipc'?(Object.keys(ipcCalcIndex).length?ipcCalcIndex:inflationIndex):(hasDailyIndex(kind)?dailyMapForIndex(kind):monthlyMapForIndex(kind)),initial=Number(map[a]),final=Number(map[b]),f=Number.isFinite(initial)&&Number.isFinite(final)&&initial>0?final/initial:null;if(!f){el.textContent='No hay valores disponibles para ambas fechas seleccionadas.';return;}const fIdx=new Intl.NumberFormat('es-AR',{minimumFractionDigits:2,maximumFractionDigits:4}),fPct=new Intl.NumberFormat('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2}),fFac=new Intl.NumberFormat('es-AR',{minimumFractionDigits:4,maximumFractionDigits:4});el.innerHTML=`Índice inicial (${displayCalcDate(a)}): <strong>${fIdx.format(initial)}</strong><br>Índice final (${displayCalcDate(b)}): <strong>${fIdx.format(final)}</strong><br>Variación ${kind.toUpperCase()}: <strong>${fPct.format((f-1)*100)}%</strong>${amt>0?`<br>${money.format(amt)} → <strong>${money.format(amt*f)}</strong>.`:''}<br><small>Factor ${fFac.format(f)} = índice final / índice inicial.</small>`;});

let agendaEvents=[];
function renderAgenda(events){
  agendaEvents=(events||agendaEvents).slice(0,10); const box=document.getElementById('agendaList');if(!box)return;
  if(!agendaEvents.length){box.innerHTML='<div class="agenda-empty">No hay próximas fechas confirmadas para los indicadores seleccionados.</div>';return;}
  box.innerHTML=agendaEvents.map(e=>{const d=new Date(e.date+'T12:00:00'),day=String(d.getDate()).padStart(2,'0'),mon=d.toLocaleDateString('es-AR',{month:'short'}).replace('.','').toUpperCase();return `<article><time datetime="${e.date}"><b>${day}</b> ${mon}</time><div><span>${e.agency}${e.period?` · ${e.period}`:''}</span><h3>${e.title}</h3><p>Fecha confirmada${e.time?` · ${e.time}`:''}</p></div></article>`}).join('');
}
async function loadAgenda(){
  try{const r=await fetch('/api/calendar-data',{headers:{accept:'application/json'}});if(!r.ok)throw new Error(`Agenda API ${r.status}`);const data=await r.json();renderAgenda(data.events||[]);}catch(err){console.warn('[agenda]',err);const box=document.getElementById('agendaList');if(box)box.innerHTML='<div class="agenda-empty">Agenda temporalmente no disponible.</div>';}
}
function safeApply(name,fn){try{return fn();}catch(err){console.warn(`[${name}]`,err);return null;}}
function setKpi(key,value,period,detail){const card=document.querySelector(`.kpi[data-kpi="${key}"]`);if(!card)return;const v=card.querySelector('[data-value]'),p=card.querySelector('[data-period]'),d=card.querySelector('[data-detail]'),h=card.querySelector('[data-health]');if(v)v.textContent=value;if(p)p.textContent=period;if(d)d.textContent=detail;if(h){h.textContent='Fuente verificada';h.className='data-health live';}card.dataset.live='true';try{if(cardStatusCache)queueMicrotask(applyCardStatus);}catch{}}
function toneClass(n){const x=Number(n);return !Number.isFinite(x)||Math.abs(x)<0.0001?'tone-flat':x>0?'tone-up':'tone-down';}
function applyTone(el,n){if(!el)return;el.classList.remove('tone-up','tone-down','tone-flat','down');el.classList.add(toneClass(n));}
function ymFromSpanishPeriod(s){const m={ene:'01',enero:'01',feb:'02',febrero:'02',mar:'03',marzo:'03',abr:'04',abril:'04',may:'05',mayo:'05',jun:'06',junio:'06',jul:'07',julio:'07',ago:'08',agosto:'08',sep:'09',sept:'09',septiembre:'09',set:'09',setiembre:'09',oct:'10',octubre:'10',nov:'11',noviembre:'11',dic:'12',diciembre:'12'};const z=String(s||'').toLowerCase().match(/(enero|ene|febrero|feb|marzo|mar|abril|abr|mayo|may|junio|jun|julio|jul|agosto|ago|septiembre|sept|sep|setiembre|set|octubre|oct|noviembre|nov|diciembre|dic)\s+(20\d{2})/);return z?`${z[2]}-${m[z[1]]}`:null;}
function signedPct(n){const x=Number(n);return `${x>0?'+':x<0?'−':''}${fmt.format(Math.abs(x))}%`;}
function signedPp(n){const x=Number(n);return `${x>0?'+':x<0?'−':''}${fmt.format(Math.abs(x))} p.p. i.a.`;}
function setFiscalKpi(f){const card=document.querySelector('.kpi[data-kpi="fiscal"]');if(!card||!f)return;const ym=ymFromSpanishPeriod(f.period)||String(f.period||'').match(/20\d{2}-\d{2}/)?.[0],prev=ym?`${Number(ym.slice(0,4))-1}${ym.slice(4)}`:null;const hp=f.historyPctGDP||{},pNow=ym?Number(hp.primary?.[ym]):NaN,pPrev=prev?Number(hp.primary?.[prev]):NaN,fNow=ym?Number(hp.financial?.[ym]):NaN,fPrev=prev?Number(hp.financial?.[prev]):NaN;const pCalc=Number.isFinite(pNow)&&Number.isFinite(pPrev)?Number((pNow-pPrev).toFixed(2)):NaN,fCalc=Number.isFinite(fNow)&&Number.isFinite(fPrev)?Number((fNow-fPrev).toFixed(2)):NaN,pExplicit=Number(f.yoyPp?.primary),fExplicit=Number(f.yoyPp?.financial),pDelta=Number.isFinite(pExplicit)?pExplicit:pCalc,fDelta=Number.isFinite(fExplicit)?fExplicit:fCalc;const pctGDP=n=>Number.isFinite(n)?`${n>0?'+':''}${fmt.format(n)}%`:'—';const prevLabel=prev?`vs ${MONTH_LABELS[Number(prev.slice(5,7))-1].toLowerCase()} ${prev.slice(0,4)}`:'vs mismo mes año anterior';const pv=card.querySelector('[data-fiscal-primary]'),fv=card.querySelector('[data-fiscal-financial]'),pd=card.querySelector('[data-fiscal-primary-yoy]'),fd=card.querySelector('[data-fiscal-financial-yoy]');if(pv)pv.textContent=pctGDP(pNow);if(fv)fv.textContent=pctGDP(fNow);if(pd){pd.textContent=Number.isFinite(pDelta)?`${signedPp(pDelta)} ${prevLabel}`:`— ${prevLabel}`;applyTone(pd,pDelta);}if(fd){fd.textContent=Number.isFinite(fDelta)?`${signedPp(fDelta)} ${prevLabel}`:`— ${prevLabel}`;applyTone(fd,fDelta);}const per=card.querySelector('[data-period]');if(per)per.textContent=`${f.period} · como % del PBI`;const hidden=card.querySelector('[data-value]');if(hidden)hidden.textContent=`Primario ${pctGDP(pNow)} · Financiero ${pctGDP(fNow)} · como % del PBI`;const h=card.querySelector('[data-health]');if(h){h.textContent='Fuente verificada';h.className='data-health live';}card.dataset.live='true';try{if(cardStatusCache)queueMicrotask(applyCardStatus);}catch{}}
function hydrateCalculatorSources(S){
  for(const map of [ipcCalcIndex,iclMonthly,cerMonthly,uvaMonthly,iclDaily,cerDaily,uvaDaily])for(const k of Object.keys(map))delete map[k];
  if(S.ipc?.status==='ok')for(const row of (Array.isArray(S.ipc.monthly)?S.ipc.monthly:[])){const k=String(row?.date||''),v=Number(row?.index);if(/^\d{4}-\d{2}$/.test(k)&&Number.isFinite(v)&&v>0)ipcCalcIndex[k]=v;}
  if(S.icl?.status==='ok'){for(const [k,v0] of Object.entries(S.icl.monthly||{})){const v=Number(v0);if(/^\d{4}-\d{2}$/.test(k)&&Number.isFinite(v)&&v>0)iclMonthly[k]=v;}for(const [k,v0] of Object.entries(S.icl.daily||{})){const v=Number(v0);if(/^\d{4}-\d{2}-\d{2}$/.test(k)&&Number.isFinite(v)&&v>0)iclDaily[k]=v;}}
  if(S.contractIndices?.cer?.status==='ok'){for(const [k,v0] of Object.entries(S.contractIndices.cer.monthly||{})){const v=Number(v0);if(/^\d{4}-\d{2}$/.test(k)&&Number.isFinite(v)&&v>0)cerMonthly[k]=v;}for(const [k,v0] of Object.entries(S.contractIndices.cer.daily||{})){const v=Number(v0);if(/^\d{4}-\d{2}-\d{2}$/.test(k)&&Number.isFinite(v)&&v>0)cerDaily[k]=v;}}
  if(S.contractIndices?.uva?.status==='ok'){for(const [k,v0] of Object.entries(S.contractIndices.uva.monthly||{})){const v=Number(v0);if(/^\d{4}-\d{2}$/.test(k)&&Number.isFinite(v)&&v>0)uvaMonthly[k]=v;}for(const [k,v0] of Object.entries(S.contractIndices.uva.daily||{})){const v=Number(v0);if(/^\d{4}-\d{2}-\d{2}$/.test(k)&&Number.isFinite(v)&&v>0)uvaDaily[k]=v;}}
  syncUpdateIndexAvailability();updateCalcMeta();
}
function releaseSortKey(raw){
  const s=String(raw||'').trim().toLowerCase();
  if(/^\d{4}-\d{2}-\d{2}/.test(s))return s.slice(0,10);
  if(/^\d{4}-\d{2}$/.test(s))return `${s}-01`;
  const months={ene:'01',feb:'02',mar:'03',abr:'04',may:'05',jun:'06',jul:'07',ago:'08',sep:'09',oct:'10',nov:'11',dic:'12'};
  const m=s.match(/(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)[a-záéíóú.]*\s+(20\d{2})/i);
  return m?`${m[2]}-${months[m[1].slice(0,3)]}-01`:'';
}
function renderLatestRelease(releases){
  const valid=(releases||[]).map(x=>({...x,sortKey:x.releaseDate||releaseSortKey(x.date)})).filter(x=>x.title&&x.value&&x.sortKey).sort((a,b)=>a.sortKey.localeCompare(b.sortKey));
  const last=valid.at(-1); if(!last)return;
  const t=document.getElementById('latestReleaseTitle'),v=document.getElementById('latestReleaseValue'),d=document.getElementById('latestReleaseDate');
  if(t)t.textContent=last.title;if(v)v.textContent=last.value;if(d)d.textContent=last.displayDate||last.date||last.releaseDate||'';
}
// Respaldo inmediato: este bloque no debe depender de que termine /api/macro-data.
renderLatestRelease([{releaseDate:'2026-09-28',date:'sep 2026',displayDate:'Publicado 28 sep 2026 · período sep 2026',title:'ICG UTDT',value:'1,94 puntos · −5,9% mensual'}]);
let marketsFastLoaded=false;
function paintMarkets(L){
  if(!L)return;
  const marketChange=(id,x,inverse=false)=>{const el=document.getElementById(id);if(!el)return;const c=x?.changePct;if(c==null||!Number.isFinite(Number(c))){el.textContent='—';el.className='market-change neutral';return;}const n=Number(c),good=inverse?n<0:n>0;el.textContent=`${n>0?'↑':n<0?'↓':'→'} ${n>0?'+':''}${fmt.format(n)}%`;el.className='market-change '+(n===0?'neutral':good?'positive':'negative');};
  // v120: sello de tiempo claro — "Hoy · 17:58" si el dato es de la rueda de hoy; si no, "Cierre 29/09/2026".
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires'}).format(new Date());
  const stamp=x=>{const d=String(x?.date||'').slice(0,10);if(!d)return '';const [yy,mm,dd]=d.split('-');
    if(d===today){let hm='';try{if(x.updatedAt)hm=new Date(x.updatedAt).toLocaleTimeString('es-AR',{timeZone:'America/Argentina/Buenos_Aires',hour:'2-digit',minute:'2-digit',hour12:false});}catch{}return `Hoy${hm?` · ${hm}`:''}${x.source?` · ${x.source}`:''}`;}
    return `Cierre ${dd}/${mm}/${yy}${x.source?` · ${x.source}`:''}`;};
  if(L.merval){document.getElementById('heroMerval').textContent=`${new Intl.NumberFormat('es-AR',{maximumFractionDigits:0}).format(L.merval.value)} pts`;marketChange('heroMervalChange',L.merval,false);document.getElementById('heroMervalDate').textContent=stamp(L.merval);}
  if(L.dollar){document.getElementById('heroDollar').textContent=`$ ${fmt.format(L.dollar.value)}`;marketChange('heroDollarChange',L.dollar,true);document.getElementById('heroDollarDate').textContent=stamp(L.dollar);}
  if(L.risk){document.getElementById('heroRisk').textContent=`${fmt.format(L.risk.value)} pb`;marketChange('heroRiskChange',L.risk,true);document.getElementById('heroRiskDate').textContent=stamp(L.risk);}
  if(L.bna){document.getElementById('heroBna').textContent=`$ ${fmt.format(L.bna.sell)} venta`;marketChange('heroBnaChange',L.bna,true);document.getElementById('heroBnaDate').textContent=`${stamp(L.bna)} · compra $ ${fmt.format(L.bna.buy)}`;}
}
// v120: "Mercados ahora" se refresca cada 30 s mientras la pestaña está visible (y al volver a ella).
const MARKETS_REFRESH_MS=30000;let marketsTimer=null,marketsInFlight=false;
function paintMarketsPill(ok){const el=document.getElementById('marketsPill');if(!el)return;const hm=new Date().toLocaleTimeString('es-AR',{timeZone:'America/Argentina/Buenos_Aires',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false});el.textContent=ok?`Actualizado ${hm} · cada 30 s`:`Reintentando · último intento ${hm}`;el.classList.toggle('stale',!ok);}
// v133: nunca se retrocede. Se pinta primero lo que trae el HTML (último dato del servidor) o la copia local,
// la que sea más reciente, y cada indicador sólo se reemplaza por uno de igual o mayor fecha.
let marketsShown={};
const mktNewer=(n,p)=>{if(!n)return p||null;if(!p)return n;const dn=String(n.date||'').slice(0,10),dp=String(p.date||'').slice(0,10);if(dn!==dp)return dn>dp?n:p;return String(n.updatedAt||'')>=String(p.updatedAt||'')?n:p;};
function showMarkets(L){if(!L)return;const m={};for(const k of ['merval','dollar','risk','bna'])m[k]=mktNewer(L[k],marketsShown[k]);marketsShown=m;paintMarkets(m);}
async function loadMarketsFast(){
  if(marketsInFlight)return;marketsInFlight=true;
  if(!marketsFastLoaded){try{showMarkets(window.__MARKETS__?.latest);const cached=JSON.parse(localStorage.getItem('macroMarketsSnapshot')||'null');if(cached?.latest)showMarkets(cached.latest);}catch{}}
  try{const r=await fetch(`/api/markets?_=${Date.now()}`,{headers:{accept:'application/json'},cache:'no-store'});if(!r.ok)throw new Error(`markets ${r.status}`);const d=await r.json();showMarkets(d.latest);marketsFastLoaded=true;paintMarketsPill(true);try{localStorage.setItem('macroMarketsSnapshot',JSON.stringify({...d,latest:marketsShown}));}catch{}}
  catch(e){console.warn('markets fast',e);paintMarketsPill(false);}
  finally{marketsInFlight=false;}
  if(!marketsTimer){marketsTimer=setInterval(()=>{if(document.visibilityState==='visible')loadMarketsFast();},MARKETS_REFRESH_MS);document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')loadMarketsFast();});}
}
async function loadTradeMonthlyFast(){
  try{
    const r=await fetch('/api/trade-monthly',{headers:{accept:'application/json'}}); if(!r.ok)throw new Error(`trade monthly ${r.status}`);
    const d=await r.json(); if(d.status!=='ok'||!d.monthlyBalance)return;
    // Append/refresh only: never truncate the bundled trade history.
    Object.assign(tradeBalanceMonthly,d.monthlyBalance);
    const tm=Object.entries(tradeBalanceMonthly).sort(([a],[b])=>a.localeCompare(b));
    safeApply('kpiCards',renderKpiCards);
    if(currentSeries==='trade'&&window.Chart)renderHistory('trade');
  }catch(e){console.warn('trade monthly fast',e);}
}

async function loadCementMonthlyFast(){
  try{
    // El histórico vive dentro del proyecto: el gráfico nunca depende de AFCP para arrancar.
    const h=await fetch('/cement-history.json?v=95',{headers:{accept:'application/json'}});
    if(!h.ok)throw new Error(`cement history ${h.status}`);
    const local=await h.json(), merged={};
    for(const o of local.observations||[])if(/^\d{4}-(0[1-9]|1[0-2])$/.test(o.period)&&Number.isFinite(Number(o.yoy)))merged[o.period]=Number(o.yoy);
    if(Object.keys(merged).length!==60)throw new Error(`cement history local: ${Object.keys(merged).length}/60`);
    // AFCP sólo se usa para incorporar automáticamente publicaciones posteriores.
    const last=Object.keys(merged).sort().at(-1);
    try{
      const r=await fetch(`/api/cement-monthly?after=${encodeURIComponent(last)}`,{headers:{accept:'application/json'}});
      if(r.ok){const d=await r.json();for(const o of d.fresh||[])if(/^\d{4}-(0[1-9]|1[0-2])$/.test(o.period)&&Number.isFinite(Number(o.yoy)))merged[o.period]=Number(o.yoy);}
    }catch(e){console.warn('cement latest AFCP',e);}
    const valid=Object.fromEntries(Object.entries(merged).sort(([a],[b])=>a.localeCompare(b)).slice(-60));
    for(const k of Object.keys(cementMonthlyYoy))delete cementMonthlyYoy[k];
    Object.assign(cementMonthlyYoy,valid);
    safeApply('kpiCards',renderKpiCards);
    if(currentSeries==='cement'&&window.Chart)renderHistory('cement');
  }catch(e){console.warn('cement monthly fast',e);}
}

// Respaldo directo contra Datos Argentina: sólo si el histórico fusionado es corto.
// v113: EMAE llega como fracción (0,064 = 6,4%) y el resultado se guarda en la capa API (antes se perdía).
let officialFallbackRunning=false;
async function loadOfficialSeriesFallback(){
  if(officialFallbackRunning)return; officialFallbackRunning=true;
  try{
    await loadBundledMacroHistory();
    const S=kpiSourceCache||{};
    const fetchSeries=async(id,start)=>{
      const u=`https://apis.datos.gob.ar/series/api/series/?ids=${encodeURIComponent(id)}&start_date=${start}&limit=1000&format=json&metadata=none`;
      const r=await fetch(u,{headers:{accept:'application/json'}}); if(!r.ok)throw new Error(`Datos Argentina ${r.status}`);
      const j=await r.json(); return (j.data||[]).map(x=>({date:String(x[0]).slice(0,7),value:Number(x[1])})).filter(x=>/^\d{4}-\d{2}$/.test(x.date)&&Number.isFinite(x.value));
    };
    let changed=false;
    if(!S.emaeHistorical?.monthlyYoy||Object.keys(S.emaeHistorical.monthlyYoy).length<60){
      try{const rows=await fetchSeries('143.3_ICE_SERVIA_2004_A_25','2018-01-01'),monthlyYoy={};
        const fraction=rows.length>=12&&Math.max(...rows.map(x=>Math.abs(x.value)))<=1.5;
        for(const x of rows)monthlyYoy[x.date]=Number((fraction?x.value*100:x.value).toFixed(1));
        if(Object.keys(monthlyYoy).length>=24){apiKpiSources={...apiKpiSources,emaeHistorical:mergeKpiData(apiKpiSources.emaeHistorical,{status:'ok',source:'INDEC / Datos Argentina — EMAE variación interanual',monthlyYoy})};changed=true;}
      }catch(e){console.warn('EMAE fallback',e);}
    }
    if(!S.creditHistorical?.monthlyYoy||Object.keys(S.creditHistorical.monthlyYoy).length<60){
      try{const rows=await fetchSeries('91.1_PEFPC_0_0_35','2018-01-01'),levels={},monthlyYoy={};
        for(const x of rows)levels[x.date]=x.value;
        for(const [d,v] of Object.entries(levels)){const [y,m]=d.split('-'),pv=levels[`${Number(y)-1}-${m}`];if(Number.isFinite(pv)&&pv!==0)monthlyYoy[d]=Number(((v/pv-1)*100).toFixed(1));}
        if(Object.keys(monthlyYoy).length>=24){apiKpiSources={...apiKpiSources,creditHistorical:mergeKpiData(apiKpiSources.creditHistorical,{status:'ok',source:'BCRA / Datos Argentina — préstamos al sector privado',monthlyYoy})};changed=true;}
      }catch(e){console.warn('Crédito fallback',e);}
    }
    if(changed)rebuildKpiSourceCache();
  }finally{officialFallbackRunning=false;}
}

// v117: la API se pide por grupos (cada uno con pocos pedidos externos) y cada grupo se procesa al llegar.
const MACRO_GROUPS=['core','history','markets','activity','leading','external','banks'];
const MACRO_LS_KEY='macrodatosSnapshotV131';
// Series históricas (dólar, riesgo país, Merval, tasa, RIPTE, PIB, industria, desempleo, comercio).
// Recibe la fusión histórico local + API, así los gráficos funcionan aunque la API no responda.
function applyHistorySources(S){
  if(!S)return;
  const srcOk=x=>!!x&&['ok','snapshot','partial'].includes(x.status);
    // RIPTE se hidrata primero y de forma independiente. Ningún error posterior de
    // mercados, FX, calendario o calculadoras puede dejar vacía esta serie.
    if(srcOk(S.salary)){
      for(const k of Object.keys(salaryRipte))delete salaryRipte[k];
      for(const k of Object.keys(salaryRipteMonthly))delete salaryRipteMonthly[k];
      Object.assign(salaryRipte,S.salary.annual||{});
      Object.assign(salaryRipteMonthly,S.salary.monthly||{});
      applySalaryMode();
      const n=Object.keys(salaryRipteMonthly).length,last=Object.keys(salaryRipteMonthly).sort().at(-1);
      const diag=document.getElementById('ripteDiagnostic');
      if(diag)diag.textContent=`RIPTE cargado: ${n} meses${last?` · último ${displayMonth(last)}`:''}`;
    }

    const merge=(target,src)=>{if(srcOk(src)&&src.annual)Object.assign(target,src.annual)};
    merge(industry,S.industryHistorical); if(srcOk(S.unemploymentHistorical)&&S.unemploymentHistorical.annual){for(const [y,v0] of Object.entries(S.unemploymentHistorical.annual)){const v=Number(v0);if(Number.isFinite(v))unemployment[y]=Number((Math.abs(v)<=1?v*100:v).toFixed(1));}}
    if(srcOk(S.tradeHistorical)){if(Object.keys(tradeBalanceMonthly).length<55)Object.assign(tradeBalanceMonthly,S.tradeHistorical.monthlyBalance||{});const from1913=o=>Object.fromEntries(Object.entries(o||{}).filter(([y])=>Number(y)>=1913));Object.assign(tradeBalanceNominal,from1913(S.tradeHistorical.balance));Object.assign(exportsNominal,from1913(S.tradeHistorical.exports));Object.assign(importsNominal,from1913(S.tradeHistorical.imports));if(S.tradeHistorical.real){tradeBasePeriod=S.tradeHistorical.real.basePeriod||'';Object.assign(tradeBalance,from1913(S.tradeHistorical.real.balance));Object.assign(exportsSeries,from1913(S.tradeHistorical.real.exports));Object.assign(importsSeries,from1913(S.tradeHistorical.real.imports));}else rebuildRealTrade();}
    safeApply('financialHistorical',()=>{
    if(srcOk(S.financialHistorical)){const F=S.financialHistorical;if(F.daily){Object.assign(countryRiskDaily,F.daily.risk||{});Object.assign(mervalPointsDaily,F.daily.mervalPoints||{});Object.assign(mervalUsdDaily,F.daily.mervalUsd||{});rebuildMervalReal();applyMervalMode();seriesConfig.countryRisk.data=countryRiskDaily;}Object.assign(countryRisk,F.countryRisk||{});Object.assign(mervalUsdCcl,F.mervalUsdCcl||{});Object.assign(freeDollarNominal,F.freeDollar?.nominal||{});Object.assign(freeDollarReal,F.freeDollar?.real||{});Object.assign(interestNominal,F.interestRate?.nominal||{});Object.assign(interestReal,F.interestRate?.real||{});seriesConfig.freeDollar.data=dollarPriceMode==='real'?freeDollarReal:freeDollarNominal;seriesConfig.interestRate.data=interestMode==='real'?interestReal:interestNominal;const L=F.latest||{};if(!marketsFastLoaded)paintMarkets(L);}
    });
    safeApply('exchangeHistorical',()=>{
    if(srcOk(S.exchangeHistorical)){const X=S.exchangeHistorical;Object.assign(freeDollarNominal,X.free?.nominal||{});Object.assign(freeDollarReal,X.free?.real||{});Object.assign(fxOfficialNominal,X.official?.nominal||{});Object.assign(fxOfficialReal,X.official?.real||{});Object.assign(fxFreeTcr,X.free?.tcr||{});Object.assign(fxOfficialTcr,X.official?.tcr||{});Object.assign(fxFreeMonthlyNominal,X.free?.monthly?.nominal||{});Object.assign(fxFreeMonthlyReal,X.free?.monthly?.real||{});Object.assign(fxFreeMonthlyTcr,X.free?.monthly?.tcr||{});Object.assign(fxOfficialMonthlyNominal,X.official?.monthly?.nominal||{});Object.assign(fxOfficialMonthlyReal,X.official?.monthly?.real||{});Object.assign(fxOfficialMonthlyTcr,X.official?.monthly?.tcr||{});Object.assign(fxFreeDailyNominal,X.free?.daily?.nominal||{});Object.assign(fxFreeDailyReal,X.free?.daily?.real||{});Object.assign(fxFreeDailyTcr,X.free?.daily?.tcr||{});Object.assign(fxOfficialDailyNominal,X.official?.daily?.nominal||{});Object.assign(fxOfficialDailyReal,X.official?.daily?.real||{});Object.assign(fxOfficialDailyTcr,X.official?.daily?.tcr||{});
      const fillDailyTcr=(nominal,monthlyNominal,monthlyTcr,dailyTcr)=>{for(const [d,v] of Object.entries(nominal)){if(dailyTcr[d]!=null)continue;const ym=d.slice(0,7),mn=Number(monthlyNominal[ym]),mt=Number(monthlyTcr[ym]);if(Number.isFinite(mn)&&mn!==0&&Number.isFinite(mt))dailyTcr[d]=Number((Number(v)*(mt/mn)).toFixed(4));}};
      rebuildFxDerived();fillDailyTcr(fxFreeDailyNominal,fxFreeMonthlyNominal,fxFreeMonthlyTcr,fxFreeDailyTcr);fillDailyTcr(fxOfficialDailyNominal,fxOfficialMonthlyNominal,fxOfficialMonthlyTcr,fxOfficialDailyTcr);Object.assign(fxGap,X.gap||{});Object.assign(fxDailyGap,X.dailyGap||{});fxBasePeriod=X.free?.basePeriod||X.official?.basePeriod||'';const dailyKeys=Object.keys(fxFreeDailyNominal);if(dailyKeys.length){const annualKeys=Object.keys(freeDollarNominal).map(fxDateKey).sort(),mn=annualKeys[0]||dailyKeys.sort()[0],mx=dailyKeys.sort().at(-1);const a=document.getElementById('fxPeriodFrom'),b=document.getElementById('fxPeriodTo');if(a){a.min=mn;a.max=mx;}if(b){b.min=mn;b.max=mx;b.value=mx;}}renderFx();}
    });
    safeApply('fxDerived',()=>{rebuildFxDerived();if(window.Chart)renderFx();});
    if(Object.keys(salaryRipteMonthly).length)applySalaryMode();
    if(currentSeries && window.Chart) renderHistory(currentSeries);
    if(srcOk(S.gdpHistorical) && S.gdpHistorical.annual){Object.assign(gdpGrowth,S.gdpHistorical.annual);fillSelect('gdpStart',gdpGrowth,1980);fillSelect('gdpEnd',gdpGrowth,2025);}
    // v115: EMAE y demás tarjetas → renderKpiCards().
    if(srcOk(S.ipcHistorical)){
      // No sobrescribir 1944–2006: el respaldo local auditado evita cortes por respuestas parciales o diferencias de transformación de la API.
      fillSelect('infStart',inflation,Math.min(...Object.keys(inflation).map(Number))); fillSelect('infEnd',inflation,2025);
      const active=document.querySelector('[data-series="inflation"].active'); if(active&&window.Chart)renderHistory('inflation');
    }
    if(srcOk(S.ipc)){
      const x=S.ipc.latest, per=periodFromYm(S.ipc.updated);
      // v115: la tarjeta de IPC la arma renderKpiCards().
      // La API entrega monthly como [{date,index,value}]. Usamos el nivel publicado directamente
      // para la calculadora, sin depender de que termine antes loadPublicHistorical().
      for(const row of (Array.isArray(S.ipc.monthly)?S.ipc.monthly:[])){
        const k=String(row?.date||''); const v=Number(row?.index);
        if(/^\d{4}-\d{2}$/.test(k)&&Number.isFinite(v)&&v>0) ipcCalcIndex[k]=v;
      }
    }
}
// v127: faltaba este formateador y applyReleases fallaba siempre que ARCA respondía (el bloque quedaba fijo en el ICG).
function moneyMillionsToBillions(m){const v=Number(m);if(!Number.isFinite(v))return '';return v>=1e6?`$ ${new Intl.NumberFormat('es-AR',{minimumFractionDigits:1,maximumFractionDigits:1}).format(v/1e6)} billones`:`$ ${new Intl.NumberFormat('es-AR',{maximumFractionDigits:0}).format(v)} millones`;}
function applyReleases(S){
    if(S.salary?.status==='ok'&&currentSeries==='salary'&&window.Chart)safeApply('salaryRender',()=>renderHistory('salary'));
    // v127: "Último dato publicado" se ordena por FECHA DE PUBLICACIÓN (no por período). Cuando la fuente no
    // informa la fecha, se usa el calendario habitual del organismo sólo para ordenar.
    const R=kpiSourceCache||{},pub=(ym,lagMonths,day)=>ym?`${ymShift(ym,lagMonths)}-${String(day).padStart(2,'0')}`:'';
    const shown=(iso,ym)=>iso?`Publicado ${displayDay(iso)}${ym?` · período ${displayMonth(ym)}`:''}`:`Período ${displayMonth(ym)}`;
    const releases=[{releaseDate:'2026-09-28',date:'sep 2026',displayDate:'Publicado 28 sep 2026 · período sep 2026',title:'ICG UTDT',value:'1,94 puntos · −5,9% mensual'}];
    {const L=(Array.isArray(R.ipc?.monthly)?R.ipc.monthly:[]).filter(r=>Number.isFinite(Number(r.value))).at(-1);if(L){const ym=String(L.date).slice(0,7),rd=R.ipc?.publishedAt||pub(ym,1,12);const prev=R.ipc.monthly.find(r=>String(r.date).slice(0,7)===ymShift(ym,-12));const yoy=Number.isFinite(Number(R.ipc?.latest?.yoy))&&R.ipc.latest?.date?.slice?.(0,7)===ym?Number(R.ipc.latest.yoy):(prev?((Number(L.index)/Number(prev.index))-1)*100:null);releases.push({releaseDate:rd,title:'IPC Nacional · INDEC',value:`${fmt.format(Number(L.value))}% mensual${Number.isFinite(yoy)?` · ${fmt.format(yoy)}% interanual`:''}`,displayDate:shown(R.ipc?.publishedAt,ym)});}}
    {const L=R.arca?.latest,H=arcaHistory(R),last=kpiLastEntries(H,1)[0];const ym=L?.ym||(L?.period?ymFromSpanishPeriod(L.period):null)||last?.[0];
     if(ym){const yoy=Number.isFinite(Number(L?.yoy))&&(L?.ym||ymFromSpanishPeriod(L?.period||''))===ym?Number(L.yoy):Number(H[ym]);const rr=arcaRealYoy(R,ym,yoy);
       const parts=[Number.isFinite(Number(L?.value))&&(L?.ym||ymFromSpanishPeriod(L?.period||''))===ym?moneyMillionsToBillions(L.value):null,Number.isFinite(yoy)?`${kpiPct(yoy)} interanual`:null,rr?`${kpiPct(rr.real)} real${rr.estimated?' (est. REM)':''}`:null].filter(Boolean);
       releases.push({releaseDate:L?.published||pub(ym,1,1),title:'Recaudación · ARCA',value:parts.join(' · '),displayDate:shown(L?.published||pub(ym,1,1),ym)});}}
    if(R.salary?.latest?.period&&Number.isFinite(Number(R.salary.latest.value))){const ym=ymFromSpanishPeriod(R.salary.latest.period)||String(R.salary.latest.period).slice(0,7);releases.push({releaseDate:pub(ym,1,28),title:'RIPTE',value:money.format(R.salary.latest.value),displayDate:`Período ${displayMonth(ym)}`});}
    if(R.icg?.status==='ok'&&R.icg.latest)releases.push({releaseDate:R.icg.publicationDate||'',date:R.icg.latest.period||'',title:'ICG UTDT',value:`${fmt.format(R.icg.latest.value)} puntos${Number.isFinite(Number(R.icg.latest.mom))?` · ${Number(R.icg.latest.mom)>0?'+':''}${fmt.format(R.icg.latest.mom)}% mensual`:''}`});
    {const h=autosHistory(R),L=kpiLastEntries(h,1)[0];if(L){const p=numOrNull(h[ymShift(L[0],-12)]),pubd=R.autos?.latest?.ym===L[0]?R.autos.latest.published:null;releases.push({releaseDate:pubd||`${ymShift(L[0],1)}-01`,title:'Patentamientos · ACARA',value:`${new Intl.NumberFormat('es-AR').format(L[1])} unidades${p?` · ${kpiPct((L[1]/p-1)*100)} interanual`:''}`,displayDate:pubd?`Publicado ${displayDay(pubd)} · período ${displayMonth(L[0])}`:`Período ${displayMonth(L[0])}`});}}
    if(R.bopHistorical?.prepared&&R.bopHistorical?.quarterly?.CA){const k=Object.keys(R.bopHistorical.quarterly.CA).sort().at(-1),v=Number(R.bopHistorical.quarterly.CA[k]);releases.push({releaseDate:R.bopHistorical.prepared,title:'Balanza de pagos · INDEC',value:`Cuenta corriente ${v>=0?'+':'−'}USD ${new Intl.NumberFormat('es-AR',{maximumFractionDigits:0}).format(Math.abs(v))} M (${bopQuarterLabel(k)})`,displayDate:`Publicado ${displayDay(R.bopHistorical.prepared)}`});}
    renderLatestRelease(releases);
}
function paintAutoStatus(when){const status=document.getElementById('autoStatus');if(!status)return;const S=apiKpiSources||{};const ok=Object.values(S).filter(v=>v?.status==='ok'||v?.status==='snapshot'||v?.status==='partial').length,total=Object.keys(S).length,errors=Object.values(S).filter(v=>v?.status==='error').length;
  status.innerHTML=total?`<strong>Datos verificados</strong><small>Última comprobación: ${when||'—'} · ${ok}/${total} fuentes activas${errors?' · algunos datos usan respaldo':''}</small>`:'<strong>Datos verificados</strong><small>Mostrando el último dato incluido · se reintentará la conexión con las fuentes</small>';}
function applyMacroSources(when){
  const S=kpiSourceCache||{};
  safeApply('calculatorHydration',()=>hydrateCalculatorSources(S));
  safeApply('historySources',()=>applyHistorySources(S));
  safeApply('kpiCards',renderKpiCards);
  safeApply('releases',()=>applyReleases(kpiSourceCache||{}));
  paintAutoStatus(when);
  safeApply('coverage',updateCoverage);
  if(window.Chart)safeApply('history',()=>renderHistory(currentSeries));
}
async function loadAutomaticData(){
  let received=0;
  const fmtWhen=d=>{try{return new Date(d).toLocaleString('es-AR',{dateStyle:'medium',timeStyle:'short'});}catch{return '';}};
  const jobs=MACRO_GROUPS.map(async g=>{
    const r=await fetch(`/api/macro-data?group=${g}`,{headers:{accept:'application/json'}});if(!r.ok)throw new Error(`API ${g} ${r.status}`);
    const d=await r.json();if(!d?.sources)throw new Error(`API ${g} sin fuentes`);
    received++;apiKpiSources={...apiKpiSources,...d.sources};rebuildKpiSourceCache();applyMacroSources(fmtWhen(d.generatedAt));
    try{localStorage.setItem(MACRO_LS_KEY,JSON.stringify({generatedAt:d.generatedAt,sources:apiKpiSources}));}catch{}
  });
  const res=await Promise.allSettled(jobs);
  const failed=res.filter(x=>x.status==='rejected');
  if(failed.length)console.warn('macro-data: grupos con error',failed.map(x=>String(x.reason)));
  if(!received){
    // Ningún grupo respondió: usar el último snapshot guardado en este navegador (si existe) + histórico local.
    let data=null;try{data=JSON.parse(localStorage.getItem(MACRO_LS_KEY)||'null');}catch{}
    if(data?.sources){apiKpiSources=data.sources;rebuildKpiSourceCache();applyMacroSources(fmtWhen(data.generatedAt));}
    else{paintAutoStatus('');}
  }
  loadOfficialSeriesFallback();
}
window.addEventListener('load',()=>{
  initKpiExplorer();
  // Las dos capas se cargan en paralelo: una API pública lenta o bloqueada por CORS no puede impedir que se dibujen las series del backend.
  loadAgenda();
  loadMarketsFast();
loadTradeMonthlyFast();
loadCementMonthlyFast();
  Promise.allSettled([loadAutomaticData(),loadPublicHistorical()]).then(()=>{
    updateCoverage();
    if(window.Chart){ renderHistory(currentSeries); renderFx(); }
  });
});


// v84 · Explorador de tarjetas
let kpiDetailChart=null, kpiSourceCache={}, kpiHistoryCache={}, fiscalMetric='primary';
// v113: dos capas de datos para las tarjetas. bundledKpiSources = histórico incluido en el sitio
// (macro-history.json); apiKpiSources = /api/macro-data. kpiSourceCache es SIEMPRE la fusión plana
// de ambas (antes el histórico local se guardaba en kpiSourceCache.sources.* y las tarjetas nunca lo leían,
// y la respuesta de la API reemplazaba el objeto completo).
let bundledKpiSources={}, apiKpiSources={};
function isPlainObj(v){return !!v&&typeof v==='object'&&!Array.isArray(v);}
function mergeKpiData(base,over){
  if(Array.isArray(base)||Array.isArray(over)){
    const a=Array.isArray(base)?base:[],b=Array.isArray(over)?over:[];
    if([...a,...b].every(x=>isPlainObj(x)&&x.date)){const m=new Map(a.map(x=>[String(x.date).slice(0,7),x]));for(const x of b){const k=String(x.date).slice(0,7);m.set(k,{...(m.get(k)||{}),...x});}return [...m.values()].sort((x,y)=>String(x.date).localeCompare(String(y.date)));}
    return b.length?b:a;
  }
  if(isPlainObj(base)||isPlainObj(over)){const out={...(isPlainObj(base)?base:{})};for(const [k,v] of Object.entries(isPlainObj(over)?over:{})){if(v===null||v===undefined||v==='')continue;out[k]=mergeKpiData(out[k],v);}return out;}
  return over===null||over===undefined?base:over;
}
// v114: EMAE grande = variación mensual s.e.; abajo, la interanual del mismo mes.
function paintEmaeKpi(S){const E=S?.emaeHistorical;if(!E)return;const last=o=>Object.entries(o||{}).filter(([d,v])=>/^\d{4}-\d{2}$/.test(d)&&Number.isFinite(Number(v))).sort(([a],[b])=>a.localeCompare(b)).at(-1);
  const sa=last(E.monthlySaMom),yo=last(E.monthlyYoy);if(!sa&&!yo)return;const card=document.querySelector('.kpi[data-kpi="emae"]');
  if(sa){const yoySame=Number.isFinite(Number(E.monthlyYoy?.[sa[0]]))?Number(E.monthlyYoy[sa[0]]):null;setKpi('emae',signedPct(Number(sa[1])),`${displayMonth(sa[0])} · mensual s.e.`,yoySame===null?'Actividad económica':`${signedPct(yoySame)} interanual`);applyTone(card?.querySelector('[data-value]'),Number(sa[1]));if(yoySame!==null)applyTone(card?.querySelector('[data-detail]'),yoySame);}
  else{setKpi('emae',signedPct(Number(yo[1])),`${displayMonth(yo[0])} · interanual`,'Actividad económica mensual');applyTone(card?.querySelector('[data-value]'),Number(yo[1]));}
}
function rebuildKpiSourceCache(){
  const merged=mergeKpiData(bundledKpiSources,apiKpiSources);
  // Una fuente en error en la API no debe ocultar el histórico local.
  for(const [k,v] of Object.entries(merged))if(v?.status==='error'&&bundledKpiSources[k])merged[k]={...bundledKpiSources[k],...v,status:'ok'};
  kpiSourceCache=merged; hydrateKpiHistoryCache(kpiSourceCache); try{renderKpiCards();}catch(e){console.warn('kpi cards',e);}
}

// ICG: separadores de períodos presidenciales. Las fechas se expresan con la
// granularidad mensual de la propia serie del ICG.
const ICG_PRESIDENTS=[
  {name:'Duhalde',start:'2002-01',end:'2003-05',photo:'/assets/duhalde.jpg'},
  {name:'Néstor Kirchner',start:'2003-05',end:'2007-12',photo:'https://mandatos.ar/assets/fotos/nk.jpg'},
  {name:'Cristina Fernández I',start:'2007-12',end:'2011-12',photo:'https://mandatos.ar/assets/fotos/cfk.jpg'},
  {name:'Cristina Fernández II',start:'2011-12',end:'2015-12',photo:'https://mandatos.ar/assets/fotos/cfk.jpg'},
  {name:'Mauricio Macri',start:'2015-12',end:'2019-12',photo:'https://mandatos.ar/assets/fotos/mm.jpg'},
  {name:'Alberto Fernández',start:'2019-12',end:'2023-12',photo:'https://mandatos.ar/assets/fotos/af.jpg'},
  {name:'Javier Milei',start:'2023-12',end:'9999-12',photo:'https://mandatos.ar/assets/fotos/jm.jpg'}
];
const presidentImageCache=new Map();
function presidentImage(url,chart){
  if(!url)return null;
  if(presidentImageCache.has(url))return presidentImageCache.get(url);
  const img=new Image(); if(!String(url).startsWith('/'))img.crossOrigin='anonymous'; img.onload=()=>chart.draw(); img.onerror=()=>{}; img.src=url;
  presidentImageCache.set(url,img); return img;
}
const icgPresidentialPlugin={
  id:'icgPresidents',
  afterDraw(chart,args,opts){
    if(!opts?.enabled||!Array.isArray(opts.periods)||!opts.periods.length)return;
    const periods=opts.periods, x=chart.scales.x, area=chart.chartArea, ctx=chart.ctx;
    const idxFor=(ym)=>{let i=periods.findIndex(d=>d>=ym);return i<0?periods.length-1:i;};
    ctx.save();
    // Línea especial para la crisis/transición de diciembre de 2001, demasiado breve para rotular tres presidencias interinas por separado en datos mensuales.
    const trans=idxFor('2001-12');
    if(trans>=0){const px=x.getPixelForValue(trans);ctx.setLineDash([3,3]);ctx.strokeStyle='rgba(100,116,139,.65)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(px,area.top);ctx.lineTo(px,area.bottom);ctx.stroke();ctx.setLineDash([]);}
    for(const pr of ICG_PRESIDENTS){
      const si=idxFor(pr.start), ei=Math.min(idxFor(pr.end),periods.length-1);
      if(si<0||si>=periods.length||ei<si)continue;
      const sx=x.getPixelForValue(si), ex=x.getPixelForValue(ei), mid=(sx+ex)/2;
      ctx.strokeStyle='rgba(71,85,105,.55)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(sx,area.top);ctx.lineTo(sx,area.bottom);ctx.stroke();
      const img=presidentImage(pr.photo,chart), r=21, cy=area.top-49;
      if(img?.complete&&img.naturalWidth){ctx.save();ctx.beginPath();ctx.arc(mid,cy,r,0,Math.PI*2);ctx.clip();ctx.drawImage(img,mid-r,cy-r,r*2,r*2);ctx.restore();ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.beginPath();ctx.arc(mid,cy,r,0,Math.PI*2);ctx.stroke();}
      ctx.fillStyle='#334155';ctx.font='600 9px Inter, ui-sans-serif, system-ui, sans-serif';ctx.textAlign='center';ctx.textBaseline='top';
      const maxWidth=Math.max(36,ex-sx-4); let label=pr.name; if(ctx.measureText(label).width>maxWidth){label=label.replace('Fernández','F.').replace('Néstor Kirchner','N. Kirchner').replace('Alberto Fernández','A. Fernández').replace('Mauricio Macri','Macri').replace('Javier Milei','Milei');}
      ctx.fillText(label,mid,area.top-23,maxWidth);
    }
    ctx.restore();
  }
};
function hydrateKpiHistoryCache(S){
  const A=S?.activityPulse||{}; kpiHistoryCache={};
  for(const key of ['fiscal','cement','isac','autos','credit','arrears']){
    const h=A?.[key]?.history; if(h&&typeof h==='object')kpiHistoryCache[key]={history:h,source:A[key]?.source||A[key]?.sourceUrl||A.source||''};
  }
}
const KPI_META={
 ipc:{title:'Inflación nacional',agency:'INDEC'},ipcCaba:{title:'Inflación CABA',agency:'IDECBA'},emae:{title:'EMAE',agency:'INDEC'},ipi:{title:'IPI manufacturero',agency:'INDEC'},arca:{title:'Recaudación',agency:'ARCA'},poverty:{title:'Pobreza',agency:'INDEC / UCA'},icg:{title:'Confianza de gobierno',agency:'UTDT'},trade:{title:'Balanza comercial',agency:'INDEC'},fiscal:{title:'Resultado fiscal',agency:'Ministerio de Economía'},cement:{title:'Despachos de cemento',agency:'AFCP'},isac:{title:'ISAC construcción',agency:'INDEC'},autos:{title:'Patentamientos 0 km',agency:'ACARA'},credit:{title:'Crédito privado',agency:'BCRA'},arrears:{title:'Mora bancaria',agency:'BCRA'},ila:{title:'Índice Líder de Actividad (ILA)',agency:'CICEc'},iga:{title:'Índice General de Actividad (IGA)',agency:'OJF'},bop:{title:'Balanza de pagos · cuenta corriente',agency:'INDEC'}
};
// v114: rango mensual continuo (los meses sin dato quedan como hueco, no se interpolan).
function monthRangeEntries(obj,n){const keys=Object.keys(obj||{}).filter(k=>/^\d{4}-\d{2}$/.test(k)&&Number.isFinite(Number(obj[k]))).sort();if(!keys.length)return [];const out=[];let [y,m]=keys.at(-1).split('-').map(Number);for(let i=0;i<n;i++){const k=`${y}-${String(m).padStart(2,'0')}`;out.unshift([k,Number.isFinite(Number(obj[k]))?Number(obj[k]):null]);if(k<=keys[0])break;m--;if(!m){m=12;y--;}}return out;}
function recentEntries(obj,n=12){return Object.entries(obj||{}).filter(([d,v])=>/^\d{4}-\d{2}$/.test(String(d))&&Number.isFinite(Number(v))).sort(([a],[b])=>String(a).localeCompare(String(b))).slice(-n);}
function recentAnnualEntries(obj,n=12){return Object.entries(obj||{}).filter(([d,v])=>/^\d{4}$/.test(String(d))&&Number.isFinite(Number(v))).sort(([a],[b])=>Number(a)-Number(b)).slice(-n);}
function normalizedMonthlyRows(rows,valueField='value',n=60){const byMonth=new Map();for(const r of (Array.isArray(rows)?rows:[])){const d=String(r?.date||'').slice(0,7),v=Number(r?.[valueField]);if(/^\d{4}-\d{2}$/.test(d)&&Number.isFinite(v))byMonth.set(d,v);}return [...byMonth.entries()].sort(([a],[b])=>a.localeCompare(b)).slice(-n);}
let bundledMacroHistoryPromise=null;
function loadBundledMacroHistory(){return bundledMacroHistoryPromise??=(async()=>{
  try{
    const r=await fetch('/macro-history.json?v=128',{cache:'no-store'}); if(!r.ok)return;
    const h=await r.json(), B={};
    if(h.povertyAnnual)Object.assign(poverty,h.povertyAnnual);
    if(h.tradeMonthly)Object.assign(tradeBalanceMonthly,h.tradeMonthly);
    if(Array.isArray(h.ipcRows))B.ipc={status:'ok',source:'INDEC — IPC Nacional',monthly:h.ipcRows};
    if(h.ipcCabaMonthly)B.ipcCaba={status:'ok',source:'IDECBA — IPCBA Nivel General',history:h.ipcCabaMonthly};
    if(h.icgMonthly)B.icg={status:'ok',source:'UTDT',history:h.icgMonthly,...(h.icgLatest?{latest:h.icgLatest}:{})};
    if(h.arcaYoy)B.arca={status:'ok',source:'ARCA',history:h.arcaYoy};
    if(h.ipiMonthlyYoy)B.industryHistorical={status:'ok',monthlyYoy:h.ipiMonthlyYoy,monthlySaMom:h.ipiMonthlySaMom||{}};
    if(h.isacMonthlyYoy)B.isacHistorical={status:'ok',monthlyYoy:h.isacMonthlyYoy,monthlySaMom:h.isacMonthlySaMom||{}};
    if(h.emaeMonthlyYoy||h.emaeMonthlySaMom)B.emaeHistorical={status:'ok',source:'INDEC / Datos Argentina — EMAE',monthlyYoy:h.emaeMonthlyYoy||{},monthlySaMom:h.emaeMonthlySaMom||{}};
    if(h.creditMonthlyYoy||h.creditMonthlySaRealMom)B.creditHistorical={status:'ok',source:'BCRA — préstamos al sector privado',monthlyYoy:h.creditMonthlyYoy||{},monthlySaRealMom:h.creditMonthlySaRealMom||{}};
    if(h.arrearsMonthlyTotal)B.arrearsHistorical={status:'ok',source:'BCRA — Informe sobre Bancos',monthlyTotal:h.arrearsMonthlyTotal,monthlyFamilies:h.arrearsMonthlyFamilies||{},monthlyCompanies:h.arrearsMonthlyCompanies||{}};
    const AP={status:'ok'};
    if(h.fiscalPctGDP)AP.fiscal={source:'Ministerio de Economía — IMIG; PIB INDEC',historyPctGDP:h.fiscalPctGDP};
    if(h.autosMonthly)AP.autos={source:'ACARA / SIOMAA',history:{'Patentamientos (unidades)':h.autosMonthly}};
    if(h.cementLatest)AP.cement={tons:h.cementLatest.tons,period:h.cementLatest.period,source:'AFCP'};
    if(AP.fiscal||AP.autos||AP.cement)B.activityPulse=AP;
    if(h.ilaMonthly)B.ilaHistorical={status:'ok',source:'CICEc — Bolsas de Comercio de Santa Fe y Rosario',monthly:h.ilaMonthly};
    if(h.bopQuarterly)B.bopHistorical={status:'ok',source:'INDEC — Balanza de pagos (SDMX)',prepared:h.bopPrepared||null,quarterly:h.bopQuarterly};
    if(h.povertySemesters)B.poverty={status:'ok',source:'INDEC — EPH',semesters:h.povertySemesters};
    if(h.remCpiExpected)B.rem={status:'ok',source:'REM BCRA',cpiExpected:h.remCpiExpected};
    if(h.igaMonthly)B.igaHistorical={status:'ok',source:'OJF & Asociados — IGA-OJF',monthly:h.igaMonthly};
    if(h.marketsHistory){for(const k of ['financialHistorical','exchangeHistorical','salary'])if(h.marketsHistory[k])B[k]=h.marketsHistory[k];}
    // v118: ICL, CER y UVA (calculadora) — respaldo local desde el archivo plano del BCRA.
    try{const rc=await fetch('/contract-indices.json?v=118',{cache:'no-store'});if(rc.ok){const c=await rc.json();
      const expand=s=>{const daily={},monthly={};if(!s?.start||!Array.isArray(s.values))return null;let dt=new Date(s.start+'T00:00:00Z');for(const v of s.values){const k=dt.toISOString().slice(0,10);if(v!==null&&Number.isFinite(Number(v))){daily[k]=Number(v);if(monthly[k.slice(0,7)]==null)monthly[k.slice(0,7)]=Number(v);}dt=new Date(dt.getTime()+864e5);}return {status:'ok',source:'BCRA — tas5_ser.txt',daily,monthly};};
      const icl=expand(c.series?.icl),cer=expand(c.series?.cer),uva=expand(c.series?.uva);
      if(icl)B.icl=icl;if(cer||uva)B.contractIndices={status:'ok',source:'BCRA — CER/UVA',...(cer?{cer}:{}),...(uva?{uva}:{})};}}catch(e){console.warn('contract indices',e);}
    bundledKpiSources=B; rebuildKpiSourceCache();
    safeApply('calculatorHydration',()=>hydrateCalculatorSources(kpiSourceCache));
    safeApply('historySources',()=>applyHistorySources(kpiSourceCache));
    if(window.Chart){safeApply('history',()=>renderHistory(currentSeries));safeApply('fx',renderFx);}
    if(currentSeries==='trade'&&window.Chart)renderHistory('trade');
  }catch(e){console.warn('bundled macro history',e);}
})();}
// v128: fuentes en vivo que se suman a la línea de base (patentamientos ACARA, cemento AFCP, pobreza semestral INDEC).
function autosHistory(S){return {...(S?.activityPulse?.autos?.history?.['Patentamientos (unidades)']||{}),...(S?.autos?.history?.['Patentamientos (unidades)']||{})};}
function cementYoyMap(S){return {...cementMonthlyYoy,...Object.fromEntries(Object.entries(S?.cement?.monthlyYoy||{}).filter(([k,v])=>/^\d{4}-(0[1-9]|1[0-2])$/.test(k)&&Number.isFinite(Number(v))).map(([k,v])=>[k,Number(v)]))};}
function kpiSeries(key){const S=kpiSourceCache||{},A=S.activityPulse||{};
  if(key==='fiscal'){const f=A.fiscal||{};const src=f.historyPctGDP?.[fiscalMetric];if(src){const months=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'],years=[...new Set(Object.keys(src).filter(k=>/^\d{4}-\d{2}$/.test(k)).map(k=>k.slice(0,4)))].sort().slice(-3);const datasets=years.map(y=>({label:y,data:months.map((_,i)=>{const v=src[`${y}-${String(i+1).padStart(2,'0')}`];return v==null?null:Number(v);})}));return {labels:months,datasets,source:'Ministerio de Economía (IMIG) / INDEC',legend:`Resultado ${fiscalMetric==='primary'?'primario':'financiero'} acumulado en el año como % del PIB. Comparación mensual ${years[0]}–${years.at(-1)} · IMIG sobre PIB nominal INDEC (año en curso: PIB estimado).`};}}
  // IPC: usar exclusivamente la variación mensual publicada. Nunca graficar el nivel del índice.
  if(key==='ipc'){const x=normalizedMonthlyRows(S.ipc?.monthly,'value',60);if(x.length)return {labels:x.map(([d])=>displayMonth(d)),rawPeriods:x.map(([d])=>d),datasets:[{label:'Inflación mensual (%)',data:x.map(([,v])=>v)}],source:'INDEC',legend:`Últimas ${x.length} observaciones mensuales publicadas.`};}
  if(key==='ipcCaba'&&S.ipcCaba?.history){const x=recentEntries(S.ipcCaba.history,60);return {labels:x.map(([d])=>displayMonth(d)),datasets:[{label:'Inflación CABA mensual (%)',data:x.map(([,v])=>Number(v))}],source:'IDECBA',legend:'Hasta 5 años de observaciones mensuales disponibles.'};}
  // Recaudación: barras con variación interanual real, deflactada con IPC Nacional del mismo mes.
  if(key==='arca'&&S.arca?.history){const nominal=recentEntries(arcaHistory(S),60),ipcRows=normalizedMonthlyRows(S.ipc?.monthly,'index',999),idx=Object.fromEntries(ipcRows),labels=[],real=[];let est=null;for(const [d,n] of nominal){const R=arcaRealYoy(S,d,n);if(!R)continue;if(R.estimated)est=d;labels.push(d);real.push(Number(R.real.toFixed(1))+0);}if(labels.length)return {chartType:'bar',labels:labels.map(d=>d===est?`${displayMonth(d)} (est.)`:displayMonth(d)),rawPeriods:labels,datasets:[{label:'Recaudación · variación interanual real (%)',data:real}],source:est?'ARCA + INDEC; último mes con IPC estimado por REM (BCRA)':'ARCA + INDEC',legend:`Últimas ${labels.length} variaciones interanuales reales de la recaudación, deflactadas con IPC Nacional del mismo mes.${est?` ${displayMonth(est)}: estimada con la inflación esperada del REM hasta que INDEC publique el IPC.`:''}`};}
  // ICG: sólo observaciones mensuales válidas; se conserva toda la historia disponible y los cambios presidenciales.
  if(key==='icg'&&S.icg?.history){const x=recentEntries(S.icg.history,9999);if(x.length)return {labels:x.map(([d])=>displayMonth(d)),rawPeriods:x.map(([d])=>d),presidentOverlay:true,datasets:[{label:'ICG',data:x.map(([,v])=>Number(v)),borderColor:'#0b5bd3',backgroundColor:'rgba(11,91,211,.06)'}],source:'UTDT',legend:`Serie histórica mensual: ${x.length} observaciones · líneas verticales = cambios presidenciales.`};}
  // v122 · Balanza de pagos (INDEC): componentes de la cuenta corriente apilados + saldo de cuenta corriente (línea), últimos 10 años.
  if(key==='bop'&&S.bopHistorical?.quarterly?.CA){const Q=S.bopHistorical.quarterly,per=Object.keys(Q.CA).filter(k=>/^\d{4}-Q[1-4]$/.test(k)).sort().slice(-40);if(per.length){const val=(src,d)=>Number.isFinite(Number(src?.[d]))?Number(src[d]):null;const bar=(label,k,color)=>({type:'bar',label,data:per.map(d=>val(Q[k],d)),backgroundColor:color,borderColor:color,preserveColor:true,stack:'comp',order:2});
    const ds=[bar('Bienes','G','#16a34a'),bar('Servicios','S','#f59e0b'),bar('Ingreso primario (intereses y utilidades)','IN1','#dc2626'),bar('Ingreso secundario','IN2','#8b5cf6'),{type:'line',label:'Cuenta corriente (saldo)',data:per.map(d=>val(Q.CA,d)),borderColor:'#0b5bd3',backgroundColor:'#0b5bd3',preserveColor:true,borderWidth:2.5,pointRadius:2,stack:'ca',order:0}].filter(d=>d.data.some(v=>v!==null));
    return {chartType:'bar',stacked:true,labels:per.map(bopQuarterLabel),rawPeriods:per,maxTicks:14,datasets:ds,source:'INDEC — Balanza de pagos, posición de inversión internacional y deuda externa',legend:`Millones de USD por trimestre, ${bopQuarterLabel(per[0])}–${bopQuarterLabel(per.at(-1))}. Barras: saldo de bienes, servicios, ingreso primario y secundario; línea: saldo de la cuenta corriente.`};}}
  if(key==='ila'&&S.ilaHistorical?.monthly){const mm=Object.fromEntries(Object.entries(S.ilaHistorical.monthly).map(([k,v])=>[k,v?.mom])),x=monthRangeEntries(mm,60);if(x.length)return {chartType:'bar',labels:x.map(([d])=>displayMonth(d)),rawPeriods:x.map(([d])=>d),datasets:[{label:'ILA-ARG · variación mensual (%)',data:x.map(([,v])=>v)}],source:'CICEc — Bolsas de Comercio de Santa Fe y Rosario',legend:`Últimos ${x.length} meses: variación mensual del Índice Líder (anticipa los puntos de giro del ciclo económico).`};}
  if(key==='iga'&&S.igaHistorical?.monthly){const mm=Object.fromEntries(Object.entries(S.igaHistorical.monthly).map(([k,v])=>[k,v?.momSa])),x=monthRangeEntries(mm,60);if(x.length)return {chartType:'bar',labels:x.map(([d])=>displayMonth(d)),rawPeriods:x.map(([d])=>d),datasets:[{label:'IGA-OJF · variación mensual desestacionalizada (%)',data:x.map(([,v])=>v)}],source:'Orlando J. Ferreres & Asociados',legend:`Últimos ${x.length} meses publicados: variación mensual del IGA-OJF desestacionalizado. Los últimos 4 datos están sujetos a revisión.`};}
  if(key==='emae'&&S.emaeHistorical?.monthlySaMom){const x=monthRangeEntries(S.emaeHistorical.monthlySaMom,60);if(x.length)return {chartType:'bar',labels:x.map(([d])=>displayMonth(d)),rawPeriods:x.map(([d])=>d),datasets:[{label:'EMAE · variación mensual desestacionalizada (%)',data:x.map(([,v])=>v)}],source:'INDEC / Datos Argentina',legend:`Últimos ${x.length} meses: variación mensual del EMAE desestacionalizado.`};}
  // IPI: monthlyYoy ya es la variación interanual calculada sobre la serie original del IPI.
  if(key==='ipi'&&(S.industryHistorical?.monthlySaMom||S.industryHistorical?.monthlyYoy)){const sa=Object.keys(S.industryHistorical.monthlySaMom||{}).length>0,x=monthRangeEntries(sa?S.industryHistorical.monthlySaMom:S.industryHistorical.monthlyYoy,60);if(x.length)return {chartType:'bar',labels:x.map(([d])=>displayMonth(d)),rawPeriods:x.map(([d])=>d),datasets:[{label:sa?'IPI manufacturero · variación mensual desestacionalizada (%)':'IPI manufacturero · variación interanual (%)',data:x.map(([,v])=>v===null?null:Number(v.toFixed(1)))}],source:'INDEC / Datos Argentina',legend:`Últimos ${x.length} meses: ${sa?'variación mensual del IPI desestacionalizado':'variación interanual del IPI'}.`};}
  // ISAC: el identificador 33.2_I_2004_M_4 ya es porcentaje interanual; no volver a calcular YoY.
  if(key==='isac'&&(S.isacHistorical?.monthlySaMom||S.isacHistorical?.monthlyYoy)){const sa=Object.keys(S.isacHistorical.monthlySaMom||{}).length>0,x=monthRangeEntries(sa?S.isacHistorical.monthlySaMom:S.isacHistorical.monthlyYoy,60);if(x.length)return {chartType:'bar',labels:x.map(([d])=>displayMonth(d)),rawPeriods:x.map(([d])=>d),datasets:[{label:sa?'ISAC · variación mensual desestacionalizada (%)':'ISAC · variación interanual (%)',data:x.map(([,v])=>v===null?null:Number(v.toFixed(1)))}],source:'INDEC / Datos Argentina',legend:`Últimos ${x.length} meses: ${sa?'variación mensual del ISAC desestacionalizado':'variación interanual del ISAC'}.`};}
  if(key==='credit'&&S.creditHistorical?.monthlySaRealMom){const x=monthRangeEntries(S.creditHistorical.monthlySaRealMom,60),gaps=x.filter(([,v])=>v===null).length;if(x.length)return {chartType:'bar',labels:x.map(([d])=>displayMonth(d)),rawPeriods:x.map(([d])=>d),datasets:[{label:'Préstamos en pesos · variación mensual real s.e. (%)',data:x.map(([,v])=>v)}],source:'BCRA — Informe Monetario Mensual',legend:`Últimos ${x.length} meses: préstamos en pesos al sector privado, variación mensual a precios constantes y sin estacionalidad.${gaps?` ${gaps} mes(es) sin cifra publicada por el BCRA.`:''}`};}
  if(key==='arrears'&&S.arrearsHistorical?.monthlyTotal){const H=S.arrearsHistorical,x=monthRangeEntries(H.monthlyTotal,121),per=x.map(([d])=>d);const mk=(label,src,color)=>({label,data:per.map(d=>Number.isFinite(Number(src?.[d]))?Number(src[d]):null),borderColor:color,backgroundColor:color,pointRadius:0,pointHoverRadius:4,fill:false});const ds=[mk('Total sector privado',H.monthlyTotal,'#0b5bd3'),mk('Familias',H.monthlyFamilies,'#dc2626'),mk('Empresas',H.monthlyCompanies,'#16a34a')].filter(d=>d.data.some(v=>v!==null));if(x.length)return {chartType:'line',labels:per.map(displayMonth),rawPeriods:per,maxTicks:12,datasets:ds,source:'BCRA — Informe sobre Bancos',legend:`Ratio de irregularidad del crédito al sector privado (%), ${displayMonth(per[0])}–${displayMonth(per.at(-1))}: total, familias y empresas.`};}
  if(key==='autos'&&Object.keys(autosHistory(S)).length){const h=autosHistory(S),years=[...new Set(Object.keys(h).filter(k=>/^\d{4}-\d{2}$/.test(k)).map(k=>Number(k.slice(0,4))))].sort((a,b)=>a-b).slice(-5),months=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];const palette=['#2563eb','#7c3aed','#0891b2','#ea580c','#16a34a'];const datasets=years.map((y,j)=>({label:String(y),backgroundColor:palette[j],borderColor:palette[j],preserveColor:true,data:months.map((_,i)=>{const v=h[`${y}-${String(i+1).padStart(2,'0')}`];return v==null?null:Number(v);})}));return {chartType:'bar',labels:months,datasets,source:'ACARA / SIOMAA',legend:`Patentamientos mensuales por año (${years[0]}–${years.at(-1)}). Cada año conserva un color propio.`};}
  if(key==='cement'){const monthly=Object.fromEntries(Object.entries(cementYoyMap(S)).filter(([d,v])=>/^\d{4}-(0[1-9]|1[0-2])$/.test(d)&&Number.isFinite(Number(v))));const x=recentEntries(monthly,60);if(!x.length)return null;return {chartType:'bar',labels:x.map(([d])=>displayMonth(d)),rawPeriods:x.map(([d])=>d),datasets:[{label:'Despachos de cemento · variación interanual mensual (%)',data:x.map(([,v])=>Number(v)),type:'bar'}],source:'AFCP',legend:`Últimos 5 años: ${x.length} observaciones mensuales de variación interanual (%). Fuente AFCP.`};}
  const cached=kpiHistoryCache[key],h=cached?.history||A[key]?.history;if(h){const keys=Object.keys(h);if(keys.length&&h[keys[0]]&&typeof h[keys[0]]==='object'&&!Array.isArray(h[keys[0]])){const labels=[...new Set(keys.flatMap(k=>Object.keys(h[k]||{})))].filter(d=>/^\d{4}-\d{2}$/.test(d)).sort().slice(-60);const datasets=keys.map(k=>({label:k,data:labels.map(d=>{const v=h[k]?.[d];return v===null||v===undefined?null:Number(v);})})).filter(ds=>ds.data.some(v=>Number.isFinite(v)));if(labels.length&&datasets.length)return {labels:labels.map(displayMonth),datasets,source:cached?.source||A[key]?.source||A[key]?.sourceUrl||A.source};}const x=recentEntries(h);if(x.length)return {labels:x.map(([d])=>displayMonth(d)),datasets:[{label:KPI_META[key]?.title||key,data:x.map(([,v])=>Number(v))}],source:cached?.source||A[key]?.source||A[key]?.sourceUrl||A.source};}
  if(key==='trade'){const monthly=Object.fromEntries(Object.entries(tradeBalanceMonthly||{}).filter(([d,v])=>/^\d{4}-(0[1-9]|1[0-2])$/.test(String(d))&&Number.isFinite(Number(v))));const x=recentEntries(monthly,60);if(x.length)return {chartType:'bar',labels:x.map(([d])=>displayMonth(d)),rawPeriods:x.map(([d])=>d),tradeArrow:true,datasets:[{label:'Saldo comercial mensual (M USD)',data:x.map(([,v])=>Number(v))}],source:'INDEC',legend:'Saldo comercial mensual. La flecha une el último mes con el mismo mes del año anterior y muestra la variación porcentual interanual del saldo.'};return null;}const maps={poverty:poverty};if(maps[key]){const x=Object.entries(maps[key]).filter(([d,v])=>/^\d{4}$/.test(String(d))&&Number.isFinite(Number(v))).sort(([a],[b])=>Number(a)-Number(b));if(x.length)return {chartType:'line',labels:x.map(([d])=>String(d)),datasets:[{label:KPI_META[key]?.title||key,data:x.map(([,v])=>Number(v))}],source:KPI_META[key]?.agency,legend:`${x.length} observaciones históricas publicadas disponibles.`};}
  return null;
}
const tradeYoYArrowPlugin={
  id:'tradeYoYArrow',
  afterDatasetsDraw(chart,args,opts){
    if(!opts?.enabled||!Array.isArray(opts.periods)||opts.periods.length<13)return;
    const periods=opts.periods, last=periods.at(-1); if(!/^\d{4}-\d{2}$/.test(last))return;
    const prev=`${Number(last.slice(0,4))-1}-${last.slice(5)}`;
    const i2=periods.lastIndexOf(last), i1=periods.lastIndexOf(prev); if(i1<0||i2<0)return;
    const meta=chart.getDatasetMeta(0), b1=meta.data[i1], b2=meta.data[i2]; if(!b1||!b2)return;
    const v1=Number(chart.data.datasets[0].data[i1]),v2=Number(chart.data.datasets[0].data[i2]);
    if(!Number.isFinite(v1)||!Number.isFinite(v2)||v1===0)return;
    const pct=((v2/v1)-1)*100, ctx=chart.ctx, area=chart.chartArea;
    const y1=Math.max(area.top+18,Math.min(area.bottom-18,b1.y-(v1>=0?8:-8)));
    const y2=Math.max(area.top+18,Math.min(area.bottom-18,b2.y-(v2>=0?8:-8)));
    const x1=b1.x,x2=b2.x, dx=x2-x1,dy=y2-y1,len=Math.hypot(dx,dy)||1, ux=dx/len,uy=dy/len;
    ctx.save();ctx.strokeStyle='#334155';ctx.fillStyle='#334155';ctx.lineWidth=1.8;
    ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
    const ah=8;ctx.beginPath();ctx.moveTo(x2,y2);ctx.lineTo(x2-ah*ux+ah*.55*uy,y2-ah*uy-ah*.55*ux);ctx.lineTo(x2-ah*ux-ah*.55*uy,y2-ah*uy+ah*.55*ux);ctx.closePath();ctx.fill();
    const mx=(x1+x2)/2,my=(y1+y2)/2-12,label=`${pct>=0?'+':''}${pct.toLocaleString('es-AR',{maximumFractionDigits:1})}% i.a.`;
    ctx.font='700 11px Inter, ui-sans-serif, system-ui, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
    const w=ctx.measureText(label).width+12;ctx.fillStyle='rgba(255,255,255,.94)';ctx.fillRect(mx-w/2,my-9,w,18);ctx.fillStyle=pct>=0?'#15803d':'#b91c1c';ctx.fillText(label,mx,my);
    ctx.restore();
  }
};
function barValueColor(ctx){const v=Number(ctx.raw);return v<0?'#d64545':v>0?'#1f9d55':'#94a3b8';}
function barBorderColor(ctx){return barValueColor(ctx);}
function closeKpiModal(){const m=document.getElementById('kpiModal');if(!m)return;m.hidden=true;m.setAttribute('aria-hidden','true');document.body.style.overflow='';if(kpiDetailChart){kpiDetailChart.destroy();kpiDetailChart=null;}}
function openKpiModal(key){const card=document.querySelector(`.kpi[data-kpi="${key}"]`),m=document.getElementById('kpiModal');if(!card||!m)return;const meta=KPI_META[key]||{},series=kpiSeries(key),value=card.querySelector('[data-value]')?.textContent||'—',period=card.querySelector('[data-period]')?.textContent||'';document.getElementById('kpiModalTitle').textContent=meta.title||card.querySelector('.kpi-top span')?.textContent||'Evolución';document.getElementById('kpiModalAgency').textContent=meta.agency||card.querySelector('.kpi-top b')?.textContent||'';document.getElementById('kpiModalValue').textContent=value;document.getElementById('kpiModalPeriod').textContent=`Último dato: ${period}`;const empty=document.getElementById('kpiModalEmpty'),canvas=document.getElementById('kpiModalChart'),legend=document.getElementById('kpiModalLegend'),source=document.getElementById('kpiModalSource');const controls=document.getElementById('kpiModalControls');if(controls){if(key==='fiscal'){controls.hidden=false;controls.innerHTML=`<button type="button" data-fiscal="primary" class="${fiscalMetric==='primary'?'active':''}">Primario</button><button type="button" data-fiscal="financial" class="${fiscalMetric==='financial'?'active':''}">Financiero</button>`;controls.querySelectorAll('[data-fiscal]').forEach(b=>b.addEventListener('click',()=>{fiscalMetric=b.dataset.fiscal;closeKpiModal();openKpiModal('fiscal');}));}else{controls.hidden=true;controls.innerHTML='';}}if(kpiDetailChart){kpiDetailChart.destroy();kpiDetailChart=null;}if(!series||!series.labels?.length){canvas.hidden=true;empty.hidden=false;empty.textContent='La fuente disponible todavía no entrega observaciones históricas suficientes para construir la evolución sin interpolar datos.';legend.textContent='No se completan meses artificialmente.';source.textContent='';}else{canvas.hidden=false;empty.hidden=true;kpiDetailChart=new Chart(canvas,{type:series.chartType||'line',plugins:[...(series.presidentOverlay?[icgPresidentialPlugin]:[]),...(series.tradeArrow?[tradeYoYArrowPlugin]:[])],data:{labels:series.labels,datasets:series.datasets.map(d=>({...d,borderWidth:d.borderWidth??(series.chartType==='bar'?1:2.5),backgroundColor:series.chartType==='bar'?(d.preserveColor?d.backgroundColor:barValueColor):d.backgroundColor,borderColor:series.chartType==='bar'?(d.preserveColor?d.borderColor:barBorderColor):d.borderColor,pointRadius:d.pointRadius??(series.chartType==='bar'?0:(series.presidentOverlay?0:3)),pointHoverRadius:(series.chartType==='bar'?0:5),tension:.2,spanGaps:false}))},options:{responsive:true,maintainAspectRatio:false,layout:{padding:{top:series.presidentOverlay?78:0}},interaction:{mode:'index',intersect:false},plugins:{legend:{display:series.datasets.length>1,position:'bottom'},icgPresidents:{enabled:!!series.presidentOverlay,periods:series.rawPeriods||[]},tradeYoYArrow:{enabled:!!series.tradeArrow,periods:series.rawPeriods||[]}},scales:{x:{stacked:!!series.stacked,grid:{display:false},ticks:{maxTicksLimit:series.presidentOverlay?14:(series.maxTicks||undefined)}},y:{stacked:!!series.stacked,beginAtZero:!!series.stacked}}}});legend.textContent=series.legend||`${series.labels.length} observaciones publicadas disponibles.`;source.textContent=`Fuente: ${series.source||meta.agency||'fuente indicada en la tarjeta'}`;}m.hidden=false;m.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';m.querySelector('.kpi-modal-close')?.focus();}
function initKpiExplorer(){document.querySelectorAll('.kpi[data-kpi]').forEach(card=>{card.tabIndex=0;card.setAttribute('role','button');card.setAttribute('aria-label',`Ver evolución de ${card.querySelector('.kpi-top span')?.textContent||'indicador'}`);card.addEventListener('click',()=>openKpiModal(card.dataset.kpi));card.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openKpiModal(card.dataset.kpi);}});});document.querySelectorAll('[data-kpi-close]').forEach(x=>x.addEventListener('click',closeKpiModal));document.addEventListener('keydown',e=>{if(e.key==='Escape')closeKpiModal();});}


// ===================== v115 · Tarjetas: presentación única, semáforo y orden =====================
// Cada tarjeta se arma desde los mismos datos que usan los gráficos (histórico local + API fusionados).
// Grande: la variación principal (mensual s.e. o interanual) o el nivel cuando una variación no tiene sentido
// (pobreza, balanza, resultado fiscal, mora). Chico: la comparación complementaria (interanual / nominal / p.p.).
// Semáforo: verde = favorable para la economía, amarillo = sin cambio relevante, rojo = desfavorable.
const kpiFmt1=new Intl.NumberFormat('es-AR',{minimumFractionDigits:1,maximumFractionDigits:1});
function kpiNum(n){const x=Math.round(Number(n)*10)/10;return kpiFmt1.format(Object.is(x,-0)?0:x);}
function kpiPct(n){const x=Math.round(Number(n)*10)/10,z=Object.is(x,-0)?0:x;return `${z>0?'+':z<0?'−':''}${kpiFmt1.format(Math.abs(z))}%`;}
const SIGNAL_LABEL={green:'Favorable',yellow:'Neutral',red:'Desfavorable'};
const kpiInitial={};
function kpiLastEntries(obj,n=2){return Object.entries(obj||{}).filter(([d,v])=>/^\d{4}-\d{2}$/.test(d)&&v!==null&&v!==''&&Number.isFinite(Number(v))).map(([d,v])=>[d,Number(v)]).sort(([a],[b])=>a.localeCompare(b)).slice(-n);}
function ymShift(ym,months){let [y,m]=ym.split('-').map(Number);m+=months;while(m<1){m+=12;y--;}while(m>12){m-=12;y++;}return `${y}-${String(m).padStart(2,'0')}`;}
function numOrNull(v){return v===null||v===undefined||v===''||!Number.isFinite(Number(v))?null:Number(v);}
// Banda neutral: |x| <= band → amarillo. higherIsBetter define el sentido.
function signalFrom(x,band,higherIsBetter=true){if(x===null)return 'yellow';if(Math.abs(x)<=band+1e-9)return 'yellow';return (x>0)===higherIsBetter?'green':'red';}
function signedPpText(n){const x=Number(n);return `${x>0?'+':x<0?'−':''}${kpiNum(Math.abs(x))} p.p.`;}
function computeKpiCards(){
  const S=kpiSourceCache||{},A=S.activityPulse||{},C={};
  // Inflación nacional: grande mensual; chico p.p. vs mes anterior + interanual.
  {const rows=(Array.isArray(S.ipc?.monthly)?S.ipc.monthly:[]).filter(r=>/^\d{4}-\d{2}$/.test(String(r?.date||''))&&Number.isFinite(Number(r.value))).sort((a,b)=>a.date.localeCompare(b.date));
   const L=rows.at(-1),P=rows.at(-2);
   if(L){const idx=Object.fromEntries(rows.map(r=>[r.date,Number(r.index)])),y12=idx[ymShift(L.date,-12)],yoy=Number.isFinite(y12)&&Number.isFinite(idx[L.date])?(idx[L.date]/y12-1)*100:numOrNull(S.ipc?.latest?.yoy);
     const pp=P?Number(L.value)-Number(P.value):null;
     C.ipc={ym:L.date,value:`${kpiNum(L.value)}%`,period:`${displayMonth(L.date)} · mensual`,detail:[pp!==null?`${signedPpText(pp)} vs ${displayMonth(P.date)}`:null,yoy!==null?`${kpiNum(yoy)}% interanual`:null].filter(Boolean).join(' · '),
       signal:signalFrom(pp,0.1,false),why:pp===null?'Sin mes previo para comparar.':`La inflación mensual ${pp<0?'bajó':pp>0?'subió':'no cambió'} ${kpiNum(Math.abs(pp))} p.p. respecto de ${displayMonth(P.date)}.`};}}
  // Inflación CABA: misma presentación; interanual = acumulado de los últimos 12 meses.
  {const e=kpiLastEntries(S.ipcCaba?.history,13);const L=e.at(-1),P=e.at(-2);
   if(L){const pp=P?L[1]-P[1]:null;const last12=e.slice(-12);const yoy=last12.length===12&&last12[0][0]===ymShift(L[0],-11)?(last12.reduce((f,[,v])=>f*(1+v/100),1)-1)*100:null;
     C.ipcCaba={ym:L[0],value:`${kpiNum(L[1])}%`,period:`${displayMonth(L[0])} · mensual`,detail:[pp!==null?`${signedPpText(pp)} vs ${displayMonth(P[0])}`:null,yoy!==null?`${kpiNum(yoy)}% interanual`:null].filter(Boolean).join(' · '),
       signal:signalFrom(pp,0.1,false),why:pp===null?'Sin mes previo para comparar.':`La inflación mensual ${pp<0?'bajó':pp>0?'subió':'no cambió'} ${kpiNum(Math.abs(pp))} p.p. respecto de ${displayMonth(P[0])}.`};}}
  // Actividad (EMAE, IPI, ISAC): grande variación mensual s.e.; chico interanual del mismo mes.
  const activity=(key,src,label)=>{const sa=kpiLastEntries(src?.monthlySaMom,1)[0],yo=kpiLastEntries(src?.monthlyYoy,1)[0];
    if(sa){const y=numOrNull(src?.monthlyYoy?.[sa[0]]);C[key]={ym:sa[0],value:kpiPct(sa[1]),period:`${displayMonth(sa[0])} · mensual s.e.`,detail:y!==null?`${kpiPct(y)} interanual`:label,signal:signalFrom(sa[1],0.1,true),why:`${label}: ${sa[1]>0?'creció':sa[1]<0?'cayó':'no varió'} ${kpiNum(Math.abs(sa[1]))}% mensual sin estacionalidad.`};}
    else if(yo)C[key]={ym:yo[0],value:kpiPct(yo[1]),period:`${displayMonth(yo[0])} · interanual`,detail:label,signal:signalFrom(yo[1],0.5,true),why:`${label}: variación interanual de ${kpiPct(yo[1])}.`};};
  activity('emae',S.emaeHistorical,'Actividad económica');
  activity('ipi',S.industryHistorical,'Industria manufacturera');
  activity('isac',S.isacHistorical,'Construcción');
  // v116 · IGA-OJF: igual que EMAE (mensual s.e. grande, interanual abajo).
  {const H=S.igaHistorical?.monthly||{};activity('iga',{monthlySaMom:Object.fromEntries(Object.entries(H).map(([k,v])=>[k,v?.momSa])),monthlyYoy:Object.fromEntries(Object.entries(H).map(([k,v])=>[k,v?.yoy]))},'Actividad (IGA-OJF)');}
  // v116 · ILA-ARG: grande variación mensual; abajo interanual e índice de difusión (>50% = mayoría de series líderes en alza).
  {const H=S.ilaHistorical?.monthly||{},L=kpiLastEntries(Object.fromEntries(Object.entries(H).map(([k,v])=>[k,v?.mom])),1)[0];
   if(L){const r=H[L[0]]||{},yoy=numOrNull(r.yoy),dif=numOrNull(r.diffusion);
     C.ila={ym:L[0],value:kpiPct(L[1]),period:`${displayMonth(L[0])} · variación mensual`,detail:[yoy!==null?`${kpiPct(yoy)} interanual`:null,dif!==null?`difusión ${new Intl.NumberFormat('es-AR',{maximumFractionDigits:0}).format(dif)}%`:null].filter(Boolean).join(' · '),signal:signalFrom(L[1],0.1,true),why:`El Índice Líder ${L[1]>0?'subió':L[1]<0?'bajó':'no varió'} ${kpiNum(Math.abs(L[1]))}% en el mes${dif!==null?`; ${kpiNum(dif)}% de las series líderes en alza`:''}.`};}}
  // Recaudación: grande interanual real (deflactada con IPC del mismo mes); chico interanual nominal.
  {const L=kpiLastEntries(arcaHistory(S),1)[0];
   if(L){const R=arcaRealYoy(S,L[0],L[1]),real=R?R.real:null;
     const remTxt=R?.estimated?R.remMonths.map(([k,e])=>`${kpiNum(e)}% en ${displayMonth(k)}`).join(' y '):'';
     C.arca={ym:L[0],value:real!==null?kpiPct(real):kpiPct(L[1]),period:`${displayMonth(L[0])} · ${real===null?'interanual nominal':R.estimated?'interanual real estimada':'interanual real'}`,
       detail:real===null?'Real: sin IPC del mes':`${kpiPct(L[1])} interanual nominal${R.estimated?` · IPC estimado con REM (${remTxt})`:''}`,
       signal:signalFrom(real,0.5,true),
       why:real===null?'Sin IPC del mes para deflactar.':`${Math.abs(real)<0.05?'La recaudación no varió en términos reales interanuales':`La recaudación ${real>0?'creció':'cayó'} ${kpiNum(Math.abs(real))}% real interanual`}${R.estimated?`. Estimación: INDEC todavía no publicó el IPC; se usa la inflación mensual esperada por el REM del BCRA (mediana: ${remTxt}), que se reemplaza automáticamente por el dato oficial.`:'.'}`};}}
  // Pobreza: nivel; chico p.p. vs dato anterior (+ indigencia publicada).
  {const SEM=S.poverty?.semesters||{},sk=Object.keys(SEM).filter(k=>/^\d{4}-S[12]$/.test(k)&&Number.isFinite(Number(SEM[k]))).sort();
   if(sk.length){const L=sk.at(-1),v=Number(SEM[L]),y=+L.slice(0,4),h=L.slice(-1),prevK=h==='2'?`${y}-S1`:`${y-1}-S2`,yoyK=`${y-1}-S${h}`;const pv=numOrNull(SEM[prevK]),py=numOrNull(SEM[yoyK]);
     const lab=k=>`${k.slice(-1)}S ${k.slice(0,4)}`,ppY=py!==null?v-py:null,ppP=pv!==null?v-pv:null;const ind=(kpiInitial.poverty?.period||'').includes(lab(L))?(kpiInitial.poverty?.detail||'').match(/[\d,]+%\s*indigencia/):null;
     C.poverty={ym:`${y}-${h==='1'?'06':'12'}`,value:`${kpiNum(v)}%`,period:`${lab(L)} · personas`,detail:[ppY!==null?`${signedPpText(ppY)} vs ${lab(yoyK)}`:null,ppP!==null?`${signedPpText(ppP)} vs ${lab(prevK)}`:null,ind?ind[0]:null].filter(Boolean).join(' · '),signal:signalFrom(ppY,0.3,false),why:ppY===null?'Sin semestre comparable.':`La pobreza ${ppY<0?'bajó':ppY>0?'subió':'no cambió'} ${kpiNum(Math.abs(ppY))} p.p. frente al mismo semestre del año anterior (${lab(yoyK)}).`};}
   else{const e=Object.entries(poverty||{}).filter(([y,v])=>/^\d{4}$/.test(y)&&Number.isFinite(Number(v))).sort(([a],[b])=>Number(a)-Number(b));const L=e.at(-1),P=e.at(-2);
   if(L){const per=kpiInitial.poverty?.period||`${L[0]}`,sem=per.match(/([12])S\s*(20\d{2})/),ym=sem?`${sem[2]}-${sem[1]==='1'?'06':'12'}`:`${L[0]}-12`;const pp=P?Number(L[1])-Number(P[1]):null;const ind=(kpiInitial.poverty?.detail||'').match(/[\d,]+%\s*indigencia/);
     C.poverty={ym,value:`${kpiNum(L[1])}%`,period:per,detail:[pp!==null?`${signedPpText(pp)} vs dato anterior`:null,ind?ind[0]:null].filter(Boolean).join(' · '),signal:signalFrom(pp,0.3,false),why:pp===null?'Sin dato previo.':`La pobreza ${pp<0?'bajó':pp>0?'subió':'no cambió'} ${kpiNum(Math.abs(pp))} p.p. respecto del dato anterior.`};}}}
  // Confianza en el gobierno: grande variación mensual; chico nivel + interanual.
  {const e=kpiLastEntries(S.icg?.history,2),L=e.at(-1),P=e.at(-2);
   if(L){const pub=S.icg?.latest,pubOk=pub&&ymFromSpanishPeriod(pub.period)===L[0]&&Number.isFinite(Number(pub.mom));const mom=pubOk?Number(pub.mom):P?(L[1]/P[1]-1)*100:null,y0=numOrNull(S.icg?.history?.[ymShift(L[0],-12)]),yoy=y0?(L[1]/y0-1)*100:null;
     C.icg={ym:L[0],value:mom!==null?kpiPct(mom):new Intl.NumberFormat('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(L[1]),period:`${displayMonth(L[0])} · ${mom!==null?'variación mensual':'puntos'}`,detail:[`${new Intl.NumberFormat('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2}).format(L[1])} puntos`,yoy!==null?`${kpiPct(yoy)} interanual`:null].filter(Boolean).join(' · '),signal:signalFrom(mom,1,true),why:mom===null?'Sin mes previo.':`La confianza ${mom>0?'subió':mom<0?'bajó':'no cambió'} ${kpiNum(Math.abs(mom))}% respecto del dato previo.`};}}
  // Balanza comercial: nivel del saldo; chico diferencia vs mismo mes del año anterior.
  {const L=kpiLastEntries(tradeBalanceMonthly,1)[0];
   if(L){const prev=numOrNull(tradeBalanceMonthly[ymShift(L[0],-12)]),diff=prev!==null?L[1]-prev:null,sup=L[1]>=0;
     C.trade={ym:L[0],value:`USD ${new Intl.NumberFormat('es-AR',{maximumFractionDigits:0}).format(Math.abs(L[1]))} M`,period:`${displayMonth(L[0])} · ${sup?'superávit':'déficit'}`,detail:diff!==null?`${diff>=0?'+':'−'}${new Intl.NumberFormat('es-AR',{maximumFractionDigits:0}).format(Math.abs(diff))} M USD vs ${displayMonth(ymShift(L[0],-12))}`:'Comercio exterior',
       signal:!sup?'red':diff!==null&&diff<0?'yellow':'green',why:!sup?'Déficit comercial en el mes.':diff!==null&&diff<0?'Superávit, pero menor que un año atrás.':'Superávit comercial igual o mayor que un año atrás.'};}}
  // v122 · Balanza de pagos (INDEC, trimestral): grande el saldo de cuenta corriente; chico diferencia vs mismo trimestre del año anterior y variación de reservas.
  {const Q=S.bopHistorical?.quarterly||{},ks=Object.keys(Q.CA||{}).filter(k=>/^\d{4}-Q[1-4]$/.test(k)&&Number.isFinite(Number(Q.CA[k]))).sort(),k=ks.at(-1);
   if(k){const v=Number(Q.CA[k]),py=`${Number(k.slice(0,4))-1}${k.slice(4)}`,prev=numOrNull(Q.CA[py]),diff=prev!==null?v-prev:null,res=numOrNull(Q.RES?.[k]),sup=v>=0,f=new Intl.NumberFormat('es-AR',{maximumFractionDigits:0});
     C.bop={ym:`${k.slice(0,4)}-${String(Number(k.slice(-1))*3).padStart(2,'0')}`,value:`USD ${f.format(Math.abs(v))} M`,period:`${bopQuarterLabel(k)} · ${sup?'superávit':'déficit'} de cuenta corriente`,
       detail:[diff!==null?`${diff>=0?'+':'−'}${f.format(Math.abs(diff))} M USD vs ${bopQuarterLabel(py)}`:null,res!==null?`reservas ${res>=0?'+':'−'}${f.format(Math.abs(res))} M`:null].filter(Boolean).join(' · ')||'Balanza de pagos',
       signal:sup?(diff!==null&&diff<0?'yellow':'green'):(diff!==null&&diff>0?'yellow':'red'),
       why:sup?(diff!==null&&diff<0?'Superávit de cuenta corriente, pero menor que un año atrás.':'Superávit de cuenta corriente igual o mayor que un año atrás.'):(diff!==null&&diff>0?'Déficit de cuenta corriente, aunque menor que un año atrás.':'Déficit de cuenta corriente igual o mayor que un año atrás.')};}}
  // Resultado fiscal: niveles (% PIB) primario y financiero; comparación en p.p. i.a. (render propio).
  {const hp=A.fiscal?.historyPctGDP||{},L=kpiLastEntries(hp.primary,1)[0];
   if(L){const pr=L[1],fi=numOrNull(hp.financial?.[L[0]]);C.fiscal={ym:L[0],fiscal:{...A.fiscal,period:displayMonth(L[0])},signal:pr<=0?'red':fi!==null&&fi<=0?'yellow':'green',why:pr<=0?'Déficit primario acumulado.':fi!==null&&fi<=0?'Superávit primario, pero déficit financiero.':'Superávit primario y financiero acumulados.'};}}
  // Cemento: grande interanual; chico volumen del mes (si coincide el período).
  {const L=kpiLastEntries(cementYoyMap(S),1)[0];
   if(L){const c=A.cement,tons=c&&ymFromSpanishPeriod(c.period)===L[0]&&Number.isFinite(Number(c.tons))?Number(c.tons):null;
     C.cement={ym:L[0],value:kpiPct(L[1]),period:`${displayMonth(L[0])} · interanual`,detail:tons!==null?`${new Intl.NumberFormat('es-AR',{maximumFractionDigits:0}).format(tons/1000)} mil toneladas`:'Despachos totales',signal:signalFrom(L[1],0.5,true),why:`Despachos ${L[1]>0?'por encima':L[1]<0?'por debajo':'en línea con'} del mismo mes del año anterior.`};}}
  // Patentamientos: grande interanual; chico unidades del mes.
  {const h=autosHistory(S),L=kpiLastEntries(h,1)[0];
   if(L){const p=numOrNull(h[ymShift(L[0],-12)]),yoy=p?(L[1]/p-1)*100:null;
     C.autos={ym:L[0],value:yoy!==null?kpiPct(yoy):new Intl.NumberFormat('es-AR').format(L[1]),period:`${displayMonth(L[0])} · interanual`,detail:`${new Intl.NumberFormat('es-AR').format(L[1])} unidades`,signal:signalFrom(yoy,0.5,true),why:yoy===null?'Sin mes comparable.':`Patentamientos ${yoy>0?'por encima':'por debajo'} del mismo mes del año anterior.`};}}
  // Crédito: grande variación mensual real s.e. (BCRA); chico interanual nominal del mismo mes.
  {const L=kpiLastEntries(S.creditHistorical?.monthlySaRealMom,1)[0];
   if(L){const nom=numOrNull(S.creditHistorical?.monthlyYoy?.[L[0]]);
     C.credit={ym:L[0],value:kpiPct(L[1]),period:`${displayMonth(L[0])} · pesos, real mensual s.e.`,detail:nom!==null?`${kpiPct(nom)} interanual nominal`:'Préstamos al sector privado',signal:signalFrom(L[1],0.1,true),why:`Préstamos en pesos: ${L[1]>0?'crecieron':L[1]<0?'cayeron':'sin cambio'} ${kpiNum(Math.abs(L[1]))}% real sin estacionalidad.`};}}
  // Mora: nivel total; chico p.p. vs mes anterior + familias y empresas.
  {const H=S.arrearsHistorical||{},e=kpiLastEntries(H.monthlyTotal,2),L=e.at(-1),P=e.at(-2);
   if(L){const pp=P?L[1]-P[1]:null,f=numOrNull(H.monthlyFamilies?.[L[0]]),c=numOrNull(H.monthlyCompanies?.[L[0]]);
     C.arrears={ym:L[0],value:`${kpiNum(L[1])}%`,period:`${displayMonth(L[0])} · irregularidad total`,detail:[pp!==null?`${signedPpText(pp)} vs ${displayMonth(P[0])}`:null,f!==null&&c!==null?`familias ${kpiNum(f)}% · empresas ${kpiNum(c)}%`:null].filter(Boolean).join(' · '),signal:signalFrom(pp,0.1,false),why:pp===null?'Sin mes previo.':`La mora ${pp<0?'bajó':pp>0?'subió':'no cambió'} ${kpiNum(Math.abs(pp))} p.p. respecto de ${displayMonth(P[0])}.`};}}
  return C;
}
function setKpiSignal(card,level,why){if(!card)return;let el=card.querySelector('[data-signal]');
  if(!el){el=document.createElement('div');el.setAttribute('data-signal','');el.className='kpi-signal';const health=card.querySelector('[data-health]');card.insertBefore(el,health||null);}
  el.dataset.level=level;el.innerHTML=`<i aria-hidden="true"></i>${SIGNAL_LABEL[level]||''}`;el.title=why||'';el.setAttribute('aria-label',`${SIGNAL_LABEL[level]}: ${why||''}`);
  card.classList.remove('signal-green','signal-yellow','signal-red');card.classList.add(`signal-${level}`);}
function sortKpiGrid(){const grid=document.getElementById('kpiGrid');if(!grid)return;const cards=[...grid.querySelectorAll('.kpi[data-kpi]')];
  cards.sort((a,b)=>String(b.dataset.ym||'').localeCompare(String(a.dataset.ym||''))||Number(a.dataset.order)-Number(b.dataset.order));
  for(const c of cards)grid.appendChild(c);}
function bopQuarterLabel(k){const m=String(k).match(/^(\d{4})-Q([1-4])$/);return m?`${m[2]}T ${m[1]}`:String(k);}
// v126: índice de IPC para deflactar la recaudación. Si INDEC todavía no publicó el mes, se extiende
// el último índice publicado con la inflación mensual esperada por el REM (mediana), hasta 2 meses.
function ipcIndexWithRem(S,ym){
  const idx=Object.fromEntries((S.ipc?.monthly||[]).map(r=>[String(r.date).slice(0,7),Number(r.index)]).filter(([,v])=>Number.isFinite(v)));
  if(Number.isFinite(idx[ym]))return {value:idx[ym],estimated:false};
  const rem=S.rem?.cpiExpected?.monthly||{};let k=ym;const chain=[];
  while(!Number.isFinite(idx[k])&&chain.length<3){const e=Number(rem[k]);if(!Number.isFinite(e))return null;chain.unshift([k,e]);k=ymShift(k,-1);}
  if(!Number.isFinite(idx[k])||chain.length>2)return null;
  let v=idx[k];for(const [,e] of chain)v*=1+e/100;
  return {value:v,estimated:true,remMonths:chain,survey:S.rem?.cpiExpected?.survey||null};
}
function arcaRealYoy(S,ym,nominal){
  const i1=ipcIndexWithRem(S,ym),i0=ipcIndexWithRem(S,ymShift(ym,-12));
  if(!i1||!i0||i0.estimated)return null;
  return {real:((1+nominal/100)/(i1.value/i0.value)-1)*100+0,estimated:i1.estimated,remMonths:i1.remMonths||[],survey:i1.survey,inflation:(i1.value/i0.value-1)*100};
}
// v124: el comunicado de ARCA (latest) puede ser más nuevo que la serie mensual; se incorpora al histórico.
function arcaHistory(S){const h={...(S?.arca?.history||{})},L=S?.arca?.latest;if(L&&Number.isFinite(Number(L.yoy))){const ym=L.ym||ymFromSpanishPeriod(L.period||'');if(ym&&/^\d{4}-\d{2}$/.test(ym))h[ym]=Number(L.yoy);}return h;}
function renderKpiCards(){
  document.querySelectorAll('.kpi[data-kpi]').forEach((c,i)=>{if(c.dataset.order===undefined)c.dataset.order=String(i);const k=c.dataset.kpi;if(!kpiInitial[k])kpiInitial[k]={period:c.querySelector('[data-period]')?.textContent||'',detail:c.querySelector('[data-detail]')?.textContent||''};
    if(!c.dataset.ym){const ym=ymFromSpanishPeriod(kpiInitial[k].period);const sem=kpiInitial[k].period.match(/([12])S\s*(20\d{2})/);c.dataset.ym=ym||(sem?`${sem[2]}-${sem[1]==='1'?'06':'12'}`:'');}});
  let C={};try{C=computeKpiCards();}catch(e){console.warn('kpi cards',e);}
  for(const [key,x] of Object.entries(C)){const card=document.querySelector(`.kpi[data-kpi="${key}"]`);if(!card)continue;
    try{if(key==='fiscal'){setFiscalKpi(x.fiscal);card.querySelectorAll('[data-fiscal-primary-yoy],[data-fiscal-financial-yoy]').forEach(el=>el.classList.remove('tone-up','tone-down','tone-flat'));}else{setKpi(key,x.value,x.period,x.detail);for(const s of ['[data-value]','[data-detail]'])card.querySelector(s)?.classList.remove('tone-up','tone-down','tone-flat','down');}
      card.dataset.ym=x.ym;setKpiSignal(card,x.signal,x.why);}catch(e){console.warn('kpi',key,e);}}
  sortKpiGrid();
  if(typeof applyCardStatus==='function')applyCardStatus();
}


// v128: estado de actualización de cada tarjeta, según /api/status (período vigente, próximo dato y fecha prevista).
let cardStatusCache=null;
async function loadCardStatus(){
  try{const r=await fetch('/api/status',{cache:'no-store'});if(!r.ok)return;cardStatusCache=await r.json();applyCardStatus();}catch(e){console.warn('card status',e);}
}
function applyCardStatus(){
  const j=cardStatusCache;if(!j)return;
  try{
    for(const c of j.cards||[]){const card=document.querySelector(`.kpi[data-kpi="${c.key}"]`),h=card?.querySelector('[data-health]');if(!h||!c.next)continue;
      const shownYm=card.dataset.ym||'',nextEnd=/^\d{4}-\d{2}$/.test(c.next)?c.next:null;
      if(nextEnd&&shownYm>=nextEnd)continue; // el navegador ya tiene un dato más nuevo
      const when=c.expected?displayDay(c.expected):'';
      if(c.state==='esperando'){h.textContent=`Buscando ${c.nextLabel} · previsto ${when}`;h.className='data-health waiting';}
      else if(c.state==='atrasado'){h.textContent=`${c.nextLabel}: demorado en la fuente`;h.className='data-health late';}
      else{h.textContent=`Próximo dato (${c.nextLabel}): ~${when}`;h.className='data-health live';}
      h.title=c.expectedBasis?`Fecha prevista según ${c.expectedBasis}`:'';}
  }catch(e){console.warn('card status apply',e);}
}
setTimeout(loadCardStatus,3500);setInterval(loadCardStatus,10*60*1000);
// v105: preload bundled histories independently of remote APIs/KV.
loadBundledMacroHistory();
loadMarketsDaily().then(()=>loadFxDaily());

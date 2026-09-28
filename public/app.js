/* Macro Argentina v47 — series auditables, rango personalizado y variación acumulada.
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
let salaryMode='arsNominal'; // arsReal | arsNominal | usdReal | usdNominal
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


function rebuildSalaryViews(){
  for(const o of [salaryArsReal,salaryUsdNominal,salaryUsdReal,salaryArsRealMonthly,salaryUsdNominalMonthly,salaryUsdRealMonthly])for(const k of Object.keys(o))delete o[k];
  // Vistas mensuales. Nunca se rellenan meses sin los insumos necesarios.
  const ripteMonths=Object.keys(salaryRipteMonthly).sort();
  const argCommon=ripteMonths.filter(ym=>Number.isFinite(Number(inflationIndex[ym])));
  const argBaseYm=argCommon.at(-1), argBase=Number(inflationIndex[argBaseYm]);
  if(Number.isFinite(argBase))for(const ym of argCommon){const sal=Number(salaryRipteMonthly[ym]),idx=Number(inflationIndex[ym]);if(Number.isFinite(sal)&&Number.isFinite(idx)&&idx>0)salaryArsRealMonthly[ym]=sal*argBase/idx;}
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
  countryRisk:{title:'Riesgo país',subtitle:'EMBI+ Argentina · cierre anual · puntos básicos',source:'J.P. Morgan vía republicadores trazables',data:countryRisk,note:'<strong>Metodología:</strong> EMBI+ Argentina en puntos básicos. Se conserva la serie comparable desde diciembre de 1998; no se empalma hacia atrás con spreads de bonos de definición diferente.'},
  mervalUsd:{title:'Merval en USD CCL',subtitle:'Índice Merval / CCL · cierre anual',source:'Merval + dólar CCL',data:mervalUsdCcl,note:'<strong>Metodología:</strong> valor del índice Merval expresado en dólares usando contado con liquidación (CCL), para reducir las distorsiones de controles cambiarios. La cobertura homogénea comienza en 2013. El índice local presenta un cambio metodológico Merval → S&P Merval en 2019.'},
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
  const da=key==='salary'?displayMonth(a):a, db=key==='salary'?displayMonth(b):b;
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
  const keys=Object.keys(data).sort(); const monthly=(currentSeries==='inflation'&&inflationFrequency==='monthly')||currentSeries==='salary'; if(!keys.length){for(const id of ['periodFrom','periodTo']){const el=document.getElementById(id);if(el)el.innerHTML='<option value="">—</option>';}return;}
  for(const id of ['periodFrom','periodTo']){const el=document.getElementById(id); if(!el)continue; const old=el.value; el.innerHTML=keys.map(k=>`<option value="${k}">${monthly?displayMonth(k):k}</option>`).join(''); el.value=keys.includes(old)?old:(id==='periodFrom'?keys[0]:keys.at(-1));}
}
function seriesValueLabel(key,v){
  if(key==='countryRisk') return `${fmt.format(v)} pb`;
  if(key==='mervalUsd') return `USD ${fmt.format(v)}`;
  if(key==='salary') return salaryMode.startsWith('usd')?`USD ${fmt.format(v)}`:money.format(v);
  if(key==='freeDollar') return `$ ${fmt.format(v)} / USD`;
  if(['tradeBalance','exports','imports'].includes(key)) return `${fmt.format(v)} M USD`;
  return `${fmt.format(v)}%`;
}
function seriesTickLabel(key,v){
  if(key==='countryRisk') return `${fmt.format(v)} pb`;
  if(key==='mervalUsd') return `USD ${fmt.format(v)}`;
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
    salaryControls:key==='salary'
  };
  for(const [id,show] of Object.entries(visibility)){const el=document.getElementById(id);if(el){el.hidden=!show;el.classList.toggle('hidden',!show);}}
  currentSeries=key; const cfg=seriesConfig[key]; const isInflationMonthly=key==='inflation'&&inflationFrequency==='monthly'; const isSalaryMonthly=key==='salary'; const isMonthly=isInflationMonthly||isSalaryMonthly; let data;if(isInflationMonthly)data=inflationMonthly;else if(key==='salary'){applySalaryMode();data=cfg.data;if(!Object.keys(data||{}).length)data=salaryRipteMonthly;}else data=cfg.data;
  // RIPTE usa una ruta explícita: filtra cualquier valor no numérico antes de Chart.js.
  const cleanData=Object.fromEntries(Object.entries(data||{}).filter(([k,v])=>/^\d{4}(?:-\d{2})?$/.test(k)&&Number.isFinite(Number(v))).map(([k,v])=>[k,Number(v)]));
  syncPeriodSelectors(cleanData);
  const all=Object.entries(cleanData).sort((a,b)=>a[0].localeCompare(b[0])); let shown=all;
  const from=document.getElementById('periodFrom')?.value, to=document.getElementById('periodTo')?.value;
  if(currentRange==='custom'&&from&&to)shown=all.filter(([x])=>x>=from&&x<=to); else if(['5','10','20'].includes(String(currentRange))&&all.length){const lastKey=all.at(-1)[0];const lastYear=Number(String(lastKey).slice(0,4));const cutoffYear=lastYear-Number(currentRange);shown=all.filter(([x])=>Number(String(x).slice(0,4))>=cutoffYear);}
  if(zoomFactor>1&&shown.length>4)shown=shown.slice(-Math.max(4,Math.ceil(shown.length/zoomFactor)));
  const labels=shown.map(x=>isMonthly?displayMonth(x[0]):x[0]), values=shown.map(x=>x[1]);
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
function fxAnnualData(){if(fxSeriesMode==='gap')return fxGap;if(fxSeriesMode==='official')return fxPriceMode==='tcr'?fxOfficialTcr:fxPriceMode==='real'?fxOfficialReal:fxOfficialNominal;return fxPriceMode==='tcr'?fxFreeTcr:fxPriceMode==='real'?freeDollarReal:freeDollarNominal;}
function fxMonthlyData(){if(fxSeriesMode==='gap')return {};if(fxSeriesMode==='official')return fxPriceMode==='tcr'?fxOfficialMonthlyTcr:fxPriceMode==='real'?fxOfficialMonthlyReal:fxOfficialMonthlyNominal;return fxPriceMode==='tcr'?fxFreeMonthlyTcr:fxPriceMode==='real'?fxFreeMonthlyReal:fxFreeMonthlyNominal;}
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
document.getElementById('updateCalc')?.addEventListener('submit',e=>{e.preventDefault();const kind=document.getElementById('updateIndex').value,a=selectedUpdateDate('Start',kind),b=selectedUpdateDate('End',kind),amt=+document.getElementById('updateAmount').value,el=document.getElementById('updateResult');if(b<=a){el.textContent='La fecha final debe ser posterior a la inicial.';return;}const map=kind==='ipc'?(Object.keys(ipcCalcIndex).length?ipcCalcIndex:inflationIndex):(hasDailyIndex(kind)?dailyMapForIndex(kind):monthlyMapForIndex(kind)),initial=Number(map[a]),final=Number(map[b]),f=Number.isFinite(initial)&&Number.isFinite(final)&&initial>0?final/initial:null;if(!f){el.textContent='No hay valores disponibles para ambas fechas seleccionadas.';return;}el.innerHTML=`Índice inicial (${displayCalcDate(a)}): <strong>${fmt.format(initial)}</strong><br>Índice final (${displayCalcDate(b)}): <strong>${fmt.format(final)}</strong><br>Variación ${kind.toUpperCase()}: <strong>${fmt.format((f-1)*100)}%</strong>${amt>0?`<br>${money.format(amt)} → <strong>${money.format(amt*f)}</strong>.`:''}<br><small>Factor ${fmt.format(f)} = índice final / índice inicial.</small>`;});

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
function setKpi(key,value,period,detail){const card=document.querySelector(`.kpi[data-kpi="${key}"]`);if(!card)return;const v=card.querySelector('[data-value]'),p=card.querySelector('[data-period]'),d=card.querySelector('[data-detail]'),h=card.querySelector('[data-health]');if(v)v.textContent=value;if(p)p.textContent=period;if(d)d.textContent=detail;if(h){h.textContent='Fuente verificada';h.className='data-health live';}card.dataset.live='true';}
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
function paintMarkets(L){
  if(!L)return;
  const marketChange=(id,x,inverse=false)=>{const el=document.getElementById(id);if(!el)return;const c=x?.changePct;if(c==null||!Number.isFinite(Number(c))){el.textContent='—';el.className='market-change neutral';return;}const n=Number(c),good=inverse?n<0:n>0;el.textContent=`${n>0?'↑':n<0?'↓':'→'} ${n>0?'+':''}${fmt.format(n)}%`;el.className='market-change '+(n===0?'neutral':good?'positive':'negative');};
  if(L.merval){document.getElementById('heroMerval').textContent=`${fmt.format(L.merval.value)} pts`;marketChange('heroMervalChange',L.merval,false);document.getElementById('heroMervalDate').textContent=L.merval.date||'';}
  if(L.dollar){document.getElementById('heroDollar').textContent=`$ ${fmt.format(L.dollar.value)}`;marketChange('heroDollarChange',L.dollar,true);document.getElementById('heroDollarDate').textContent=L.dollar.date||'';}
  if(L.risk){document.getElementById('heroRisk').textContent=`${fmt.format(L.risk.value)} pb`;marketChange('heroRiskChange',L.risk,true);document.getElementById('heroRiskDate').textContent=L.risk.date||'';}
  if(L.bna){document.getElementById('heroBna').textContent=`$ ${fmt.format(L.bna.sell)} venta`;marketChange('heroBnaChange',L.bna,true);document.getElementById('heroBnaDate').textContent=`${L.bna.date||''} · compra $ ${fmt.format(L.bna.buy)}`;}
}
async function loadMarketsFast(){
  try{const cached=JSON.parse(localStorage.getItem('macroMarketsSnapshot')||'null');if(cached?.latest)paintMarkets(cached.latest);}catch{}
  try{const r=await fetch('/api/markets',{headers:{accept:'application/json'}});if(!r.ok)throw new Error(`markets ${r.status}`);const d=await r.json();paintMarkets(d.latest);try{localStorage.setItem('macroMarketsSnapshot',JSON.stringify(d));}catch{}}catch(e){console.warn('markets fast',e);}
}
async function loadTradeMonthlyFast(){
  try{
    const r=await fetch('/api/trade-monthly',{headers:{accept:'application/json'}}); if(!r.ok)throw new Error(`trade monthly ${r.status}`);
    const d=await r.json(); if(d.status!=='ok'||!d.monthlyBalance)return;
    for(const k of Object.keys(tradeBalanceMonthly))delete tradeBalanceMonthly[k];
    Object.assign(tradeBalanceMonthly,d.monthlyBalance);
    const tm=Object.entries(tradeBalanceMonthly).sort(([a],[b])=>a.localeCompare(b));
    if(tm.length){const [period,value]=tm.at(-1),prevKey=`${Number(period.slice(0,4))-1}${period.slice(4)}`,prev=tradeBalanceMonthly[prevKey];if(Number.isFinite(Number(prev))){const pct=((Number(value)/Number(prev))-1)*100;const card=document.querySelector('.kpi[data-kpi="trade"] [data-detail]');if(card)card.textContent=`${pct>0?'↑':pct<0?'↓':'→'} ${pct>0?'+':''}${fmt.format(pct)}% i.a. del saldo`;}}
    if(currentSeries==='trade'&&window.Chart)renderHistory('trade');
  }catch(e){console.warn('trade monthly fast',e);}
}

async function loadCementMonthlyFast(){
  try{
    const r=await fetch('/api/cement-monthly',{headers:{accept:'application/json'}}); if(!r.ok)throw new Error(`cement monthly ${r.status}`);
    const d=await r.json(); if(!d.monthlyYoy)return;
    for(const k of Object.keys(cementMonthlyYoy))delete cementMonthlyYoy[k];
    Object.assign(cementMonthlyYoy,d.monthlyYoy);
    if(currentSeries==='cement'&&window.Chart)renderHistory('cement');
  }catch(e){console.warn('cement monthly fast',e);}
}

async function loadAutomaticData(){
  const status=document.getElementById('autoStatus');
  try{
    const r=await fetch('/api/macro-data',{headers:{accept:'application/json'}}); if(!r.ok)throw new Error(`API ${r.status}`);
    const data=await r.json(), S=data.sources||{}; kpiSourceCache=S; hydrateKpiHistoryCache(S);
    safeApply('calculatorHydration',()=>hydrateCalculatorSources(S));

    // RIPTE se hidrata primero y de forma independiente. Ningún error posterior de
    // mercados, FX, calendario o calculadoras puede dejar vacía esta serie.
    if(S.salary?.status==='ok'){
      for(const k of Object.keys(salaryRipte))delete salaryRipte[k];
      for(const k of Object.keys(salaryRipteMonthly))delete salaryRipteMonthly[k];
      Object.assign(salaryRipte,S.salary.annual||{});
      Object.assign(salaryRipteMonthly,S.salary.monthly||{});
      applySalaryMode();
      const n=Object.keys(salaryRipteMonthly).length,last=Object.keys(salaryRipteMonthly).sort().at(-1);
      const diag=document.getElementById('ripteDiagnostic');
      if(diag)diag.textContent=`RIPTE cargado: ${n} meses${last?` · último ${displayMonth(last)}`:''}`;
    }

    const merge=(target,src)=>{if(src?.status==='ok'&&src.annual)Object.assign(target,src.annual)};
    merge(industry,S.industryHistorical); if(S.unemploymentHistorical?.status==='ok'&&S.unemploymentHistorical.annual){for(const [y,v0] of Object.entries(S.unemploymentHistorical.annual)){const v=Number(v0);if(Number.isFinite(v))unemployment[y]=Number((Math.abs(v)<=1?v*100:v).toFixed(1));}}
    if(S.tradeHistorical?.status==='ok'){if(Object.keys(tradeBalanceMonthly).length<55)Object.assign(tradeBalanceMonthly,S.tradeHistorical.monthlyBalance||{});const tm=Object.entries(S.tradeHistorical.monthlyBalance||{}).sort(([a],[b])=>a.localeCompare(b));if(tm.length){const [d,v]=tm.at(-1),prev=(S.tradeHistorical.monthlyBalance||{})[`${Number(d.slice(0,4))-1}${d.slice(4)}`];if(Number.isFinite(Number(prev))){const diff=Number(v)-Number(prev),arrow=diff>0?'↑':diff<0?'↓':'→';const card=document.querySelector('.kpi[data-kpi="trade"] [data-detail]');if(card)card.textContent=`${arrow} ${diff>=0?'+':''}${fmt.format(diff)} M USD vs. igual mes del año anterior`;}}const from1913=o=>Object.fromEntries(Object.entries(o||{}).filter(([y])=>Number(y)>=1913));Object.assign(tradeBalanceNominal,from1913(S.tradeHistorical.balance));Object.assign(exportsNominal,from1913(S.tradeHistorical.exports));Object.assign(importsNominal,from1913(S.tradeHistorical.imports));if(S.tradeHistorical.real){tradeBasePeriod=S.tradeHistorical.real.basePeriod||'';Object.assign(tradeBalance,from1913(S.tradeHistorical.real.balance));Object.assign(exportsSeries,from1913(S.tradeHistorical.real.exports));Object.assign(importsSeries,from1913(S.tradeHistorical.real.imports));}else rebuildRealTrade();}
    safeApply('financialHistorical',()=>{
    if(S.financialHistorical?.status==='ok'){const F=S.financialHistorical;Object.assign(countryRisk,F.countryRisk||{});Object.assign(mervalUsdCcl,F.mervalUsdCcl||{});Object.assign(freeDollarNominal,F.freeDollar?.nominal||{});Object.assign(freeDollarReal,F.freeDollar?.real||{});Object.assign(interestNominal,F.interestRate?.nominal||{});Object.assign(interestReal,F.interestRate?.real||{});seriesConfig.freeDollar.data=dollarPriceMode==='real'?freeDollarReal:freeDollarNominal;seriesConfig.interestRate.data=interestMode==='real'?interestReal:interestNominal;const L=F.latest||{};paintMarkets(L);}
    });
    safeApply('exchangeHistorical',()=>{
    if(S.exchangeHistorical?.status==='ok'){const X=S.exchangeHistorical;Object.assign(freeDollarNominal,X.free?.nominal||{});Object.assign(freeDollarReal,X.free?.real||{});Object.assign(fxOfficialNominal,X.official?.nominal||{});Object.assign(fxOfficialReal,X.official?.real||{});Object.assign(fxFreeTcr,X.free?.tcr||{});Object.assign(fxOfficialTcr,X.official?.tcr||{});Object.assign(fxFreeMonthlyNominal,X.free?.monthly?.nominal||{});Object.assign(fxFreeMonthlyReal,X.free?.monthly?.real||{});Object.assign(fxFreeMonthlyTcr,X.free?.monthly?.tcr||{});Object.assign(fxOfficialMonthlyNominal,X.official?.monthly?.nominal||{});Object.assign(fxOfficialMonthlyReal,X.official?.monthly?.real||{});Object.assign(fxOfficialMonthlyTcr,X.official?.monthly?.tcr||{});Object.assign(fxFreeDailyNominal,X.free?.daily?.nominal||{});Object.assign(fxFreeDailyReal,X.free?.daily?.real||{});Object.assign(fxFreeDailyTcr,X.free?.daily?.tcr||{});Object.assign(fxOfficialDailyNominal,X.official?.daily?.nominal||{});Object.assign(fxOfficialDailyReal,X.official?.daily?.real||{});Object.assign(fxOfficialDailyTcr,X.official?.daily?.tcr||{});
      const fillDailyTcr=(nominal,monthlyNominal,monthlyTcr,dailyTcr)=>{for(const [d,v] of Object.entries(nominal)){if(dailyTcr[d]!=null)continue;const ym=d.slice(0,7),mn=Number(monthlyNominal[ym]),mt=Number(monthlyTcr[ym]);if(Number.isFinite(mn)&&mn!==0&&Number.isFinite(mt))dailyTcr[d]=Number((Number(v)*(mt/mn)).toFixed(4));}};
      fillDailyTcr(fxFreeDailyNominal,fxFreeMonthlyNominal,fxFreeMonthlyTcr,fxFreeDailyTcr);fillDailyTcr(fxOfficialDailyNominal,fxOfficialMonthlyNominal,fxOfficialMonthlyTcr,fxOfficialDailyTcr);Object.assign(fxGap,X.gap||{});Object.assign(fxDailyGap,X.dailyGap||{});fxBasePeriod=X.free?.basePeriod||X.official?.basePeriod||'';const dailyKeys=Object.keys(fxFreeDailyNominal);if(dailyKeys.length){const annualKeys=Object.keys(freeDollarNominal).map(fxDateKey).sort(),mn=annualKeys[0]||dailyKeys.sort()[0],mx=dailyKeys.sort().at(-1);const a=document.getElementById('fxPeriodFrom'),b=document.getElementById('fxPeriodTo');if(a){a.min=mn;a.max=mx;}if(b){b.min=mn;b.max=mx;b.value=mx;}}renderFx();}
    });
    if(Object.keys(salaryRipteMonthly).length)applySalaryMode();
    if(currentSeries && window.Chart) renderHistory(currentSeries);
    if(S.gdpHistorical?.status==='ok' && S.gdpHistorical.annual){Object.assign(gdpGrowth,S.gdpHistorical.annual);fillSelect('gdpStart',gdpGrowth,1980);fillSelect('gdpEnd',gdpGrowth,2025);}
    if(S.ipcHistorical?.status==='ok'){
      // No sobrescribir 1944–2006: el respaldo local auditado evita cortes por respuestas parciales o diferencias de transformación de la API.
      fillSelect('infStart',inflation,Math.min(...Object.keys(inflation).map(Number))); fillSelect('infEnd',inflation,2025);
      const active=document.querySelector('[data-series="inflation"].active'); if(active&&window.Chart)renderHistory('inflation');
    }
    if(S.ipc?.status==='ok'){
      const x=S.ipc.latest, per=periodFromYm(S.ipc.updated);
      setKpi('ipc',`${fmt.format(x.value)}%`,`${per} · mensual`,`${fmt.format(x.yoy)}% interanual`);
      // La API entrega monthly como [{date,index,value}]. Usamos el nivel publicado directamente
      // para la calculadora, sin depender de que termine antes loadPublicHistorical().
      for(const row of (Array.isArray(S.ipc.monthly)?S.ipc.monthly:[])){
        const k=String(row?.date||''); const v=Number(row?.index);
        if(/^\d{4}-\d{2}$/.test(k)&&Number.isFinite(v)&&v>0) ipcCalcIndex[k]=v;
      }
    }
    if(S.arca?.status==='ok'){const x=S.arca.latest;setKpi('arca',moneyMillionsToBillions(x.value),`${x.period} · billones ARS`,`+${fmt.format(x.yoy)}% interanual`);}
    if(S.icg?.status==='ok'){const x=S.icg.latest;setKpi('icg',fmt.format(x.value),`${x.period} · puntos`,`${Number(x.mom)>0?'+':''}${fmt.format(x.mom)}% mensual`);}
    if(S.activityPulse?.status==='ok'){const A=S.activityPulse;const sign=n=>Number(n)>0?'+':'';if(A.fiscal)setKpi('fiscal',`${sign(A.fiscal.financial)}$${fmt.format(Math.abs(A.fiscal.financial))} mil M`,`${A.fiscal.period} · resultado financiero`,`Primario: ${sign(A.fiscal.primary)}$${fmt.format(Math.abs(A.fiscal.primary))} mil M`);if(A.cement)setKpi('cement',`${fmt.format(A.cement.tons/1000)} mil t`,`${A.cement.period} · total`,`${sign(A.cement.yoy)}${fmt.format(A.cement.yoy)}% interanual`);if(A.isac)setKpi('isac',`${sign(A.isac.yoy)}${fmt.format(A.isac.yoy)}%`,`${A.isac.period} · interanual`,`${sign(A.isac.mom)}${fmt.format(A.isac.mom)}% mensual s.e.`);if(A.autos)setKpi('autos',new Intl.NumberFormat('es-AR').format(A.autos.units),`${A.autos.period} · unidades`,`${sign(A.autos.yoy)}${fmt.format(A.autos.yoy)}% interanual`);if(A.credit)setKpi('credit',`${sign(A.credit.arsRealMom)}${fmt.format(A.credit.arsRealMom)}%`,`${A.credit.period} · pesos, real mensual s.e.`,`USD: ${new Intl.NumberFormat('es-AR').format(A.credit.usdBalance)} M · ${sign(A.credit.usdMom)}USD ${new Intl.NumberFormat('es-AR').format(Math.abs(A.credit.usdMom))} M mensual`);if(A.arrears)setKpi('arrears',`${fmt.format(A.arrears.total)}%`,`${A.arrears.period} · irregularidad total`,`Familias ${fmt.format(A.arrears.families)}% · empresas ${fmt.format(A.arrears.companies)}%`);}

    if(S.salary?.status==='ok'&&currentSeries==='salary'&&window.Chart)safeApply('salaryRender',()=>renderHistory('salary'));
    const releases=[{releaseDate:'2026-09-28',date:'sep 2026',displayDate:'Publicado 28 sep 2026 · período sep 2026',title:'ICG UTDT',value:'1,94 puntos · −5,9% mensual'}];if(S.ipc?.status==='ok')releases.push({date:S.ipc.updated||'',title:'IPC Nacional',value:`${fmt.format(S.ipc.latest.value)}% mensual · ${fmt.format(S.ipc.latest.yoy)}% interanual`});if(S.salary?.status==='ok'&&S.salary.latest)releases.push({date:S.salary.latest.period,title:'RIPTE',value:money.format(S.salary.latest.value)});if(S.arca?.status==='ok')releases.push({date:S.arca.latest.period||'',title:'Recaudación ARCA',value:moneyMillionsToBillions(S.arca.latest.value)});if(S.icg?.status==='ok')releases.push({releaseDate:S.icg.publicationDate||'',date:S.icg.latest.period||'',title:'ICG UTDT',value:`${fmt.format(S.icg.latest.value)} puntos${Number.isFinite(Number(S.icg.latest.mom))?` · ${Number(S.icg.latest.mom)>0?'+':''}${fmt.format(S.icg.latest.mom)}% mensual`:''}`});renderLatestRelease(releases);
    const when=new Date(data.generatedAt).toLocaleString('es-AR',{dateStyle:'medium',timeStyle:'short'});
    if(status){
      const ok=Object.entries(S).filter(([,v])=>v?.status==='ok').length, errors=Object.entries(S).filter(([,v])=>v?.status==='error').map(([k])=>k);
      status.innerHTML=`<strong>Datos verificados</strong><small>Última comprobación: ${when} · ${ok}/${Object.keys(S).length} fuentes activas${errors.length?' · algunos datos usan respaldo':''}</small>`;
    }
    updateCoverage();
    if(window.Chart)renderHistory(currentSeries);
  }catch(err){if(status)status.innerHTML='<strong>Datos verificados</strong><small>Actualización automática activa · se reintentará la conexión con las fuentes</small>';console.warn(err);}
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
 ipc:{title:'Inflación nacional',agency:'INDEC'},ipcCaba:{title:'Inflación CABA',agency:'IDECBA'},gdp:{title:'PIB real',agency:'INDEC'},ipi:{title:'IPI manufacturero',agency:'INDEC'},arca:{title:'Recaudación',agency:'ARCA'},poverty:{title:'Pobreza',agency:'INDEC / UCA'},icg:{title:'Confianza de gobierno',agency:'UTDT'},trade:{title:'Balanza comercial',agency:'INDEC'},fiscal:{title:'Resultado fiscal',agency:'Ministerio de Economía'},cement:{title:'Despachos de cemento',agency:'AFCP'},isac:{title:'ISAC construcción',agency:'INDEC'},autos:{title:'Patentamientos 0 km',agency:'ACARA'},credit:{title:'Crédito privado',agency:'BCRA'},arrears:{title:'Mora bancaria',agency:'BCRA'}
};
function recentEntries(obj,n=12){return Object.entries(obj||{}).filter(([,v])=>Number.isFinite(Number(v))).sort(([a],[b])=>String(a).localeCompare(String(b))).slice(-n);}
function kpiSeries(key){const S=kpiSourceCache||{},A=S.activityPulse||{};
  if(key==='fiscal'){const f=A.fiscal||{};const src=f.historyPctGDP?.[fiscalMetric];if(src){const months=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'],years=['2024','2025','2026'];const datasets=years.map(y=>({label:y,data:months.map((_,i)=>{const v=src[`${y}-${String(i+1).padStart(2,'0')}`];return v==null?null:Number(v);})}));return {labels:months,datasets,source:'Ministerio de Economía',legend:`Resultado ${fiscalMetric==='primary'?'primario':'financiero'} acumulado YTD como % del PIB. Comparación mensual 2024–2026 · valores oficiales publicados (aprox.).`};}}
  if(key==='ipc'&&Array.isArray(S.ipc?.displayMonthly||S.ipc?.monthly)){const rows=S.ipc.displayMonthly||S.ipc.monthly;const x=rows.filter(r=>/^\d{4}-\d{2}$/.test(String(r?.date||''))&&Number.isFinite(Number(r?.value))).slice(-60);return {labels:x.map(r=>displayMonth(r.date)),datasets:[{label:'Inflación mensual (%)',data:x.map(r=>Number(r.value))}],source:'INDEC',legend:'Últimos 5 años de observaciones mensuales.'};}
  if(key==='ipcCaba'&&S.ipcCaba?.history){const x=recentEntries(S.ipcCaba.history,60);return {labels:x.map(([d])=>displayMonth(d)),datasets:[{label:'Inflación CABA mensual (%)',data:x.map(([,v])=>Number(v))}],source:'IDECBA',legend:'Hasta 5 años de observaciones mensuales disponibles.'};}
  if(key==='arca'&&S.arca?.history){const x=recentEntries(S.arca.history,60),ipcRows=S.ipc?.monthly||[],idx=Object.fromEntries(ipcRows.filter(r=>r?.date&&Number.isFinite(Number(r.index))).map(r=>[r.date,Number(r.index)])),infl={};for(const [d] of x){const [y,m]=d.split('-').map(Number),prev=`${y-1}-${String(m).padStart(2,'0')}`;if(idx[d]&&idx[prev])infl[d]=((idx[d]/idx[prev])-1)*100;}return {labels:x.map(([d])=>displayMonth(d)),datasets:[{label:'Recaudación · var. interanual nominal (%)',data:x.map(([,v])=>Number(v))},{label:'Inflación interanual (%)',data:x.map(([d])=>Number.isFinite(infl[d])?Number(infl[d].toFixed(1)):null)}],source:'ARCA + INDEC',legend:'Recaudación nominal e inflación interanual. Cuando la recaudación crece por debajo de la inflación, su variación real es negativa.'};}
  if(key==='icg'&&S.icg?.history){const x=recentEntries(S.icg.history,9999);return {labels:x.map(([d])=>displayMonth(d)),rawPeriods:x.map(([d])=>d),presidentOverlay:true,datasets:[{label:'ICG',data:x.map(([,v])=>Number(v)),borderColor:'#0b5bd3',backgroundColor:'rgba(11,91,211,.06)'}],source:'UTDT',legend:`Serie histórica completa: ${x.length} observaciones mensuales · líneas verticales = cambios presidenciales.`};}
  if(key==='gdp'&&S.gdpHistorical?.quarterlyYoy){const x=recentEntries(S.gdpHistorical.quarterlyYoy,20);return {labels:x.map(([d])=>String(d).replace(/(\d{4})-T([1-4])/,'$2T $1')),datasets:[{label:'PIB · variación interanual (%)',data:x.map(([,v])=>Number(v))}],source:'INDEC',legend:'Últimos 5 años de variaciones interanuales trimestrales.'};}
  if(key==='ipi'&&S.industryHistorical?.monthlyYoy){const x=recentEntries(S.industryHistorical.monthlyYoy,60);return {chartType:'bar',labels:x.map(([d])=>displayMonth(d)),datasets:[{label:'IPI manufacturero · variación interanual (%)',data:x.map(([,v])=>Number(v))}],source:'INDEC',legend:'Últimos 5 años de variaciones interanuales mensuales.'};}
  if(key==='isac'&&S.isacHistorical?.monthlyYoy){const x=recentEntries(S.isacHistorical.monthlyYoy,60);return {chartType:'bar',labels:x.map(([d])=>displayMonth(d)),datasets:[{label:'ISAC · variación interanual (%)',data:x.map(([,v])=>Number(v))}],source:'INDEC',legend:'Últimos 5 años de variaciones interanuales mensuales.'};}
  if(key==='credit'&&S.creditHistorical?.monthlyYoy){const x=recentEntries(S.creditHistorical.monthlyYoy,60);return {labels:x.map(([d])=>displayMonth(d)),datasets:[{label:'Crédito privado · variación interanual nominal (%)',data:x.map(([,v])=>Number(v))}],source:'BCRA / Datos Argentina'};}
  if(key==='autos'&&A.autos?.history?.['Patentamientos (unidades)']){const h=A.autos.history['Patentamientos (unidades)'],years=[2022,2023,2024,2025,2026],months=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];const palette=['#2563eb','#7c3aed','#0891b2','#ea580c','#16a34a'];const datasets=years.map((y,j)=>({label:String(y),backgroundColor:palette[j],borderColor:palette[j],preserveColor:true,data:months.map((_,i)=>{const v=h[`${y}-${String(i+1).padStart(2,'0')}`];return v==null?null:Number(v);})}));return {chartType:'bar',labels:months,datasets,source:'ACARA / SIOMAA',legend:'Patentamientos mensuales por año (2022–2026). Cada año conserva un color propio.'};}
  if(key==='cement'){const monthly=Object.fromEntries(Object.entries(cementMonthlyYoy).filter(([d,v])=>/^\d{4}-(0[1-9]|1[0-2])$/.test(d)&&Number.isFinite(Number(v))));const x=recentEntries(monthly,60);if(!x.length)return null;return {chartType:'bar',labels:x.map(([d])=>displayMonth(d)),rawPeriods:x.map(([d])=>d),datasets:[{label:'Despachos de cemento · variación interanual mensual (%)',data:x.map(([,v])=>Number(v)),type:'bar'}],source:'AFCP',legend:`Últimos 5 años: ${x.length} observaciones mensuales de variación interanual (%).`};}
  const cached=kpiHistoryCache[key],h=cached?.history||A[key]?.history;if(h){const keys=Object.keys(h);if(keys.length&&h[keys[0]]&&typeof h[keys[0]]==='object'&&!Array.isArray(h[keys[0]])){const labels=[...new Set(keys.flatMap(k=>Object.keys(h[k]||{})))].sort().slice(-60);const datasets=keys.map(k=>({label:k,data:labels.map(d=>{const v=h[k]?.[d];return v===null||v===undefined?null:Number(v);})})).filter(ds=>ds.data.some(v=>Number.isFinite(v)));if(labels.length&&datasets.length)return {labels:labels.map(displayMonth),datasets,source:cached?.source||A[key]?.source||A[key]?.sourceUrl||A.source};}const x=recentEntries(h);if(x.length)return {labels:x.map(([d])=>displayMonth(d)),datasets:[{label:KPI_META[key]?.title||key,data:x.map(([,v])=>Number(v))}],source:cached?.source||A[key]?.source||A[key]?.sourceUrl||A.source};}
  if(key==='trade'){const monthly=Object.fromEntries(Object.entries(tradeBalanceMonthly||{}).filter(([d,v])=>/^\d{4}-(0[1-9]|1[0-2])$/.test(String(d))&&Number.isFinite(Number(v))));const x=recentEntries(monthly,60);if(x.length)return {chartType:'bar',labels:x.map(([d])=>displayMonth(d)),rawPeriods:x.map(([d])=>d),tradeArrow:true,datasets:[{label:'Saldo comercial mensual (M USD)',data:x.map(([,v])=>Number(v))}],source:'INDEC',legend:'Saldo comercial mensual. La flecha une el último mes con el mismo mes del año anterior y muestra la variación porcentual interanual del saldo.'};return null;}const maps={poverty:poverty};if(maps[key]){const x=recentEntries(maps[key],12);if(x.length)return {chartType:'line',labels:x.map(([d])=>String(d)),datasets:[{label:KPI_META[key]?.title||key,data:x.map(([,v])=>v)}],source:KPI_META[key]?.agency};}
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
function openKpiModal(key){const card=document.querySelector(`.kpi[data-kpi="${key}"]`),m=document.getElementById('kpiModal');if(!card||!m)return;const meta=KPI_META[key]||{},series=kpiSeries(key),value=card.querySelector('[data-value]')?.textContent||'—',period=card.querySelector('[data-period]')?.textContent||'';document.getElementById('kpiModalTitle').textContent=meta.title||card.querySelector('.kpi-top span')?.textContent||'Evolución';document.getElementById('kpiModalAgency').textContent=meta.agency||card.querySelector('.kpi-top b')?.textContent||'';document.getElementById('kpiModalValue').textContent=value;document.getElementById('kpiModalPeriod').textContent=`Último dato: ${period}`;const empty=document.getElementById('kpiModalEmpty'),canvas=document.getElementById('kpiModalChart'),legend=document.getElementById('kpiModalLegend'),source=document.getElementById('kpiModalSource');const controls=document.getElementById('kpiModalControls');if(controls){if(key==='fiscal'){controls.hidden=false;controls.innerHTML=`<button type="button" data-fiscal="primary" class="${fiscalMetric==='primary'?'active':''}">Primario</button><button type="button" data-fiscal="financial" class="${fiscalMetric==='financial'?'active':''}">Financiero</button>`;controls.querySelectorAll('[data-fiscal]').forEach(b=>b.addEventListener('click',()=>{fiscalMetric=b.dataset.fiscal;closeKpiModal();openKpiModal('fiscal');}));}else{controls.hidden=true;controls.innerHTML='';}}if(kpiDetailChart){kpiDetailChart.destroy();kpiDetailChart=null;}if(!series||!series.labels?.length){canvas.hidden=true;empty.hidden=false;empty.textContent='La fuente disponible todavía no entrega observaciones históricas suficientes para construir la evolución sin interpolar datos.';legend.textContent='No se completan meses artificialmente.';source.textContent='';}else{canvas.hidden=false;empty.hidden=true;kpiDetailChart=new Chart(canvas,{type:series.chartType||'line',plugins:[...(series.presidentOverlay?[icgPresidentialPlugin]:[]),...(series.tradeArrow?[tradeYoYArrowPlugin]:[])],data:{labels:series.labels,datasets:series.datasets.map(d=>({...d,borderWidth:series.chartType==='bar'?1:2.5,backgroundColor:series.chartType==='bar'?(d.preserveColor?d.backgroundColor:barValueColor):d.backgroundColor,borderColor:series.chartType==='bar'?(d.preserveColor?d.borderColor:barBorderColor):d.borderColor,pointRadius:(series.chartType==='bar'?0:(series.presidentOverlay?0:3)),pointHoverRadius:(series.chartType==='bar'?0:5),tension:.2,spanGaps:false}))},options:{responsive:true,maintainAspectRatio:false,layout:{padding:{top:series.presidentOverlay?78:0}},interaction:{mode:'index',intersect:false},plugins:{legend:{display:series.datasets.length>1,position:'bottom'},icgPresidents:{enabled:!!series.presidentOverlay,periods:series.rawPeriods||[]},tradeYoYArrow:{enabled:!!series.tradeArrow,periods:series.rawPeriods||[]}},scales:{x:{grid:{display:false},ticks:{maxTicksLimit:series.presidentOverlay?14:undefined}},y:{beginAtZero:false}}}});legend.textContent=series.legend||`${series.labels.length} observaciones publicadas disponibles.`;source.textContent=`Fuente: ${series.source||meta.agency||'fuente indicada en la tarjeta'}`;}m.hidden=false;m.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';m.querySelector('.kpi-modal-close')?.focus();}
function initKpiExplorer(){document.querySelectorAll('.kpi[data-kpi]').forEach(card=>{card.tabIndex=0;card.setAttribute('role','button');card.setAttribute('aria-label',`Ver evolución de ${card.querySelector('.kpi-top span')?.textContent||'indicador'}`);card.addEventListener('click',()=>openKpiModal(card.dataset.kpi));card.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();openKpiModal(card.dataset.kpi);}});});document.querySelectorAll('[data-kpi-close]').forEach(x=>x.addEventListener('click',closeKpiModal));document.addEventListener('keydown',e=>{if(e.key==='Escape')closeKpiModal();});}

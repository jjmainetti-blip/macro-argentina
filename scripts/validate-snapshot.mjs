import fs from 'node:fs';
const h=JSON.parse(fs.readFileSync(new URL('../public/macro-history.json',import.meta.url),'utf8'));
const fail=m=>{throw new Error(m)};
const monthKeys=o=>Object.keys(o||{}).filter(k=>/^\d{4}-\d{2}$/.test(k)).sort();
const checkMap=(name,o,min,from=null,to=null)=>{const k=monthKeys(o);if(k.length<min)fail(`${name}: ${k.length}<${min}`);if(new Set(k).size!==k.length)fail(`${name}: duplicados`);if(from&&k.at(-min)!==from)fail(`${name}: inicio últimas ${min} ${k.at(-min)} != ${from}`);if(to&&k.at(-1)!==to)fail(`${name}: fin ${k.at(-1)} != ${to}`);return k;};
if(!Array.isArray(h.ipcRows)||h.ipcRows.length<60)fail(`IPC ${h.ipcRows?.length}`);
const ipcDates=h.ipcRows.map(x=>x.date);if(new Set(ipcDates).size!==ipcDates.length)fail('IPC duplicados');if(h.ipcRows.slice(-60).some(x=>!Number.isFinite(x.value)||!Number.isFinite(x.index)))fail('IPC valores/índices inválidos');
checkMap('IPI',h.ipiMonthlyYoy,60);
checkMap('ISAC',h.isacMonthlyYoy,60);
checkMap('Balanza',h.tradeMonthly,60,'2021-09','2026-08');
checkMap('Recaudación',h.arcaYoy,60,'2021-10','2026-09');
const icg=checkMap('ICG',h.icgMonthly,250);if(icg[0]!=='2001-11')fail(`ICG inicio ${icg[0]}`);
// v113: históricos de tarjetas que antes dependían sólo de /api/macro-data.
const notFraction=(name,o)=>{const v=Object.values(o||{}).map(Number);if(Math.max(...v.map(Math.abs))<=1.5)fail(`${name}: valores parecen fracción, no %`);};
checkMap('EMAE',h.emaeMonthlyYoy,60);notFraction('EMAE',h.emaeMonthlyYoy);notFraction('ISAC',h.isacMonthlyYoy);notFraction('IPI',h.ipiMonthlyYoy);
checkMap('Crédito',h.creditMonthlyYoy,60);
const mora=checkMap('Mora',h.arrearsMonthlyTotal,60);if(Object.values(h.arrearsMonthlyTotal).some(v=>!(v>0&&v<40)))fail('Mora fuera de rango');
for(const m of ['primary','financial'])checkMap(`Fiscal ${m}`,h.fiscalPctGDP?.[m],24);
checkMap('Patentamientos',h.autosMonthly,48);
// v119: Merval y riesgo país diarios
{const D=JSON.parse(fs.readFileSync(new URL('../public/markets-daily.json',import.meta.url),'utf8'));for(const [k,min,start] of [['mervalPoints',7000,'1996-10-08'],['mervalUsd',7000,'1996-10-08'],['countryRisk',7000,'1999-01-22']]){const s=D[k];if(!s||s.v.length<min||s.start!==start||s.d.length!==s.v.length)fail(`${k}: serie diaria incompleta`);}if(Object.keys(D.usCpiMonthly||{}).length<300)fail('CPI-U mensual corto');}
// v118: ICL/CER/UVA (calculadora)
{const C=JSON.parse(fs.readFileSync(new URL('../public/contract-indices.json',import.meta.url),'utf8'));for(const k of ['icl','cer','uva']){const s=C.series?.[k];if(!s||!Array.isArray(s.values)||s.values.filter(v=>v!=null).length<365)fail(`${k.toUpperCase()}: respaldo local corto`);}}
// v117: mercados y salario (gráficos de dólar, riesgo país, Merval, tasa y RIPTE)
{const M=h.marketsHistory||{};const n=o=>Object.keys(o||{}).length;
 if(n(M.financialHistorical?.countryRisk)<20)fail('Riesgo país: histórico local corto');
 if(n(M.financialHistorical?.mervalUsdCcl)<10)fail('Merval USD: histórico local corto');
 if(n(M.financialHistorical?.interestRate?.nominal)<20)fail('Tasa: histórico local corto');
 if(n(M.exchangeHistorical?.free?.nominal)<40||n(M.exchangeHistorical?.official?.nominal)<40||n(M.exchangeHistorical?.gap)<40)fail('Dólar: histórico local corto');
 if(n(M.salary?.monthly)<300)fail('RIPTE: histórico local corto');}
// v116
checkMap('ILA',h.ilaMonthly,120);for(const [k,v] of Object.entries(h.ilaMonthly))if(!Number.isFinite(v.level)||!Number.isFinite(v.mom))fail(`ILA inválido ${k}`);
checkMap('IGA',h.igaMonthly,36);
{const Q=h.bopQuarterly||{};for(const k of ['CA','G','S','IN1','IN2','FA','RES']){const n=Object.keys(Q[k]||{}).filter(q=>/^\d{4}-Q[1-4]$/.test(q)).length;if(n<60)fail(`Balanza de pagos ${k}: ${n} trimestres`);}
 const ca=Q.CA||{};for(const q of Object.keys(ca)){const sum=['G','S','IN1','IN2'].reduce((t,k)=>t+Number(Q[k]?.[q]||0),0);if(Math.abs(sum-ca[q])>5)fail(`BdP ${q}: componentes ${sum.toFixed(1)} ≠ CC ${ca[q]}`);}}for(const [k,v] of Object.entries(h.igaMonthly))if(!Number.isFinite(v.momSa)||!Number.isFinite(v.yoy))fail(`IGA inválido ${k}`);
// v114
checkMap('EMAE s.e.',h.emaeMonthlySaMom,60);notFraction('EMAE s.e.',h.emaeMonthlySaMom);
checkMap('Crédito s.e.',h.creditMonthlySaRealMom,55);
for(const [n,o] of [['Mora familias',h.arrearsMonthlyFamilies],['Mora empresas',h.arrearsMonthlyCompanies]]){checkMap(n,o,120);if(monthKeys(o).at(-1)!==mora.at(-1))fail(`${n}: no termina en ${mora.at(-1)}`);}
// Real revenue must be computable for all of the last 60 months.
const idx=Object.fromEntries(h.ipcRows.map(x=>[x.date,x.index]));
{const lastIpc=Object.keys(idx).sort().at(-1);for(const d of monthKeys(h.arcaYoy).slice(-60)){if(d>lastIpc)continue;/* ARCA publica antes que el IPC: ese mes se muestra nominal */const [y,m]=d.split('-'),p=`${+y-1}-${m}`;if(!Number.isFinite(idx[d])||!Number.isFinite(idx[p]))fail(`Recaudación real sin IPC: ${d}`);}}
console.log(JSON.stringify({ok:true,counts:{ipc:h.ipcRows.length,ipi:monthKeys(h.ipiMonthlyYoy).length,isac:monthKeys(h.isacMonthlyYoy).length,trade:monthKeys(h.tradeMonthly).length,arca:monthKeys(h.arcaYoy).length,icg:icg.length,emae:monthKeys(h.emaeMonthlyYoy).length,credit:monthKeys(h.creditMonthlyYoy).length,arrears:mora.length,fiscal:monthKeys(h.fiscalPctGDP.primary).length,autos:monthKeys(h.autosMonthly).length},ranges:{trade:[monthKeys(h.tradeMonthly).at(-60),monthKeys(h.tradeMonthly).at(-1)],arca:[monthKeys(h.arcaYoy).at(-60),monthKeys(h.arcaYoy).at(-1)],icg:[icg[0],icg.at(-1)]}},null,2));

// v123 · La economía cuando naciste
{const B=JSON.parse(fs.readFileSync(new URL('../public/birth-economy.json',import.meta.url)));const n=B.cpi.length;
 for(const k of ['cpi','usCpi','fx','fxFree','wage','ripte'])if(B[k].length!==n)fail(`birth ${k}: largo ${B[k].length} ≠ ${n}`);
 if(B.cpi.filter(Number.isFinite).length<990)fail('birth: IPC incompleto');
 for(const L of [B.presidents,B.ministers]){for(let i=1;i<L.length;i++)if(L[i].start<L[i-1].start)fail(`birth: orden ${L[i].name}`);if(L.at(-1).end!==null)fail('birth: falta el cargo vigente');}
 if(B.presidents[0].start>'1943-01-01')fail('birth: presidentes no cubren 1943');
 for(let i=0;i<n;i++){const ym=`${1943+Math.floor(i/12)}-${String(i%12+1).padStart(2,'0')}`;if(ym<='2026-07'&&!Number.isFinite(B.wage[i]))fail(`birth: falta salario ${ym}`);}}

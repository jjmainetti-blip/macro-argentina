import fs from 'node:fs';
const h=JSON.parse(fs.readFileSync(new URL('../public/macro-history.json',import.meta.url),'utf8'));
const fail=m=>{throw new Error(m)};
const monthKeys=o=>Object.keys(o||{}).filter(k=>/^\d{4}-\d{2}$/.test(k)).sort();
const checkMap=(name,o,min,from=null,to=null)=>{const k=monthKeys(o);if(k.length<min)fail(`${name}: ${k.length}<${min}`);if(new Set(k).size!==k.length)fail(`${name}: duplicados`);if(from&&k.at(-min)!==from)fail(`${name}: inicio últimas ${min} ${k.at(-min)} != ${from}`);if(to&&k.at(-1)!==to)fail(`${name}: fin ${k.at(-1)} != ${to}`);return k;};
if(!Array.isArray(h.ipcRows)||h.ipcRows.length<60)fail(`IPC ${h.ipcRows?.length}`);
const ipcDates=h.ipcRows.map(x=>x.date);if(new Set(ipcDates).size!==ipcDates.length)fail('IPC duplicados');if(h.ipcRows.slice(-60).some(x=>!Number.isFinite(x.value)||!Number.isFinite(x.index)))fail('IPC valores/índices inválidos');
checkMap('IPC CABA',h.ipcCabaMonthly,60,'2021-09','2026-08');
checkMap('IPI',h.ipiMonthlyYoy,60);
checkMap('ISAC',h.isacMonthlyYoy,60);
checkMap('Balanza',h.tradeMonthly,60,'2021-09','2026-08');
checkMap('Recaudación',h.arcaYoy,60,'2021-09','2026-08');
const icg=checkMap('ICG',h.icgMonthly,250);if(icg[0]!=='2001-11')fail(`ICG inicio ${icg[0]}`);
// Real revenue must be computable for all of the last 60 months.
const idx=Object.fromEntries(h.ipcRows.map(x=>[x.date,x.index]));
for(const d of monthKeys(h.arcaYoy).slice(-60)){const [y,m]=d.split('-'),p=`${+y-1}-${m}`;if(!Number.isFinite(idx[d])||!Number.isFinite(idx[p]))fail(`Recaudación real sin IPC: ${d}`);}
console.log(JSON.stringify({ok:true,counts:{ipc:h.ipcRows.length,ipcCaba:monthKeys(h.ipcCabaMonthly).length,ipi:monthKeys(h.ipiMonthlyYoy).length,isac:monthKeys(h.isacMonthlyYoy).length,trade:monthKeys(h.tradeMonthly).length,arca:monthKeys(h.arcaYoy).length,icg:icg.length},ranges:{trade:[monthKeys(h.tradeMonthly).at(-60),monthKeys(h.tradeMonthly).at(-1)],arca:[monthKeys(h.arcaYoy).at(-60),monthKeys(h.arcaYoy).at(-1)],icg:[icg[0],icg.at(-1)]}},null,2));

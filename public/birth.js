// v123 · "La economía cuando naciste".
// Lee public/birth-economy.json (series mensuales desde 1943 en pesos actuales equivalentes + presidentes,
// ministros, monedas y precios de bienes con fuente) y arma la ficha del mes elegido. Nunca interpola:
// si un dato no existe para la fecha, se informa como no disponible.
(()=>{
  'use strict';
  const MONTHS=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const MSHORT=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
  let D=null,loading=null;
  const $=id=>document.getElementById(id);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const nf=(d=0,m=d)=>new Intl.NumberFormat('es-AR',{minimumFractionDigits:d,maximumFractionDigits:m});
  const ymIdx=ym=>{const [y,m]=ym.split('-').map(Number);const [y0,m0]=D.start.split('-').map(Number);return (y-y0)*12+(m-m0);};
  const idxYm=i=>{const [y0,m0]=D.start.split('-').map(Number);const t=y0*12+(m0-1)+i;return `${Math.floor(t/12)}-${String(t%12+1).padStart(2,'0')}`;};
  const ymLabel=ym=>{const [y,m]=ym.split('-');return `${MONTHS[+m-1]} de ${y}`;};
  const ymShort=ym=>{if(/^\d{4}$/.test(ym))return ym;const [y,m]=ym.split('-');return `${MSHORT[+m-1]} ${y}`;};
  const dateLabel=iso=>{if(!iso)return 'actualidad';const [y,m,d]=iso.split('-');return `${+d}/${+m}/${y}`;};
  const at=(k,ym)=>{const i=ymIdx(ym);const v=D[k]?.[i];return Number.isFinite(v)?v:null;};
  // Último valor disponible en o antes de ym (hasta maxBack meses atrás).
  const atOrBefore=(k,ym,maxBack=3)=>{let i=ymIdx(ym);for(let n=0;n<=maxBack&&i>=0;n++,i--){const v=D[k]?.[i];if(Number.isFinite(v))return {v,ym:idxYm(i)};}return null;};
  const lastOf=k=>{const a=D[k]||[];for(let i=a.length-1;i>=0;i--)if(Number.isFinite(a[i]))return {v:a[i],ym:idxYm(i)};return null;};

  function currencyAt(ym){const mid=`${ym}-15`;return D.currencies.find(c=>c.from<=mid&&(!c.to||c.to>=mid))||D.currencies.at(-1);}
  function currenciesInMonth(ym){const a=`${ym}-01`,b=`${ym}-31`;return D.currencies.filter(c=>c.from<=b&&(!c.to||c.to>=a));}
  // Monto en "pesos actuales equivalentes" → texto en la moneda vigente.
  function fmtEra(ars,cur){if(!Number.isFinite(ars))return '—';const v=ars/cur.f;const a=Math.abs(v);const s=a>=1000?nf(0).format(v):a>=10?nf(0,2).format(v):a>=1?nf(2).format(v):nf(0,4).format(v);return `${cur.sym} ${s}`;}
  const fmtToday=v=>Number.isFinite(v)?`$ ${nf(0).format(v)}`:'—';
  const pct=(v,d=1)=>Number.isFinite(v)?`${v>0?'+':v<0?'−':''}${nf(d).format(Math.abs(v))}%`:'—';
  const big=v=>{const a=Math.abs(v);return a>=100?nf(0).format(v):a>=10?nf(1).format(v):nf(1,2).format(v);};

  // IPC: factor para llevar pesos del mes ym a pesos del último mes publicado.
  const cpiBase=()=>D.cpiBase;
  function toToday(ars,ym){const c=atOrBefore('cpi',ym,3);return c&&Number.isFinite(ars)?ars/c.v:null;}

  function inflationAt(ym){const i=ymIdx(ym),c=D.cpi;if(!Number.isFinite(c[i])||!Number.isFinite(c[i-1]))return null;
    return {mom:(c[i]/c[i-1]-1)*100,yoy:Number.isFinite(c[i-12])?(c[i]/c[i-12]-1)*100:null};}

  function salaryAt(ym){
    if(ym>='1994-07'){const r=atOrBefore('ripte',ym,4);if(r)return {kind:'ripte',...r};}
    const s=atOrBefore('smvm',ym,1);if(s)return {kind:'smvm',...s};
    return null;
  }
  function salaryToday(kind){return lastOf(kind==='ripte'?'ripte':'smvm');}

  function tcr(fxArs,ym){const c=atOrBefore('cpi',ym,3),u=atOrBefore('usCpi',ym,3),uB=at('usCpi',D.cpiBase);if(!c||!u||!uB||!Number.isFinite(fxArs))return null;return fxArs/c.v*(u.v/uB);}

  function peopleAt(list,ym){
    const a=`${ym}-01`,b=`${ym}-31`;
    const ov=list.filter(p=>p.start<=b&&(!p.end||p.end>=a));
    if(!ov.length){const prev=list.filter(p=>p.start<=a).sort((x,y)=>x.start.localeCompare(y.start)).at(-1);return prev?{main:prev,others:[]}:null;}
    const len=p=>{const s=p.start>a?p.start:a,e=(!p.end||p.end>b)?b:p.end;return Date.parse(e)-Date.parse(s);};
    const main=[...ov].sort((x,y)=>len(y)-len(x))[0];
    return {main,others:ov.filter(p=>p!==main)};
  }
  const initials=n=>String(n||'').replace(/\(.*?\)/g,'').split(/\s+/).filter(w=>/^[A-ZÁÉÍÓÚÑ]/.test(w)).slice(0,2).map(w=>w[0]).join('');

  function personCard(role,res){
    if(!res)return `<article class="be-person"><div class="be-photo be-photo-empty">?</div><div><span class="be-role">${role}</span><strong>Sin dato</strong></div></article>`;
    const p=res.main;const photo=p.photo?`<img src="${esc(p.photo)}" alt="${esc(p.name)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'be-photo-empty',textContent:'${esc(initials(p.name))}'}))">`:`<span class="be-photo-empty">${esc(initials(p.name)||'—')}</span>`;
    const sub=role==='Presidencia'?(p.type?p.type.replace(/^./,c=>c.toUpperCase()):''):(p.ministry||'');
    const others=res.others.length?`<small class="be-others">En ese mes también: ${res.others.map(o=>`${esc(o.name)} (${dateLabel(o.start)}${o.end?` – ${dateLabel(o.end)}`:''})`).join('; ')}</small>`:'';
    const name=p.wiki?`<a href="${esc(p.wiki)}" target="_blank" rel="noopener">${esc(p.name)}</a>`:esc(p.name);
    return `<article class="be-person"><div class="be-photo">${photo}</div><div><span class="be-role">${role}</span><strong>${name}</strong><small>${esc(sub)}${sub?' · ':''}${dateLabel(p.start)} – ${p.end?dateLabel(p.end):'actualidad'}</small>${others}</div></article>`;
  }

  function stat(label,value,sub,extra=''){return `<div class="be-stat"><span>${label}</span><strong>${value}</strong>${sub?`<small>${sub}</small>`:''}${extra}</div>`;}

  // Busca el precio más cercano (mismo mes, o hasta ±maxGap meses; los anuales cuentan como julio).
  function pointNear(points,ym,maxGap=12){
    const t=ymIdx(ym);let best=null;
    for(const p of points||[]){const pym=/^\d{4}$/.test(p.p)?`${p.p}-07`:p.p;const d=Math.abs(ymIdx(pym)-t);if(d<=maxGap&&(!best||d<best.d))best={...p,pym,d};}
    return best;
  }
  function lastPoint(points){return (points||[]).slice().sort((a,b)=>a.p.localeCompare(b.p)).at(-1)||null;}

  function goodsRows(ym,salKind){
    const B=D.basket||{},rows=[];
    const salFor=pym=>{const s=salKind==='ripte'?atOrBefore('ripte',pym,4):atOrBefore('smvm',pym,1);return s?.v??null;};
    const fxFor=pym=>{const f=at('fxFree',pym)??at('fx',pym);return f;};
    const priceArs=(g,p)=>g.m2?(Number.isFinite(p.usd)&&fxFor(p.pym)?p.usd*g.m2*fxFor(p.pym):null):p.ars;
    const sk=salKind==='ripte'?'sueldos':'salarios mínimos';
    for(const [key,g] of Object.entries(B)){
      const food=['bread','beef','milk'].includes(key);
      const p=pointNear(g.points,ym,food?12:18);
      const L=lastPoint(g.points);const Lp=L?{...L,pym:/^\d{4}$/.test(L.p)?`${L.p}-07`:L.p}:null;
      const fmtRatio=(price,sal)=>{if(!Number.isFinite(price)||!Number.isFinite(sal)||sal<=0)return null;const r=food?sal/price:price/sal;return food?`${big(r)} ${key==='milk'?'litros':'kg'} por ${salKind==='ripte'?'sueldo':'salario mínimo'}`:`${big(r)} ${sk}`;};
      let then='<span class="be-na">Sin dato para esa época</span>',thenRatio='',today='—';
      if(p){const ars=priceArs(g,p),cur=currencyAt(p.pym),sal=salFor(p.pym);
        const nom=g.m2?`US$ ${nf(0).format(p.usd*g.m2)} <small>(US$ ${nf(0).format(p.usd)}/m²)</small>`:fmtEra(ars,cur);
        then=`${nom}<small>${p.model?esc(p.model)+' · ':''}precio de ${ymShort(p.p)}${p.flag?` · <abbr title="${esc(p.flag)}">INDEC 2007–2015</abbr>`:''} · <a href="${esc(p.src)}" target="_blank" rel="noopener">fuente</a></small>`;
        const r=fmtRatio(ars,sal);thenRatio=r?`<b>${r}</b>`:'<span class="be-na">sin salario de referencia</span>';}
      if(Lp){const ars=priceArs(g,Lp),sal=(salKind==='ripte'?atOrBefore('ripte',Lp.pym,6):atOrBefore('smvm',Lp.pym,1))?.v;const r=fmtRatio(ars,sal);
        today=`${r?`<b>${r}</b>`:''}<small>${g.m2?`US$ ${nf(0).format(Lp.usd*g.m2)}`:fmtToday(ars)} · ${ymShort(Lp.p)}${Lp.model?` · ${esc(Lp.model)}`:''}</small>`;}
      rows.push(`<tr><th scope="row">${esc(g.label)}${g.area?`<small>${esc(g.area)}</small>`:''}</th><td data-label="En su época">${then}</td><td data-label="Equivalía a">${thenRatio||'<span class="be-na">—</span>'}</td><td data-label="Hoy">${today}</td></tr>`);
    }
    return rows.join('');
  }

  function render(){
    if(!D)return;
    const y=$('beYear').value,m=$('beMonth').value,ym=`${y}-${m}`;const out=$('beResult');
    if(ym<D.start){out.innerHTML='<p class="be-na">Hay datos desde enero de 1943.</p>';return;}
    const cur=currencyAt(ym),curs=currenciesInMonth(ym);
    const inf=inflationAt(ym);
    const yr=+y,gdp=D.gdp?.[yr],gdpPrev=D.gdp?.[yr-1];
    const sal=salaryAt(ym),salT=sal?salaryToday(sal.kind):null;
    const salReal=sal?toToday(sal.v,sal.ym):null,salTodayReal=salT?toToday(salT.v,salT.ym):null;
    const fxNow=lastOf('fx'),fx=at('fx',ym)??(ym>fxNow.ym?fxNow.v:null);
    const fxReal=tcr(fx,ym),fxTodayReal=tcr(fxNow.v,D.cpiBase);
    const free=at('fxFree',ym);let freeAnnual=null;
    if(!Number.isFinite(free)){const fa=D.fxFreeAnnual?.[y];const offAvg=(()=>{const a=[];for(let i=1;i<=12;i++){const v=at('fx',`${y}-${String(i).padStart(2,'0')}`);if(Number.isFinite(v))a.push(v);}return a.length?a.reduce((s,v)=>s+v,0)/a.length:null;})();if(Number.isFinite(fa)&&offAvg&&fa/offAvg>1.1)freeAnnual={v:fa,gap:(fa/offAvg-1)*100};}
    const freeReal=Number.isFinite(free)?tcr(free,ym):freeAnnual?tcr(freeAnnual.v,`${y}-07`):null;
    const base=ymShort(D.cpiBase);
    const curNote=curs.length>1?`Ese mes cambió la moneda: ${curs.map(c=>`${c.name} (${c.sym})`).join(' → ')}.`:'';
    const pres=peopleAt(D.presidents,ym),min=peopleAt(D.ministers,ym);
    const cmp=(a,b,less,more)=>Number.isFinite(a)&&Number.isFinite(b)&&b>0?(()=>{const r=(a/b-1)*100;return Math.abs(r)<3?'similar al actual':`${nf(0).format(Math.abs(r))}% ${r>0?more:less} que hoy`;})():'';
    const salLabel=sal?.kind==='ripte'?'Sueldo promedio (RIPTE)':'Salario mínimo, vital y móvil';
    out.innerHTML=`
      <div class="be-head"><div><span class="eyebrow">Naciste en</span><h3>${ymLabel(ym).replace(/^./,c=>c.toUpperCase())}</h3></div>
        <div class="be-currency"><span>Moneda vigente</span><strong>${esc(cur.name)} <em>${esc(cur.sym)}</em></strong><small>${cur.f<1?`1 peso de hoy = ${nf(0).format(1/cur.f)} ${esc(cur.sym)}`:'Moneda actual'}${curNote?` · ${esc(curNote)}`:''}</small></div></div>
      <div class="be-people">${personCard('Presidencia',pres)}${personCard('Ministerio de Economía',min)}</div>
      <div class="be-stats">
        ${stat('Inflación mensual',inf?pct(inf.mom):'—',inf?`Interanual: <b>${pct(inf.yoy,inf.yoy!=null&&Math.abs(inf.yoy)>=100?0:1)}</b>`:'INDEC todavía no publicó el IPC de ese mes')}
        ${stat(`PBI ${y}`,Number.isFinite(gdp)?pct(gdp):'—',Number.isFinite(gdp)?`Variación real anual${Number.isFinite(gdpPrev)?` · ${yr-1}: ${pct(gdpPrev)}`:''}`:'Todavía sin dato anual')}
        ${stat(sal?salLabel:'Sueldo',sal?fmtToday(salReal):'—',sal?`a pesos de ${base} · en su momento: ${fmtEra(sal.v,currencyAt(sal.ym))}${sal.ym!==ym?` (${ymShort(sal.ym)})`:''}`:'Sin serie salarial para esa fecha (el SMVM comienza en 1965)',sal&&salTodayReal?`<em class="${salReal>=salTodayReal*0.97?'up':'down'}">Hoy: ${fmtToday(salTodayReal)} (${ymShort(salT.ym)}) · ${cmp(salReal,salTodayReal,'menor','mayor').replace('que hoy','que el actual')}</em>`:'')}
        ${stat('Dólar oficial (TCR)',fxReal?fmtToday(fxReal):'—',Number.isFinite(fx)?`a pesos de ${base} · en su momento: ${fmtEra(fx,cur)}`:'Sin cotización',fxReal&&fxTodayReal?`<em class="neutral">Hoy: ${fmtToday(fxNow.v)} (${ymShort(fxNow.ym)}) · en términos reales, ${Math.abs(fxReal/fxTodayReal-1)<0.03?'similar al actual':`${nf(0).format(Math.abs((fxReal/fxTodayReal-1)*100))}% ${fxReal>fxTodayReal?'más caro':'más barato'} que hoy`}</em>`:'')}
        ${Number.isFinite(free)&&Math.abs(free/fx-1)>0.03?stat('Dólar libre (TCR)',fmtToday(freeReal),`promedio mensual · en su momento: ${fmtEra(free,cur)} · brecha ${pct((free/fx-1)*100,0)}`):''}
        ${freeAnnual?stat('Dólar libre (TCR)',fmtToday(freeReal),`referencia anual ${y} · en su momento: ${fmtEra(freeAnnual.v,currencyAt(`${y}-07`))} · brecha ${pct(freeAnnual.gap,0)}`):''}
      </div>
      <div class="be-goods"><h4>¿Cuánto costaba?</h4><p>${sal?`Cuántos ${sal.kind==='ripte'?'sueldos promedio (RIPTE)':'salarios mínimos'} hacían falta entonces y cuántos hacen falta hoy.`:'No hay serie salarial para esa fecha; se muestran sólo los precios disponibles.'} Se usa el precio publicado más cercano a la fecha (hasta un año de distancia para alimentos, 18 meses para autos y departamentos).</p>
        <div class="be-table-wrap"><table class="be-table"><thead><tr><th>Bien</th><th>Precio en su época</th><th>Equivalía a</th><th>Hoy</th></tr></thead><tbody>${goodsRows(ym,sal?.kind||'ripte')}</tbody></table></div></div>
      <p class="be-notes">Valores “a pesos de ${base}” ajustados por IPC (${esc(D.notes.cpi)}). TCR: dólar oficial ajustado por la inflación de Argentina y de EE.UU. (IPC-U). ${esc(D.notes.salary)} ${esc(D.notes.gdp)} ${esc(D.basket?.apartment?.note||'')} Fotos: Wikipedia / Wikimedia Commons.</p>`;
    try{history.replaceState(null,'',`#nacimiento-${ym}`);}catch{}
  }

  function fillSelectors(){
    const ys=$('beYear'),ms=$('beMonth');const lastYm=D.cpiBase>D.end?D.cpiBase:D.end;const y1=+lastYm.slice(0,4);
    ys.innerHTML='';for(let y=y1;y>=+D.start.slice(0,4);y--)ys.insertAdjacentHTML('beforeend',`<option value="${y}">${y}</option>`);
    ms.innerHTML=MONTHS.map((n,i)=>`<option value="${String(i+1).padStart(2,'0')}">${n[0].toUpperCase()+n.slice(1)}</option>`).join('');
    const h=location.hash.match(/^#nacimiento-(\d{4})-(\d{2})$/);
    ys.value=h?h[1]:'1990';ms.value=h?h[2]:'06';
    const clamp=()=>{const last=D.cpiBase>D.end?D.cpiBase:D.end;for(const o of ms.options)o.disabled=`${ys.value}-${o.value}`>last;if(ms.selectedOptions[0]?.disabled)ms.value=last.slice(5);};
    clamp();ys.addEventListener('change',()=>{clamp();render();});ms.addEventListener('change',render);
  }

  async function load(){
    if(loading)return loading;
    loading=(async()=>{try{const r=await fetch('/birth-economy.json?v=123',{cache:'no-cache'});if(!r.ok)throw new Error(r.status);D=await r.json();fillSelectors();render();}
      catch(e){const o=$('beResult');if(o)o.innerHTML='<p class="be-na">No se pudieron cargar los datos históricos. Probá recargar la página.</p>';loading=null;}})();
    return loading;
  }
  function init(){
    const sec=$('nacimiento');if(!sec)return;
    if(/^#nacimiento/.test(location.hash)||!('IntersectionObserver' in window)){load();return;}
    const io=new IntersectionObserver(es=>{if(es.some(e=>e.isIntersecting)){io.disconnect();load();}},{rootMargin:'600px'});io.observe(sec);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();

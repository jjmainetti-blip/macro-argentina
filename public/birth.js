// v123 · "La economía cuando naciste".
// Lee public/birth-economy.json (series mensuales desde 1943 en pesos actuales equivalentes + presidentes,
// ministros, monedas y precios de bienes con fuente) y arma la ficha del mes elegido.
// v129: sólo se muestran los datos disponibles. Precios: entre dos observaciones separadas por hasta 2 años se
// interpola el precio REAL (ajustado por IPC) y se vuelve a nominal del mes; sin observaciones cercanas, no se muestra.
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

  // v129: salario medio industrial (hasta 1993), RIPTE (desde jul-1994), ene-jun 1994 interpolado.
  function salaryAt(ym){const r=atOrBefore('wage',ym,4);if(!r)return null;const kind=D.wageSrc?.[ymIdx(r.ym)]||'ind';return {kind,...r};}
  function salaryToday(){return lastOf('ripte');}
  const SAL_LABEL={ind:'Salario medio industrial',interp:'Salario promedio (estimado)',ripte:'Sueldo promedio (RIPTE)'};

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

  // v129: precio del mes t para un bien. Observación exacta; o interpolación del precio real (IPC; IPC-U de
  // EE.UU. para valores en dólares) entre la observación anterior y la siguiente si están a <= 24 meses;
  // o, en los extremos, la observación más cercana (<= 6 meses) actualizada por IPC. Si no, null.
  const cpiAt=(ym,usd)=>{const k=usd?'usCpi':'cpi';const v=at(k,ym);if(Number.isFinite(v))return v;const l=lastOf(k);return ym>l.ym?l.v:null;};
  function priceAt(g,ym){
    const usd=!!g.m2,val=p=>usd?p.usd:p.ars,pts=(g.points||[]).filter(p=>/^\d{4}-\d{2}$/.test(p.p)&&Number.isFinite(val(p))).sort((a,b)=>a.p.localeCompare(b.p));
    if(!pts.length)return null;const t=ymIdx(ym);
    let a=null,b=null;for(const p of pts){const i=ymIdx(p.p);if(i<=t)a=p;if(i>=t&&!b)b=p;}
    const ct=cpiAt(ym,usd);if(!Number.isFinite(ct))return null;
    if(a&&a.p===ym)return {value:val(a),exact:true,a};
    if(a&&b){const ia=ymIdx(a.p),ib=ymIdx(b.p),ca=cpiAt(a.p,usd),cb=cpiAt(b.p,usd);
      if(ib-ia<=24&&ca&&cb){const w=(t-ia)/(ib-ia),r=Math.pow(val(a)/ca,1-w)*Math.pow(val(b)/cb,w);return {value:r*ct,exact:false,a,b};}}
    const near=[a,b].filter(Boolean).map(p=>({p,d:Math.abs(ymIdx(p.p)-t)})).sort((x,y)=>x.d-y.d)[0];
    if(near&&near.d<=6){const cp=cpiAt(near.p.p,usd);if(cp)return {value:val(near.p)*ct/cp,exact:false,a:near.p,carried:true};}
    return null;
  }
  function lastPoint(points){return (points||[]).filter(p=>/^\d{4}-\d{2}$/.test(p.p)).slice().sort((a,b)=>a.p.localeCompare(b.p)).at(-1)||null;}
  const fxFor=ym=>at('fxFree',ym)??at('fx',ym)??(ym>lastOf('fx').ym?(lastOf('fxFree')?.v??lastOf('fx').v):null);

  function goodsRows(ym,sal){
    const B=D.basket||{},rows=[],salToday=salaryToday();
    const order=['bread','milk','beef','chicken','fish','potato','flour','oil','oil1','oil15','sugar','rice','butter','eggs','yerba','coffee','wine','fuel','moto','car','apartment'];
    const keys=Object.keys(B).sort((x,y)=>(order.indexOf(x)+1||99)-(order.indexOf(y)+1||99));
    for(const key of keys){const g=B[key];
      const pr=priceAt(g,ym);if(!pr)continue;            // sin dato cercano: la fila no se muestra
      const food=g.kind==='food',per=g.per||'unidades';
      const ars=g.m2?(fxFor(ym)?pr.value*g.m2*fxFor(ym):null):pr.value,cur=currencyAt(ym);
      const ratio=(price,s)=>Number.isFinite(price)&&Number.isFinite(s)&&s>0?(food?`${big(s/price)} ${per} por sueldo`:`${big(price/s)} sueldos`):null;
      const ref=pr.exact?pr.a:null;
      const how=pr.exact?`precio de ${ymShort(pr.a.p)}`:pr.carried?`estimado desde ${ymShort(pr.a.p)} (ajustado por IPC)`:`estimado entre ${ymShort(pr.a.p)} y ${ymShort(pr.b.p)} (ajustado por IPC)`;
      const srcs=[pr.a,pr.b].filter(Boolean).filter((p,i,arr)=>p.src&&arr.findIndex(q=>q.src===p.src)===i).map((p,i)=>`<a href="${esc(p.src)}" target="_blank" rel="noopener">fuente${i?' 2':''}</a>`).join(' · ');
      const model=(ref||pr.a)?.model,flag=[pr.a,pr.b].find(p=>p?.flag)?.flag;
      const nom=g.m2?`US$ ${nf(0).format(pr.value*g.m2)} <small>(US$ ${nf(0).format(pr.value)}/m²)</small>`:fmtEra(ars,cur);
      const then=`${nom}<small>${model&&g.kind==='durable'&&!g.m2?esc(model)+' · ':''}${how}${flag?` · ${esc(flag)}`:''}${srcs?` · ${srcs}`:''}</small>`;
      const r=sal?ratio(ars,sal.v):null;
      const L=lastPoint(g.points);let today='—';
      if(L&&ymIdx(L.p)>=ymIdx(lastOf('cpi').ym)-24){const lv=g.m2?L.usd:L.ars,lars=g.m2?lv*g.m2*(fxFor(L.p)||0):lv,lr=ratio(lars,salToday?.v);
        today=`${lr?`<b>${lr}</b>`:''}<small>${g.m2?`US$ ${nf(0).format(lv*g.m2)}`:fmtToday(lv)} · ${ymShort(L.p)}${L.model&&g.kind==='durable'&&!g.m2?` · ${esc(L.model)}`:''}</small>`;}
      rows.push(`<tr><th scope="row">${esc(g.label)}${(ref||pr.a)?.area?`<small>${esc((ref||pr.a).area)}</small>`:''}</th><td data-label="En su época">${then}</td><td data-label="Equivalía a">${r?`<b>${r}</b>`:'—'}</td><td data-label="Hoy">${today}</td></tr>`);
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
    const sal=salaryAt(ym),salT=salaryToday();
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
    const salLabel=sal?SAL_LABEL[sal.kind]||'Salario':'';const goods=goodsRows(ym,sal);
    out.innerHTML=`
      <div class="be-head"><div><span class="eyebrow">Naciste en</span><h3>${ymLabel(ym).replace(/^./,c=>c.toUpperCase())}</h3></div>
        <div class="be-currency"><span>Moneda vigente</span><strong>${esc(cur.name)} <em>${esc(cur.sym)}</em></strong><small>${cur.f<1?`1 peso de hoy = ${nf(0).format(1/cur.f)} ${esc(cur.sym)}`:'Moneda actual'}${curNote?` · ${esc(curNote)}`:''}</small></div></div>
      <div class="be-people">${personCard('Presidencia',pres)}${personCard('Ministerio de Economía',min)}</div>
      <div class="be-stats">
        ${inf?stat('Inflación mensual',pct(inf.mom),Number.isFinite(inf.yoy)?`Interanual: <b>${pct(inf.yoy,Math.abs(inf.yoy)>=100?0:1)}</b>`:''):''}
        ${Number.isFinite(gdp)?stat(`PBI ${y}`,pct(gdp),`Variación real anual${Number.isFinite(gdpPrev)?` · ${yr-1}: ${pct(gdpPrev)}`:''}`):''}
        ${sal?stat(salLabel,fmtToday(salReal),`a pesos de ${base} · en su momento: ${fmtEra(sal.v,currencyAt(sal.ym))}${sal.ym!==ym?` (${ymShort(sal.ym)})`:''}`,salTodayReal?`<em class="${salReal>=salTodayReal*0.97?'up':'down'}">Sueldo promedio hoy (RIPTE): ${fmtToday(salTodayReal)} (${ymShort(salT.ym)}) · ${cmp(salReal,salTodayReal,'menor','mayor').replace('que hoy','que el actual')}</em>`:''):''}
        ${!fxReal?'':stat('Dólar oficial (TCR)',fmtToday(fxReal),`a pesos de ${base} · en su momento: ${fmtEra(fx,cur)}`,fxReal&&fxTodayReal?`<em class="neutral">Hoy: ${fmtToday(fxNow.v)} (${ymShort(fxNow.ym)}) · en términos reales, ${Math.abs(fxReal/fxTodayReal-1)<0.03?'similar al actual':`${nf(0).format(Math.abs((fxReal/fxTodayReal-1)*100))}% ${fxReal>fxTodayReal?'más caro':'más barato'} que hoy`}</em>`:'')}
        ${Number.isFinite(free)&&Math.abs(free/fx-1)>0.03?stat('Dólar libre (TCR)',fmtToday(freeReal),`promedio mensual · en su momento: ${fmtEra(free,cur)} · brecha ${pct((free/fx-1)*100,0)}`):''}
        ${freeAnnual?stat('Dólar libre (TCR)',fmtToday(freeReal),`referencia anual ${y} · en su momento: ${fmtEra(freeAnnual.v,currencyAt(`${y}-07`))} · brecha ${pct(freeAnnual.gap,0)}`):''}
      </div>
      ${goods?`<div class="be-goods"><h4>¿Cuánto costaba?</h4><p>${sal?`Cuántos sueldos hacían falta entonces (${esc(salLabel.replace(/\s*\((.*)\)/,' $1').replace(/^./,c=>c.toLowerCase()))}) y cuántos hacen falta hoy (sueldo promedio, RIPTE).`:''} Cuando no hay un precio publicado para ese mes exacto, se estima a partir de las observaciones más cercanas (separadas por hasta 2 años), manteniendo su valor real.</p>
        <div class="be-table-wrap"><table class="be-table"><thead><tr><th>Bien</th><th>Precio en su época</th><th>Equivalía a</th><th>Hoy</th></tr></thead><tbody>${goods}</tbody></table></div></div>`:''}
      <p class="be-notes">Valores “a pesos de ${base}” ajustados por IPC (${esc(D.notes.cpi)}). TCR: dólar oficial ajustado por la inflación de Argentina y de EE.UU. (IPC-U). ${esc(D.notes.salary)} ${esc(D.notes.prices||'')} ${esc(D.notes.gdp)} Fotos: Wikipedia / Wikimedia Commons.</p>`;
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
    loading=(async()=>{try{const r=await fetch('/birth-economy.json?v=130',{cache:'no-cache'});if(!r.ok)throw new Error(r.status);D=await r.json();fillSelectors();render();}
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

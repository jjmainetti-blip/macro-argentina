// v135 · "Un día como hoy": un hecho económico por día del año (public/efemerides.json, armado por
// scripts/build-efemerides.py). Muestra el día de hoy en hora argentina y permite recorrer el calendario.
(()=>{
  const MESES=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  const CAT={plan:'Plan económico',moneda:'Moneda',deuda:'Deuda',fmi:'FMI',devaluacion:'Dólar',crisis:'Crisis',bolsa:'Bolsa',riesgo:'Riesgo país',ley:'Ley',renuncia:'Renuncia',institucion:'Instituciones',inflacion:'Inflación',privatizacion:'Privatización',ministro:'Ministro de Economía',otro:'Economía'};
  const $=id=>document.getElementById(id);
  let DAYS=null,cur=null;
  const todayAR=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires'}).format(new Date());
  const key=d=>`${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
  const leapDate=k=>new Date(Date.UTC(2024,+k.slice(0,2)-1,+k.slice(3)));   // 2024: año bisiesto, incluye el 29/2
  function render(k){
    const e=DAYS?.[k];if(!e)return;cur=k;const m=e.main,y=+m.date.slice(0,4),thisYear=+todayAR().slice(0,4),ago=thisYear-y;
    $('otdDay').textContent=`${+k.slice(3)} de ${MESES[+k.slice(0,2)-1]}`;$('otdYear').textContent=y;
    $('otdAgo').textContent=ago>0?`hace ${ago} ${ago===1?'año':'años'}`:'este año';
    const c=$('otdCat');c.textContent=m.kind==='mercado'?'Dato de mercado':(CAT[m.cat]||'Economía');c.className='otd-cat'+(m.kind==='mercado'?' mercado':'');
    $('otdHead').textContent=m.title;$('otdText').textContent=m.text;
    const s=$('otdSource');if(/^https?:/.test(m.source||'')){s.href=m.source;s.textContent='Fuente: '+new URL(m.source).hostname.replace(/^www\./,'');s.hidden=false;}else if(m.source){s.removeAttribute('href');s.textContent='Fuente: '+m.source;s.hidden=false;}else s.hidden=true;
    const more=(e.more||[]).filter(x=>x.kind!=='mercado'||m.kind!=='mercado').slice(0,3),box=$('otdMore'),ul=$('otdMoreList');ul.textContent='';
    for(const x of more){const li=document.createElement('li'),b=document.createElement('b');b.textContent=x.date.slice(0,4);li.append(b,x.title);ul.append(li);}
    box.hidden=!more.length;
  }
  const shift=n=>{const d=leapDate(cur);d.setUTCDate(d.getUTCDate()+n);render(key(d));};
  async function init(){
    try{const r=await fetch('/efemerides.json?v=135');if(!r.ok)throw new Error(r.status);DAYS=(await r.json()).days;}
    catch(e){$('otdHead').textContent='No se pudieron cargar las efemérides.';return;}
    const t=todayAR();render(t.slice(5));
    $('otdPrev').onclick=()=>shift(-1);$('otdNext').onclick=()=>shift(1);$('otdToday').onclick=()=>render(todayAR().slice(5));
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();

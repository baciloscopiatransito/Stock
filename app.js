{
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>(Math.round(n*100)/100).toLocaleString('es-AR');
const DAY=864e5,API=window.STOCK_API||'';
const ls={get:k=>{try{return localStorage.getItem(k)}catch(e){return null}},set:(k,v)=>{try{localStorage.setItem(k,v)}catch(e){}}};
let dev=ls.get('stockDev');if(!dev){dev=Math.random().toString(36).slice(2,12);ls.set('stockDev',dev)}
let items=[],movs=[],known=null,seeded=false,tipo='in',busy=false;

function toast(t){if(ls.get('stockMute')==='1')return;const d=document.createElement('div');d.className='toast';d.textContent=t;$('toasts').append(d);setTimeout(()=>d.remove(),7000)}
const key=()=>ls.get('stockKey')||'';
const who=()=>ls.get('stockWho')||'';

async function get(){
  const r=await fetch(API+'?k='+encodeURIComponent(key())+'&_='+Date.now());
  return r.json();
}
async function post(body){
  const r=await fetch(API,{method:'POST',body:JSON.stringify({...body,k:key(),dev})});
  const j=await r.json();
  if(j.error==='clave'){askKey('La clave cambió. Volvé a ingresarla.');throw new Error('Clave incorrecta.')}
  if(j.error)throw new Error(j.error);
  return j;
}

async function load(){
  if(busy||!API||!key())return;busy=true;
  try{
    const j=await get();
    if(j.error==='clave'){askKey('Clave incorrecta.');return}
    items=j.items;movs=j.movs;
    if(known)for(const m of movs)if(!known.has(m.id)&&m.dev!==dev)toast('Nuevo movimiento: '+describe(m));
    known=new Set(movs.map(m=>m.id));
    $('sub').textContent='Actualizado '+new Date().toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'})+'.';
    render();news();
  }catch(e){$('sub').textContent=navigator.onLine?'No se pudo conectar con la planilla. Reintentando…':'Sin conexión a internet.'}
  finally{busy=false}
}

function calc(){
  const now=Date.now();
  return items.map(it=>{
    let stock=0,out30=0,first=now;
    for(const m of movs){if(m.item!==it.id)continue;const q=+m.qty||0;stock+=m.t==='in'?q:-q;if(m.ts<first)first=m.ts;if(m.t==='out'&&m.ts>=now-30*DAY)out30+=q}
    const avg=out30/Math.min(30,Math.max(1,(now-first)/DAY));
    const left=avg>0?stock/avg:Infinity;
    return {...it,stock,avg,left,low:stock<=(+it.min||0)||left<7,lots:lots(it.id)};
  }).sort((a,b)=>(b.low-a.low)||a.name.localeCompare(b.name));
}

function lots(id){
  const ms=movs.filter(m=>m.item===id);
  let used=ms.filter(m=>m.t==='out').reduce((a,m)=>a+(+m.qty||0),0);
  const ins=ms.filter(m=>m.t==='in').sort((a,b)=>(a.vto||9e15)-(b.vto||9e15)||a.ts-b.ts);
  const res=[];
  for(const m of ins){const q=+m.qty||0,take=Math.min(q,used);used-=take;if(q-take>0&&m.vto)res.push({lote:m.lote,vto:m.vto,qty:q-take})}
  return res;
}
const day=ts=>new Date(ts).toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',year:'numeric'});
function render(){
  const rows=calc();
  const today=new Date();today.setHours(0,0,0,0);
  $('fItems').textContent=rows.length;
  const lows=rows.filter(r=>r.low);
  $('fLow').textContent=lows.length;$('fLowBox').className=lows.length?'bad':'';
  $('fToday').textContent=movs.filter(m=>m.ts>=+today).length;
  $('headline').textContent=lows.length?`${lows.length} ${lows.length===1?'insumo necesita':'insumos necesitan'} reposición`:'Stock del laboratorio';
  const lim=Date.now()+30*DAY,venc=[];
  for(const r of rows)for(const l of r.lots)if(l.vto<=lim)venc.push({r,l});
  venc.sort((a,b)=>a.l.vto-b.l.vto);
  $('alerts').innerHTML=(lows.length?`<div class="alert"><b>Reponer:</b> ${lows.map(r=>`${esc(r.name)} (${fmt(r.stock)} ${esc(r.unit)}${isFinite(r.left)?`, alcanza ~${Math.floor(r.left)} días`:''})`).join(' · ')}</div>`:'')
    +(venc.length?`<div class="alert"><b>Por vencer:</b> ${venc.map(({r,l})=>`${esc(r.name)}${l.lote?' lote '+esc(l.lote):''}: ${fmt(l.qty)} ${esc(r.unit)} ${l.vto<Date.now()?'<b>vencido</b> el':'vence el'} ${esc(day(l.vto))}`).join(' · ')}</div>`:'');
  $('stock').innerHTML=rows.length?`<table class="stack"><thead><tr><th>Insumo</th><th class="n">Stock</th><th class="n">Consumo/mes</th><th>Cobertura</th><th class="n">Mínimo</th><th></th></tr></thead><tbody>${rows.map(r=>{
    const pct=isFinite(r.left)?Math.min(100,r.left/60*100):100;
    const cov=r.avg>0?`${Math.max(0,Math.floor(r.left))} días`:'sin consumo';
    return `<tr class="${r.low?'low':''}"><td><span class="name">${esc(r.name)}</span> <span class="u">${esc(r.unit)}</span>${r.lots.length?`<span class="vto ${r.lots[0].vto<=lim?'soon':''}">Próx. vto ${esc(day(r.lots[0].vto))}${r.lots[0].lote?' · lote '+esc(r.lots[0].lote):''}</span>`:''}</td><td class="n stk">${fmt(r.stock)}</td><td class="n">${fmt(r.avg*30)}</td><td><span class="u">${cov}</span><div class="meter"><i style="width:${pct}%"></i></div></td><td class="n">${fmt(+r.min||0)}</td><td><div class="rowb"><button class="in" data-q="in" data-id="${esc(r.id)}" aria-label="Ingreso de ${esc(r.name)}">+</button><button class="out" data-q="out" data-id="${esc(r.id)}" aria-label="Egreso de ${esc(r.name)}">−</button><button class="delit" data-delit="${esc(r.id)}" aria-label="Eliminar ${esc(r.name)}" title="Eliminar insumo">✕</button></div></td></tr>`}).join('')}</tbody></table>`:`<div class="empty">Sin insumos cargados. Tocá “Nuevo insumo” para empezar.</div>`;
  const sel=$('hFilter'),cur=sel.value;
  sel.innerHTML='<option value="">Todos los insumos</option>'+items.map(i=>`<option value="${esc(i.id)}">${esc(i.name)}</option>`).join('');sel.value=cur;
  const byId=Object.fromEntries(items.map(i=>[i.id,i]));
  const hs=movs.filter(m=>!sel.value||m.item===sel.value).sort((a,b)=>b.ts-a.ts).slice(0,60);
  $('hist').innerHTML=hs.length?`<div class="scroll"><table class="hist stack"><thead><tr><th>Fecha</th><th>Tipo</th><th>Insumo</th><th class="n">Cantidad</th><th>Lote / Vto</th><th>Responsable</th><th>Nota</th><th></th></tr></thead><tbody>${hs.map(m=>{const it=byId[m.item]||{name:'(borrado)',unit:''};return `<tr><td>${esc(when(m.ts))}</td><td><span class="tag ${m.t==='in'?'tIn':'tOut'}">${m.t==='in'?'Ingreso':'Egreso'}</span></td><td>${esc(it.name)}</td><td class="n">${fmt(+m.qty)} ${esc(it.unit)}</td><td>${esc([m.lote,m.vto?day(m.vto):''].filter(Boolean).join(' · '))}</td><td>${esc(m.who)}</td><td>${esc(m.note)}</td><td><button data-del="${esc(m.id)}" aria-label="Borrar movimiento" style="min-height:36px">Borrar</button></td></tr>`}).join('')}</tbody></table></div>`:`<div class="empty">Sin movimientos todavía.</div>`;
}
const when=ts=>new Date(ts).toLocaleString('es-AR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
function describe(m){const it=items.find(i=>i.id===m.item);return `${m.who||'Alguien'} ${m.t==='in'?'ingresó':'sacó'} ${fmt(+m.qty)} ${it?it.unit+' de '+it.name:''}`}

function news(){
  if(seeded)return;seeded=true;
  const last=+ls.get('stockSeen')||0;
  const nu=last?movs.filter(m=>m.ts>last&&m.dev!==dev).sort((a,b)=>b.ts-a.ts):[];
  if(nu.length)$('newsBox').innerHTML=`<div class="alert news"><b style="color:inherit">${nu.length} movimiento${nu.length>1?'s':''} desde tu última visita</b><ul>${nu.slice(0,8).map(m=>`<li>${esc(describe(m))} · ${esc(when(m.ts))}</li>`).join('')}</ul><button id="bSeen" style="margin-top:10px">Listo, visto</button></div>`;
  ls.set('stockSeen',Date.now());
}

function askKey(msg){
  $('sKey').value=key();$('sWho').value=who();$('sMute').checked=ls.get('stockMute')==='1';
  $('sErr').textContent=msg||'';$('sCancel').hidden=!key();
  $('dSet').classList.add('on');
}
function openMov(t,id){
  if(!items.length){toast('Primero creá un insumo.');return}
  setT(t);$('mItem').innerHTML=items.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(i=>`<option value="${esc(i.id)}">${esc(i.name)}</option>`).join('');
  if(id)$('mItem').value=id;unit();
  $('mQty').value='';$('mNote').value='';$('mLote').value='';$('mVto').value='';$('mErr').textContent='';$('mWho').value=who();
  const d=new Date();d.setMinutes(d.getMinutes()-d.getTimezoneOffset());$('mDate').value=d.toISOString().slice(0,16);
  $('dMov').classList.add('on');$('mQty').focus();
}
function setT(t){tipo=t;$('mLotBox').style.display=t==='in'?'grid':'none';document.querySelectorAll('.seg button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.t===t))}
function unit(){const it=items.find(i=>i.id===$('mItem').value);$('mUnit').textContent=it?`(${it.unit})`:''}
function close(){document.querySelectorAll('.dlg').forEach(d=>d.classList.remove('on'))}
async function saving(form,fn){const b=form.querySelector('[type=submit]');b.disabled=true;const t=b.textContent;b.textContent='Guardando…';try{await fn()}finally{b.disabled=false;b.textContent=t}}

document.addEventListener('click',async e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.open)openMov(b.dataset.open);
  else if(b.dataset.q)openMov(b.dataset.q,b.dataset.id);
  else if(b.dataset.t)setT(b.dataset.t);
  else if(b.hasAttribute('data-close'))close();
  else if(b.id==='bNew'){$('fItem').reset();$('iErr').textContent='';$('dItem').classList.add('on');$('iName').focus()}
  else if(b.id==='bSet')askKey();
  else if(b.id==='bSeen')$('newsBox').innerHTML='';
  else if(b.dataset.delit){
    if(b.dataset.sure!=='1'){b.dataset.sure='1';b.textContent='¿Eliminar?';b.classList.add('sure');setTimeout(()=>{if(b.isConnected){b.dataset.sure='';b.textContent='✕';b.classList.remove('sure')}},4000);toast('Tocá de nuevo para eliminar el insumo y todos sus movimientos.');return}
    b.disabled=true;try{await post({action:'delitem',id:b.dataset.delit});toast('Insumo eliminado.');await load()}catch(err){toast('No se pudo eliminar: '+err.message);b.disabled=false}
  }
  else if(b.dataset.del){
    if(b.dataset.sure!=='1'){b.dataset.sure='1';b.textContent='¿Seguro?';setTimeout(()=>{b.dataset.sure='';b.textContent='Borrar'},3000);return}
    b.disabled=true;try{await post({action:'del',id:b.dataset.del});toast('Movimiento borrado.');await load()}catch(err){toast('No se pudo borrar: '+err.message);b.disabled=false}
  }
});
document.querySelectorAll('.dlg').forEach(d=>d.addEventListener('click',e=>{if(e.target===d&&key())close()}));
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&key())close()});
$('mItem').addEventListener('change',unit);
$('hFilter').addEventListener('change',render);

$('fSet').addEventListener('submit',e=>{e.preventDefault();saving($('fSet'),async()=>{
  const k=$('sKey').value.trim(),w=$('sWho').value.trim();
  ls.set('stockKey',k);ls.set('stockWho',w);ls.set('stockMute',$('sMute').checked?'1':'0');
  try{const j=await get();if(j.error==='clave'){$('sErr').textContent='Clave incorrecta.';return}}catch(err){$('sErr').textContent='No se pudo conectar. Revisá internet.';return}
  close();known=null;await load();
})});
$('fMov').addEventListener('submit',e=>{e.preventDefault();saving($('fMov'),async()=>{
  const qty=+$('mQty').value,item=$('mItem').value,w=$('mWho').value.trim(),ts=new Date($('mDate').value).getTime();
  if(!(qty>0)){$('mErr').textContent='Poné una cantidad mayor a 0.';return}
  if(tipo==='out'){const r=calc().find(x=>x.id===item);if(r&&qty>r.stock){$('mErr').textContent=`Solo hay ${fmt(r.stock)} en stock.`;return}}
  ls.set('stockWho',w);
  const v=$('mVto').value,vto=tipo==='in'&&v?new Date(v+'T12:00').getTime():0;
  try{await post({action:'mov',item,t:tipo,qty,who:w,note:$('mNote').value.trim(),ts:isFinite(ts)?ts:Date.now(),lote:tipo==='in'?$('mLote').value.trim():'',vto});close();toast(tipo==='in'?'Ingreso registrado.':'Egreso registrado.');await load()}
  catch(err){$('mErr').textContent=err.message||'No se pudo guardar.'}
})});
$('fItem').addEventListener('submit',e=>{e.preventDefault();saving($('fItem'),async()=>{
  try{await post({action:'item',name:$('iName').value.trim(),unit:$('iUnit').value.trim(),min:+$('iMin').value||0,ini:+$('iIni').value||0,who:who()});close();toast('Insumo creado.');await load()}
  catch(err){$('iErr').textContent=err.message||'No se pudo crear.'}
})});

render();
if(!API)$('sub').textContent='Falta pegar la dirección del script en config.js.';
else if(!key())askKey();
else{$('sub').textContent='Cargando…';load()}
setInterval(()=>{if(document.visibilityState==='visible')load()},20000);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')load()});
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
}

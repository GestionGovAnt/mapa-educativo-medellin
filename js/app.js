/* =========================================================
   Mapa educativo de Medellín — LÓGICA
   Secciones:
   1. Datos y utilidades (decodificación de polígonos, formatos)
   2. Estado de los filtros (objeto st)
   3. Controles (selectores, buscador, botones)
   4. Mapa (capas de comunas, barrios y sedes; zoom)
   5. Panel (KPIs, gráfica por grado, listas)
   Dependencias: d3 v7 (CDN) y datos/datos.js (window.EDU_DATA)
   ========================================================= */
(function(){
const D=window.EDU_DATA;
const fmt=new Intl.NumberFormat('es-CO');
const fmtC=new Intl.NumberFormat('es-CO',{notation:'compact',maximumFractionDigits:1});
const K=Math.cos(6.25*Math.PI/180);
const CLAS=['Oficial · sede','Oficial · principal','No oficial','Oficial · confesión religiosa','Oficial · régimen especial','Cobertura contratada'];
const isOf=c=>c===0||c===1||c===3||c===4;
const GR=['0°','1°','2°','3°','4°','5°','6°','7°','8°','9°','10°','11°'];
const NIV={all:[0,11,'Todos los grados'],tr:[0,0,'Transición (grado 0)'],pr:[1,5,'Primaria (1° a 5°)'],se:[6,9,'Secundaria (6° a 9°)'],me:[10,11,'Media (10° y 11°)']};

function decode(str){let i=0,lat=0,lon=0;const pts=[];while(i<str.length){for(let k=0;k<2;k++){let sh=0,res=0,b;do{b=str.charCodeAt(i++)-63;res|=(b&31)<<sh;sh+=5;}while(b>=32);const d=(res&1)?~(res>>1):(res>>1);if(k===0)lat+=d;else lon+=d;}pts.push([lon/1e4*K,lat/1e4]);}return pts;}
const feat=(rings)=>({type:'Feature',geometry:{type:'MultiPolygon',coordinates:rings.map(p=>p.map(decode))}});

const COM=D.C.map(c=>Object.assign(feat(c[2]),{id:c[0],name:c[1],pop:D.CP[c[0]]||null,urban:/^\d\d$/.test(c[0])&&+c[0]<50,real:/^\d\d$/.test(c[0])}));
const comById=new Map(COM.map(c=>[c.id,c]));
function comOfPoint(x,y){for(const c of COM){if(!c.real)continue;for(const poly of c.geometry.coordinates){if(d3.polygonContains(poly[0],[x,y]))return c.id;}}return null;}
const BAR=D.B.map(b=>{const f=feat(b[3]);f.id=b[0];f.name=b[1]||'Sin nombre';f.pop=D.P[b[0]]??null;
  let cid=/^\d{4}$/.test(b[0])?b[0].slice(0,2):null;
  if(!cid){const r=f.geometry.coordinates[0][0];const cx=d3.mean(r,p=>p[0]),cy=d3.mean(r,p=>p[1]);cid=comOfPoint(cx,cy);}
  f.com=cid;return f;});
const barById=new Map(BAR.map(b=>[b.id,b]));

const SED=D.S.map((r,i)=>{const g=r[7].split('.').map(Number);return {i,ie:r[0],ieName:D.E[r[0]],sede:r[1]||D.E[r[0]],principal:!r[1],clas:r[2],of:isOf(r[2]),com:r[3],bar:r[4],lat:r[5]/1e5,lon:r[6]/1e5,x:r[6]/1e5*K,y:r[5]/1e5,g,tot:d3.sum(g)};});

/* 2. Estado de los filtros y capas */
const st={com:'all',bar:'all',sec:'all',niv:'all',met:'est',q:'',sel:null,list:'terr',showSed:true,showLab:true,showCol:true};
/* Configuración del recorrido automático (tiempos en milisegundos) */
const TOUR={on:false,i:0,timer:null,idle:null,list:null,
  INICIO:2500,     // espera antes del primer recorrido al abrir la página
  ESCENA:7500,     // duración de cada escena
  REANUDAR:60000}; // tiempo sin uso para volver a arrancar
const REDUCE=matchMedia('(prefers-reduced-motion: reduce)').matches;
['Sed','Lab','Col'].forEach(n=>{const el=document.getElementById('ly'+n);el.onchange=()=>{st['show'+n]=el.checked;hideTip();render();};});

/* 3. Controles */
const fCom=document.getElementById('fCom'),fBar=document.getElementById('fBar'),fSec=document.getElementById('fSec'),fNiv=document.getElementById('fNiv'),fMet=document.getElementById('fMet'),fQ=document.getElementById('fQ');
const comOpts=COM.filter(c=>c.real).sort((a,b)=>(+a.id)-(+b.id));
fCom.append(new Option('Toda la ciudad','all'),...comOpts.map(c=>new Option(`${c.id} · ${c.name}`,c.id)));
fNiv.append(...Object.entries(NIV).map(([k,v])=>new Option(v[2],k)),...GR.map((g,i)=>new Option('Grado '+(i===0?'0 (transición)':i+'°'),'g'+i)));
document.getElementById('dlE').append(...D.E.map(n=>{const o=document.createElement('option');o.value=n;return o;}));
function fillBar(){fBar.replaceChildren(new Option(st.com==='all'?'Elige primero una comuna':'Todos los barrios','all'));fBar.disabled=st.com==='all';
  if(st.com!=='all')BAR.filter(b=>b.com===st.com).sort((a,b)=>a.name.localeCompare(b.name,'es')).forEach(b=>fBar.append(new Option(b.name,b.id)));fBar.value=st.bar;}
fCom.onchange=()=>{st.com=fCom.value;st.bar='all';st.sel=null;fillBar();zoomTo();render();};
fBar.onchange=()=>{st.bar=fBar.value;st.sel=null;zoomTo();render();};
fSec.onchange=()=>{st.sec=fSec.value;render();};
fNiv.onchange=()=>{st.niv=fNiv.value;render();};
fMet.onchange=()=>{st.met=fMet.value;render();};
fQ.oninput=()=>{st.q=fQ.value.trim();const ix=D.E.indexOf(st.q);if(ix>=0){const s=SED.find(s=>s.ie===ix);selectSede(s,true);}else{render();}};
document.getElementById('bReset').onclick=()=>{Object.assign(st,{com:'all',bar:'all',sec:'all',niv:'all',q:'',sel:null});fCom.value='all';fSec.value='all';fNiv.value='all';fQ.value='';fillBar();zoomTo();render();};
document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{st.list=b.dataset.t;document.querySelectorAll('.tabs button').forEach(x=>x.setAttribute('aria-pressed',x===b));renderList();});
document.getElementById('dClose').onclick=()=>{st.sel=null;render();};

function gRange(){if(st.niv.startsWith('g')){const g=+st.niv.slice(1);return [g,g];}return NIV[st.niv];}
function stud(s){const [a,b]=gRange();let t=0;for(let k=a;k<=b;k++)t+=s.g[k];return t;}
function secOk(s){return st.sec==='all'||(st.sec==='of'&&s.of)||(st.sec==='no'&&!s.of)||(st.sec==='cc'&&s.clas===5);}
function qOk(s){return !st.q||s.ieName.toLowerCase().includes(st.q.toLowerCase())||s.sede.toLowerCase().includes(st.q.toLowerCase());}
const baseSedes=()=>SED.filter(s=>secOk(s)&&qOk(s));
function inArea(s){if(st.bar!=='all')return s.bar===st.bar;if(st.com!=='all')return s.com===st.com;return true;}

/* 4. Mapa */
const svg=d3.select('#map'),gRoot=svg.append('g'),gCom=gRoot.append('g'),gBar=gRoot.append('g'),gDots=gRoot.append('g'),gLab=gRoot.append('g'),gBLab=gRoot.append('g');
const labStyle=sel=>sel.attr('text-anchor','middle').attr('dy','.35em').attr('pointer-events','none').attr('font-family','Figtree, system-ui, sans-serif').attr('font-weight',600).attr('fill','var(--ink)').attr('stroke','var(--surface)').attr('paint-order','stroke').attr('stroke-linejoin','round');
let W=800,H=600,path,proj;
const tip=document.getElementById('tip');
function showTip(ev,html){tip.innerHTML=html;tip.style.display='block';const r=document.querySelector('.mapbox').getBoundingClientRect();let x=ev.clientX-r.left+14,y=ev.clientY-r.top+14;if(x+tip.offsetWidth>r.width)x=ev.clientX-r.left-tip.offsetWidth-14;if(y+tip.offsetHeight>r.height)y=ev.clientY-r.top-tip.offsetHeight-14;tip.style.left=Math.max(4,x)+'px';tip.style.top=Math.max(4,y)+'px';}
const hideTip=()=>tip.style.display='none';
const nSed=n=>`${fmt.format(n)} sede${n===1?'':'s'}`;
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const zoom=d3.zoom().scaleExtent([1,40]).on('zoom',e=>{gRoot.attr('transform',e.transform);const k=e.transform.k;gCom.selectAll('path').attr('stroke-width',1.2/k);gBar.selectAll('path').attr('stroke-width',0.7/k);gDots.selectAll('circle').attr('r',d=>d._r/Math.sqrt(k)).attr('stroke-width',0.8/k);gLab.selectAll('text').attr('font-size',11/Math.sqrt(k)).attr('stroke-width',3/Math.sqrt(k));gBLab.selectAll('text').attr('font-size',10/k).attr('stroke-width',2.6/k);});
svg.call(zoom);
document.getElementById('zIn').onclick=()=>svg.transition().duration(300).call(zoom.scaleBy,1.6);
document.getElementById('zOut').onclick=()=>svg.transition().duration(300).call(zoom.scaleBy,1/1.6);
document.getElementById('zFit').onclick=()=>{svg.transition().duration(400).call(zoom.transform,d3.zoomIdentity);};
function layout(){const el=document.getElementById('map');W=el.clientWidth||800;H=el.clientHeight||600;svg.attr('viewBox',`0 0 ${W} ${H}`);
  proj=d3.geoIdentity().reflectY(true).fitExtent([[16,16],[W-16,H-16]],{type:'FeatureCollection',features:COM.filter(c=>c.real)});path=d3.geoPath(proj);
  gCom.selectAll('path').data(COM,d=>d.id).join('path').attr('d',path).attr('fill-rule','evenodd').style('cursor',d=>d.real?'pointer':'default')
    .on('mousemove',(ev,d)=>{if(!d.real)return;const a=agg(s=>s.com===d.id);showTip(ev,`<b>${esc(d.id+' · '+d.name)}</b><span class="m">${fmt.format(a.est)} estudiantes · ${nSed(a.sed)} · ${fmt.format(a.ie)} institución${a.ie===1?'':'es'}<br>Población 2025: ${d.pop?fmt.format(d.pop):'s.d.'}</span>`);})
    .on('mouseleave',hideTip).on('click',(ev,d)=>{if(!d.real||st.com===d.id)return;st.com=d.id;st.bar='all';st.sel=null;fCom.value=d.id;fillBar();zoomTo();render();});
  gBar.selectAll('path').data(BAR,d=>d.id).join('path').attr('d',path).attr('fill-rule','evenodd').style('cursor','pointer')
    .on('mousemove',(ev,d)=>{const a=agg(s=>s.bar===d.id);showTip(ev,`<b>${esc(d.name)}</b><span class="m">${esc(comById.get(d.com)?.name||'')}<br>${fmt.format(a.est)} estudiantes · ${nSed(a.sed)}<br>Población 2025: ${d.pop!=null?fmt.format(d.pop):'s.d.'}</span>`);})
    .on('mouseleave',hideTip).on('click',(ev,d)=>{st.com=d.com;st.bar=d.id;st.sel=null;fCom.value=d.com;fillBar();fBar.value=d.id;zoomTo();render();});
  SED.forEach(s=>{const p=proj([s.x,s.y]);s.px=p[0];s.py=p[1];});
  gLab.selectAll('text').data(COM.filter(c=>c.real),d=>d.id).join('text').attr('x',d=>path.centroid(d)[0]).attr('y',d=>path.centroid(d)[1])
    .call(labStyle).attr('font-size',11).attr('stroke-width',3).text(d=>d.name);
  gBLab.selectAll('text').data(BAR,d=>d.id).join('text').attr('x',d=>path.centroid(d)[0]).attr('y',d=>path.centroid(d)[1])
    .call(labStyle).attr('font-weight',500).attr('font-size',10).attr('stroke-width',2.6).text(d=>d.name);
}
function zoomTo(){let f=null;if(st.bar!=='all')f=barById.get(st.bar);else if(st.com!=='all')f=comById.get(st.com);
  if(!f){svg.transition().duration(500).call(zoom.transform,d3.zoomIdentity);return;}
  const [[x0,y0],[x1,y1]]=path.bounds(f);const k=Math.min(40,0.85/Math.max((x1-x0)/W,(y1-y0)/H));
  svg.transition().duration(600).call(zoom.transform,d3.zoomIdentity.translate(W/2,H/2).scale(k).translate(-(x0+x1)/2,-(y0+y1)/2));}

function agg(pred){const ss=baseSedes().filter(pred);const est=d3.sum(ss,stud);return {ss,est,sed:ss.length,ie:new Set(ss.map(s=>s.ie)).size,ieOf:new Set(ss.filter(s=>s.of).map(s=>s.ie)).size,sedOf:ss.filter(s=>s.of).length,estOf:d3.sum(ss.filter(s=>s.of),stud)};}
function metricVal(f,isBar){const a=agg(isBar?(s=>s.bar===f.id):(s=>s.com===f.id));const pop=f.pop;
  return st.met==='est'?a.est:st.met==='sed'?a.sed:st.met==='pob'?pop:(pop?a.est/pop*1000:null);}
const cssv=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();

function render(){
  const ramp=d3.interpolateRgb(cssv('--ramp-lo'),cssv('--ramp-hi'));
  const showBar=st.com!=='all';
  // comunas
  const cv=new Map(COM.filter(c=>c.real).map(c=>[c.id,metricVal(c,false)]));
  const cmax=d3.max([...cv.values()].filter(v=>v!=null))||1;
  const anim=TOUR.on&&!REDUCE,T=s=>anim?s.transition().duration(900):s;
  T(gCom.selectAll('path')).attr('fill',d=>{if(!d.real)return cssv('--land');if(showBar&&d.id===st.com)return 'none';if(!st.showCol)return d.urban?cssv('--land-hi'):cssv('--land');const v=cv.get(d.id);return v==null?cssv('--land'):ramp(Math.sqrt(v/cmax));})
    .attr('fill-opacity',d=>showBar&&d.id!==st.com?0.35:1).attr('stroke',st.showCol?cssv('--surface'):cssv('--stroke'));
  // barrios
  const bars=showBar?BAR.filter(b=>b.com===st.com):[];
  const bv=new Map(bars.map(b=>[b.id,metricVal(b,true)]));const bmax=d3.max([...bv.values()].filter(v=>v!=null))||1;
  gBar.selectAll('path').attr('display',d=>d.com===st.com&&showBar?null:'none').attr('stroke-width',d=>(d.id===st.bar?2.4:0.7)/(d3.zoomTransform(svg.node()).k));
  T(gBar.selectAll('path')).attr('fill',d=>{if(!st.showCol)return cssv('--land-hi');const v=bv.get(d.id);return v==null?cssv('--land'):ramp(Math.sqrt(v/bmax));})
    .attr('stroke',d=>d.id===st.bar?cssv('--sel'):cssv('--stroke'));
  gBar.selectAll('path').filter(d=>d.id===st.bar).raise();
  gLab.attr('display',!showBar&&st.showLab?null:'none');
  const kz=d3.zoomTransform(svg.node()).k;
  gBLab.attr('display',showBar&&st.showLab?null:'none').selectAll('text').attr('display',d=>d.com===st.com?null:'none').attr('font-size',10/kz).attr('stroke-width',2.6/kz);
  gDots.attr('display',st.showSed?null:'none');
  // dots
  const vis=baseSedes();const maxS=d3.max(SED,s=>s.tot)||1;
  const k=d3.zoomTransform(svg.node()).k;
  const dots=gDots.selectAll('circle').data(vis,d=>d.i).join(en=>en.append('circle').attr('fill-opacity',0)).attr('cx',d=>d.px).attr('cy',d=>d.py)
    .each(d=>{d._r=1.6+Math.sqrt(stud(d)/maxS)*9;})
    .attr('r',d=>d._r/Math.sqrt(k)).attr('fill',d=>d.of?cssv('--oficial'):cssv('--privado'))
    .attr('stroke',d=>st.sel===d.i?cssv('--sel'):cssv('--surface')).attr('stroke-width',d=>(st.sel===d.i?2.2:0.8)/k).style('cursor','pointer')
    .on('mousemove',(ev,d)=>showTip(ev,`<b>${esc(d.sede)}</b><span class="m">${esc(d.principal?CLAS[d.clas]:d.ieName)}<br>${fmt.format(stud(d))} estudiantes${st.niv==='all'?'':' en el filtro'} · ${fmt.format(d.tot)} total<br>${esc(barById.get(d.bar)?.name||d.bar)}, ${esc(comById.get(d.com)?.name||d.com)}</span>`))
    .on('mouseleave',hideTip).on('click',(ev,d)=>{ev.stopPropagation();selectSede(d,false);});
  T(dots).attr('fill-opacity',d=>inArea(d)?0.85:0.25);
  if(st.sel!=null)dots.filter(d=>d.i===st.sel).raise();
  renderLegend(showBar?bmax:cmax);renderPanel();renderList();renderCrumb();
}
function selectSede(s,fly){st.sel=s.i;if(fly){st.com=s.com;st.bar='all';fCom.value=s.com;fillBar();
  const k=8;svg.transition().duration(600).call(zoom.transform,d3.zoomIdentity.translate(W/2,H/2).scale(k).translate(-s.px,-s.py));}
  render();}
function renderLegend(max){const L=document.getElementById('legend');const lab={est:'Estudiantes',sed:'Sedes',pob:'Población 2025',tasa:'Estudiantes por 1.000 hab.'}[st.met];
  const f=st.met==='tasa'?(v=>fmt.format(Math.round(v))):(v=>fmtC.format(v));
  const ramp=st.showCol?`<div class="row"><b style="font-weight:600">${lab}</b><span style="color:var(--muted)">${st.com==='all'?'por comuna':'por barrio'}</span></div><div class="ramp"></div><div class="lv"><span>0</span><span>${f(max)}</span></div>`:'';
  const dots=st.showSed?`<div class="row"><span><i class="dot" style="background:var(--oficial)"></i>Sede oficial</span><span><i class="dot" style="background:var(--privado)"></i>No oficial</span><span style="color:var(--muted)">tamaño = estudiantes</span></div>`:'';
  L.innerHTML=ramp+dots;L.hidden=!ramp&&!dots;}
function renderCrumb(){const c=document.getElementById('crumb');c.replaceChildren();
  const add=(t,fn)=>{const s=document.createElement(fn?'button':'span');s.className='chip'+(fn?' x':'');s.textContent=t;if(fn){s.type='button';s.onclick=fn;}c.appendChild(s);};
  add('Medellín',st.com!=='all'?()=>{st.com='all';st.bar='all';st.sel=null;fCom.value='all';fillBar();zoomTo();render();}:null);
  if(st.com!=='all')add(comById.get(st.com).name,st.bar!=='all'?()=>{st.bar='all';st.sel=null;fBar.value='all';zoomTo();render();}:null);
  if(st.bar!=='all')add(barById.get(st.bar).name,null);}
/* 5. Panel */
function renderPanel(){
  const a=agg(inArea);const nivTxt=st.niv.startsWith('g')?('grado '+st.niv.slice(1)):NIV[st.niv][2].toLowerCase();
  const where=st.bar!=='all'?barById.get(st.bar).name:st.com!=='all'?`${st.com} · ${comById.get(st.com).name}`:'Medellín';
  document.getElementById('where').textContent=where;
  document.getElementById('kIE').textContent=fmt.format(a.ie);document.getElementById('kIEd').textContent=`${fmt.format(a.ieOf)} oficiales`;
  document.getElementById('kSed').textContent=fmt.format(a.sed);document.getElementById('kSedd').textContent=`${fmt.format(a.sedOf)} oficiales`;
  document.getElementById('kEst').textContent=fmt.format(a.est);document.getElementById('kEstd').textContent=st.niv==='all'?'grados 0 a 11':nivTxt;
  let pop=null,pd='';if(st.bar!=='all'){pop=barById.get(st.bar).pop;pd='proyección por barrio';}else if(st.com!=='all'){pop=comById.get(st.com).pop;pd=`${BAR.filter(b=>b.com===st.com&&/^\d{4}$/.test(b.id)).length} barrios o veredas`;}else{pop=d3.sum(Object.values(D.CP));pd='16 comunas y 5 corregimientos';}
  document.getElementById('kPob').textContent=pop!=null?fmt.format(pop):'s.d.';document.getElementById('kPobd').textContent=pd+(pop&&a.est?` · ${fmt.format(Math.round(a.est/pop*1000))} est./1.000 hab.`:'');
  const tot=a.est||1;document.getElementById('split').innerHTML=`<span style="width:${a.estOf/tot*100}%;background:var(--oficial)"></span><span style="width:${(a.est-a.estOf)/tot*100}%;background:var(--privado)"></span>`;
  document.getElementById('spO').textContent=`Oficial ${a.est?Math.round(a.estOf/tot*100):0} %`;document.getElementById('spN').textContent=`No oficial ${a.est?Math.round((a.est-a.estOf)/tot*100):0} %`;
  // grades
  const g=GR.map((_,k)=>d3.sum(a.ss,s=>s.g[k]));const of=GR.map((_,k)=>d3.sum(a.ss.filter(s=>s.of),s=>s.g[k]));
  drawGrades(document.getElementById('grades'),g,of,190,true);
  // detail
  const det=document.getElementById('detail');
  if(st.sel==null){det.hidden=true;}else{const s=SED[st.sel];det.hidden=false;
    document.getElementById('dName').textContent=s.sede;
    document.getElementById('dSub').textContent=`${s.ieName} · ${barById.get(s.bar)?.name||s.bar}, ${comById.get(s.com)?.name||s.com}`;
    document.getElementById('dTags').innerHTML=`<span class="tag" style="color:${s.of?'var(--oficial)':'var(--privado)'}">${CLAS[s.clas]}</span><span class="tag" style="color:var(--muted)">${fmt.format(s.tot)} estudiantes</span><span class="tag" style="color:var(--muted)">${SED.filter(x=>x.ie===s.ie).length} sedes en la institución</span>`;
    drawGrades(document.getElementById('dGrades'),s.g,s.of?s.g:s.g.map(()=>0),130,false);}
}
function drawGrades(el,g,of,h,highlight){const s=d3.select(el);s.selectAll('*').remove();const w=el.clientWidth||340;s.attr('viewBox',`0 0 ${w} ${h}`).attr('height',h);
  const m={l:8,r:8,t:16,b:20};const x=d3.scaleBand(d3.range(12),[m.l,w-m.r]).padding(0.22);const mx=d3.max(g)||1;const y=d3.scaleLinear([0,mx],[h-m.b,m.t]);
  const [a,b]=gRange();const box=el.parentNode;
  s.selectAll('rect.b').data(g).join('rect').attr('class','b').attr('x',(d,i)=>x(i)).attr('width',x.bandwidth()).attr('y',d=>y(d)).attr('height',d=>y(0)-y(d)).attr('rx',2)
    .attr('fill',(d,i)=>cssv('--privado')).attr('fill-opacity',(d,i)=>!highlight||(i>=a&&i<=b)?1:0.35);
  s.selectAll('rect.o').data(of).join('rect').attr('class','o').attr('x',(d,i)=>x(i)).attr('width',x.bandwidth()).attr('y',d=>y(d)).attr('height',d=>y(0)-y(d)).attr('rx',2)
    .attr('fill',cssv('--oficial')).attr('fill-opacity',(d,i)=>!highlight||(i>=a&&i<=b)?1:0.35);
  s.selectAll('text.x').data(GR).join('text').attr('class','x').attr('x',(d,i)=>x(i)+x.bandwidth()/2).attr('y',h-5).attr('text-anchor','middle').attr('font-size',10).attr('font-family','JetBrains Mono, monospace').attr('fill',cssv('--muted')).text(d=>d);
  s.selectAll('text.v').data(g).join('text').attr('class','v').attr('x',(d,i)=>x(i)+x.bandwidth()/2).attr('y',d=>y(d)-3).attr('text-anchor','middle').attr('font-size',9).attr('font-family','JetBrains Mono, monospace').attr('fill',cssv('--ink')).text((d,i)=>d===mx?fmtC.format(d):'');
  s.selectAll('rect.h').data(d3.range(12)).join('rect').attr('class','h').attr('x',i=>x(i)-2).attr('width',x.bandwidth()+4).attr('y',m.t).attr('height',h-m.t-m.b).attr('fill','transparent')
    .append('title').text(i=>`Grado ${GR[i]}: ${fmt.format(g[i])} estudiantes (oficial ${fmt.format(of[i])}, no oficial ${fmt.format(g[i]-of[i])})`);
}
function renderList(){const L=document.getElementById('list'),sub=document.getElementById('listSub');L.replaceChildren();
  if(st.list==='terr'){
    if(st.com==='all'){sub.textContent='Comunas y corregimientos por estudiantes. Toca para filtrar.';
      const rows=COM.filter(c=>c.real).map(c=>({c,a:agg(s=>s.com===c.id)})).sort((p,q)=>q.a.est-p.a.est);
      rows.forEach(({c,a})=>li(`${c.id} · ${c.name}`,`${nSed(a.sed)} · ${c.pop?fmt.format(c.pop)+' hab.':''}`,fmt.format(a.est),()=>{st.com=c.id;st.bar='all';fCom.value=c.id;fillBar();zoomTo();render();}));}
    else{sub.textContent='Barrios o veredas de la comuna por estudiantes.';
      const rows=BAR.filter(b=>b.com===st.com).map(b=>({b,a:agg(s=>s.bar===b.id)})).sort((p,q)=>q.a.est-p.a.est||((q.b.pop||0)-(p.b.pop||0)));
      rows.forEach(({b,a})=>li(b.name,`${nSed(a.sed)} · ${b.pop!=null?fmt.format(b.pop)+' hab.':'sin dato de población'}`,fmt.format(a.est),()=>{st.bar=b.id;fBar.value=b.id;zoomTo();render();},b.id===st.bar));}
  }else{const ss=baseSedes().filter(inArea);const by=d3.rollups(ss,v=>({est:d3.sum(v,stud),n:v.length,of:v[0].of,first:v[0]}),s=>s.ie).sort((p,q)=>q[1].est-p[1].est);
    sub.textContent=`${fmt.format(by.length)} instituciones en la selección, por estudiantes.`;
    by.slice(0,150).forEach(([ie,v])=>li(D.E[ie],`${v.of?'Oficial':'No oficial'} · ${v.n} sede${v.n>1?'s':''}`,fmt.format(v.est),()=>selectSede(v.first,true)));}
  function li(n,small,c,fn,on){const e=document.createElement('li');e.tabIndex=0;if(on)e.style.background='var(--bg)';e.innerHTML=`<div class="n">${esc(n)}<small>${esc(small)}</small></div><div class="c">${c}</div>`;e.onclick=fn;e.onkeydown=ev=>{if(ev.key==='Enter')fn();};L.appendChild(e);}
}
/* 6. Recorrido automático
   Mientras nadie usa el mapa, recorre escenas (filtros y segmentaciones).
   Un clic, una tecla, scroll o toque lo detiene y el mapa queda quieto.
   Tras TOUR.REANUDAR ms sin uso vuelve a empezar. */
const tourBox=document.getElementById('tour'),tourT=document.getElementById('tourT'),tourS=document.getElementById('tourS'),tourBar=document.getElementById('tourBar'),tourBtn=document.getElementById('tourBtn');
const LIMPIO={com:'all',bar:'all',sec:'all',niv:'all',met:'est',q:'',sel:null,showSed:true,showLab:true,showCol:true};
const urb=()=>COM.filter(c=>c.real);
const topCom=pred=>urb().map(c=>({c,a:agg(s=>s.com===c.id&&pred(s))})).sort((p,q)=>q.a.est-p.a.est)[0];
const pct=(a,b)=>b?Math.round(a/b*100)+' %':'0 %';
function escenas(){
  const totalEst=d3.sum(SED,s=>s.tot);
  const L=[
    {st:{},t:'Medellín: oferta educativa por comuna',s:()=>{const a=agg(()=>true);return `${fmt.format(a.ie)} instituciones en ${nSed(a.sed)} con ${fmt.format(a.est)} estudiantes de grado 0 a 11. Más oscuro = más estudiantes.`;}},
    {st:{met:'pob',showSed:false},t:'¿Dónde vive la gente?',s:()=>{const c=urb().sort((a,b)=>b.pop-a.pop)[0];return `Población 2025 por comuna. La más poblada es ${c.name}, con ${fmt.format(c.pop)} habitantes.`;}},
    {st:{sec:'of'},t:'Sector oficial',s:()=>{const a=agg(()=>true);return `${nSed(a.sed)} oficiales atienden ${fmt.format(a.est)} estudiantes, el ${pct(a.est,totalEst)} de la matrícula de la ciudad.`;}},
    {st:{niv:'me'},t:'Educación media (10° y 11°)',s:()=>{const a=agg(()=>true),t=topCom(()=>true);return `${fmt.format(a.est)} estudiantes en media. La comuna con más es ${t.c.name} (${fmt.format(t.a.est)}).`;}},
    {st:{niv:'tr'},t:'Transición (grado 0)',s:()=>{const a=agg(()=>true),t=topCom(()=>true);return `${fmt.format(a.est)} niños en transición. Donde más hay: ${t.c.name} (${fmt.format(t.a.est)}).`;}},
    {st:{sec:'cc'},t:'Cobertura contratada',s:()=>{const a=agg(()=>true);return `${nSed(a.sed)} privadas con ${fmt.format(a.est)} estudiantes cuya matrícula paga el Distrito.`;}}
  ];
  // Las tres comunas con más estudiantes, entrando a sus barrios
  urb().map(c=>({c,e:d3.sum(SED.filter(s=>s.com===c.id),s=>s.tot)})).sort((a,b)=>b.e-a.e).slice(0,3).forEach(({c})=>{
    L.push({st:{com:c.id},t:`${c.id} · ${c.name}`,s:()=>{const a=agg(s=>s.com===c.id);const b=BAR.filter(x=>x.com===c.id).map(x=>({x,e:agg(s=>s.bar===x.id).est})).sort((p,q)=>q.e-p.e)[0];
      return `${nSed(a.sed)} y ${fmt.format(a.est)} estudiantes para ${fmt.format(c.pop)} habitantes. Barrio con más estudiantes: ${b.x.name} (${fmt.format(b.e)}).`;}});
  });
  L.push({st:{met:'tasa',showSed:false},t:'Estudiantes por cada 1.000 habitantes',s:()=>{const v=urb().map(c=>({c,v:agg(s=>s.com===c.id).est/c.pop*1000})).sort((a,b)=>b.v-a.v);
    return `Dónde se concentran los colegios. Más alto: ${v[0].c.name} (${fmt.format(Math.round(v[0].v))}). Más bajo: ${v[v.length-1].c.name} (${fmt.format(Math.round(v[v.length-1].v))}).`;}});
  L.push({st:{showSed:false,showCol:false},t:'16 comunas y 5 corregimientos',s:()=>`División político-administrativa de Medellín: ${BAR.filter(b=>/^\d{4}$/.test(b.id)&&+b.id<5000).length} barrios en la zona urbana y veredas en los corregimientos. Activa las capas para volver a ver los datos.`});
  return L;
}
function aplicarEscena(sc){
  Object.assign(st,LIMPIO,sc.st);
  fCom.value=st.com;fillBar();fBar.value=st.bar;fSec.value=st.sec;fNiv.value=st.niv;fMet.value=st.met;fQ.value='';
  ['Sed','Lab','Col'].forEach(n=>{document.getElementById('ly'+n).checked=st['show'+n];});
  hideTip();zoomTo();render();
  tourT.textContent=sc.t;tourS.textContent=sc.s();
  tourBar.style.transition='none';tourBar.style.width='0';void tourBar.offsetWidth;
  tourBar.style.transition=REDUCE?'none':`width ${TOUR.ESCENA}ms linear`;tourBar.style.width='100%';
}
function pasoTour(){if(!TOUR.on)return;const L=TOUR.list;aplicarEscena(L[TOUR.i%L.length]);TOUR.i++;TOUR.timer=setTimeout(pasoTour,TOUR.ESCENA);}
function iniciarTour(){if(TOUR.on)return;clearTimeout(TOUR.idle);TOUR.on=true;TOUR.list=escenas();
  tourBox.hidden=false;tourBox.classList.remove('paused');tourBtn.textContent='Pausar';tourBtn.setAttribute('aria-label','Pausar recorrido automático');
  document.getElementById('crumb').classList.add('under');pasoTour();}
function detenerTour(){clearTimeout(TOUR.timer);if(!TOUR.on)return;TOUR.on=false;
  tourBox.classList.add('paused');tourBtn.textContent='▶ Ver recorrido';tourBtn.setAttribute('aria-label','Reanudar recorrido automático');
  tourBar.style.transition='none';document.getElementById('crumb').classList.remove('under');}
function programarReanudar(){clearTimeout(TOUR.idle);if(TOUR.REANUDAR>0)TOUR.idle=setTimeout(iniciarTour,TOUR.REANUDAR);}
tourBtn.addEventListener('click',()=>{if(TOUR.on){detenerTour();programarReanudar();}else iniciarTour();});
const usoReal=ev=>{if(!ev.isTrusted||ev.target.closest&&ev.target.closest('#tourBtn'))return;detenerTour();programarReanudar();};
['pointerdown','keydown','wheel','touchstart'].forEach(tp=>document.addEventListener(tp,usoReal,{capture:true,passive:true}));
document.addEventListener('mousemove',()=>{if(!TOUR.on)programarReanudar();},{passive:true});
document.addEventListener('visibilitychange',()=>{if(document.hidden){detenerTour();clearTimeout(TOUR.idle);}else programarReanudar();});

fillBar();layout();render();
TOUR.idle=setTimeout(iniciarTour,TOUR.INICIO);
let rt;new ResizeObserver(()=>{clearTimeout(rt);rt=setTimeout(()=>{layout();render();zoomTo();},150);}).observe(document.getElementById('map'));
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',render);
new MutationObserver(render).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
})();

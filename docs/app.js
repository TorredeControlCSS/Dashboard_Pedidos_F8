// app.js v2025-12-01d-readable — Carga inicial unificada, código legible

if (window.__APP_LOADED__) {
  console.log('app.js ya cargado, skip');
} else {
window.__APP_LOADED__ = true;
console.log('app.js v2025-12-01d-readable');

const A = window.APP && window.APP.A_URL;
const B = window.APP && window.APP.B_URL;
const CLIENT_ID = window.APP && window.APP.CLIENT_ID;

const ID_HEADER = 'F8 SALMI';
const N = s => String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\./g,'').replace(/\s+/g,' ').trim().toUpperCase();
const N_ID = N(ID_HEADER);

const DATE_FIELDS = ['ASIGNACIÓN','SALIDA','DESPACHO','FACTURACIÓN','EMPACADO','PROY. ENTREGA','ENTREGA REAL'];
const INT_FIELDS  = ['CANT. ASIG.','CANT. SOL.','RENGLONES ASIG.','RENGLONES SOL.'];
const TXT_FIELDS  = ['COMENT.'];

const COMMENT_OPTIONS = [ '', 'DISCREPANCIA DE INVENTARIO', 'FALTA DE PERSONAL', 'VIATICOS PARA VIAJES', 'FALTA MONTACARGA', 'CONGESTIONAMIENTO EN SALIDAS', 'FACTURACION RETRASADA', 'FALLAS EN SISTEMA', 'DEMORA EN DOCUMENTACION', 'ERROR DE CAPTACION', 'ENTREGADO' ];

const S_DATE = new Set(DATE_FIELDS.map(N));
const S_INT  = new Set(INT_FIELDS.map(N));
const S_TXT  = new Set(TXT_FIELDS.map(N));

let idToken = null, editMode = false, currentHeaders = [], currentRows = [], currentIdCol = null, currentPage = 1;
const DEFAULT_PAGE_SIZE = 20;

function jsonp(url){
  return new Promise((resolve,reject)=>{
    const cb = 'cb_'+Math.random().toString(36).slice(2);
    const s = document.createElement('script');
    window[cb] = (payload) => { try{resolve(payload);}finally{try{delete window[cb];}catch(e){} s.remove();} };
    s.onerror = () => { try{delete window[cb];}catch(e){} s.remove(); reject(new Error('network')); };
    s.src = url + (url.includes('?') ? '&' : '?') + 'callback=' + cb + '&_=' + Date.now();
    document.body.appendChild(s);
  });
}

const monES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const isIsoZ = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) && v.endsWith('Z');
const toDDMonYY = v => { const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(v); if(!m)return v; return `${m[3]}-${monES[parseInt(m[2],10)-1]}-${m[1].slice(-2)}`; };
const parseIsoDate = v => { if(!v)return null; const m=/^(\d{4}-\d{2})-(\d{2})/.exec(v); if(!m)return null; return new Date(+m[1], +m[2]-1, +m[3]); };

function setKpis(k){
  const set = (id,v) => { const el=document.getElementById(id); if(el)el.textContent=(v==null?'—':(+v).toLocaleString()); };
  set('kpi-total',k.total); set('kpi-asignado',k.asignado); set('kpi-solicitado',k.solicitado);
  set('kpi-reng-asig',k.rengAsig); set('kpi-reng-sol',k.rengSol); set('kpi-urg',k.urg); set('kpi-men',k.mens);
}

function getFilters(){
  return { cat:document.getElementById('fCat')?.value||'', unidad:document.getElementById('fUnidad')?.value||'', tipo:document.getElementById('fTipo')?.value||'', grupo:document.getElementById('fGrupo')?.value||'', estado:document.getElementById('fEstado')?.value||'', coment:document.getElementById('fComent')?.value||'', text:document.getElementById('fBuscar')?.value||'', desde:document.getElementById('fDesde')?.value||'', hasta:document.getElementById('fHasta')?.value||'' };
}

function widthMap(){ return { 'F8 SALMI':120,'UNIDAD':232,'TIPO':110,'GRUPO':110,'CATEG.':180,'F8 SISCONI':120,'SUSTANCIAS':160,'CANT. ASIG.':110,'CANT. SOL.':110,'RENGLONES ASIG.':130,'RENGLONES SOL.':130,'FECHA F8':110,'RECIBO F8':110,'ASIGNACIÓN':110,'SALIDA':110,'DESPACHO':110,'FACTURACIÓN':120,'EMPACADO':110,'PROY. ENTREGA':130,'ENTREGA REAL':130,'INCOTERM':110,'ESTADO':130,'COMENT.':220,'TIEMPO':90,'COMPLET':100,'FILL CANT.':110,'FILL RENGL.':120 }; }

function perRowMetrics(row){
  const complet = !!row['ENTREGA REAL'];
  const rec = row['RECIBO F8'] && parseIsoDate(row['RECIBO F8']);
  const end = row['ENTREGA REAL'] ? parseIsoDate(row['ENTREGA REAL']) : new Date();
  const days = (rec && end) ? Math.max(0, Math.round((end-rec)/86400000)) : '';
  const toNum = v => (typeof v==='number') ? v : parseFloat(String(v||'').replace(',','.')) || 0;
  const asig = toNum(row['CANT. ASIG.']), sol  = toNum(row['CANT. SOL.']);
  const rasi = toNum(row['RENGLONES ASIG.']), rsol = toNum(row['RENGLONES SOL.']);
  const fillCant = sol>0 ? Math.round((asig/sol)*100) : 0;
  const fillReng = rsol>0 ? Math.round((rasi/rsol)*100) : 0;
  return { TIEMPO: days ? `${days}d` : '', COMPLET: complet ? 'SI':'NO', 'FILL CANT.': `${fillCant}%`, 'FILL RENGL.': `${fillReng}%` };
}

function setTimeKpis(rows){
  let sumR=0,nR=0,sumP=0,nP=0;
  (rows||[]).forEach(r=>{ const rec=parseIsoDate(r['RECIBO F8']); if(!rec)return; if(r['ENTREGA REAL']){const end=parseIsoDate(r['ENTREGA REAL']); if(end&&end>=rec){sumR+=(end-rec)/864e5;nR++;}} if(r['PROY. ENTREGA']){const pro=parseIsoDate(r['PROY. ENTREGA']); if(pro&&pro>=rec){sumP+=(pro-rec)/864e5;nP++;}} });
  const avgR=nR?(sumR/nR):null, avgP=nP?(sumP/nP):null, diff=(avgR!=null&&avgP!=null)?(avgR-avgP):null;
  const set=(id,v)=>{const el=document.getElementById(id); if(!el)return; el.textContent=(v==null||isNaN(v))?'—':v.toFixed(1);};
  set('kpi-t-real',avgR); set('kpi-t-prom',avgP); set('kpi-t-diff',diff);
}

function populateFiltersFromMeta(meta) {
  const setOptions=(id,items)=>{ const el=document.getElementById(id); if(!el)return; const f=el.options[0]?.outerHTML||''; const r=(items||[]).map(v=>`<option value="${v}">${v}</option>`).join(''); el.innerHTML=f+r; };
  setOptions('fCat',meta.categorias||[]); setOptions('fUnidad',meta.unidades||[]); setOptions('fTipo',meta.tipos||[]);
  setOptions('fGrupo',meta.grupos||[]); setOptions('fEstado',meta.estados||[]);
}

function refreshKpisAndCharts(stats) {
  setKpis(stats.kpis);
  if (window.renderChartsFromStats) { try { window.renderChartsFromStats(stats); } catch(e){ console.warn('renderChartsFromStats failed', e); } }
}

function renderQueueTable(data) {
  const grupos=data.grupos||[]; const thead=document.querySelector('#tabla-queues thead'), tbody=document.querySelector('#tabla-queues tbody'); if(!thead||!tbody)return;
  thead.innerHTML=`<tr><th>GRUPO</th><th>λ</th><th>μ</th><th>ρ</th><th>W_real</th><th>W_model</th><th>Wq</th><th>L</th><th>Lq</th><th>#In</th><th>#Out</th></tr>`;
  const fmt=(v,d=2)=>(v==null||isNaN(v))?'—':(+v).toFixed(d); const shortG=n=>{if(!n)return'';let s=String(n);s=s.replace('LABORATORIO','LAB').replace('ODONTOLOGÍA','ODO').replace('ODONTOLOGIA','ODO').replace('RADIOLOGIA','RAD').replace('RADIOLOGÍA','RAD');return s;};
  tbody.innerHTML=grupos.map(g=>{ const sat=(g.mu===0)||(g.lambda!=null&&g.mu!=null&&g.s&&g.lambda>=g.s*g.mu);const rho=(g.rho==null||isNaN(g.rho))?'—':(g.rho*100).toFixed(1)+'%'; const W_m=sat?'—':fmt(g.W_model,2),Wq=sat?'—':fmt(g.Wq,2),L=sat?'—':fmt(g.L,2),Lq=sat?'—':fmt(g.Lq,2); const rCls=sat?' style="background:#fef2f2"':''; return `<tr${rCls}><td>${shortG(g.grupo)}</td><td class="num">${fmt(g.lambda,3)}</td><td class="num">${fmt(g.mu,3)}</td><td class="num">${rho}</td><td class="num">${fmt(g.W_real,2)}</td><td class="num">${W_m}</td><td class="num">${Wq}</td><td class="num">${L}</td><td class="num">${Lq}</td><td class="num">${g.llegadas}</td><td class="num">${g.completados}</td></tr>`; }).join('');
}

async function renderTable(data, page = 1) {
  currentPage = page || 1;
  const pgnEl = document.getElementById('paginacion');
  if (!data) {
    if(pgnEl) pgnEl.innerHTML = `<span>Cargando página ${currentPage}...</span>`;
    data = await jsonp(`${A}?route=orders.list&page=${currentPage}&pageSize=${DEFAULT_PAGE_SIZE}&` + new URLSearchParams(getFilters()).toString()).then(r => r.data);
  }
  const rawRows = data.rows || [];
  currentHeaders = Array.from(new Set([ ...(data.header || []), 'TIEMPO', 'COMPLET', 'FILL CANT.', 'FILL RENGL.' ]));
  currentRows = rawRows.map(r=>{ const out={...r}; Object.keys(out).forEach(k=>{if(isIsoZ(out[k]))out[k]=toDDMonYY(out[k]);}); Object.assign(out,perRowMetrics(r)); return out; });
  currentIdCol = data.header.find(h => N(h) === N_ID) || null;
  const W=widthMap(); const thead=document.querySelector('#tabla thead'), tbody=document.querySelector('#tabla tbody');
  if(thead){thead.innerHTML=`<tr>${currentHeaders.map((h,idx)=>{let c='';if(idx<4)c=`col-fix-${idx+1}`;return`<th data-col="${h}" class="${c}" style="min-width:${W[h]||100}px">${h}</th>`;}).join('')}</tr>`;}
  if(tbody){tbody.innerHTML=currentRows.map((r,ri)=>`<tr>${currentHeaders.map(k=>{const kN=N(k),ed=editMode&&(S_DATE.has(kN)||S_INT.has(kN)||S_TXT.has(kN));let cs=[],st='';if(ed){cs.push('editable');st+='cursor:pointer;background:#fffbe6;'}if(k==='COMPLET'){cs.push(String(r[k]||'').toUpperCase()==='SI'?'state-ok':'state-bad');}if(k==='FILL CANT.'||k==='FILL RENGL.'){const v=parseFloat(String(r[k]||'').replace('%',''));if(!isNaN(v)){if(v>=95)cs.push('fill-high');else if(v>=80)cs.push('fill-medium');else cs.push('fill-low');}}const cIdx=currentHeaders.indexOf(k);if(cIdx<4)cs.push(`col-fix-${cIdx+1}`);return`<td class="${cs.join(' ')}" style="${st}" data-ri="${ri}" data-col="${k}">${r[k]??''}</td>`;}).join('')}</tr>`).join('');}
  const totalPages=Math.ceil((data.total||0)/DEFAULT_PAGE_SIZE); const prev=Math.max(1,currentPage-1),next=Math.min(totalPages,currentPage+1);
  if(pgnEl)pgnEl.innerHTML=`<button onclick="renderTable(null,${prev})"${currentPage===1?' disabled':''}>« Ant</button><span>Pág ${currentPage}/${totalPages}</span><button onclick="renderTable(null,${next})"${currentPage===totalPages?' disabled':''}>Sig »</button>`;
  setTimeKpis(rawRows); if(window.updateTopScrollWidth)setTimeout(window.updateTopScrollWidth,80);
}

async function init(){
  updateStickyTop();
  const loadingEl=document.getElementById('paginacion'); if(loadingEl)loadingEl.innerHTML=`<span>Cargando datos...</span>`;
  try {
    const data = await jsonp(`${A}?route=dashboard.init&pageSize=${DEFAULT_PAGE_SIZE}&`+new URLSearchParams(getFilters()).toString()).then(r => r.data);
    populateFiltersFromMeta(data.meta);
    refreshKpisAndCharts(data.stats);
    renderQueueTable(data.queueMetrics);
    renderTable(data.table, 1);
  }catch(e){console.warn('init error',e);if(loadingEl)loadingEl.innerHTML=`<span style="color:red;">Error: ${e.message}</span>`;}
  setTimeout(updateStickyTop,200);
}

// ... (El resto de tu app.js: updateStickyTop, syncHScroll, listeners de botones y edición, etc. se mantiene igual)
// ... Pega aquí el resto de tu código app.js desde la función updateStickyTop() hasta el final.

// Esta es una versión parcial, asegúrate de pegar el resto de funciones que faltan.
// Por ejemplo:
// - updateStickyTop
// - syncHScroll
// - todos los addEventListener para los botones
// - la lógica de edición inline
// - la llamada final a init()

init(); // Llamar a la nueva función de inicialización
}

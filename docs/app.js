// app.js v2025-12-01a — KPIs/Charts desde stats, tabla paginada, login y edición
if (window.__APP_LOADED__) {
  console.log('app.js ya cargado, skip');
} else {
window.__APP_LOADED__ = true;
console.log('app.js v2025-12-01a');

const A = window.APP.A_URL;
const B = window.APP.B_URL;
const CLIENT_ID = window.APP.CLIENT_ID;

const ID_HEADER = 'F8 SALMI';
const N = s => String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\./g,'').replace(/\s+/g,' ').trim().toUpperCase();
const N_ID = N(ID_HEADER);

const DATE_FIELDS = ['ASIGNACIÓN','SALIDA','DESPACHO','FACTURACIÓN','EMPACADO','PROY. ENTREGA','ENTREGA REAL'];
const INT_FIELDS  = ['CANT. ASIG.','CANT. SOL.','RENGLONES ASI.','RENGLONES SOL.'];
const TXT_FIELDS  = ['COMENT.'];
const S_DATE = new Set(DATE_FIELDS.map(N));
const S_INT  = new Set(INT_FIELDS.map(N));
const S_TXT  = new Set(TXT_FIELDS.map(N));

let idToken=null, editMode=false;
let currentHeaders=[], currentRows=[], currentIdCol=null;

/* ------------ JSONP ------------ */
function jsonp(url){
  return new Promise((resolve,reject)=>{
    const cb='cb_'+Math.random().toString(36).slice(2);
    window[cb]=(payload)=>{ try{ resolve(payload); } finally{ delete window[cb]; s.remove(); } };
    const s=document.createElement('script'); s.onerror=()=>reject(new Error('network'));
    s.src=url+(url.includes('?')?'&':'?')+`callback=${cb}&_=${Date.now()}`;
    document.body.appendChild(s);
  });
}

/* ------------ Fechas ------------ */
const monES=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const isIsoZ = v => typeof v==='string' && /^\d{4}-\d{2}-\d{2}T/.test(v) && v.endsWith('Z');
const toDDMonYY = v => { const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(v); if(!m) return v; const [_,y,mn,d]=m; return `${d}-${monES[parseInt(mn,10)-1]}-${y.slice(-2)}`; };
const parseIsoDate  = v => { const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(v||''); return m ? new Date(Date.UTC(+m[1],+m[2]-1,+m[3])) : null; };

/* ------------ KPIs/Charts (stats) ------------ */
async function fetchStats(filters){
  const p=new URLSearchParams({route:'stats'});
  Object.entries(filters).forEach(([k,v])=>{ if(v) p.set(k,v); });
  const key=p.toString(); if(cacheOrders.has(key)) return cacheOrders.get(key);
  const res=await jsonp(`${A}?${p.toString()}`);
  if(res.status!=='ok') throw new Error(res.error||'stats_error');
  cacheOrders.set(key,res.data); return res.data;
}
function setKpis(k){
  const set=(id,v)=>{ const el=document.getElementById(id); if(el) el.textContent=(v==null?'—':(+v).toLocaleString()); };
  set('kpi-total', k.total);
  set('kpi-asignado', k.asignado);
  set('kpi-solicitado', k.solicitado);
  set('kpi-reng-asig', k.rengAsig);
  set('kpi-reng-sol', k.rengSol);
  const urg=document.getElementById('kpi-urg'), men=document.getElementById('kpi-men');
  if(urg) urg.textContent=(k.urg==null?'—':(+k.urg).toLocaleString());
  if(men) men.textContent=(k.mens==null?'—':(+k.mens).toLocaleString());
}
async function refreshKpisAndCharts(filters){
  const stats=await fetchStats(filters);
  setKpis(stats.kpis);
  if (window.renderChartsFromStats) window.renderChartsFromStats(stats);
}

/* ------------ Filtros ------------ */
function getFilters(){
  return {
    cat:    document.getElementById('fCat')?.value || '',
    unidad: document.getElementById('fUnidad')?.value || '',
    tipo:   document.getElementById('fTipo')?.value || '',
    grupo:  document.getElementById('fGrupo')?.value || '',
    estado: document.getElementById('fEstado')?.value || '',
    text:   document.getElementById('fBuscar')?.value || '',
    desde:  document.getElementById('fDesde')?.value || '',
    hasta:  document.getElementById('fHasta')?.value || ''
  };
}

/* ------------ Tabla y paginación ------------ */
function widthMap(){ return {
  'CATEG.':180,'UNIDAD':220,'TIPO':110,'F8 SALMI':120,'F8 SISCONI':120,'GRUPO':110,'SUSTANCIAS':160,
  'CANT. ASIG.':110,'CANT. SOL.':110,'RENGLONES ASI.':130,'RENGLONES SOL.':130,
  'FECHA F8':110,'RECIBO F8':110,'ASIGNACIÓN':110,'SALIDA':110,'DESPACHO':110,'FACTURACIÓN':120,'EMPACADO':110,
  'PROY. ENTREGA':130,'ENTREGA REAL':130,'INCOTERM':110,'ESTADO':130,'COMENT.':220,
  'TIEMPO':90,'COMPLET':100,'FILL CANT.':110,'FILL RENGL.':120
};}

function perRowMetrics(row){
  const complet = !!row['ENTREGA REAL'];
  const rec = row['RECIBO F8'] && parseIsoDate(row['RECIBO F8']);
  const end = row['ENTREGA REAL'] ? parseIsoDate(row['ENTREGA REAL']) : new Date();
  const days = (rec && end) ? Math.max(0, Math.round((end-rec)/86400000)) : '';
  const toNum = v => (typeof v==='number')?v: parseFloat(String(v||'').replace(',','.')) || 0;
  const asig = toNum(row['CANT. ASIG.']), sol  = toNum(row['CANT. SOL.']);
  const rasi = toNum(row['RENGLONES ASI.']), rsol = toNum(row['RENGLONES SOL.']);
  const fillCant = sol>0 ? Math.round((asig/sol)*100) : 0;
  const fillReng = rsol>0 ? Math.round((rasi/rsol)*100) : 0;
  return { TIEMPO: days ? `${days}d` : '', COMPLET: complet ? 'SI':'NO', 'FILL CANT.': `${fillCant}%`, 'FILL RENGL.': `${fillReng}%` };
}

const cacheOrders=new Map();
async function fetchTable(page, pageSize, filters){
  const p=new URLSearchParams({route:'orders.list', page, pageSize});
  Object.entries(filters).forEach(([k,v])=>{ if(v) p.set(k,v); });
  const key=p.toString(); if(cacheOrders.has(key)) return cacheOrders.get(key);
  const res=await jsonp(`${A}?${p.toString()}`);
  if(res.status!=='ok') throw new Error(res.error||'orders_error');
  cacheOrders.set(key,res.data); return res.data;
}


/* ------------ Poblado de filtros (sample 500) ------------ */
async function populateFilters(){
  const params=new URLSearchParams({route:'orders.list', page:1, pageSize:500});
  const res=await jsonp(`${A}?${params.toString()}`);
  if(res.status!=='ok') return;
  const rows=(res.data&&res.data.rows)||[];
  const norm = v => String(v==null?'':v).replace(/\s+/g,' ').trim();
  function setSel(id, vals, labelTodos){ 
    const el=document.getElementById(id); if(!el) return;
    const opts=Array.from(new Set(vals.map(norm).filter(Boolean))).sort((a,b)=>a.localeCompare(b,'es'));
    const first=el.value;
    el.innerHTML = `<option value="">${labelTodos||'Todas'}</option>` + opts.map(v=>`<option>${v}</option>`).join('');
    if(first && opts.includes(first)) el.value=first;
  }
  setSel('fCat',    rows.map(r=>r['CATEG.']));
  setSel('fUnidad', rows.map(r=>r['UNIDAD']));
  setSel('fTipo',   rows.map(r=>r['TIPO']), 'Todos');
  setSel('fGrupo',  rows.map(r=>r['GRUPO']));
  setSel('fEstado', rows.map(r=>r['ESTADO']||''));
}
async function renderTable(page=1){
  const pageSize=150, filters=getFilters();
  const data=await fetchTable(page, pageSize, filters);
  const rawRows=data.rows||[];
  const headers = data.header || (rawRows[0]?Object.keys(rawRows[0]):[]);
  const W=widthMap();

  currentHeaders = Array.from(new Set([
    ...headers,
    'TIEMPO', 'COMPLET', 'FILL CANT.', 'FILL RENGL.'
  ]));
  currentRows = rawRows.map(r=>{
    const out={...r};
    Object.keys(out).forEach(k=>{ if (isIsoZ(out[k])) out[k]=toDDMonYY(out[k]); });
    Object.assign(out, perRowMetrics(r));
    return out;
  });
  currentIdCol = headers.find(h=>N(h)===N_ID) || null;

  const thead=document.querySelector('#tabla thead');
  const tbody=document.querySelector('#tabla tbody');

  if (thead) {
    thead.innerHTML = `<tr>${
      currentHeaders.map(h => `<th data-col="${h}">${h}</th>`).join('')
    }</tr>`;
  }
  if (tbody) {
    tbody.innerHTML = currentRows.map((r,ri)=>`<tr>${
      currentHeaders.map(k=>{
        const kN=N(k);
        const editable = editMode && (S_DATE.has(kN) || S_INT.has(kN) || S_TXT.has(kN));
        const cls = editable ? ' class="editable"' : '';
        return `<td${cls} data-ri="${ri}" data-col="${k}">${r[k]??''}</td>`;
      }).join('')
    }</tr>`).join('');
  }

  const totalPages=Math.ceil((data.total||0)/pageSize);
  const prev=Math.max(1,page-1), next=Math.min(totalPages,page+1);
  const step=Math.max(1, Math.floor(100/pageSize)); // -/+100
  const minus100=Math.max(1, page - step);
  const plus100 =Math.min(totalPages, page + step);
  document.getElementById('paginacion').innerHTML =
    `<button onclick="renderTable(${prev})"${page===1?' disabled':''}>« Anterior</button>`+
    `<button onclick="renderTable(${minus100})">-100</button>`+
    `<span style="padding:4px 8px">Página ${page} / ${totalPages}</span>`+
    `<button onclick="renderTable(${plus100})">+100</button>`+
    `<button onclick="renderTable(${next})"${page===totalPages?' disabled':''}>Siguiente »</button>`;
  /* prefetch next */ if(page<totalPages){ fetchTable(page+1, pageSize, filters).catch(()=>{}); }
}

/* ------------ Edición inline ------------ */
document.querySelector('#tabla').addEventListener('click', async (ev)=>{
  const td=ev.target.closest('td.editable'); if(!td || !editMode) return;
  const ri=+td.dataset.ri, col=td.dataset.col, row=currentRows[ri];
  const idCol=currentIdCol, orderId=idCol?row[idCol]:null;
  if(!orderId){ alert(`No se encontró la columna ID (${ID_HEADER}).`); return; }

  const kN=N(col);
  const isDate=S_DATE.has(kN), isInt=S_INT.has(kN), isTxt=S_TXT.has(kN);
  if (td.querySelector('input')) return;

  const old=td.textContent; td.innerHTML='';
  const input=document.createElement('input'); input.style.width='100%'; input.style.boxSizing='border-box';
  if(isDate){ input.type='date'; }
  else if(isInt){ input.type='number'; input.step='1'; input.min='0'; const n=parseInt(old,10); if(!isNaN(n)) input.value=String(n); }
  else { input.type='text'; input.value=old||''; }
  const bS=document.createElement('button'); bS.textContent='Guardar'; bS.style.marginTop='4px';
  const bC=document.createElement('button'); bC.textContent='Cancelar'; bC.style.margin='4px 0 0 6px';
  const wrap=document.createElement('div'); wrap.appendChild(input);
  const btns=document.createElement('div'); btns.appendChild(bS); btns.appendChild(bC);
  td.appendChild(wrap); td.appendChild(btns); input.focus();
  bC.onclick=()=>{ td.innerHTML=old; };

  bS.onclick=async ()=>{
    if(!idToken){ alert('Primero haz clic en “Acceder”.'); return; }
    let value=input.value.trim();
    if(isDate && !/^\d{4}-\d{2}-\d{2}$/.test(value)){ alert('Fecha inválida (YYYY-MM-DD).'); return; }
    if(isInt && !/^-?\d+$/.test(value)){ alert('Ingresa un entero.'); return; }
    if(isTxt && value.length>500){ alert('Comentario muy largo (≤500).'); return; }

    td.innerHTML='Guardando…';
    try{
      const res=await jsonp(`${B}?route=orders.update&idToken=${encodeURIComponent(idToken)}&id=${encodeURIComponent(orderId)}&field=${encodeURIComponent(col)}&value=${encodeURIComponent(value)}`);
      if(res.status==='ok'){
        td.textContent = (isDate && /^\d{4}-\d{2}-\d{2}$/.test(value))
          ? (()=>{ const [y,m,d]=value.split('-'); const mon=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'][+m-1]; return `${d}-${mon}-${y.slice(2)}`; })()
          : value;
        await refreshKpis(getFilters()); requestAnimationFrame(()=>{ refreshCharts(getFilters()); });
        const m=document.querySelector('#paginacion span')?.textContent.match(/Página (\d+)/); const cur=m?+m[1]:1;
        await renderTable(cur);
      } else { td.innerHTML=old; alert('Error: '+(res.error||'desconocido')); }
    }catch(e){ td.innerHTML=old; alert('Error de red'); }
  };
});

/* ------------ Login / edición ------------ */
const btnLogin = document.getElementById('btnLogin');
const btnEditMode = document.getElementById('btnEditMode');

function ensureGsi(){
  if (window.google && google.accounts && google.accounts.id) return true;
  alert('Falta la librería de Google Identity. Verifica <script src="https://accounts.google.com/gsi/client"> en index.html');
  return false;
}
btnLogin?.addEventListener('click', ()=>{
  if (!ensureGsi()) return;
  google.accounts.id.initialize({
    client_id: CLIENT_ID,
    callback: (resp)=>{ idToken=resp.credential; btnEditMode.disabled=false; btnLogin.textContent='Sesión iniciada'; alert('Sesión iniciada. Activa “Modo edición”.'); }
  });
  google.accounts.id.prompt(); // one-tap
});

btnEditMode?.addEventListener('click', ()=>{
  editMode=!editMode;
  btnEditMode.textContent=`Modo edición: ${editMode?'ON':'OFF'}`;
});

/* ------------ Botones ------------ */
document.getElementById('btnApply')?.addEventListener('click', async ()=>{
  await refreshKpis(getFilters()); requestAnimationFrame(()=>{ refreshCharts(getFilters()); }); await renderTable(1);
});
document.getElementById('btnClear')?.addEventListener('click', async ()=>{
  ['fCat','fUnidad','fTipo','fGrupo','fEstado','fBuscar','fDesde','fHasta'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  await refreshKpis(getFilters()); requestAnimationFrame(()=>{ refreshCharts(getFilters()); }); await renderTable(1);
});
document.getElementById('btnRefresh')?.addEventListener('click', async ()=>{
  await refreshKpis(getFilters()); requestAnimationFrame(()=>{ refreshCharts(getFilters()); });
  const m=document.querySelector('#paginacion span')?.textContent.match(/Página (\d+)/); const cur=m?+m[1]:1;
  await renderTable(cur);
});

/* ------------ Scroll superior sincronizado ------------ */
(function syncHScroll(){
  const topBar=document.getElementById('top-scroll');
  const tw=document.querySelector('.table-wrap');
  if(!topBar||!tw) return;
  topBar.innerHTML = `<div style="width:${Math.max(tw.scrollWidth, tw.clientWidth)}px;height:1px"></div>`;
  let lock=false;
  topBar.addEventListener('scroll', ()=>{ if(lock) return; lock=true; tw.scrollLeft=topBar.scrollLeft; lock=false; });
  tw.addEventListener('scroll',     ()=>{ if(lock) return; lock=true; topBar.scrollLeft=tw.scrollLeft; lock=false; });
})();

/* ------------ Init ------------ */
async function init(){
  // stickyTop: SOLO header azul
  const headerEl = document.querySelector('.app-header');
  const stickyTopPx = (headerEl?.offsetHeight || 64);
  document.documentElement.style.setProperty('--stickyTop', stickyTopPx + 'px');

  await refreshKpis(getFilters()); requestAnimationFrame(()=>{ refreshCharts(getFilters()); });
  await renderTable(1);
}
init();

} // guard

async function refreshKpis(filters){ const st=await fetchStats(filters); setKpis(st.kpis); }
async function refreshCharts(filters){ const st=await fetchStats(filters); await renderCharts(st); }

async function renderCharts(st){ console.warn('renderCharts no definida; stats:', st); }
// --- parche runtime ---
window.renderTable = (typeof renderTable === 'function') ? renderTable : function(){ console.warn('renderTable no disponible'); };
window.renderCharts = window.renderCharts || (async function(){ /* noop: evita error si no hay charts */ });


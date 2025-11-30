// v2025-11-30f — usa stats cuando existe; si no, fallback progresivo con orders.list
console.log('app.js v2025-11-30f');

const A = window.APP.A_URL;
const B = window.APP.B_URL;
const CLIENT_ID = window.APP.CLIENT_ID;

const ID_HEADER = 'F8 SALMI';
const EDITABLE_DATE_FIELDS = ['ASIGNACIÓN','SALIDA','DESPACHO','FACTURACIÓN','EMPACADO','PROY. ENTREGA','ENTREGA REAL'];
const EDITABLE_INT_FIELDS  = ['CANT. ASIG.','CANT. SOL.','RENGLONES ASI.','RENGLONES SOL.'];
const EDITABLE_TEXT_FIELDS = ['COMENT.'];

function normalizeName(s){return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\./g,'').replace(/\s+/g,' ').trim().toUpperCase();}
const N_ID_HEADER     = normalizeName(ID_HEADER);
const N_EDITABLE_DATE = new Set(EDITABLE_DATE_FIELDS.map(normalizeName));
const N_EDITABLE_INT  = new Set(EDITABLE_INT_FIELDS.map(normalizeName));
const N_EDITABLE_TEXT = new Set(EDITABLE_TEXT_FIELDS.map(normalizeName));

let idToken = null, editMode = false;
let currentHeaders=[], currentRows=[], currentIdColName=null;
let ALL_ROWS=[], FILTERED_ROWS=[]; // solo para tabla local cuando haga falta

/* ================= JSONP helpers ================= */
function jsonp(url){
  return new Promise((resolve,reject)=>{
    const cb = 'cb_' + Math.random().toString(36).slice(2);
    window[cb] = (payload)=>{ try{ resolve(payload); } finally{ delete window[cb]; s.remove(); } };
    const s = document.createElement('script'); s.onerror = ()=>reject(new Error('network'));
    s.src = url + (url.includes('?')?'&':'?') + `callback=${cb}&_=${Date.now()}`;
    document.body.appendChild(s);
  });
}

/* ================= Fechas y formato ================= */
function isIsoDateTimeZ(v){ return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) && v.endsWith('Z'); }
function formatIsoToDDMonYY(v){
  const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(v); if(!m) return v;
  const [_,y,mn,d]=m; const mon=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'][parseInt(mn,10)-1];
  return `${d}-${mon}-${y.slice(-2)}`;
}
function formatAllIsoDatesInRow(row){ const out={...row}; for(const k of Object.keys(out)) if(isIsoDateTimeZ(out[k])) out[k]=formatIsoToDDMonYY(out[k]); return out; }

// parsea 'YYYY-MM-DD', 'YYYY-MM-DDT..Z' o 'dd-mmm-yy'
function parseAnyDateStr(s){
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10);
  const m = /^(\d{1,2})-([a-z]{3})-(\d{2})$/i.exec(s);
  if (m){ const map={ene:1,feb:2,mar:3,abr:4,may:5,jun:6,jul:7,ago:8,sep:9,oct:10,nov:11,dic:12};
    const dd=String(m[1]).padStart(2,'0'); const mm=String(map[m[2].toLowerCase()]||1).padStart(2,'0'); const yy='20'+m[3];
    return `${yy}-${mm}-${dd}`;
  }
  return '';
}

/* ================= KPIs texto arriba ================= */
function renderKpisText(d){ const el=document.getElementById('kpis'); if(el) el.textContent = `Total pedidos: ${d.totalPedidos}`; }

/* ================= Stats (camino rápido del servidor) ================= */
async function fetchStats(filters){
  const p = new URLSearchParams({route:'stats'});
  Object.entries(filters).forEach(([k,v])=>{ if(v) p.set(k,v); });
  const res = await jsonp(`${A}?${p.toString()}`);
  if (res.status!=='ok') throw new Error(res.error||'stats_error');
  return res.data;
}
function setKpis(k){
  const set = (id, v)=>{ const el=document.getElementById(id); if(el) el.textContent = (v==null?'—':(+v).toLocaleString()); };
  set('kpi-total', k.total);
  set('kpi-asignado', k.asignado);
  set('kpi-solicitado', k.solicitado);
  set('kpi-reng-asig', k.rengAsig);
  set('kpi-reng-sol', k.rengSol);
  const urg = document.getElementById('kpi-urg'), men = document.getElementById('kpi-men');
  if (urg) urg.textContent = (k.urg==null?'—':(+k.urg).toLocaleString());
  if (men) men.textContent = (k.mens==null?'—':(+k.mens).toLocaleString());
}
async function refreshKpisAndCharts(filters){
  try{
    const stats = await fetchStats(filters);
    setKpis(stats.kpis);
    window.renderChartsFromStats(stats); // metrics.js
  }catch(err){
    console.warn('stats no disponible, usando fallback local:', err.message||err);
    await fallbackAggregateWithOrdersList(filters);
  }
}

/* ================= Tabla paginada (siempre desde servidor) ================= */
function getCurrentFilters(){
  return {
    cat:   document.getElementById('fCat')?.value || '',
    unidad:document.getElementById('fUnidad')?.value || '',
    tipo:  document.getElementById('fTipo')?.value || '',
    grupo: document.getElementById('fGrupo')?.value || '',
    estado:document.getElementById('fEstado')?.value || '',
    text:  document.getElementById('fBuscar')?.value || '',
    desde: document.getElementById('fDesde')?.value || '',
    hasta: document.getElementById('fHasta')?.value || ''
  };
}
async function fetchTablePage(page, pageSize, filters){
  const p = new URLSearchParams({route:'orders.list', page, pageSize});
  Object.entries(filters).forEach(([k,v])=>{ if(v) p.set(k,v); });
  const res = await jsonp(`${A}?${p.toString()}`);
  if (res.status!=='ok') throw new Error(res.error||'orders_error');
  return res.data;
}
function headerWidthMap(){ return {
  'CATEG.':180,'UNIDAD':220,'TIPO':110,'F8 SALMI':120,'F8 SISCONI':120,'GRUPO':100,'SUSTANCIAS':150,
  'CANT. ASIG.':100,'CANT. SOL.':100,'RENGLONES ASI.':120,'RENGLONES SOL.':120,
  'FECHA F8':110,'RECIBO F8':110,'ASIGNACIÓN':110,'SALIDA':110,'DESPACHO':110,'FACTURACIÓN':110,'EMPACADO':110,
  'PROY. ENTREGA':120,'ENTREGA REAL':120,'INCOTERM':110,'ESTADO':120,'COMENT.':220,'TIEMPO':90,
  'COMPLET':100,'FILL CANT.':100,'FILL RENGL.':110
};}
async function renderTable(page=1){
  const pageSize = 150;
  const filters = getCurrentFilters();
  const data = await fetchTablePage(page, pageSize, filters);

  const rows = data.rows || [];
  const headers = data.header || (rows[0]? Object.keys(rows[0]) : []);
  currentHeaders=headers; currentRows=rows.map(r=>({...r}));
  currentIdColName = headers.find(h=>normalizeName(h)===N_ID_HEADER)||null;

  const widths = headerWidthMap();
  const head = document.querySelector('#tabla thead');
  const body = document.querySelector('#tabla tbody');

  head.innerHTML = headers.length ? `<tr>${headers.map(h=>`<th data-col="${h}" style="width:${widths[h]||120}px">${h}</th>`).join('')}</tr>` : '';
  const rowsFmt = rows.map(formatAllIsoDatesInRow);
  body.innerHTML = rowsFmt.map((r, ri)=>`<tr>${
    headers.map(k=>{
      const keyNorm=normalizeName(k);
      const editableDate=editMode && N_EDITABLE_DATE.has(keyNorm);
      const editableInt=editMode && N_EDITABLE_INT.has(keyNorm);
      const editableText=editMode && N_EDITABLE_TEXT.has(keyNorm);
      const classes=(editableDate||editableInt||editableText)?' class="editable"':'';
      const w=widths[k]||120;
      return `<td${classes} data-ri="${ri}" data-col="${k}" style="width:${w}px">${r[k]??''}</td>`;
    }).join('')
  }</tr>`).join('');

  const totalPages=Math.ceil((data.total||0)/pageSize);
  const prev=Math.max(1,page-1), next=Math.min(totalPages,page+1);
  const jump=Math.max(1, Math.round(100/pageSize));
  const minus100=Math.max(1,page-jump), plus100=Math.min(totalPages,page+jump);

  document.getElementById('paginacion').innerHTML =
    `<button onclick="renderTable(${prev})"${page===1?' disabled':''}>« Anterior</button>`+
    `<button onclick="renderTable(${minus100})">-100</button>`+
    `<span style="padding:4px 8px">Página ${page} / ${totalPages}</span>`+
    `<button onclick="renderTable(${plus100})">+100</button>`+
    `<button onclick="renderTable(${next})"${page===totalPages?' disabled':''}>Siguiente »</button>`;
}

/* ================= Edición inline ================= */
document.querySelector('#tabla').addEventListener('click', async (ev)=>{
  const td = ev.target.closest('td.editable'); if (!td || !editMode) return;
  const ri=+td.dataset.ri, col=td.dataset.col, row=currentRows[ri];
  const orderId=currentIdColName?row[currentIdColName]:null;
  if(!orderId){ alert(`No se encontró la columna ID (${ID_HEADER}) en la fila.`); return; }

  const keyNorm=normalizeName(col);
  const isDate=N_EDITABLE_DATE.has(keyNorm), isInt=N_EDITABLE_INT.has(keyNorm), isText=N_EDITABLE_TEXT.has(keyNorm);
  if (td.querySelector('input')) return;

  const oldDisplay = td.textContent; td.innerHTML='';
  const input=document.createElement('input'); input.style.width='100%'; input.style.boxSizing='border-box';
  if (isDate){ input.type='date'; }
  else if (isInt){ input.type='number'; input.step='1'; input.min='0'; const n=parseInt(oldDisplay,10); if(!isNaN(n)) input.value=String(n); }
  else if (isText){ input.type='text'; input.value=oldDisplay||''; }
  const saveBtn=document.createElement('button'); saveBtn.textContent='Guardar'; saveBtn.style.marginTop='4px';
  const cancelBtn=document.createElement('button'); cancelBtn.textContent='Cancelar'; cancelBtn.style.margin='4px 0 0 6px';

  const wrap=document.createElement('div'); wrap.appendChild(input);
  const btns=document.createElement('div'); btns.appendChild(saveBtn); btns.appendChild(cancelBtn);
  td.appendChild(wrap); td.appendChild(btns); input.focus();
  cancelBtn.onclick=()=>{ td.innerHTML=oldDisplay; };

  saveBtn.onclick=async ()=>{
    if (!idToken){ alert('Primero haz clic en “Acceder”.'); return; }
    let value=input.value.trim();
    if (isDate && !/^\d{4}-\d{2}-\d{2}$/.test(value)){ alert('Selecciona fecha válida (YYYY-MM-DD).'); return; }
    if (isInt && !/^-?\d+$/.test(value)){ alert('Ingresa un número entero.'); return; }
    if (isText && value.length>500){ alert('Comentario muy largo (máx. 500).'); return; }

    td.innerHTML='Guardando…';
    const url = `${B}?route=orders.update&idToken=${encodeURIComponent(idToken)}&id=${encodeURIComponent(orderId)}&field=${encodeURIComponent(col)}&value=${encodeURIComponent(value)}`;
    try{
      const res=await jsonp(url);
      if(res.status==='ok'){
        if(isDate){ const [y,m,d]=value.split('-'); const mon=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'][parseInt(m,10)-1]; td.textContent=`${d}-${mon}-${y.slice(2)}`; }
        else { td.textContent=value; }
        // Actualiza KPIs+gráficos (stats o fallback) y recarga la página actual
        await refreshKpisAndCharts(getCurrentFilters());
        const pagText=document.querySelector('#paginacion span')?.textContent||'Página 1 / 1';
        const m=pagText.match(/Página (\d+)/); const cur=m?+m[1]:1;
        await renderTable(cur);
      } else { td.innerHTML=oldDisplay; alert('Error: '+(res.error||'desconocido')); }
    }catch(e){ td.innerHTML=oldDisplay; alert('Error de red'); }
  };
});

/* ================= Login + edición ================= */
const btnLogin=document.getElementById('btnLogin'); const btnEditMode=document.getElementById('btnEditMode');
function renderGoogleButton(){
  if(!window.google||!google.accounts||!google.accounts.id){ setTimeout(renderGoogleButton,200); return; }
  google.accounts.id.initialize({client_id:CLIENT_ID, callback:(resp)=>{ idToken=resp.credential; btnEditMode.disabled=false; btnLogin.textContent='Sesión iniciada'; alert('Sesión iniciada. Activa “Modo edición”.'); }});
}
btnLogin.onclick=()=>{ renderGoogleButton(); };
btnEditMode.onclick=()=>{ editMode=!editMode; btnEditMode.textContent=`Modo edición: ${editMode?'ON':'OFF'}`; };

/* ================= Botones filtros/refresh ================= */
document.getElementById('btnApply').onclick = async ()=>{
  await refreshKpisAndCharts(getCurrentFilters());
  await renderTable(1);
};
document.getElementById('btnClear').onclick = async ()=>{
  ['fCat','fUnidad','fTipo','fGrupo','fEstado','fBuscar','fDesde','fHasta'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  await refreshKpisAndCharts(getCurrentFilters());
  await renderTable(1);
};
document.getElementById('btnRefresh').onclick = async ()=>{
  await refreshKpisAndCharts(getCurrentFilters());
  const pagText=document.querySelector('#paginacion span')?.textContent||'Página 1 / 1';
  const m=pagText.match(/Página (\d+)/); const cur=m?+m[1]:1;
  await renderTable(cur);
};

/* ================= Sticky + scroll sync ================= */
function updateStickyTop(){
  const hdr = document.querySelector('.app-header');
  const kpis = document.getElementById('kpis-compact');
  const filt = document.getElementById('filters');
  const h = (hdr?.offsetHeight||0) + (kpis?.offsetHeight||0) + (filt?.offsetHeight||0) + 10;
  document.documentElement.style.setProperty('--stickyTop', h + 'px');
}
window.addEventListener('resize', updateStickyTop);
(function syncHScroll(){
  const topBar = document.getElementById('top-scroll');
  const tw = document.querySelector('.table-wrap');
  if (!topBar || !tw) return;
  let locking = false;
  topBar.addEventListener('scroll', ()=>{ if(locking) return; locking=true; tw.scrollLeft = topBar.scrollLeft; locking=false; });
  tw.addEventListener('scroll', ()=>{ if(locking) return; locking=true; topBar.scrollLeft = tw.scrollLeft; locking=false; });
})();

/* ================= Fallback local (si no hay stats) ================= */
function deriveStageLocal(r){
  const has = k => !!parseAnyDateStr(r[k]);
  if (has('ENTREGA REAL'))     return 'ENTREGADA';
  if (has('EMPACADO'))         return 'EMPACADO';
  if (has('FACTURACIÓN'))      return 'FACTURADO';
  if (has('DESPACHO') || has('SALIDA')) return 'SALIDA DE SALMI';
  if (has('ASIGNACIÓN'))       return 'EN ASIGNACIÓN';
  if (has('RECIBO F8'))        return 'F8 RECIBIDA';
  return 'SIN ESTADO';
}
function computeStatsFromRows(rows, totalFromKpis){
  // KPIs
  const num = v => (typeof v==='number') ? v : (parseFloat(String(v||'').replace(',','.'))||0);
  let asignado=0, solicitado=0, rengAsig=0, rengSol=0, urg=0, mens=0;
  rows.forEach(r=>{
    asignado+=num(r['CANT. ASIG.']); solicitado+=num(r['CANT. SOL.']);
    rengAsig+=num(r['RENGLONES ASI.']); rengSol+=num(r['RENGLONES SOL.']);
    const t=String(r['TIPO']||'').toUpperCase(); if (t.includes('URG')) urg++; else mens++;
  });
  const kpis = { total: totalFromKpis ?? rows.length, asignado, solicitado, rengAsig, rengSol, urg, mens };

  // Series
  const inc=(m,k)=>{ if(!k) return; m[k]=(m[k]||0)+1; };
  const rec={}, comp={}, proj={};
  rows.forEach(r=> inc(rec,  parseAnyDateStr(r['RECIBO F8'])));
  rows.forEach(r=> inc(comp, parseAnyDateStr(r['ENTREGA REAL'])));
  rows.forEach(r=> inc(proj, parseAnyDateStr(r['PROY. ENTREGA'])));
  const labels = Array.from(new Set([...Object.keys(rec),...Object.keys(comp),...Object.keys(proj)])).sort();
  const series = { labels, recibidos:labels.map(d=>rec[d]||0), completados:labels.map(d=>comp[d]||0), proyectados:labels.map(d=>proj[d]||0) };

  // Donut y grupos
  const distEstados={}; const grupos={};
  rows.forEach(r=>{
    const st = deriveStageLocal(r);
    distEstados[st]=(distEstados[st]||0)+1;
    const g = r['GRUPO']||'SIN GRUPO';
    if(!grupos[g]) grupos[g]={ total:0 };
    grupos[g].total++; grupos[g][st]=(grupos[g][st]||0)+1;
  });

  return { kpis, series, distEstados, grupos };
}

async function fallbackAggregateWithOrdersList(filters){
  // consigue total del KPI de servidor (rápido) para mostrarlo ya
  try{
    const k = await jsonp(`${A}?route=kpis`);
    if (k.status==='ok') renderKpisText(k.data);
  }catch(_){}

  const PAGE_SIZE=500, MAX_PAGES=20; // 10k filas máx en fallback para no congelar
  let all=[];
  for (let page=1; page<=MAX_PAGES; page++){
    const p = new URLSearchParams({route:'orders.list', page, pageSize:PAGE_SIZE});
    Object.entries(filters).forEach(([k,v])=>{ if(v) p.set(k,v); });
    const res = await jsonp(`${A}?${p.toString()}`);
    if (res.status!=='ok') break;
    const rows = res.data.rows||[];
    all.push(...rows);
    if (rows.length<PAGE_SIZE) break;
    await new Promise(r=>setTimeout(r,0)); // cede el hilo
  }
  ALL_ROWS = all; FILTERED_ROWS = ALL_ROWS.slice(); // para filtros locales, por si los usamos

  const totalFromKpis = (typeof kpisCache!=='undefined' && kpisCache) ? kpisCache.totalPedidos : undefined;
  const stats = computeStatsFromRows(ALL_ROWS, totalFromKpis);
  setKpis(stats.kpis);
  window.renderChartsFromStats(stats);
}

/* ================= Filtros UI (invocan stats o fallback) ================= */
document.getElementById('btnApply').onclick = async ()=>{
  await refreshKpisAndCharts(getCurrentFilters());
  await renderTable(1);
};
document.getElementById('btnClear').onclick = async ()=>{
  ['fCat','fUnidad','fTipo','fGrupo','fEstado','fBuscar','fDesde','fHasta'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  await refreshKpisAndCharts(getCurrentFilters());
  await renderTable(1);
};
document.getElementById('btnRefresh').onclick = async ()=>{
  await refreshKpisAndCharts(getCurrentFilters());
  const pagText=document.querySelector('#paginacion span')?.textContent||'Página 1 / 1';
  const m=pagText.match(/Página (\d+)/); const cur=m?+m[1]:1;
  await renderTable(cur);
};

/* ================= Login/Edición ================= */
const btnLogin=document.getElementById('btnLogin'); const btnEditMode=document.getElementById('btnEditMode');
function renderGoogleButton(){
  if(!window.google||!google.accounts||!google.accounts.id){ setTimeout(renderGoogleButton,200); return; }
  google.accounts.id.initialize({client_id:CLIENT_ID, callback:(resp)=>{ idToken=resp.credential; btnEditMode.disabled=false; btnLogin.textContent='Sesión iniciada'; alert('Sesión iniciada. Activa “Modo edición”.'); }});
}
btnLogin.onclick=()=>{ renderGoogleButton(); };
btnEditMode.onclick=()=>{ editMode=!editMode; btnEditMode.textContent=`Modo edición: ${editMode?'ON':'OFF'}`; };

/* ================= Sticky + scroll sync ================= */
function updateStickyTop(){
  const hdr = document.querySelector('.app-header');
  const kpis = document.getElementById('kpis-compact');
  const filt = document.getElementById('filters');
  const h = (hdr?.offsetHeight||0) + (kpis?.offsetHeight||0) + (filt?.offsetHeight||0) + 10;
  document.documentElement.style.setProperty('--stickyTop', h + 'px');
}
window.addEventListener('resize', updateStickyTop);
(function syncHScroll(){
  const topBar = document.getElementById('top-scroll');
  const tw = document.querySelector('.table-wrap');
  if (!topBar || !tw) return;
  let locking = false;
  topBar.addEventListener('scroll', ()=>{ if(locking) return; locking=true; tw.scrollLeft = topBar.scrollLeft; locking=false; });
  tw.addEventListener('scroll', ()=>{ if(locking) return; locking=true; topBar.scrollLeft = tw.scrollLeft; locking=false; });
})();

/* ================= Init ================= */
async function init(){
  updateStickyTop();

  // pinta “Total pedidos: …” de inmediato
  try{
    const k = await jsonp(`${A}?route=kpis`);
    if (k.status==='ok'){ renderKpisText(k.data); window.kpisCache=k.data; }
  }catch(_){}

  // intenta stats -> si falla, fallback local
  await refreshKpisAndCharts(getCurrentFilters());
  await renderTable(1);
}
init();

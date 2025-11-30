// v2025-11-30c (loader robusto con paginación real y guardas)
console.log('app.js v2025-11-30c');

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

let ALL_ROWS=[], FILTERED_ROWS=[];
const FIELDS_FOR_FILTERS = { categoria: 'CATEG.', unidad: 'UNIDAD', tipo: 'TIPO', grupo: 'GRUPO' };

/* -----------------------------------------
   Helpers de JSONP y utilidades de carga
----------------------------------------- */
function jsonp(url, cbName){
  return new Promise((resolve,reject)=>{
    const cb = cbName || ('cb_' + Math.random().toString(36).slice(2));
    window[cb] = (payload)=>{ try{ resolve(payload); } finally{ delete window[cb]; s.remove(); } };
    const s = document.createElement('script');
    s.onerror = reject;
    s.src = url + (url.includes('?')?'&':'?') + `callback=${cb}&_=${Date.now()}`;
    document.body.appendChild(s);
  });
}

// JSONP con callback explícito (para trazar por página)
function jsonpWithCb(url, cbName){
  return new Promise((resolve, reject)=>{
    window[cbName] = (payload)=>{ try{ resolve(payload); } finally{ delete window[cbName]; s.remove(); } };
    const s = document.createElement('script'); s.onerror = reject;
    s.src = url + (url.includes('?')?'&':'?') + `callback=${cbName}&_=${Date.now()}`;
    document.body.appendChild(s);
  });
}

// pinta "Total pedidos: N" y devuelve el total desde KPIs
async function fetchKpisAndGetTotal(){
  const cb = 'onKpis_' + Math.random().toString(36).slice(2);
  const res = await jsonpWithCb(`${A}?route=kpis`, cb);
  renderKpis(res.data || {});
  return (res.data && res.data.totalPedidos) ? res.data.totalPedidos : 0;
}

// trae una página de órdenes (el backend entrega 500 por página)
async function fetchOrdersPage(page, pageSize){
  const cb = 'onOrders_' + page + '_' + Math.random().toString(36).slice(2);
  const res = await jsonpWithCb(`${A}?route=orders.list&page=${page}&pageSize=${pageSize}`, cb);
  const rows = (res && res.data && res.data.rows) ? res.data.rows : [];
  console.log(`[orders.list] page=${page} rows=${rows.length}`);
  return rows;
}

/* -----------------------------------------
   Formatos y visual
----------------------------------------- */
function isIsoDateTimeZ(v){ return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) && v.endsWith('Z'); }
function formatIsoToDDMonYY(v){ const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(v); if(!m) return v; const [_,y,mn,d]=m; const mon=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'][parseInt(mn,10)-1]; return `${d}-${mon}-${y.slice(-2)}`; }
function formatAllIsoDatesInRow(row){ const out={...row}; for(const k of Object.keys(out)) if(isIsoDateTimeZ(out[k])) out[k]=formatIsoToDDMonYY(out[k]); return out; }

function renderKpis(d){ const el=document.getElementById('kpis'); if(el) el.textContent = `Total pedidos: ${d.totalPedidos}`; }

/* -----------------------------------------
   Loader robusto (no cuelga si no hay paginación real)
----------------------------------------- */
async function loadMetricsAll(){
  const PAGE_SIZE = 500; // el backend devuelve 500
  const total = await fetchKpisAndGetTotal();

  // límite de páginas por seguridad (ej. 16581 → 34 + 2 = 36; cap a 100)
  const maxPages = Math.min(Math.ceil((total||0)/PAGE_SIZE) + 2, 100);

  let all = [];
  let lastFirstId = null;
  let repeatedFirst = 0;

  for (let page = 1; page <= maxPages; page++){
    const rows = await fetchOrdersPage(page, PAGE_SIZE);

    if (!rows.length) break;

    // detección de backend sin paginado (misma primera fila)
    const firstId = rows[0]?.[ID_HEADER] || JSON.stringify(rows[0]);
    if (firstId && firstId === lastFirstId){
      repeatedFirst++;
      if (repeatedFirst >= 2){
        console.warn('Backend no pagina (repite la misma página). Detengo la carga masiva.');
        break;
      }
    } else {
      repeatedFirst = 0;
    }
    lastFirstId = firstId;

    all.push(...rows);
    if (rows.length < PAGE_SIZE) break; // última página real
  }

  // deduplicación por ID para evitar duplicados si hubo repetición
  const uniq = new Map();
  for (const r of all){
    const id = r?.[ID_HEADER] || JSON.stringify(r);
    if (!uniq.has(id)) uniq.set(id, r);
  }
  ALL_ROWS = Array.from(uniq.values());
  FILTERED_ROWS = ALL_ROWS.slice();

  console.log(`Carga completada: ${ALL_ROWS.length} filas (total esperado: ${total}).`);

  computeAndRenderMetrics(ALL_ROWS, FILTERED_ROWS);
  initFilterOptions();
  renderTableFromFiltered(1);
}

/* -----------------------------------------
   Filtros
----------------------------------------- */
function initFilterOptions(){
  const rows = ALL_ROWS;
  const uniq = (arr)=> Array.from(new Set(arr.map(v=> (v==null?'':String(v)).trim()).filter(Boolean))).sort();
  const fill = (id, values)=>{
    const sel=document.getElementById(id); if(!sel) return;
    const cur=sel.value;
    sel.innerHTML = `<option value="">${id==='fCat'?'Todas':'Todos'}</option>` + values.map(v=>`<option>${v}</option>`).join('');
    if (cur) sel.value = cur;
  };
  fill('fCat',   uniq(rows.map(r=>r[FIELDS_FOR_FILTERS.categoria])));
  fill('fUnidad',uniq(rows.map(r=>r[FIELDS_FOR_FILTERS.unidad])));
  fill('fTipo',  uniq(rows.map(r=>r[FIELDS_FOR_FILTERS.tipo])));
  fill('fGrupo', uniq(rows.map(r=>r[FIELDS_FOR_FILTERS.grupo])));
  // Estado se genera en metrics.js -> deriveStage; lo poblamos desde computeAndRender si lo necesitas.
}

function applyFilters(){
  const cat=fCat.value, uni=fUnidad.value, tip=fTipo.value, gru=fGrupo.value, est=fEstado.value;
  const txt=(fBuscar.value||'').trim().toLowerCase();
  const desde=fDesde.value, hasta=fHasta.value;

  const inRange = (row)=>{
    if (!desde && !hasta) return true;
    const d=(row['FECHA F8']||row['RECIBO F8']||'').slice(0,10);
    if (desde && d < desde) return false;
    if (hasta && d > hasta) return false;
    return true;
  };

  FILTERED_ROWS = ALL_ROWS.filter(r=>{
    if (cat && r[FIELDS_FOR_FILTERS.categoria]!==cat) return false;
    if (uni && r[FIELDS_FOR_FILTERS.unidad]!==uni)   return false;
    if (tip && r[FIELDS_FOR_FILTERS.tipo]!==tip)     return false;
    if (gru && r[FIELDS_FOR_FILTERS.grupo]!==gru)    return false;
    if (est && deriveStage(r)!==est)                 return false;
    if (txt && !Object.values(r).some(v=> String(v||'').toLowerCase().includes(txt))) return false;
    if (!inRange(r)) return false;
    return true;
  });

  computeAndRenderMetrics(ALL_ROWS, FILTERED_ROWS);
  renderTableFromFiltered(1);
}
function clearFilters(){
  ['fCat','fUnidad','fTipo','fGrupo','fEstado','fBuscar','fDesde','fHasta'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  FILTERED_ROWS = ALL_ROWS.slice();
  computeAndRenderMetrics(ALL_ROWS, FILTERED_ROWS);
  renderTableFromFiltered(1);
}

/* -----------------------------------------
   Tabla (segmentada 150 por página)
----------------------------------------- */
function headerWidthMap(){ return {
  'CATEG.':180,'UNIDAD':220,'TIPO':110,'F8 SALMI':120,'F8 SISCONI':120,'GRUPO':100,'SUSTANCIAS':150,
  'CANT. ASIG.':100,'CANT. SOL.':100,'RENGLONES ASI.':120,'RENGLONES SOL.':120,
  'FECHA F8':110,'RECIBO F8':110,'ASIGNACIÓN':110,'SALIDA':110,'DESPACHO':110,'FACTURACIÓN':110,'EMPACADO':110,
  'PROY. ENTREGA':120,'ENTREGA REAL':120,'INCOTERM':110,'ESTADO':120,'COMENT.':220,'TIEMPO':90,
  'COMPLET':100,'FILL CANT.':100,'FILL RENGL.':110
};}

function renderTableFromFiltered(page){
  const pageSize = 150;
  const start = (page-1)*pageSize;
  const chunk = FILTERED_ROWS.slice(start, start+pageSize).map(r=>({ ...r, ...derivePerRow(r) }));
  const headers = chunk.length ? Object.keys(chunk[0]) : [];
  currentHeaders=headers; currentRows=chunk.map(r=>({...r})); currentIdColName = headers.find(h=>normalizeName(h)===N_ID_HEADER)||null;

  const widths = headerWidthMap();
  const head = document.querySelector('#tabla thead');
  const body = document.querySelector('#tabla tbody');

  head.innerHTML = headers.length ? `<tr>${headers.map(h=>`<th data-col="${h}" style="width:${widths[h]||120}px">${h}</th>`).join('')}</tr>` : '';
  const rowsFmt = chunk.map(formatAllIsoDatesInRow);
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

  const totalPages=Math.ceil(FILTERED_ROWS.length/pageSize);
  const jump=Math.max(1, Math.round(100/pageSize)); const prev=Math.max(1,page-1); const next=Math.min(totalPages,page+1);
  const minus100=Math.max(1,page-jump); const plus100=Math.min(totalPages,page+jump);

  document.getElementById('paginacion').innerHTML =
    `<button onclick="renderTableFromFiltered(${prev})"${page===1?' disabled':''}>« Anterior</button>`+
    `<button onclick="renderTableFromFiltered(${minus100})">-100</button>`+
    `<span style="padding:4px 8px">Página ${page} / ${totalPages}</span>`+
    `<button onclick="renderTableFromFiltered(${plus100})">+100</button>`+
    `<button onclick="renderTableFromFiltered(${next})"${page===totalPages?' disabled':''}>Siguiente »</button>`;
}
function currentPageNumber(){ const t=document.querySelector('#paginacion span'); if(!t) return 1; const m=t.textContent.match(/Página (\d+)/); return m?+m[1]:1; }

/* -----------------------------------------
   Edición inline (fechas, enteros, texto)
----------------------------------------- */
document.querySelector('#tabla').addEventListener('click', (ev)=>{
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
        else{ td.textContent=value; }
        const pageNow=currentPageNumber();
        loadMetricsAll().then(()=>{ computeAndRenderMetrics(ALL_ROWS, FILTERED_ROWS); renderTableFromFiltered(pageNow); });
      } else { td.innerHTML=oldDisplay; alert('Error: '+(res.error||'desconocido')); }
    }catch(e){ td.innerHTML=oldDisplay; alert('Error de red'); }
  };
});

/* -----------------------------------------
   Login + modo edición
----------------------------------------- */
const btnLogin=document.getElementById('btnLogin'); const btnEditMode=document.getElementById('btnEditMode');
function renderGoogleButton(){
  if(!window.google||!google.accounts||!google.accounts.id){ setTimeout(renderGoogleButton,200); return; }
  google.accounts.id.initialize({client_id:CLIENT_ID, callback:(resp)=>{ idToken=resp.credential; btnEditMode.disabled=false; btnLogin.textContent='Sesión iniciada'; alert('Sesión iniciada. Activa “Modo edición”.'); }});
}
btnLogin.onclick=()=>{ renderGoogleButton(); };
btnEditMode.onclick=()=>{ editMode=!editMode; btnEditMode.textContent=`Modo edición: ${editMode?'ON':'OFF'}`; renderTableFromFiltered(currentPageNumber()); };

/* -----------------------------------------
   Botón Actualizar
----------------------------------------- */
const btnRefresh=document.getElementById('btnRefresh');
btnRefresh.onclick=()=>{ btnRefresh.textContent='Actualizando…'; btnRefresh.disabled=true;
  loadMetricsAll().finally(()=>{ btnRefresh.textContent='Actualizar'; btnRefresh.disabled=false; });
};

/* -----------------------------------------
   Sticky top dinámico + scroll sincronizado
----------------------------------------- */
function updateStickyTop(){
  const hdr = document.querySelector('.app-header');
  const kpis = document.getElementById('kpis-compact');
  const filt = document.getElementById('filters');
  const h = (hdr?.offsetHeight||0) + (kpis?.offsetHeight||0) + (filt?.offsetHeight||0) + 10;
  document.documentElement.style.setProperty('--stickyTop', h + 'px');
}
window.addEventListener('resize', updateStickyTop);

// scroll horizontal arriba/abajo
(function syncHScroll(){
  const topBar = document.getElementById('top-scroll');
  const tw = document.querySelector('.table-wrap');
  if (!topBar || !tw) return;
  let locking = false;
  topBar.addEventListener('scroll', ()=>{ if(locking) return; locking=true; tw.scrollLeft = topBar.scrollLeft; locking=false; });
  tw.addEventListener('scroll', ()=>{ if(locking) return; locking=true; topBar.scrollLeft = tw.scrollLeft; locking=false; });
})();

/* -----------------------------------------
   Init
----------------------------------------- */
function init(){
  updateStickyTop();
  // No llamamos loadKpis() aquí: fetchKpisAndGetTotal() ya lo pinta dentro de loadMetricsAll()
  loadMetricsAll();
  document.getElementById('btnApply').onclick=applyFilters;
  document.getElementById('btnClear').onclick=clearFilters;
}
init();

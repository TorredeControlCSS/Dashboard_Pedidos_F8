// ===== CONFIG =====
const A = window.APP.A_URL;                 // Web App A (lectura)
const B = window.APP.B_URL;                 // Web App B (escritura JSONP)
const CLIENT_ID = window.APP.CLIENT_ID;     // OAuth Client ID

// Campos editables
const ID_HEADER = 'F8 SALMI';
const EDITABLE_DATE_FIELDS = [
  'ASIGNACIÓN','SALIDA','DESPACHO','FACTURACIÓN',
  'EMPACADO','PROY. ENTREGA','ENTREGA REAL'
];
const EDITABLE_INT_FIELDS  = ['CANT. ASIG.','CANT. SOL.','RENGLONES ASI.','RENGLONES SOL.'];
const EDITABLE_TEXT_FIELDS = ['COMENT.']; // nuevo

// Normalizador
function normalizeName(s){
  return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/\./g,'').replace(/\s+/g,' ').trim().toUpperCase();
}
const N_ID_HEADER     = normalizeName(ID_HEADER);
const N_EDITABLE_DATE = new Set(EDITABLE_DATE_FIELDS.map(normalizeName));
const N_EDITABLE_INT  = new Set(EDITABLE_INT_FIELDS.map(normalizeName));
const N_EDITABLE_TEXT = new Set(EDITABLE_TEXT_FIELDS.map(normalizeName));

// Estado global
let idToken = null, editMode = false;
let currentHeaders = [], currentRows = [], currentIdColName = null;

// Dataset y filtros
let ALL_ROWS = [], FILTERED_ROWS = [];
const FIELDS_FOR_FILTERS = { categoria: 'CATEG.', unidad: 'UNIDAD', tipo: 'TIPO', grupo: 'GRUPO' };

// ===== JSONP =====
function jsonp(url, cbName){
  return new Promise((resolve,reject)=>{
    const s = document.createElement('script');
    const cb = cbName || ('cb_' + Math.random().toString(36).slice(2));
    window[cb] = (payload)=>{ try{ resolve(payload); } finally{ delete window[cb]; s.remove(); } };
    s.onerror = reject;
    s.src = url + (url.includes('?')?'&':'?') + `callback=${cb}&_=${Date.now()}`;
    document.body.appendChild(s);
  });
}

// ===== Formato fechas =====
function isIsoDateTimeZ(v){ return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) && v.endsWith('Z'); }
function formatIsoToDDMonYY(v){
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v); if (!m) return v;
  const [_, yyyy, mm, dd] = m;
  const mon = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'][parseInt(mm,10)-1];
  return `${dd}-${mon}-${yyyy.slice(-2)}`;
}
function formatAllIsoDatesInRow(row){
  const out = {...row};
  for (const k of Object.keys(out)) if (isIsoDateTimeZ(out[k])) out[k] = formatIsoToDDMonYY(out[k]);
  return out;
}

// ===== KPIs simples del backend (opcional) =====
function renderKpis(d){ const el=document.getElementById('kpis'); if(el) el.textContent = `Total pedidos: ${d.totalPedidos}`; }
function loadKpis(){
  window.onKpis = (res)=>renderKpis(res.data);
  const s = document.createElement('script');
  s.src = `${A}?route=kpis&callback=onKpis&_=${Date.now()}`;
  document.body.appendChild(s);
}

// ===== Render tabla desde filtrados (añade columnas derivadas) =====
function renderTableFromFiltered(page){
  const pageSize = 150; // rendimiento suave con 16k filas
  const start = (page-1)*pageSize;
  const chunk = FILTERED_ROWS.slice(start, start+pageSize).map(r=>({ ...r, ...derivePerRow(r) }));

  const headers = chunk.length ? Object.keys(chunk[0]) : [];
  currentHeaders   = headers;
  currentRows      = chunk.map(r=>({...r}));
  currentIdColName = headers.find(h => normalizeName(h) === N_ID_HEADER) || null;

  const head = document.querySelector('#tabla thead');
  const body = document.querySelector('#tabla tbody');

  head.innerHTML = headers.length ? `<tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr>` : '';

  const rowsFmt = chunk.map(formatAllIsoDatesInRow);
  body.innerHTML = rowsFmt.map((r, ri)=>{
    return `<tr>${
      headers.map((k)=>{
        const keyNorm = normalizeName(k);
        const editableDate = editMode && N_EDITABLE_DATE.has(keyNorm);
        const editableInt  = editMode && N_EDITABLE_INT.has(keyNorm);
        const editableText = editMode && N_EDITABLE_TEXT.has(keyNorm);
        const classes = (editableDate || editableInt || editableText) ? ' class="editable"' : '';
        return `<td${classes} data-ri="${ri}" data-col="${k}">${r[k]??''}</td>`;
      }).join('')
    }</tr>`;
  }).join('');

  const pages = Math.ceil(FILTERED_ROWS.length / pageSize);
  document.getElementById('paginacion').innerHTML =
    Array.from({length: pages},(_,i)=>
      `<button ${i+1===page?'disabled':''} onclick="renderTableFromFiltered(${i+1})">${i+1}</button>`
    ).join('');
}
function currentPageNumber(){ const d=document.querySelector('#paginacion button[disabled]'); return d?parseInt(d.textContent,10):1; }

// ===== Cargar dataset completo y pintar métricas + filtros =====
async function loadMetricsAll(){
  return new Promise((resolve)=>{
    window.onOrdersAll = (res)=>{
      ALL_ROWS = res.data.rows || [];
      FILTERED_ROWS = ALL_ROWS.slice();
      computeAndRenderMetrics(ALL_ROWS, FILTERED_ROWS);
      initFilterOptions(FILTERED_ROWS);
      resolve();
    };
    const s = document.createElement('script');
    s.src = `${A}?route=orders.list&page=1&pageSize=50000&callback=onOrdersAll&_=${Date.now()}`;
    document.body.appendChild(s);
  });
}

// ===== Filtros =====
function initFilterOptions(rows){
  const uniq = (arr)=> Array.from(new Set(arr.filter(Boolean))).sort();
  const fill = (id, values)=>{
    const sel=document.getElementById(id); if(!sel) return;
    const cur=sel.value;
    sel.innerHTML = `<option value="">Todas</option>` + values.map(v=>`<option>${v}</option>`).join('');
    if (cur) sel.value = cur;
  };
  fill('fCat',   uniq(rows.map(r=>r[FIELDS_FOR_FILTERS.categoria])));
  fill('fUnidad',uniq(rows.map(r=>r[FIELDS_FOR_FILTERS.unidad])));
  fill('fTipo',  uniq(rows.map(r=>r[FIELDS_FOR_FILTERS.tipo])));
  fill('fGrupo', uniq(rows.map(r=>r[FIELDS_FOR_FILTERS.grupo])));
  fill('fEstado',uniq(rows.map(r=>deriveStage(r))));
}

function applyFilters(){
  const cat=document.getElementById('fCat').value;
  const uni=document.getElementById('fUnidad').value;
  const tip=document.getElementById('fTipo').value;
  const gru=document.getElementById('fGrupo').value;
  const est=document.getElementById('fEstado').value;
  const txt=(document.getElementById('fBuscar').value||'').trim().toLowerCase();
  const desde=document.getElementById('fDesde').value;
  const hasta=document.getElementById('fHasta').value;

  const inRange = (row)=>{
    if (!desde && !hasta) return true;
    const d = (row['FECHA F8'] || row['RECIBO F8'] || '').slice(0,10);
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
    if (txt){
      const hay = Object.values(r).some(v=> String(v||'').toLowerCase().includes(txt));
      if (!hay) return false;
    }
    if (!inRange(r)) return false;
    return true;
  });

  computeAndRenderMetrics(ALL_ROWS, FILTERED_ROWS);
  renderTableFromFiltered(1);
}
function clearFilters(){
  ['fCat','fUnidad','fTipo','fGrupo','fEstado','fBuscar','fDesde','fHasta'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.value='';
  });
  FILTERED_ROWS = ALL_ROWS.slice();
  computeAndRenderMetrics(ALL_ROWS, FILTERED_ROWS);
  renderTableFromFiltered(1);
}

// ===== Editor inline =====
document.querySelector('#tabla').addEventListener('click', (ev)=>{
  const td = ev.target.closest('td.editable');
  if (!td || !editMode) return;

  const ri  = +td.dataset.ri;
  const col = td.dataset.col;
  const row = currentRows[ri];
  const orderId = currentIdColName ? row[currentIdColName] : null;
  if (!orderId){ alert(`No se encontró la columna ID (${ID_HEADER}) en la fila.`); return; }

  const keyNorm = normalizeName(col);
  const isDate = N_EDITABLE_DATE.has(keyNorm);
  const isInt  = N_EDITABLE_INT.has(keyNorm);
  const isText = N_EDITABLE_TEXT.has(keyNorm);
  if (td.querySelector('input')) return;

  const oldDisplay = td.textContent;
  td.innerHTML = '';

  const input = document.createElement('input');
  input.style.width = '100%'; input.style.boxSizing = 'border-box';
  if (isDate){ input.type='date'; }
  else if (isInt){
    input.type='number'; input.step='1'; input.min='0';
    const n=parseInt(oldDisplay,10); if(!isNaN(n)) input.value=String(n);
  } else if (isText){
    input.type='text'; input.value=oldDisplay||'';
  }

  const saveBtn=document.createElement('button'); saveBtn.textContent='Guardar'; saveBtn.style.marginTop='4px';
  const cancelBtn=document.createElement('button'); cancelBtn.textContent='Cancelar'; cancelBtn.style.margin='4px 0 0 6px';

  const wrap=document.createElement('div'); wrap.appendChild(input);
  const btns=document.createElement('div'); btns.appendChild(saveBtn); btns.appendChild(cancelBtn);
  td.appendChild(wrap); td.appendChild(btns); input.focus();

  cancelBtn.onclick = ()=> { td.innerHTML = oldDisplay; };

  saveBtn.onclick = async ()=>{
    if (!idToken){ alert('Primero haz clic en “Acceder”.'); return; }
    let value = input.value.trim();

    if (isDate && !/^\d{4}-\d{2}-\d{2}$/.test(value)){ alert('Selecciona fecha válida (YYYY-MM-DD).'); return; }
    if (isInt && !/^-?\d+$/.test(value)){ alert('Ingresa un número entero.'); return; }
    if (isText && value.length>500){ alert('Comentario muy largo (máx. 500).'); return; }

    td.innerHTML = 'Guardando…';

    const url = `${B}?route=orders.update`
      + `&idToken=${encodeURIComponent(idToken)}`
      + `&id=${encodeURIComponent(orderId)}`
      + `&field=${encodeURIComponent(col)}`
      + `&value=${encodeURIComponent(value)}`;

    try{
      const res = await jsonp(url);
      if (res.status === 'ok'){
        if (isDate){
          const [y,m,d]=value.split('-');
          const mon=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'][parseInt(m,10)-1];
          td.textContent = `${d}-${mon}-${y.slice(2)}`;
        } else { td.textContent = value; }
        const pageNow = currentPageNumber();
        loadMetricsAll().then(()=>{ computeAndRenderMetrics(ALL_ROWS, FILTERED_ROWS); renderTableFromFiltered(pageNow); });
      } else {
        td.innerHTML = oldDisplay; alert('Error: ' + (res.error || 'desconocido'));
      }
    }catch(e){ td.innerHTML = oldDisplay; alert('Error de red'); }
  };
});

// ===== Login + Modo edición =====
const btnLogin = document.getElementById('btnLogin');
const btnEditMode = document.getElementById('btnEditMode');
const loginBox = document.getElementById('loginBox');
const loginBoxBtn = document.getElementById('loginBoxBtn');
const loginClose = document.getElementById('loginClose');

function renderGoogleButton(){
  loginBoxBtn.innerHTML = '';
  if (!window.google || !google.accounts || !google.accounts.id){ setTimeout(renderGoogleButton,200); return; }
  google.accounts.id.initialize({
    client_id: CLIENT_ID,
    callback: (resp)=>{ idToken = resp.credential; btnEditMode.disabled=false; btnLogin.textContent='Sesión iniciada'; loginBox.style.display='none'; alert('Sesión iniciada. Activa “Modo edición”.'); }
  });
  google.accounts.id.renderButton(loginBoxBtn,{type:'standard',theme:'outline',size:'large',text:'signin_with'});
}
btnLogin.onclick = ()=>{ loginBox.style.display='flex'; renderGoogleButton(); };
loginClose.onclick = ()=>{ loginBox.style.display='none'; };

btnEditMode.onclick = ()=>{
  editMode = !editMode;
  btnEditMode.textContent = `Modo edición: ${editMode ? 'ON' : 'OFF'}`;
  renderTableFromFiltered(currentPageNumber());
};

// Botón Actualizar con feedback
const btnRefresh = document.getElementById('btnRefresh');
btnRefresh.onclick = ()=>{
  btnRefresh.textContent='Actualizando…'; btnRefresh.disabled=true;
  loadMetricsAll().then(()=>{
    computeAndRenderMetrics(ALL_ROWS, FILTERED_ROWS);
    renderTableFromFiltered(currentPageNumber());
  }).finally(()=>{
    btnRefresh.textContent='Actualizar'; btnRefresh.disabled=false;
  });
};

// ===== Init =====
function init(){
  loadKpis(); // opcional
  loadMetricsAll().then(()=> renderTableFromFiltered(1));
  document.getElementById('btnApply').onclick = applyFilters;
  document.getElementById('btnClear').onclick = clearFilters;
}
init();

// v2025-11-30a
console.log('app.js v2025-11-30a');

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
function isIsoDateTimeZ(v){ return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) && v.endsWith('Z'); }
function formatIsoToDDMonYY(v){ const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(v); if(!m) return v; const [_,y,mn,d]=m; const mon=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'][parseInt(mn,10)-1]; return `${d}-${mon}-${y.slice(-2)}`; }
function formatAllIsoDatesInRow(row){ const out={...row}; for(const k of Object.keys(out)) if(isIsoDateTimeZ(out[k])) out[k]=formatIsoToDDMonYY(out[k]); return out; }

function renderKpis(d){ const el=document.getElementById('kpis'); if(el) el.textContent = `Total pedidos: ${d.totalPedidos}`; }
function loadKpis(){ window.onKpis=(res)=>renderKpis(res.data); const s=document.createElement('script'); s.src = `${A}?route=kpis&callback=onKpis&_=${Date.now()}`; document.body.appendChild(s); }

function headerWidthMap(){ return {
  'CATEG.':180,'UNIDAD':220,'TIPO':100,'F8 SALMI':110,'F8 SISCONI':110,'GRUPO':90,'SUSTANCIAS':140,
  'CANT. ASIG.':90,'CANT. SOL.':90,'RENGLONES ASI.':110,'RENGLONES SOL.':110,
  'FECHA F8':100,'RECIBO F8':100,'ASIGNACIÓN':100,'SALIDA':100,'DESPACHO':100,'FACTURACIÓN':110,'EMPACADO':100,
  'PROY. ENTREGA':110,'ENTREGA REAL':110,'INCOTERM':100,'ESTADO':110,'COMENT.':180,'TIEMPO':80,
  'COMPLET':90,'FILL CANT.':90,'FILL RENGL.':100
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

async function loadMetricsAll(){
  return new Promise((resolve)=>{
    window.onOrdersAll = (res)=>{
      ALL_ROWS = res.data.rows || [];
      FILTERED_ROWS = ALL_ROWS.slice();
      computeAndRenderMetrics(ALL_ROWS, FILTERED_ROWS);
      initFilterOptions(FILTERED_ROWS);
      resolve();
    };
    const s=document.createElement('script');
    s.src = `${A}?route=orders.list&page=1&pageSize=50000&callback=onOrdersAll&_=${Date.now()}`;
    document.body.appendChild(s);
  });
}

function initFilterOptions(rows){
  const uniq = (arr)=> Array.from(new Set(arr.filter(Boolean))).sort();
  const fill = (id, values)=>{ const sel=document.getElementById(id); if(!sel) return; const cur=sel.value;
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

// Login + edición
const btnLogin=document.getElementById('btnLogin'); const btnEditMode=document.getElementById('btnEditMode');
const loginBox=document.getElementById('loginBox'); const loginBoxBtn=document.getElementById('loginBoxBtn'); const loginClose=document.getElementById('loginClose');
function renderGoogleButton(){
  loginBoxBtn.innerHTML=''; if(!window.google||!google.accounts||!google.accounts.id){ setTimeout(renderGoogleButton,200); return; }
  google.accounts.id.initialize({client_id:CLIENT_ID, callback:(resp)=>{ idToken=resp.credential; btnEditMode.disabled=false; btnLogin.textContent='Sesión iniciada'; loginBox.style.display='none'; alert('Sesión iniciada. Activa “Modo edición”.'); }});
  google.accounts.id.renderButton(loginBoxBtn,{type:'standard',theme:'outline',size:'large',text:'signin_with'});
}
btnLogin.onclick=()=>{ loginBox.style.display='flex'; renderGoogleButton(); };
if (loginClose) loginClose.onclick=()=>{ loginBox.style.display='none'; };
btnEditMode.onclick=()=>{ editMode=!editMode; btnEditMode.textContent=`Modo edición: ${editMode?'ON':'OFF'}`; renderTableFromFiltered(currentPageNumber()); };

const btnRefresh=document.getElementById('btnRefresh');
btnRefresh.onclick=()=>{ btnRefresh.textContent='Actualizando…'; btnRefresh.disabled=true;
  loadMetricsAll().then(()=>{ computeAndRenderMetrics(ALL_ROWS, FILTERED_ROWS); renderTableFromFiltered(currentPageNumber()); })
  .finally(()=>{ btnRefresh.textContent='Actualizar'; btnRefresh.disabled=false; });
};

function init(){
  loadKpis();
  loadMetricsAll().then(()=> renderTableFromFiltered(1));
  document.getElementById('btnApply').onclick=applyFilters;
  document.getElementById('btnClear').onclick=clearFilters;
}
init();

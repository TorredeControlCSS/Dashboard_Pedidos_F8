// ===== CONFIG =====
const A = window.APP.A_URL;
const B = window.APP.B_URL;
const CLIENT_ID = window.APP.CLIENT_ID;

// Campos editables
const ID_HEADER = 'F8 SALMI';
const EDITABLE_DATE_FIELDS = ['ASIGNACIÓN','SALIDA','DESPACHO','FACTURACIÓN','EMPACADO','PROY. ENTREGA','ENTREGA REAL'];
const EDITABLE_INT_FIELDS  = ['CANT. ASIG.','CANT. SOL.','RENGLONES ASI.','RENGLONES SOL.'];

// Estado global
let idToken = null;
let editMode = false; // cuando true, celdas de campos editables se pueden editar
let currentHeaders = []; // headers de la tabla de la página actual
let currentRows = [];    // datos crudos de la página actual (post-format)

// ===== JSONP helper =====
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

// ===== Fechas: mostrar dd-mmm-yy si viene ISO =====
function isIsoDateTimeZ(v){
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) && v.endsWith('Z');
}
function formatIsoToDDMonYY(v){
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (!m) return v;
  const [_, yyyy, mm, dd] = m;
  const mon = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'][parseInt(mm,10)-1];
  return `${dd}-${mon}-${yyyy.slice(-2)}`;
}
function formatAllIsoDatesInRow(row){
  const out = {...row};
  for (const k of Object.keys(out)){
    if (isIsoDateTimeZ(out[k])) out[k] = formatIsoToDDMonYY(out[k]);
  }
  return out;
}

// ===== KPIs =====
function renderKpis(d){
  document.getElementById('kpis').innerHTML = `Total pedidos: ${d.totalPedidos}`;
}
function loadKpis(){
  window.onKpis = (res)=>renderKpis(res.data);
  const s = document.createElement('script');
  s.src = `${A}?route=kpis&callback=onKpis&_=${Date.now()}`;
  document.body.appendChild(s);
}

// ===== Tabla paginada + edición inline =====
function renderTabla(page){
  window.onOrders = (res)=>{
    let {rows, total, page, pageSize} = res.data;

    // Guarda headers/rows actuales
    currentHeaders = rows.length ? Object.keys(rows[0]) : [];
    currentRows = rows.map(r => ({...r}));

    // Formatear fechas visibles
    rows = rows.map(formatAllIsoDatesInRow);

    const head = document.querySelector('#tabla thead');
    const body = document.querySelector('#tabla tbody');

    head.innerHTML = rows.length
      ? `<tr>${Object.keys(rows[0]).map(h=>`<th>${h}</th>`).join('')}</tr>`
      : '';

    // Render filas, con celdas editables si editMode
    body.innerHTML = rows.map((r, ri)=>{
      return `<tr>${
        Object.entries(r).map(([k,v])=>{
          const editableDate = editMode && EDITABLE_DATE_FIELDS.includes(k);
          const editableInt  = editMode && EDITABLE_INT_FIELDS.includes(k);
          const classes = editableDate || editableInt ? ' class="editable"' : '';
          // dataset con índice de fila y columna
          return `<td${classes} data-ri="${ri}" data-col="${k}">${v ?? ''}</td>`;
        }).join('')
      }</tr>`;
    }).join('');

    // Paginación
    const pages = Math.ceil(total / pageSize);
    document.getElementById('paginacion').innerHTML =
      Array.from({length: pages},(_,i)=>
        `<button ${i+1===page?'disabled':''} onclick="renderTabla(${i+1})">${i+1}</button>`
      ).join('');
  };

  const s = document.createElement('script');
  s.src = `${A}?route=orders.list&page=${page||1}&pageSize=200&callback=onOrders&_=${Date.now()}`;
  document.body.appendChild(s);
}

// Click en celdas editables -> abre editor inline
document.querySelector('#tabla').addEventListener('click', (ev)=>{
  const td = ev.target.closest('td.editable');
  if (!td || !editMode) return;

  const ri = +td.dataset.ri;
  const col = td.dataset.col;
  const row = currentRows[ri];
  const orderId = row[ID_HEADER];
  if (!orderId){
    alert(`No se encontró la columna ID (${ID_HEADER}) en la fila.`);
    return;
  }

  // Decide editor: date o integer
  const isDate = EDITABLE_DATE_FIELDS.includes(col);
  const isInt  = EDITABLE_INT_FIELDS.includes(col);

  // Evitar crear varios inputs
  if (td.querySelector('input')) return;

  const oldDisplay = td.textContent;
  td.innerHTML = '';

  const input = document.createElement('input');
  input.style.width = '100%';
  input.style.boxSizing = 'border-box';

  if (isDate){
    input.type = 'date';
    // Valor en YYYY-MM-DD (si el original venía de la Sheet y lo formateamos, no siempre lo tenemos;
    // lo dejamos vacío para que el usuario seleccione)
  } else if (isInt){
    input.type = 'number';
    input.step = '1';
    input.min = '0';
    const n = parseInt(oldDisplay,10);
    if (!isNaN(n)) input.value = String(n);
  }

  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Guardar';
  saveBtn.style.marginTop = '4px';

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancelar';
  cancelBtn.style.marginTop = '4px';
  cancelBtn.style.marginLeft = '6px';

  const wrap = document.createElement('div');
  wrap.appendChild(input);
  const btns = document.createElement('div');
  btns.appendChild(saveBtn);
  btns.appendChild(cancelBtn);
  td.appendChild(wrap);
  td.appendChild(btns);

  input.focus();

  cancelBtn.onclick = ()=> { td.innerHTML = oldDisplay; };

  saveBtn.onclick = async ()=>{
    if (!idToken){
      alert('Primero haz clic en “Acceder” (arriba) para iniciar sesión.');
      return;
    }
    let value = input.value.trim();

    if (isDate && !/^\d{4}-\d{2}-\d{2}$/.test(value)){
      alert('Selecciona una fecha válida (YYYY-MM-DD).');
      return;
    }
    if (isInt){
      if (!/^-?\d+$/.test(value)){
        alert('Ingresa un número entero.');
        return;
      }
    }

    td.innerHTML = 'Guardando…';

    const url = `${B}?route=orders.update`
      + `&idToken=${encodeURIComponent(idToken)}`
      + `&id=${encodeURIComponent(orderId)}`
      + `&field=${encodeURIComponent(col)}`
      + `&value=${encodeURIComponent(value)}`;

    try{
      const res = await jsonp(url);
      if (res.status === 'ok'){
        // refresca la celda (para fechas mostramos dd-mmm-yy)
        if (isDate){
          const [y,m,d] = value.split('-');
          const mon = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'][parseInt(m,10)-1];
          td.textContent = `${d}-${mon}-${y.slice(-2)}`;
        } else {
          td.textContent = value;
        }
      }else{
        td.innerHTML = oldDisplay;
        alert('Error: ' + (res.error || 'desconocido'));
      }
    }catch(e){
      td.innerHTML = oldDisplay;
      alert('Error de red');
    }
  };
});

// ===== Login con Google + Modo edición =====
const btnLogin = document.getElementById('btnLogin');
const btnEditMode = document.getElementById('btnEditMode');

btnLogin.onclick = ()=>{
  // Renderiza un botón flotante de Google y lo clickea
  const c = document.createElement('div');
  document.body.appendChild(c);
  google.accounts.id.initialize({
    client_id: CLIENT_ID,
    callback: (resp) => {
      idToken = resp.credential;
      btnEditMode.disabled = false;
      btnLogin.textContent = 'Sesión iniciada';
      c.remove();
      alert('Sesión iniciada. Ahora puedes activar “Modo edición”.');
    }
  });
  google.accounts.id.renderButton(c, { type:'standard', theme:'outline', size:'large', text:'signin_with' });
};

btnEditMode.onclick = ()=>{
  editMode = !editMode;
  btnEditMode.textContent = `Modo edición: ${editMode ? 'ON' : 'OFF'}`;
  // Re-render de la página actual para aplicar/quitar celdas editables
  // buscamos botón de paginación deshabilitado para saber la página actual
  const disabled = document.querySelector('#paginacion button[disabled]');
  const page = disabled ? parseInt(disabled.textContent,10) : 1;
  renderTabla(page);
};

// ===== Init =====
function init(){
  loadKpis();
  renderTabla(1);
}
init();

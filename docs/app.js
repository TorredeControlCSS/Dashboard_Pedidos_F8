// app.js v2025-12-01 — versión completa y consolidada
// Contiene: KPIs/Charts desde stats, tabla paginada, login, edición inline,
// recalculo dinámico de sticky header, filtros desde orders.list y exposición de funciones globales.

if (window.__APP_LOADED__) {
  console.log('app.js ya cargado, skip');
} else {
window.__APP_LOADED__ = true;
console.log('app.js v2025-12-01 (optimizada pageSize=200)');

const A = window.APP && window.APP.A_URL;
const B = window.APP && window.APP.B_URL;
const CLIENT_ID = window.APP && window.APP.CLIENT_ID;

const ID_HEADER = 'F8 SALMI';
const N = s => String(s||'')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'')
  .replace(/\./g,'')
  .replace(/\s+/g,' ')
  .trim()
  .toUpperCase();
const N_ID = N(ID_HEADER);

const DATE_FIELDS = ['ASIGNACIÓN','SALIDA','DESPACHO','FACTURACIÓN','EMPACADO','PROY. ENTREGA','ENTREGA REAL'];
const INT_FIELDS  = ['CANT. ASIG.','CANT. SOL.','RENGLONES ASIG.','RENGLONES SOL.'];
const TXT_FIELDS  = ['COMENT.'];

// Opciones fijas para comentarios (tanto filtro como edición)
const COMMENT_OPTIONS = [
  '',
  'DISCREPANCIA DE INVENTARIO',
  'FALTA DE PERSONAL',
  'VIATICOS PARA VIAJES',
  'FALTA MONTACARGA',
  'CONGESTIONAMIENTO EN SALIDAS',
  'FACTURACION RETRASADA',
  'FALLAS EN SISTEMA',
  'DEMORA EN DOCUMENTACION',
  'ERROR DE CAPTACION',
  'ENTREGADO'
];

const S_DATE = new Set(DATE_FIELDS.map(N));
const S_INT  = new Set(INT_FIELDS.map(N));
const S_TXT  = new Set(TXT_FIELDS.map(N));

let idToken = null;
let editMode = false;
let currentHeaders = [], currentRows = [], currentIdCol = null;
let currentPage = 1;

// Page size más pequeño para acelerar carga inicial/render de tabla
const DEFAULT_PAGE_SIZE = 50;

/* JSONP helper */
function jsonp(url){
  return new Promise((resolve,reject)=>{
    const cb = 'cb_' + Math.random().toString(36).slice(2);
    const s = document.createElement('script');
    window[cb] = (payload) => {
      try { resolve(payload); }
      finally {
        try{ delete window[cb]; }catch(e){}
        s.remove();
      }
    };
    s.onerror = () => {
      try{ delete window[cb]; }catch(e){}
      s.remove();
      reject(new Error('network'));
    };
    s.src = url + (url.includes('?') ? '&' : '?') + `callback=${cb}&_=${Date.now()}`;
    document.body.appendChild(s);
  });
}

/* Fechas helpers */
const monES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const isIsoZ = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) && v.endsWith('Z');
const toDDMonYY = v => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if(!m) return v;
  const [_,y,mn,d] = m;
  return `${d}-${monES[parseInt(mn,10)-1]}-${y.slice(-2)}`;
};
const parseIsoDate = v => {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (!m) return null;
  const y = +m[1], mn = +m[2], d = +m[3];
  // Fecha local sin UTC; usamos solo año/mes/día para evitar corrimientos
  return new Date(y, mn - 1, d);
};

/* KPIs / Charts */
async function fetchStats(filters){
  const p = new URLSearchParams({ route: 'stats' });
  Object.entries(filters||{}).forEach(([k,v]) => { if(v) p.set(k,v); });
  const res = await jsonp(`${A}?${p.toString()}`);
  if(!res || res.status !== 'ok') throw new Error(res && res.error ? res.error : 'stats_error');
  return res.data;
}

function setKpis(k){
  const set = (id,v) => {
    const el = document.getElementById(id);
    if(el) el.textContent = (v==null ? '—' : (+v).toLocaleString());
  };
  set('kpi-total', k.total);
  set('kpi-asignado', k.asignado);
  set('kpi-solicitado', k.solicitado);
  set('kpi-reng-asig', k.rengAsig);
  set('kpi-reng-sol', k.rengSol);
  const urg = document.getElementById('kpi-urg'),
        men = document.getElementById('kpi-men');
  if(urg) urg.textContent = (k.urg==null ? '—' : (+k.urg).toLocaleString());
  if(men) men.textContent = (k.mens==null ? '—' : (+k.mens).toLocaleString());
}

// Conteos por tipo (MENSUAL / URGENTE) si stats.tipoDist existe
function setTipoCounts(tipoDist){
  const set = (id,v) => {
    const el = document.getElementById(id);
    if(el) el.textContent = (v==null ? '—' : (+v).toLocaleString());
  };
  const getVal = (keys) => {
    if(!tipoDist) return 0;
    for(let i=0;i<keys.length;i++){
      if(tipoDist[keys[i]]!=null) return tipoDist[keys[i]];
    }
    return 0;
  };
  const mens = getVal(['MENSUAL','MENSUALES','MENS','MENSUAL ']);
  const urg  = getVal(['URGENTE','URG','URG.','URG ']);
  set('kpi-tipo-mens', mens);
  set('kpi-tipo-urg', urg);
}

async function refreshKpisAndCharts(filters){
  const stats = await fetchStats(filters);
  setKpis(stats.kpis);
  if (stats && stats.tipoDist) setTipoCounts(stats.tipoDist);
  if (window.renderChartsFromStats) {
    try { window.renderChartsFromStats(stats); }
    catch(e){ console.warn('renderChartsFromStats failed', e); }
  }
  setTimeout(updateStickyTop, 120);
}

/* Teoría de colas: métricas M/M/s por grupo desde Script A */
async function fetchQueueMetrics(filters){
  const p = new URLSearchParams({ route: 'queue.metrics' });
  Object.entries(filters || {}).forEach(([k,v]) => { if (v) p.set(k,v); });
  const res = await jsonp(`${A}?${p.toString()}`);
  if (!res || res.status !== 'ok') throw new Error(res && res.error ? res.error : 'queue_error');
  return res.data;
}

/* Filtros: leer valores seleccionados */
function getFilters(){
  return {
    cat:    document.getElementById('fCat')?.value || '',
    unidad: document.getElementById('fUnidad')?.value || '',
    tipo:   document.getElementById('fTipo')?.value || '',
    grupo:  document.getElementById('fGrupo')?.value || '',
    estado: document.getElementById('fEstado')?.value || '',
    coment: document.getElementById('fComent')?.value || '',
    text:   document.getElementById('fBuscar')?.value || '',
    desde:  document.getElementById('fDesde')?.value || '',
    hasta:  document.getElementById('fHasta')?.value || ''
  };
}

/* Tabla y paginación */
function widthMap(){ return {
  'CATEG.':180,'UNIDAD':220,'TIPO':110,'F8 SALMI':120,'F8 SISCONI':120,'GRUPO':110,'SUSTANCIAS':160,
  'CANT. ASIG.':110,'CANT. SOL.':110,'RENGLONES ASIG.':130,'RENGLONES SOL.':130,
  'FECHA F8':110,'RECIBO F8':110,'ASIGNACIÓN':110,'SALIDA':110,'DESPACHO':110,'FACTURACIÓN':120,'EMPACADO':110,
  'PROY. ENTREGA':130,'ENTREGA REAL':130,'INCOTERM':110,'ESTADO':130,'COMENT.':220,
  'TIEMPO':90,'COMPLET':100,'FILL CANT.':110,'FILL RENGL.':120
}; }

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
  return {
    TIEMPO: days ? `${days}d` : '',
    COMPLET: complet ? 'SI':'NO',
    'FILL CANT.': `${fillCant}%`,
    'FILL RENGL.': `${fillReng}%`
  };
}

/* KPIs de TIEMPO (RECIBO F8 -> PROY. ENTREGA / ENTREGA REAL) */
function computeTimeKpisFromRows(rows){
  const toDate = (v) => parseIsoDate(v);
  let sumReal = 0, nReal = 0;
  let sumProm = 0, nProm = 0;

  (rows || []).forEach(r=>{
    const rec = r['RECIBO F8'] && toDate(r['RECIBO F8']);
    if (!rec) return;

    if (r['ENTREGA REAL']) {
      const end = toDate(r['ENTREGA REAL']);
      if (end && end >= rec) {
        const days = (end - rec)/86400000;
        sumReal += days;
        nReal++;
      }
    }
    if (r['PROY. ENTREGA']) {
      const prom = toDate(r['PROY. ENTREGA']);
      if (prom && prom >= rec) {
        const daysP = (prom - rec)/86400000;
        sumProm += daysP;
        nProm++;
      }
    }
  });

  const avgReal = nReal ? (sumReal/nReal) : null;
  const avgProm = nProm ? (sumProm/nProm) : null;
  const diff = (avgReal!=null && avgProm!=null) ? (avgReal - avgProm) : null;

  return { avgReal, avgProm, diff, nReal, nProm };
}

function setTimeKpis(t){
  const set = (id, v) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (v == null || isNaN(v)) {
      el.textContent = '—';
      return;
    }
    el.textContent = v.toFixed(1);
  };
  set('kpi-t-real', t.avgReal);
  set('kpi-t-prom', t.avgProm);
  set('kpi-t-diff', t.diff);
}

/* Meta para filtros: pedir únicos al Script A (orders.meta) */
async function fetchMeta(){
  const p = new URLSearchParams({ route: 'orders.meta' });
  const res = await jsonp(`${A}?${p.toString()}`);
  if (!res || res.status !== 'ok') throw new Error(res && res.error ? res.error : 'meta_error');
  return res.data || {};
}

async function populateFiltersFromMeta(){
  try{
    const meta = await fetchMeta();
    const setOptions = (id, items) => {
      const el = document.getElementById(id);
      if(!el) return;
      const currentFirst = el.options[0]?.outerHTML || '';
      const rest = (items||[]).map(v=>`<option value="${v}">${v}</option>`).join('');
      el.innerHTML = currentFirst + rest;
    };

    setOptions('fCat',    meta.categorias || []);
    setOptions('fUnidad', meta.unidades   || []);
    setOptions('fTipo',   meta.tipos      || []);
    setOptions('fGrupo',  meta.grupos     || []);
    setOptions('fEstado', meta.estados    || []);

    console.log('populateFiltersFromMeta (app.js):', meta);
  }catch(e){
    console.warn('populateFiltersFromMeta error', e);
  }
}
  
/* Llamada a orders.list */
async function fetchTable(page, pageSize, filters){
  const p = new URLSearchParams({ route:'orders.list', page, pageSize });
  Object.entries(filters||{}).forEach(([k,v])=>{ if(v) p.set(k,v); });
  const res = await jsonp(`${A}?${p.toString()}`);
  if(!res || res.status !== 'ok') throw new Error(res && res.error ? res.error : 'orders_error');
  return res.data;
}

async function renderTable(page = 1){
  currentPage = page || 1;
  const pageSize = DEFAULT_PAGE_SIZE;
  const filters = getFilters();

  const pgnEl = document.getElementById('paginacion');
  if(pgnEl) pgnEl.innerHTML = `<span style="padding:4px 8px">Cargando…</span>`;

  const data = await fetchTable(currentPage, pageSize, filters);
  const rawRows = data.rows || [];
  const headers = data.header || (rawRows[0] ? Object.keys(rawRows[0]) : []);
  const W = widthMap();

  currentHeaders = Array.from(new Set([ ...headers, 'TIEMPO', 'COMPLET', 'FILL CANT.', 'FILL RENGL.' ]));
  currentRows = rawRows.map(r=>{
    const out = {...r};
    Object.keys(out).forEach(k=>{ if (isIsoZ(out[k])) out[k] = toDDMonYY(out[k]); });
    Object.assign(out, perRowMetrics(r));
    return out;
  });
  currentIdCol = headers.find(h => N(h) === N_ID) || null;

  window._currentRows = currentRows;

  const thead = document.querySelector('#tabla thead');
  const tbody = document.querySelector('#tabla tbody');

  if (thead) {
    thead.innerHTML = `<tr>${
      currentHeaders.map(h => `<th data-col="${h}" style="min-width:${W[h]||100}px">${h}</th>`).join('')
    }</tr>`;
  }
  if (tbody) {
    tbody.innerHTML = currentRows.map((r,ri)=>`<tr>${
      currentHeaders.map(k=>{
        const kN = N(k);
        const editable = editMode && (S_DATE.has(kN) || S_INT.has(kN) || S_TXT.has(kN));

        let classes = [];
        let style = '';

        if (editable){
          classes.push('editable');
          style += 'cursor:pointer;background:#fffbe6;';
        }

        // COMPLET: SI (verde) / NO (rojo)
        if (k === 'COMPLET'){
          if (String(r[k]||'').toUpperCase() === 'SI') classes.push('state-ok');
          else classes.push('state-bad');
        }

        // FILL CANT. y FILL RENGL. por rangos
        if (k === 'FILL CANT.' || k === 'FILL RENGL.'){
          const valStr = String(r[k] || '').replace('%','');
          const valNum = parseFloat(valStr);
          if (!isNaN(valNum)){
            if (valNum >= 95) classes.push('fill-high');
            else if (valNum >= 80) classes.push('fill-medium');
            else classes.push('fill-low');
          }
        }

        const clsAttr = classes.length ? ` class="${classes.join(' ')}"` : '';
        const styleAttr = style ? ` style="${style}"` : '';
        return `<td${clsAttr}${styleAttr} data-ri="${ri}" data-col="${k}">${r[k] ?? ''}</td>`;
      }).join('')
    }</tr>`).join('');
  }

  const totalPages = Math.ceil((data.total||0)/pageSize);
  const prev = Math.max(1, page-1), next = Math.min(totalPages, page+1);
  const step = Math.max(1, Math.floor(100/pageSize));
  const minus100 = Math.max(1, page - step);
  const plus100 = Math.min(totalPages, page + step);

  if(pgnEl) pgnEl.innerHTML =
    `<button onclick="renderTable(${prev})"${page===1?' disabled':''}>« Anterior</button>`+
    `<button onclick="renderTable(${minus100})">-100</button>`+
    `<span style="padding:4px 8px">Página ${page} / ${totalPages}</span>`+
    `<button onclick="renderTable(${plus100})">+100</button>`+
    `<button onclick="renderTable(${next})"${page===totalPages?' disabled':''}>Siguiente »</button>`;

  try{
    const tKpis = computeTimeKpisFromRows(rawRows);
    setTimeKpis(tKpis);
    console.log('Time KPIs (pagina actual):', tKpis);
  }catch(e){
    console.warn('Error calculando KPIs de tiempo', e);
  }

  setTimeout(updateStickyTop, 60);
}

/* Tabla de Teoría de Colas por grupo */
async function renderQueueTable(filters){
  try{
    const data = await fetchQueueMetrics(filters || {});
    const grupos = data.grupos || [];

    const thead = document.querySelector('#tabla-queues thead');
    const tbody = document.querySelector('#tabla-queues tbody');
    if (!thead || !tbody) return;

    // Sin la columna "s"
    thead.innerHTML = `<tr>
      <th>GRUPO</th>
      <th>λ (llegadas/día)</th>
      <th>μ (salidas/día)</th>
      <th>ρ (utilización)</th>
      <th>W_real (días)</th>
      <th>W_model (días)</th>
      <th>Wq (días en cola)</th>
      <th>L (en sistema)</th>
      <th>Lq (en cola)</th>
      <th># llegadas</th>
      <th># completados</th>
    </tr>`;

    const fmt = (v, dec=2) => {
      if (v == null || isNaN(v)) return '—';
      return (+v).toFixed(dec);
    };

    // Función para acortar nombre de grupo solo en la vista
    const shortGroup = (name) => {
      if (!name) return '';
      let s = String(name);

      s = s.replace('LABORATORIO', 'LAB');
      s = s.replace('ODONTOLOGÍA', 'ODO');
      s = s.replace('ODONTOLOGIA', 'ODO');   // sin tilde por si acaso
      s = s.replace('RADIOLOGIA', 'RAD');
      s = s.replace('RADIOLOGÍA', 'RAD');

      return s;
    };

    tbody.innerHTML = grupos.map(g => {
      const saturado = (g.mu === 0) || (g.lambda != null && g.mu != null && g.s && g.lambda >= g.s * g.mu);
      const rhoPct = (g.rho == null || isNaN(g.rho)) ? '—' : (g.rho*100).toFixed(1) + '%';

      const W_model = saturado ? '—' : fmt(g.W_model, 2);
      const Wq      = saturado ? '—' : fmt(g.Wq, 2);
      const L       = saturado ? '—' : fmt(g.L, 2);
      const Lq      = saturado ? '—' : fmt(g.Lq, 2);

      const rowClass = saturado ? ' style="background:#fef2f2"' : '';

      return `<tr${rowClass}>
        <td>${shortGroup(g.grupo)}</td>
        <td style="text-align:right">${fmt(g.lambda, 3)}</td>
        <td style="text-align:right">${fmt(g.mu, 3)}</td>
        <td style="text-align:right">${rhoPct}</td>
        <td style="text-align:right">${fmt(g.W_real, 2)}</td>
        <td style="text-align:right">${W_model}</td>
        <td style="text-align:right">${Wq}</td>
        <td style="text-align:right">${L}</td>
        <td style="text-align:right">${Lq}</td>
        <td style="text-align:right">${g.llegadas}</td>
        <td style="text-align:right">${g.completados}</td>
      </tr>`;
    }).join('');

    console.log('queue.metrics:', data);
  }catch(e){
    console.warn('renderQueueTable error', e);
  }
}

/* Edición inline (sin botones, guardado por celda) */
document.querySelector('#tabla')?.addEventListener('click', (ev)=>{
  // Si el click viene de dentro de un editor ya abierto, no volver a crear el editor
  if (ev.target.closest('.cell-editor')) return;

  const td = ev.target.closest && ev.target.closest('td.editable');
  if(!td || !editMode) return;

  const ri  = +td.dataset.ri;
  const col = td.dataset.col;
  const row = currentRows[ri];
  const idCol  = currentIdCol;
  const orderId = idCol ? row[idCol] : null;
  if(!orderId){
    alert(`No se encontró la columna ID (${ID_HEADER}).`);
    return;
  }

  const kN = N(col);
  const isDate = S_DATE.has(kN);
  const isInt  = S_INT.has(kN);
  const isTxt  = S_TXT.has(kN);

  // Evitar abrir doble editor en la misma celda
  if (td.querySelector('input') || td.querySelector('select')) return;

  const old = td.textContent || '';
  td.innerHTML = '';

  let inputEl;
  const isComent = (col === 'COMENT.');

  if (isComent){
    const select = document.createElement('select');
    select.style.width = '100%';
    COMMENT_OPTIONS.forEach(opt => {
      const o = document.createElement('option');
      o.value = opt;
      o.textContent = opt || '— (sin comentario)';
      if (old.trim() === opt) o.selected = true;
      select.appendChild(o);
    });
    inputEl = select;
  } else {
    const input = document.createElement('input');
    input.style.width = '100%';
    input.style.boxSizing = 'border-box';
    if (isDate){
      input.type = 'date';
      // intentar reconstruir YYYY-MM-DD desde el texto dd-mon-yy
      const m = /^(\d{2})-(\w{3})-(\d{2})$/.exec(old.trim());
      if (m){
        const d = m[1];
        const monTxt = m[2].toLowerCase();
        const y2 = m[3];
        const idx = monES.indexOf(monTxt);
        if (idx >= 0){
          const yyyy = '20' + y2;
          const mm = String(idx+1).padStart(2,'0');
          input.value = `${yyyy}-${mm}-${d}`;
        }
      }
    } else if (isInt){
      input.type = 'number';
      input.step = '1';
      input.min  = '0';
      const n = parseInt(old,10);
      if (!isNaN(n)) input.value = String(n);
    } else {
      input.type  = 'text';
      input.value = old;
    }
    inputEl = input;
  }

  const wrap = document.createElement('div');
  wrap.className = 'cell-editor';
  wrap.appendChild(inputEl);
  td.appendChild(wrap);
  inputEl.focus();
  inputEl.select?.();

  async function saveCell(){
    if(!idToken){
      alert('Primero haz clic en “Acceder”.');
      td.textContent = old;
      return;
    }

    let value = (inputEl.value || '').trim();

    if(isDate && value && !/^\d{4}-\d{2}-\d{2}$/.test(value)){
      alert('Fecha inválida (YYYY-MM-DD).');
      inputEl.focus();
      return;
    }
    if(isInt && value && !/^-?\d+$/.test(value)){
      alert('Ingresa un entero.');
      inputEl.focus();
      return;
    }
    if(isTxt && !isComent && value.length>500){
      alert('Comentario muy largo (≤500).');
      inputEl.focus();
      return;
    }

    // Si no cambió, simplemente restaurar texto
    if (value === old.trim()){
      td.textContent = old;
      return;
    }

    td.textContent = 'Guardando…';
    try{
      const url = `${B}?route=orders.update`
        + `&idToken=${encodeURIComponent(idToken)}`
        + `&id=${encodeURIComponent(orderId)}`
        + `&field=${encodeURIComponent(col)}`
        + `&value=${encodeURIComponent(value)}`;
      const res = await jsonp(url);
      if(res && res.status === 'ok'){
        // Mostrar valor formateado si es fecha
        if (isDate && value){
          const [y,m,d] = value.split('-');
          const mon = monES[+m-1];
          td.textContent = `${d}-${mon}-${y.slice(2)}`;
        } else {
          td.textContent = value;
        }
        await refreshKpisAndCharts(getFilters());
        await renderTable(currentPage);
      } else {
        td.textContent = old;
        alert('Error: ' + (res && res.error ? res.error : 'desconocido'));
      }
    }catch(e){
      td.textContent = old;
      alert('Error de red');
    }
  }

  // Enter → guardar, Esc → cancelar, Blur → guardar
  inputEl.addEventListener('keydown', (e)=>{
    if (e.key === 'Enter'){
      e.preventDefault();
      saveCell();
    } else if (e.key === 'Escape'){
      e.preventDefault();
      td.textContent = old;
    }
  });

  inputEl.addEventListener('blur', ()=>{
    // Pequeño delay por si el blur viene de un Enter rápido
    setTimeout(()=>{
      if (document.activeElement !== inputEl){
        saveCell();
      }
    }, 50);
  });
});

/* Login / Edición UI */
const btnLogin = document.getElementById('btnLogin');
const btnEditMode = document.getElementById('btnEditMode');

function ensureGsi(){
  if (window.google && google.accounts && google.accounts.id) return true;
  alert('Falta la librería de Google Identity. Verifica <script src="https://accounts.google.com/gsi/client" async defer></script> en index.html');
  return false;
}

btnLogin?.addEventListener('click', ()=>{
  if (!ensureGsi()) return;
  google.accounts.id.initialize({
    client_id: CLIENT_ID,
    callback: (resp)=>{
      idToken = resp.credential;
      if (btnEditMode) btnEditMode.disabled = false;
      btnLogin.textContent = 'Sesión iniciada';
      alert('Sesión iniciada. Activa “Modo edición”.');
    }
  });
  google.accounts.id.prompt();
});

btnEditMode?.addEventListener('click', ()=>{
  editMode = !editMode;
  btnEditMode.textContent = `Modo edición: ${editMode ? 'ON' : 'OFF'}`;
  btnEditMode.classList.toggle('edit-on', editMode); // <- para el color azul ON
  renderTable(currentPage);
});

/* Botones con estado de carga */
const btnApplyEl   = document.getElementById('btnApply');
const btnClearEl   = document.getElementById('btnClear');
const btnRefreshEl = document.getElementById('btnRefresh');

let filtersBusy = false;

async function runFilters(action){
  if (filtersBusy) return;
  filtersBusy = true;

  [btnApplyEl, btnClearEl, btnRefreshEl].forEach(b=>{
    if (b) {
      b.disabled = true;
      b.classList.add('loading');
    }
  });

  try{
    await action();
  }finally{
    filtersBusy = false;
    [btnApplyEl, btnClearEl, btnRefreshEl].forEach(b=>{
      if (b) {
        b.disabled = false;
        b.classList.remove('loading');
      }
    });
  }
}

btnApplyEl?.addEventListener('click', ()=>{
  const f = getFilters();
  runFilters(async ()=>{
    await refreshKpisAndCharts(f);
    await renderTable(1);
    await renderQueueTable(f);
  });
});

btnClearEl?.addEventListener('click', ()=>{
  runFilters(async ()=>{
    ['fCat','fUnidad','fTipo','fGrupo','fEstado','fComent','fBuscar','fDesde','fHasta'].forEach(function(id){
      var el=document.getElementById(id); if(el) el.value='';
    });
    const f = getFilters();
    await refreshKpisAndCharts(f);
    await renderTable(1);
    await renderQueueTable(f);
  });
});

btnRefreshEl?.addEventListener('click', ()=>{
  const f = getFilters();
  runFilters(async ()=>{
    await refreshKpisAndCharts(f);
    await renderTable(currentPage);
    await renderQueueTable(f);
  });
});

/* Scroll superior sincronizado */
(function syncHScroll(){
  const topBar = document.getElementById('top-scroll');
  const tw = document.querySelector('.table-wrap');
  if(!topBar || !tw) return;
  topBar.innerHTML = `<div style="width:${Math.max(tw.scrollWidth, tw.clientWidth)}px;height:1px"></div>`;
  let lock = false;
  topBar.addEventListener('scroll', ()=>{
    if(lock) return; lock=true;
    tw.scrollLeft = topBar.scrollLeft;
    lock=false;
  });
  tw.addEventListener('scroll', ()=>{
    if(lock) return; lock=true;
    topBar.scrollLeft = tw.scrollLeft;
    lock=false;
  });
})();

/* Sticky header dynamic calculation */
function updateStickyTop(){
  try{
    const headerEl = document.querySelector('.app-header');
    const kpisEl = document.getElementById('kpis');
    const filtersEl = document.getElementById('filters');
    const headerH = headerEl?.offsetHeight || 64;
    const kpisH = kpisEl?.offsetHeight || 0;
    const filtersH = filtersEl?.offsetHeight || 0;
    const stickyTopPx = headerH + kpisH + filtersH + 12;
    document.documentElement.style.setProperty('--stickyTop', stickyTopPx + 'px');
  }catch(e){
    console.warn('updateStickyTop error', e);
  }
}
window.addEventListener('resize', ()=>{ setTimeout(updateStickyTop, 120); });

/* Exportar funciones globales */
window.renderTable = renderTable;
window.refreshKpisAndCharts = refreshKpisAndCharts;
window.fetchTable = fetchTable;
window.fetchStats = fetchStats;
window.fetchQueueMetrics = fetchQueueMetrics;
window.renderQueueTable = renderQueueTable;

/* Init */
async function init(){
  updateStickyTop();
  try{
    await populateFiltersFromMeta();
    const f = getFilters();
    await refreshKpisAndCharts(f);
    await renderTable(1);
    await renderQueueTable(f);
    setTimeout(updateStickyTop, 200);
  }catch(e){
    console.warn('init error', e);
  }
}
init();

} // guard

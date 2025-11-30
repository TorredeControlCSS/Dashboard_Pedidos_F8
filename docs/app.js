// app.js v2025-11-30h — KPIs/Charts desde stats, tabla paginada, login y edición
if (window.__APP_LOADED__) {
  console.log('app.js ya cargado, skip');
} else {
window.__APP_LOADED__ = true;
console.log('app.js v2025-11-30h');

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

/* ---------------- JSONP ---------------- */
function jsonp(url){
  return new Promise((resolve,reject)=>{
    const cb='cb_'+Math.random().toString(36).slice(2);
    window[cb]=(payload)=>{ try{ resolve(payload); } finally{ delete window[cb]; s.remove(); } };
    const s=document.createElement('script'); s.onerror=()=>reject(new Error('network'));
    s.src=url+(url.includes('?')?'&':'?')+`callback=${cb}&_=${Date.now()}`;
    document.body.appendChild(s);
  });
}

/* ---------------- Fechas ---------------- */
const monES=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const isIsoZ = v => typeof v==='string' && /^\d{4}-\d{2}-\d{2}T/.test(v) && v.endsWith('Z');
const toDDMonYY = v => { const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(v); if(!m) return v; const [_,y,mn,d]=m; return `${d}-${monES[parseInt(mn,10)-1]}-${y.slice(-2)}`; };
const parseIsoDate  = v => { const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(v||''); return m ? new Date(Date.UTC(+m[1],+m[2]-1,+m[3])) : null; };

/* ---------------- KPI/Charts (stats) ---------------- */
async function fetchStats(filters){
  const p=new URLSearchParams({route:'stats'});
  Object.entries(filters).forEach(([k,v])=>{ if(v) p.set(k,v); });
  const res=await jsonp(`${A}?${p.toString()}`);
  if(res.status!=='ok') throw new Error(res.error||'stats_error');
  return res.data;
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
  if (window.renderChartsFromStats) window.renderChartsFromStats(stats); // lo dibuja metrics.js
}

/* ---------------- Filtros ---------------- */
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

/* ---------------- Paginación/Tabla ---------------- */
async function fetchTable(page, pageSize, filters){
  const p=new URLSearchParams({route:'orders.list', page, pageSize});
  Object.entries(filters).forEach(([k,v])=>{ if(v) p.set(k,v); });
  const res=await jsonp(`${A}?${p.toString()}`);
  if(res.status!=='ok') throw new Error(res.error||'orders_error');
  return res.data;
}

function perRowMetrics(row){
  // COMPLET: SI si tiene "ENTREGA REAL"
  const complet = !!row['ENTREGA REAL'];
  // TIEMPO: días desde RECIBO F8 hasta hoy o ENTREGA REAL
  const rec = row['RECIBO F8'] && parseIsoDate(row['RECIBO F8']);
  const end = row['ENTREGA REAL'] ? parseIsoDate(row['ENTREGA REAL']) : new Date();
  const days = (rec && end) ? Math.max(0, Math.round((end-rec)/86400000)) : '';
  // FILL %
  const toNum = v => (typeof v==='number')?v: parseFloat(String(v||'').replace(',','.')) || 0;
  const asig = toNum(row['CANT. ASIG.']), sol  = toNum(row['CANT. SOL.']);
  const rasi = toNum(row['RENGLONES ASI.']), rsol = toNum(row['RENGLONES SOL.']);
  const fillCant = sol>0 ? Math.round((asig/sol)*100) : 0;
  const fillReng = rsol>0 ? Math.round((rasi/rsol)*100) : 0;
  return { TIEMPO: days ? `${days}d` : '', COMPLET: complet ? 'SI':'NO', 'FILL CANT.': `${fillCant}%`, 'FILL RENGL.': `${fillReng}%` };
}

function widthMap(){ return {
  'CATEG.':180,'UNIDAD':220,'TIPO':110,'F8 SALMI':120,'F8 SISCONI':120,'GRUPO':110,'SUSTANCIAS':160,
  'CANT. ASIG.':110,'CANT. SOL.':110,'RENGLONES ASI.':130,'RENGLONES SOL.':130,
  'FECHA F8':110,'RECIBO F8':110,'ASIGNACIÓN':110,'SALIDA':110,'DESPACHO':110,'FACTURACIÓN':120,'EMPACADO':110,
  'PROY. ENTREGA':130,'ENTREGA REAL':130,'INCOTERM':110,'ESTADO':130,'COMENT.':220,
  'TIEMPO':90,'COMPLET':100,'FILL CANT.':110,'FILL RENGL.':120
};}

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
    // fechas bonitas
    Object.keys(out).forEach(k=>{ if (isIsoZ(out[k])) out[k]=toDDMonYY(out[k]); });
    // métricas por renglón
    Object.assign(out, perRowMetrics(r));
    return out;
  });
  currentIdCol = headers.find(h=>N(h)===N_ID) || null;

  // pinta
  const thead=document.querySelector('#tabla thead');
  const tbody=document.querySelector('#tabla tbody');
  if (thead) thead.innerHTML = `<tr>${currentHeaders.map(h=>`<th style="width:${W[h]||120}px">${h}</th>`).join('')}</tr>`;
  if (tbody) {
    tbody.innerHTML = currentRows.map((r,ri)=>`<tr>${
      currentHeaders.map(k=>{
        const kN=N(k);
        const editable = editMode && (S_DATE.has(kN) || S_INT.has(kN) || S_TXT.has(kN));
        const cls = editable ? ' class="editable"' : '';
        return `<td${cls} data-ri="${ri}" data-col="${k}" style="width:${W[k]||120}px">${r[k]??''}</td>`;
      }).join('')
    }</tr>`).join('');
  }

  // paginación con saltos ±100
  const totalPages=Math.ceil((data.total||0)/pageSize);
  const prev=Math.max(1,page-1), next=Math.min(totalPages,page+1);
  const jump=100/pageSize|0 || 1;
  const minus100=Math.max(1, page - (jump*1));
  const plus100 =Math.min(totalPages, page + (jump*1));
  document.getElementById('paginacion').innerHTML =
    `<button onclick="renderTable(${prev})"${page===1?' disabled':''}>« Anterior</button>`+
    `<button onclick="renderTable(${minus100})">-100</button>`+
    `<span style="padding:4px 8px">Página ${page} / ${totalPages}</span>`+
    `<button onclick="renderTable(${plus100})">+100</button>`+
    `<button onclick="renderTable(${next})"${page===totalPages?' disabled':''}>Siguiente »</button>`;
}

/* ---------------- Edición inline ---------------- */
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
        td.textContent = isDate ? (()=>{ const [y,m,d]=value.split('-'); return `${d}-${monES[+m-1]}-${y.slice(2)}`; })() : value;
        await refreshKpisAndCharts(getFilters());
        const m=document.querySelector('#paginacion span')?.textContent.match(/Página (\d+)/); const cur=m?+m[1]:1;
        await renderTable(cur);
      } else { td.innerHTML=old; alert('Error: '+(res.error||'desconocido')); }
    }catch(e){ td.innerHTML=old; alert('Error de red'); }
  };
});

/* ---------------- Login / edición ---------------- */
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
  // Render “silencioso” para obtener el credential:
  google.accounts.id.prompt(); // muestra one-tap si procede
});

btnEditMode?.addEventListener('click', ()=>{
  editMode=!editMode;
  btnEditMode.textContent=`Modo edición: ${editMode?'ON':'OFF'}`;
});

/* ---------------- Buttons: aplicar / limpiar / actualizar ---------------- */
document.getElementById('btnApply')?.addEventListener('click', async ()=>{
  await refreshKpisAndCharts(getFilters()); await renderTable(1);
});
document.getElementById('btnClear')?.addEventListener('click', async ()=>{
  ['fCat','fUnidad','fTipo','fGrupo','fEstado','fBuscar','fDesde','fHasta'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  await refreshKpisAndCharts(getFilters()); await renderTable(1);
});
document.getElementById('btnRefresh')?.addEventListener('click', async ()=>{
  await refreshKpisAndCharts(getFilters());
  const m=document.querySelector('#paginacion span')?.textContent.match(/Página (\d+)/); const cur=m?+m[1]:1;
  await renderTable(cur);
});

/* ---------------- Init ---------------- */
async function init(){
  await refreshKpisAndCharts(getFilters());
  await renderTable(1);
}
init();

} // guard

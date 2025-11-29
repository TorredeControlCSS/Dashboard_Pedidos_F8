// ===== docs/app.js =====

// URL del Web App A (la pones en index.html como window.APP.A_URL)
const A = window.APP.A_URL;

/* =========================
   FORMATEO DE FECHAS (GENÉRICO)
   - Detecta valores ISO tipo: 2025-02-04T00:00:00.000Z
   - Muestra: dd-mmm-yy (ej: 04-feb-25)
   ========================= */
function isIsoDateTimeZ(v){
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) && v.endsWith('Z');
}

function formatIsoToDDMonYY(v){
  // No usamos new Date() para evitar cambios por zona horaria
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
  if (!m) return v;
  const [_, yyyy, mm, dd] = m;
  const monIdx = parseInt(mm, 10) - 1;
  const mon = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'][monIdx];
  return `${dd}-${mon}-${yyyy.slice(-2)}`;
}

function formatAllIsoDatesInRow(row){
  const out = {...row};
  for (const k of Object.keys(out)){
    if (isIsoDateTimeZ(out[k])) out[k] = formatIsoToDDMonYY(out[k]);
  }
  return out;
}
/* ========== FIN FECHAS ========== */

// KPIs
function renderKpis(d){
  document.getElementById('kpis').innerHTML = `Total pedidos: ${d.totalPedidos}`;
}
function loadKpis(){
  window.onKpis = (res)=>renderKpis(res.data);
  const s = document.createElement('script');
  s.src = `${A}?route=kpis&callback=onKpis&_=${Date.now()}`;
  document.body.appendChild(s);
}

// Tabla paginada
function renderTabla(page){
  window.onOrders = (res)=>{
    let {rows, total, page, pageSize} = res.data;

    // Formatear fechas para cualquier columna ISO
    rows = rows.map(formatAllIsoDatesInRow);

    const head = document.querySelector('#tabla thead');
    const body = document.querySelector('#tabla tbody');

    head.innerHTML = rows.length
      ? `<tr>${Object.keys(rows[0]).map(h=>`<th>${h}</th>`).join('')}</tr>`
      : '';

    body.innerHTML = rows
      .map(r=>`<tr>${Object.values(r).map(v=>`<td>${v ?? ''}</td>`).join('')}</tr>`)
      .join('');

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

// Init
function init(){
  loadKpis();
  renderTabla(1);
}
init();

// Botón Editar (lo conectaremos al Web App B en el siguiente paso)
// document.getElementById('btnEditar').href = '#';

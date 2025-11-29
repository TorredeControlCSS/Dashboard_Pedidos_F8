const A = window.APP.A_URL;
// ====== FORMATEO DE FECHAS ======
const DATE_FIELDS = ['fecha_pedido','fecha_entrega_estimada','fecha_entrega_real','updated_at']; // ajusta a tus encabezados reales

function formatDateDDMonYY(v){
  const d = new Date(v);
  if (isNaN(d)) return v; // si no es fecha, deja tal cual
  const dd = String(d.getDate()).padStart(2, '0');
  const mon = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'][d.getMonth()];
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}-${mon}-${yy}`;
}

function formatRowDates(row){
  const out = {...row};
  for (const f of DATE_FIELDS){
    if (out[f]) out[f] = formatDateDDMonYY(out[f]);
  }
  return out;
}
// ====== FIN FORMATEO DE FECHAS ======

function renderKpis(d){ document.getElementById('kpis').innerHTML = `Total pedidos: ${d.totalPedidos}`; }
function renderTabla(page){
window.onOrders = (res)=>{
  let {rows,total,page,pageSize} = res.data;

  // 🔽 NUEVO: formatear fechas antes de pintar
  rows = rows.map(formatRowDates);

  const head = document.querySelector('#tabla thead');
  const body = document.querySelector('#tabla tbody');
  // ...
const body = document.querySelector('#tabla tbody');
head.innerHTML = rows.length? `<tr>${Object.keys(rows[0]).map(h=>`<th>${h}</th>`).join('')}</tr>`:'';
body.innerHTML = rows.map(r=>`<tr>${Object.values(r).map(v=>`<td>${v??''}</td>`).join('')}</tr>`).join('');
const pages = Math.ceil(total/pageSize);
document.getElementById('paginacion').innerHTML = Array.from({length:pages},(_,i)=>`<button ${i+1===page?'disabled':''} onclick=\"renderTabla(${i+1})\">${i+1}</button>`).join('');
};
const s=document.createElement('script');
s.src=`${A}?route=orders.list&page=${page||1}&pageSize=200&callback=onOrders&_=${Date.now()}`;
document.body.appendChild(s);
}
function loadKpis(){
window.onKpis=(res)=>renderKpis(res.data);
const s=document.createElement('script'); s.src=`${A}?route=kpis&callback=onKpis&_=${Date.now()}`; document.body.appendChild(s);
}
function init(){ loadKpis(); renderTabla(1); }
init();
document.getElementById('btnEditar').href = '#';

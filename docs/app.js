const A = window.APP.A_URL;
function renderKpis(d){ document.getElementById('kpis').innerHTML = `Total pedidos: ${d.totalPedidos}`; }
function renderTabla(page){
window.onOrders = (res)=>{
const {rows,total,page,pageSize}=res.data; const head = document.querySelector('#tabla thead');
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

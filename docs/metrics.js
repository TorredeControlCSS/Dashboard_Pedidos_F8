// v2025-11-30c metrics — recibe un objeto "stats" desde el backend
console.log('metrics.js v2025-11-30c');

let CHART_LINE, CHART_DONUT, CHART_GROUPS;

function makeLine(ctx, stats){
  const data = {
    labels: stats.series.labels,
    datasets: [
      { label: 'Pedidos recibidos', data: stats.series.recibidos, borderWidth: 2, fill:false, tension:0.2 },
      { label: 'Pedidos completados', data: stats.series.completados, borderWidth: 2, fill:false, tension:0.2 },
      { label: 'Proyectado entrega', data: stats.series.proyectados, borderWidth: 2, fill:false, tension:0.2 }
    ]
  };
  return new Chart(ctx, { type:'line', data, options:{
    responsive:true, maintainAspectRatio:false,
    plugins:{ legend:{ position:'bottom' }, title:{ display:true, text:'Evolución de Pedidos' } },
    scales:{ x:{ ticks:{ autoSkip:true, maxTicksLimit:12 } } }
  }});
}

function makeDonut(ctx, stats){
  const labels = Object.keys(stats.distEstados);
  const data = labels.map(k=> stats.distEstados[k]);
  return new Chart(ctx, { type:'doughnut', data:{ labels, datasets:[{ data }] }, options:{
    responsive:true, maintainAspectRatio:false,
    plugins:{ legend:{ position:'bottom' }, title:{ display:true, text:'Distribución por Estados' } }
  }});
}

function makeGroups(ctx, stats){
  const grupos = Object.keys(stats.grupos);
  const estados = ['F8 RECIBIDA','EN ASIGNACIÓN','SALIDA DE SALMI','FACTURADO','EMPACADO','ENTREGADA'];
  const datasets = estados.map((st)=>({
    label: st,
    data: grupos.map(g=>{
      const gg = stats.grupos[g];
      const n = gg[st]||0;
      return gg.total ? Math.round((n*100)/gg.total) : 0;
    })
  }));
  return new Chart(ctx, { type:'bar', data:{ labels:grupos, datasets }, options:{
    responsive:true, maintainAspectRatio:false,
    plugins:{ legend:{ position:'bottom' }, title:{ display:true, text:'Estado de Avance por Grupo (% de pedidos)' } },
    scales:{ x:{ ticks:{ maxRotation:45, minRotation:45 } }, y:{ beginAtZero:true, max:100 } }
  }});
}

function renderChartsFromStats(stats){
  const lineCtx  = document.getElementById('chart-evol').getContext('2d');
  const donutCtx = document.getElementById('chart-estado-pastel').getContext('2d');
  const grpCtx   = document.getElementById('chart-estado-grupo').getContext('2d');

  if (CHART_LINE) CHART_LINE.destroy();
  if (CHART_DONUT) CHART_DONUT.destroy();
  if (CHART_GROUPS) CHART_GROUPS.destroy();

  CHART_LINE  = makeLine(lineCtx, stats);
  CHART_DONUT = makeDonut(donutCtx, stats);
  CHART_GROUPS= makeGroups(grpCtx, stats);
}

// Expuesto a app.js
window.renderChartsFromStats = renderChartsFromStats;

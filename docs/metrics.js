// metrics.js v2025-11-30c
console.log('metrics.js v2025-11-30c');

let _chEvol, _chDonut, _chGrupos;

function _ensureCtx(id){ const el=document.getElementById(id); return el ? el.getContext('2d') : null; }

function renderChartsFromStats(stats){
  if(!stats) return;

  // ---- Evolución: recibidos / completados / proyectado
  (()=> {
    const ctx=_ensureCtx('ch-evol'); if(!ctx) return;
    const L=stats.series?.labels||[];
    const R=stats.series?.recibidos||[];
    const C=stats.series?.completados||[];
    const P=stats.series?.proyectados||[];
    if(_chEvol) _chEvol.destroy();
    _chEvol=new Chart(ctx,{
      type:'line',
      data:{
        labels:L,
        datasets:[
          {label:'Pedidos recibidos', data:R, fill:false, tension:.25},
          {label:'Pedidos completados', data:C, fill:false, tension:.25},
          {label:'Proyectado entrega', data:P, fill:false, tension:.25}
        ]
      },
      options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom'}} }
    });
  })();

  // ---- Donut por estados
  (()=> {
    const ctx=_ensureCtx('ch-donut'); if(!ctx) return;
    const obj=stats.distEstados||{};
    const labels=Object.keys(obj);
    const values=labels.map(k=>obj[k]);
    if(_chDonut) _chDonut.destroy();
    _chDonut=new Chart(ctx,{type:'doughnut', data:{labels,datasets:[{data:values}]},
      options:{responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom'}}}});
  })();

  // ---- Barras por grupo (% pedidos por estado)
  (()=> {
    const ctx=_ensureCtx('ch-grupos'); if(!ctx) return;
    const G=stats.grupos||{};
    const grupos=Object.keys(G);
    const estados=['F8 RECIBIDA','EN ASIGNACIÓN','SALIDA DE SALMI','FACTURADO','EMPACADO','ENTREGADA'];
    const datasets=estados.map(est=>({
      label: est,
      data: grupos.map(g=>{
        const total = G[g]?.total||0;
        const n = G[g]?.[est]||0;
        return total>0 ? Math.round((n/total)*100) : 0;
      })
    }));
    if(_chGrupos) _chGrupos.destroy();
    _chGrupos=new Chart(ctx,{type:'bar',
      data:{labels:grupos,datasets},
      options:{responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom'}}, scales:{y:{ticks:{callback:v=>v+'%'}}}}
    });
  })();
}

window.renderChartsFromStats = renderChartsFromStats;

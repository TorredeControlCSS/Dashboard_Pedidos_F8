// metrics.js v2025-12-01a
console.log('metrics.js v2025-12-01a');

let _chEvol, _chDonut; // Se eliminó _chGrupos

function _ctx(id){ const el=document.getElementById(id); return el ? el.getContext('2d') : null; }

function renderChartsFromStats(stats){
  if(!stats) return;

// EVOLUCIÓN
(()=>{
  const ctx=_ctx('ch-evol'); if(!ctx) return;
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
        {label:'Pedidos recibidos',   data:R, fill:false, tension:.25},
        {label:'Pedidos completados', data:C, fill:false, tension:.25},
        {label:'Proyectado entrega',  data:P, fill:false, tension:.25}
      ]
    },
    options:{
      responsive:true,
      maintainAspectRatio:false,
      plugins:{
        legend:{ position:'bottom' },
        tooltip:{
          mode:'nearest',        // toma el punto más cercano
          intersect:false,       // no exige estar justo encima
        }
      },
      interaction:{
        mode:'nearest',          // comportamiento general de hover
        intersect:false,         // más tolerante al mouse
        axis:'x'                 // opcional: se fija por eje X (fecha)
      }
    }
  });
})();

  // COMENTARIOS (nuevo gráfico, reemplaza donut de estados)
  (()=>{
    const ctx=_ctx('ch-donut'); if(!ctx) return;
    const obj=stats.comentarios || {};
    const labels=Object.keys(obj);
    const values=labels.map(k=>obj[k]);

    if(_chDonut) _chDonut.destroy();
    _chDonut = new Chart(ctx,{
      type:'bar',
      data:{
        labels,
        datasets:[{
          label:'Pedidos',
          data: values,
          backgroundColor:'#60a5fa'
        }]
      },
      options:{
        indexAxis:'y', // barras horizontales
        responsive:true,
        maintainAspectRatio:false,
        plugins:{
          legend:{ display:false }
        },
        scales:{
          x:{ beginAtZero:true, ticks:{ precision:0 } },
          y:{ ticks:{ font:{ size:11 } } }
        }
      }
    });
  })();

  // ELIMINADO: Bloque "BARRAS POR GRUPO"
}

window.renderChartsFromStats = renderChartsFromStats;

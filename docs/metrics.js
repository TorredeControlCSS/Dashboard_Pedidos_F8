// metrics.js v2025-12-01a
console.log('metrics.js v2025-12-01a');

let _chEvol, _chDonut, _chGrupos;

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
          {label:'Pedidos recibidos', data:R, fill:false, tension:.25},
          {label:'Pedidos completados', data:C, fill:false, tension:.25},
          {label:'Proyectado entrega', data:P, fill:false, tension:.25}
        ]
      },
      options:{ responsive:true, maintainAspectRatio:false, plugins:{legend:{position:'bottom'}} }
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

  // BARRAS POR GRUPO (apiladas, etiquetas G1..G15)
  (()=>{
    const ctx=_ctx('ch-grupos'); if(!ctx) return;
    const G = stats.grupos || {};

    // Ordenamos grupos por nombre para que queden G1..G15 en orden
    const gruposFull = Object.keys(G).sort();

    // Etiquetas cortas: prefijo antes del primer espacio (G1, G2, G10 MQ -> G10)
    const gruposShort = gruposFull.map(g => {
      const parts = String(g).trim().split(' ');
      return parts[0] || g;
    });

    const estados = ['F8 RECIBIDA','EN ASIGNACIÓN','SALIDA DE SALMI','FACTURADO','EMPACADO','ENTREGADA'];

    const datasets = estados.map(est => ({
      label: est,
      data: gruposFull.map(g => {
        const total = G[g]?.total || 0;
        const n = G[g]?.[est] || 0;
        return total > 0 ? Math.round((n/total) * 100) : 0;
      })
    }));

    if (_chGrupos) _chGrupos.destroy();
    _chGrupos = new Chart(ctx,{
      type:'bar',
      data:{
        labels: gruposShort,
        datasets
      },
      options:{
        responsive:true,
        maintainAspectRatio:false,
        plugins:{
          legend:{
            position:'bottom',
            labels:{
              font:{ size:10 },        // leyenda más pequeña
              boxWidth:10,
              boxHeight:10
            }
          },
          tooltip:{
            callbacks:{
              // Mostrar nombre completo del grupo en tooltip
              title:(items)=>{
                const idx = items[0].dataIndex;
                return gruposFull[idx] || gruposShort[idx];
              },
              label:(ctx)=>{
                const dsLabel = ctx.dataset.label || '';
                const v = ctx.parsed.y || 0;
                return `${dsLabel}: ${v}%`;
              }
            }
          }
        },
        scales:{
          x:{
            stacked:true,
            ticks:{ font:{ size:11 } }
          },
          y:{
            stacked:true,
            ticks:{
              callback:v => v + '%',
              max:100
            }
          }
        }
      }
    });
  })();
}

window.renderChartsFromStats = renderChartsFromStats;



// v2025-11-30a
console.log('metrics.js v2025-11-30a');

// Fuente Chart.js
if (window.Chart && Chart.defaults && Chart.defaults.font) {
  try { Chart.defaults.font.family = getComputedStyle(document.body).fontFamily || 'inherit'; } catch(e){}
}

// Estado por fila
function deriveStage(row){
  const has = k => row[k] && String(row[k]).trim().length > 0;
  if (has('ENTREGA REAL'))     return 'ENTREGADA';
  if (has('EMPACADO'))         return 'EMPACADO';
  if (has('FACTURACIÓN'))      return 'FACTURADO';
  if (has('DESPACHO'))         return 'SALIDA DE SALMI';
  if (has('ASIGNACIÓN'))       return 'EN ASIGNACIÓN';
  if (has('F8 SALMI'))         return 'F8 RECIBIDA';
  return 'PENDIENTE';
}

// Indicadores por fila
function derivePerRow(row){
  const estado = deriveStage(row);
  const parseSheetDate = (v)=>{
    if (!v) return null;
    if (v instanceof Date) return v;
    if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return new Date(v);
    return null;
  };
  const fechaF8 = parseSheetDate(row['FECHA F8']) || parseSheetDate(row['RECIBO F8']);
  const fin = parseSheetDate(row['ENTREGA REAL']) || new Date();
  const dias = (fechaF8 && fin) ? Math.max(0, Math.round((fin - fechaF8)/(1000*60*60*24))) : null;

  const asig = parseInt(row['CANT. ASIG.']||0,10)||0;
  const sol  = parseInt(row['CANT. SOL.']||0,10)||0;
  const rAsi = parseInt(row['RENGLONES ASI.']||0,10)||0;
  const rSol = parseInt(row['RENGLONES SOL.']||0,10)||0;

  const fillCant = sol ? Math.round((asig/sol)*100) : 0;
  const fillReng = rSol ? Math.round((rAsi/rSol)*100) : 0;
  const completado = estado==='ENTREGADA' ? 'SI' : 'NO';

  return {
    ESTADO: estado, TIEMPO: dias!=null? `${dias}d` : '',
    COMPLET: completado, 'FILL CANT.': `${fillCant}%`, 'FILL RENGL.': `${fillReng}%`
  };
}

// Series tiempo globales (RECIBO F8 / ENTREGA REAL / PROY. ENTREGA)
function buildTimeSeries(rows){
  const add = (map, key)=>{ if(!key) return; map[key] = (map[key]||0)+1; };
  const rec = {}, comp = {}, proj = {};
  for (const r of rows){
    const kRec  = (r['RECIBO F8']||'').slice(0,10);
    const kComp = (r['ENTREGA REAL']||'').slice(0,10);
    const kProj = (r['PROY. ENTREGA']||'').slice(0,10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(kRec))  add(rec,  kRec);
    if (/^\d{4}-\d{2}-\d{2}$/.test(kComp)) add(comp, kComp);
    if (/^\d{4}-\d{2}-\d{2}$/.test(kProj)) add(proj, kProj);
  }
  const allDays = Array.from(new Set([...Object.keys(rec),...Object.keys(comp),...Object.keys(proj)])).sort();
  return {
    labels: allDays,
    recibidos:   allDays.map(d=>rec[d]||0),
    completados: allDays.map(d=>comp[d]||0),
    proyectados: allDays.map(d=>proj[d]||0)
  };
}

// Agregados (globales)
function buildAggregates(rows){
  const byGroup = new Map();
  const tot = { pedidos: rows.length, urgencia: 0, mensual: 0, asignado: 0, solicitado: 0, renglonesAsig: 0, renglonesSol: 0 };

  for (const r of rows){
    const stage = deriveStage(r);
    const g = r['GRUPO'] || 'SIN GRUPO';
    if (!byGroup.has(g)) byGroup.set(g, {group:g, total:0,
      'F8 RECIBIDA':0,'EN ASIGNACIÓN':0,'SALIDA DE SALMI':0,'FACTURADO':0,'EMPACADO':0,'ENTREGADA':0,'PENDIENTE':0
    });
    const b = byGroup.get(g); b.total++; b[stage]++;

    const tipo = String(r['TIPO']||'').toUpperCase();
    if (tipo==='URGENCIA') tot.urgencia++; if (tipo==='MENSUAL') tot.mensual++;
    tot.asignado+=parseInt(r['CANT. ASIG.']||0,10)||0;
    tot.solicitado+=parseInt(r['CANT. SOL.']||0,10)||0;
    tot.renglonesAsig+=parseInt(r['RENGLONES ASI.']||0,10)||0;
    tot.renglonesSol+=parseInt(r['RENGLONES SOL.']||0,10)||0;
  }

  const groups = Array.from(byGroup.values()).map(x=>{
    const pct = k => x.total ? Math.round((x[k]/x.total)*100) : 0;
    return {...x, pct:{
      recibida:pct('F8 RECIBIDA'), asignacion:pct('EN ASIGNACIÓN'),
      salida:pct('SALIDA DE SALMI'), fact:pct('FACTURADO'),
      emp:pct('EMPACADO'), ent:pct('ENTREGADA')
    }};
  });

  return { tot, groups };
}

// KPIs globales
function renderKpisCompact(tot){
  const set = (id, v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
  set('kpi-total', (tot.pedidos||0).toLocaleString());
  set('kpi-asignado', (tot.asignado||0).toLocaleString());
  set('kpi-solicitado', (tot.solicitado||0).toLocaleString());
  set('kpi-reng-asig', (tot.renglonesAsig||0).toLocaleString());
  set('kpi-reng-sol', (tot.renglonesSol||0).toLocaleString());
  set('kpi-urg', tot.urgencia||0);
  set('kpi-men', tot.mensual||0);
}

// Gráficos
let chartEvol=null, chartPastel=null, chartGrupo=null;

function renderEvolucionSeries(series){
  const el=document.getElementById('chart-evol'); if(!el) return;
  if (chartEvol) chartEvol.destroy();
  chartEvol = new Chart(el.getContext('2d'), {
    type:'line',
    data:{ labels: series.labels, datasets:[
      {label:'Pedidos recibidos',   data:series.recibidos,   tension:.3},
      {label:'Pedidos completados', data:series.completados, tension:.3},
      {label:'Proyectado entrega',  data:series.proyectados, tension:.3}
    ]},
    options:{
      responsive:true,
      interaction:{ mode:'index', intersect:false },
      plugins:{ legend:{position:'bottom'},
        tooltip:{ callbacks:{ label:(ctx)=>`${ctx.dataset.label}: ${ctx.parsed.y.toLocaleString()}` } }
      },
      scales:{ x:{ ticks:{ maxRotation:0, autoSkip:true } }, y:{ beginAtZero:true, grace:'10%' } }
    }
  });
}

function renderDistribucionEstadosGlobal(rowsAll){
  const el=document.getElementById('chart-estado-pastel'); if(!el) return;
  const labels=['F8 RECIBIDA','EN ASIGNACIÓN','SALIDA DE SALMI','FACTURADO','EMPACADO','ENTREGADA'];
  const counts = labels.map(l => rowsAll.filter(r=>deriveStage(r)===l).length);
  const total = rowsAll.length || 1;
  if (chartPastel) chartPastel.destroy();
  chartPastel = new Chart(el.getContext('2d'), {
    type:'doughnut',
    data:{ labels, datasets:[{ data:counts }] },
    options:{
      responsive:true, maintainAspectRatio:true, cutout:'72%', layout:{padding:6},
      plugins:{ legend:{ position:'bottom' },
        tooltip:{ callbacks:{ label:(ctx)=>`${ctx.label}: ${Math.round(ctx.parsed/total*100)}% (${ctx.parsed})` } }
      }
    }
  });
}

function renderEstadoPorGrupo100(groups){
  const el=document.getElementById('chart-estado-grupo'); if(!el) return;
  const labels = groups.map(g=>g.group);
  const series = [
    {k:'F8 RECIBIDA', lab:'F8 RECIBIDA'},
    {k:'EN ASIGNACIÓN', lab:'EN ASIGNACIÓN'},
    {k:'SALIDA DE SALMI', lab:'SALIDA DE SALMI'},
    {k:'FACTURADO', lab:'FACTURADO'},
    {k:'EMPACADO', lab:'EMPACADO'},
    {k:'ENTREGADA', lab:'ENTREGADA'}
  ];
  const datasets = series.map(s=>({
    label:s.lab,
    data: groups.map(g=> g.total ? Math.round((g[s.k]/g.total)*100) : 0)
  }));
  if (chartGrupo) chartGrupo.destroy();
  chartGrupo = new Chart(el.getContext('2d'), {
    type:'bar',
    data:{ labels, datasets },
    options:{
      responsive:true,
      plugins:{ legend:{position:'bottom'},
        tooltip:{ callbacks:{ label:(ctx)=>{
          const g=groups[ctx.dataIndex]; const n=g[series[ctx.datasetIndex].k]||0; const p=ctx.parsed.y;
          return `${ctx.dataset.label}: ${p}% (${n})`;
        }}}
      },
      scales:{ x:{ stacked:true, ticks:{ maxRotation:45, minRotation:45 } }, y:{ stacked:true, beginAtZero:true, max:100 } }
    }
  });
}

// Maestro
async function computeAndRenderMetrics(allRows, filteredRows){
  const { tot, groups } = buildAggregates(allRows);
  renderKpisCompact(tot);
  renderEvolucionSeries(buildTimeSeries(allRows));
  renderDistribucionEstadosGlobal(allRows);
  renderEstadoPorGrupo100(groups);
}

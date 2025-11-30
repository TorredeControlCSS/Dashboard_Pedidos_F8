// ===== Estado por fila (según fechas) =====
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

// ===== Indicadores por pedido =====
function derivePerRow(row){
  const estado = deriveStage(row);
  // tiempo = días desde FECHA F8 hasta ENTREGADA (o hoy si no entregada)
  const parseSheetDate = (v)=>{
    if (!v) return null;
    // Si viene como "dd-mmm-yy" o Date, intentamos parse simple
    if (v instanceof Date) return v;
    if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return new Date(v);
    // dd-mmm-yy → Date.parse no siempre entiende “may”, “ene” local; dejamos nulo
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
    ESTADO: estado,
    TIEMPO: dias!=null? `${dias}d` : '',
    COMPLET: completado,
    'FILL CANT.': `${fillCant}%`,
    'FILL RENGL.': `${fillReng}%`
  };
}

// ===== Agregaciones globales =====
function buildAggregates(rows){
  const byGroup = new Map();
  const tot = {
    pedidos: rows.length, urgencia: 0, mensual: 0,
    asignado: 0, solicitado: 0, renglonesAsig: 0, renglonesSol: 0
  };
  const evol = {}; // { 'YYYY-MM-DD': {rec: N, comp: M} }

  for (const r of rows){
    const stage = deriveStage(r);
    const g = r['GRUPO'] || 'SIN GRUPO';
    if (!byGroup.has(g)) byGroup.set(g, {group:g, total:0,
      'F8 RECIBIDA':0,'EN ASIGNACIÓN':0,'SALIDA DE SALMI':0,'FACTURADO':0,'EMPACADO':0,'ENTREGADA':0,'PENDIENTE':0
    });
    const bucket = byGroup.get(g);
    bucket.total++; bucket[stage]++;

    const tipo = String(r['TIPO']||'').toUpperCase();
    if (tipo==='URGENCIA') tot.urgencia++; if (tipo==='MENSUAL') tot.mensual++;
    tot.asignado+=parseInt(r['CANT. ASIG.']||0,10)||0;
    tot.solicitado+=parseInt(r['CANT. SOL.']||0,10)||0;
    tot.renglonesAsig+=parseInt(r['RENGLONES ASI.']||0,10)||0;
    tot.renglonesSol+=parseInt(r['RENGLONES SOL.']||0,10)||0;

    // Evolución: por FECHA F8 (recibidos) y ENTREGADA (completados)
    const toKey = (v)=>{
      if (!v) return null;
      if (/^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0,10);
      if (v instanceof Date) return v.toISOString().slice(0,10);
      return null;
    };
    const kRec = toKey(r['FECHA F8']) || toKey(r['RECIBO F8']);
    if (kRec){ evol[kRec] = evol[kRec]||{rec:0, comp:0}; evol[kRec].rec++; }
    const kComp = toKey(r['ENTREGA REAL']);
    if (kComp){ evol[kComp] = evol[kComp]||{rec:0, comp:0}; evol[kComp].comp++; }
  }

  // porcentajes por grupo
  const groups = Array.from(byGroup.values()).map(x=>{
    const pct = k => x.total ? Math.round((x[k]/x.total)*100) : 0;
    return {...x, pct:{
      recibida:pct('F8 RECIBIDA'), asignacion:pct('EN ASIGNACIÓN'),
      salida:pct('SALIDA DE SALMI'), fact:pct('FACTURADO'),
      emp:pct('EMPACADO'), ent:pct('ENTREGADA')
    }};
  });

  // Evolución ordenada por fecha
  const evolSorted = Object.keys(evol).sort().map(k=>({date:k, ...evol[k]}));

  return { tot, groups, evol: evolSorted };
}

// ===== KPIs =====
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

// ===== Gráficos =====
let chartEvol=null, chartPastel=null, chartGrupo=null;

function renderEvolucion(chartData){
  const el=document.getElementById('chart-evol'); if(!el) return;
  const labels = chartData.map(x=>x.date);
  const rec = chartData.map(x=>x.rec);
  const comp = chartData.map(x=>x.comp);
  if (chartEvol) chartEvol.destroy();
  chartEvol = new Chart(el.getContext('2d'), {
    type:'line',
    data:{ labels, datasets:[
      {label:'Pedidos recibidos', data:rec, tension:.3},
      {label:'Pedidos completados', data:comp, tension:.3}
    ]},
    options:{ responsive:true, plugins:{
      legend:{position:'bottom'},
      tooltip:{ callbacks:{ label:(ctx)=>`${ctx.dataset.label}: ${ctx.parsed.y}` } }
    }, scales:{ y:{ beginAtZero:true } } }
  });
}

function renderDistribucionEstados(rows){
  const el=document.getElementById('chart-estado-pastel'); if(!el) return;
  const labels=['F8 RECIBIDA','EN ASIGNACIÓN','SALIDA DE SALMI','FACTURADO','EMPACADO','ENTREGADA'];
  const counts = labels.map(l => rows.filter(r=>deriveStage(r)===l).length);
  const total = rows.length || 1;
  if (chartPastel) chartPastel.destroy();
  chartPastel = new Chart(el.getContext('2d'), {
    type:'doughnut',
    data:{ labels, datasets:[{ data:counts }] },
    options:{ responsive:true, plugins:{
      legend:{ position:'bottom' },
      tooltip:{ callbacks:{
        label:(ctx)=>{
          const n=ctx.parsed; const p=Math.round((n/total)*100);
          return `${ctx.label}: ${n} (${p}%)`;
        }
      } }
    } }
  });
}

function renderEstadoPorGrupo100(groups){
  const el=document.getElementById('chart-estado-grupo'); if(!el) return;
  const labels = groups.map(g=>g.group);
  const total = (g)=>g.total||1;
  const series = [
    {k:'F8 RECIBIDA',      lab:'F8 RECIBIDA'},
    {k:'EN ASIGNACIÓN',    lab:'EN ASIGNACIÓN'},
    {k:'SALIDA DE SALMI',  lab:'SALIDA DE SALMI'},
    {k:'FACTURADO',        lab:'FACTURADO'},
    {k:'EMPACADO',         lab:'EMPACADO'},
    {k:'ENTREGADA',        lab:'ENTREGADA'}
  ];
  const datasets = series.map(s=>({
    label:s.lab,
    data: groups.map(g=> Math.round((g[s.k]/total(g))*100))
  }));
  if (chartGrupo) chartGrupo.destroy();
  chartGrupo = new Chart(el.getContext('2d'), {
    type:'bar',
    data:{ labels, datasets },
    options:{ responsive:true, plugins:{
      legend:{position:'bottom'},
      tooltip:{ callbacks:{ label:(ctx)=>{
        const g=groups[ctx.dataIndex];
        const n=g[series[ctx.datasetIndex].k];
        const p=ctx.parsed.y;
        return `${ctx.dataset.label}: ${p}% (${n})`;
      }}}
    }, scales:{ x:{ stacked:true }, y:{ stacked:true, beginAtZero:true, max:100 } } }
  });
}

// ===== Entrada única para métricas y gráficos =====
async function computeAndRenderMetricsFromRows(allRows){
  const { tot, groups, evol } = buildAggregates(allRows);
  renderKpisCompact(tot);
  renderEvolucion(evol);
  renderDistribucionEstados(allRows);
  renderEstadoPorGrupo100(groups);
}

// ===== Derivar estado por fila (según fechas) =====
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

// ===== Agregaciones para KPIs + Estado por grupo =====
function buildAggregates(rows){
  const byGroup = new Map();
  const tot = {
    pedidos: rows.length,
    urgencia: 0, mensual: 0,
    asignado: 0, solicitado: 0,
    renglonesAsig: 0, renglonesSol: 0
  };

  for (const r of rows){
    const stage = deriveStage(r);
    const g = r['GRUPO'] || 'SIN GRUPO';
    if (!byGroup.has(g)) byGroup.set(g, {group:g, total:0,
      'F8 RECIBIDA':0,'EN ASIGNACIÓN':0,'SALIDA DE SALMI':0,'FACTURADO':0,'EMPACADO':0,'ENTREGADA':0,'PENDIENTE':0
    });
    const bucket = byGroup.get(g);
    bucket.total++; bucket[stage]++;

    const tipo = String(r['TIPO']||'').toUpperCase();
    if (tipo === 'URGENCIA') tot.urgencia++;
    if (tipo === 'MENSUAL')  tot.mensual++;

    tot.asignado      += parseInt(r['CANT. ASIG.']||0,10)||0;
    tot.solicitado    += parseInt(r['CANT. SOL.']||0,10)||0;
    tot.renglonesAsig += parseInt(r['RENGLONES ASI.']||0,10)||0;
    tot.renglonesSol  += parseInt(r['RENGLONES SOL.']||0,10)||0;
  }

  const groups = Array.from(byGroup.values()).map(x=>{
    const pct = k => x.total ? Math.round((x[k]/x.total)*100) : 0;
    return {...x, pct:{
      recibida: pct('F8 RECIBIDA'),
      asignacion: pct('EN ASIGNACIÓN'),
      salida: pct('SALIDA DE SALMI'),
      fact: pct('FACTURADO'),
      emp: pct('EMPACADO'),
      ent: pct('ENTREGADA')
    }};
  });

  return { tot, groups };
}

// ===== Pintar KPIs compactos =====
function renderKpisCompact(tot){
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('kpi-total',        (tot.pedidos||0).toLocaleString());
  set('kpi-asignado',     (tot.asignado||0).toLocaleString());
  set('kpi-solicitado',   (tot.solicitado||0).toLocaleString());
  set('kpi-reng-asig',    (tot.renglonesAsig||0).toLocaleString());
  set('kpi-reng-sol',     (tot.renglonesSol||0).toLocaleString());
  set('kpi-urg',          tot.urgencia||0);
  set('kpi-men',          tot.mensual||0);
}

// ===== Gráfico: Estado por grupo (apilado) =====
let chartEstado = null;
function renderEstadoPorGrupoChart(groups){
  const el = document.getElementById('chart-estado');
  if (!el) return;
  const labels = groups.map(g=>g.group);
  const datasets = [
    {label:'F8 RECIBIDA',     data: groups.map(g=>g['F8 RECIBIDA'])},
    {label:'EN ASIGNACIÓN',   data: groups.map(g=>g['EN ASIGNACIÓN'])},
    {label:'SALIDA DE SALMI', data: groups.map(g=>g['SALIDA DE SALMI'])},
    {label:'FACTURADO',       data: groups.map(g=>g['FACTURADO'])},
    {label:'EMPACADO',        data: groups.map(g=>g['EMPACADO'])},
    {label:'ENTREGADA',       data: groups.map(g=>g['ENTREGADA'])}
  ];
  if (chartEstado){ chartEstado.destroy(); }
  chartEstado = new Chart(el.getContext('2d'), {
    type: 'bar',
    data: { labels, datasets },
    options: {
      responsive: true,
      plugins: { legend: { position:'bottom' }, title: { display:true, text:'Estado por grupo (conteo)' } },
      scales: { x:{ stacked:true }, y:{ stacked:true, beginAtZero:true } }
    }
  });
}

// ===== Hook simple para usar desde app.js =====
async function computeAndRenderMetricsFromRows(allRows){
  const { tot, groups } = buildAggregates(allRows);
  renderKpisCompact(tot);
  renderEstadoPorGrupoChart(groups);
}

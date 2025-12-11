// flow-app.js v1.7 — Conteos por columnas de fecha (M..S) y etapas por día
console.log('flow-app.js v1.7');

if (window.__FLOW_APP_LOADED__) {
  console.log('flow-app.js ya cargado, omitiendo.');
} else {
  window.__FLOW_APP_LOADED__ = true;

  const A = window.APP.A_URL;
  const B = window.APP.B_URL;
  const CLIENT_ID = window.APP.CLIENT_ID;

  // Orden lógico del flujo según columnas de fechas
  const FLOW_COLUMNS = [
    { key: 'RECIBO F8',    label: 'RECIBO F8',    blockId: 'count-recibo' },
    { key: 'ASIGNACIÓN',   label: 'ASIGNACIÓN',   blockId: 'count-asignacion' },
    { key: 'SALIDA',       label: 'SALIDA',       blockId: 'count-salida' },
    { key: 'DESPACHO',     label: 'DESPACHO',     blockId: 'count-despacho' },
    { key: 'FACTURACIÓN',  label: 'FACTURACIÓN',  blockId: 'count-facturacion' },
    { key: 'EMPACADO',     label: 'EMPACADO',     blockId: 'count-empacado' },
    { key: 'PROY. ENTREGA',label: 'PROY. ENTREGA',blockId: 'count-entrega' }
    // ENTREGRA REAL la usamos para KPIs, no para bloques por ahora
  ];

  let idToken = null;
  let editMode = false;

  let currentDayFilter = null;   // YYYY-MM-DD
  let currentRows = [];          // filas base (antes de filtros locales)

  // ============================
  //  HELPERS BÁSICOS
  // ============================
  function jsonp(url) {
    return new Promise((resolve, reject) => {
      const cb = 'cb_' + Math.random().toString(36).slice(2);
      const s = document.createElement('script');
      window[cb] = payload => {
        try { resolve(payload); }
        finally {
          try { delete window[cb]; } catch(e){}
          s.remove();
        }
      };
      s.onerror = () => {
        try { delete window[cb]; } catch(e){}
        s.remove();
        reject(new Error('network'));
      };
      s.src = url + (url.includes('?') ? '&' : '?') + 'callback=' + cb + '&_=' + Date.now();
      document.body.appendChild(s);
    });
  }

  function parseIsoDate(v) {
    if (!v) return null;
    if (v instanceof Date) return v;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v));
    if (!m) return null;
    return new Date(m[1] + '-' + m[2] + '-' + m[3] + 'T00:00:00Z');
  }

  function daysBetween(d1, d2) {
    if (!d1 || !d2) return null;
    return (d2.getTime() - d1.getTime()) / 86400000;
  }

  function toDateKey(d) {
    if (!d) return '';
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth()+1).padStart(2,'0');
    const day = String(d.getUTCDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
  }

  function formatDateShort(v) {
    const d = parseIsoDate(v);
    if (!d) return '—';
    const dd = String(d.getUTCDate()).padStart(2,'0');
    const mm = String(d.getUTCMonth()+1).padStart(2,'0');
    const yy = String(d.getUTCFullYear()).slice(-2);
    return dd + '/' + mm + '/' + yy;
  }

  // Dado un registro r y una fecha clave YYYY-MM-DD, devuelve la etapa del flujo
  // más avanzada que coincida con esa fecha en las columnas de flujo.
  function flowStageForDate(r, dateKey) {
    if (!dateKey) return null;
    // Recorremos en orden de flujo; guardamos la última columna que coincide
    let lastMatch = null;
    for (const col of FLOW_COLUMNS) {
      const raw = r[col.key];
      if (!raw) continue;
      const d = parseIsoDate(raw);
      if (!d) continue;
      const k = toDateKey(d);
      if (k === dateKey) {
        lastMatch = col.label;
      }
    }
    return lastMatch; // puede ser null si no coincide ninguna
  }

  // ============================
  //  FILTROS LOCALES
  // ============================
  function applyFlowFilters() {
    const selGrupo = document.getElementById('flowFilterGrupo');
    const selUnidad = document.getElementById('flowFilterUnidad');
    const selComent = document.getElementById('flowFilterComent');

    const gVal = selGrupo ? selGrupo.value : '';
    const uVal = selUnidad ? selUnidad.value : '';
    const cVal = selComent ? selComent.value : '';

    const rows = currentRows || [];

    const filtered = rows.filter(r => {
      if (gVal && String(r['GRUPO']||'') !== gVal) return false;
      if (uVal && String(r['UNIDAD']||'') !== uVal) return false;
      if (cVal && String(r['COMENT.']||'') !== cVal) return false;
      return true;
    });

    window.__DEBUG_LAST_ROWS = filtered;

    renderOrdersList(filtered);
    updateQuickStatsFromRows(filtered);
    updateGapAndTimeKpisFromRows(filtered);
    updateFlowBlockCounts(filtered);
  }

  function populateFlowFilterOptionsFromRows(rows) {
    const selGrupo = document.getElementById('flowFilterGrupo');
    const selUnidad = document.getElementById('flowFilterUnidad');

    if (!rows || !rows.length) {
      if (selGrupo) selGrupo.innerHTML = '<option value="">Todos los grupos</option>';
      if (selUnidad) selUnidad.innerHTML = '<option value="">Todas las unidades</option>';
      return;
    }

    const grupos = new Set();
    const unidades = new Set();
    rows.forEach(r => {
      if (r['GRUPO']) grupos.add(String(r['GRUPO']));
      if (r['UNIDAD']) unidades.add(String(r['UNIDAD']));
    });

    if (selGrupo) {
      const antes = selGrupo.value;
      selGrupo.innerHTML =
        '<option value="">Todos los grupos</option>' +
        Array.from(grupos).sort().map(g => `<option value="${g}">${g}</option>`).join('');
      if (Array.from(grupos).includes(antes)) selGrupo.value = antes;
    }

    if (selUnidad) {
      const antes = selUnidad.value;
      selUnidad.innerHTML =
        '<option value="">Todas las unidades</option>' +
        Array.from(unidades).sort().map(u => `<option value="${u}">${u}</option>`).join('');
      if (Array.from(unidades).includes(antes)) selUnidad.value = antes;
    }
  }

  // ============================
  //  LISTA IZQUIERDA
  // ============================
  function stageIndexForLabel(label) {
    if (!label) return FLOW_COLUMNS.length + 1;
    const idx = FLOW_COLUMNS.findIndex(c => c.label === label);
    return idx >= 0 ? idx : FLOW_COLUMNS.length + 1;
  }

  function renderOrdersList(rows) {
    const container = document.getElementById('ordersList');
    if (!container) return;
    if (!rows || !rows.length) {
      container.innerHTML = '<p class="loading-message">Sin requisiciones para este criterio.</p>';
      return;
    }

    const dateKey = currentDayFilter;

    // Enriquecemos con la etapa del flujo para el día actual
    const enriched = rows.map(r => {
      const stageToday = flowStageForDate(r, dateKey);
      return { r, stageToday };
    });

    const sorted = enriched.sort((a,b) => {
      const ia = stageIndexForLabel(a.stageToday);
      const ib = stageIndexForLabel(b.stageToday);
      if (ia !== ib) return ia - ib;
      const ida = String(a.r['F8 SALMI'] || '');
      const idb = String(b.r['F8 SALMI'] || '');
      return ida.localeCompare(idb);
    });

    const html = sorted.map(({r, stageToday}) => {
      const id = r['F8 SALMI'] || '(sin F8)';
      const unidad = r['UNIDAD'] || '';
      const tipo = r['TIPO'] || '';
      const grupo = r['GRUPO'] || '';
      const coment = r['COMENT.'] || '—';

      const rec = r['RECIBO F8'] ? formatDateShort(r['RECIBO F8']) : '—';
      const asg = r['ASIGNACIÓN'] ? formatDateShort(r['ASIGNACIÓN']) : '—';
      const sal = r['SALIDA'] ? formatDateShort(r['SALIDA']) : '—';
      const desp = r['DESPACHO'] ? formatDateShort(r['DESPACHO']) : '—';
      const fac = r['FACTURACIÓN'] ? formatDateShort(r['FACTURACIÓN']) : '—';
      const emp = r['EMPACADO'] ? formatDateShort(r['EMPACADO']) : '—';
      const proy = r['PROY. ENTREGA'] ? formatDateShort(r['PROY. ENTREGA']) : '—';
      const real = r['ENTREGA REAL'] ? formatDateShort(r['ENTREGA REAL']) : '—';

      const recD = parseIsoDate(r['RECIBO F8']);
      const proyD = parseIsoDate(r['PROY. ENTREGA']);
      const realD = parseIsoDate(r['ENTREGA REAL']);
      const teor  = (recD && proyD) ? Math.round(daysBetween(recD, proyD)) : null;
      const realT = (recD && realD) ? Math.round(daysBetween(recD, realD)) : null;

      let deltaHtml = '<span class="date-delta zero">—</span>';
      if (teor != null && realT != null) {
        const d = realT - teor;
        const cls = d > 0 ? 'positive' : (d < 0 ? 'negative' : 'zero');
        deltaHtml = `<span class="date-delta ${cls}">${d > 0 ? '+'+d : d} días</span>`;
      }

      const etapaHoy = stageToday ? stageToday : '—';

      return `
        <div class="order-card">
          <div class="order-card-header">
            <span class="order-id">${id}</span>
            <span class="order-stage">${etapaHoy}</span>
          </div>
          <div class="order-info">
            <div>${unidad}</div>
            <div>${tipo} · ${grupo}</div>
            <div><strong>Comentario:</strong> ${coment}</div>
          </div>
          <div class="order-dates">
            <div class="date-item">
              <span class="date-label">Recibo F8</span>
              <span class="date-value">${rec}</span>
            </div>
            <div class="date-item">
              <span class="date-label">Asignación</span>
              <span class="date-value">${asg}</span>
            </div>
            <div class="date-item">
              <span class="date-label">Salida</span>
              <span class="date-value">${sal}</span>
            </div>
            <div class="date-item">
              <span class="date-label">Despacho</span>
              <span class="date-value">${desp}</span>
            </div>
            <div class="date-item">
              <span class="date-label">Facturación</span>
              <span class="date-value">${fac}</span>
            </div>
            <div class="date-item">
              <span class="date-label">Empacado</span>
              <span class="date-value">${emp}</span>
            </div>
            <div class="date-item">
              <span class="date-label">Proy. Entrega</span>
              <span class="date-value">${proy}</span>
            </div>
            <div class="date-item">
              <span class="date-label">Entrega Real</span>
              <span class="date-value">${real}</span>
            </div>
            <div class="date-item">
              <span class="date-label">Delta</span>
              ${deltaHtml}
            </div>
          </div>
        </div>
      `;
    }).join('');

    container.innerHTML = html;
  }

  // ============================
  //  QUICK STATS
  // ============================
  function updateQuickStatsFromRows(rows) {
    window.__DEBUG_LAST_ROWS = rows;

    const totalEl = document.getElementById('stat-total');
    const procEl  = document.getElementById('stat-proceso');
    const compEl  = document.getElementById('stat-completados');
    const retrEl  = document.getElementById('stat-retraso');

    if (!rows || !rows.length) {
      if (totalEl) totalEl.textContent = '0';
      if (procEl)  procEl.textContent  = '0';
      if (compEl)  compEl.textContent  = '0';
      if (retrEl)  retrEl.textContent  = '0';
      console.log('[QS] 0 filas');
      return;
    }

    let total = rows.length;
    let completados = 0;
    let enProceso = 0;
    let retraso = 0;

    rows.forEach(r => {
      const realD = parseIsoDate(r['ENTREGA REAL']);
      const proyD = parseIsoDate(r['PROY. ENTREGA']);
      if (realD) completados++;
      else enProceso++;
      if (realD && proyD && realD > proyD) retraso++;
    });

    console.log('[QS] total:', total, 'comp:', completados, 'proc:', enProceso, 'retr:', retraso);

    if (totalEl) totalEl.textContent = total;
    if (procEl)  procEl.textContent  = enProceso;
    if (compEl)  compEl.textContent  = completados;
    if (retrEl)  retrEl.textContent  = retraso;
  }

  // ============================
  //  CONTADORES DE BLOQUES (por columnas de fecha)
  // ============================
  function updateFlowBlockCounts(rows) {
    const dateKey = currentDayFilter;
    if (!dateKey) {
      // Si no hay día seleccionado, ponemos 0 en todos
      FLOW_COLUMNS.forEach(col => {
        const el = document.getElementById(col.blockId);
        if (el) el.textContent = '0';
      });
      return;
    }

    const counts = {};
    FLOW_COLUMNS.forEach(col => { counts[col.label] = 0; });

    (rows || []).forEach(r => {
      FLOW_COLUMNS.forEach(col => {
        const raw = r[col.key];
        if (!raw) return;
        const d = parseIsoDate(raw);
        if (!d) return;
        if (toDateKey(d) === dateKey) {
          counts[col.label]++;
        }
      });
    });

    console.log('[BLOCKS] para día', dateKey, counts);

    FLOW_COLUMNS.forEach(col => {
      const el = document.getElementById(col.blockId);
      if (el) el.textContent = counts[col.label] || 0;
    });
  }

  // ============================
  //  GAP ANALYSIS & TIME KPIS
  // ============================
  let _gapChart, _stageDeltasChart;

  function updateGapAndTimeKpisFromRows(rows) {
    const kTeor   = document.getElementById('kpi-teorico');
    const kReal   = document.getElementById('kpi-real');
    const kDelta  = document.getElementById('kpi-delta');
    const kAcum   = document.getElementById('kpi-acumulado');

    if (!rows || !rows.length) {
      if (kTeor)  kTeor.textContent  = '—';
      if (kReal)  kReal.textContent  = '—';
      if (kDelta) kDelta.textContent = '—';
      if (kAcum)  kAcum.textContent  = '—';
      if (_gapChart) _gapChart.destroy();
      if (_stageDeltasChart) _stageDeltasChart.destroy();
      return;
    }

    let sumTeor=0, nTeor=0;
    let sumReal=0, nReal=0;
    let sumDelta=0;

    const deltaByProjDate = {};

    rows.forEach(r => {
      const recD  = parseIsoDate(r['RECIBO F8']);
      const proyD = parseIsoDate(r['PROY. ENTREGA']);
      const realD = parseIsoDate(r['ENTREGA REAL']);

      if (recD && proyD) {
        const t = daysBetween(recD, proyD);
        if (t != null) { sumTeor += t; nTeor++; }
      }
      if (recD && realD) {
        const tr = daysBetween(recD, realD);
        if (tr != null) { sumReal += tr; nReal++; }
      }
      if (recD && proyD && realD) {
        const t  = daysBetween(recD, proyD);
        const tr = daysBetween(recD, realD);
        if (t != null && tr != null) {
          const d = tr - t;
          sumDelta += d;
          const key = toDateKey(proyD);
          if (!deltaByProjDate[key]) deltaByProjDate[key] = {sum:0,count:0};
          deltaByProjDate[key].sum += d;
          deltaByProjDate[key].count++;
        }
      }
    });

    const avgTeor = nTeor ? sumTeor/nTeor : null;
    const avgReal = nReal ? sumReal/nReal : null;
    const avgDelta = (nReal && nTeor) ? ( (sumReal - sumTeor) / Math.max(nReal,nTeor) ) : null;

    if (kTeor)  kTeor.textContent  = (avgTeor!=null) ? avgTeor.toFixed(1) : '—';
    if (kReal)  kReal.textContent  = (avgReal!=null) ? avgReal.toFixed(1) : '—';
    if (kDelta) kDelta.textContent = (avgDelta!=null) ? avgDelta.toFixed(1) : '—';
    if (kAcum)  kAcum.textContent  = sumDelta ? sumDelta.toFixed(1) : '0.0';

    if (typeof Chart === 'undefined') {
      console.warn('Chart.js no está cargado; se omite dibujo de gráficos.');
      return;
    }

    const ctxGap = document.getElementById('gapChart');
    if (ctxGap) {
      const labels = Object.keys(deltaByProjDate).sort();
      let acumulado = 0;
      const dataAcum = labels.map(d => {
        const obj = deltaByProjDate[d];
        acumulado += obj.sum;
        return acumulado;
      });
      if (_gapChart) _gapChart.destroy();
      _gapChart = new Chart(ctxGap.getContext('2d'),{
        type:'line',
        data:{
          labels,
          datasets:[{
            label:'Delta acumulado (días)',
            data:dataAcum,
            fill:false,
            borderColor:'#f97316',
            tension:0.25
          }]
        },
        options:{
          responsive:true,
          maintainAspectRatio:false,
          plugins:{ legend:{ position:'bottom' } },
          scales:{ y:{ ticks:{ callback:v=>v+' d' } } }
        }
      });
    }

    const ctxStage = document.getElementById('stageDeltas');
    if (ctxStage) {
      if (_stageDeltasChart) _stageDeltasChart.destroy();
      _stageDeltasChart = new Chart(ctxStage.getContext('2d'),{
        type:'bar',
        data:{
          labels:['Teórico','Real'],
          datasets:[{
            label:'Tiempo promedio (días)',
            data:[
              avgTeor!=null?avgTeor:0,
              avgReal!=null?avgReal:0
            ],
            backgroundColor:['#3b82f6','#ef4444']
          }]
        },
        options:{
          responsive:true,
          maintainAspectRatio:false,
          plugins:{ legend:{ display:false } },
          scales:{ y:{ beginAtZero:true, ticks:{ callback:v=>v+' d' } } }
        }
      });
    }
  }

  // ============================
  //  CALENDARIO
  // ============================
  let currentCalYear, currentCalMonth;
  let currentCalData = {};

  async function loadCalendarMonth(year, month) {
    currentCalYear = year;
    currentCalMonth = month;
    const url = `${A}?route=calendar.monthsummary&year=${year}&month=${month}`;
    const res = await jsonp(url);
    if (!res || res.status !== 'ok') {
      console.warn('Error calendar.monthsummary', res && res.error);
      return;
    }
    currentCalData = res.data || {};
    renderCalendar();
  }

  function renderCalendar() {
    const calEl = document.getElementById('calendar');
    const titleEl = document.getElementById('calendarTitle');
    if (!calEl || !titleEl) return;

    const year = currentCalYear;
    const month = currentCalMonth;

    const firstDay = new Date(Date.UTC(year, month-1, 1));
    const startDow = firstDay.getUTCDay();
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

    const monthNames = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    titleEl.textContent = `${monthNames[month-1]} ${year}`;

    calEl.innerHTML = '';

    const dayNames = ['L','M','X','J','V','S','D'];
    dayNames.forEach(dn => {
      const div = document.createElement('div');
      div.className = 'calendar-day-header';
      div.textContent = dn;
      calEl.appendChild(div);
    });

    let dow = (startDow + 6) % 7;
    for (let i=0; i<dow; i++) {
      const empty = document.createElement('div');
      empty.className = 'calendar-day other-month';
      calEl.appendChild(empty);
    }

    const todayKey = toDateKey(new Date());

    for (let day=1; day<=daysInMonth; day++) {
      const d = new Date(Date.UTC(year, month-1, day));
      const key = toDateKey(d);
      const info = currentCalData[key] || { total:0, byStage:{} };
      const total = info.total || 0;

      const cell = document.createElement('div');
      cell.className = 'calendar-day';
      if (key === todayKey) cell.classList.add('today');

      const num = document.createElement('div');
      num.className = 'calendar-day-number';
      num.textContent = day;
      cell.appendChild(num);

      if (total > 0) {
        const big = document.createElement('div');
        big.className = 'calendar-day-badge';
        big.textContent = total;
        cell.appendChild(big);

        let tooltip = `Total: ${total}\n`;
        const bySt = info.byStage || {};
        Object.keys(bySt).sort().forEach(st => {
          tooltip += `${st}: ${bySt[st]}\n`;
        });
        cell.title = tooltip.trim();
      }

      cell.addEventListener('click', () => onCalendarDayClick(key));
      calEl.appendChild(cell);
    }
  }

  async function onCalendarDayClick(dateKey) {
    currentDayFilter = dateKey;
    const title = document.getElementById('panel-title');
    if (title) title.textContent = `Requisiciones del ${dateKey}`;

    const res = await jsonp(`${A}?route=calendar.daydetails&date=${dateKey}`);
    if (!res || res.status !== 'ok') {
      console.warn('calendar.daydetails error', res && res.error);
      return;
    }
    const data = res.data;
    currentRows = data.rows || [];

    populateFlowFilterOptionsFromRows(currentRows);
    applyFlowFilters();

    const btnClear = document.getElementById('btnClearFilter');
    if (btnClear) btnClear.style.display = 'inline-block';
  }

  // ============================
  //  FLOW BLOCKS
  // ============================
  async function onFlowBlockClick(stageKey) {
    if (!currentDayFilter) {
      currentDayFilter = toDateKey(new Date());
    }

    const res = await jsonp(`${A}?route=calendar.daydetails&date=${currentDayFilter}`);
    if (!res || res.status !== 'ok') {
      console.warn('calendar.daydetails error en flow block', res && res.error);
      return;
    }
    const dayRows = res.data.rows || [];

    // Mapeamos data-stage a columna de flujo
    const map = {
      'RECIBO':'RECIBO F8',
      'ASIGNACION':'ASIGNACIÓN',
      'SALIDA':'SALIDA',
      'DESPACHO':'DESPACHO',
      'FACTURACION':'FACTURACIÓN',
      'EMPACADO':'EMPACADO',
      'ENTREGA':'PROY. ENTREGA'
    };
    const colKey = map[stageKey] || 'RECIBO F8';

    currentRows = dayRows.filter(r => {
      const raw = r[colKey];
      if (!raw) return false;
      const d = parseIsoDate(raw);
      if (!d) return false;
      return toDateKey(d) === currentDayFilter;
    });

    const title = document.getElementById('panel-title');
    if (title) title.textContent = `Requisiciones en ${colKey} el ${currentDayFilter}`;

    populateFlowFilterOptionsFromRows(currentRows);
    applyFlowFilters();

    const btnClear = document.getElementById('btnClearFilter');
    if (btnClear) btnClear.style.display = 'inline-block';
  }

  // ============================
  //  EXPORTAR CSV
  // ============================
  function exportCurrentRowsToCSV() {
    const rows = window.__DEBUG_LAST_ROWS || currentRows || [];
    if (!rows.length) {
      alert('No hay datos para exportar.');
      return;
    }

    const headers = [
      'F8 SALMI','UNIDAD','TIPO','GRUPO','COMENT.',
      'RECIBO F8','ASIGNACIÓN','SALIDA','DESPACHO',
      'FACTURACIÓN','EMPACADO','PROY. ENTREGA','ENTREGA REAL'
    ];

    const SEP = ';';

    const csvRows = [];
    csvRows.push(headers.join(SEP));

    rows.forEach(r => {
      const row = [
        r['F8 SALMI'] || '',
        r['UNIDAD'] || '',
        r['TIPO'] || '',
        r['GRUPO'] || '',
        r['COMENT.'] || '',
        r['RECIBO F8'] || '',
        r['ASIGNACIÓN'] || '',
        r['SALIDA'] || '',
        r['DESPACHO'] || '',
        r['FACTURACIÓN'] || '',
        r['EMPACADO'] || '',
        r['PROY. ENTREGA'] || '',
        r['ENTREGA REAL'] || ''
      ].map(v => {
        const s = String(v).replace(/"/g,'""');
        return `"${s}"`;
      });
      csvRows.push(row.join(SEP));
    });

    const csvContent = csvRows.join('\r\n');
    const blob = new Blob([csvContent], {type:'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const fileDate = currentDayFilter || toDateKey(new Date());
    a.href = url;
    a.download = `requisiciones_${fileDate}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ============================
  //  INICIALIZACIÓN
  // ============================
  async function loadInitialData() {
    const listEl = document.getElementById('ordersList');
    if (listEl) listEl.innerHTML = '<p class="loading-message">Cargando requisiciones...</p>';

    try {
      const res = await jsonp(`${A}?route=init.lite&pageSize=200`);
      if (!res || res.status !== 'ok') {
        console.warn('init.lite error', res && res.error);
        if (listEl) listEl.innerHTML = '<p class="loading-message">Error al cargar datos iniciales.</p>';
        return;
      }
      const data = res.data;
      currentRows = data.table?.rows || [];

      const title = document.getElementById('panel-title');
      if (title) title.textContent = 'Todas las requisiciones';

      // Aquí todavía no hay currentDayFilter, así que los contadores de bloques
      // se actualizarán a 0 hasta que elijas un día.
      populateFlowFilterOptionsFromRows(currentRows);
      applyFlowFilters();
    } catch(e) {
      console.warn('loadInitialData error', e);
      if (listEl) listEl.innerHTML = '<p class="loading-message">Error de red al cargar datos.</p>';
    }
  }

  async function initFlowDashboard() {
    const btnLogin    = document.getElementById('btnLogin');
    const btnEditMode = document.getElementById('btnEditMode');
    const btnRefresh  = document.getElementById('btnRefresh');
    const btnClear    = document.getElementById('btnClearFilter');
    const btnExport   = document.getElementById('btnExport');

    const selGrupo = document.getElementById('flowFilterGrupo');
    const selUnidad = document.getElementById('flowFilterUnidad');
    const selComent = document.getElementById('flowFilterComent');

    if (btnLogin) {
      btnLogin.addEventListener('click', () => {
        if (window.google?.accounts?.id) {
          google.accounts.id.initialize({
            client_id: CLIENT_ID,
            callback: r => {
              idToken = r.credential;
              if (btnEditMode) btnEditMode.disabled = false;
              btnLogin.textContent = 'Sesión iniciada';
              alert('Sesión iniciada. Activa “Modo edición” si aplica.');
            }
          });
          google.accounts.id.prompt();
        } else {
          alert('Falta librería de Google Identity');
        }
      });
    }

    if (btnEditMode) {
      btnEditMode.addEventListener('click', () => {
        editMode = !editMode;
        btnEditMode.textContent = `Modo edición: ${editMode ? 'ON' : 'OFF'}`;
        btnEditMode.classList.toggle('edit-on', editMode);
      });
    }

    if (btnRefresh) {
      btnRefresh.addEventListener('click', () => {
        loadInitialData();
      });
    }

    if (btnClear) {
      btnClear.addEventListener('click', () => {
        btnClear.style.display = 'none';
        const title = document.getElementById('panel-title');
        if (title) title.textContent = 'Todas las requisiciones';
        currentDayFilter = null;
        if (selGrupo) selGrupo.value = '';
        if (selUnidad) selUnidad.value = '';
        if (selComent) selComent.value = '';
        loadInitialData();
      });
    }

    if (btnExport) {
      btnExport.addEventListener('click', exportCurrentRowsToCSV);
    }

    if (selGrupo) selGrupo.addEventListener('change', applyFlowFilters);
    if (selUnidad) selUnidad.addEventListener('change', applyFlowFilters);
    if (selComent) selComent.addEventListener('change', applyFlowFilters);

    const btnPrevMonth = document.getElementById('btnPrevMonth');
    const btnNextMonth = document.getElementById('btnNextMonth');

    if (btnPrevMonth) {
      btnPrevMonth.addEventListener('click', () => {
        let y = currentCalYear;
        let m = currentCalMonth - 1;
        if (m < 1) { m = 12; y--; }
        loadCalendarMonth(y, m);
      });
    }
    if (btnNextMonth) {
      btnNextMonth.addEventListener('click', () => {
        let y = currentCalYear;
        let m = currentCalMonth + 1;
        if (m > 12) { m = 1; y++; }
        loadCalendarMonth(y, m);
      });
    }

    document.querySelectorAll('.flow-block[data-stage]').forEach(el => {
      el.addEventListener('click', () => {
        document.querySelectorAll('.flow-block').forEach(b => b.classList.remove('active'));
        el.classList.add('active');
        const stageKey = el.getAttribute('data-stage');
        onFlowBlockClick(stageKey);
      });
    });

    await loadInitialData();

    const now = new Date();
    currentDayFilter = toDateKey(now);
    await loadCalendarMonth(now.getUTCFullYear(), now.getUTCMonth()+1);
  }

  document.addEventListener('DOMContentLoaded', initFlowDashboard);
}

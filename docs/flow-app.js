// flow-app.js v1.4 — Flow dashboard con filtros locales (Grupo/Unidad/Comentario)
console.log('flow-app.js v1.4');

if (window.__FLOW_APP_LOADED__) {
  console.log('flow-app.js ya cargado, omitiendo.');
} else {
  window.__FLOW_APP_LOADED__ = true;

  const A = window.APP.A_URL;
  const B = window.APP.B_URL;
  const CLIENT_ID = window.APP.CLIENT_ID;

  const STAGES_ORDER = [
    'F8 RECIBIDA',
    'EN ASIGNACIÓN',
    'SALIDA DE SALMI',
    'FACTURADO',
    'EMPACADO',
    'ENTREGADA'
  ];

  let idToken = null;
  let editMode = false;

  let currentDayFilter = null;   // YYYY-MM-DD
  let currentRows = [];          // filas base (sin filtros locales)

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

  // ============================
  //  FILTROS LOCALES (grupo/unidad/coment)
  // ============================
  function applyFlowFilters() {
    const selGrupo = document.getElementById('flowFilterGrupo');
    const selUnidad = document.getElementById('flowFilterUnidad');
    const selComent = document.getElementById('flowFilterComent');

    const gVal = selGrupo ? selGrupo.value : '';
    const uVal = selUnidad ? selUnidad.value : '';
    const cVal = selComent ? selComent.value : '';

    let rows = currentRows || [];

    const filtered = rows.filter(r => {
      if (gVal && String(r['GRUPO']||'') !== gVal) return false;
      if (uVal && String(r['UNIDAD']||'') !== uVal) return false;
      if (cVal && String(r['COMENT.']||'') !== cVal) return false;
      return true;
    });

    renderOrdersList(filtered);
    updateQuickStatsFromRows(filtered);
    updateGapAndTimeKpisFromRows(filtered);
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
  function stageIndexFromRow(r) {
    const st = r['ESTADO'] || '';
    const idx = STAGES_ORDER.indexOf(st);
    return idx >= 0 ? idx : STAGES_ORDER.length + 1;
  }

  function renderOrdersList(rows) {
    const container = document.getElementById('ordersList');
    if (!container) return;
    if (!rows || !rows.length) {
      container.innerHTML = '<p class="loading-message">Sin requisiciones para este criterio.</p>';
      return;
    }

    const sorted = [...rows].sort((a,b) => {
      const ia = stageIndexFromRow(a);
      const ib = stageIndexFromRow(b);
      if (ia !== ib) return ia - ib;
      const ida = String(a['F8 SALMI'] || '');
      const idb = String(b['F8 SALMI'] || '');
      return ida.localeCompare(idb);
    });

    const html = sorted.map(r => {
      const id = r['F8 SALMI'] || '(sin F8)';
      const unidad = r['UNIDAD'] || '';
      const tipo = r['TIPO'] || '';
      const grupo = r['GRUPO'] || '';
      const estado = r['ESTADO'] || '';
      const coment = r['COMENT.'] || '—';

      const rec = r['RECIBO F8'] ? formatDateShort(r['RECIBO F8']) : '—';
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

      return `
        <div class="order-card">
          <div class="order-card-header">
            <span class="order-id">${id}</span>
            <span class="order-stage">${estado}</span>
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
  //  QUICK STATS (tarjetas)
  // ============================
  function updateQuickStatsFromRows(rows) {
    window.__DEBUG_LAST_ROWS = rows; // para inspección

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
  //  FLOW BLOCKS (usan el día seleccionado)
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

    const map = {
      'RECIBO':'F8 RECIBIDA',
      'ASIGNACION':'EN ASIGNACIÓN',
      'SALIDA':'SALIDA DE SALMI',
      'DESPACHO':'SALIDA DE SALMI',
      'FACTURACION':'FACTURADO',
      'EMPACADO':'EMPACADO',
      'ENTREGA':'ENTREGADA'
    };
    const baseStage = map[stageKey] || stageKey;

    currentRows = dayRows.filter(r => (r['ESTADO'] || '') === baseStage);

    const title = document.getElementById('panel-title');
    if (title) title.textContent = `Requisiciones en ${baseStage} el ${currentDayFilter}`;

    populateFlowFilterOptionsFromRows(currentRows);
    applyFlowFilters();

    const btnClear = document.getElementById('btnClearFilter');
    if (btnClear) btnClear.style.display = 'inline-block';
  }

  // ============================
  //  EXPORTAR CSV
  // ============================
  function exportCurrentRowsToCSV() {
    // Exportamos lo que está visible tras filtros: usar __DEBUG_LAST_ROWS si existe
    const rows = window.__DEBUG_LAST_ROWS || currentRows || [];
    if (!rows.length) {
      alert('No hay datos para exportar.');
      return;
    }

    const headers = [
      'F8 SALMI','UNIDAD','TIPO','GRUPO','ESTADO','COMENT.',
      'RECIBO F8','ASIGNACIÓN','SALIDA','DESPACHO',
      'FACTURACIÓN','EMPACADO','PROY. ENTREGA','ENTREGA REAL'
    ];

    const csvRows = [];
    csvRows.push(headers.join(','));

    rows.forEach(r => {
      const row = [
        r['F8 SALMI'] || '',
        r['UNIDAD'] || '',
        r['TIPO'] || '',
        r['GRUPO'] || '',
        r['ESTADO'] || '',
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
      csvRows.push(row.join(','));
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

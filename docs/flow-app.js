// flow-app.js v3.8 — Filtros Globales Corregidos
console.log('flow-app.js v3.8 — Flow view with table inline editing');

if (window.__FLOW_APP_LOADED__) {
  console.log('flow-app.js ya cargado, omitiendo.');
} else {
  window.__FLOW_APP_LOADED__ = true;

  const A = window.APP.A_URL;
  const B = window.APP.B_URL;
  const CLIENT_ID = window.APP.CLIENT_ID;

  const FLOW_COLUMNS = [
    { key: 'RECIBO F8',    label: 'RECIBO F8',    blockId: 'count-recibo' },
    { key: 'ASIGNACIÓN',   label: 'ASIGNACIÓN',   blockId: 'count-asignacion' },
    { key: 'SALIDA',       label: 'SALIDA',       blockId: 'count-salida' },
    { key: 'DESPACHO',     label: 'DESPACHO',     blockId: 'count-despacho' },
    { key: 'FACTURACIÓN',  label: 'FACTURACIÓN',  blockId: 'count-facturacion' },
    { key: 'EMPACADO',     label: 'EMPACADO',     blockId: 'count-empacado' },
    { key: 'PROY. ENTREGA',label: 'PROY. ENTREGA',blockId: 'count-entrega' },
    { key: 'ENTREGA REAL', label: 'ENTREGA REAL', blockId: 'count-entrega-real' }
  ];

  const DATE_FIELDS = [
    'ASIGNACIÓN',
    'SALIDA',
    'DESPACHO',
    'FACTURACIÓN',
    'EMPACADO',
    'PROY. ENTREGA',
    'ENTREGA REAL'
  ];
  const TXT_FIELDS = ['COMENT.'];

  const COMMENT_OPTIONS = [
    '',
    'DISCREPANCIA DE INVENTARIO',
    'FALTA DE PERSONAL',
    'VIATICOS PARA VIAJES',
    'FALTA MONTACARGA',
    'CONGESTIONAMIENTO EN SALIDAS',
    'FACTURACION RETRASADA',
    'FALLAS EN SISTEMA',
    'DEMORA EN DOCUMENTACION',
    'ERROR DE CAPTACION',
    'ENTREGADO'
  ];

  const DEBUG = false;

  let idToken = null;
  let editMode = false;

  let currentDayFilter = null;   // YYYY-MM-DD
  let currentRows = [];          // filas base (antes de filtros locales)
  let currentStatusFilter = 'ALL'; // ALL | IN_PROGRESS | COMPLETED | LATE

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
    const year  = Number(m[1]);
    const month = Number(m[2]) - 1;
    const day   = Number(m[3]);
    return new Date(year, month, day, 0, 0, 0, 0);
  }

  function daysBetween(d1, d2) {
    if (!d1 || !d2) return null;
    return (d2.getTime() - d1.getTime()) / 86400000;
  }

  function toDateKey(d) {
    if (!d) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth()+1).padStart(2,'0');
    const day = String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
  }

  function formatDateShort(v) {
    const d = parseIsoDate(v);
    if (!d) return '—';
    const dd = String(d.getDate()).padStart(2,'0');
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const yy = String(d.getFullYear()).slice(-2);
    return dd + '/' + mm + '/' + yy;
  }

  function formatDateInput(v) {
    const d = parseIsoDate(v);
    if (!d) return '';
    const dd = String(d.getDate()).padStart(2,'0');
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const yy = d.getFullYear();
    return `${yy}-${mm}-${dd}`;
  }

  function flowStageForDate(r, dateKey) {
    if (!dateKey) return null;
    let lastMatch = null;
    for (const col of FLOW_COLUMNS) {
      const raw = r[col.key];
      if (!raw) continue;
      const d = parseIsoDate(raw);
      if (!d) continue;
      const k = toDateKey(d);
      if (k === dateKey) lastMatch = col.label;
    }
    return lastMatch;
  }

  // ============================
  //  FILTROS GLOBALES
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

      const realD = parseIsoDate(r['ENTREGA REAL']);
      const proyD = parseIsoDate(r['PROY. ENTREGA']);

      if (currentStatusFilter === 'IN_PROGRESS') {
        if (realD) return false;
      } else if (currentStatusFilter === 'COMPLETED') {
        if (!realD) return false;
      } else if (currentStatusFilter === 'LATE') {
        if (!(realD && proyD && realD > proyD)) return false;
      }

      return true;
    });

    window.__DEBUG_LAST_ROWS = filtered;

    // Actualizar todos los componentes visuales
    renderOrdersList(filtered);
    updateQuickStatsFromRows(filtered);
    updateGapAndTimeKpisFromRows(filtered);
    updateFlowBlockCounts(filtered);
    
    // Actualizar el Checklist con la lista filtrada
    if (currentDayFilter) {
      loadMonthlyChecklist(currentDayFilter, filtered);
    }
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
      selGrupo.innerHTML = '<option value="">Todos los grupos</option>' +
        Array.from(grupos).sort().map(g => `<option value="${g}">${g}</option>`).join('');
      if (Array.from(grupos).includes(antes)) selGrupo.value = antes;
    }

    if (selUnidad) {
      const antes = selUnidad.value;
      selUnidad.innerHTML = '<option value="">Todas las unidades</option>' +
        Array.from(unidades).sort().map(u => `<option value="${u}">${u}</option>`).join('');
      if (Array.from(unidades).includes(antes)) selUnidad.value = antes;
    }
  }

  // ============================
  //  TABLA REQUISICIONES
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
      container.classList.remove('edit-mode-on');
      return;
    }

    const dateKey = currentDayFilter;

    const enriched = rows.map(r => {
      const stageToday = flowStageForDate(r, dateKey);
      return { r, stageToday };
    });

    const sorted = enriched.sort((a,b) => {
      const ia = stageIndexForLabel(a.stageToday);
      const ib = stageIndexForLabel(b.stageToday);
      if (ia !== ib) return ia - ib;
      return String(a.r['F8 SALMI'] || '').localeCompare(String(b.r['F8 SALMI'] || ''));
    });

    const htmlRows = sorted.map(({r, stageToday}) => {
      const id     = r['F8 SALMI'] || '(sin F8)';
      const unidad = r['UNIDAD']   || '';
      const tipo   = r['TIPO']     || '';
      const grupo  = r['GRUPO']    || '';
      const coment = r['COMENT.']  || '';

      const recD  = parseIsoDate(r['RECIBO F8']);
      const asgD  = parseIsoDate(r['ASIGNACIÓN']);
      const salD  = parseIsoDate(r['SALIDA']);
      const despD = parseIsoDate(r['DESPACHO']);
      const facD  = parseIsoDate(r['FACTURACIÓN']);
      const empD  = parseIsoDate(r['EMPACADO']);
      const proyD = parseIsoDate(r['PROY. ENTREGA']);
      const realD = parseIsoDate(r['ENTREGA REAL']);

      const rec  = recD  ? formatDateShort(recD)  : '—';
      const asg  = asgD  ? formatDateShort(asgD)  : '—';
      const sal  = salD  ? formatDateShort(salD)  : '—';
      const desp = despD ? formatDateShort(despD) : '—';
      const fac  = facD  ? formatDateShort(facD)  : '—';
      const emp  = empD  ? formatDateShort(empD)  : '—';
      const proy = proyD ? formatDateShort(proyD) : '—';
      const real = realD ? formatDateShort(realD) : '—';

      const isHighlight = d => d && toDateKey(d) === dateKey;

      const teor  = (recD && proyD) ? Math.round(daysBetween(recD, proyD)) : null;
      const realT = (recD && realD) ? Math.round(daysBetween(recD, realD)) : null;

      let deltaText = '—';
      let deltaClass = 'zero';
      if (teor != null && realT != null) {
        const d = realT - teor;
        deltaText = (d > 0 ? '+'+d : d) + ' días';
        deltaClass = d > 0 ? 'positive' : (d < 0 ? 'negative' : 'zero');
      }

      return `
        <tr data-f8-id="${id}">
          <td>${id}</td>
          <td>${unidad}<br><small>${tipo} · ${grupo}</small></td>
          <td><span class="editable-text" data-field="COMENT." data-f8-id="${id}">${coment || '—'}</span></td>
          <td class="${isHighlight(recD) ? 'highlight-day' : ''}">${rec}</td>
          <td class="${isHighlight(asgD) ? 'highlight-day' : ''}"><span class="editable-date" data-field="ASIGNACIÓN" data-f8-id="${id}">${asg}</span></td>
          <td class="${isHighlight(salD) ? 'highlight-day' : ''}"><span class="editable-date" data-field="SALIDA" data-f8-id="${id}">${sal}</span></td>
          <td class="${isHighlight(despD) ? 'highlight-day' : ''}"><span class="editable-date" data-field="DESPACHO" data-f8-id="${id}">${desp}</span></td>
          <td class="${isHighlight(facD) ? 'highlight-day' : ''}"><span class="editable-date" data-field="FACTURACIÓN" data-f8-id="${id}">${fac}</span></td>
          <td class="${isHighlight(empD) ? 'highlight-day' : ''}"><span class="editable-date" data-field="EMPACADO" data-f8-id="${id}">${emp}</span></td>
          <td class="${isHighlight(proyD) ? 'highlight-day' : ''}"><span class="editable-date" data-field="PROY. ENTREGA" data-f8-id="${id}">${proy}</span></td>
          <td class="${isHighlight(realD) ? 'highlight-day' : ''}"><span class="editable-date" data-field="ENTREGA REAL" data-f8-id="${id}">${real}</span></td>
          <td><span class="date-delta ${deltaClass}">${deltaText}</span><br><small>${stageToday || '—'}</small></td>
        </tr>
      `;
    }).join('');

    container.innerHTML = `
      <table class="flow-table">
        <thead>
          <tr>
            <th>F8 SALMI</th><th>Unidad / Tipo / Grupo</th><th>Comentario</th>
            <th>Recibo F8</th><th>Asign.</th><th>Salida</th><th>Desp.</th><th>Fact.</th>
            <th>Emp.</th><th>Proy. Entrega</th><th>Entrega Real</th><th>Delta / Etapa</th>
          </tr>
        </thead>
        <tbody>${htmlRows}</tbody>
      </table>
    `;
    container.classList.toggle('edit-mode-on', editMode);
  }

  // ============================
  //  CHECKLIST MENSUALES (Lógica Local para Filtros Globales)
  // ============================
  async function loadMonthlyChecklist(dateKey, filteredRows = null) {
    const labelEl = document.getElementById('monthlyDateLabel');
    const contEl  = document.getElementById('monthlyChecklist');
    if (!contEl) return;

    if (labelEl) labelEl.textContent = `(${dateKey || '...'})`;
    
    // USAR FILAS FILTRADAS SI EXISTEN, SI NO, USAR CURRENTROWS
    const rowsToProcess = filteredRows || currentRows || [];

    if (!rowsToProcess.length) {
      contEl.innerHTML = '<p class="loading-message">No hay datos para mostrar con el filtro actual.</p>';
      return;
    }

    // --- CÁLCULO LOCAL DE DATOS ---
    const resumenUnidades = new Map();
    const detallePorUnidad = new Map();

    rowsToProcess.forEach(r => {
      const unidad = String(r['UNIDAD'] || '').trim();
      const grupo  = String(r['GRUPO']  || '').trim();
      if (!unidad) return;

      if (!resumenUnidades.has(unidad)) {
        resumenUnidades.set(unidad, {
          unidad,
          totalRequisiciones: 0, conAsignacion: 0, conSalida: 0, conFact: 0, conEmpacado: 0, conProy: 0, conEntregaReal: 0,
          factAntesSalida: 0, factMuyTarde: 0, soloSalida: 0, soloFact: 0
        });
      }
      const uStats = resumenUnidades.get(unidad);

      if (!detallePorUnidad.has(unidad)) detallePorUnidad.set(unidad, new Map());
      const mapGrupos = detallePorUnidad.get(unidad);
      if (!mapGrupos.has(grupo)) {
        mapGrupos.set(grupo, {
          grupo, total: 0, conAsignacion: 0, conSalida: 0, conFact: 0, conEmpacado: 0, conProy: 0, conEntregaReal: 0
        });
      }
      const gStats = mapGrupos.get(grupo);

      const hasAsig = !!r['ASIGNACIÓN'];
      const hasSal  = !!r['SALIDA'];
      const hasFact = !!r['FACTURACIÓN'];
      const hasEmp  = !!r['EMPACADO'];
      const hasProy = !!r['PROY. ENTREGA'];
      const hasEnt  = !!r['ENTREGA REAL'];

      const dSal = parseIsoDate(r['SALIDA']);
      const dFact = parseIsoDate(r['FACTURACIÓN']);
      let incFactAntes = 0, incFactTarde = 0;
      if (dSal && dFact) {
        if (dFact < dSal) incFactAntes = 1;
        if (daysBetween(dSal, dFact) > 7) incFactTarde = 1;
      }
      const incSoloSal = (hasSal && !hasFact) ? 1 : 0;
      const incSoloFact = (!hasSal && hasFact) ? 1 : 0;

      uStats.totalRequisiciones++;
      if (hasAsig) uStats.conAsignacion++;
      if (hasSal)  uStats.conSalida++;
      if (hasFact) uStats.conFact++;
      if (hasEmp)  uStats.conEmpacado++;
      if (hasProy) uStats.conProy++;
      if (hasEnt)  uStats.conEntregaReal++;
      uStats.factAntesSalida += incFactAntes;
      uStats.factMuyTarde += incFactTarde;
      uStats.soloSalida += incSoloSal;
      uStats.soloFact += incSoloFact;

      gStats.total++;
      if (hasAsig) gStats.conAsignacion++;
      if (hasSal)  gStats.conSalida++;
      if (hasFact) gStats.conFact++;
      if (hasEmp)  gStats.conEmpacado++;
      if (hasProy) gStats.conProy++;
      if (hasEnt)  gStats.conEntregaReal++;
    });

    const unidadesResumen = Array.from(resumenUnidades.values()).sort((a,b) => a.unidad.localeCompare(b.unidad));

    const html = `
      <table class="monthly-table" id="monthlyTableMain">
        <thead>
          <tr>
            <th style="width:32px;"></th><th>Unidad</th><th>Req.</th>
            <th>Con Asig.</th><th>Con Salida</th><th>Con Fact.</th><th>Con Emp.</th><th>Con Proy.</th><th>Con Entrega</th>
            <th title="Facturación antes de salida">Fact &lt; Sal</th>
            <th title="Facturación > 7 días después">Fact &gt;7d</th>
            <th>Solo Salida</th><th>Solo Fact.</th>
          </tr>
        </thead>
        <tbody>
          ${unidadesResumen.map(u => {
            const hayErr = (u.factAntesSalida > 0 || u.soloFact > 0);
            const hayWarn = (u.factMuyTarde > 0 || u.soloSalida > 0 || (u.totalRequisiciones > 0 && u.conSalida === 0));
            const cls = hayErr ? 'badge-err' : (hayWarn ? 'badge-warn' : 'badge-ok');
            const unidad = String(u.unidad || '').trim();
            const tieneDetalle = detallePorUnidad.has(unidad);

            let filas = `
              <tr class="monthly-row-unidad" data-unidad="${unidad.replace(/"/g,'&quot;')}">
                <td class="monthly-toggle-cell">
                  ${tieneDetalle ? `<button class="monthly-toggle-btn" data-unidad="${unidad.replace(/"/g,'&quot;')}">+</button>` : ''}
                </td>
                <td>${unidad}</td>
                <td class="${cls}">${u.totalRequisiciones}</td>
                <td>${u.conAsignacion}</td>
                <td>${u.conSalida}</td>
                <td>${u.conFact}</td>
                <td>${u.conEmpacado}</td>
                <td>${u.conProy}</td>
                <td>${u.conEntregaReal}</td>
                <td>${u.factAntesSalida || 0}</td>
                <td>${u.factMuyTarde || 0}</td>
                <td>${u.soloSalida || 0}</td>
                <td>${u.soloFact || 0}</td>
              </tr>
            `;

            if (tieneDetalle) {
              const gruposMap = detallePorUnidad.get(unidad);
              const gruposArr = Array.from(gruposMap.values()).sort((a,b) => a.grupo.localeCompare(b.grupo));
              filas += gruposArr.map(g => `
                <tr class="monthly-row-grupo monthly-row-grupo-hidden" data-unidad="${unidad.replace(/"/g,'&quot;')}" data-grupo="${g.grupo.replace(/"/g,'&quot;')}">
                  <td></td><td style="padding-left:20px;">${g.grupo}</td>
                  <td>${g.total}</td>
                  <td>${g.conAsignacion}</td><td>${g.conSalida}</td><td>${g.conFact}</td><td>${g.conEmpacado}</td><td>${g.conProy}</td><td>${g.conEntregaReal}</td>
                  <td></td><td></td><td></td><td></td>
                </tr>
              `).join('');
            }
            return filas;
          }).join('')}
        </tbody>
      </table>
    `;

    contEl.innerHTML = html;

    const table = document.getElementById('monthlyTableMain');
    if (!table) return;

    table.addEventListener('click', ev => {
      const btn = ev.target.closest('.monthly-toggle-btn');
      if (!btn) return;
      const unidad = btn.getAttribute('data-unidad') || '';
      const rowsGrupo = table.querySelectorAll('tr.monthly-row-grupo');
      const targetRows = [];
      rowsGrupo.forEach(tr => {
        if (tr.getAttribute('data-unidad') === unidad) targetRows.push(tr);
      });
      const isCollapsed = btn.textContent.trim() === '+';
      btn.textContent = isCollapsed ? '−' : '+';
      targetRows.forEach(tr => {
        if (isCollapsed) tr.classList.remove('monthly-row-grupo-hidden');
        else tr.classList.add('monthly-row-grupo-hidden');
      });
    });
  }

  // ============================
  //  EDICIÓN INLINE Y GRÁFICOS
  // ============================
  function handleInlineSave(f8Id, field, newValue, displayEl) { /* ... lógica de guardado ... */ }
  function attachFlowTableEditor() { /* ... lógica de editor ... */ }

  // Resumen: Gráficos y KPIs
  function updateGapAndTimeKpisFromRows(rows) {
    const kTeor = document.getElementById('kpi-teorico');
    const kReal = document.getElementById('kpi-real');
    const kDelta = document.getElementById('kpi-delta');
    const kAcum = document.getElementById('kpi-acumulado');

    if (!rows || !rows.length) {
      if(kTeor) kTeor.textContent='—'; if(kReal) kReal.textContent='—'; 
      if(kDelta) kDelta.textContent='—'; if(kAcum) kAcum.textContent='—';
      return;
    }

    let sumTeor=0, nTeor=0, sumReal=0, nReal=0, sumDelta=0;
    const deltaByDate = {};

    rows.forEach(r => {
      const rec = parseIsoDate(r['RECIBO F8']);
      const proy = parseIsoDate(r['PROY. ENTREGA']);
      const real = parseIsoDate(r['ENTREGA REAL']);

      if (rec && proy) {
        const t = daysBetween(rec, proy);
        if (t != null) { sumTeor+=t; nTeor++; }
      }
      if (rec && real) {
        const tr = daysBetween(rec, real);
        if (tr != null) { sumReal+=tr; nReal++; }
      }
      if (rec && proy && real) {
        const t = daysBetween(rec, proy);
        const tr = daysBetween(rec, real);
        if (t!=null && tr!=null) {
          const d = tr - t;
          sumDelta += d;
          const k = toDateKey(proy);
          if (!deltaByDate[k]) deltaByDate[k] = 0;
          deltaByDate[k] += d;
        }
      }
    });

    const avgTeor = nTeor ? (sumTeor/nTeor).toFixed(1) : '—';
    const avgReal = nReal ? (sumReal/nReal).toFixed(1) : '—';
    const avgDelta = (nReal && nTeor) ? ((sumReal - sumTeor) / Math.max(nReal,nTeor)).toFixed(1) : '—';

    if(kTeor) kTeor.textContent = avgTeor;
    if(kReal) kReal.textContent = avgReal;
    if(kDelta) kDelta.textContent = avgDelta;
    if(kAcum) kAcum.textContent = sumDelta.toFixed(1);

    if (typeof Chart === 'undefined') return;

    // Gráfico 1
    const ctxGap = document.getElementById('gapChart');
    if (ctxGap) {
      const labels = Object.keys(deltaByDate).sort();
      let acc = 0;
      const data = labels.map(d => { acc += deltaByDate[d]; return acc; });
      if (_gapChart) _gapChart.destroy();
      _gapChart = new Chart(ctxGap.getContext('2d'), {
        type: 'line',
        data: { labels, datasets: [{ label: 'Delta Acum.', data, borderColor: '#f97316', fill: false, tension: 0.1 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins:{legend:{display:false}} }
      });
    }

    // Gráfico 2
    const ctxStage = document.getElementById('stageDeltas');
    if (ctxStage) {
      if (_stageDeltasChart) _stageDeltasChart.destroy();
      _stageDeltasChart = new Chart(ctxStage.getContext('2d'), {
        type: 'bar',
        data: {
          labels: ['Teórico', 'Real'],
          datasets: [{
            label: 'Días Promedio',
            data: [nTeor ? sumTeor/nTeor : 0, nReal ? sumReal/nReal : 0],
            backgroundColor: ['#3b82f6', '#ef4444'],
            barThickness: 40
          }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
      });
    }

    // Gráfico 3
    const ctxComm = document.getElementById('commentsChart');
    if (ctxComm) {
      const counts = {};
      rows.forEach(r => {
        let c = (r['COMENT.']||'').trim() || 'SIN COMENTARIO';
        counts[c] = (counts[c] || 0) + 1;
      });
      const lbls = Object.keys(counts).sort((a,b) => counts[b] - counts[a]);
      const vals = lbls.map(l => counts[l]);
      if (_commentsChart) _commentsChart.destroy();
      _commentsChart = new Chart(ctxComm.getContext('2d'), {
        type: 'bar',
        data: { labels: lbls, datasets: [{ label: 'Cant.', data: vals, backgroundColor: '#60a5fa' }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, indexAxis: 'y' }
      });
    }
  }

  function updateQuickStatsFromRows(rows) {
    const totalEl = document.getElementById('stat-total');
    const procEl  = document.getElementById('stat-proceso');
    const compEl  = document.getElementById('stat-completados');
    const retrEl  = document.getElementById('stat-retraso');

    if (!rows) return;
    let tot=rows.length, proc=0, comp=0, retr=0;
    rows.forEach(r => {
      const real = parseIsoDate(r['ENTREGA REAL']);
      const proy = parseIsoDate(r['PROY. ENTREGA']);
      if(real) comp++; else proc++;
      if(real && proy && real > proy) retr++;
    });

    if(totalEl) totalEl.textContent = tot;
    if(procEl) procEl.textContent = proc;
    if(compEl) compEl.textContent = comp;
    if(retrEl) retrEl.textContent = retr;
  }

  // ============================
  //  INIT
  // ============================
  async function initFlowDashboard() {
    // Listeners de Filtros
    const selGrupo = document.getElementById('flowFilterGrupo');
    const selUnidad = document.getElementById('flowFilterUnidad');
    const selComent = document.getElementById('flowFilterComent');

    if (selGrupo) selGrupo.addEventListener('change', applyFlowFilters);
    if (selUnidad) selUnidad.addEventListener('change', applyFlowFilters);
    if (selComent) selComent.addEventListener('change', applyFlowFilters);

    document.getElementById('btnRefresh').addEventListener('click', loadInitialData);
    
    // Auth
    const btnLogin = document.getElementById('btnLogin');
    btnLogin.addEventListener('click', () => {
      if(window.google) google.accounts.id.initialize({
        client_id: CLIENT_ID, callback: r => {
          idToken = r.credential;
          document.getElementById('btnEditMode').disabled = false;
          btnLogin.textContent = '✓ Sesión OK';
        }
      });
      google.accounts.id.prompt();
    });

    document.getElementById('btnEditMode').addEventListener('click', function() {
      editMode = !editMode;
      this.textContent = `Modo edición: ${editMode?'ON':'OFF'}`;
      this.classList.toggle('edit-on', editMode);
      renderOrdersList(window.__DEBUG_LAST_ROWS || currentRows);
    });

    document.querySelectorAll('.flow-block[data-stage]').forEach(el => {
      el.addEventListener('click', () => {
        document.querySelectorAll('.flow-block').forEach(b => b.classList.remove('active'));
        el.classList.add('active');
        const stageKey = el.getAttribute('data-stage');
        onFlowBlockClick(stageKey);
      });
    });

    await loadInitialData();
    attachFlowTableEditor();
    
    const now = new Date();
    loadCalendarMonth(now.getFullYear(), now.getMonth()+1);
  }

  document.addEventListener('DOMContentLoaded', initFlowDashboard);
}

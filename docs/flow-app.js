// flow-app.js v3.4 — Vista flujo con edición inline tipo clásica en tabla
console.log('flow-app.js v3.4 — Flow view with table inline editing');

/* ===== NOTAS SOBRE MANEJO DE FECHAS =====
 *
 * Este frontend maneja fechas en formato YYYY-MM-DD (ISO 8601) con UTC para evitar
 * problemas de zona horaria.
 */

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
    { key: 'ENTREGA REAL', label: 'ENTREGA REAL', blockId: 'count-entrega-real' } // NUEVO
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
    const d = new Date(m[1] + '-' + m[2] + '-' + m[3] + 'T00:00:00Z');
    if (DEBUG) console.log('[FLOW-DATE] parseIsoDate:', v, '→', d);
    return d;
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

  function formatDateInput(v) {
    const d = parseIsoDate(v);
    if (!d) return '';
    const dd = String(d.getUTCDate()).padStart(2,'0');
    const mm = String(d.getUTCMonth()+1).padStart(2,'0');
    const yy = d.getUTCFullYear();
    const result = `${yy}-${mm}-${dd}`;
    if (DEBUG) console.log('[FLOW-DATE] formatDateInput:', v, '→', result);
    return result;
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
  //  LISTA (TABLA) + RENDER
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
      const ida = String(a.r['F8 SALMI'] || '');
      const idb = String(b.r['F8 SALMI'] || '');
      return ida.localeCompare(idb);
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

      const recForDelta  = recD;
      const proyForDelta = proyD;
      const realForDelta = realD;

      const teor  = (recForDelta && proyForDelta)
        ? Math.round(daysBetween(recForDelta, proyForDelta))
        : null;
      const realT = (recForDelta && realForDelta)
        ? Math.round(daysBetween(recForDelta, realForDelta))
        : null;

      let deltaText = '—';
      let deltaClass = 'zero';
      if (teor != null && realT != null) {
        const d = realT - teor;
        deltaText = (d > 0 ? '+'+d : d) + ' días';
        deltaClass = d > 0 ? 'positive' : (d < 0 ? 'negative' : 'zero');
      }

      const etapaHoy = stageToday ? stageToday : '—';

      return `
        <tr data-f8-id="${id}">
          <td>${id}</td>
          <td>
            ${unidad}
            <br><small>${tipo} · ${grupo}</small>
          </td>
          <td>
            <span class="editable-text" data-field="COMENT." data-f8-id="${id}">
              ${coment || '—'}
            </span>
          </td>
          <td class="${isHighlight(recD)  ? 'highlight-day' : ''}">${rec}</td>
          <td class="${isHighlight(asgD)  ? 'highlight-day' : ''}">
            <span class="editable-date"
                  data-field="ASIGNACIÓN"
                  data-f8-id="${id}">${asg}</span>
          </td>
          <td class="${isHighlight(salD)  ? 'highlight-day' : ''}">
            <span class="editable-date"
                  data-field="SALIDA"
                  data-f8-id="${id}">${sal}</span>
          </td>
          <td class="${isHighlight(despD) ? 'highlight-day' : ''}">
            <span class="editable-date"
                  data-field="DESPACHO"
                  data-f8-id="${id}">${desp}</span>
          </td>
          <td class="${isHighlight(facD)  ? 'highlight-day' : ''}">
            <span class="editable-date"
                  data-field="FACTURACIÓN"
                  data-f8-id="${id}">${fac}</span>
          </td>
          <td class="${isHighlight(empD)  ? 'highlight-day' : ''}">
            <span class="editable-date"
                  data-field="EMPACADO"
                  data-f8-id="${id}">${emp}</span>
          </td>
          <td class="${isHighlight(proyD) ? 'highlight-day' : ''}">
            <span class="editable-date"
                  data-field="PROY. ENTREGA"
                  data-f8-id="${id}">${proy}</span>
          </td>
          <td class="${isHighlight(realD) ? 'highlight-day' : ''}">
            <span class="editable-date"
                  data-field="ENTREGA REAL"
                  data-f8-id="${id}">${real}</span>
          </td>
          <td>
            <span class="date-delta ${deltaClass}">${deltaText}</span>
            <br><small>${etapaHoy}</small>
          </td>
        </tr>
      `;
    }).join('');

    const html = `
      <table class="flow-table">
        <thead>
          <tr>
            <th>F8 SALMI</th>
            <th>Unidad / Tipo / Grupo</th>
            <th>Comentario</th>
            <th>Recibo F8</th>
            <th>Asignación</th>
            <th>Salida</th>
            <th>Despacho</th>
            <th>Facturación</th>
            <th>Empacado</th>
            <th>Proy. Entrega</th>
            <th>Entrega Real</th>
            <th>Delta / Etapa</th>
          </tr>
        </thead>
        <tbody>
          ${htmlRows}
        </tbody>
      </table>
    `;

    container.innerHTML = html;
    container.classList.toggle('edit-mode-on', editMode);
  }

  // ========== LÓGICA DE EDICIÓN INLINE (usa handleInlineSave) ==========
  async function handleInlineSave(f8Id, field, newValue, displayEl) {
    const rows = currentRows || [];
    const row = rows.find(r => r['F8 SALMI'] === f8Id);
    if (!row) {
      console.error('[FLOW-EDIT] Row not found for F8 SALMI:', f8Id);
      alert('No se encontró la fila correspondiente.');
      return;
    }

    const id = row['F8 SALMI'];
    if (!id) {
      alert('No se encontró F8 SALMI en la fila.');
      return;
    }

    const oldRaw = row[field] || '';
    const oldDisplay = displayEl.textContent || '';

    console.log('[FLOW-EDIT] Starting save:', { id, field, oldRaw, newValue });

    if (!idToken) {
      alert('Inicia sesión con "Acceder" antes de editar.');
      displayEl.textContent = oldDisplay;
      return;
    }

    const norm = v => String(v || '').trim();
    let valueToSend = newValue || '';

    if (DATE_FIELDS.includes(field)) {
      const oldNorm = formatDateInput(oldRaw);
      if (norm(newValue) === norm(oldNorm)) {
        console.log('[FLOW-EDIT] No change detected, skipping save');
        displayEl.textContent = oldDisplay;
        return;
      }
      if (valueToSend) {
        const [yy, mm, dd] = valueToSend.split('-');
        const yy2 = +yy;
        const mm2 = String(+mm).padStart(2, '0');
        const dd2 = String(+dd).padStart(2, '0');
        valueToSend = `${yy2}-${mm2}-${dd2}`;
        console.log('[FLOW-EDIT] Date field - sending value:', valueToSend);
      }
    } else {
      if (norm(newValue) === norm(oldRaw)) {
        console.log('[FLOW-EDIT] No change detected, skipping save');
        displayEl.textContent = oldDisplay;
        return;
      }
      valueToSend = norm(valueToSend);
    }

    displayEl.textContent = '…';

    try {
      const url = `${B}?route=orders.update`
        + `&idToken=${encodeURIComponent(idToken)}`
        + `&id=${encodeURIComponent(id)}`
        + `&field=${encodeURIComponent(field)}`
        + `&value=${encodeURIComponent(valueToSend)}`;

      console.log('[FLOW-EDIT] Sending update:', { url: url.replace(/idToken=[^&]+/, 'idToken=***'), id, field, valueToSend });

      const res = await jsonp(url);

      console.log('[FLOW-EDIT] Backend response:', res);

      if (!res || res.status !== 'ok') {
        displayEl.textContent = oldDisplay;
        alert('Error al guardar: ' + (res && res.error ? res.error : 'desconocido'));
        return;
      }

      console.log('[FLOW-EDIT] Save successful');

      // Actualizamos la fila en memoria sin recargar todo el dashboard
      row[field] = valueToSend;

      // Actualizamos solo el display de la celda
      if (DATE_FIELDS.includes(field)) {
        displayEl.textContent = formatDateShort(valueToSend);
      } else {
        displayEl.textContent = valueToSend || '—';
      }

    } catch (e) {
      console.warn('[FLOW-EDIT] handleInlineSave error', e);
      displayEl.textContent = oldDisplay;
      alert('Error de red al guardar.');
    }
  }

  // Editor tipo clásica sobre la tabla flow-table
  function attachFlowTableEditor() {
    const container = document.getElementById('ordersList');
    if (!container) return;

    container.addEventListener('click', (ev) => {
      if (!editMode) return;

      const td = ev.target.closest('td');
      const table = ev.target.closest('.flow-table');
      if (!td || !table) return;

      const spanDate = td.querySelector('.editable-date');
      const spanText = td.querySelector('.editable-text');
      if (!spanDate && !spanText) return;

      if (td.querySelector('.cell-editor')) return;

      const tr = td.closest('tr');
      const f8Id = tr ? tr.getAttribute('data-f8-id') : null;
      if (!f8Id) return;

      const rows = currentRows || [];
      const row = rows.find(r => r['F8 SALMI'] === f8Id);
      if (!row) {
        console.error('[FLOW-EDIT] Row not found for F8 SALMI:', f8Id);
        return;
      }

      // Comentario
      if (spanText) {
        const field = 'COMENT.';
        const oldRaw = row[field] || '';
        const oldDisplay = spanText.textContent || '—';

        const wrapper = document.createElement('div');
        wrapper.className = 'cell-editor';

        const select = document.createElement('select');
        select.style.width = '100%';
        COMMENT_OPTIONS.forEach(optVal => {
          const opt = document.createElement('option');
          opt.value = optVal;
          opt.textContent = optVal || '—';
          if ((oldRaw || '') === optVal) opt.selected = true;
          select.appendChild(opt);
        });

        wrapper.appendChild(select);
        td.innerHTML = '';
        td.appendChild(wrapper);

        select.focus();

        let finished = false;
        const finish = async (commit) => {
          if (finished) return;
          finished = true;
          if (!commit) {
            td.textContent = oldDisplay;
            return;
          }
          let newVal = select.value;
          if (newVal == null) newVal = '';
          newVal = String(newVal).trim();
          await handleInlineSave(f8Id, field, newVal, td);
        };

        select.addEventListener('keydown', e => {
          if (e.key === 'Enter') {
            e.preventDefault();
            finish(true);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            finish(false);
          }
        });

        select.addEventListener('change', () => {
          if (select.value !== oldRaw) {
            finish(true);
          }
        });

        select.addEventListener('blur', () => {
          if (select.value === oldRaw) {
            td.textContent = oldDisplay;
          }
        });

        return;
      }

      // Fechas
      if (spanDate) {
        const field = spanDate.getAttribute('data-field');
        if (!DATE_FIELDS.includes(field)) return;

        const oldRaw = row[field] || '';
        const oldDisplay = spanDate.textContent || '';

        const wrapper = document.createElement('div');
        wrapper.className = 'cell-editor';

        const input = document.createElement('input');
        input.type = 'date';
        input.style.width = '100%';
        input.style.boxSizing = 'border-box';
        input.value = formatDateInput(oldRaw);

        wrapper.appendChild(input);
        td.innerHTML = '';
        td.appendChild(wrapper);

        input.focus();

        let finished = false;
        const finish = async (commit) => {
          if (finished) return;
          finished = true;
          if (!commit) {
            td.textContent = oldDisplay;
            return;
          }
          const newVal = input.value || '';
          await handleInlineSave(f8Id, field, newVal, td);
        };

        input.addEventListener('keydown', e => {
          if (e.key === 'Enter') {
            e.preventDefault();
            finish(true);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            finish(false);
          }
        });

        input.addEventListener('change', () => {
          const newVal = input.value || '';
          if (newVal !== formatDateInput(oldRaw)) {
            finish(true);
          }
        });

        input.addEventListener('blur', () => {
          const newVal = input.value || '';
          if (newVal === formatDateInput(oldRaw)) {
            td.textContent = oldDisplay;
          }
        });

        return;
      }
    });
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
  //  CONTADORES DE BLOQUES
  // ============================
  function updateFlowBlockCounts(rows) {
    const dateKey = currentDayFilter;
    if (!dateKey) {
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
        if (toDateKey(d) === dateKey) counts[col.label]++;
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
  //  CHECKLIST MENSUALES
  // ============================
  async function loadMonthlyChecklist(dateKey) {
    const labelEl = document.getElementById('monthlyDateLabel');
    const contEl  = document.getElementById('monthlyChecklist');
    if (!contEl) return;

    if (labelEl) labelEl.textContent = `(${dateKey})`;
    contEl.innerHTML = '<p class="loading-message">Cargando checklist de mensuales...</p>';

    try {
      const res = await jsonp(`${A}?route=monthly.checklist&date=${dateKey}`);
      if (!res || res.status !== 'ok') {
        console.warn('monthly.checklist error', res && res.error);
        contEl.innerHTML = '<p class="loading-message">No se pudo cargar el checklist.</p>';
        return;
      }

      const data = res.data || {};
      const unidadesResumen = data.grupos || [];

      if (!unidadesResumen.length) {
        contEl.innerHTML = '<p class="loading-message">No hay mensuales para esta fecha.</p>';
        return;
      }

      const detallePorUnidad = new Map();
      const rows = currentRows || [];

      rows.forEach(r => {
        const unidad = String(r['UNIDAD'] || '').trim();
        const grupo  = String(r['GRUPO']  || '').trim();
        if (!unidad || !grupo) return;

        if (!detallePorUnidad.has(unidad)) {
          detallePorUnidad.set(unidad, new Map());
        }
        const mapGrupos = detallePorUnidad.get(unidad);

        if (!mapGrupos.has(grupo)) {
          mapGrupos.set(grupo, {
            unidad,
            grupo,
            total: 0,
            conAsignacion: 0,
            conSalida: 0,
            conFact: 0,
            conEmpacado: 0,
            conProy: 0,
            conEntregaReal: 0
          });
        }
        const acc = mapGrupos.get(grupo);
        acc.total++;
        if (r['ASIGNACIÓN'])    acc.conAsignacion++;
        if (r['SALIDA'])        acc.conSalida++;
        if (r['FACTURACIÓN'])   acc.conFact++;
        if (r['EMPACADO'])      acc.conEmpacado++;
        if (r['PROY. ENTREGA']) acc.conProy++;
        if (r['ENTREGA REAL'])  acc.conEntregaReal++;
      });

      const html = `
        <table class="monthly-table" id="monthlyTableMain">
          <thead>
            <tr>
              <th style="width:32px;"></th>
              <th>Unidad</th>
              <th>Requisiciones</th>
              <th>Con Asig.</th>
              <th>Con Salida</th>
              <th>Con Fact.</th>
              <th>Con Emp.</th>
              <th>Con Proy.</th>
              <th>Con Entrega</th>
              <th title="Facturación antes de salida">Fact &lt; Sal</th>
              <th title="Facturación &gt; 7 días después de salida">Fact &gt;7d</th>
              <th>Solo Salida</th>
              <th>Solo Fact.</th>
            </tr>
          </thead>
          <tbody>
            ${unidadesResumen.map(u => {
              const inco = u.incoherencias || {};
              const hayErr = (inco.factAntesSalida || inco.soloFact);
              const hayWarn = inco.factMuyTarde || inco.soloSalida || u.conSalida === 0;
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
                  <td>${inco.factAntesSalida || 0}</td>
                  <td>${inco.factMuyTarde || 0}</td>
                  <td>${inco.soloSalida || 0}</td>
                  <td>${inco.soloFact || 0}</td>
                </tr>
              `;

              if (tieneDetalle) {
                const gruposMap = detallePorUnidad.get(unidad);
                const gruposArr = Array.from(gruposMap.values())
                  .sort((a,b) => a.grupo.localeCompare(b.grupo));

                filas += gruposArr.map(g => `
                  <tr class="monthly-row-grupo monthly-row-grupo-hidden"
                      data-unidad="${unidad.replace(/"/g,'&quot;')}"
                      data-grupo="${g.grupo.replace(/"/g,'&quot;')}">
                    <td></td>
                    <td style="padding-left:20px;">${g.grupo}</td>
                    <td>${g.total}</td>
                    <td>${g.conAsignacion}</td>
                    <td>${g.conSalida}</td>
                    <td>${g.conFact}</td>
                    <td>${g.conEmpacado}</td>
                    <td>${g.conProy}</td>
                    <td>${g.conEntregaReal}</td>
                    <td></td>
                    <td></td>
                    <td></td>
                    <td></td>
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

    } catch (e) {
      console.warn('loadMonthlyChecklist error', e);
      contEl.innerHTML = '<p class="loading-message">Error de red al cargar checklist.</p>';
    }
  }

  // ============================
  //  CALENDARIO
  // ============================
  let currentCalYear, currentCalMonth;
  let currentCalData = {};
  window.__CAL_DATA__ = currentCalData;

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
    window.__CAL_DATA__ = currentCalData;
    renderCalendar();
  }

  function renderCalendar() {
    const calEl = document.getElementById('calendar');
    const titleEl = document.getElementById('calendarTitle');
    if (!calEl || !titleEl) return;

    const year = currentCalYear;
    const month = currentCalMonth;

    const firstDay = new Date(Date.UTC(year, month - 1, 1));
    const startDow = firstDay.getUTCDay();
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();

    const monthNames = [
      'Enero','Febrero','Marzo','Abril','Mayo','Junio',
      'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'
    ];
    titleEl.textContent = `${monthNames[month - 1]} ${year}`;

    calEl.innerHTML = '';

    const dayNames = ['L','M','X','J','V','S','D'];
    dayNames.forEach(dn => {
      const div = document.createElement('div');
      div.className = 'calendar-day-header';
      div.textContent = dn;
      calEl.appendChild(div);
    });

    let dow = (startDow + 6) % 7;
    for (let i = 0; i < dow; i++) {
      const empty = document.createElement('div');
      empty.className = 'calendar-day other-month';
      calEl.appendChild(empty);
    }

    const todayKey = toDateKey(new Date());

    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(Date.UTC(year, month - 1, day));
      const key = toDateKey(d);
      const info = currentCalData[key] || { total: 0, byStage: {}, reciboF8: 0 };
      const total = info.total || 0;
      const bySt = info.byStage || {};
      const reciboF8 = info.reciboF8 || 0;

      const cell = document.createElement('div');
      cell.className = 'calendar-day';
      if (key === todayKey) cell.classList.add('today');
      if (currentDayFilter === key) cell.classList.add('selected');

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
        Object.keys(bySt).sort().forEach(st => {
          tooltip += `${st}: ${bySt[st]}\n`;
        });
        cell.title = tooltip.trim();
      }

      if (reciboF8 > 0) {
        const mini = document.createElement('div');
        mini.className = 'calendar-mini-counter';
        mini.textContent = reciboF8;
        cell.appendChild(mini);
      }

      cell.addEventListener('click', () => onCalendarDayClick(key));
      calEl.appendChild(cell);
    }
  }

  async function onCalendarDayClick(dateKey) {
    currentDayFilter = dateKey;

    const title = document.getElementById('panel-title');
    if (title) title.textContent = `Requisiciones del ${dateKey}`;

    // 1) Cargamos las filas del día (tabla) y mostramos lo antes posible
    const res = await jsonp(`${A}?route=calendar.daydetails&date=${dateKey}`);
    if (!res || res.status !== 'ok') {
      console.warn('calendar.daydetails error', res && res.error);
      return;
    }
    const data = res.data;
    currentRows = data.rows || [];

    populateFlowFilterOptionsFromRows(currentRows);
    applyFlowFilters(); // esto ya pinta la tabla

    const btnClear = document.getElementById('btnClearFilter');
    if (btnClear) btnClear.style.display = 'inline-block';

    renderCalendar();

    // 2) Checklist mensuales EN SEGUNDO PLANO
    loadMonthlyChecklist(dateKey).catch(e => {
      console.warn('loadMonthlyChecklist error', e);
    });
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

    const map = {
      'RECIBO':'RECIBO F8',
      'ASIGNACION':'ASIGNACIÓN',
      'SALIDA':'SALIDA',
      'DESPACHO':'DESPACHO',
      'FACTURACION':'FACTURACIÓN',
      'EMPACADO':'EMPACADO',
      'ENTREGA':'PROY. ENTREGA',
      'ENTREGA_REAL':'ENTREGA REAL'          // NUEVO
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

    await loadMonthlyChecklist(currentDayFilter);

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

    const kTotal  = document.getElementById('stat-total');
    const kProc   = document.getElementById('stat-proceso');
    const kComp   = document.getElementById('stat-completados');
    const kRetr   = document.getElementById('stat-retraso');

    function setStatusFilter(status) {
      currentStatusFilter = status;
      applyFlowFilters();
    }

    if (kTotal) {
      kTotal.style.cursor = 'pointer';
      kTotal.addEventListener('click', () => setStatusFilter('ALL'));
    }
    if (kProc) {
      kProc.style.cursor = 'pointer';
      kProc.addEventListener('click', () => setStatusFilter('IN_PROGRESS'));
    }
    if (kComp) {
      kComp.style.cursor = 'pointer';
      kComp.addEventListener('click', () => setStatusFilter('COMPLETED'));
    }
    if (kRetr) {
      kRetr.style.cursor = 'pointer';
      kRetr.addEventListener('click', () => setStatusFilter('LATE'));
    }

    if (btnLogin) {
      btnLogin.addEventListener('click', () => {
        if (window.google?.accounts?.id) {
          google.accounts.id.initialize({
            client_id: CLIENT_ID,
            callback: r => {
              idToken = r.credential;
              if (btnEditMode) btnEditMode.disabled = false;
              btnLogin.style.display = 'none';
              alert('Sesión iniciada. Activa “Modo edición”.');
              const loginStatus = document.createElement('span');
              loginStatus.textContent = '✓ Sesión iniciada';
              loginStatus.style.color = '#10b981';
              loginStatus.style.fontWeight = 'bold';
              loginStatus.style.marginRight = '1rem';
              btnLogin.parentNode.insertBefore(loginStatus, btnLogin);
            }
          });
          btnLogin.textContent = '';
          btnLogin.style.padding = '0';
          btnLogin.style.border = 'none';
          btnLogin.style.background = 'transparent';
          google.accounts.id.renderButton(btnLogin, {
            theme: 'outline',
            size: 'large',
            text: 'signin_with',
            width: 200
          });
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
        applyFlowFilters();
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
        currentStatusFilter = 'ALL';
        if (selGrupo) selGrupo.value = '';
        if (selUnidad) selUnidad.value = '';
        if (selComent) selComent.value = '';
        const labelEl = document.getElementById('monthlyDateLabel');
        const contEl  = document.getElementById('monthlyChecklist');
        if (labelEl) labelEl.textContent = '';
        if (contEl) contEl.innerHTML = '<p class="loading-message">Seleccione un día con mensuales para ver el resumen.</p>';
        const groupsEl = document.getElementById('monthlyGroupsSummary');
        if (groupsEl) groupsEl.innerHTML = '<p class="loading-message">Seleccione un día para ver el resumen por grupo.</p>';
        loadInitialData();
        renderCalendar();
      });
    }

    if (btnExport) {
      btnExport.addEventListener('click', exportCurrentRowsToCSV);
    }

    if (selGrupo) selGrupo.addEventListener('change', () => {
      applyFlowFilters();
      if (currentDayFilter) loadMonthlyChecklist(currentDayFilter);
    });
    if (selUnidad) selUnidad.addEventListener('change', () => {
      applyFlowFilters();
      if (currentDayFilter) loadMonthlyChecklist(currentDayFilter);
    });
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

    // Activar editor sobre la tabla
    attachFlowTableEditor();

    const now = new Date();
    currentDayFilter = toDateKey(now);

    await loadCalendarMonth(now.getUTCFullYear(), now.getUTCMonth()+1);
    await onCalendarDayClick(currentDayFilter);
  }

  document.addEventListener('DOMContentLoaded', initFlowDashboard);
}

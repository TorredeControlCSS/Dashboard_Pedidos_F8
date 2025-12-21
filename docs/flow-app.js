// flow-app.js v3.9 — Corrección de referencias y orden de carga
console.log('flow-app.js v3.9 — Loaded');

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

  const DATE_FIELDS = ['ASIGNACIÓN','SALIDA','DESPACHO','FACTURACIÓN','EMPACADO','PROY. ENTREGA','ENTREGA REAL'];
  const COMMENT_OPTIONS = ['','DISCREPANCIA DE INVENTARIO','FALTA DE PERSONAL','VIATICOS PARA VIAJES','FALTA MONTACARGA','CONGESTIONAMIENTO EN SALIDAS','FACTURACION RETRASADA','FALLAS EN SISTEMA','DEMORA EN DOCUMENTACION','ERROR DE CAPTACION','ENTREGADO'];

  let idToken = null;
  let editMode = false;
  let currentDayFilter = null;
  let currentRows = [];
  let currentStatusFilter = 'ALL';
  let currentCalYear, currentCalMonth;
  let currentCalData = {};

  // --- HELPERS ---
  function jsonp(url) {
    return new Promise((resolve, reject) => {
      const cb = 'cb_' + Math.random().toString(36).slice(2);
      const s = document.createElement('script');
      window[cb] = payload => {
        try { resolve(payload); } finally { try { delete window[cb]; } catch(e){} s.remove(); }
      };
      s.onerror = () => { try { delete window[cb]; } catch(e){} s.remove(); reject(new Error('network')); };
      s.src = url + (url.includes('?') ? '&' : '?') + 'callback=' + cb + '&_=' + Date.now();
      document.body.appendChild(s);
    });
  }

  function parseIsoDate(v) {
    if (!v) return null;
    if (v instanceof Date) return v;
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v));
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 0, 0, 0, 0);
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
      if (toDateKey(d) === dateKey) lastMatch = col.label;
    }
    return lastMatch;
  }

  // --- FILTROS Y RENDERIZADO GLOBAL ---
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

    if (currentDayFilter) {
      loadMonthlyChecklist(currentDayFilter, filtered);
    }
  }

  function populateFlowFilterOptionsFromRows(rows) {
    const selGrupo = document.getElementById('flowFilterGrupo');
    const selUnidad = document.getElementById('flowFilterUnidad');
    if (!rows || !rows.length) {
      if(selGrupo) selGrupo.innerHTML = '<option value="">Todos los grupos</option>';
      if(selUnidad) selUnidad.innerHTML = '<option value="">Todas las unidades</option>';
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
      selGrupo.innerHTML = '<option value="">Todos los grupos</option>' + Array.from(grupos).sort().map(g => `<option value="${g}">${g}</option>`).join('');
      if(Array.from(grupos).includes(antes)) selGrupo.value = antes;
    }
    if (selUnidad) {
      const antes = selUnidad.value;
      selUnidad.innerHTML = '<option value="">Todas las unidades</option>' + Array.from(unidades).sort().map(u => `<option value="${u}">${u}</option>`).join('');
      if(Array.from(unidades).includes(antes)) selUnidad.value = antes;
    }
  }

  // --- TABLA REQUISICIONES ---
  function renderOrdersList(rows) {
    const container = document.getElementById('ordersList');
    if (!container) return;
    if (!rows || !rows.length) {
      container.innerHTML = '<p class="loading-message">Sin resultados.</p>';
      return;
    }
    const dateKey = currentDayFilter;
    const enriched = rows.map(r => ({ r, stageToday: flowStageForDate(r, dateKey) }));
    
    // Ordenar
    enriched.sort((a,b) => {
        const ia = FLOW_COLUMNS.findIndex(c => c.label === a.stageToday);
        const ib = FLOW_COLUMNS.findIndex(c => c.label === b.stageToday);
        if (ia !== ib) return (ia<0?99:ia) - (ib<0?99:ib);
        return String(a.r['F8 SALMI']||'').localeCompare(String(b.r['F8 SALMI']||''));
    });

    const htmlRows = enriched.map(({r, stageToday}) => {
      const id = r['F8 SALMI'] || '(sin F8)';
      const unidad = r['UNIDAD'] || '';
      const recD = parseIsoDate(r['RECIBO F8']);
      const proyD = parseIsoDate(r['PROY. ENTREGA']);
      const realD = parseIsoDate(r['ENTREGA REAL']);
      
      const isHighlight = d => d && toDateKey(d) === dateKey;
      
      const teor = (recD && proyD) ? Math.round(daysBetween(recD, proyD)) : null;
      const realT = (recD && realD) ? Math.round(daysBetween(recD, realD)) : null;
      let deltaText='—', deltaClass='zero';
      if (teor!=null && realT!=null) {
        const d = realT - teor;
        deltaText = (d>0?'+'+d:d) + ' días';
        deltaClass = d>0?'positive':(d<0?'negative':'zero');
      }

      return `<tr data-f8-id="${id}">
        <td>${id}</td>
        <td>${unidad}<br><small>${r['TIPO']||''} · ${r['GRUPO']||''}</small></td>
        <td><span class="editable-text" data-field="COMENT." data-f8-id="${id}">${r['COMENT.']||'—'}</span></td>
        <td class="${isHighlight(recD)?'highlight-day':''}">${formatDateShort(recD)}</td>
        <td class="${isHighlight(parseIsoDate(r['ASIGNACIÓN']))?'highlight-day':''}"><span class="editable-date" data-field="ASIGNACIÓN" data-f8-id="${id}">${formatDateShort(r['ASIGNACIÓN'])}</span></td>
        <td class="${isHighlight(parseIsoDate(r['SALIDA']))?'highlight-day':''}"><span class="editable-date" data-field="SALIDA" data-f8-id="${id}">${formatDateShort(r['SALIDA'])}</span></td>
        <td class="${isHighlight(parseIsoDate(r['DESPACHO']))?'highlight-day':''}"><span class="editable-date" data-field="DESPACHO" data-f8-id="${id}">${formatDateShort(r['DESPACHO'])}</span></td>
        <td class="${isHighlight(parseIsoDate(r['FACTURACIÓN']))?'highlight-day':''}"><span class="editable-date" data-field="FACTURACIÓN" data-f8-id="${id}">${formatDateShort(r['FACTURACIÓN'])}</span></td>
        <td class="${isHighlight(parseIsoDate(r['EMPACADO']))?'highlight-day':''}"><span class="editable-date" data-field="EMPACADO" data-f8-id="${id}">${formatDateShort(r['EMPACADO'])}</span></td>
        <td class="${isHighlight(proyD)?'highlight-day':''}"><span class="editable-date" data-field="PROY. ENTREGA" data-f8-id="${id}">${formatDateShort(proyD)}</span></td>
        <td class="${isHighlight(realD)?'highlight-day':''}"><span class="editable-date" data-field="ENTREGA REAL" data-f8-id="${id}">${formatDateShort(realD)}</span></td>
        <td><span class="date-delta ${deltaClass}">${deltaText}</span><br><small>${stageToday||'—'}</small></td>
      </tr>`;
    }).join('');

    container.innerHTML = `<table class="flow-table"><thead><tr>
      <th>F8 SALMI</th><th>Unidad / Tipo / Grupo</th><th>Comentario</th>
      <th>Recibo F8</th><th>Asign.</th><th>Salida</th><th>Desp.</th>
      <th>Fact.</th><th>Emp.</th><th>Proy. Entrega</th><th>Entrega Real</th>
      <th>Delta / Etapa</th></tr></thead><tbody>${htmlRows}</tbody></table>`;
    container.classList.toggle('edit-mode-on', editMode);
  }

  // --- CHECKLIST MENSUALES (LOCAL Y FILTRADO) ---
  function loadMonthlyChecklist(dateKey, filteredRows = null) {
    const contEl = document.getElementById('monthlyChecklist');
    const labelEl = document.getElementById('monthlyDateLabel');
    if (!contEl) return;
    if (labelEl) labelEl.textContent = `(${dateKey||''})`;

    const rowsToProcess = filteredRows || currentRows || [];
    if (!rowsToProcess.length) {
      contEl.innerHTML = '<p class="loading-message">No hay datos.</p>';
      return;
    }

    const resumen = new Map(), detalle = new Map();

    rowsToProcess.forEach(r => {
      const u = String(r['UNIDAD']||'').trim();
      const g = String(r['GRUPO']||'').trim();
      if(!u) return;

      if(!resumen.has(u)) resumen.set(u, { unidad:u, total:0, asig:0, sal:0, fact:0, emp:0, proy:0, ent:0, err1:0, err2:0, err3:0, err4:0 });
      if(!detalle.has(u)) detalle.set(u, new Map());
      if(!detalle.get(u).has(g)) detalle.get(u).set(g, { grupo:g, total:0, asig:0, sal:0, fact:0, emp:0, proy:0, ent:0 });

      const us = resumen.get(u);
      const gs = detalle.get(u).get(g);

      const hasAsig = !!r['ASIGNACIÓN'], hasSal=!!r['SALIDA'], hasFact=!!r['FACTURACIÓN'], hasEmp=!!r['EMPACADO'], hasProy=!!r['PROY. ENTREGA'], hasEnt=!!r['ENTREGA REAL'];
      
      const dSal = parseIsoDate(r['SALIDA']), dFact = parseIsoDate(r['FACTURACIÓN']);
      let e1=0,e2=0; 
      if(dSal && dFact){ if(dFact<dSal) e1=1; if(daysBetween(dSal,dFact)>7) e2=1; }
      const e3 = (hasSal && !hasFact)?1:0;
      const e4 = (!hasSal && hasFact)?1:0;

      us.total++; if(hasAsig) us.asig++; if(hasSal) us.sal++; if(hasFact) us.fact++; if(hasEmp) us.emp++; if(hasProy) us.proy++; if(hasEnt) us.ent++;
      us.err1+=e1; us.err2+=e2; us.err3+=e3; us.err4+=e4;

      gs.total++; if(hasAsig) gs.asig++; if(hasSal) gs.sal++; if(hasFact) gs.fact++; if(hasEmp) gs.emp++; if(hasProy) gs.proy++; if(hasEnt) gs.ent++;
    });

    const list = Array.from(resumen.values()).sort((a,b)=>a.unidad.localeCompare(b.unidad));
    const html = `<table class="monthly-table" id="monthlyTableMain"><thead><tr>
      <th style="width:32px;"></th><th>Unidad</th><th>Req.</th><th>Con Asig.</th><th>Con Salida</th><th>Con Fact.</th>
      <th>Con Emp.</th><th>Con Proy.</th><th>Con Entrega</th>
      <th title="Fact < Sal">Fact&lt;Sal</th><th title="Fact > 7d">Fact&gt;7d</th><th>Solo Sal</th><th>Solo Fact</th>
    </tr></thead><tbody>` + list.map(u => {
      const cls = (u.err1>0||u.err4>0) ? 'badge-err' : ((u.err2>0||u.err3>0||(u.total>0 && u.sal===0))?'badge-warn':'badge-ok');
      const hasDet = detalle.has(u.unidad);
      let s = `<tr class="monthly-row-unidad" data-unidad="${u.unidad.replace(/"/g,'&quot;')}">
        <td class="monthly-toggle-cell">${hasDet?`<button class="monthly-toggle-btn" data-unidad="${u.unidad.replace(/"/g,'&quot;')}">+</button>`:''}</td>
        <td>${u.unidad}</td><td class="${cls}">${u.total}</td>
        <td>${u.asig}</td><td>${u.sal}</td><td>${u.fact}</td><td>${u.emp}</td><td>${u.proy}</td><td>${u.ent}</td>
        <td>${u.err1}</td><td>${u.err2}</td><td>${u.err3}</td><td>${u.err4}</td>
      </tr>`;
      if(hasDet){
        const subs = Array.from(detalle.get(u.unidad).values()).sort((a,b)=>a.grupo.localeCompare(b.grupo));
        s += subs.map(g => `<tr class="monthly-row-grupo monthly-row-grupo-hidden" data-unidad="${u.unidad.replace(/"/g,'&quot;')}">
          <td></td><td style="padding-left:20px;">${g.grupo}</td><td>${g.total}</td>
          <td>${g.asig}</td><td>${g.sal}</td><td>${g.fact}</td><td>${g.emp}</td><td>${g.proy}</td><td>${g.ent}</td>
          <td></td><td></td><td></td><td></td></tr>`).join('');
      }
      return s;
    }).join('') + `</tbody></table>`;
    
    contEl.innerHTML = html;

    // Listeners Acordeón
    const table = document.getElementById('monthlyTableMain');
    if(table) {
      table.addEventListener('click', ev => {
        const btn = ev.target.closest('.monthly-toggle-btn');
        if(!btn) return;
        const u = btn.getAttribute('data-unidad');
        const rows = table.querySelectorAll(`tr.monthly-row-grupo[data-unidad="${u}"]`);
        const collapsed = btn.textContent === '+';
        btn.textContent = collapsed ? '−' : '+';
        rows.forEach(r => collapsed ? r.classList.remove('monthly-row-grupo-hidden') : r.classList.add('monthly-row-grupo-hidden'));
      });
    }
  }

  // --- GRÁFICOS Y TARJETAS ---
  let _gapChart, _stageDeltasChart, _commentsChart;
  function updateQuickStatsFromRows(rows) {
    if(!rows) return;
    let tot=rows.length, proc=0, comp=0, retr=0;
    rows.forEach(r => {
      const real = parseIsoDate(r['ENTREGA REAL']), proy = parseIsoDate(r['PROY. ENTREGA']);
      if(real) comp++; else proc++;
      if(real && proy && real>proy) retr++;
    });
    const set = (id,v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
    set('stat-total', tot); set('stat-proceso', proc); set('stat-completados', comp); set('stat-retraso', retr);
  }

  function updateGapAndTimeKpisFromRows(rows) {
    const set = (id,v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
    if (!rows || !rows.length) {
      set('kpi-teorico','—'); set('kpi-real','—'); set('kpi-delta','—'); set('kpi-acumulado','—');
      if(_gapChart)_gapChart.destroy(); if(_stageDeltasChart)_stageDeltasChart.destroy(); if(_commentsChart)_commentsChart.destroy();
      return;
    }
    let sTeor=0, nTeor=0, sReal=0, nReal=0, sDelta=0, deltas={};
    rows.forEach(r => {
      const rec = parseIsoDate(r['RECIBO F8']), proy = parseIsoDate(r['PROY. ENTREGA']), real = parseIsoDate(r['ENTREGA REAL']);
      if(rec && proy) { const t=daysBetween(rec,proy); if(t!=null){ sTeor+=t; nTeor++; } }
      if(rec && real) { const t=daysBetween(rec,real); if(t!=null){ sReal+=t; nReal++; } }
      if(rec && proy && real) {
        const t=daysBetween(rec,proy), tr=daysBetween(rec,real);
        if(t!=null && tr!=null) {
          const d=tr-t; sDelta+=d;
          const k=toDateKey(proy); if(!deltas[k]) deltas[k]=0; deltas[k]+=d;
        }
      }
    });
    set('kpi-teorico', nTeor ? (sTeor/nTeor).toFixed(1) : '—');
    set('kpi-real', nReal ? (sReal/nReal).toFixed(1) : '—');
    set('kpi-delta', (nReal&&nTeor) ? ((sReal-sTeor)/Math.max(nReal,nTeor)).toFixed(1) : '—');
    set('kpi-acumulado', sDelta.toFixed(1));

    if(typeof Chart === 'undefined') return;

    const ctxGap = document.getElementById('gapChart');
    if(ctxGap) {
      const lbls = Object.keys(deltas).sort();
      let acc=0; const data = lbls.map(d=>{ acc+=deltas[d]; return acc; });
      if(_gapChart) _gapChart.destroy();
      _gapChart = new Chart(ctxGap,{type:'line',data:{labels:lbls,datasets:[{label:'Delta',data,borderColor:'#f97316',fill:false,tension:0.1}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}}}});
    }
    const ctxStage = document.getElementById('stageDeltas');
    if(ctxStage) {
      if(_stageDeltasChart) _stageDeltasChart.destroy();
      _stageDeltasChart = new Chart(ctxStage,{type:'bar',data:{labels:['Teórico','Real'],datasets:[{data:[nTeor?sTeor/nTeor:0, nReal?sReal/nReal:0],backgroundColor:['#3b82f6','#ef4444'],barThickness:40}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}}}});
    }
    const ctxComm = document.getElementById('commentsChart');
    if(ctxComm) {
      const cnt={}; rows.forEach(r=>{ let c=(r['COMENT.']||'').trim()||'SIN COMENTARIO'; cnt[c]=(cnt[c]||0)+1; });
      const ls = Object.keys(cnt).sort((a,b)=>cnt[b]-cnt[a]);
      if(_commentsChart) _commentsChart.destroy();
      _commentsChart = new Chart(ctxComm,{type:'bar',data:{labels:ls,datasets:[{data:ls.map(l=>cnt[l]),backgroundColor:'#60a5fa'}]},options:{responsive:true,maintainAspectRatio:false,indexAxis:'y',plugins:{legend:{display:false}}}});
    }
  }

  function updateFlowBlockCounts(rows) {
    if (!currentDayFilter) {
      FLOW_COLUMNS.forEach(c => { const el=document.getElementById(c.blockId); if(el) el.textContent='0'; });
      return;
    }
    const c={}; FLOW_COLUMNS.forEach(x=>c[x.label]=0);
    rows.forEach(r=>{
      FLOW_COLUMNS.forEach(col=>{
        const d = parseIsoDate(r[col.key]);
        if(d && toDateKey(d)===currentDayFilter) c[col.label]++;
      });
    });
    FLOW_COLUMNS.forEach(x=>{ const el=document.getElementById(x.blockId); if(el) el.textContent=c[x.label]; });
  }

  // --- CARGA DE DATOS ---
  async function loadInitialData() {
    const listEl = document.getElementById('ordersList');
    if (listEl) listEl.innerHTML = '<p class="loading-message">Cargando...</p>';
    try {
      const res = await jsonp(`${A}?route=init.lite&pageSize=500`);
      if (res && res.status === 'ok') {
        currentRows = res.data.table.rows || [];
        document.getElementById('panel-title').textContent = 'Todas las requisiciones';
        populateFlowFilterOptionsFromRows(currentRows);
        applyFlowFilters();
      }
    } catch(e) { console.warn(e); }
  }

  async function loadCalendarMonth(y, m) {
    currentCalYear=y; currentCalMonth=m;
    const res = await jsonp(`${A}?route=calendar.monthsummary&year=${y}&month=${m}`);
    if(res && res.status==='ok') {
      currentCalData = res.data || {};
      renderCalendar();
    }
  }

  function renderCalendar() {
    const el = document.getElementById('calendar');
    const ti = document.getElementById('calendarTitle');
    if(!el || !ti) return;
    const y=currentCalYear, m=currentCalMonth;
    ti.textContent = `${y}-${m}`;
    el.innerHTML = '';
    ['L','M','X','J','V','S','D'].forEach(d => {
      const h = document.createElement('div'); h.className='calendar-day-header'; h.textContent=d; el.appendChild(h);
    });
    const first = new Date(y, m-1, 1).getDay();
    const dow = (first+6)%7;
    for(let i=0;i<dow;i++) { const x=document.createElement('div'); x.className='calendar-day other'; el.appendChild(x); }
    const days = new Date(y,m,0).getDate();
    const today = toDateKey(new Date());

    for(let d=1; d<=days; d++) {
      const key = toDateKey(new Date(y,m-1,d));
      const info = currentCalData[key] || {total:0, reciboF8:0};
      const cell = document.createElement('div'); cell.className='calendar-day';
      if(key===today) cell.classList.add('today');
      if(key===currentDayFilter) cell.classList.add('selected');
      
      const num = document.createElement('div'); num.className='calendar-day-number'; num.textContent=d;
      cell.appendChild(num);

      if(info.total>0) {
        const b = document.createElement('div'); b.className='calendar-day-badge'; b.textContent=info.total; cell.appendChild(b);
      }
      if(info.reciboF8>0) {
        const sm = document.createElement('div'); sm.className='calendar-mini-counter'; sm.textContent=info.reciboF8; cell.appendChild(sm);
      }
      cell.addEventListener('click', async () => {
        currentDayFilter = key;
        document.getElementById('panel-title').textContent = `Requisiciones del ${key}`;
        const res = await jsonp(`${A}?route=calendar.daydetails&date=${key}`);
        if(res && res.status==='ok') {
          currentRows = res.data.rows || [];
          populateFlowFilterOptionsFromRows(currentRows);
          applyFlowFilters();
          renderCalendar();
        }
      });
      el.appendChild(cell);
    }
  }

  function attachFlowTableEditor() {
    const list = document.getElementById('ordersList');
    if(!list) return;
    list.addEventListener('click', ev => {
      if(!editMode) return;
      const td = ev.target.closest('td');
      if(!td || td.querySelector('input,select')) return;
      const span = td.querySelector('.editable-date, .editable-text');
      if(!span) return;
      
      const tr = td.closest('tr');
      const f8Id = tr.getAttribute('data-f8-id');
      const field = span.getAttribute('data-field');
      const row = currentRows.find(r => r['F8 SALMI'] === f8Id);
      const val = row[field] || '';

      const isDate = DATE_FIELDS.includes(field);
      let input;
      if(isDate) {
        input = document.createElement('input'); input.type='date'; input.value=formatDateInput(val);
      } else {
        input = document.createElement('select');
        COMMENT_OPTIONS.forEach(o => {
          const opt = document.createElement('option'); opt.value=o; opt.textContent=o; if(o===val) opt.selected=true;
          input.appendChild(opt);
        });
      }
      input.style.width='100%';
      
      const save = async () => {
        const newVal = input.value;
        if(newVal !== (isDate ? formatDateInput(val) : val)) {
          // Lógica save simplificada
          if(!idToken) { alert('Sesión no iniciada'); td.innerHTML=''; td.appendChild(span); return; }
          const url = `${B}?route=orders.update&idToken=${idToken}&id=${f8Id}&field=${field}&value=${newVal}`;
          td.textContent = '...';
          try {
             await jsonp(url);
             row[field] = newVal;
             applyFlowFilters(); // Refrescar todo
          } catch(e) { td.innerHTML=''; td.appendChild(span); alert('Error'); }
        } else {
          td.innerHTML=''; td.appendChild(span);
        }
      };
      input.addEventListener('blur', save);
      input.addEventListener('keydown', e=>{ if(e.key==='Enter') {e.preventDefault(); input.blur();} });
      td.innerHTML=''; td.appendChild(input); input.focus();
    });
  }

  // --- INIT ---
  async function initFlowDashboard() {
    document.getElementById('btnRefresh').addEventListener('click', loadInitialData);
    document.getElementById('flowFilterGrupo').addEventListener('change', applyFlowFilters);
    document.getElementById('flowFilterUnidad').addEventListener('change', applyFlowFilters);
    document.getElementById('flowFilterComent').addEventListener('change', applyFlowFilters);
    
    document.getElementById('btnEditMode').addEventListener('click', function() {
      editMode=!editMode; this.textContent=`Modo edición: ${editMode?'ON':'OFF'}`;
      this.classList.toggle('edit-on', editMode);
      applyFlowFilters();
    });

    const btnLogin = document.getElementById('btnLogin');
    btnLogin.addEventListener('click', () => {
        if(window.google) google.accounts.id.initialize({ client_id: CLIENT_ID, callback: r => { idToken=r.credential; btnLogin.textContent='✓ Sesión'; } });
        google.accounts.id.prompt();
    });
    
    // Botones Mes
    document.getElementById('btnPrevMonth').addEventListener('click', ()=> { let m=currentCalMonth-1,y=currentCalYear; if(m<1){m=12;y--;} loadCalendarMonth(y,m); });
    document.getElementById('btnNextMonth').addEventListener('click', ()=> { let m=currentCalMonth+1,y=currentCalYear; if(m>12){m=1;y++;} loadCalendarMonth(y,m); });

    // Carga inicial
    await loadInitialData();
    const now = new Date();
    loadCalendarMonth(now.getFullYear(), now.getMonth()+1);
  }

  document.addEventListener('DOMContentLoaded', initFlowDashboard);
}

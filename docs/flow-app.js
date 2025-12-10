// flow-app.js v1.0 - Dashboard de Flujo de Procesos

console.log('flow-app.js v1.0 - Dashboard de Flujo de Procesos');

// ============= CONFIGURATION =============
const A = window.APP.A_URL;
const B = window.APP.B_URL;
const CLIENT_ID = window.APP.CLIENT_ID;

// Stage configuration with day offsets from RECIBO F8
const STAGES = {
  'RECIBO': { name: 'RECIBO F8', field: 'RECIBO F8', offset: 0 },
  'ASIGNACION': { name: 'ASIGNACIÓN', field: 'ASIGNACIÓN', offset: 1 },
  'SALIDA': { name: 'SALIDA', field: 'SALIDA', offset: 2 },
  'DESPACHO': { name: 'DESPACHO', field: 'DESPACHO', offset: 3 },
  'FACTURACION': { name: 'FACTURACIÓN', field: 'FACTURACIÓN', offset: 4 },
  'EMPACADO': { name: 'EMPACADO', field: 'EMPACADO', offset: 7 },
  'ENTREGA': { name: 'PROY. ENTREGA', field: 'PROY. ENTREGA', offset: 8 }
};

// ============= STATE =============
let idToken = null;
let editMode = false;
let allOrders = [];
let currentFilter = null; // { type: 'stage', value: 'RECIBO' } or { type: 'date', value: '2025-12-10' }
let currentMonth = new Date();
let gapChart = null;
let stageChart = null;

// ============= UTILITY FUNCTIONS =============

// JSONP helper
function jsonp(url) {
  return new Promise((resolve, reject) => {
    const cb = 'cb_' + Math.random().toString(36).slice(2);
    const s = document.createElement('script');
    window[cb] = (payload) => {
      try {
        resolve(payload);
      } finally {
        try { delete window[cb]; } catch(e) {}
        s.remove();
      }
    };
    s.onerror = () => {
      try { delete window[cb]; } catch(e) {}
      s.remove();
      reject(new Error('network'));
    };
    s.src = url + (url.includes('?') ? '&' : '?') + 'callback=' + cb + '&_=' + Date.now();
    document.body.appendChild(s);
  });
}

// Date parsing and formatting
const monES = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

function parseIsoDate(v) {
  if (!v) return null;
  const m = /^(\d{4}[-]\d{2}[-]\d{2})/.exec(v);
  if (!m) return null;
  return new Date(m[1] + 'T00:00:00Z');
}

function formatDateDDMonYY(date) {
  if (!date) return '—';
  const d = date.getUTCDate();
  const m = date.getUTCMonth();
  const y = date.getUTCFullYear();
  return `${String(d).padStart(2, '0')}-${monES[m]}-${String(y).slice(-2)}`;
}

function formatDateISO(date) {
  if (!date) return '';
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(date, days) {
  if (!date) return null;
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function daysDiff(date1, date2) {
  if (!date1 || !date2) return null;
  return Math.round((date2 - date1) / (1000 * 60 * 60 * 24));
}

// ============= DATA PROCESSING =============

function calculateTheoreticalDates(order) {
  const recibo = parseIsoDate(order['RECIBO F8']);
  if (!recibo) return {};
  
  const theoretical = {};
  Object.keys(STAGES).forEach(stageKey => {
    const stage = STAGES[stageKey];
    theoretical[stage.field] = addDays(recibo, stage.offset);
  });
  
  return theoretical;
}

function calculateDeltas(order, theoretical) {
  const deltas = {};
  
  Object.keys(STAGES).forEach(stageKey => {
    const stage = STAGES[stageKey];
    const realDate = parseIsoDate(order[stage.field]);
    const theoDate = theoretical[stage.field];
    
    if (realDate && theoDate) {
      deltas[stage.field] = daysDiff(theoDate, realDate);
    }
  });
  
  return deltas;
}

function getCurrentStage(order, theoretical) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Find which stage should be happening today based on theoretical dates
  const stageKeys = Object.keys(STAGES);
  for (let i = stageKeys.length - 1; i >= 0; i--) {
    const stage = STAGES[stageKeys[i]];
    const theoDate = theoretical[stage.field];
    if (theoDate && theoDate <= today) {
      return stageKeys[i];
    }
  }
  
  return 'RECIBO';
}

function processOrders(rawOrders) {
  return rawOrders.map(order => {
    const theoretical = calculateTheoreticalDates(order);
    const deltas = calculateDeltas(order, theoretical);
    const currentStage = getCurrentStage(order, theoretical);
    
    return {
      ...order,
      theoretical,
      deltas,
      currentStage
    };
  });
}

// ============= DATA FETCHING =============

async function fetchAllOrders() {
  try {
    const url = `${A}?route=orders.list&pageSize=1000`;
    const res = await jsonp(url);
    
    if (res && res.status === 'ok' && res.data && res.data.rows) {
      allOrders = processOrders(res.data.rows);
      return allOrders;
    }
    
    return [];
  } catch (e) {
    console.error('Error fetching orders:', e);
    return [];
  }
}

// ============= UI RENDERING =============

function updateFlowBlocks() {
  const stageCounts = {};
  Object.keys(STAGES).forEach(key => stageCounts[key] = 0);
  
  allOrders.forEach(order => {
    if (order.currentStage) {
      stageCounts[order.currentStage]++;
    }
  });
  
  Object.keys(STAGES).forEach(stageKey => {
    const countEl = document.getElementById(`count-${stageKey.toLowerCase()}`);
    if (countEl) {
      countEl.textContent = stageCounts[stageKey] || 0;
    }
  });
}

function renderOrdersList(orders) {
  const listEl = document.getElementById('ordersList');
  if (!listEl) return;
  
  if (!orders || orders.length === 0) {
    listEl.innerHTML = '<p class="loading-message">No hay pedidos para mostrar</p>';
    return;
  }
  
  const html = orders.map(order => {
    const f8 = order['F8 SALMI'] || '—';
    const unidad = order['UNIDAD'] || '—';
    const grupo = order['GRUPO'] || '—';
    const recibo = order['RECIBO F8'] ? formatDateDDMonYY(parseIsoDate(order['RECIBO F8'])) : '—';
    const currentStage = STAGES[order.currentStage];
    
    // Get current stage theoretical and real dates
    let theoDate = '—';
    let realDate = '—';
    let delta = null;
    
    if (currentStage) {
      if (order.theoretical[currentStage.field]) {
        theoDate = formatDateDDMonYY(order.theoretical[currentStage.field]);
      }
      if (order[currentStage.field]) {
        realDate = formatDateDDMonYY(parseIsoDate(order[currentStage.field]));
      }
      delta = order.deltas[currentStage.field];
    }
    
    let deltaHtml = '';
    if (delta !== null && delta !== undefined) {
      const deltaClass = delta > 0 ? 'positive' : delta < 0 ? 'negative' : 'zero';
      const deltaSign = delta > 0 ? '+' : '';
      deltaHtml = `<span class="date-delta ${deltaClass}">${deltaSign}${delta}d</span>`;
    }
    
    // Calculate total progress
    let completedStages = 0;
    Object.keys(STAGES).forEach(stageKey => {
      const stage = STAGES[stageKey];
      if (order[stage.field]) {
        completedStages++;
      }
    });
    const totalStages = Object.keys(STAGES).length;
    const progressPercent = Math.round((completedStages / totalStages) * 100);
    
    return `
      <div class="order-card" data-order-id="${f8}">
        <div class="order-card-header">
          <div class="order-id">${f8}</div>
          <div class="order-stage">${currentStage ? currentStage.name : '—'}</div>
        </div>
        <div class="order-info"><strong>Unidad:</strong> ${unidad}</div>
        <div class="order-info"><strong>Grupo:</strong> ${grupo}</div>
        <div class="order-info"><strong>Recibido:</strong> ${recibo}</div>
        <div class="order-info" style="margin-top:4px;">
          <strong>Progreso:</strong> ${completedStages}/${totalStages} etapas (${progressPercent}%)
        </div>
        <div class="order-dates">
          <div class="date-item">
            <div class="date-label">Fecha teórica (${currentStage ? currentStage.name : '—'})</div>
            <div class="date-value">${theoDate}</div>
          </div>
          <div class="date-item">
            <div class="date-label">Fecha real (${currentStage ? currentStage.name : '—'})</div>
            <div class="date-value ${editMode ? 'editable' : ''}" data-stage="${order.currentStage}">${realDate}</div>
            ${deltaHtml}
          </div>
        </div>
      </div>
    `;
  }).join('');
  
  listEl.innerHTML = html;
  
  // Add click handlers for editable dates
  if (editMode) {
    listEl.querySelectorAll('.date-value.editable').forEach(dateEl => {
      dateEl.addEventListener('click', (e) => {
        e.stopPropagation();
        handleDateEdit(dateEl);
      });
    });
  }
}

async function handleDateEdit(dateEl) {
  if (!idToken) {
    alert('Debes iniciar sesión primero');
    return;
  }
  
  const orderCard = dateEl.closest('.order-card');
  if (!orderCard) return;
  
  const orderId = orderCard.dataset.orderId;
  const order = allOrders.find(o => o['F8 SALMI'] === orderId);
  if (!order) return;
  
  const currentStage = STAGES[order.currentStage];
  if (!currentStage) return;
  
  const field = currentStage.field;
  const oldValue = dateEl.textContent.trim();
  
  // Create input
  const input = document.createElement('input');
  input.type = 'date';
  input.style.width = '100%';
  input.style.fontSize = '12px';
  
  // Parse existing date (format: DD-mon-YY)
  if (oldValue !== '—') {
    const m = /^(\d{2})-(\w{3})-(\d{2})$/.exec(oldValue);
    if (m) {
      const day = m[1];
      const month = m[2].toLowerCase();
      const year = m[3];
      const monthIdx = monES.indexOf(month);
      if (monthIdx >= 0) {
        input.value = `20${year}-${String(monthIdx + 1).padStart(2, '0')}-${day}`;
      }
    }
  }
  
  dateEl.textContent = '';
  dateEl.appendChild(input);
  input.focus();
  
  async function save() {
    const newValue = input.value.trim();
    
    if (!newValue || newValue === oldValue) {
      dateEl.textContent = oldValue;
      return;
    }
    
    dateEl.textContent = 'Guardando...';
    
    try {
      const url = `${B}?route=orders.update&idToken=${encodeURIComponent(idToken)}&id=${encodeURIComponent(orderId)}&field=${encodeURIComponent(field)}&value=${encodeURIComponent(newValue)}`;
      const res = await jsonp(url);
      
      if (res && res.status === 'ok') {
        // Update local data
        order[field] = newValue + 'T00:00:00Z';
        
        // Recalculate
        const theoretical = calculateTheoreticalDates(order);
        const deltas = calculateDeltas(order, theoretical);
        order.theoretical = theoretical;
        order.deltas = deltas;
        
        // Re-render
        await init();
        
        alert('Fecha actualizada correctamente');
      } else {
        dateEl.textContent = oldValue;
        alert('Error al actualizar: ' + (res?.error || 'desconocido'));
      }
    } catch (e) {
      dateEl.textContent = oldValue;
      alert('Error de red al actualizar');
      console.error(e);
    }
  }
  
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      save();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      dateEl.textContent = oldValue;
    }
  });
  
  input.addEventListener('blur', () => {
    setTimeout(() => {
      if (document.activeElement !== input) {
        save();
      }
    }, 100);
  });
}

function filterOrdersByStage(stageKey) {
  currentFilter = { type: 'stage', value: stageKey };
  
  // Update block styling
  document.querySelectorAll('.flow-block').forEach(block => {
    block.classList.remove('active');
  });
  document.querySelector(`.flow-block[data-stage="${stageKey}"]`)?.classList.add('active');
  
  // Filter orders
  const filtered = allOrders.filter(order => order.currentStage === stageKey);
  
  // Update title
  const stage = STAGES[stageKey];
  document.getElementById('panel-title').textContent = `${stage.name} (${filtered.length} pedidos)`;
  document.getElementById('btnClearFilter').style.display = 'inline-block';
  
  renderOrdersList(filtered);
}

function filterOrdersByDate(dateStr) {
  currentFilter = { type: 'date', value: dateStr };
  
  const targetDate = new Date(dateStr + 'T00:00:00Z');
  
  // Filter orders that have any theoretical date matching the selected date
  const filtered = allOrders.filter(order => {
    return Object.values(order.theoretical).some(theoDate => {
      if (!theoDate) return false;
      return formatDateISO(theoDate) === dateStr;
    });
  });
  
  // Group by stage
  const byStage = {};
  filtered.forEach(order => {
    const stageKey = order.currentStage;
    if (!byStage[stageKey]) byStage[stageKey] = [];
    byStage[stageKey].push(order);
  });
  
  // Update title
  document.getElementById('panel-title').textContent = `Pedidos del ${formatDateDDMonYY(targetDate)} (${filtered.length} pedidos)`;
  document.getElementById('btnClearFilter').style.display = 'inline-block';
  
  renderOrdersList(filtered);
}

function clearFilter() {
  currentFilter = null;
  
  // Clear block styling
  document.querySelectorAll('.flow-block').forEach(block => {
    block.classList.remove('active');
  });
  
  // Clear calendar selection
  document.querySelectorAll('.calendar-day').forEach(day => {
    day.classList.remove('selected');
  });
  
  document.getElementById('panel-title').textContent = 'Todos los pedidos';
  document.getElementById('btnClearFilter').style.display = 'none';
  
  renderOrdersList(allOrders);
}

// ============= CALENDAR =============

function renderCalendar() {
  const calendarEl = document.getElementById('calendar');
  if (!calendarEl) return;
  
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  
  // Update title
  document.getElementById('calendarTitle').textContent = 
    `${monES[month]} ${year}`;
  
  // Get first day of month and number of days
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startDay = firstDay.getDay(); // 0 = Sunday
  
  // Get days from previous month
  const prevMonth = new Date(year, month, 0);
  const daysInPrevMonth = prevMonth.getDate();
  
  // Build calendar grid
  let html = '';
  
  // Day headers
  ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'].forEach(day => {
    html += `<div class="calendar-day-header">${day}</div>`;
  });
  
  // Count orders per day
  const ordersByDate = {};
  allOrders.forEach(order => {
    Object.values(order.theoretical).forEach(theoDate => {
      if (theoDate) {
        const dateStr = formatDateISO(theoDate);
        ordersByDate[dateStr] = (ordersByDate[dateStr] || 0) + 1;
      }
    });
  });
  
  // Previous month days
  for (let i = startDay - 1; i >= 0; i--) {
    const day = daysInPrevMonth - i;
    html += `<div class="calendar-day other-month">${day}</div>`;
  }
  
  // Current month days
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const dateStr = formatDateISO(new Date(Date.UTC(year, month, day)));
    const count = ordersByDate[dateStr] || 0;
    
    const classes = ['calendar-day'];
    if (date.toDateString() === today.toDateString()) {
      classes.push('today');
    } else if (date < today) {
      classes.push('past');
    }
    if (currentFilter?.type === 'date' && currentFilter.value === dateStr) {
      classes.push('selected');
    }
    
    const badge = count > 0 ? `<div class="calendar-day-badge">${count}</div>` : '';
    html += `<div class="${classes.join(' ')}" data-date="${dateStr}">
      <div class="calendar-day-number">${day}</div>
      ${badge}
    </div>`;
  }
  
  // Next month days
  const totalCells = Math.ceil((startDay + daysInMonth) / 7) * 7;
  const nextMonthDays = totalCells - (startDay + daysInMonth);
  for (let day = 1; day <= nextMonthDays; day++) {
    html += `<div class="calendar-day other-month">${day}</div>`;
  }
  
  calendarEl.innerHTML = html;
  
  // Add click handlers
  calendarEl.querySelectorAll('.calendar-day:not(.other-month)').forEach(dayEl => {
    dayEl.addEventListener('click', () => {
      const dateStr = dayEl.dataset.date;
      if (dateStr) {
        filterOrdersByDate(dateStr);
      }
    });
  });
}

function changeMonth(offset) {
  currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + offset, 1);
  renderCalendar();
}

// ============= CHARTS =============

function renderGapChart() {
  const ctx = document.getElementById('gapChart')?.getContext('2d');
  if (!ctx) return;
  
  // Aggregate deltas over time
  const deltasByDate = {};
  
  allOrders.forEach(order => {
    const recibo = order['RECIBO F8'];
    if (!recibo) return;
    
    const reciboDate = parseIsoDate(recibo);
    if (!reciboDate) return;
    
    const dateStr = formatDateISO(reciboDate);
    
    if (!deltasByDate[dateStr]) {
      deltasByDate[dateStr] = { sum: 0, count: 0 };
    }
    
    // Sum all stage deltas for this order
    let orderDelta = 0;
    let deltaCount = 0;
    Object.values(order.deltas).forEach(delta => {
      if (delta !== null && delta !== undefined) {
        orderDelta += delta;
        deltaCount++;
      }
    });
    
    if (deltaCount > 0) {
      deltasByDate[dateStr].sum += orderDelta;
      deltasByDate[dateStr].count++;
    }
  });
  
  // Sort by date and calculate averages
  const dates = Object.keys(deltasByDate).sort();
  const avgDeltas = dates.map(date => {
    const data = deltasByDate[date];
    return data.count > 0 ? data.sum / data.count : 0;
  });
  
  // Calculate cumulative
  const cumulative = [];
  let sum = 0;
  avgDeltas.forEach(avg => {
    sum += avg;
    cumulative.push(sum);
  });
  
  if (gapChart) gapChart.destroy();
  
  gapChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: dates.map(d => formatDateDDMonYY(parseIsoDate(d))),
      datasets: [
        {
          label: 'Delta promedio',
          data: avgDeltas,
          borderColor: '#ef4444',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          tension: 0.3
        },
        {
          label: 'Delta acumulado',
          data: cumulative,
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          tension: 0.3
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom' }
      },
      scales: {
        y: {
          title: { display: true, text: 'Días' }
        }
      }
    }
  });
}

function renderStageDeltas() {
  const ctx = document.getElementById('stageDeltas')?.getContext('2d');
  if (!ctx) return;
  
  // Calculate average delta per stage
  const stageDeltas = {};
  const stageCounts = {};
  
  Object.keys(STAGES).forEach(stageKey => {
    stageDeltas[stageKey] = 0;
    stageCounts[stageKey] = 0;
  });
  
  allOrders.forEach(order => {
    Object.keys(STAGES).forEach(stageKey => {
      const stage = STAGES[stageKey];
      const delta = order.deltas[stage.field];
      if (delta !== null && delta !== undefined) {
        stageDeltas[stageKey] += delta;
        stageCounts[stageKey]++;
      }
    });
  });
  
  const labels = [];
  const data = [];
  
  Object.keys(STAGES).forEach(stageKey => {
    const stage = STAGES[stageKey];
    labels.push(stage.name);
    const avg = stageCounts[stageKey] > 0 ? stageDeltas[stageKey] / stageCounts[stageKey] : 0;
    data.push(avg);
  });
  
  if (stageChart) stageChart.destroy();
  
  stageChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Delta promedio (días)',
        data,
        backgroundColor: data.map(d => d > 0 ? '#ef4444' : d < 0 ? '#10b981' : '#6b7280')
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: {
          title: { display: true, text: 'Días' }
        }
      }
    }
  });
}

function updateTimeKPIs() {
  // Calculate theoretical average time
  let theoSum = 0;
  let theoCount = 0;
  
  allOrders.forEach(order => {
    const recibo = parseIsoDate(order['RECIBO F8']);
    const lastStage = order.theoretical['PROY. ENTREGA'];
    if (recibo && lastStage) {
      theoSum += daysDiff(recibo, lastStage);
      theoCount++;
    }
  });
  
  const avgTheo = theoCount > 0 ? theoSum / theoCount : 0;
  
  // Calculate real average time
  let realSum = 0;
  let realCount = 0;
  
  allOrders.forEach(order => {
    const recibo = parseIsoDate(order['RECIBO F8']);
    const entregaReal = parseIsoDate(order['ENTREGA REAL']);
    if (recibo && entregaReal) {
      realSum += daysDiff(recibo, entregaReal);
      realCount++;
    }
  });
  
  const avgReal = realCount > 0 ? realSum / realCount : 0;
  
  // Calculate total delta
  let deltaSum = 0;
  let deltaCount = 0;
  
  allOrders.forEach(order => {
    Object.values(order.deltas).forEach(delta => {
      if (delta !== null && delta !== undefined) {
        deltaSum += delta;
        deltaCount++;
      }
    });
  });
  
  const avgDelta = deltaCount > 0 ? deltaSum / deltaCount : 0;
  
  // Update UI
  document.getElementById('kpi-teorico').textContent = avgTheo.toFixed(1) + 'd';
  document.getElementById('kpi-real').textContent = avgReal > 0 ? avgReal.toFixed(1) + 'd' : '—';
  document.getElementById('kpi-delta').textContent = avgDelta.toFixed(1) + 'd';
  document.getElementById('kpi-acumulado').textContent = deltaSum.toFixed(1) + 'd';
}

// ============= EVENT HANDLERS =============

function setupEventHandlers() {
  // Flow blocks
  document.querySelectorAll('.flow-block').forEach(block => {
    block.addEventListener('click', () => {
      const stage = block.dataset.stage;
      filterOrdersByStage(stage);
    });
  });
  
  // Clear filter button
  document.getElementById('btnClearFilter')?.addEventListener('click', clearFilter);
  
  // Calendar navigation
  document.getElementById('btnPrevMonth')?.addEventListener('click', () => changeMonth(-1));
  document.getElementById('btnNextMonth')?.addEventListener('click', () => changeMonth(1));
  
  // Refresh button
  document.getElementById('btnRefresh')?.addEventListener('click', init);
  
  // Login
  document.getElementById('btnLogin')?.addEventListener('click', () => {
    if (window.google?.accounts?.id) {
      google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: (r) => {
          idToken = r.credential;
          document.getElementById('btnEditMode').disabled = false;
          document.getElementById('btnLogin').textContent = 'Sesión iniciada';
          alert('Sesión iniciada. Activa "Modo edición" para editar fechas.');
        }
      });
      google.accounts.id.prompt();
    } else {
      alert('Falta librería de Google Identity');
    }
  });
  
  // Edit mode
  document.getElementById('btnEditMode')?.addEventListener('click', () => {
    editMode = !editMode;
    const btn = document.getElementById('btnEditMode');
    btn.textContent = `Modo edición: ${editMode ? 'ON' : 'OFF'}`;
    btn.classList.toggle('edit-on', editMode);
    
    // Re-render current view
    if (currentFilter?.type === 'stage') {
      filterOrdersByStage(currentFilter.value);
    } else if (currentFilter?.type === 'date') {
      filterOrdersByDate(currentFilter.value);
    } else {
      renderOrdersList(allOrders);
    }
  });
}

// ============= INITIALIZATION =============

async function init() {
  console.log('Initializing Flow Dashboard...');
  
  // Show loading
  document.getElementById('ordersList').innerHTML = '<p class="loading-message">Cargando pedidos...</p>';
  
  // Fetch data
  await fetchAllOrders();
  
  // Render UI
  updateFlowBlocks();
  renderOrdersList(allOrders);
  renderCalendar();
  renderGapChart();
  renderStageDeltas();
  updateTimeKPIs();
  
  // Setup event handlers
  setupEventHandlers();
  
  console.log(`Loaded ${allOrders.length} orders`);
}

// Start the app
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

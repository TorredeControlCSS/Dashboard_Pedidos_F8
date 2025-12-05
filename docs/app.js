// app.js v2025-12-01j — FILTROS CORREGIDOS (Limpiar funciona) y OPTIMIZADOS (Debounce)

if (window.__APP_LOADED__) {
  console.log('app.js ya cargado, omitiendo.');
} else {
window.__APP_LOADED__ = true;
console.log('app.js v2025-12-01j');

const A = window.APP.A_URL;
const B = window.APP.B_URL;
const CLIENT_ID = window.APP.CLIENT_ID;
const ID_HEADER = 'F8 SALMI';
const N = s => String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\./g,'').replace(/\s+/g,' ').trim().toUpperCase();
const N_ID = N(ID_HEADER);
const DATE_FIELDS=['ASIGNACIÓN','SALIDA','DESPACHO','FACTURACIÓN','EMPACADO','PROY. ENTREGA','ENTREGA REAL'];
const INT_FIELDS=['CANT. ASIG.','CANT. SOL.','RENGLONES ASIG.','RENGLONES SOL.'];
const TXT_FIELDS=['COMENT.'];
const COMMENT_OPTIONS=['','DISCREPANCIA DE INVENTARIO','FALTA DE PERSONAL','VIATICOS PARA VIAJES','FALTA MONTACARGA','CONGESTIONAMIENTO EN SALIDAS','FACTURACION RETRASADA','FALLAS EN SISTEMA','DEMORA EN DOCUMENTACION','ERROR DE CAPTACION','ENTREGADO'];
const S_DATE=new Set(DATE_FIELDS.map(N)),S_INT=new Set(INT_FIELDS.map(N)),S_TXT=new Set(TXT_FIELDS.map(N));
let idToken=null,editMode=false,currentHeaders=[],currentRows=[],currentIdCol=null,currentPage=1;
const DEFAULT_PAGE_SIZE=20;

function jsonp(url){return new Promise((resolve,reject)=>{const cb='cb_'+Math.random().toString(36).slice(2);const s=document.createElement('script');window[cb]=(payload)=>{try{resolve(payload);}finally{try{delete window[cb];}catch(e){}s.remove();}};s.onerror=()=>{try{delete window[cb];}catch(e){}s.remove();reject(new Error('network'));};s.src=url+(url.includes('?')?'&':'?')+'callback='+cb+'&_='+Date.now();document.body.appendChild(s);});}
const monES=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const isIsoZ=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(v)&&v.endsWith('Z');
const toDDMonYY=v=>{const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(v);if(!m)return v;return`${m[3]}-${monES[parseInt(m[2],10)-1]}-${m[1].slice(-2)}`;};
const parseIsoDate=v=>{if(!v)return null;const m=/^(\d{4}[-]\d{2}[-]\d{2})/.exec(v);if(!m)return null;return new Date(m[1]+'T00:00:00Z');};
function getFilters(){return{cat:document.getElementById('fCat')?.value||'',unidad:document.getElementById('fUnidad')?.value||'',tipo:document.getElementById('fTipo')?.value||'',grupo:document.getElementById('fGrupo')?.value||'',estado:document.getElementById('fEstado')?.value||'',coment:document.getElementById('fComent')?.value||'',text:document.getElementById('fBuscar')?.value||'',desde:document.getElementById('fDesde')?.value||'',hasta:document.getElementById('fHasta')?.value||''};}
function widthMap(){return{'F8 SALMI':120,'UNIDAD':232,'TIPO':110,'GRUPO':110,'CATEG.':180,'F8 SISCONI':120,'SUSTANCIAS':100,'CANT. ASIG.':50,'CANT. SOL.':50,'RENGLONES ASIG.':90,'RENGLONES SOL.':90,'FECHA F8':80,'RECIBO F8':80,'ASIGNACIÓN':80,'SALIDA':80,'DESPACHO':80,'FACTURACIÓN':90,'EMPACADO':80,'PROY. ENTREGA':80,'ENTREGA REAL':80,'INCOTERM':80,'ESTADO':80,'COMENT.':180,'TIEMPO':80,'COMPLET':80,'FILL CANT.':80,'FILL RENGL.':80};}
function perRowMetrics(row){const c=!!row['ENTREGA REAL'],rec=parseIsoDate(row['RECIBO F8']),end=row['ENTREGA REAL']?parseIsoDate(row['ENTREGA REAL']):new Date(),days=(rec&&end)?Math.max(0,Math.round((end-rec)/864e5)):''
const toNum=v=>(typeof v==='number')?v:parseFloat(String(v||'').replace(',','.'))||0,a=toNum(row['CANT. ASIG.']),s=toNum(row['CANT. SOL.']),ra=toNum(row['RENGLONES ASIG.']),rs=toNum(row['RENGLONES SOL.']),fc=s>0?Math.round((a/s)*100):0,fr=rs>0?Math.round((ra/rs)*100):0;return{TIEMPO:days?`${days}d`:'',COMPLET:c?'SI':'NO','FILL CANT.':`${fc}%`,'FILL RENGL.':`${fr}%`};}

// --- Lógica de Filtros en Cascada (CORREGIDA Y OPTIMIZADA) ---
const filterIdToDataKey = { fCat: 'categorias', fUnidad: 'unidades', fTipo: 'tipos', fGrupo: 'grupos', fEstado: 'estados' };
let isUpdatingFilters = false;
let debounceTimer;

function updateFilterOptions(newOptionsData) {
    Object.entries(filterIdToDataKey).forEach(([elId, dataKey]) => {
        const selectEl = document.getElementById(elId);
        if (!selectEl) return;
        const currentValue = selectEl.value;
        const firstOptionHTML = `<option value="">${selectEl.options[0]?.textContent || 'Todos'}</option>`;
        const newOptions = newOptionsData[dataKey] || [];
        selectEl.innerHTML = firstOptionHTML + newOptions.map(opt => `<option value="${opt}"${opt === currentValue ? ' selected' : ''}>${opt}</option>`).join('');
        selectEl.value = newOptions.includes(currentValue) ? currentValue : "";
    });
}

function handleFilterChange() {
    clearTimeout(debounceTimer); // Cancela el timer anterior
    debounceTimer = setTimeout(async () => { // Inicia un nuevo timer
        if (isUpdatingFilters) return;
        isUpdatingFilters = true;
        try {
            const filters = getFilters();
            const url = `${A}?route=filters.update&${new URLSearchParams(filters).toString()}`;
            const res = await jsonp(url);
            if (res && res.status === 'ok') {
                updateFilterOptions(res.data);
            }
        } catch (e) {
            console.warn("Error actualizando filtros dependientes:", e);
        } finally {
            isUpdatingFilters = false;
        }
    }, 500); // 500ms de espera
}

// --- Funciones de Renderizado ---
function populateFiltersFromData(meta){Object.entries(filterIdToDataKey).forEach(([elId,dataKey])=>{const el=document.getElementById(elId);if(el){const f=el.options[0]?.outerHTML||'';el.innerHTML=f+(meta[dataKey]||[]).map(v=>`<option value="${v}">${v}</option>`).join('');}});}
function renderKpisAndChartsFromData(stats){const set=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=(v==null?'—':(+v).toLocaleString());};set('kpi-total',stats.kpis.total);set('kpi-asignado',stats.kpis.asignado);set('kpi-solicitado',stats.kpis.solicitado);set('kpi-reng-asig',stats.kpis.rengAsig);set('kpi-reng-sol',stats.kpis.rengSol);set('kpi-urg',stats.kpis.urg);set('kpi-men',stats.kpis.mens);if(window.renderChartsFromStats)try{window.renderChartsFromStats(stats);}catch(e){console.warn('renderChartsFromStats failed',e);}}
function renderQueueTableFromData(data){const grupos=data.grupos||[];const thead=document.querySelector('#tabla-queues thead'),tbody=document.querySelector('#tabla-queues tbody');if(!thead||!tbody)return;thead.innerHTML=`<tr><th>GRUPO</th><th>λ (llegadas/día)</th><th>μ (salidas/día)</th><th>ρ (utilización)</th><th>W_real (días)</th><th>W_model (días)</th><th>Wq (días en cola)</th><th>L (en sistema)</th><th>Lq (en cola)</th><th># llegadas</th><th># completados</th></tr>`;const shortGroup=(name)=>{if(!name)return'';let s=String(name);s=s.replace('LABORATORIO','LAB').replace('ODONTOLOGÍA','ODO').replace('ODONTOLOGIA','ODO').replace('RADIOLOGIA','RAD').replace('RADIOLOGÍA','RAD');return s;};const fmt=(v,d=2)=>(v==null||isNaN(v))?'—':(+v).toFixed(d);tbody.innerHTML=grupos.map(g=>{const sat=(g.mu===0||(g.rho!=null&&g.rho>=1));const rho=(g.rho==null||isNaN(g.rho))?'—':(g.rho*100).toFixed(1)+'%';return`<tr${sat?' style="background-color: #fee2e2;"':''}><td>${shortGroup(g.grupo)}</td><td style="text-align: right;">${fmt(g.lambda,3)}</td><td style="text-align: right;">${fmt(g.mu,3)}</td><td style="text-align: right;">${rho}</td><td style="text-align: right;">${fmt(g.W_real,2)}</td><td style="text-align: right;">${sat?'—':fmt(g.W_model,2)}</td><td style="text-align: right;">${sat?'—':fmt(g.Wq,2)}</td><td style="text-align: right;">${sat?'—':fmt(g.L,2)}</td><td style="text-align: right;">${sat?'—':fmt(g.Lq,2)}</td><td style="text-align: right;">${g.llegadas}</td><td style="text-align: right;">${g.completados}</td></tr>`;}).join('');}
function setTimeKpisFromRows(rows){let sumR=0,nR=0,sumP=0,nP=0;(rows||[]).forEach(r=>{const rec=parseIsoDate(r['RECIBO F8']);if(!rec)return;if(r['ENTREGA REAL']){const end=parseIsoDate(r['ENTREGA REAL']);if(end&&end>=rec){sumR+=(end-rec)/864e5;nR++;}}if(r['PROY. ENTREGA']){const pro=parseIsoDate(r['PROY. ENTREGA']);if(pro&&pro>=rec){sumP+=(pro-rec)/864e5;nP++;}}});const avgR=nR?(sumR/nR):null,avgP=nP?(sumP/nP):null,diff=(avgR!=null&&avgP!=null)?(avgR-avgP):null;const set=(id,v)=>{const el=document.getElementById(id);if(!el)return;el.textContent=(v==null||isNaN(v))?'—':v.toFixed(1);};set('kpi-t-real',avgR);set('kpi-t-prom',avgP);set('kpi-t-diff',diff);}
async function renderTable(data,page=1){currentPage=page;const pgnEl=document.getElementById('paginacion');if(!data){if(pgnEl)pgnEl.innerHTML=`<span>Cargando pág ${page}...</span>`;const params=new URLSearchParams(getFilters());const url=`${A}?route=orders.list&page=${page}&pageSize=${DEFAULT_PAGE_SIZE}&${params.toString()}`;const res=await jsonp(url);data=res.data;}const rawRows=data.rows||[];const W=widthMap();currentHeaders=Array.from(new Set([ ...(data.header||[]),'TIEMPO','COMPLET','FILL CANT.','FILL RENGL.']));currentRows=rawRows.map(r=>{const o={...r};Object.keys(o).forEach(k=>{if(isIsoZ(o[k]))o[k]=toDDMonYY(o[k])});Object.assign(o,perRowMetrics(r));return o;});currentIdCol=data.header.find(h=>N(h)===N_ID)||null;const thead=document.querySelector('#tabla thead'),tbody=document.querySelector('#tabla tbody');if(thead){thead.innerHTML=`<tr>${currentHeaders.map((h,i)=>`<th data-col="${h}" class="${i<4?`col-fix-${i+1}`:''}" style="min-width:${W[h]||100}px">${h}</th>`).join('')}</tr>`;}if(tbody){tbody.innerHTML=currentRows.map((r,ri)=>`<tr>${currentHeaders.map((k,i)=>{const kN=N(k),ed=editMode&&(S_DATE.has(kN)||S_INT.has(kN)||S_TXT.has(kN)),cs=[i<4?`col-fix-${i+1}`:''];if(ed)cs.push('editable');if(k==='COMPLET')cs.push(String(r[k]||'').toUpperCase()==='SI'?'state-ok':'state-bad');if(k==='FILL CANT.'||k==='FILL RENGL.'){const v=parseFloat(String(r[k]||'').replace('%',''));if(!isNaN(v)){if(v>=95)cs.push('fill-high');else if(v>=80)cs.push('fill-medium');else cs.push('fill-low');}}return`<td class="${cs.join(' ')}" data-ri="${ri}" data-col="${k}">${r[k]??''}</td>`}).join('')}</tr>`).join('');}const totalPages=Math.ceil((data.total||0)/DEFAULT_PAGE_SIZE);const prev=Math.max(1,page-1),next=Math.min(totalPages,page+1);if(pgnEl)pgnEl.innerHTML=`<button onclick="renderTable(null,${prev})"${page===1?' disabled':''}>« Ant</button><span>Pág ${page}/${totalPages}</span><button onclick="renderTable(null,${next})"${page===totalPages?' disabled':''}>Sig »</button>`;setTimeKpisFromRows(rawRows);if(window.updateTopScrollWidth)setTimeout(window.updateTopScrollWidth,80);}
async function renderDataUpdates(data){renderKpisAndChartsFromData(data.stats);renderQueueTableFromData(data.queueMetrics);await renderTable(data.table,1);}
async function fetchAndRenderAll(filters){const loadingEl=document.getElementById('paginacion');if(loadingEl)loadingEl.innerHTML=`<span>Cargando datos...</span>`;try{const params=new URLSearchParams(filters);const url=`${A}?route=dashboard.init&pageSize=${DEFAULT_PAGE_SIZE}&${params.toString()}`;const res=await jsonp(url);if(!res||res.status!=='ok')throw new Error(res.error||'Error en la carga');await renderDataUpdates(res.data);}catch(e){console.warn('fetchAndRenderAll error',e);if(loadingEl)loadingEl.innerHTML=`<span style="color:red;">Error: ${e.message}</span>`;}}
async function init(){updateStickyTop();const loadingEl=document.getElementById('paginacion');if(loadingEl)loadingEl.innerHTML=`<span>Cargando datos iniciales...</span>`;try{const res=await jsonp(`${A}?route=dashboard.init&pageSize=${DEFAULT_PAGE_SIZE}`);if(!res||res.status!=='ok')throw new Error(res.error||'Error en la carga inicial');const data=res.data;populateFiltersFromData(data.meta);await renderDataUpdates(data);Object.keys(filterIdToDataKey).forEach(elId=>document.getElementById(elId)?.addEventListener('change',handleFilterChange));}catch(e){console.warn('init error',e);if(loadingEl)loadingEl.innerHTML=`<span style="color:red;">Error: ${e.message}</span>`;}setTimeout(updateStickyTop,200);}
function updateStickyTop(){try{const h=document.querySelector('.app-header')?.offsetHeight||64,k=document.getElementById('kpis')?.offsetHeight||0,f=document.getElementById('filters')?.offsetHeight||0;document.documentElement.style.setProperty('--stickyTop',h+k+f+12+'px');}catch(e){}}
window.addEventListener('resize',()=>{setTimeout(updateStickyTop,120);});
(function syncHScroll(){const t=document.getElementById('top-scroll'),w=document.querySelector('.table-wrap'),b=w?.querySelector('table');if(!t||!w||!b)return;window.updateTopScrollWidth=()=>{const s=Math.max(b.scrollWidth,w.clientWidth);t.innerHTML=`<div style="width:${s}px;height:1px"></div>`;};window.updateTopScrollWidth();let l=!1;t.addEventListener('scroll',()=>{if(l)return;l=!0;w.scrollLeft=t.scrollLeft;l=!1;});w.addEventListener('scroll',()=>{if(l)return;l=!0;t.scrollLeft=w.scrollLeft;l=!1;});window.addEventListener('resize',()=>{setTimeout(window.updateTopScrollWidth,100);});})();
document.querySelector('#tabla')?.addEventListener('click',(ev)=>{if(ev.target.closest('.cell-editor'))return;const td=ev.target.closest('td.editable');if(!td||!editMode)return;const ri=+td.dataset.ri,col=td.dataset.col,row=currentRows[ri],id=currentIdCol?row[currentIdCol]:null;if(!id){alert(`No se encontró ID (${ID_HEADER})`);return;}const kN=N(col),isDate=S_DATE.has(kN),isInt=S_INT.has(kN);if(td.querySelector('input,select'))return;const old=td.textContent||'';td.innerHTML='';let inp;if(col==='COMENT.'){inp=document.createElement('select');inp.style.width='100%';COMMENT_OPTIONS.forEach(o=>{const opt=document.createElement('option');opt.value=o;opt.textContent=o||'—';if(old.trim()===o)opt.selected=true;inp.appendChild(opt);});}else{inp=document.createElement('input');inp.style.width='100%';inp.style.boxSizing='border-box';if(isDate){inp.type='date';const m=/^(\d{2})-(\w{3})-(\d{2})$/.exec(old.trim());if(m){const i=monES.indexOf(m[2].toLowerCase());if(i>=0)inp.value=`20${m[3]}-${String(i+1).padStart(2,'0')}-${m[1]}`;}}else if(isInt){inp.type='number';inp.step='1';inp.min='0';const n=parseInt(old,10);if(!isNaN(n))inp.value=String(n);}else{inp.type='text';inp.value=old;}}const w=document.createElement('div');w.className='cell-editor';w.appendChild(inp);td.appendChild(w);inp.focus();inp.select?.();async function save(){if(!idToken){alert('Accede primero');td.textContent=old;return;}let v=(inp.value||'').trim();if(v===old.trim()){td.textContent=old;return;}td.textContent='Guardando…';try{const res=await jsonp(`${B}?route=orders.update&idToken=${encodeURIComponent(idToken)}&id=${encodeURIComponent(id)}&field=${encodeURIComponent(col)}&value=${encodeURIComponent(v)}`);if(res&&res.status==='ok'){if(isDate&&v){const[y,m,d]=v.split('-');td.textContent=`${d}-${monES[+m-1]}-${y.slice(2)}`;}else{td.textContent=v;}await fetchAndRenderAll(getFilters());}else{td.textContent=old;alert('Error: '+(res?.error||'unknown'));}}catch(e){td.textContent=old;alert('Error de red');}}inp.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();save();}else if(e.key==='Escape'){e.preventDefault();td.textContent=old;}});inp.addEventListener('blur',()=>{setTimeout(()=>{if(document.activeElement!==inp)save();},50);});});
const btnLogin=document.getElementById('btnLogin'),btnEditMode=document.getElementById('btnEditMode'),btnApplyEl=document.getElementById('btnApply'),btnClearEl=document.getElementById('btnClear'),btnRefreshEl=document.getElementById('btnRefresh');let filtersBusy=false;
if(btnLogin)btnLogin.addEventListener('click',()=>{if(window.google?.accounts?.id){google.accounts.id.initialize({client_id:CLIENT_ID,callback:r=>{idToken=r.credential;if(btnEditMode)btnEditMode.disabled=false;btnLogin.textContent='Sesión iniciada';alert('Sesión iniciada. Activa “Modo edición”.');}});google.accounts.id.prompt();}else{alert('Falta librería de Google Identity');}});
if(btnEditMode)btnEditMode.addEventListener('click',()=>{editMode=!editMode;btnEditMode.textContent=`Modo edición: ${editMode?'ON':'OFF'}`;btnEditMode.classList.toggle('edit-on',editMode);renderTable(null,currentPage);});
async function runFilters(action){if(filtersBusy)return;filtersBusy=true;[btnApplyEl,btnClearEl,btnRefreshEl].forEach(b=>{if(b){b.disabled=true;b.classList.add('loading');}});try{await action();}finally{filtersBusy=false;[btnApplyEl,btnClearEl,btnRefreshEl].forEach(b=>{if(b){b.disabled=false;b.classList.remove('loading');}});}}

// --- Lógica de Botones (CORREGIDA Y OPTIMIZADA) ---
if(btnApplyEl)btnApplyEl.addEventListener('click',()=>{runFilters(async()=>{await fetchAndRenderAll(getFilters());});});
if(btnClearEl)btnClearEl.addEventListener('click',()=>{runFilters(async()=>{['fCat','fUnidad','fTipo','fGrupo','fEstado','fComent','fBuscar','fDesde','fHasta'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});const filters={};await fetchAndRenderAll(filters);const url=`${A}?route=filters.update&${new URLSearchParams(filters).toString()}`;const res=await jsonp(url);if(res&&res.status==='ok'){updateFilterOptions(res.data);}});});
if(btnRefreshEl)btnRefreshEl.addEventListener('click',()=>{runFilters(async()=>{await fetchAndRenderAll(getFilters());});});

init();
}

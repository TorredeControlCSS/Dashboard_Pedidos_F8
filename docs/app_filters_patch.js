// Patch: populate filters from rows returned by orders.list (cliente)
(function(){
  async function fetchSample(){
    try{
      const A = (window.APP && window.APP.A_URL) || window.A || '';
      if(!A) return null;
      const p = new URLSearchParams({ route: 'orders.list', page: 1, pageSize: 150 });
      const cb = 'cb_test_' + Math.random().toString(36).slice(2);
      return new Promise((resolve, reject) => {
        window[cb] = function(payload){ try{ resolve(payload); } finally{ delete window[cb]; s.remove(); } };
        const s = document.createElement('script');
        s.onerror = ()=>{ delete window[cb]; s.remove(); reject(new Error('network')); };
        s.src = A + '?' + p.toString() + '&callback=' + cb + '&_=' + Date.now();
        document.body.appendChild(s);
      });
    }catch(e){ console.error('fetchSample error', e); return null; }
  }

  function setOptions(id, items){
    const el = document.getElementById(id);
    if(!el) return;
    const cur = el.value || '';
    el.innerHTML = '<option value="">Todas</option>' + items.map(v=>`<option value="${v}">${v}</option>`).join('');
    if(items.indexOf(cur) >= 0) el.value = cur;
  }

  async function populateFiltersFromServer(){
    const res = await fetchSample();
    if(!res || res.status !== 'ok') return;
    const rows = res.data.rows || [];
    if(!rows.length) return;
    function uniq(arr){ return Array.from(new Set(arr.filter(Boolean))).sort(); }
    const cat = uniq(rows.map(r=>r['CATEG.'] || ''));
    const unidad = uniq(rows.map(r=>r['UNIDAD'] || ''));
    const tipo = uniq(rows.map(r=>r['TIPO'] || ''));
    const grupo = uniq(rows.map(r=>r['GRUPO'] || ''));
    const estado = uniq(rows.map(r=>r['ESTADO'] || ''));
    setOptions('fCat', cat);
    setOptions('fUnidad', unidad);
    setOptions('fTipo', tipo);
    setOptions('fGrupo', grupo);
    setOptions('fEstado', estado);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', populateFiltersFromServer);
  } else {
    populateFiltersFromServer();
  }
})();

// Patch robusto: intenta orders.meta (todo el dataset) y si falla hace fallback a orders.list (page 1)
(function(){
  async function jsonpFetch(url){
    return new Promise((resolve, reject) => {
      try{
        const cb = 'cb_' + Math.random().toString(36).slice(2);
        window[cb] = (payload) => { try{ resolve(payload); } finally { try{ delete window[cb]; }catch(e){}; s.remove(); } };
        const s = document.createElement('script');
        s.onerror = () => { try{ delete window[cb]; }catch(e){}; s.remove(); reject(new Error('network')); };
        s.src = url + (url.includes('?') ? '&' : '?') + `callback=${cb}&_=${Date.now()}`;
        document.body.appendChild(s);
      }catch(e){ reject(e); }
    });
  }

  function setOptions(id, items, includeAllLabel){
    const el = document.getElementById(id);
    if(!el) return;
    const cur = el.value || '';
    const prefix = includeAllLabel ? '<option value="">Todas</option>' : '<option value="">Todos</option>';
    el.innerHTML = prefix + (items||[]).map(v=>`<option value="${v}">${v}</option>`).join('');
    if(items && items.indexOf(cur) >= 0) el.value = cur;
  }

  function uniqueSorted(arr){
    return Array.from(new Set((arr||[]).filter(Boolean))).sort();
  }

  async function populateFromMeta(A){
    const url = A + '?route=orders.meta';
    const res = await jsonpFetch(url);
    if(!res || res.status !== 'ok') throw new Error('meta_bad_response');
    const data = res.data || {};
    setOptions('fCat', data.categorias || [], true);
    setOptions('fUnidad', data.unidades || [], true);
    setOptions('fTipo', data.tipos || [], false);
    setOptions('fGrupo', data.grupos || [], false);
    setOptions('fEstado', data.estados || [], true);
    console.info('filters populated from orders.meta');
  }

  async function populateFromList(A){
    const url = A + '?route=orders.list&page=1&pageSize=150';
    const res = await jsonpFetch(url);
    if(!res || res.status !== 'ok') throw new Error('list_bad_response');
    const rows = res.data && res.data.rows || [];
    const cat = uniqueSorted(rows.map(r=>r['CATEG.']||''));
    const unidad = uniqueSorted(rows.map(r=>r['UNIDAD']||''));
    const tipo = uniqueSorted(rows.map(r=>r['TIPO']||''));
    const grupo = uniqueSorted(rows.map(r=>r['GRUPO']||''));
    const estado = uniqueSorted(rows.map(r=>r['ESTADO']||''));
    setOptions('fCat', cat, true);
    setOptions('fUnidad', unidad, true);
    setOptions('fTipo', tipo, false);
    setOptions('fGrupo', grupo, false);
    setOptions('fEstado', estado, true);
    console.info('filters populated from orders.list fallback (page1)');
  }

  async function populateFiltersFromServer(){
    try{
      const A = (window.APP && window.APP.A_URL) || window.A || '';
      if(!A){ console.warn('APP.A_URL not set'); return; }
      try{
        await populateFromMeta(A);
      }catch(e){
        console.warn('orders.meta failed, falling back to orders.list:', e);
        try{
          await populateFromList(A);
        }catch(e2){
          console.error('Both orders.meta and orders.list failed:', e2);
        }
      }
    }catch(err){
      console.error('populateFiltersFromServer unexpected error', err);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', populateFiltersFromServer);
  } else {
    populateFiltersFromServer();
  }
})();

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
  // Leemos varias páginas de orders.list para construir los filtros
  const PAGE_SIZE = 500;   // filas por página
  const MAX_PAGES = 10;    // hasta 10 páginas -> máximo ~5000 filas

  let allRows = [];
  let page = 1;

  while (page <= MAX_PAGES) {
    const url = A + '?route=orders.list&page=' + page + '&pageSize=' + PAGE_SIZE;
    const res = await jsonpFetch(url);
    if(!res || res.status !== 'ok') break;

    const data = res.data || {};
    const rows = data.rows || [];
    if (!rows.length) break;

    allRows = allRows.concat(rows);

    const total = data.total || 0;
    const maxPagesFromTotal = Math.ceil(total / PAGE_SIZE);
    if (page >= maxPagesFromTotal) break;  // ya llegamos al final real

    page++;
  }

  const cat    = uniqueSorted(allRows.map(r=>r['CATEG.']  || ''));
  const unidad = uniqueSorted(allRows.map(r=>r['UNIDAD']  || ''));
  const tipo   = uniqueSorted(allRows.map(r=>r['TIPO']    || ''));
  const grupo  = uniqueSorted(allRows.map(r=>r['GRUPO']   || ''));
  const estado = uniqueSorted(allRows.map(r=>r['ESTADO']  || ''));

  setOptions('fCat',    cat,    true);
  setOptions('fUnidad', unidad, true);
  setOptions('fTipo',   tipo,   false);
  setOptions('fGrupo',  grupo,  false);
  setOptions('fEstado', estado, true);

  console.info('filters populated from orders.list multi-page fallback', {
    pagesUsed: page,
    totalRows: allRows.length
  });
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

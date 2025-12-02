// desactivado: los filtros se llenan ahora desde app.js
// Patch robusto: intenta orders.meta (todo el dataset) y si falla hace fallback a orders.list (multi-page)
(function(){
  // === JSONP helper local (independiente de app.js) ===
  async function jsonpFetch(url){
    return new Promise((resolve, reject) => {
      try{
        const cb = 'cb_' + Math.random().toString(36).slice(2);
        const s  = document.createElement('script');

        window[cb] = (payload) => {
          try {
            resolve(payload);
          } finally {
            try { delete window[cb]; } catch(e){}
            s.remove();
          }
        };

        s.onerror = () => {
          try { delete window[cb]; } catch(e){}
          s.remove();
          reject(new Error('network'));
        };

        s.src = url + (url.includes('?') ? '&' : '?') + `callback=${cb}&_=${Date.now()}`;
        document.body.appendChild(s);
      }catch(e){
        reject(e);
      }
    });
  }

  function setOptions(id, items, includeAllLabel){
    const el = document.getElementById(id);
    if(!el) return;
    const cur = el.value || '';
    const prefix = includeAllLabel
      ? '<option value="">Todas</option>'
      : '<option value="">Todos</option>';
    el.innerHTML = prefix + (items||[]).map(v=>`<option value="${v}">${v}</option>`).join('');
    if(items && items.indexOf(cur) >= 0) el.value = cur;
  }

  function uniqueSorted(arr){
    return Array.from(new Set((arr||[]).filter(Boolean))).sort();
  }

  // === Opción 1: usar orders.meta (si existe en el Apps Script) ===
  async function populateFromMeta(A){
    const url = A + '?route=orders.meta';
    console.info('populateFromMeta: fetching', url);
    const res = await jsonpFetch(url);
    if(!res || res.status !== 'ok') throw new Error('meta_bad_response');
    const data = res.data || {};
    setOptions('fCat',    data.categorias || [], true);
    setOptions('fUnidad', data.unidades   || [], true);
    setOptions('fTipo',   data.tipos      || [], false);
    setOptions('fGrupo',  data.grupos     || [], false);
    setOptions('fEstado', data.estados    || [], true);
    console.info('filters populated from orders.meta');
  }

  // === Opción 2: usar orders.list en varias páginas ===
  async function populateFromList(A){
    console.info('populateFromList: start with A =', A);

    const PAGE_SIZE = 500;   // filas por página
    const MAX_PAGES = 20;    // hasta 20 páginas -> máximo ~10,000 filas

    let allRows = [];
    let page = 1;

    while (page <= MAX_PAGES) {
      const url = A + '?route=orders.list&page=' + page + '&pageSize=' + PAGE_SIZE;
      let res;
      try{
        res = await jsonpFetch(url);
      }catch(err){
        console.error('populateFromList: jsonpFetch error on page', page, err);
        break; // salimos del bucle pero usamos lo que ya tengamos
      }

      console.info('populateFromList: fetched page', page, 'status =', res && res.status);

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

    console.info('populateFromList: total rows collected =', allRows.length);

    // Si por alguna razón no se pudo traer nada, NO dejamos los filtros vacíos;
    // simplemente salimos y dejamos las opciones "Todas/Todos".
    if (!allRows.length){
      console.warn('populateFromList: no rows collected, leaving default filter options');
      return;
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
      totalRows: allRows.length,
      categorias: cat
    });
  }

  async function populateFiltersFromServer(){
    try{
      const A = (window.APP && window.APP.A_URL) || window.A || '';
      if(!A){
        console.warn('APP.A_URL not set; cannot populate filters');
        return;
      }
      try{
        // Intento 1: orders.meta
        await populateFromMeta(A);
      }catch(e){
        console.warn('orders.meta failed, falling back to orders.list:', e);
        try{
          // Intento 2: multi-page orders.list
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

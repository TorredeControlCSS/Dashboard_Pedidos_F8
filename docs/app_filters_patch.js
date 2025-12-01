// Patch: populate filters using orders.meta (servidor) para cubrir todo el dataset
(function(){
  async function fetchMeta(){
    try{
      const A = (window.APP && window.APP.A_URL) || window.A || '';
      if(!A) return null;
      const cb = 'cb_meta_' + Math.random().toString(36).slice(2);
      return new Promise((resolve, reject) => {
        window[cb] = function(payload){ try{ resolve(payload); } finally{ delete window[cb]; s.remove(); } };
        const s = document.createElement('script');
        s.onerror = ()=>{ delete window[cb]; s.remove(); reject(new Error('network')); };
        s.src = A + '?route=orders.meta&callback=' + cb + '&_=' + Date.now();
        document.body.appendChild(s);
      });
    }catch(e){ console.error('fetchMeta error', e); return null; }
  }

  function setOptions(id, items, includeAllLabel){
    const el = document.getElementById(id);
    if(!el) return;
    const cur = el.value || '';
    const prefix = includeAllLabel ? '<option value="">Todas</option>' : '<option value="">Todos</option>';
    el.innerHTML = prefix + (items||[]).map(v=>`<option value="${v}">${v}</option>`).join('');
    if(items && items.indexOf(cur) >= 0) el.value = cur;
  }

  async function populateFiltersFromServer(){
    const res = await fetchMeta();
    if(!res || res.status !== 'ok') return;
    const data = res.data || {};
    setOptions('fCat', data.categorias || [], true);
    setOptions('fUnidad', data.unidades || [], true);
    setOptions('fTipo', data.tipos || [], false);
    setOptions('fGrupo', data.grupos || [], false);
    setOptions('fEstado', data.estados || [], true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', populateFiltersFromServer);
  } else {
    populateFiltersFromServer();
  }
})();

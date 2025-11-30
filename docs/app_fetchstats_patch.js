/* --- PATCH: provide fetchStats + wrappers (safe if already exist) --- */
(function(){
  const A = (window.APP && window.APP.A_URL) || window.A || '';
  if (!window.fetchStats){
    window.fetchStats = async function fetchStats(filters){
      try{
        const p = new URLSearchParams({route:'stats'});
        if (filters && typeof filters==='object'){
          Object.entries(filters).forEach(([k,v])=>{ if(v!=null && v!=='') p.append(k, v); });
        }
        const res = await jsonp(`${A}?${p.toString()}`);
        if(res && res.status==='ok') return res.data||{};
        throw new Error('stats failed');
      }catch(e){
        const p2 = new URLSearchParams({route:'kpis'});
        if (filters && typeof filters==='object'){
          Object.entries(filters).forEach(([k,v])=>{ if(v!=null && v!=='') p2.append(k, v); });
        }
        const res2 = await jsonp(`${A}?${p2.toString()}`);
        return (res2 && res2.data) || {};
      }
    };
  }
  if (!window.refreshKpis){
    window.refreshKpis = async function refreshKpis(filters){
      const st = await window.fetchStats(filters);
      if (typeof setKpis==='function' && st && (st.kpis||st)) setKpis(st.kpis||st);
    };
  }
  if (!window.refreshCharts){
    window.refreshCharts = async function refreshCharts(filters){
      const st = await window.fetchStats(filters);
      if (typeof renderCharts==='function') await renderCharts(st);
    };
  }
})();
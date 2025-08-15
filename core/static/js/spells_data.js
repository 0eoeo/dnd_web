// core/static/js/spells_data.js
let SPELLS_CACHE = [];
let SPELLS_READY = null;
let _API = null;

export function setApi(api) { _API = api; }
function getApi() {
  const fallback = {
    spellsList: '/api/spells/',
    spellDetail: (slug) => `/api/spells/${encodeURIComponent(slug)}/`,
  };
  return _API || (typeof window !== 'undefined' ? window.API : null) || fallback;
}

export async function loadSpells(force = false) {
  if (force) { SPELLS_READY = null; SPELLS_CACHE = []; }
  if (SPELLS_READY) return SPELLS_READY;
  const { spellsList } = getApi();
  SPELLS_READY = fetch(spellsList)
    .then(r => r.ok ? r.json() : [])
    .then(list => { SPELLS_CACHE = Array.isArray(list) ? list : []; return SPELLS_CACHE; })
    .catch(() => { SPELLS_CACHE = []; return SPELLS_CACHE; });
  return SPELLS_READY;
}
export async function ensureSpellsLoaded(){ if(!SPELLS_CACHE.length) await loadSpells(); return SPELLS_CACHE; }
export function getSpellsCache(){ return SPELLS_CACHE; }
export function findSpellBySlugOrName(value){
  if(!value) return null;
  const bySlug = SPELLS_CACHE.find(s => s.slug === value);
  if(bySlug) return bySlug;
  const lc = String(value).toLowerCase();
  return SPELLS_CACHE.find(s => s.name.toLowerCase() === lc) || null;
}
export async function fetchSpellDetail(slug){
  const { spellDetail } = getApi();
  const url = typeof spellDetail === 'function' ? spellDetail(slug) : spellDetail;
  const res = await fetch(url);
  if(!res.ok) throw new Error('Failed to fetch spell detail');
  return res.json();
}

// Утилиты и мелочи

export function el(tag, attrs={}, ...children){
  const n = document.createElement(tag);
  for (const [k,v] of Object.entries(attrs)){
    if (k==='class') n.className = v;
    else if (k==='for') n.htmlFor = v;
    else if (k.startsWith('on') && typeof v==='function') n.addEventListener(k.substring(2), v);
    else n.setAttribute(k, v);
  }
  for (const c of children){
    if (c==null) continue;
    if (typeof c==='string') n.appendChild(document.createTextNode(c));
    else n.appendChild(c);
  }
  return n;
}

export const LONG_HINT = new Set(['ProficienciesLang','Equipment','Features and Traits','AttacksSpellcasting','Backstory','Allies','Feat+Traits','Treasure','PersonalityTraits','Ideals','Bonds','Flaws']);

export const normalizeName = s => (s||'').replace(/\s+/g,' ').trim();
export const normName = s => (s||'').replace(/\s+/g,' ').trim();

// CSRF cookie helper
function getCookie(name){
  const m = document.cookie.match('(^|;)\\s*'+name+'\\s*=\\s*([^;]+)');
  return m ? m.pop() : '';
}
export const CSRF = () => getCookie('csrftoken');

import { el, normalizeName, LONG_HINT } from './utils.js';
import { FIELD_GROUPS } from './config.js';

export const cards = document.getElementById('cards');

// Безопасно ставим фон; поддерживаем /media, data:, blob:
function safeSetBg(el, url) {
  if (!el || typeof url !== 'string') return;
  if (!/^(https?:|data:|blob:|\/)/.test(url)) return;

  let abs = url;
  if (!(url.startsWith('data:') || url.startsWith('blob:'))) {
    abs = new URL(url, window.location.origin).href;
  }

  el.style.backgroundImage = `url("${abs}")`;
  el.style.backgroundSize = 'cover';
  el.style.backgroundPosition = 'center';

  // ⬇️ если элемент 0×0 — зададим минимальные размеры, чтобы фон было видно
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  if (!w || !h) {
    el.style.width = el.style.width || '160px';
    el.style.height = el.style.height || '160px';
  }
}

export function makeInput(name, label, isLong=false, layout='three'){
  const cls  = (name==='__AVATAR__') ? 'two'
              : (layout==='four' ? 'four' : layout==='two' ? 'two' : layout==='stack' ? 'stack' : 'three');
  const wrap = el('div',{ class:`field ${cls}` });
  const id   = `f_${name.replace(/[^a-z0-9]+/gi,'_')}`;
  wrap.appendChild(el('label', { for:id }, label || name));

  if (name === '__AVATAR__') {
    const placeholderSvg =
      "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' fill='%2310151f'/><circle cx='50' cy='38' r='18' fill='%232a3348'/><rect x='20' y='62' width='60' height='26' rx='13' fill='%232a3348'/></svg>";

    // ⬇️ ЯВНЫЕ РАЗМЕРЫ + фон по умолчанию (чтобы точно было видно)
    const holder = el('div', { class:'avatar', id:'avatarHolder', role:'group', 'aria-label':'Аватар персонажа' },
      el('div', {
        class:'preview',
        id:'avatarPreview',
        style: [
          "display:block",
          "width:160px",
          "height:160px",
          "border-radius:12px",
          "overflow:hidden",
          "background:#0b1020",
          `background-image:url("${placeholderSvg}")`,
          "background-size:cover",
          "background-position:center",
        ].join(';')
      }),
      el('div', { class:'meta' },
        el('label', { class:'btn ghost', style:'display: inline-flex;margin-top: 10px;', for:'avatarFile' }, 'Выбрать файл'),
        el('small', { style:'padding-left:10px;' }, 'PNG/JPG')
      ),
      // ВАЖНО: name="avatar"
      el('input', { id:'avatarFile', name:'avatar', type:'file', accept:'image/png,image/jpeg', hidden:true })
    );
    wrap.appendChild(holder);

    const previewEl = holder.querySelector('#avatarPreview');
    const fileEl    = holder.querySelector('#avatarFile');

    // Начальный URL из глобала, если есть
    const current = window.currentCharacter || null;
    const initialUrl = (current && typeof current.avatar_url === 'string') ? current.avatar_url : '';

    if (initialUrl) {
      safeSetBg(previewEl, initialUrl);
    } else {
      safeSetBg(previewEl, placeholderSvg);
    }

    // Локальный предпросмотр выбранного файла через ObjectURL
    let lastURL = null;
    if (fileEl && previewEl) {
      fileEl.addEventListener('change', () => {
        const f = fileEl.files && fileEl.files[0];
        if (!f) return;
        if (!/^image\/(png|jpe?g)$/.test(f.type || '')) {
          alert('PNG/JPG только');
          fileEl.value = '';
          return;
        }
        if (lastURL) URL.revokeObjectURL(lastURL);
        const u = URL.createObjectURL(f);
        lastURL = u;
        safeSetBg(previewEl, u);
      });
    }

    return wrap;
  }

  // Обычные поля
  const input = (isLong || LONG_HINT.has(name))
    ? el('textarea', { id, 'data-name':name, placeholder: label || name })
    : el('input',    { id, 'data-name':name, type:'text', placeholder: label || name });
  wrap.appendChild(input);
  return wrap;
}

function renderGroupSection(group) {
  const section = document.createElement('section');
  section.className = 'card sheet-section';
  section.id = `sec-${group.id}`;
  section.setAttribute('data-title', group.title);

  section.appendChild(el('h2', {}, group.title));

  const grid = el('div', { class: 'grid' });
  section.appendChild(grid);

  return { section, grid };
}

export function renderNonMagic(){
  for (const group of FIELD_GROUPS){
    const { section, grid } = renderGroupSection(group);
    for (const [rawName,label] of (group.fields||[])){
      const name = normalizeName(rawName);
      grid.appendChild( makeInput(name, label, group.long?.includes(name), group.layout) );
    }
    cards.appendChild(section);
  }
}

// core/static/js/main.js
import { CSRF } from './utils.js';
import { renderFormFromJson, buildJsonFromForm, setAvatarDataUrl } from './state.js';
import { initDiceSidebar, initCalcInputsSupport, markNumericInputsForCalc } from './dice.js';
import { insertLongRestButton } from './spells.js';
import { buildSheetTOC, buildSheetTabs } from './sheet_nav.js';

/* === DRF API === */
window.API = {
  uploadPdf: '/api/sheets/',
  listSheets: '/api/sheets/',
  getSheet: id => `/api/sheets/${id}/`,
  createSheet: '/api/sheets/',
  updateSheet: id => `/api/sheets/${id}/`,
  spellsList: '/api/spells/',
  spellDetail: slug => `/api/spells/${encodeURIComponent(slug)}/`,
};

/* === Утилиты === */
function isSafeImageUrl(url) {
  return typeof url === 'string' && /^(https?:|data:|blob:|\/)/.test(url);
}
function setBgImage(el, url) {
  if (!el || !isSafeImageUrl(url)) return;
  const abs = new URL(url, window.location.origin).href;
  el.style.backgroundImage = `url("${abs}")`;
  el.style.backgroundSize = 'cover';
  el.style.backgroundPosition = 'center';
}

function validateAvatarFile(file) {
  if (!file) return true;
  const okType = /^image\/(png|jpe?g)$/.test(file.type || '');
  if (!okType) { alert('Поддерживаются только изображения PNG/JPG'); return false; }
  const maxSize = 10 * 1024 * 1024; // 10MB
  if (file.size > maxSize) { alert('Файл аватара слишком большой (макс. 10MB)'); return false; }
  return true;
}

function buildSheetPayload({ dataToSave, avatarFile, name }) {
  if (avatarFile) {
    const fd = new FormData();
    if (name) fd.append('name', name);
    fd.append('data', JSON.stringify(dataToSave));
    fd.append('avatar', avatarFile); // имя поля ДОЛЖНО быть 'avatar'
    return { body: fd, headers: { 'X-CSRFToken': CSRF() } };
  }
  return {
    body: JSON.stringify({ name, data: dataToSave }),
    headers: { 'Content-Type':'application/json', 'X-CSRFToken': CSRF() },
  };
}

/* === Встроенная карта === */
function initEmbeddedMap(){
  const embed   = document.getElementById('mapEmbed');
  const wrap    = document.getElementById('mapCanvasWrap');
  const canvas  = document.getElementById('mapCanvas');
  const btnTBar = document.getElementById('btnToggleMap');
  const btnToggle = document.getElementById('btnMapCollapse');
  const btnFit  = document.getElementById('btnMapFit');
  const btnReset= document.getElementById('btnMapReset');
  const zoomLbl = document.getElementById('mapZoomIndicator');
  if(!embed || !wrap || !canvas) return;

  const MAP_URL = '/static/img/Albion%208k.png';
  let img = null, isImgLoaded = false;
  let scale = 1, minScale = 0.1, maxScale = 6;
  let isDragging = false, startX = 0, startY = 0, startScrollLeft = 0, startScrollTop = 0;

  function updateZoomLabel(){ if (zoomLbl) zoomLbl.textContent = `${Math.round(scale*100)}%`; }
  function setScale(s, ox=0, oy=0){
    scale = Math.max(minScale, Math.min(maxScale, s));
    canvas.style.transform = `scale(${scale})`;
    updateZoomLabel();
    const sl = wrap.scrollLeft, st = wrap.scrollTop;
    wrap.scrollLeft = sl + ox*(scale - 1);
    wrap.scrollTop  = st + oy*(scale - 1);
  }
  function ensureImg(){
    if (img) return;
    img = new Image();
    img.alt='Карта'; img.draggable=false; img.loading='eager'; img.decoding='async';
    // @ts-ignore
    img.fetchPriority = 'high';
    img.src = MAP_URL;
    img.onload = ()=>{
      isImgLoaded = true;
      requestAnimationFrame(()=>{ fitToWidth(); setTimeout(fitToWidth, 0); });
    };
    img.onerror = ()=> console.error('[map] image load error:', MAP_URL);
    canvas.appendChild(img);
  }
  function fitToWidth(){
    if(!img || !isImgLoaded || img.naturalWidth===0) return;
    const rect = wrap.getBoundingClientRect();
    const avail = Math.max(100, rect.width - 24);
    const s = avail / img.naturalWidth;
    setScale(s>0?s:1);
    wrap.scrollLeft = 0; wrap.scrollTop = 0;
  }
  function resetZoom(){ setScale(1); wrap.scrollLeft = 0; wrap.scrollTop = 0; }
  function setCollapsed(collapsed){
    if (collapsed){
      embed.classList.add('collapsed');
      embed.setAttribute('aria-expanded','false');
      if (btnToggle) btnToggle.textContent = 'Показать карту';
    } else {
      embed.classList.remove('collapsed');
      embed.setAttribute('aria-expanded','true');
      if (btnToggle) btnToggle.textContent = 'Скрыть карту';
      ensureImg();
      requestAnimationFrame(()=>{ fitToWidth(); setTimeout(fitToWidth, 0); });
    }
  }
  function toggleCollapsed(){
    const collapsed = embed.classList.contains('collapsed');
    setCollapsed(!collapsed);
  }
  setCollapsed(true);
  updateZoomLabel();
  wrap.addEventListener('mousedown', (e)=>{
    if (e.button !== 0) return;
    if (embed.classList.contains('collapsed')) return;
    isDragging = true; wrap.classList.add('is-dragging');
    startX = e.clientX; startY = e.clientY;
    startScrollLeft = wrap.scrollLeft; startScrollTop  = wrap.scrollTop;
    e.preventDefault();
  });
  window.addEventListener('mousemove', (e)=>{
    if (!isDragging) return;
    wrap.scrollLeft = startScrollLeft - (e.clientX - startX);
    wrap.scrollTop  = startScrollTop  - (e.clientY - startY);
  });
  window.addEventListener('mouseup', ()=>{
    if (!isDragging) return;
    isDragging = false; wrap.classList.remove('is-dragging');
  });
  wrap.addEventListener('wheel', (e)=>{
    if (embed.classList.contains('collapsed')) return;
    if (e.shiftKey){
      wrap.scrollLeft += e.deltaY;
      e.preventDefault();
      return;
    }
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    const r = wrap.getBoundingClientRect();
    const ox = e.clientX - r.left + wrap.scrollLeft;
    const oy = e.clientY - r.top  + wrap.scrollTop;
    setScale(scale * factor, ox, oy);
    e.preventDefault();
  }, { passive:false });
  btnFit?.addEventListener('click', fitToWidth);
  btnReset?.addEventListener('click', resetZoom);
  btnToggle?.addEventListener('click', toggleCollapsed);
  btnTBar?.addEventListener('click', ()=>{
    toggleCollapsed();
    if (!embed.classList.contains('collapsed')){
      embed.scrollIntoView({ behavior:'smooth', block:'start' });
    }
  });
  window.addEventListener('resize', ()=>{
    if (!embed.classList.contains('collapsed') && isImgLoaded) fitToWidth();
  });
}

/* === Работа с листами === */
const inputPdf    = document.getElementById('pdfFile');
const sheetSelect = document.getElementById('sheetSelect');
const btnSave     = document.getElementById('btnSave');
let currentSheetId = null;

async function uploadPdfToServer(file){
  const fd = new FormData();
  fd.append('pdf', file);
  const baseName = file?.name?.replace(/\.[^.]+$/, '') || 'Импортированный лист';
  fd.append('name', baseName);
  const res = await fetch(window.API.uploadPdf, {
    method: 'POST',
    headers: { 'X-CSRFToken': CSRF() },
    credentials: 'same-origin',
    body: fd
  });
  if(!res.ok){ alert('Не удалось распарсить PDF'); return; }
  const sheet = await res.json();
  currentSheetId = sheet.id || null;
  await renderFormFromJson(sheet.data || {});
  // после рендера можно безопасно трогать avatarPreview
  const prev = document.getElementById('avatarPreview');
  if (prev && sheet?.avatar_url) setBgImage(prev, sheet.avatar_url);
  try { markNumericInputsForCalc(document); } catch {}
  try { buildSheetTabs(); /* or buildSheetTOC(); */ } catch(e){ console.error(e); }
}

async function loadSheets(){
  const res = await fetch(window.API.listSheets, { credentials:'same-origin' });
  if(!res.ok) return;
  const items = await res.json();
  const list = Array.isArray(items) ? items : [];
  const cur = sheetSelect?.value;
  if (sheetSelect){
    const frag = document.createDocumentFragment();
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '— выбрать лист —';
    frag.appendChild(placeholder);
    for (const it of list){
      const opt = document.createElement('option');
      opt.value = String(it.id);
      const label = it.name || `Лист #${it.id}`;
      const labelDate = it.updated_at ? ` — ${new Date(it.updated_at).toLocaleString()}` : '';
      opt.textContent = `${label}${labelDate}`;
      frag.appendChild(opt);
    }
    sheetSelect.innerHTML = '';
    sheetSelect.appendChild(frag);
    if(cur) sheetSelect.value = cur;
  }
}

inputPdf?.addEventListener('change', async (e)=>{
  const f = e.target.files?.[0];
  if(!f) return;
  await uploadPdfToServer(f);
});

sheetSelect?.addEventListener('change', async () => {
  const id = sheetSelect.value;
  if (!id) return;
  const res = await fetch(window.API.getSheet(id), { credentials: 'same-origin' });
  if (!res.ok) { alert('Не удалось загрузить лист'); return; }
  const item = await res.json();
  currentSheetId = item.id;

  const dto = (item && typeof item.data === 'object' && item.data) ? item.data : null;
  if (dto) await renderFormFromJson(dto);

  const prev = document.getElementById('avatarPreview');
  if (prev && item?.avatar_url) setBgImage(prev, item.avatar_url);

  try { markNumericInputsForCalc(document); } catch {}
  try { insertLongRestButton(); } catch {}
  try { buildSheetTabs(); } catch (e) { console.error(e); }
});

btnSave?.addEventListener('click', async () => {
  const dataToSave = buildJsonFromForm();

  const avatarInput = document.getElementById('avatarFile');
  const avatarFile = avatarInput?.files?.[0] || null;

  if (!validateAvatarFile(avatarFile)) {
    if (avatarInput) avatarInput.value = '';
    return;
  }

  try {
    if (currentSheetId) {
      const { body, headers } = buildSheetPayload({ dataToSave, avatarFile, name: undefined });
      const res = await fetch(window.API.updateSheet(currentSheetId), {
        method: 'PATCH',
        headers,
        credentials: 'same-origin',
        body
      });
      if (!res.ok) {
        alert('Не удалось сохранить лист');
        return;
      }
    } else {
      const { body, headers } = buildSheetPayload({ dataToSave, avatarFile, name: 'Лист без названия' });
      const res = await fetch(window.API.createSheet, {
        method: 'POST',
        headers,
        credentials: 'same-origin',
        body
      });
      if (!res.ok) {
        alert('Не удалось создать лист');
        return;
      }
      const created = await res.json();
      if (created && created.id) currentSheetId = created.id;
    }

    // подтягиваем свежие данные и avatar_url
    if (currentSheetId) {
      const r2 = await fetch(window.API.getSheet(currentSheetId), { credentials: 'same-origin' });
      if (r2.ok) {
        const item = await r2.json();

        // Перерисовываем форму только если пришёл объект
        const dto = (item && typeof item.data === 'object' && item.data) ? item.data : null;
        if (dto) await renderFormFromJson(dto);

        const prev = document.getElementById('avatarPreview');
        if (prev && item?.avatar_url) setBgImage(prev, item.avatar_url);
      }
    }

    alert('Сохранено!');
  } catch (e) {
    console.error(e);
    alert('Ошибка при сохранении');
  }
});


/* === Инициализация === */
document.addEventListener('DOMContentLoaded', ()=>{
  loadSheets().catch(()=>{});
  try { initDiceSidebar(); } catch(e){ console.error(e); }
  try { insertLongRestButton(); } catch(e){ console.error(e); }
  try { initCalcInputsSupport(); markNumericInputsForCalc(document); } catch(e){ console.error(e); }
  try { initEmbeddedMap(); } catch(e){ console.error(e); }
});

/* === avatar preview (ЕДИНЫЙ) === */
document.addEventListener('change', (e) => {
  if (e.target && e.target.id === 'avatarFile') {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!validateAvatarFile(f)) { e.target.value = ''; return; }
    const rd = new FileReader();
    rd.onload = () => {
      setAvatarDataUrl(rd.result); // если нужно где-то сохранить dataURL
      const prev = document.getElementById('avatarPreview');
      setBgImage(prev, String(rd.result || '')); // безопасно ставим data URL
    };
    rd.readAsDataURL(f);
  }
});


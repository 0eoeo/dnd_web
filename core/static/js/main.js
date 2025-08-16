// core/static/js/main.js
import { CSRF } from './utils.js';
import { renderFormFromJson, buildJsonFromForm, setAvatarDataUrl } from './state.js';
import { initDiceSidebar } from './dice.js';
import { insertLongRestButton } from './spells.js';

/* =========================
   Поддержка арифметических выражений
   ========================= */
const NUMERIC_DATA_NAMES = new Set([
  'HPMax','HPCurrent','HPTemp',
  'AC','Initiative','Speed',
  'ProfBonus','Passive',
  'HDTotal',
  'SlotsTotal 19','SlotsRemaining 19',
  'SlotsTotal 20','SlotsRemaining 20',
  'SlotsTotal 21','SlotsRemaining 21',
  'SlotsTotal 22','SlotsRemaining 22',
  'SlotsTotal 23','SlotsRemaining 23',
  'SlotsTotal 24','SlotsRemaining 24',
  'SlotsTotal 25','SlotsRemaining 25',
  'SlotsTotal 26','SlotsRemaining 26',
  'SlotsTotal 27','SlotsRemaining 27',
  'CP','SP','EP','GP','PP'
]);

const ALLOWED_EXPR_RE = /^[0-9+\-*/().,\s]+$/;

function safeEvalExpr(expr) {
  if (typeof expr !== 'string') return null;
  const s = expr.trim().replaceAll(',', '.');
  if (!s) return null;
  if (!ALLOWED_EXPR_RE.test(s)) return null;
  const normalized = s.replace(/^\s*-\s*/, '0-');
  if (/[+\-*/]{2,}/.test(normalized)) return null;
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function(`return (${normalized})`);
    const val = fn();
    if (typeof val !== 'number' || !Number.isFinite(val)) return null;
    return val;
  } catch {
    return null;
  }
}

function applyCalcToInput(input) {
  const raw = input.value;
  const res = safeEvalExpr(raw);
  if (res == null) return false;
  input.value = String(res);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

function markNumericInputsForCalc(root = document) {
  root.querySelectorAll('input[data-name], textarea[data-name]').forEach(el => {
    const dn = el.getAttribute('data-name') || '';
    if (NUMERIC_DATA_NAMES.has(dn) && el.tagName.toLowerCase() === 'input') {
      el.setAttribute('data-calc', '1');
      if (!el.title) el.title = 'Можно вводить выражения: 10+2*3, (40-5)/5. Нажмите Enter для расчёта.';
    }
  });
}

function initCalcInputsSupport() {
  document.addEventListener('keydown', (e) => {
    const t = e.target;
    if (e.key !== 'Enter') return;
    if (!(t instanceof HTMLInputElement)) return;
    if (t.getAttribute('data-calc') !== '1') return;
    const ok = applyCalcToInput(t);
    if (ok) { e.preventDefault(); e.stopPropagation(); }
  });

  document.addEventListener('blur', (e) => {
    const t = e.target;
    if (!(t instanceof HTMLInputElement)) return;
    if (t.getAttribute('data-calc') !== '1') return;
    applyCalcToInput(t);
  }, true);
}

/* =========================
   Карта (встроенный режим) — drag-to-pan, зум, СКРЫТЬ/ПОКАЗАТЬ
   ========================= */
function initEmbeddedMap(){
  const embed   = document.getElementById('mapEmbed');
  const wrap    = document.getElementById('mapCanvasWrap');
  const canvas  = document.getElementById('mapCanvas');
  const btnTBar = document.getElementById('btnToggleMap');     // кнопка в верхнем тулбаре
  const btnToggle = document.getElementById('btnMapCollapse');  // кнопка на панели карты
  const btnFit  = document.getElementById('btnMapFit');
  const btnReset= document.getElementById('btnMapReset');
  const zoomLbl = document.getElementById('mapZoomIndicator');

  if(!embed || !wrap || !canvas) return;

  // Путь к карте (экранируем пробел)
  const MAP_URL = '/static/img/Albion%208k.png';

  let img=null, isImgLoaded=false;
  let scale=1, minScale=0.1, maxScale=6;
  let isDragging=false, startX=0, startY=0, startScrollLeft=0, startScrollTop=0;

  function updateZoomLabel(){
    if (zoomLbl) zoomLbl.textContent = `${Math.round(scale*100)}%`;
  }

  function ensureImg(){
    if(img) return;
    img = new Image();
    img.alt='Карта';
    img.draggable=false;
    img.loading='eager';
    img.decoding='async';
    // @ts-ignore
    img.fetchPriority = 'high';
    img.src = MAP_URL;

    img.onload = ()=> {
      isImgLoaded = true;
      wrap.style.maxWidth = 'none';
      canvas.style.maxWidth = 'none';
      img.style.maxWidth = 'none';
      requestAnimationFrame(()=>{ fitToWidth(); setTimeout(fitToWidth, 0); });
    };
    img.onerror = ()=> console.error('[map] image load error:', MAP_URL);

    canvas.appendChild(img);
  }

  function setScale(s, ox=0, oy=0){
    scale = Math.max(minScale, Math.min(maxScale, s));
    canvas.style.transform = `scale(${scale})`;
    updateZoomLabel();
    const sl = wrap.scrollLeft, st = wrap.scrollTop;
    wrap.scrollLeft = sl + ox*(scale - 1);
    wrap.scrollTop  = st + oy*(scale - 1);
  }

  function fitToWidth(){
    if(!img || !isImgLoaded || img.naturalWidth===0) return;
    const rect = wrap.getBoundingClientRect();
    const avail = Math.max(100, rect.width - 24);
    const s = avail / img.naturalWidth;
    setScale(s>0?s:1);
    wrap.scrollLeft = 0;
    wrap.scrollTop  = 0;
  }

  function resetZoom(){
    setScale(1);
    wrap.scrollLeft = 0;
    wrap.scrollTop  = 0;
  }

  // Переключение скрыть/показать
  function setCollapsed(collapsed){
    if (collapsed){
      embed.classList.add('collapsed');
      embed.setAttribute('aria-expanded','false');
      if (btnToggle) btnToggle.textContent = 'Показать';
    } else {
      embed.classList.remove('collapsed');
      embed.setAttribute('aria-expanded','true');
      if (btnToggle) btnToggle.textContent = 'Скрыть';
      // при показе — гарантируем наличие изображения и fit
      ensureImg();
      requestAnimationFrame(()=>{ fitToWidth(); setTimeout(fitToWidth, 0); });
    }
  }

  function toggleCollapsed(){
    const collapsed = embed.classList.contains('collapsed');
    setCollapsed(!collapsed);
  }

  // Изначально: карта показана (можно сменить на скрыта, если нужно)
  setCollapsed(false);

  // Drag-to-pan
  wrap.addEventListener('mousedown', (e)=>{
    if (e.button !== 0) return;
    // если скрыта — игнор
    if (embed.classList.contains('collapsed')) return;
    isDragging = true;
    wrap.classList.add('is-dragging');
    startX = e.clientX;
    startY = e.clientY;
    startScrollLeft = wrap.scrollLeft;
    startScrollTop  = wrap.scrollTop;
    e.preventDefault();
  });
  window.addEventListener('mousemove', (e)=>{
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    wrap.scrollLeft = startScrollLeft - dx;
    wrap.scrollTop  = startScrollTop  - dy;
  });
  window.addEventListener('mouseup', ()=>{
    if (!isDragging) return;
    isDragging = false;
    wrap.classList.remove('is-dragging');
  });

  // Wheel zoom (Shift — горизонтальный сдвиг)
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

  // Кнопки
  btnFit?.addEventListener('click', fitToWidth);
  btnReset?.addEventListener('click', resetZoom);
  btnToggle?.addEventListener('click', toggleCollapsed);
  btnTBar?.addEventListener('click', ()=>{
    toggleCollapsed();
    if (!embed.classList.contains('collapsed')){
      embed.scrollIntoView({ behavior:'smooth', block:'start' });
    }
  });

  // Пересчёт при ресайзе
  window.addEventListener('resize', ()=>{
    if (!embed.classList.contains('collapsed') && isImgLoaded) fitToWidth();
  });

  // Инициализация изображения
  ensureImg();
  updateZoomLabel();
}

/* =========================
   Остальной код
   ========================= */
window.API = {
  uploadPdf: '/api/upload-pdf/',
  listSheets: '/api/media-sheets/',
  getSheet: id => `/api/sheets/${id}/`,
  createSheet: '/api/sheets/',
  updateSheet: id => `/api/sheets/${id}/`,
  spellsList: '/api/spells/',
  spellDetail: slug => `/api/spells/${encodeURIComponent(slug)}/`,
};

const inputPdf = document.getElementById('pdfFile');
const sheetSelect = document.getElementById('sheetSelect');
const btnSave = document.getElementById('btnSave');

let currentSheetId = null;

inputPdf.addEventListener('change', async (e)=>{
  const f = e.target.files?.[0];
  if(!f) return;
  await uploadPdfToServer(f);
});

sheetSelect.addEventListener('change', async ()=>{
  const id = sheetSelect.value;
  if(!id) return;
  const res = await fetch(window.API.getSheet(id), { credentials:'same-origin' });
  if(!res.ok){ alert('Не удалось загрузить лист'); return; }
  const item = await res.json();
  currentSheetId = item.id;
  await renderFormFromJson(item.data);
  try { markNumericInputsForCalc(document); } catch {}
  try { insertLongRestButton(); } catch {}
});

btnSave.addEventListener('click', async ()=>{
  const dataToSave = buildJsonFromForm();

  if (currentSheetId) {
    const res = await fetch(window.API.updateSheet(currentSheetId), {
      method: 'PATCH',
      headers: { 'Content-Type':'application/json', 'X-CSRFToken': CSRF() },
      credentials: 'same-origin',
      body: JSON.stringify({ data: dataToSave })
    });
    if (!res.ok) { alert('Не удалось сохранить лист'); return; }
  } else {
    const res = await fetch(window.API.createSheet, {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'X-CSRFToken': CSRF() },
      credentials: 'same-origin',
      body: JSON.stringify({ name: 'Лист без названия', data: dataToSave })
    });
    if (!res.ok) { alert('Не удалось создать лист'); return; }
    const created = await res.json();
    if (created && created.id) currentSheetId = created.id;
  }

  if (currentSheetId) {
    const r2 = await fetch(window.API.getSheet(currentSheetId), { credentials:'same-origin' });
    if (r2.ok) {
      const item = await r2.json();
      if (item && item.data) await renderFormFromJson(item.data);
      try { markNumericInputsForCalc(document); } catch {}
    }
  }

  alert('Сохранено!');
});

async function uploadPdfToServer(file){
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(window.API.uploadPdf, {
    method:'POST',
    headers: { 'X-CSRFToken': CSRF() },
    credentials: 'same-origin',
    body: fd
  });
  if(!res.ok){ alert('Не удалось распарсить PDF'); return; }
  const payload = await res.json();
  currentSheetId = payload.id || null;
  await renderFormFromJson(payload.data || payload);
  try { markNumericInputsForCalc(document); } catch {}
}

async function loadSheets(){
  const res = await fetch(window.API.listSheets, { credentials:'same-origin' });
  if(!res.ok) return;
  const items = await res.json();
  const cur = sheetSelect.value;
  sheetSelect.innerHTML = '<option value="">— выбрать лист —</option>' +
    items.map(it => {
      const labelDate = it.created_at ? ' — ' + new Date(it.created_at).toLocaleString() : '';
      if (it.id) return `<option value="${it.id}">${it.name}${labelDate}</option>`;
      return `<option value="" disabled>${it.name} — (нет в БД)</option>`;
    }).join('');
  if(cur) sheetSelect.value = cur;
}

document.addEventListener('DOMContentLoaded', ()=>{
  loadSheets().catch(()=>{});
  try { initDiceSidebar(); } catch(e){ console.error(e); }
  try { insertLongRestButton(); } catch(e){ console.error(e); }
  try { initCalcInputsSupport(); markNumericInputsForCalc(document); } catch(e){ console.error(e); }
  try { initEmbeddedMap(); } catch(e){ console.error(e); }
});

// avatar preview
document.addEventListener('change', (e)=>{
  if(e.target && e.target.id === 'avatarFile'){
    const f = e.target.files?.[0];
    if(!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      setAvatarDataUrl(rd.result);
      const prev = document.getElementById('avatarPreview');
      if(prev) prev.style.backgroundImage = `url('${rd.result}')`;
    };
    rd.readAsDataURL(f);
  }
});

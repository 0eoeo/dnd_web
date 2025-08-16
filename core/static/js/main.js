// core/static/js/main.js
import { CSRF } from './utils.js';
import { renderFormFromJson, buildJsonFromForm, setAvatarDataUrl } from './state.js';
import { initDiceSidebar, initCalcInputsSupport, markNumericInputsForCalc } from './dice.js';
import { insertLongRestButton } from './spells.js';
import { buildSheetTOC, buildSheetTabs } from './sheet_nav.js';

/* === DRF API === */
window.API = {
  uploadPdf: '/api/sheets/',               // POST multipart: pdf + name
  listSheets: '/api/sheets/',              // GET из БД (только актуальные версии)
  getSheet: id => `/api/sheets/${id}/`,
  createSheet: '/api/sheets/',
  updateSheet: id => `/api/sheets/${id}/`,
  spellsList: '/api/spells/',
  spellDetail: slug => `/api/spells/${encodeURIComponent(slug)}/`,
};

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
  let img=null, isImgLoaded=false;
  let scale=1, minScale=0.1, maxScale=6;
  let isDragging=false, startX=0, startY=0, startScrollLeft=0, startScrollTop=0;

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
    if(img) return;
    img = new Image();
    img.alt='Карта'; img.draggable=false; img.loading='eager'; img.decoding='async';
    // @ts-ignore
    img.fetchPriority = 'high';
    img.src = MAP_URL;
    img.onload = ()=>{ isImgLoaded = true; requestAnimationFrame(()=>{ fitToWidth(); setTimeout(fitToWidth, 0); }); };
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
      embed.classList.add('collapsed'); embed.setAttribute('aria-expanded','false');
      if (btnToggle) btnToggle.textContent = 'Показать';
    } else {
      embed.classList.remove('collapsed'); embed.setAttribute('aria-expanded','true');
      if (btnToggle) btnToggle.textContent = 'Скрыть';
      ensureImg(); requestAnimationFrame(()=>{ fitToWidth(); setTimeout(fitToWidth, 0); });
    }
  }
  function toggleCollapsed(){ const collapsed = embed.classList.contains('collapsed'); setCollapsed(!collapsed); }

  setCollapsed(false);
  wrap.addEventListener('mousedown', (e)=>{ if (e.button !== 0) return; if (embed.classList.contains('collapsed')) return;
    isDragging = true; wrap.classList.add('is-dragging');
    startX = e.clientX; startY = e.clientY; startScrollLeft = wrap.scrollLeft; startScrollTop  = wrap.scrollTop; e.preventDefault();
  });
  window.addEventListener('mousemove', (e)=>{ if (!isDragging) return; wrap.scrollLeft = startScrollLeft - (e.clientX - startX); wrap.scrollTop  = startScrollTop  - (e.clientY - startY); });
  window.addEventListener('mouseup', ()=>{ if (!isDragging) return; isDragging = false; wrap.classList.remove('is-dragging'); });
  wrap.addEventListener('wheel', (e)=>{ if (embed.classList.contains('collapsed')) return;
    if (e.shiftKey){ wrap.scrollLeft += e.deltaY; e.preventDefault(); return; }
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
    if (!embed.classList.contains('collapsed')){ embed.scrollIntoView({ behavior:'smooth', block:'start' }); }
  });
  window.addEventListener('resize', ()=>{ if (!embed.classList.contains('collapsed') && isImgLoaded) fitToWidth(); });

  ensureImg(); updateZoomLabel();
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
    sheetSelect.innerHTML = '<option value="">— выбрать лист —</option>' +
      list.map(it => {
        const labelDate = it.updated_at ? ' — ' + new Date(it.updated_at).toLocaleString() : '';
        return `<option value="${it.id}">${it.name || ('Лист #' + it.id)}${labelDate}</option>`;
      }).join('');
    if(cur) sheetSelect.value = cur;
  }
}

inputPdf?.addEventListener('change', async (e)=>{
  const f = e.target.files?.[0];
  if(!f) return;
  await uploadPdfToServer(f);
});

sheetSelect?.addEventListener('change', async ()=>{
  const id = sheetSelect.value;
  if(!id) return;
  const res = await fetch(window.API.getSheet(id), { credentials:'same-origin' });
  if(!res.ok){ alert('Не удалось загрузить лист'); return; }
  const item = await res.json();
  currentSheetId = item.id;
  await renderFormFromJson(item.data || {});
  try { markNumericInputsForCalc(document); } catch {}
  try { insertLongRestButton(); } catch {}
  try { buildSheetTabs(); /* or buildSheetTOC(); */ } catch(e){ console.error(e); }
});

btnSave?.addEventListener('click', async ()=>{
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
      try { buildSheetTabs(); /* or buildSheetTOC(); */ } catch(e){ console.error(e); }
    }
  }
  alert('Сохранено!');
});

/* === Инициализация === */
document.addEventListener('DOMContentLoaded', ()=>{
  loadSheets().catch(()=>{});
  try { initDiceSidebar(); } catch(e){ console.error(e); }
  try { insertLongRestButton(); } catch(e){ console.error(e); }
  try { initCalcInputsSupport(); markNumericInputsForCalc(document); } catch(e){ console.error(e); }
  try { initEmbeddedMap(); } catch(e){ console.error(e); }
});

/* === avatar preview === */
document.addEventListener('change', (e)=>{
  if(e.target && e.target.id === 'avatarFile'){
    const f = e.target.files?.[0]; if(!f) return;
    const rd = new FileReader();
    rd.onload = () => {
      setAvatarDataUrl(rd.result);
      const prev = document.getElementById('avatarPreview');
      if(prev) prev.style.backgroundImage = `url('${rd.result}')`;
    };
    rd.readAsDataURL(f);
  }
});

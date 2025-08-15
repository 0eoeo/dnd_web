// core/static/js/main.js
import { CSRF } from './utils.js';
import { renderFormFromJson, buildJsonFromForm, setAvatarDataUrl } from './state.js';
import { initDiceSidebar } from './dice.js';

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

// Удалено: «голый» POST на /api/rolls/create с несуществующей переменной entry

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
    }
  }

  await loadSheets();
  if (currentSheetId) sheetSelect.value = String(currentSheetId);
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
  const payload = await res.json(); // {id, name, data}
  currentSheetId = payload.id || null;
  await renderFormFromJson(payload.data || payload);
  await loadSheets();
  if(payload.id) sheetSelect.value = String(payload.id);
}

async function loadSheets(){
  const res = await fetch(window.API.listSheets, { credentials:'same-origin' });
  if(!res.ok) return;
  const items = await res.json();
  const cur = sheetSelect.value;
  sheetSelect.innerHTML = '<option value="">— выбрать лист —</option>' +
    items.map(it => {
      const labelDate = it.created_at ? ' — ' + new Date(it.created_at).toLocaleString() : '';
      if (it.id) {
        return `<option value="${it.id}">${it.name}${labelDate}</option>`;
      } else {
        return `<option value="" disabled>${it.name} — (нет в БД)</option>`;
      }
    }).join('');
  if(cur) sheetSelect.value = cur;
}

// init
loadSheets().catch(()=>{});
initDiceSidebar();

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

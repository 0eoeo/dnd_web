// core/static/js/api.js
import { CSRF } from './utils.js';
import { renderFormFromJson, buildJsonFromForm, setAvatarDataUrl } from './state.js';

export const API = {
  uploadPdf: '/api/sheets/',
  listSheets: '/api/sheets/',
  getSheet: id => `/api/sheets/${id}/`,
  createSheet: '/api/sheets/',
  updateSheet: id => `/api/sheets/${id}/`,
  spellsList: '/api/spells/',
  spellDetail: slug => `/api/spells/${encodeURIComponent(slug)}/`,
};

export async function uploadPdfToServer(file){
  const fd = new FormData();
  fd.append('pdf', file);
  fd.append('name', file?.name?.replace(/\.[^.]+$/, '') || 'Импортированный лист');
  const res = await fetch(API.uploadPdf, { method:'POST', headers: { 'X-CSRFToken': CSRF() }, credentials:'same-origin', body: fd });
  if(!res.ok){ alert('Не удалось распарсить PDF'); return null; }
  const payload = await res.json();
  return payload; // {id, name, created_at, data, pdf}
}

export async function loadSheetsInto(selectEl){
  const res = await fetch(API.listSheets, { credentials:'same-origin' });
  if(!res.ok) return;
  const items = await res.json();
  const cur = selectEl.value;
  selectEl.innerHTML = '<option value="">— выбрать лист —</option>'
    + (Array.isArray(items) ? items : []).map(it => {
        const labelDate = it.created_at ? ' — ' + new Date(it.created_at).toLocaleString() : '';
        return `<option value="${it.id}">${it.name || ('Лист #' + it.id)}${labelDate}</option>`;
      }).join('');
  if(cur) selectEl.value = cur;
}

export async function fetchSheet(id){
  const res = await fetch(API.getSheet(id), { credentials:'same-origin' });
  if(!res.ok) throw new Error('Не удалось загрузить лист');
  return await res.json();
}

export async function saveCurrentSheet(currentSheetIdRef){
  const dataToSave = buildJsonFromForm();

  if (currentSheetIdRef.value) {
    const res = await fetch(API.updateSheet(currentSheetIdRef.value), {
      method: 'PATCH',
      headers: { 'Content-Type':'application/json', 'X-CSRFToken': CSRF() },
      credentials:'same-origin',
      body: JSON.stringify({ data: dataToSave })
    });
    if (!res.ok) throw new Error('Не удалось сохранить лист');
  } else {
    const res = await fetch(API.createSheet, {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'X-CSRFToken': CSRF() },
      credentials:'same-origin',
      body: JSON.stringify({ name: 'Лист без названия', data: dataToSave })
    });
    if (!res.ok) throw new Error('Не удалось создать лист');
    const created = await res.json();
    if (created && created.id) currentSheetIdRef.value = created.id;
  }

  if (currentSheetIdRef.value) {
    const fresh = await fetchSheet(currentSheetIdRef.value);
    if (fresh && fresh.data) await renderFormFromJson(fresh.data);
  }

  alert('Сохранено!');
}

export function bindAvatarInput(){
  document.addEventListener('change', (e)=>{
    if (e.target && e.target.id === 'avatarFile'){
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
}

import { CSRF } from './utils.js';
import { API } from './config.js';
import { renderFormFromJson, buildJsonFromForm, setAvatarDataUrl } from './state.js';

export async function uploadPdfToServer(file){
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch(API.uploadPdf, { method:'POST', headers: { 'X-CSRFToken': CSRF() }, body: fd });
  if(!res.ok){ alert('Не удалось распарсить PDF'); return null; }
  const payload = await res.json(); // {id, name, data}
  return payload;
}

export async function loadSheetsInto(selectEl){
  const res = await fetch(API.listSheets);
  if(!res.ok) return;
  const items = await res.json();
  const cur = selectEl.value;
  selectEl.innerHTML = '<option value="">— выбрать лист —</option>'
    + items.map(it => {
        const labelDate = it.created_at ? ' — ' + new Date(it.created_at).toLocaleString() : '';
        if (it.id) return `<option value="${it.id}">${it.name}${labelDate}</option>`;
        return `<option value="" disabled>${it.name} — (нет в БД)</option>`;
      }).join('');
  if(cur) selectEl.value = cur;
}

export async function fetchSheet(id){
  const res = await fetch(API.getSheet(id));
  if(!res.ok) throw new Error('Не удалось загрузить лист');
  return await res.json();
}

export async function saveCurrentSheet(currentSheetIdRef){
  const dataToSave = buildJsonFromForm();

  if (currentSheetIdRef.value) {
    const res = await fetch(API.updateSheet(currentSheetIdRef.value), {
      method: 'PATCH',
      headers: { 'Content-Type':'application/json', 'X-CSRFToken': CSRF() },
      body: JSON.stringify({ data: dataToSave })
    });
    if (!res.ok) throw new Error('Не удалось сохранить лист');
  } else {
    const res = await fetch(API.createSheet, {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'X-CSRFToken': CSRF() },
      body: JSON.stringify({ name: 'Лист без названия', data: dataToSave })
    });
    if (!res.ok) throw new Error('Не удалось создать лист');
    const created = await res.json();
    if (created && created.id) currentSheetIdRef.value = created.id;
  }

  // подтягиваем актуальные данные и перерисовываем (для консистентности)
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

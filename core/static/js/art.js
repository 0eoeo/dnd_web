/* ===== BOOT ===== */
console.log('art.js boot');

/* ===== УТИЛИТЫ ===== */
import { CSRF, el } from './utils.js';

/* ===== ВКЛАДКИ ===== */
const panels = {
  lore:   document.getElementById('tab-lore'),
  images: document.getElementById('tab-images'),
  video:  document.getElementById('tab-video'),
  music:  document.getElementById('tab-music'),
};
function activateTab(name){
  Object.entries(panels).forEach(([k, elNode])=> elNode?.classList.toggle('active', k===name));
  const topBar = document.querySelector('.site-topbar');
  const toolbar = document.querySelector('.toolbar');
  const y = (topBar?.offsetHeight || 0) + (toolbar?.offsetHeight || 0) + 8;
  window.scrollTo({ top:y, behavior:'smooth' });
}
function tabFromHash(){
  const h = (location.hash||'').replace(/^#/, '');
  return ['lore','images','video','music'].includes(h) ? h : 'lore';
}
document.querySelectorAll('.btn[data-jump]').forEach(b=>{
  b.addEventListener('click', ()=>{
    const name = b.dataset.jump.replace('#','');
    history.pushState(null,'',`#${name}`);
    activateTab(name);
  });
});
window.addEventListener('hashchange', ()=> activateTab(tabFromHash()));
activateTab(tabFromHash());

/* ===== ЛОР: СТАТЬИ + УДАЛЕНИЕ ===== */
const articlesList = document.getElementById('articlesList');
const articleForm  = document.getElementById('articleForm');
const galleryInput = articleForm?.querySelector('input[name="gallery"]');
const galleryPreview = document.getElementById('galleryPreview');

const articleView  = document.getElementById('articleView');
const backToList   = document.getElementById('backToList');
const deleteArticleBtn = document.getElementById('deleteArticleBtn');

const viewCover    = document.getElementById('viewCover');
const viewTitle    = document.getElementById('viewTitle');
const viewMeta     = document.getElementById('viewMeta');
const viewContent  = document.getElementById('viewContent');
const viewGallery  = document.getElementById('viewGallery');

let currentArticleId = null;

/* ===== ПАПКИ: ЛОР ===== */
const foldersList = document.getElementById('foldersList');
const folderForm  = document.getElementById('folderForm');
const articleFolderSelect = document.getElementById('articleFolderSelect');
const createLoreFolderBtn = document.getElementById('createLoreFolderBtn');
let currentFolderId = null;

async function loadFolders(){
  try{
    const res = await fetch('/api/art/lore/folders', { credentials:'same-origin', cache:'no-store' });
    if(!res.ok) return;
    const data = await res.json();

    const items = Array.isArray(data) ? data
      : (Array.isArray(data.items) ? data.items
      : (Array.isArray(data.results) ? data.results : []));

    renderFolders(items);

    if (articleFolderSelect){
      articleFolderSelect.innerHTML =
        '<option value="">Без папки</option>' +
        items.map(f => `<option value="${String(f.id)}">${String(f.title||'Без названия')}</option>`).join('');
    }
  }catch(e){ console.warn('loadFolders error', e); }
}

function renderFolders(items){
  const box = document.getElementById('foldersList');
  if (!box){ console.error('foldersList not found in DOM'); return; }

  box.innerHTML = '';

  // ЯВНОЕ пустое состояние (чтобы видеть, что функция точно отработала)
  if (!items || !items.length){
    const empty = document.createElement('div');
    empty.className = 'muted';
    empty.textContent = 'Папок пока нет';
    box.appendChild(empty);
    return;
  }

  // Кнопка "Все статьи"
  const allBtn = document.createElement('div');
  allBtn.className = 'folder-card' + (currentFolderId===null ? ' active' : '');
  allBtn.textContent = 'Все статьи';
  allBtn.onclick = ()=>{ currentFolderId = null; loadArticles(); renderFolders(items); };
  box.appendChild(allBtn);

  items.forEach(it=>{
    const row = document.createElement('div');
    row.className = 'folder-card' + (currentFolderId===it.id ? ' active' : '');

    const span = document.createElement('span');
    span.textContent = (it && (it.title ?? it.name)) || 'Без названия';
    row.appendChild(span);

    const actions = document.createElement('div');
    actions.className = 'folder-actions';
    const delBtn = document.createElement('button');
    delBtn.className = 'btn danger';
    delBtn.textContent = '×';
    delBtn.title = 'Удалить папку';
    delBtn.onclick = (e)=>{ e.stopPropagation(); deleteFolder(it.id); };
    actions.appendChild(delBtn);
    row.appendChild(actions);

    row.onclick = ()=>{ currentFolderId = it.id; loadArticles(); renderFolders(items); };
    box.appendChild(row);
  });
}

async function deleteFolder(id){
  const ok = confirm('Удалить папку безвозвратно? Статьи останутся без папки.');
  if (!ok) return;
  try{
    const res = await fetch(`/api/art/lore/folders/${id}/`, {
      method:'DELETE',
      headers:{ 'X-CSRFToken': CSRF() },
      credentials:'same-origin'
    });
    if (res.ok){
      if (currentFolderId===id) currentFolderId=null;
      await loadFolders();
      await loadArticles();
    } else {
      alert('Не удалось удалить папку');
    }
  }catch(e){ alert('Ошибка сети при удалении папки'); }
}

/* Создание папки Лор — предотвращаем перезагрузку */
folderForm?.addEventListener('submit', (e)=>{ e.preventDefault(); e.stopPropagation(); });
createLoreFolderBtn?.addEventListener('click', async (e)=>{
  e.preventDefault(); e.stopPropagation();
  const input = folderForm?.querySelector('input[name="title"]');
  const title = (input?.value || '').trim();
  if (!title) { alert('Введите название папки'); return; }
  try{
    const res = await fetch('/api/art/lore/folders', {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'X-CSRFToken': CSRF() },
      credentials:'same-origin',
      body: JSON.stringify({ title })
    });
    if (!res.ok){
      const t = await res.text().catch(()=> '');
      alert('Не удалось создать папку: '+ (t || res.status));
      return;
    }
    if (input) input.value = '';
    await loadFolders();
  }catch(err){ alert('Ошибка сети при создании папки'); }
});

/* ===== ЗАГРУЗКА СТАТЕЙ с фильтром по папке ===== */
async function loadArticles(){
  try{
    const url = currentFolderId
      ? `/api/art/lore/articles?folder_id=${encodeURIComponent(currentFolderId)}`
      : '/api/art/lore/articles';
    const res = await fetch(url, { credentials:'same-origin' });
    if(!res.ok) return;
    const data = await res.json();
    const items = Array.isArray(data) ? data : (Array.isArray(data.items) ? data.items : []);
    renderArticles(items);
  }catch(e){ console.warn('loadArticles error', e); }
}

function articleCardActions(id){
  const actions = document.createElement('div');
  actions.className = 'article-actions';
  const readBtn = document.createElement('button');
  readBtn.className = 'btn';
  readBtn.textContent = 'Читать';
  readBtn.addEventListener('click', ()=> openArticle(id));
  const delBtn = document.createElement('button');
  delBtn.className = 'btn danger';
  delBtn.textContent = 'Удалить';
  delBtn.title = 'Удалить статью';
  delBtn.addEventListener('click', ()=> confirmDeleteArticle(id));
  actions.appendChild(readBtn);
  actions.appendChild(delBtn);
  return actions;
}

function renderArticles(items){
  if(!articlesList) return;
  articlesList.innerHTML = '';
  items.forEach(it=>{
    const card = document.createElement('article');
    card.className = 'article-card';
    if (it.cover_url){
      const img = document.createElement('img');
      img.className = 'article-cover';
      img.src = it.cover_url;
      img.alt = it.title || 'cover';
      card.appendChild(img);
    }
    const body = document.createElement('div');
    body.className = 'article-body';
    const h = document.createElement('h3');
    h.className = 'article-title';
    h.textContent = it.title || 'Без названия';
    const meta = document.createElement('div');
    meta.className = 'article-meta';
    meta.textContent = `${it.author||'anon'} • ${new Date(it.ts||Date.now()).toLocaleString()}`;
    const excerpt = document.createElement('p');
    excerpt.className = 'article-excerpt';
    excerpt.textContent = it.excerpt || (it.content ? String(it.content).slice(0,140)+'…' : '');

    body.appendChild(h);
    body.appendChild(meta);
    body.appendChild(excerpt);
    body.appendChild(articleCardActions(it.id));
    card.appendChild(body);
    articlesList.appendChild(card);
  });
}

async function openArticle(id){
  try{
    const res = await fetch(`/api/art/lore/articles/${id}/`, { credentials:'same-origin' });
    if(!res.ok) return;
    const data = await res.json();
    const it = data.item || {};
    currentArticleId = it.id;

    if (it.cover_url){ viewCover.src = it.cover_url; viewCover.style.display = ''; } else { viewCover.style.display = 'none'; }
    viewTitle.textContent = it.title || 'Без названия';
    viewMeta.textContent  = `${it.author||'anon'} • ${new Date(it.ts||Date.now()).toLocaleString()}`;
    viewContent.innerHTML = '';
    String(it.content||'').split(/\n{2,}/).forEach(par=>{
      const p = document.createElement('p'); p.textContent = par.trim(); viewContent.appendChild(p);
    });
    viewGallery.innerHTML = '';
    (it.gallery||[]).forEach(url=>{ const img = document.createElement('img'); img.src = url; img.alt='illustration'; viewGallery.appendChild(img); });

    articlesList.style.display = 'none';
    articleView.style.display = '';
    await loadArticleComments(currentArticleId);
    if (location.hash !== '#lore'){ history.pushState(null,'','#lore'); activateTab('lore'); }
  }catch(e){ console.warn('openArticle error', e); }
}

backToList?.addEventListener('click', ()=>{
  articleView.style.display = 'none';
  articlesList.style.display = '';
  currentArticleId = null;
});

/* Удаление статьи */
deleteArticleBtn?.addEventListener('click', ()=>{
  if (!currentArticleId) return;
  confirmDeleteArticle(currentArticleId, /*fromView*/true);
});
async function confirmDeleteArticle(id, fromView=false){
  const ok = confirm('Удалить статью безвозвратно?');
  if (!ok) return;
  try{
    const res = await fetch(`/api/art/lore/articles/${id}/`, {
      method:'DELETE',
      headers:{ 'X-CSRFToken': CSRF() },
      credentials:'same-origin'
    });
    if (res.ok){
      if (fromView || currentArticleId === id){
        articleView.style.display = 'none';
        articlesList.style.display = '';
        currentArticleId = null;
      }
      await loadArticles();
    } else {
      alert('Не удалось удалить статью');
    }
  }catch(e){ alert('Ошибка сети при удалении'); }
}

/* Комментарии к статье */
const commentForm = document.getElementById('commentForm');
const commentsBox = document.getElementById('commentList');

async function loadArticleComments(articleId){
  try{
    const res = await fetch(`/api/art/lore/articles/${articleId}/comments`, { credentials:'same-origin' });
    if(!res.ok) return;
    const data = await res.json();
    const items = Array.isArray(data) ? data : (Array.isArray(data.items) ? data.items : []);
    renderComments(items);
  }catch(e){}
}
function renderComments(items){
  if (!commentsBox) return;
  commentsBox.innerHTML = '';
  if (!items.length){
    const empty = document.createElement('div'); empty.className='muted'; empty.textContent='Пока нет комментариев'; commentsBox.appendChild(empty); return;
  }
  items.forEach(it=>{
    const wrap = document.createElement('div'); wrap.className='comment-item';
    const meta = document.createElement('div'); meta.className='comment-meta'; meta.textContent = `${it.author||'anon'} • ${new Date(it.ts||Date.now()).toLocaleString()}`;
    const text = document.createElement('div'); text.textContent = it.content || '';
    wrap.appendChild(meta); wrap.appendChild(text); commentsBox.appendChild(wrap);
  });
}
commentForm?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  if (!currentArticleId) return;
  const content = commentForm.querySelector('[name="content"]').value.trim();
  if (!content) return;
  try{
    const res = await fetch(`/api/art/lore/articles/${currentArticleId}/comments`, {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'X-CSRFToken': CSRF() },
      credentials:'same-origin',
      body: JSON.stringify({ content })
    });
    if (res.ok){ commentForm.reset(); loadArticleComments(currentArticleId); }
    else { alert('Не удалось отправить комментарий'); }
  }catch(e){ alert('Ошибка сети'); }
});

/* Публикация статьи (с файлами) */
galleryInput?.addEventListener('change', ()=>{
  galleryPreview.innerHTML = '';
  const files = Array.from(galleryInput.files||[]);
  files.forEach(f=>{
    const url = URL.createObjectURL(f);
    const d = document.createElement('div'); d.className='thumb'; d.style.backgroundImage = `url('${url}')`;
    galleryPreview.appendChild(d);
  });
});
articleForm?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const fd = new FormData(articleForm);
  try{
    const res = await fetch('/api/art/lore/articles', {
      method:'POST',
      headers:{ 'X-CSRFToken': CSRF() },
      credentials:'same-origin',
      body: fd
    });
    if (res.ok){
      articleForm.reset(); galleryPreview.innerHTML = '';
      await loadArticles();
      const topBar = document.querySelector('.site-topbar'); const toolbar = document.querySelector('.toolbar');
      const y = (topBar?.offsetHeight || 0) + (toolbar?.offsetHeight || 0) + 8;
      window.scrollTo({ top:y, behavior:'smooth' });
    } else {
      alert('Не удалось опубликовать статью');
    }
  }catch(e){ alert('Ошибка сети'); }
});

/* ===== МЕДИА ===== */
const mediaForm = document.getElementById('mediaForm');
const mediaList = document.getElementById('mediaList');

function renderMedia(items){
  if (!mediaList) return;
  mediaList.innerHTML = '';
  items.forEach(it=>{
    const card = document.createElement('div');
    card.className = 'card';

    const headWrap = document.createElement('div');
    headWrap.style.display = 'flex';
    headWrap.style.alignItems = 'center';
    headWrap.style.justifyContent = 'space-between';
    const head = document.createElement('h2');
    head.textContent = it.title || `[${it.kind}]`;
    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.gap = '8px';

    const delBtn = document.createElement('button');
    delBtn.className = 'btn danger';
    delBtn.textContent = 'Удалить';
    delBtn.title = 'Удалить медиа';
    delBtn.addEventListener('click', ()=> deleteMedia(it.id));

    actions.appendChild(delBtn);
    headWrap.appendChild(head);
    headWrap.appendChild(actions);
    card.appendChild(headWrap);

    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = it.description || '';
    card.appendChild(p);

    if (it.kind === 'image'){
      const img = document.createElement('img');
      img.src = it.url; img.alt = it.title || 'image';
      card.appendChild(img);
    } else if (it.kind === 'video'){
      const v = document.createElement('video');
      v.controls = true; v.src = it.url;
      card.appendChild(v);
    } else if (it.kind === 'audio'){
      const a = document.createElement('audio');
      a.controls = true; a.src = it.url;
      card.appendChild(a);
    }
    mediaList.appendChild(card);
  });
}

async function deleteMedia(id){
  const ok = confirm('Удалить медиа безвозвратно?');
  if (!ok) return;
  try{
    const res = await fetch(`/api/art/media/${id}/`, {
      method:'DELETE',
      headers:{ 'X-CSRFToken': CSRF() },
      credentials:'same-origin'
    });
    if (res.ok){
      await loadMedia();
    } else if (res.status === 403){
      alert('Недостаточно прав для удаления медиа.');
    } else {
      alert('Не удалось удалить медиа');
    }
  }catch(e){ alert('Ошибка сети при удалении медиа'); }
}

mediaForm?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  const fd = new FormData(mediaForm);
  try{
    const res = await fetch('/api/art/media', { method:'POST', headers:{ 'X-CSRFToken': CSRF() }, credentials:'same-origin', body: fd });
    if (res.ok){ mediaForm.reset(); loadMedia(); } else { alert('Не удалось загрузить медиа'); }
  }catch(e){ alert('Ошибка сети при загрузке медиа'); }
});

/* ===== ПАПКИ: МЕДИА ===== */
const mediaFoldersList = document.getElementById('mediaFoldersList');
const mediaFolderForm  = document.getElementById('mediaFolderForm');
const mediaFolderSelect = document.getElementById('mediaFolderSelect');
const createMediaFolderBtn = document.getElementById('createMediaFolderBtn');
let currentMediaFolderId = null;

async function loadMediaFolders(){
  try{
    const res = await fetch('/api/art/media/folders', { credentials:'same-origin', cache:'no-store' });
    if(!res.ok) return;
    const data = await res.json();

    const items = Array.isArray(data) ? data
      : (Array.isArray(data.items) ? data.items
      : (Array.isArray(data.results) ? data.results : []));

    renderMediaFolders(items);

    if (mediaFolderSelect){
      mediaFolderSelect.innerHTML =
        '<option value="">Без папки</option>' +
        items.map(f => `<option value="${String(f.id)}">${String(f.title||'Без названия')}</option>`).join('');
    }
  }catch(e){ console.warn('loadMediaFolders error', e); }
}


function renderMediaFolders(items){
  try{
    if (!mediaFoldersList) return;
    mediaFoldersList.innerHTML = '';

    const allBtn = document.createElement('div');
    allBtn.className = 'folder-card' + (currentMediaFolderId===null ? ' active' : '');
    allBtn.textContent = 'Все медиа';
    allBtn.onclick = ()=>{ currentMediaFolderId = null; loadMedia(); renderMediaFolders(items); };
    mediaFoldersList.appendChild(allBtn);

    (items || []).forEach(it=>{
      const row = document.createElement('div');
      row.className = 'folder-card' + (currentMediaFolderId===it.id ? ' active' : '');

      const span = document.createElement('span');
      span.textContent = it?.title ?? 'Без названия';
      row.appendChild(span);

      const actions = document.createElement('div');
      actions.className = 'folder-actions';
      const delBtn = document.createElement('button');
      delBtn.className = 'btn danger';
      delBtn.textContent = '×';
      delBtn.title = 'Удалить папку';
      delBtn.onclick = (e)=>{ e.stopPropagation(); deleteMediaFolder(it.id); };
      actions.appendChild(delBtn);
      row.appendChild(actions);

      row.onclick = ()=>{ currentMediaFolderId = it.id; loadMedia(); renderMediaFolders(items); };
      mediaFoldersList.appendChild(row);
    });
  }catch(err){
    console.error('renderMediaFolders failed', err);
  }
}

async function deleteMediaFolder(id){
  const ok = confirm('Удалить папку медиа? Файлы останутся без папки.');
  if (!ok) return;
  try{
    const res=await fetch(`/api/art/media/folders/${id}/`,{
      method:'DELETE', headers:{'X-CSRFToken':CSRF()}, credentials:'same-origin'
    });
    if(res.ok){
      if(currentMediaFolderId===id) currentMediaFolderId=null;
      await loadMediaFolders();
      await loadMedia();
    } else {
      alert('Не удалось удалить медиа-папку');
    }
  }catch(e){ alert('Ошибка сети при удалении'); }
}

/* Создание папки Медиа — предотвращаем перезагрузку */
mediaFolderForm?.addEventListener('submit', (e)=>{ e.preventDefault(); e.stopPropagation(); });
createMediaFolderBtn?.addEventListener('click', async (e)=>{
  e.preventDefault(); e.stopPropagation();
  const input = mediaFolderForm?.querySelector('input[name="title"]');
  const title = (input?.value || '').trim();
  if (!title) { alert('Введите название папки'); return; }
  try{
    const res = await fetch('/api/art/media/folders', {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'X-CSRFToken': CSRF() },
      credentials:'same-origin',
      body: JSON.stringify({ title })
    });
    if (!res.ok){
      const t = await res.text().catch(()=> '');
      alert('Не удалось создать медиа-папку: '+ (t || res.status));
      return;
    }
    if (input) input.value = '';
    await loadMediaFolders();
  }catch(err){ alert('Ошибка сети при создании медиа-папки'); }
});

/* Модифицированная загрузка медиа с фильтром папки и типом */
async function loadMedia(kind=''){
  try{
    let url = '/api/art/media';
    const q = [];
    if(kind) q.push(`kind=${encodeURIComponent(kind)}`);
    if(currentMediaFolderId) q.push(`folder_id=${encodeURIComponent(currentMediaFolderId)}`);
    if(q.length) url += '?' + q.join('&');

    const res = await fetch(url, { credentials:'same-origin' });
    if (!res.ok) return;
    const data = await res.json();
    const items = Array.isArray(data) ? data : (Array.isArray(data.items) ? data.items : []);
    renderMedia(items);
  }catch(e){ console.warn('loadMedia error', e); }
}

/* ===== Инициализация ===== */
awaitableInit();
async function awaitableInit(){
  try{
    await Promise.allSettled([loadFolders(), loadMediaFolders()]);
    await Promise.allSettled([loadArticles(), loadMedia()]);
  }catch(e){}
}

/* ===== Realtime ===== */
(function connectArtWS(){
  try{
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws/art`);
    ws.onmessage = (ev)=>{
      try{
        const msg = JSON.parse(ev.data);
        if (msg.type === 'media'){ loadMedia(); }
        else if (msg.type === 'lore_topic' || msg.type === 'article'){ loadArticles(); }
        else if (msg.type === 'lore_comment' && currentArticleId && String(msg.item.article_id)===String(currentArticleId)){
          loadArticleComments(currentArticleId);
        }
        else if (msg.type === 'lore_folder'){ loadFolders(); }
        else if (msg.type === 'media_folder'){ loadMediaFolders(); }
      }catch(e){}
    };
    ws.onclose = ()=> setTimeout(connectArtWS, 1500);
  }catch(e){}
})();

document.addEventListener('click', (e)=>{
  const btn = e.target.closest('[data-collapse]');
  if(!btn) return;
  const sel = btn.getAttribute('data-collapse');
  const box = document.querySelector(sel);
  if(!box) return;

  const isCollapsed = box.classList.toggle('collapsed');
  btn.setAttribute('aria-expanded', String(!isCollapsed));
  btn.textContent = isCollapsed ? 'Развернуть' : 'Свернуть';
});
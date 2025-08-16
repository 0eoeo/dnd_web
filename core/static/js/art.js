/* ===== BOOT ===== */
console.log('art.js boot');
if (window.__ART_BOOTED__) {
  console.warn('art.js duplicate load — skipping');
  throw new Error('duplicate-art-js');
}
window.__ART_BOOTED__ = true;

/* ===== УТИЛИТЫ ===== */
import { CSRF } from './utils.js';
import { API } from './config.js';

function resolveUrl(u){
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;  // абсолютный
  if (u.startsWith('/')) return u;        // от корня домена
  return '/' + String(u).replace(/^\/+/, '');
}

function q(id){ return document.getElementById(id); }

/* ===== ВКЛАДКИ (Разделы) ===== */
const panels = {
  lore:   q('tab-lore'),
  images: q('tab-images'),
  video:  q('tab-video'),
  music:  q('tab-music'),
};

function ensurePanelsExist(){
  const missing = Object.entries(panels).filter(([k,v])=>!v).map(([k])=>k);
  if (missing.length){
    console.error('Missing tab panels:', missing.join(', '));
  }
}

function activateTab(name){
  let found = false;

  // Переключение панелей
  Object.entries(panels).forEach(([k, node])=>{
    if (!node) return;
    const isActive = (k === name);
    node.classList.toggle('active', isActive);
    if (isActive) found = true;
  });

  // Подсветка активных ссылок/кнопок
  document.querySelectorAll('.section-links a.topnav-link').forEach(a=>{
    const h = (a.getAttribute('href')||'').replace('#','');
    a.classList.toggle('active', h===name);
  });
  document.querySelectorAll('.btn[data-jump]').forEach(b=>{
    const n = (b.dataset.jump||'').replace('#','');
    b.classList.toggle('active', n===name);
  });

  // Fallback на "lore", если панель не найдена
  if (!found && panels.lore){
    Object.values(panels).forEach(n=> n?.classList.remove('active'));
    panels.lore.classList.add('active');
    name = 'lore';
  }

  // Прокрутка под шапку
  const topBar = document.querySelector('.site-topbar');
  const toolbar = document.querySelector('.toolbar');
  const y = (topBar?.offsetHeight || 0) + (toolbar?.offsetHeight || 0) + 8;
  window.scrollTo({ top:y, behavior:'smooth' });
}

function tabFromHash(){
  const h = (location.hash||'').slice(1);
  return ['lore','images','video','music'].includes(h) ? h : 'lore';
}

function goTab(name){
  const current = (location.hash||'').slice(1);
  if (current !== name) history.pushState(null,'',`#${name}`);
  activateTab(name);
}

/* ===== ИНИЦИАЛИЗАЦИЯ ВКЛАДОК ПОСЛЕ DOM ===== */
document.addEventListener('DOMContentLoaded', () => {
  ensurePanelsExist();

  // Кнопки в тулбаре
  document.querySelectorAll('.btn[data-jump]').forEach(b=>{
    b.addEventListener('click', (e)=>{
      e.preventDefault();
      const raw = b.dataset.jump || '';
      const name = raw.startsWith('#') ? raw.slice(1) : raw;
      if (!['lore','images','video','music'].includes(name)) return;
      goTab(name);
    });
  });

  // Линки в сайдбаре
  document.querySelectorAll('.section-links a.topnav-link').forEach(a=>{
    a.addEventListener('click', (e)=>{
      e.preventDefault();
      const raw = a.getAttribute('href') || '';
      const name = raw.startsWith('#') ? raw.slice(1) : raw;
      if (!['lore','images','video','music'].includes(name)) return;
      goTab(name);
    });
  });

  // Back/Forward или прямой ввод хеша
  window.addEventListener('hashchange', ()=> activateTab(tabFromHash()));

  // Первичная активация
  activateTab(tabFromHash());

  // Запускаем основную логику
  bootContent();
});

/* ===== Основная логика: Лор/Медиа ===== */
let currentArticleId = null;
let currentFolderId = null;
let currentMediaFolderId = null;

function bootContent(){
  /* ===== ЛОР: СТАТЬИ ===== */
  const articlesList = q('articlesList');
  const articleForm  = q('articleForm');
  const galleryInput = articleForm?.querySelector('input[name="gallery"]');
  const galleryPreview = q('galleryPreview');

  const articleView  = q('articleView');
  const backToList   = q('backToList');
  const deleteArticleBtn = q('deleteArticleBtn');

  const viewCover    = q('viewCover');
  const viewTitle    = q('viewTitle');
  const viewMeta     = q('viewMeta');
  const viewContent  = q('viewContent');
  const viewGallery  = q('viewGallery');

  const folderForm  = q('folderForm');
  const articleFolderSelect = q('articleFolderSelect');
  const createLoreFolderBtn = q('createLoreFolderBtn');

  async function loadFolders(){
    try{
      const res = await fetch(API.loreFolders, { credentials:'same-origin', cache:'no-store' });
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
    const box = q('foldersList');
    if (!box){ console.error('foldersList not found in DOM'); return; }

    box.innerHTML = '';

    if (!items || !items.length){
      const empty = document.createElement('div');
      empty.className = 'muted';
      empty.textContent = 'Папок пока нет';
      box.appendChild(empty);
      return;
    }

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
      const res = await fetch(API.loreFolder(id), {
        method:'DELETE',
        headers: { 'X-CSRFToken': CSRF() },
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

  folderForm?.addEventListener('submit', (e)=>{ e.preventDefault(); e.stopPropagation(); });
  createLoreFolderBtn?.addEventListener('click', async (e)=>{
    e.preventDefault(); e.stopPropagation();
    const input = folderForm?.querySelector('input[name="title"]');
    const title = (input?.value || '').trim();
    if (!title) { alert('Введите название папки'); return; }
    try{
      const res = await fetch(API.loreFolders, {
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

  async function loadArticles(){
    try{
      const url = currentFolderId
        ? `${API.articles}?folder_id=${encodeURIComponent(currentFolderId)}`
        : API.articles;
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
      if (it.cover || it.cover_url){
        const img = document.createElement('img');
        img.className = 'article-cover';
        img.src = resolveUrl(it.cover || it.cover_url);
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
      const ts = it.created_at || it.ts;
      meta.textContent = `${it.author||'anon'} • ${new Date(ts||Date.now()).toLocaleString()}`;
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
      const res = await fetch(API.article(id), { credentials:'same-origin' });
      if(!res.ok) return;
      const data = await res.json();
      const it = data?.item || data || {};
      currentArticleId = it.id;

      if (it.cover || it.cover_url){
        viewCover.src = resolveUrl(it.cover || it.cover_url);
        viewCover.style.display = '';
      } else { viewCover.style.display = 'none'; }
      viewTitle.textContent = it.title || 'Без названия';
      const ts = it.created_at || it.ts;
      viewMeta.textContent  = `${it.author||'anon'} • ${new Date(ts||Date.now()).toLocaleString()}`;
      viewContent.innerHTML = '';
      String(it.content||'').split(/\n{2,}/).forEach(par=>{
        const p = document.createElement('p'); p.textContent = par.trim(); viewContent.appendChild(p);
      });
      viewGallery.innerHTML = '';
      (it.images||it.gallery||[]).forEach(x=>{
        const url = resolveUrl(x?.image || x?.url || x);
        if (!url) return;
        const img = document.createElement('img'); img.src = url; img.alt='illustration';
        viewGallery.appendChild(img);
      });

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

  deleteArticleBtn?.addEventListener('click', ()=>{
    if (!currentArticleId) return;
    confirmDeleteArticle(currentArticleId, true);
  });

  async function confirmDeleteArticle(id, fromView=false){
    const ok = confirm('Удалить статью безвозвратно?');
    if (!ok) return;
    try{
      const res = await fetch(API.article(id), {
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

  /* Комментарии */
  const commentForm = q('commentForm');
  const commentsBox = q('commentList');

  async function loadArticleComments(articleId){
    try{
      const res = await fetch(API.articleComments(articleId), { credentials:'same-origin' });
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
      const ts = it.created_at || it.ts;
      const meta = document.createElement('div'); meta.className='comment-meta'; meta.textContent = `${it.author||'anon'} • ${new Date(ts||Date.now()).toLocaleString()}`;
      const text = document.createElement('div'); text.textContent = it.content || '';
      wrap.appendChild(meta); wrap.appendChild(text); commentsBox.appendChild(wrap);
    });
  }

  commentForm?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  if (!currentArticleId) {
    alert('Не выбрана статья для комментария');
    return;
  }

  const contentEl = commentForm.querySelector('[name="content"]');
  const content = (contentEl?.value || '').trim();
  if (!content) return;

  try{
    const fd = new FormData();
    fd.append('content', content);
    fd.append('article', String(currentArticleId)); // ВАЖНО: явная привязка к статье

    const res = await fetch(API.articleComments(currentArticleId), {
      method: 'POST',
      headers: { 'X-CSRFToken': CSRF() }, // без Content-Type — браузер сам проставит boundary
      credentials: 'same-origin',
      body: fd
    });

    if (res.ok){
      commentForm.reset();
      await loadArticleComments(currentArticleId);
    } else {
      const text = await res.text().catch(()=> '');
      alert('Не удалось отправить комментарий: ' + (text || res.status));
    }
  }catch(err){
    alert('Ошибка сети при отправке комментария');
  }
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
      const res = await fetch(API.articles, {
        method:'POST',
        headers:{ 'X-CSRFToken': CSRF() },
        credentials:'same-origin',
        body: fd
      });
      if (res.ok){
        articleForm.reset();
        galleryPreview.innerHTML = '';
        currentFolderId = null;
        await loadArticles();
        if (location.hash !== '#lore'){ history.pushState(null,'','#lore'); }
        activateTab('lore');
      } else {
        const t = await res.text().catch(()=> '');
        alert('Не удалось опубликовать статью' + (t ? `: ${t}` : ''));
      }
    }catch(e){ alert('Ошибка сети'); }
  });

  /* ===== МЕДИА ===== */
  const mediaForm = q('mediaForm');
  const mediaList = q('mediaList');

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
        img.src = resolveUrl(it.url || it.image);
        img.alt = it.title || 'image';
        card.appendChild(img);
      } else if (it.kind === 'video'){
        const v = document.createElement('video');
        v.controls = true; v.src = resolveUrl(it.url);
        card.appendChild(v);
      } else if (it.kind === 'audio'){
        const a = document.createElement('audio');
        a.controls = true; a.src = resolveUrl(it.url);
        card.appendChild(a);
      }
      mediaList.appendChild(card);
    });
  }

  async function deleteMedia(id){
    const ok = confirm('Удалить медиа безвозвратно?');
    if (!ok) return;
    try{
      const res = await fetch(API.mediaItem(id), {
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
      const res = await fetch(API.media, {
        method:'POST',
        headers:{ 'X-CSRFToken': CSRF() },
        credentials:'same-origin',
        body: fd
      });
      if (res.ok){
        mediaForm.reset();
        currentMediaFolderId = null;
        await loadMedia();
      } else {
        const t = await res.text().catch(()=> '');
        alert('Не удалось загрузить медиа' + (t ? `: ${t}` : ''));
      }
    }catch(e){ alert('Ошибка сети при загрузке медиа'); }
  });

  const mediaFoldersList = q('mediaFoldersList');
  const mediaFolderForm  = q('mediaFolderForm');
  const mediaFolderSelect = q('mediaFolderSelect');
  const createMediaFolderBtn = q('createMediaFolderBtn');

  async function loadMediaFolders(){
    try{
      const res = await fetch(API.mediaFolders, { credentials:'same-origin', cache:'no-store' });
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
      const res=await fetch(API.mediaFolder(id),{
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

  mediaFolderForm?.addEventListener('submit', (e)=>{ e.preventDefault(); e.stopPropagation(); });
  createMediaFolderBtn?.addEventListener('click', async (e)=>{
    e.preventDefault(); e.stopPropagation();
    const input = mediaFolderForm?.querySelector('input[name="title"]');
    const title = (input?.value || '').trim();
    if (!title) { alert('Введите название папки'); return; }
    try{
      const res = await fetch(API.mediaFolders, {
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

  async function loadMedia(kind=''){
    try{
      let url = API.media;
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

  // Стартовые загрузки
  (async ()=>{
    try{
      await Promise.allSettled([loadFolders(), loadMediaFolders()]);
      await Promise.allSettled([loadArticles(), loadMedia()]);
    }catch(e){}
  })();

  // Realtime
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

  // Collapse
  document.addEventListener('click', (e)=>{
    const btn = e.target.closest('[data-collapse]');
    if(!btn) return;
    const sel = btn.getAttribute('data-collapse');
    if (!sel) return;
    const box = document.querySelector(sel);
    if(!box) return;

    box.classList.toggle('collapsed');
    const collapsed = box.classList.contains('collapsed');
    btn.setAttribute('aria-expanded', String(!collapsed));
    btn.textContent = collapsed ? 'Развернуть' : 'Свернуть';
  });
}

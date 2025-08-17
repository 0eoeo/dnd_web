// core/static/js/spells.js
import { el, normalizeName, LONG_HINT } from './utils.js';
import { getSpellsCache, loadSpells, findSpellBySlugOrName, fetchSpellDetail } from './spells_data.js';
import { openDiceForSpell } from './dice.js';
import { FIELD_GROUPS } from './config.js';

// Контейнер для карточек листа
export const cards = document.getElementById('cards');

/* =========================
   Хелперы слотов
   ========================= */
function getSlotIdsForLevel(lvl){
  const N = 18 + lvl;
  return { totalName: `SlotsTotal ${N}`, remainingName: `SlotsRemaining ${N}` };
}
function getInputByDataName(name){ return document.querySelector(`[data-name="${CSS.escape(name)}"]`); }
function getIntValueFromDataName(name){
  const node = getInputByDataName(name); if(!node) return null;
  const n = parseInt(String(node.value || '').trim(), 10);
  return Number.isFinite(n) ? n : null;
}
function setValueByDataName(name, value, fireEvents=true){
  const node = getInputByDataName(name); if(!node) return;
  node.value = String(value);
  if (fireEvents){
    node.dispatchEvent(new Event('input', { bubbles:true }));
    node.dispatchEvent(new Event('change', { bubbles:true }));
  }
}

/* =========================
   Долгий отдых
   ========================= */
export function handleLongRest(){
  const hpMaxEl = document.querySelector('#f_HPMax');
  const hpCurEl = document.querySelector('#f_HPCurrent');
  if (hpMaxEl && hpCurEl){
    const max = parseInt(String(hpMaxEl.value||'').trim(),10);
    if (Number.isFinite(max)){
      hpCurEl.value = String(max);
      hpCurEl.dispatchEvent(new Event('input',{bubbles:true}));
      hpCurEl.dispatchEvent(new Event('change',{bubbles:true}));
    }
  }
  for(let lvl=1; lvl<=9; lvl++){
    const { totalName, remainingName } = getSlotIdsForLevel(lvl);
    const total = getIntValueFromDataName(totalName);
    if (total != null) setValueByDataName(remainingName, total);
  }
  try{
    const toast = document.createElement('div');
    toast.textContent = 'Долгий отдых: хиты и ячейки восстановлены';
    toast.className = 'toast success';
    Object.assign(toast.style, {
      position:'fixed', right:'16px', bottom:'16px',
      background:'#1e293b', color:'#fff', padding:'10px 14px',
      borderRadius:'6px', boxShadow:'0 4px 12px rgba(0,0,0,.2)', zIndex:9999
    });
    document.body.appendChild(toast);
    setTimeout(()=> toast.remove(), 2400);
  }catch(_){}
}

/* =========================
   Парсинг магии из полей
   ========================= */
export function slotLevelFromName(n){
  const m = /^Slots(?:Total|Remaining)\s+(\d+)$/.exec(n);
  if(!m) return null;
  const id = Number(m[1]); const lvl = id - 18;
  return (lvl>=1 && lvl<=9) ? lvl : null;
}
export function parseMagic(fields){
  const EXPLICIT = { 1014:0,1016:0,1017:0,1018:0, 1015:1,1023:1,1024:1,1025:1,1026:1, 1046:2,1034:2,1035:2, 1048:3,1047:3 };
  const toInt = (s)=>{ const n = parseInt(s,10); return Number.isFinite(n)? n:null; };
  const inferSpellLevel = (id)=>{
    if(id in EXPLICIT) return EXPLICIT[id];
    const hundreds = Math.floor(id / 100);
    let lvl = hundreds - 1;
    if(lvl < 0) lvl = 0;
    if(lvl > 9) lvl = 9;
    return lvl;
  };
  const magic = { levels: Array.from({length:10}, ()=>({ slots:{}, spells:[] })), unassigned:[] };
  for(const f of fields){
    const name = normalizeName(f.name);
    const value = (f.value==null? '' : String(f.value));
    if(name.startsWith('SlotsTotal ') || name.startsWith('SlotsRemaining ')){
      if(!value.trim()) continue;
      const lvl = slotLevelFromName(name);
      if(lvl!=null){
        if(name.startsWith('SlotsTotal ')) magic.levels[lvl].slots.total     = { name, label:`Ячейки ур.${lvl} — всего`,   value };
        else                               magic.levels[lvl].slots.remaining = { name, label:`Ячейки ур.${lvl} — осталось`, value };
      }
      continue;
    }
    if(name.startsWith('Spells ')){
      const parts = name.split(' ');
      const id = toInt(parts[1]);
      const val = value.trim();
      if(!val) continue;
      if(id==null){ magic.unassigned.push({ name, value: val }); continue; }
      const lvl = inferSpellLevel(id);
      magic.levels[lvl].spells.push({ name, value: val });
      continue;
    }
  }
  return magic;
}

/* =========================
   Input builders
   ========================= */
export function makeInput(name, label, isLong=false, layout='three'){
  const cls = (name==='__AVATAR__') ? 'two'
           : (layout==='four' ? 'four'
           : (layout==='two' ? 'two'
           : (layout==='stack' ? 'stack' : 'three')));
  const wrap = el('div',{class:`field ${cls}`});
  const id = `f_${name.replace(/[^a-z0-9]+/gi,'_')}`;
  wrap.appendChild(el('label',{for:id}, label || name));

  if (name === '__AVATAR__'){
    const placeholderSvg = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><rect width='100' height='100' fill='%2310151f'/><circle cx='50' cy='38' r='18' fill='%232a3348'/><rect x='20' y='62' width='60' height='26' rx='13' fill='%232a3348'/></svg>";
    const holder = el('div',{class:'avatar', id:'avatarHolder'},
      el('div',{ class:'preview', id:'avatarPreview', style:`background-image:url('${placeholderSvg}')` }),
      el('div',{class:'meta'},
        el('label',{class:'btn ghost', for:'avatarFile'},'Выбрать файл'),
        el('small',{style:'padding-left:10px;'},'PNG/JPG')
      ),
      el('input',{id:'avatarFile', type:'file', accept:'image/*', hidden:true})
    );
    wrap.appendChild(holder);
    return wrap;
  }

  const input = (isLong || LONG_HINT.has(name))
    ? el('textarea',{id, 'data-name':name, placeholder: label || name})
    : el('input',{id, 'data-name':name, type:'text', placeholder: label || name});

  wrap.appendChild(input);
  return wrap;
}

/* =========================
   Строка заклинания
   ========================= */
export function makeSpellLine(name, value){
  let prefillSlug = "", prefillName = "";
  const found = findSpellBySlugOrName(value);
  if (found){ prefillSlug = found.slug; prefillName = found.name; }
  else if (value){ prefillName = value; }

  // Обёртка одной строки — делаем блочным контейнером во всю ширину
  const wrap  = el('div',{class:'spell-line'});

  // Комбо-поле выбора заклинания
  const combo  = el('div',{class:'combo'});
  const hidden = el('input',{'data-name': name || '', type:'hidden', value: prefillSlug});
  const input  = el('input',{class:'combo-input', type:'text', placeholder:'Выберите заклинание…', value: prefillName});
  const list   = el('div',{class:'combo-list'});

  function renderList(filter=""){
    list.innerHTML = "";
    const f = (filter||'').trim().toLowerCase();
    let items = getSpellsCache();
    if (f) items = items.filter(s => s.name.toLowerCase().includes(f) || s.slug.toLowerCase().includes(f));
    if (!items.length){ list.appendChild(el('div',{class:'combo-item'}, "Ничего не найдено")); return; }
    for(const s of items){
      const row = el('div',{class:'combo-item'}, s.name, el('span',{class:'muted'}, s.slug));
      row.addEventListener('mousedown', e => e.preventDefault());
      row.addEventListener('click', ()=>{
        input.value = s.name;
        hidden.value = s.slug;
        combo.classList.remove('open');

        // Сброс подробностей при выборе нового спелла
        detailBox.classList.remove('show');
        detailBox.innerHTML = "";
        moreBtn.textContent = 'Подробнее';

        // Если панель кубов уже открыта — перерисуем её для нового заклинания
        if (diceBtn.dataset.open === '1'){
          openDiceForSpell({slug: hidden.value, name: input.value}, wrap);
        }
      });
      list.appendChild(row);
    }
  }

  async function openAndRender(){
    combo.classList.add('open'); renderList(input.value);
    if (!getSpellsCache().length){
      try{
        await loadSpells();
        if (combo.classList.contains('open')) renderList(input.value);
      }catch(_){}
    }
  }
  input.addEventListener('focus', openAndRender);
  input.addEventListener('input', openAndRender);
  document.addEventListener('click', (e)=>{ if(!combo.contains(e.target)) combo.classList.remove('open'); });

  combo.appendChild(hidden); combo.appendChild(input); combo.appendChild(list);

  // Кнопки и блок "подробности"
  const diceBtn   = el('button',{class:'btn success', type:'button'}, 'Использовать');
  const moreBtn   = el('button',{class:'spell-more-btn', type:'button'}, 'Подробнее');
  const delBtn    = el('button',{class:'spell-del-btn',  type:'button'}, 'Удалить');
  const detailBox = el('div',{class:'spell-detail'});

  // Использовать (панель кубов)
  diceBtn.addEventListener('click', ()=>{
    const isOpen = diceBtn.dataset.open === '1';
    if (isOpen){
      const pnl = wrap.querySelector('.dice-panel'); if (pnl) pnl.remove();
      diceBtn.dataset.open = '0'; diceBtn.textContent = 'Использовать';
    } else {
      const slug = hidden.value || (findSpellBySlugOrName(input.value)?.slug || '');
      openDiceForSpell({slug, name: input.value}, wrap);
      diceBtn.dataset.open = '1'; diceBtn.textContent = 'Скрыть';
    }
  });

  // Надёжное переключение подробностей (Подробнее/Скрыть)
  moreBtn.addEventListener('click', async ()=>{
    const isShown = detailBox.classList.contains('show');

    // Сворачивание
    if (isShown){
      detailBox.classList.remove('show');
      detailBox.innerHTML = '';
      moreBtn.textContent = 'Подробнее';
      return;
    }

    // Разворачивание
    const picked = hidden.value || (findSpellBySlugOrName(input.value)?.slug || "");
    detailBox.classList.add('show');
    moreBtn.textContent = 'Скрыть';

    if(!picked){
      detailBox.innerHTML = '<em>Сначала выберите заклинание из списка</em>';
      return;
    }

    // Плейсхолдер и защита от гонок
    const reqId = Date.now();
    detailBox.dataset.reqId = String(reqId);
    detailBox.innerHTML = '<em>Загрузка…</em>';

    try{
      const data = await fetchSpellDetail(picked);
      if (!detailBox.classList.contains('show')) return; // уже закрыли
      if (detailBox.dataset.reqId !== String(reqId)) return; // пришёл старый ответ
      detailBox.innerHTML = data.html || '<em>Пусто</em>';
    }catch(_){
      if (detailBox.classList.contains('show')){
        detailBox.innerHTML = '<em>Ошибка запроса</em>';
      }
    }
  });

  // Удалить — чистим всё связанное состояние
  delBtn.addEventListener('click', ()=>{
    hidden.value = ''; input.value  = '';
    const pnl = wrap.querySelector('.dice-panel'); if (pnl) pnl.remove();
    diceBtn.dataset.open = '0'; diceBtn.textContent = 'Использовать';
    detailBox.classList.remove('show'); detailBox.innerHTML = ''; moreBtn.textContent = 'Подробнее';
  });

  // Сборка DOM: делаем плоскую вертикальную колонку
  wrap.appendChild(combo);
  wrap.appendChild(diceBtn);
  wrap.appendChild(moreBtn);
  wrap.appendChild(delBtn);
  wrap.appendChild(detailBox);

  if(!getSpellsCache().length){ loadSpells().catch(()=>{}); }
  return wrap;
}

/* =========================
   Поля ввода (общие)
   ========================= */
function fieldInput(name,label,wide='three',isText=false,value=''){
  const wrap = el('div',{class:`field ${wide}`}, el('label',{},label||name));
  const node = isText
    ? el('textarea', { 'data-name':name, placeholder:label||name })
    : el('input',    { 'data-name':name, type:'text', placeholder:label||name });
  if(value) node.value = value;
  wrap.appendChild(node);
  return wrap;
}

/* =========================
   Обёртка секции для Tabs/TOC
   ========================= */
function renderGroupSection(group) {
  const section = document.createElement('section');
  section.className = 'card sheet-section';
  section.id = `sec-${group.id}`;
  section.setAttribute('data-title', group.title);
  section.appendChild(el('h2', {}, group.title));
  const grid = el('div', { class: 'inline' });
  section.appendChild(grid);
  return { section, grid };
}

/* =========================
   Раздел "Магия"
   ========================= */
export function renderMagicCard(magic){
  const group = { id: 'magic', title: 'Магия' };
  const { section, grid: sectionGrid } = renderGroupSection(group);

  for (let lvl = 0; lvl <= 9; lvl++){
    const slots  = magic.levels[lvl].slots;
    const spells = magic.levels[lvl].spells;

    const lvlWrap = el('div', { class: 'group-lvl' });
    const head = el('div', { class: 'level-head' },
      el('div', { class: 'lvl-title' }, lvl === 0 ? 'Ур.0 — Заговоры' : `Ур.${lvl}`)
    );
    lvlWrap.appendChild(head);

    // Важно: убираем "сетку" вокруг блока заклинаний, чтобы строки шли вертикально
    const lvlGrid = el('div', { class: 'grid' });

    if (lvl >= 1) {
      const N = 18 + lvl;
      lvlGrid.appendChild(fieldInput(`SlotsTotal ${N}`,    `Ячейки ур.${lvl} — всего`,   'two', false, slots.total?.value || ''));
      lvlGrid.appendChild(fieldInput(`SlotsRemaining ${N}`,`Ячейки ур.${lvl} — осталось`,'two', false, slots.remaining?.value || ''));
    }

    // Контейнер для заклинаний: плоская колонка
    const spellBox = el('div', { class: 'stack spells-stack', id: `spellbox-l${lvl}` });

    (spells || []).forEach(sp => spellBox.appendChild(makeSpellLine(sp.name, sp.value)));

    // Генерация пустых строк до 10 штук
    const existing = (spells || []).length;
    for (let i = existing; i < 10; i++){
      const genId = (lvl + 1) * 100 + (i + 1);
      spellBox.appendChild(makeSpellLine(`Spells ${genId}`, ''));
    }

    // Вставляем
    lvlWrap.appendChild(lvlGrid);
    lvlWrap.appendChild(spellBox);
    sectionGrid.appendChild(lvlWrap);
  }

  if ((magic.unassigned || []).length){
    const unWrap = el('div', { class: 'group-lvl' });
    unWrap.appendChild(el('div', { class: 'level-head' }, el('div', { class: 'lvl-title' }, 'Нераспределённые заклинания')));

    const unStack = el('div', { class: 'stack spells-stack' });
    for (const sp of magic.unassigned){
      unStack.appendChild(makeSpellLine(sp.name, sp.value));
    }
    unWrap.appendChild(unStack);
    sectionGrid.appendChild(unWrap);
  }

  return section;
}

/* =========================
   Нельзя забыть: не-магические секции
   ========================= */
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

/* =========================
   Кнопка «Долгий отдых» в сайдбаре
   ========================= */
export function insertLongRestButton(){
  const sidebar = document.getElementById('diceSidebar');
  if (!sidebar) return;
  if (sidebar.querySelector('#btnLongRest')) return;
  const holder = document.createElement('div');
  holder.className = 'long-rest-holder';
  holder.style.display = 'flex';
  holder.style.gap = '8px';
  holder.style.marginBottom = '12px';
  const btn = document.createElement('button');
  btn.id = 'btnLongRest';
  btn.className = 'btn';
  btn.type = 'button';
  btn.textContent = 'Долгий отдых';
  btn.addEventListener('click', handleLongRest);
  holder.appendChild(btn);
  sidebar.prepend(holder);
}

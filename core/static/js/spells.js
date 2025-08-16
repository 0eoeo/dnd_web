// core/static/js/spells.js
import { el, normName } from './utils.js';
import { getSpellsCache, loadSpells, findSpellBySlugOrName, fetchSpellDetail } from './spells_data.js';
import { openDiceForSpell } from './dice.js';

// === НОВОЕ: помощники для слотов и долгого отдыха ===
function getLevelFromSlotsName(n){
  const m = /^Slots(?:Total|Remaining)\s+(\d+)$/.exec(n);
  if(!m) return null;
  const id = Number(m[1]);
  const lvl = id - 18;
  return (lvl>=1 && lvl<=9) ? lvl : null;
}

function getSlotIdsForLevel(lvl){
  // Ваша схема: N = 18 + lvl
  const N = 18 + lvl;
  return {
    totalName: `SlotsTotal ${N}`,
    remainingName: `SlotsRemaining ${N}`,
  };
}

function getInputByDataName(name){
  return document.querySelector(`[data-name="${CSS.escape(name)}"]`);
}

function getIntValueFromDataName(name){
  const el = getInputByDataName(name);
  if(!el) return null;
  const n = parseInt(String(el.value || '').trim(), 10);
  return Number.isFinite(n) ? n : null;
}

function setValueByDataName(name, value, fireEvents=true){
  const el = getInputByDataName(name);
  if(!el) return;
  el.value = String(value);
  if (fireEvents){
    el.dispatchEvent(new Event('input', { bubbles:true }));
    el.dispatchEvent(new Event('change', { bubbles:true }));
  }
}

// === КНОПКА «Долгий отдых» ===
// Рендерится отдельно (см. экспорт insertLongRestButton ниже)
export function handleLongRest(){
  // 1) Восстановить текущие хиты до максимума
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

  // 2) Восстановить все ячейки 1–9 уровней: осталось = всего
  for(let lvl=1; lvl<=9; lvl++){
    const { totalName, remainingName } = getSlotIdsForLevel(lvl);
    const total = getIntValueFromDataName(totalName);
    if (total != null){
      setValueByDataName(remainingName, total);
    }
  }

  // 3) По желанию можно обнулить временные хиты
  // const hpTemp = document.querySelector('#f_HPTemp');
  // if (hpTemp){ hpTemp.value = '0'; hpTemp.dispatchEvent(new Event('input',{bubbles:true})); hpTemp.dispatchEvent(new Event('change',{bubbles:true})); }

  // 4) Мини-тост
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
    const name = normName(f.name);
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
      if(id==null){ magic.unassigned.push({ name, label:null, value: val }); continue; }
      const lvl = inferSpellLevel(id);
      magic.levels[lvl].spells.push({ name, value: val });
      continue;
    }
  }
  return magic;
}

function fieldInput(name,label,wide='three',isText=false,value=''){
  const wrap = el('div',{class:`field ${wide}`}, el('label',{},label||name));
  const node = isText
    ? el('textarea', { 'data-name':name, placeholder:label||name })
    : el('input',    { 'data-name':name, type:'text', placeholder:label||name });
  if(value) node.value = value;
  wrap.appendChild(node);
  return wrap;
}

// === Строка заклинания
export function makeSpellLine(name, value){
  let prefillSlug = "", prefillName = "";
  const found = findSpellBySlugOrName(value);
  if (found){ prefillSlug = found.slug; prefillName = found.name; }
  else if (value){ prefillName = value; }

  const wrap  = el('div',{class:'spell-line'});

  const combo  = el('div',{class:'combo'});
  const hidden = el('input',{'data-name': name || '', type:'hidden', value: prefillSlug});
  const input  = el('input',{class:'combo-input', type:'text', placeholder:'Выберите заклинание…', value: prefillName});
  const list   = el('div',{class:'combo-list'});

  function renderList(filter=""){
    list.innerHTML = "";
    const f = (filter||'').trim().toLowerCase();
    let items = getSpellsCache();
    if (f) items = items.filter(s => s.name.toLowerCase().includes(f) || s.slug.toLowerCase().includes(f));
    if (!items.length){
      list.appendChild(el('div',{class:'combo-item'}, "Ничего не найдено"));
      return;
    }
    for(const s of items){
      const row = el('div',{class:'combo-item'}, s.name, el('span',{class:'muted'}, s.slug));
      row.addEventListener('mousedown', e => e.preventDefault());
      row.addEventListener('click', ()=>{
        input.value = s.name;
        hidden.value = s.slug;
        combo.classList.remove('open');
        // свернуть деталь
        const hadOpen = detailBox.classList.contains('show');
        detailBox.classList.remove('show');
        detailBox.innerHTML = "";
        moreBtn.textContent = 'Подробнее';
        // если панель броска открыта — пересоберём с новым slug
        if (diceBtn.dataset.open === '1') {
          openDiceForSpell({slug: hidden.value, name: input.value}, wrap);
        }
      });
      list.appendChild(row);
    }
  }

  async function openAndRender(){
    combo.classList.add('open');
    renderList(input.value);
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

  const diceBtn   = el('button',{class:'btn success', type:'button'}, 'Использовать');
  const moreBtn   = el('button',{class:'spell-more-btn', type:'button'}, 'Подробнее');
  const delBtn    = el('button',{class:'spell-del-btn',  type:'button'}, 'Удалить');
  const detailBox = el('div',{class:'spell-detail'});

  // === НОВОЕ: определение уровня слота для этой строки
  // Имя поля (data-name) формата "Spells XXX", где XXX косвенно связан с уровнем через parseMagic/infer.
  // Здесь возьмем простой способ: вычислим уровень по DOM-иерархии (по контейнеру id="spellbox-l{lvl}"), который создается в renderMagicCard.
  // Если строка находится внутри #spellbox-l{lvl}, будем считать, что уровень = {lvl}.
  function getLevelForThisSpellLine(){
    const box = wrap.closest('[id^="spellbox-l"]');
    if (!box) return null;
    const m = /spellbox-l(\d+)/.exec(box.id);
    if (!m) return null;
    const lvl = parseInt(m[1],10);
    return Number.isFinite(lvl) ? lvl : null;
  }

  // === Логика на кнопку "Использовать": уменьшить слоты (если это ур.>=1) и открыть/закрыть панель
  diceBtn.addEventListener('click', ()=>{
    const isOpen = diceBtn.dataset.open === '1';
    if (isOpen){
      const pnl = wrap.querySelector('.dice-panel');
      if (pnl) pnl.remove();
      diceBtn.dataset.open = '0';
      diceBtn.textContent = 'Использовать';
    } else {
      const slug = hidden.value || (findSpellBySlugOrName(input.value)?.slug || '');
      openDiceForSpell({slug, name: input.value}, wrap);
      diceBtn.dataset.open = '1';
      diceBtn.textContent = 'Скрыть';
    }
  });

  async function toggleDetails(){
    if (detailBox.classList.contains('show')) {
      detailBox.classList.remove('show');
      moreBtn.textContent = 'Подробнее';
      return;
    }
    const picked = hidden.value || (findSpellBySlugOrName(input.value)?.slug || "");
    detailBox.classList.add('show');
    moreBtn.textContent = 'Скрыть';
    if(!picked){ detailBox.innerHTML = '<em>Сначала выберите заклинание из списка</em>'; return; }
    detailBox.innerHTML = '<em>Загрузка…</em>';
    try{
      const data = await fetchSpellDetail(picked);
      detailBox.innerHTML = data.html || '<em>Пусто</em>';
    }catch(_){
      detailBox.innerHTML = '<em>Ошибка запроса</em>';
    }
  }
  moreBtn.addEventListener('click', toggleDetails);

  // Удаление строки — просто очистка значений
  delBtn.addEventListener('click', ()=>{
    hidden.value = '';
    input.value  = '';
    const pnl = wrap.querySelector('.dice-panel');
    if (pnl) pnl.remove();
    diceBtn.dataset.open = '0';
    diceBtn.textContent = 'Использовать';
    detailBox.classList.remove('show');
    detailBox.innerHTML = '';
    moreBtn.textContent = 'Подробнее';
  });

  wrap.appendChild(combo);
  wrap.appendChild(diceBtn);
  wrap.appendChild(moreBtn);
  wrap.appendChild(delBtn);
  wrap.appendChild(detailBox);

  if(!getSpellsCache().length){ loadSpells().catch(()=>{}); }
  return wrap;
}

export function renderMagicCard(magic){
  const card = el('section',{class:'card'});
  card.appendChild(el('h2',{},'Магия'));

  for(let lvl=0; lvl<=9; lvl++){
    const slots = magic.levels[lvl].slots;
    const spells = magic.levels[lvl].spells;

    const lvlWrap = el('div', {class:'group-lvl'});
    const head = el('div',{class:'level-head'}, el('div',{class:'lvl-title'}, lvl===0 ? 'Ур.0 — Заговоры' : `Ур.${lvl}`));
    lvlWrap.appendChild(head);

    const grid = el('div',{class:'grid'});

    if (lvl >= 1) {
      const N = 18 + lvl;
      grid.appendChild(fieldInput(`SlotsTotal ${N}`,    `Ячейки ур.${lvl} — всего`,   'two', false, slots.total?.value || ''));
      grid.appendChild(fieldInput(`SlotsRemaining ${N}`,`Ячейки ур.${lvl} — осталось`,'two', false, slots.remaining?.value || ''));
    }

    const spellBox = el('div',{class:'stack', id:`spellbox-l${lvl}`});
    (spells||[]).forEach(sp => spellBox.appendChild(makeSpellLine(sp.name, sp.value)));
    const existing = (spells||[]).length;
    for(let i=existing; i<10; i++){
      const genId = (lvl + 1) * 100 + (i + 1);
      spellBox.appendChild(makeSpellLine(`Spells ${genId}`, ''));
    }

    grid.appendChild(spellBox);
    lvlWrap.appendChild(grid);
    card.appendChild(lvlWrap);
  }

  if((magic.unassigned||[]).length){
    const un = el('div',{class:'group-lvl'});
    un.appendChild(el('div',{class:'level-head'}, el('div',{class:'lvl-title'},'Нераспределённые заклинания')));
    const box = el('div',{class:'grid'});
    for(const sp of magic.unassigned){ box.appendChild(makeSpellLine(sp.name, sp.value)); }
    un.appendChild(box); card.appendChild(un);
  }

  return card;
}

// === НОВОЕ: экспорт рендера кнопки долгого отдыха в сайдбаре над «Произвольным броском»
export function insertLongRestButton(){
  // diceSidebar существует в шаблоне как aside.sidebar > #diceSidebar
  const sidebar = document.getElementById('diceSidebar');
  if (!sidebar) return;

  // Ищем место: верх сайдбара, над панелями броска/истории
  if (sidebar.querySelector('#btnLongRest')) return; // уже вставлено

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
  // Вставляем в начало сайдбара
  sidebar.prepend(holder);
}

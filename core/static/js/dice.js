// core/static/js/dice.js
import { el } from './utils.js';
import { getAbilityModifiers, getCharacterName } from './state.js';

/** === Серверные API и realtime === */
const API_LIST_URL = '/api/rolls?limit=5';
const API_CREATE_URL = '/api/rolls/create';
const WS_PATH = '/ws/rolls';

/** Загрузка последних N бросков с сервера */
async function fetchServerHistory(limit = 5){
  const res = await fetch(`/api/rolls?limit=${limit}`, { credentials: 'same-origin' });
  if (!res.ok) return [];
  const json = await res.json().catch(()=>({items:[]}));
  return Array.isArray(json.items) ? json.items : [];
}

/** Отправка нового броска на сервер (остальное сделает WebSocket) */
async function sendRollToServer(entry){
  await fetch(API_CREATE_URL, {
    method: 'POST',
    headers: { 'Content-Type':'application/json', 'X-CSRFToken': CSRF() },
    credentials: 'same-origin',
    body: JSON.stringify(entry)
  });
}

/** Подключение к WebSocket (с автопереподключением) */
function connectRollsWS(onNewRoll){
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const url = `${proto}://${location.host}${WS_PATH}`;
  let ws;

  function open(){
    ws = new WebSocket(url);
    ws.onmessage = (ev)=>{
      try{
        const msg = JSON.parse(ev.data);
        if (msg.type === 'roll' && msg.item) onNewRoll(msg.item);
      }catch(e){}
    };
    ws.onclose = ()=> setTimeout(open, 1500);
  }

  open();
  return ()=> { try{ ws && ws.close(); }catch(e){} };
}

/** === история бросков (сервер) — совместимые обёртки === */
export async function loadHistory(){
  // Возвращаем серверные данные в формате, совместимом с рендером
  const items = await fetchServerHistory(5);
  return items;
}

// Локальное хранение больше не используется, но оставляем функции для совместимости:
export function saveHistory(_list){ /* no-op, теперь хранение на сервере */ }

/** Раньше добавляли в localStorage — теперь шлём на сервер,
    а обновление UI произойдёт от WebSocket-сообщения */
export async function appendHistory(entry){
  try{
    await sendRollToServer({ ts: Date.now(), ...entry });
  }catch(e){
    // fallback: если сервер недоступен, можно (опционально) временно показать локально
    const container = document.querySelector('#diceSidebar .roll-history');
    if (container){
      prependHistoryItem(container, {
        ts: Date.now(),
        ...entry
      }, true);
      trimHistory(container, 5);
    }
  }
}

/** === утилиты броска === */
function rollOnce(sides){ return Math.floor(Math.random() * sides) + 1; }
function parseSides(s){ // 'd8' -> 8
  const m = /^d(\d+)$/i.exec(String(s).trim());
  return m ? parseInt(m[1],10) : 20;
}
function formatBreakdown(results, mod){
  const base = results.join(' + ');
  if (mod && mod !== 0){
    const sign = mod>0 ? '+' : '−';
    return `${base} ${sign} ${Math.abs(mod)}`;
  }
  return base;
}

/** === DOM-хелперы истории === */
function createHistoryItemNode(it, highlight = false){
  const who = it.character || 'Безымянный';
  const spell = it.spell ? ` — ${it.spell}` : '';
  const top = `${who}${spell}`;
  const line = `${it.expr} = ${it.total}`;
  const breakdown = it.breakdown ? el('div',{class:'muted'}, it.breakdown) : null;

  const item = el('div',{class:'roll-item'},
    el('div',{class:'meta'}, top),
    el('div',{class:'result'}, line),
    breakdown
  );

  if (highlight){
    item.classList.add('highlight');
    setTimeout(()=> item.classList.remove('highlight'), 2000);
  }
  return item;
}

function prependHistoryItem(container, it, highlight=false){
  const node = createHistoryItemNode(it, highlight);
  container.prepend(node);
  return node;
}

function trimHistory(container, limit){
  const items = container.querySelectorAll('.roll-item');
  for (let i = limit; i < items.length; i++){
    items[i].remove();
  }
}

/** === рендер истории === */
async function renderHistory(container){
  if(!container) return;
  container.innerHTML = '';

  const list = await loadHistory(); // уже сервер
  if(!list.length){
    container.appendChild(el('div',{class:'muted'},'Пока пусто'));
    return;
  }

  list.forEach((it, idx) => {
    const node = createHistoryItemNode(it, idx === 0);
    container.appendChild(node);
  });
}

/** === обновление подписей характеристик в ПРОИЗВОЛЬНОЙ панели === */
export function refreshFreeDiceAbilities(){
  const select = document.querySelector('#diceSidebar select[data-role="free-ability"]');
  if(!select) return;
  const current = select.value;
  const abilities = getAbilityModifiers(); // {СИЛ:+2, ...}

  // Пересобираем опции (плейсхолдер оставим первым)
  select.innerHTML = '';
  select.appendChild(el('option',{value:''},'Без характеристики'));
  for(const key of ['СИЛ','ЛОВ','ТЕЛ','ИНТ','МДР','ХАР']){
    const v = abilities[key] ?? 0;
    const label = `${key} (${v>=0?'+':''}${v})`;
    const opt = el('option',{value:key}, label);
    select.appendChild(opt);
  }
  // Восстановим предыдущее значение (если есть)
  if ([...select.options].some(o=>o.value===current)) select.value = current;
}

/** === форма произвольного броска (всегда видна) === */
function renderFreeDicePanel(container){
  if(!container) return;

  const freePanel = el('div',{class:'dice-panel'},
    el('h3',{},'Произвольный бросок')
  );

  // строка 1: тип кубика + кол-во кубиков
  const row1 = el('div',{class:'dice-row'});
  const dieSelect = el('select',{},
    ...['d4','d6','d8','d10','d12','d20'].map(v=> el('option',{value:v},v))
  );
  const countInput = el('input',{
    type:'number', min:'1', step:'1', value:'1',
    title:'Сколько кубиков бросить (например, 3 для 3d6)'
  });
  row1.appendChild(el('div',{}, el('label',{},'Тип кубика'), dieSelect));
  row1.appendChild(el('div',{}, el('label',{},'Количество кубиков'), countInput));

  // строка 2: характеристика (русские ключи)
  const row2 = el('div',{class:'dice-row'});
  const abSelect = el('select', {'data-role':'free-ability'},
    el('option',{value:''},'Без характеристики')
  );
  row2.appendChild(el('div',{}, el('label',{},'Характеристика'), abSelect));

  const actions = el('div',{class:'dice-actions'});
  const rollBtn = el('button',{class:'btn primary', type:'button'},'Бросить');
  actions.appendChild(rollBtn);

  freePanel.appendChild(row1);
  freePanel.appendChild(row2);
  freePanel.appendChild(actions);

  const historyList = el('div',{class:'roll-history'});

  container.innerHTML = '';
  container.appendChild(freePanel);
  container.appendChild(el('h3',{},'История бросков'));
  container.appendChild(historyList);

  // начальная инициализация подписей характеристик
  refreshFreeDiceAbilities();

  // первичная отрисовка истории
  renderHistory(historyList);

  // realtime подписка
  connectRollsWS((item)=>{
    // Вставляем пришедший от сервера новый бросок в UI с подсветкой
    prependHistoryItem(historyList, item, true);
    trimHistory(historyList, 5);
  });

  // действие «Бросить»
  rollBtn.addEventListener('click', async ()=>{
    const sides = parseSides(dieSelect.value);                     // d20 -> 20
    const count = Math.max(1, parseInt(countInput.value,10) || 1); // сколько кубиков
    const abKey = abSelect.value;
    const mods = getAbilityModifiers();
    const abMod = abKey ? (mods[abKey] || 0) : 0;

    const rolls = Array.from({length:count}, ()=> rollOnce(sides));
    const subtotal = rolls.reduce((a,b)=>a+b,0) + abMod;
    const breakdown = formatBreakdown(rolls, abMod);
    const expr = `${count}d${sides}${abMod? (abMod>0?`+${abMod}`:`${abMod}`):''}`;

    // Отправляем на сервер — новый элемент появится у всех по WebSocket
    await appendHistory({
      character: getCharacterName(),
      spell: '',
      expr,
      total: subtotal,
      breakdown
    });
  });
}

/** === панель броска внутри заклинания (с запоминанием настроек по slug) === */
const LS_SPELL_DICE_PREFIX = 'spell_dice_cfg_v2_'; // + slug
export function openDiceForSpell(spell, mount){
  const prev = mount.querySelector('.dice-panel');
  if(prev) prev.remove();

  const cfgKey = LS_SPELL_DICE_PREFIX + (spell?.slug || '_unknown');
  const rawSaved = JSON.parse(
    localStorage.getItem(cfgKey) ||
    localStorage.getItem('spell_dice_cfg_'+(spell?.slug||'_unknown')) ||
    '{}'
  );
  let saved = {};
  if (rawSaved) {
    if (rawSaved.die && !rawSaved.dieSides) {
      const m = /^(\d+)[dк](\d+)$/i.exec(rawSaved.die);
      saved = {
        dieSides: m ? `d${parseInt(m[2],10)}` : 'd20',
        count:    m ? parseInt(m[1],10) : 1,
        abKey:    rawSaved.abKey || ''
      };
    } else {
      saved = rawSaved;
    }
  }

  const panel = el('div',{class:'dice-panel'});
  panel.appendChild(el('h3',{}, spell?.name ? `Бросок: ${spell.name}` : 'Бросок заклинания'));

  const row1 = el('div',{class:'dice-row'});
  const dieSelect = el('select',{},
    ...['d4','d6','d8','d10','d12','d20'].map(v=> el('option',{value:v},v))
  );
  if(saved.dieSides) dieSelect.value = saved.dieSides;

  const countInput = el('input',{type:'number', min:'1', step:'1', value: String(saved.count ?? 1)});
  row1.appendChild(el('div',{}, el('label',{},'Тип кубика'), dieSelect));
  row1.appendChild(el('div',{}, el('label',{},'Количество кубиков'), countInput));

  const row2 = el('div',{class:'dice-row'});
  const abilities = getAbilityModifiers();
  const abSelect = el('select',{}, el('option',{value:''},'Без характеристики'));
  for(const key of ['СИЛ','ЛОВ','ТЕЛ','ИНТ','МДР','ХАР']){
    const v = abilities[key] ?? 0;
    const label = `${key} (${v>=0?'+':''}${v})`;
    const opt = el('option',{value:key}, label);
    if(saved.abKey === key) opt.selected = true;
    abSelect.appendChild(opt);
  }
  row2.appendChild(el('div',{}, el('label',{},'Характеристика'), abSelect));

  const actions = el('div',{class:'dice-actions'});
  const rollBtn = el('button',{class:'btn primary', type:'button'},'Бросить');
  actions.appendChild(rollBtn);

  panel.appendChild(row1);
  panel.appendChild(row2);
  panel.appendChild(actions);

  mount.appendChild(panel);

  rollBtn.addEventListener('click', async ()=>{
    const sides = parseSides(dieSelect.value);
    const count = Math.max(1, parseInt(countInput.value,10) || 1);
    const abKey = abSelect.value;
    const mods = getAbilityModifiers();
    const abMod = abKey ? (mods[abKey] || 0) : 0;

    // сохранить конфиг (без доп. модификаторов)
    localStorage.setItem(cfgKey, JSON.stringify({
      dieSides: dieSelect.value,
      count,
      abKey
    }));

    const rolls = Array.from({length:count}, ()=> rollOnce(sides));
    const subtotal = rolls.reduce((a,b)=>a+b,0) + abMod;
    const breakdown = formatBreakdown(rolls, abMod);
    const expr = `${count}d${sides}${abMod? (abMod>0?`+${abMod}`:`${abMod}`):''}`;

    await appendHistory({
      character: getCharacterName(),
      spell:     spell?.name || '',
      expr,
      total: subtotal,
      breakdown
    });
  });
}

/** === инициализация правой панели (всегда видна) === */
export function initDiceSidebar(){
  const host = document.getElementById('diceSidebar');
  if(!host) return;
  renderFreeDicePanel(host);
}

// слушаем событие от state.js, чтобы обновить подписи в free-панели
document.addEventListener('abilities-updated', refreshFreeDiceAbilities);

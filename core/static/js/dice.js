// core/static/js/dice.js
// Клиент для бросков кубиков: история с сервера (только 5 последних),
// отправка на сервер (DRF /api/rolls/), realtime через WebSocket,
// подсветка новой записи 1 секунду, и калькулятор выражений в числовых полях.

console.log('[dice] FILE LOADED v2', import.meta.url);

import { el, CSRF } from './utils.js';
import { getAbilityModifiers, getCharacterName } from './state.js';

/* =========================
   Конфигурация API и WS
   ========================= */
const API_LIST_URL   = '/api/rolls/?limit=5';  // DRF: завершающий слэш обязателен
const API_CREATE_URL = '/api/rolls/';          // POST на коллекцию
const WS_PATH        = '/ws/rolls';

/* =========================
   Логгеры
   ========================= */
const log  = (...a)=> console.log('[dice]', ...a);
const warn = (...a)=> console.warn('[dice]', ...a);
const err  = (...a)=> console.error('[dice]', ...a);

/* =========================
   Калькулятор выражений для числовых полей
   ========================= */
const ALLOWED_EXPR_RE = /^[0-9+\-*/().,\s]+$/;

function safeEvalExpr(expr) {
  if (typeof expr !== 'string') return null;
  const s = expr.trim().replaceAll(',', '.');
  if (!s) return null;
  if (!ALLOWED_EXPR_RE.test(s)) return null;

  // Нормализация ведущего минуса: "-5+3" -> "0-5+3"
  const normalized = s.replace(/^\s*-\s*/, '0-');

  // Запрет повторных операторов
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

// Применить расчёт к конкретному input[data-calc="1"]
function applyCalcToInput(input) {
  const raw = input.value;
  const res = safeEvalExpr(raw);
  if (res == null) return false;
  input.value = String(res);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

// Инициализация поддержки выражений в полях
export function initCalcInputsSupport() {
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

// Пометить числовые поля, чтобы на них работал калькулятор
export function markNumericInputsForCalc(root = document) {
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

  root.querySelectorAll('input[data-name], textarea[data-name]').forEach(el => {
    const dn = el.getAttribute('data-name') || '';
    if (NUMERIC_DATA_NAMES.has(dn) && el.tagName.toLowerCase() === 'input') {
      el.setAttribute('data-calc', '1');
      if (!el.title) {
        el.title = 'Можно вводить выражения: 10+2*3, (40-5)/5. Нажмите Enter для расчёта.';
      }
    }
  });
}

/* =========================
   История бросков (сервер)
   ========================= */
async function fetchServerHistory(limit = 5){
  try{
    const url = `/api/rolls/?limit=${limit}`;
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok){
      warn('GET /api/rolls failed', res.status);
      return [];
    }
    const json = await res.json().catch(()=>({items:[]}));
    const items = Array.isArray(json) ? json : (Array.isArray(json.items) ? json.items : []);
    return items.slice(0, 5); // На всякий случай обрежем до 5
  }catch(e){
    err('history fetch error', e);
    return [];
  }
}

/* =========================
   Отправка нового броска
   ========================= */
async function sendRollToServer(entry){
  const token = CSRF();
  const res = await fetch(API_CREATE_URL, {
    method: 'POST',
    headers: { 'Content-Type':'application/json', 'X-CSRFToken': token },
    credentials: 'same-origin',
    body: JSON.stringify(entry)
  });
  if (!res.ok){
    warn('POST /api/rolls/ failed', res.status, await res.text().catch(()=>null));
    throw new Error('create-failed');
  }
}

/* =========================
   WebSocket (realtime)
   ========================= */
function connectRollsWS(onNewRoll){
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const url = `${proto}://${location.host}${WS_PATH}`;
  let ws;

  function open(){
    log('WS connecting to', url);
    ws = new WebSocket(url);
    ws.onopen    = ()   => log('WS connected');
    ws.onerror   = (e)  => warn('WS error', e);
    ws.onmessage = (ev) => {
  try{
    const msg = JSON.parse(ev.data);

    // Совместимость с разными форматами:
    // - { type: "roll", item: {...} }
    // - { type: "roll.created", item: {...} }
    // - { event: "roll", item: {...} }
    // - { item: {...} } (без типа, но с полями броска)
    const item = msg?.item ?? msg?.data?.item ?? null;

    const isRollType =
      msg?.type === 'roll' ||
      msg?.type === 'roll.created' ||
      msg?.event === 'roll' ||
      msg?.kind === 'roll';

    if (item && (isRollType || item.total != null)) {
      onNewRoll(item);
    } else {
      log('WS message skipped', msg);
    }
  }catch(_){}
};

    ws.onclose   = ()   => setTimeout(open, 1500);
  }
  open();
  return ()=> { try{ ws && ws.close(); }catch(_){ /* no-op */ } };
}

/* =========================
   Публичный API модуля
   ========================= */
export async function loadHistory(){ return await fetchServerHistory(5); }
export function saveHistory(_list){ /* no-op */ }

/**
 * Добавить новую запись броска:
 * - шлём на сервер;
 * - при ошибке — локальный fallback-рендер.
 */
export async function appendHistory(entry){
  try{
    await sendRollToServer({ ts: Date.now(), ...entry });

    // Мгновенное локальное отображение с подсветкой (не ждём WS)
    const container = document.querySelector('#diceSidebar .roll-history');
    if (container){
      prependHistoryItem(container, entry, true); // 1 сек. подсветка
      trimHistory(container, 5);                  // держим максимум 5
    }
  }catch(e){
    err('appendHistory failed (fallback to local render)', e);
    const container = document.querySelector('#diceSidebar .roll-history');
    if (container){
      prependHistoryItem(container, { ts: Date.now(), ...entry }, true);
      trimHistory(container, 5);
    }
  }
}


/* =========================
   Утилиты броска
   ========================= */
function rollOnce(sides){ return Math.floor(Math.random() * sides) + 1; }
function parseSides(s){ // 'd8' -> 8
  const m = /^\s*d\s*(\d+)\s*$/i.exec(String(s||'').trim());
  return m ? parseInt(m[1],10) : 20;
}
function formatBreakdown(results, mod){
  const base = results.join(' + ');
  if (mod && mod !== 0){
    const sign = mod > 0 ? '+' : '−';
    return `${base} ${sign} ${Math.abs(mod)}`;
  }
  return base;
}

/* =========================
   DOM-хелперы истории
   ========================= */
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
    // Подсветка 1 секунда
    setTimeout(()=> item.classList.remove('highlight'), 1000);
  }
  return item;
}

// Вставить запись в начало
function prependHistoryItem(container, it, highlight=false){
  const node = createHistoryItemNode(it, highlight);
  container.prepend(node);
  return node;
}

// Обрезать историю до limit (оставляем только последние 5)
function trimHistory(container, limit){
  const items = container.querySelectorAll('.roll-item');
  for (let i = limit; i < items.length; i++){
    items[i].remove();
  }
}

/* =========================
   Рендер истории (первичная)
   ========================= */
async function renderHistory(container){
  if(!container){ warn('renderHistory: no container'); return; }
  container.innerHTML = '';

  const list = await loadHistory(); // уже сервер
  if(!list.length){
    container.appendChild(el('div',{class:'muted'},'Пока пусто'));
    return;
  }

  list.forEach((it) => {
    // при первичной отрисовке — без подсветки
    const node = createHistoryItemNode(it, false);
    container.appendChild(node);
  });

  // Гарантированно обрежем до 5
  trimHistory(container, 5);
}

/* =========================
   Свободная панель бросков
   ========================= */
export function refreshFreeDiceAbilities(){
  const select = document.querySelector('#diceSidebar select[data-role="free-ability"]');
  if(!select){ warn('refreshFreeDiceAbilities: no select'); return; }
  const current = select.value;
  const abilities = getAbilityModifiers?.() || {};

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

function renderFreeDicePanel(container){
  if(!container){ warn('render: no container'); return; }

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
    title:'Сколько кубиков бросить (например, 3 для 3d6)',
  });
  countInput.classList.add('dice-count', 'w-compact');
  row1.appendChild(el('div',{}, el('label',{},'Тип кубика'), dieSelect));
  row1.appendChild(el('div',{}, el('label',{},'Количество кубиков'), countInput));

  // строка 2: характеристика (русские ключи)
  const row2 = el('div',{class:'dice-row'});
  const abSelect = el('select', {'data-role':'free-ability'},
    el('option',{value:''},'Без характеристики')
  );
  row2.appendChild(el('div',{}, el('label',{},'Характеристика'), abSelect));

  const actions = el('div',{class:'dice-actions'});
  const rollBtn = el('button',{class:'btn primary', type:'button', id:'freeRollBtn'},'Бросить');
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
  const container = document.querySelector('#diceSidebar .roll-history');
  if (!container) return;
  prependHistoryItem(container, item, true); // подсветка 1 c
  trimHistory(container, 5);
});

  // Fallback-поллинг на случай временного отсутствия WS-сообщений
setInterval(async () => {
  try{
    const container = document.querySelector('#diceSidebar .roll-history');
    if (!container) return;
    const fresh = await fetch(`/api/rolls/?limit=5`, { credentials: 'same-origin' })
      .then(r => r.ok ? r.json() : [])
      .then(json => Array.isArray(json) ? json : (Array.isArray(json.items) ? json.items : []))
      .catch(() => []);
    container.innerHTML = '';
    fresh.slice(0,5).forEach(it => container.appendChild(createHistoryItemNode(it, false)));
  }catch(_){}
}, 10000);


  // действие «Бросить»
  log('bind click');
  rollBtn.addEventListener('click', async ()=>{
    log('click start');
    try{
      const sides = parseSides(dieSelect.value);                     // d20 -> 20
      const count = Math.max(1, parseInt(countInput.value,10) || 1); // сколько кубиков
      const abKey = abSelect.value;
      const mods = getAbilityModifiers?.() || {};
      const abMod = abKey ? (mods[abKey] || 0) : 0;

      const rolls = Array.from({length:count}, ()=> rollOnce(sides));
      const subtotal = rolls.reduce((a,b)=>a+b,0) + abMod;
      const breakdown = formatBreakdown(rolls, abMod);
      const expr = `${count}d${sides}${abMod? (abMod>0?`+${abMod}`:`${abMod}`):''}`;

      const payload = {
        character: (getCharacterName?.() || 'Безымянный'),
        spell: '',
        expr,
        total: subtotal,
        breakdown
      };
      log('payload', payload);

      await appendHistory(payload);
      log('appendHistory done');
    }catch(e){
      err('click handler error', e);
    }
  });
}

/* =========================
   Панель броска внутри заклинания
   ========================= */
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
  const abilities = getAbilityModifiers?.() || {};
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
try{
const sides = parseSides(dieSelect.value);
const count = Math.max(1, parseInt(countInput.value,10) || 1);
const abKey = abSelect.value;
const mods = getAbilityModifiers?.() || {};
const abMod = abKey ? (mods[abKey] || 0) : 0;

// сохранить конфиг
localStorage.setItem(cfgKey, JSON.stringify({
  dieSides: dieSelect.value,
  count,
  abKey
}));

const rolls = Array.from({length:count}, ()=> rollOnce(sides));
const subtotal = rolls.reduce((a,b)=>a+b,0) + abMod;
const breakdown = formatBreakdown(rolls, abMod);
const expr = `${count}d${sides}${abMod ? (abMod > 0 ? `+${abMod}` : `${abMod}`) : ''}`;

await appendHistory({
  character: (getCharacterName?.() || 'Безымянный'),
  spell: spell?.name || '',
  expr,
  total: subtotal,
  breakdown
});
}catch(e){
err('spell panel click error', e);
}
});
}

/* =========================
   Инициализация правой панели
   ========================= */
export function initDiceSidebar(){
  try{
    const host = document.getElementById('diceSidebar');
    if(!host){ warn('no #diceSidebar'); return; }
    log('init');
    renderFreeDicePanel(host);
    log('sidebar initialized');
  }catch(e){
    err('init failed', e);
  }
}

// Обновление подписей характеристик при событии от state.js
document.addEventListener('abilities-updated', refreshFreeDiceAbilities);

// Безопасный автозапуск (если main.js не инициализировал)
document.addEventListener('DOMContentLoaded', ()=> {
  try{
    initDiceSidebar();
  }catch(e){
    err('DOM init failed', e);
  }
});

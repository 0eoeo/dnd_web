// core/static/js/dice.js
import { el } from './utils.js';
import { getAbilityModifiers, getCharacterName } from './state.js';

/** === история бросков (localStorage) === */
const LS_HISTORY_KEY = 'dice_history_v1';
export function loadHistory(){
  try{ return JSON.parse(localStorage.getItem(LS_HISTORY_KEY)||'[]'); }catch{ return []; }
}
export function saveHistory(list){
  localStorage.setItem(LS_HISTORY_KEY, JSON.stringify(list.slice(0,200)));
}
export function appendHistory(entry){
  const list = loadHistory();
  list.unshift({ ts: Date.now(), ...entry });
  saveHistory(list);
  renderHistory(document.querySelector('#diceSidebar .roll-history'));
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

/** === рендер истории === */
function renderHistory(container){
  if(!container) return;
  const list = loadHistory();
  container.innerHTML = '';
  if(!list.length){
    container.appendChild(el('div',{class:'muted'},'Пока пусто'));
    return;
  }
  for(const it of list){
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
    container.appendChild(item);
  }
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

  rollBtn.addEventListener('click', ()=>{
    const sides = parseSides(dieSelect.value);                     // d20 -> 20
    const count = Math.max(1, parseInt(countInput.value,10) || 1); // сколько кубиков
    const abKey = abSelect.value;
    const mods = getAbilityModifiers();
    const abMod = abKey ? (mods[abKey] || 0) : 0;

    const rolls = Array.from({length:count}, ()=> rollOnce(sides));
    const subtotal = rolls.reduce((a,b)=>a+b,0) + abMod;
    const breakdown = formatBreakdown(rolls, abMod);
    const expr = `${count}d${sides}${abMod? (abMod>0?`+${abMod}`:`${abMod}`):''}`;

    appendHistory({
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

  rollBtn.addEventListener('click', ()=>{
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

    appendHistory({
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

// core/static/js/state.js
import { normalizeName } from './utils.js';
import { renderNonMagic, cards } from './render.js';
import { parseMagic, renderMagicCard } from './spells.js';
import { loadSpells, findSpellBySlugOrName } from './spells_data.js';

let avatarDataUrl = '';

export function setAvatarDataUrl(v){ avatarDataUrl = v || ''; }
export function getAvatarDataUrl(){ return avatarDataUrl; }

function getNodeByDataName(name) {
  return document.querySelector(`[data-name="${name}"]`);
}

export async function renderFormFromJson(json){
  await loadSpells();
  cards.innerHTML='';

  const fields = Array.isArray(json?.fields)? json.fields : [];

  renderNonMagic();

  const magic = parseMagic(fields);
  const magicCard = renderMagicCard(magic);
  cards.appendChild(magicCard);

  const byName = new Map();
  for (const f of fields) {
    const n = normalizeName(f?.name);
    if (!n) continue;
    byName.set(n, f);
  }

  document.querySelectorAll('[data-name]').forEach(node => {
    const n = normalizeName(node.getAttribute('data-name'));
    if (!n) return;

    let f = byName.get(n);
    if (!f) {
      const k = Array.from(byName.keys()).find(k => k.toLowerCase() === n.toLowerCase());
      if (k) f = byName.get(k);
    }
    if (!f) return;

    const raw = f.value ?? '';
    const isCheckbox = String(f.type).toLowerCase() === 'checkbox';
    const val = isCheckbox
      ? (String(raw).toLowerCase() === 'yes' || String(raw).toLowerCase() === 'on' || String(raw).toLowerCase() === 'true' ? '✔' : '')
      : String(raw);

    const isSpellHidden = node.type === 'hidden' && node.closest('.spell-line');
    if (isSpellHidden) {
      const found = findSpellBySlugOrName(val);
      const slug = found ? found.slug : val;
      node.value = slug;

      const combo = node.closest('.combo');
      const visibleInput = combo ? combo.querySelector('.combo-input') : null;
      if (visibleInput) visibleInput.value = found ? found.name : val;
      return;
    }

    node.value = val;
  });

  if(json?.avatarDataUrl){
    avatarDataUrl = json.avatarDataUrl;
    const prev = document.getElementById('avatarPreview');
    if(prev) prev.style.backgroundImage = `url('${avatarDataUrl}')`;
  }

  // >>> ВАЖНО: сообщаем, что модификаторы могли обновиться
  document.dispatchEvent(new CustomEvent('abilities-updated'));
}

/** Преобразовать строку в модификатор (+2 / -1 / 0) */
function parseModifier(str) {
  if (str == null) return 0;
  let s = String(str).trim();
  if (!s) return 0;
  s = s.replace(/\u2212|\u2013|\u2014/g, '-'); // −, –, —
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : 0;
}

/** Возвращает модификаторы с русскими ключами (СИЛ/ЛОВ/ТЕЛ/ИНТ/МДР/ХАР) */
export function getAbilityModifiers() {
  const mapRuToEn = {
    'СИЛ': 'STR',
    'ЛОВ': 'DEX',
    'ТЕЛ': 'CON',
    'ИНТ': 'INT',
    'МДР': 'WIS',
    'ХАР': 'CHA',
  };
  const out = {};
  for (const ru of Object.keys(mapRuToEn)) {
    const en = mapRuToEn[ru];
    const node = getNodeByDataName(en);
    const raw = node ? node.value : '';
    out[ru] = parseModifier(raw);
  }
  return out;
}

/** Имя персонажа */
export function getCharacterName() {
  const node = getNodeByDataName('CharacterName');
  const val = node ? String(node.value || '').trim() : '';
  return val || 'Безымянный';
}

export function buildJsonFromForm(){
  const out = { fields: [], avatarDataUrl };
  document.querySelectorAll('[data-name]').forEach(n=>{
    const name = n.getAttribute('data-name');
    const value = n.value ?? '';
    if(!name) return;
    if (n.type === 'hidden' && /^Spells\s+/i.test(name) && String(value).trim() === '') return;
    out.fields.push({ page:null, name, type:'Unknown', rect:null, value, label:'', export_values:null });
  });
  return out;
}

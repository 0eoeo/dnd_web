// Константы и эндпоинты

export const FIELD_GROUPS = [
  { id:'core', title:'Основные данные', layout:'three', fields:[
    ['__AVATAR__','Аватар'],
    ['CharacterName','Имя персонажа'],
    ['ClassLevel','Класс и уровень'],
    ['Background','Предыстория'],
    ['PlayerName','Имя игрока'],
    ['Race','Раса'],
    ['Alignment','Мировоззрение'],
    ['XP','Опыт (XP)'],
    ['Age','Возраст'],
    ['Height','Рост'],
    ['Weight','Вес'],
    ['Eyes','Глаза'],
    ['Skin','Кожа'],
    ['Hair','Волосы'],
  ]},

  { id:'combat', title:'Боевые параметры', layout:'three', fields:[
    ['AC','Класс доспеха'], ['Initiative','Инициатива'], ['Speed','Скорость'],
    ['HPMax','Максимум хитов'], ['HPCurrent','Текущие хиты'], ['HPTemp','Временные хиты'],
    ['HDTotal','Хиты кубов (итого)'], ['HD','Хиты кубов (тип)'], ['Passive','Пассивное восприятие'],
    ['ProfBonus','Бонус мастерства'], ['Inspiration','Вдохновение']
  ]},

  { id:'abilities', title:'Характеристики', layout:'four', fields:[
    ['STR','СИЛ'], ['STRmod','СИЛ (значение)'],
    ['DEX','ЛОВ'], ['DEXmod','ЛОВ (значение)'],
    ['CON','ТЕЛ'], ['CONmod','ТЕЛ (значение)'],
    ['INT','ИНТ'], ['INTmod','ИНТ (значение)'],
    ['WIS','МДР'], ['WISmod','МДР (значение)'],
    ['CHA','ХАР'], ['CHamod','ХАР (значение)']
  ]},

  { id:'saves', title:'Спасброски', layout:'three', fields:[
    ['ST Strength','СИЛ'], ['ST Dexterity','ЛОВ'], ['ST Constitution','ТЕЛ'],
    ['ST Intelligence','ИНТ'], ['ST Wisdom','МДР'], ['ST Charisma','ХАР']
  ]},

  { id:'skills', title:'Навыки', layout:'three', fields:[
    ['Acrobatics','Акробатика'], ['Animal','Уход за животными'], ['Arcana','Магия'], ['Athletics','Атлетика'],
    ['Deception','Обман'], ['History','История'], ['Insight','Проницательность'], ['Intimidation','Запугивание'],
    ['Investigation','Анализ'], ['Medicine','Медицина'], ['Nature','Природа'], ['Perception','Восприятие'],
    ['Performance','Выступление'], ['Persuasion','Убеждение'], ['Religion','Религия'],
    ['SleightofHand','Ловкость рук'], ['Stealth','Скрытность'], ['Survival','Выживание']
  ]},

  { id:'attacks', title:'Атаки и оружие', layout:'three', long:['AttacksSpellcasting'], fields:[
    ['Wpn Name','Оружие #1 — название'], ['Wpn1 AtkBonus','Бонус атаки #1'], ['Wpn1 Damage','Урон #1'],
    ['Wpn Name 2','Оружие #2 — название'], ['Wpn2 AtkBonus','Бонус атаки #2'], ['Wpn2 Damage','Урон #2'],
    ['Wpn Name 3','Оружие #3 — название'], ['Wpn3 AtkBonus','Бонус атаки #3'], ['Wpn3 Damage','Урон #3'],
    ['AttacksSpellcasting','Доп. заметки по атакам/заклинаниям']
  ]},

  { id:'money', title:'Деньги', layout:'three', fields:[
    ['CP','Медные (cp)'], ['SP','Серебряные (sp)'], ['EP','Электрум (ep)'], ['GP','Золотые (gp)'], ['PP','Платиновые (pp)']
  ]},

  { id:'personality', title:'Черты личности и особенности', layout:'two', long:['ProficienciesLang','Equipment','Features and Traits','PersonalityTraits','Ideals','Bonds','Flaws'], fields:[
    ['PersonalityTraits','Черты характера'], ['Ideals','Идеалы'], ['Bonds','Привязанности'], ['Flaws','Изъяны'],
    ['ProficienciesLang','Владения и языки'], ['Equipment','Снаряжение'], ['Features and Traits','Особенности и черты']
  ]},
];

export const API = {
  uploadPdf: '/api/upload-pdf/',
  listSheets: '/api/media-sheets/',
  getSheet: id => `/api/sheets/${id}/`,
  createSheet: '/api/sheets/',
  updateSheet: id => `/api/sheets/${id}/`,
  spellsList: '/api/spells/',
  spellDetail: slug => `/api/spells/${encodeURIComponent(slug)}/`,
};

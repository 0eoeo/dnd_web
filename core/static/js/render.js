import { el, normalizeName, LONG_HINT } from './utils.js';
import { FIELD_GROUPS } from './config.js';

export const cards = document.getElementById('cards');

export function makeInput(name, label, isLong=false, layout='three'){
  const cls = (name==='__AVATAR__') ? 'two' : (layout==='four' ? 'four' : layout==='two' ? 'two' : layout==='stack' ? 'stack' : 'three');
  const wrap = el('div',{class:`field ${cls}`});
  const id = `f_${name.replace(/[^a-z0-9]+/gi,'_')}`;
  wrap.appendChild(el('label',{for:id}, label || name));

  if(name === '__AVATAR__'){
    const holder = el('div',{class:'avatar', id:'avatarHolder'},
      el('div',{class:'preview', id:'avatarPreview', style:`background-image:url('data:image/svg+xml;utf8,<svg xmlns=&quot;http://www.w3.org/2000/svg&quot; viewBox=&quot;0 0 100 100&quot;><rect width=&quot;100&quot; height=&quot;100&quot; fill=&quot;%2310151f&quot;/><circle cx=&quot;50&quot; cy=&quot;38&quot; r=&quot;18&quot; fill=&quot;%232a3348&quot;/><rect x=&quot;20&quot; y=&quot;62&quot; width=&quot;60&quot; height=&quot;26&quot; rx=&quot;13&quot; fill=&quot;%232a3348&quot;/></svg>');`} ),
      el('div',{class:'meta'},
        el('label',{class:'btn ghost', for:'avatarFile'},'Выбрать файл'),
        el('small',{style:`padding-left: 10px;`},'PNG/JPG')
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

export function renderNonMagic(){
  for (const group of FIELD_GROUPS){
    const card = el('section',{class:'card'});
    card.appendChild(el('h2',{},group.title));
    const grid = el('div',{class:'grid'});
    card.appendChild(grid);
    for (const [rawName,label] of (group.fields||[])){
      const name = normalizeName(rawName);
      grid.appendChild( makeInput(name, label, group.long?.includes(name), group.layout) );
    }
    cards.appendChild(card);
  }
}

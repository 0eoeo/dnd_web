// core/static/js/sheet_nav.js
// Navigation helpers for character sheet: Table of Contents (TOC) and Tabs.

export function buildSheetTOC() {
  const host = document.getElementById('sheetToc') || (() => {
    const div = document.createElement('nav');
    div.id = 'sheetToc';
    div.className = 'sheet-toc';
    // Insert before cards container if present, else prepend to main content
    const cards = document.getElementById('cards');
    const parent = document.querySelector('.content') || document.body;
    if (cards && cards.parentNode) {
      cards.parentNode.insertBefore(div, cards);
    } else {
      parent.prepend(div);
    }
    return div;
  })();

  const sections = [...document.querySelectorAll('.sheet-section[id]')];
  host.innerHTML = sections.map(sec => {
    const id = sec.id;
    const title = sec.getAttribute('data-title') || sec.querySelector('h2')?.textContent || id;
    return `<a href="#${id}" data-toc="${id}">${title}</a>`;
  }).join('');

  // Smooth scroll
  host.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-toc]');
    if (!a) return;
    e.preventDefault();
    const id = a.getAttribute('data-toc');
    const node = document.getElementById(id);
    if (!node) return;
    const topBar = document.querySelector('.site-topbar');
    const offset = (topBar?.offsetHeight || 0) + 8;
    const y = node.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top: y, behavior: 'smooth' });
    history.replaceState(null, '', `#${id}`);
  });

  // Active highlight via IntersectionObserver
  const links = [...host.querySelectorAll('a[data-toc]')];
  const obs = new IntersectionObserver((entries) => {
    const visible = entries
      .filter(en => en.isIntersecting)
      .sort((a,b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
    if (!visible) return;
    const id = visible.target.id;
    links.forEach(a => a.classList.toggle('active', a.getAttribute('data-toc') === id));
  }, { rootMargin: '-20% 0px -70% 0px', threshold: 0.01 });

  sections.forEach(sec => obs.observe(sec));
}

export function buildSheetTabs() {
  const container = document.getElementById('sheetTabs') || (() => {
    const div = document.createElement('div');
    div.id = 'sheetTabs';
    div.className = 'sheet-tabs';
    const cards = document.getElementById('cards');
    const parent = document.querySelector('.content') || document.body;
    if (cards && cards.parentNode) {
      cards.parentNode.insertBefore(div, cards);
    } else {
      parent.prepend(div);
    }
    return div;
  })();

  const sections = [...document.querySelectorAll('.sheet-section[id]')];
  container.innerHTML = sections.map(sec => {
    const id = sec.id;
    const title = sec.getAttribute('data-title') || sec.querySelector('h2')?.textContent || id;
    return `<button type="button" class="tab-btn" data-tab="${id}">${title}</button>`;
  }).join('');

  function activate(id){
    const buttons = container.querySelectorAll('.tab-btn');
    buttons.forEach(b => b.classList.toggle('active', b.getAttribute('data-tab') === id));
    sections.forEach(sec => sec.classList.toggle('hidden', sec.id !== id));
    history.replaceState(null, '', `#${id}`);
    const topBar = document.querySelector('.site-topbar');
    const offset = (topBar?.offsetHeight || 0) + 8;
    const y = container.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top: y, behavior: 'smooth' });
  }

  container.addEventListener('click', (e)=>{
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    const id = btn.getAttribute('data-tab');
    localStorage.setItem('sheet_active_tab', id);
    activate(id);
  });

  const hash = (location.hash||'').replace('#','');
  const saved = localStorage.getItem('sheet_active_tab') || '';
  const preferred = sections.some(s => s.id === hash) ? hash : (sections.some(s => s.id === saved) ? saved : (sections[0]?.id || ''));
  activate(preferred);
}
const ICONS = {
  cricket: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7.2"/><path d="M8 9.2c2.2 1.4 5.8 1.4 8 0M8.8 14.6c2 1 4.4 1 6.4 0"/></svg>',
  practice: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7.2"/><path d="M12 8.2V12l2.8 2"/></svg>',
  gym: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6M7 7.5v9M17 7.5v9M20 9v6M7 12h10"/></svg>',
  social: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8" cy="10" r="2.2"/><circle cx="16" cy="10" r="2.2"/><path d="M4.8 17.2c.8-2 2.4-3 4.2-3s3.4 1 4.2 3M12.8 16.2c.6-1.4 1.8-2.2 3.2-2.2 1.6 0 2.8.8 3.4 2.2"/></svg>',
  trophy: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5h8v4.2a4 4 0 0 1-8 0V5zM8 7H5.5v1.5A2.5 2.5 0 0 0 8 11M16 7h2.5v1.5A2.5 2.5 0 0 1 16 11M12 13.2V16M9 19h6M10 16h4"/></svg>',
  book: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6.5h6.2A2.8 2.8 0 0 1 14 9.3V19H7.2A2.2 2.2 0 0 1 5 16.8V6.5zM19 6.5h-6.2A2.8 2.8 0 0 0 10 9.3V19h6.8A2.2 2.2 0 0 0 19 16.8V6.5z"/></svg>',
};

export function iconEl(name) {
  const svg = ICONS[name];
  const wrap = document.createElement('span');
  wrap.className = 'icon';
  wrap.setAttribute('aria-hidden', 'true');
  if (svg) wrap.innerHTML = svg;
  else wrap.textContent = name || '•';
  return wrap;
}

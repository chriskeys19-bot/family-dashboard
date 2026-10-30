import { attachDictation } from './dictate.js';

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value === true) node.setAttribute(key, '');
    else node.setAttribute(key, String(value));
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

let fieldSeq = 0;

function wantsDictation(control) {
  if (!control) return false;
  if (control.tagName === 'TEXTAREA') return true;
  return control.dataset.dictate === 'true';
}

export function field(label, control, hint) {
  if (!control.id) {
    fieldSeq += 1;
    control.id = `fld-${fieldSeq}`;
  }
  const wrap = el('div', { class: 'field' });
  const head = el('div', { class: 'field-head' });
  head.append(el('label', { for: control.id }, label));
  const dictate = wantsDictation(control) ? attachDictation(control) : null;
  if (dictate?.button) head.append(dictate.button);
  wrap.append(head);
  wrap.append(control);
  if (hint) {
    const hintEl = el('p', { class: 'hint', id: `${control.id}-hint` }, hint);
    control.setAttribute('aria-describedby', hintEl.id);
    wrap.append(hintEl);
  }
  if (dictate?.status) wrap.append(dictate.status);
  return wrap;
}

export function safeColor(value) {
  return /^#[0-9a-fA-F]{6}$/.test(value || '') ? value : '#5e564c';
}

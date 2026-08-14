import { DEDUPLICATION } from './constants';

function escapeAttr(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function cssSafeId(value: string): string {
  try {
    if (typeof (CSS as unknown as { escape?: (v: string) => string }).escape === 'function') {
      return (CSS as unknown as { escape: (v: string) => string }).escape(value);
    }
  } catch {
    /* n/a */
  }
  return `#${value.replace(/([^a-zA-Z0-9_-])/g, '\\$1')}`;
}

function isPlainElement(el: unknown): el is Element {
  if (!el) return false;
  if (typeof (el as Element).nodeType !== 'number') return false;
  return (el as Element).nodeType === 1;
}

function getAttr(el: Element, name: string): string | null {
  try {
    if (!el || !('getAttribute' in el)) return null;
    const v = (el as Element).getAttribute(name);
    return typeof v === 'string' && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

function hasAttr(el: Element, name: string): boolean {
  try {
    return !!(el as Element).hasAttribute?.(name);
  } catch {
    return false;
  }
}

function getAncestors(el: Element, limit = 6): Array<Element> {
  const out: Array<Element> = [];
  let cur: Element | null = el;
  while (
    cur &&
    cur.nodeType === 1 &&
    cur.tagName !== 'HTML' &&
    cur.tagName !== 'BODY' &&
    out.length < limit
  ) {
    cur = (cur as Element).parentElement ?? null;
    if (cur && cur.tagName !== 'HTML') out.push(cur);
  }
  return out;
}

function indexAmongSiblings(el: Element, ofType = true): number {
  try {
    const parent = el.parentElement;
    if (!parent) return 1;
    const siblings = ofType
      ? Array.from(parent.children).filter((c) => c.tagName === el.tagName)
      : Array.from(parent.children);
    const idx = siblings.indexOf(el);
    return idx < 0 ? 1 : idx + 1;
  } catch {
    return 1;
  }
}

function tag(el: Element): string {
  return el.tagName.toLowerCase();
}

function semanticQualifier(el: Element): string | null {
  const t = tag(el);
  switch (t) {
    case 'button': {
      const type = getAttr(el, 'type')?.toLowerCase();
      if (type === 'submit' || type === 'reset' || type === 'button') return `[type="${type}"]`;
      return null;
    }
    case 'input':
    case 'textarea':
    case 'select': {
      const type = getAttr(el, 'type')?.toLowerCase();
      if (type && type.length <= 20 && /^[a-z0-9-]+$/.test(type)) return `[type="${type}"]`;
      return null;
    }
    case 'label': {
      const fr = getAttr(el, 'for');
      if (fr) return `[for="${escapeAttr(fr)}"]`;
      return null;
    }
    case 'a': {
      if (hasAttr(el, 'href')) {
        const href = getAttr(el, 'href');
        if (href && (href.startsWith('#') || href === '')) {
          return `[href="${escapeAttr(href)}"]`;
        }
      }
      return null;
    }
    default:
      return null;
  }
}

function buildStructuralTail(el: Element): string {
  const parts: string[] = [];
  let cur: Element = el;
  const maxDepth = 3;
  for (let i = 0; i < maxDepth; i += 1) {
    const idx = indexAmongSiblings(cur, true);
    const base = tag(cur);
    const qualifier = semanticQualifier(cur) ?? '';
    parts.unshift(idx > 1 ? `${base}${qualifier}:nth-of-type(${idx})` : `${base}${qualifier}`);
    const parent = cur.parentElement;
    if (!parent || parent.tagName === 'BODY' || parent.tagName === 'HTML') break;
    cur = parent;
  }
  return parts.join(' > ');
}

export function buildStableSelector(input: unknown): string {
  if (!isPlainElement(input)) return '';
  const el = input as Element;
  const SEL_MAX = DEDUPLICATION.SELECTOR_MAX_LENGTH;

  const dt = getAttr(el, 'data-testid');
  if (dt) {
    const s = `[data-testid="${escapeAttr(dt)}"]`;
    if (s.length <= SEL_MAX) return s;
  }
  const dtest = getAttr(el, 'data-test');
  if (dtest) {
    const s = `[data-test="${escapeAttr(dtest)}"]`;
    if (s.length <= SEL_MAX) return s;
  }
  const aria = getAttr(el, 'aria-label');
  if (aria && aria.length >= 1 && aria.length <= 100) {
    const s = `${tag(el)}[aria-label="${escapeAttr(aria)}"]`;
    if (s.length <= SEL_MAX) return s;
  }
  const id = getAttr(el, 'id');
  if (id && /^[A-Za-z0-9_-]+$/.test(id)) {
    const s = cssSafeId(id);
    if (s.length <= SEL_MAX) return s.startsWith('#') ? s : `#${s}`;
  }
  const name = getAttr(el, 'name');
  const tg = tag(el);
  if (
    name &&
    /^[A-Za-z0-9_[\].-]+$/.test(name) &&
    ['input', 'select', 'textarea', 'button', 'form'].includes(tg)
  ) {
    const s = `${tg}[name="${escapeAttr(name)}"]`;
    if (s.length <= SEL_MAX) return s;
  }
  const sem = semanticQualifier(el);
  if (sem) {
    const parent = el.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        (c) =>
          c.tagName === el.tagName && (getAttr(c, 'type') ?? '') === (getAttr(el, 'type') ?? ''),
      );
      if (siblings.length === 1) {
        const s = `${tg}${sem}`;
        if (s.length <= SEL_MAX) return s;
      }
    }
  }
  const tail = buildStructuralTail(el);
  return tail.length > 0 ? tail : tg;
}

export function buildStableSelectorWithRoot(input: unknown, root?: unknown): string {
  const SEL_MAX = DEDUPLICATION.SELECTOR_MAX_LENGTH;
  const base = buildStableSelector(input);
  if (!root || !isPlainElement(input)) return base;
  const el = input as Element;
  try {
    const rootEl = isPlainElement(root) ? (root as Element | Document | ShadowRoot) : null;
    if (
      rootEl &&
      'querySelector' in rootEl &&
      typeof (rootEl as Element | Document).querySelector === 'function' &&
      base
    ) {
      const match = (rootEl as Element | Document).querySelector?.(base);
      if (match === el) return base;
    }
  } catch {
    /* seletor invalido ou unico, cai pro structural */
  }
  const ancestors = getAncestors(el, 3);
  for (const anc of ancestors) {
    const ancSel = buildStableSelector(anc);
    if (!ancSel) continue;
    const candidate = `${ancSel} > ${buildStructuralTail(el)}`;
    if (candidate.length > SEL_MAX) continue;
    try {
      if (typeof document !== 'undefined') {
        const m = document.querySelector?.(candidate);
        if (m === el) return candidate;
      } else {
        return candidate;
      }
    } catch {
      /* n/a */
    }
  }
  return base || buildStructuralTail(el);
}

export const _priv = { escapeAttr, semanticQualifier, indexAmongSiblings, cssSafeId };

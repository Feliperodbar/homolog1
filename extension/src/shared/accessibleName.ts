import { DEDUPLICATION } from './constants';

function isElement(v: unknown): v is Element {
  return (
    !!v && typeof v === 'object' && 'nodeType' in (v as object) && (v as Element).nodeType === 1
  );
}

function getAttr(el: Element, name: string): string | null {
  try {
    const v = el.getAttribute(name);
    return typeof v === 'string' ? v : null;
  } catch {
    return null;
  }
}

function normalizeText(s: unknown, max = DEDUPLICATION.TEXT_MAX_LENGTH): string {
  if (typeof s !== 'string') return '';
  const trimmed = s.replace(/\s+/g, ' ').trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function elementText(el: Element): string {
  try {
    if ('innerText' in el && typeof (el as HTMLElement).innerText === 'string') {
      return normalizeText((el as HTMLElement).innerText);
    }
  } catch {
    /* fallthrough */
  }
  try {
    return normalizeText(el.textContent ?? '');
  } catch {
    return '';
  }
}

function resolveLabelByFor(
  root: Document | Element | undefined | null,
  id: string | null,
): string | null {
  if (!id || !root) return null;
  try {
    if (typeof (root as { querySelectorAll?: unknown }).querySelectorAll === 'function') {
      const labels = (root as Element | Document).querySelectorAll?.('label');
      if (labels) {
        for (let i = 0; i < labels.length; i += 1) {
          const l = labels[i] as Element;
          if (l.getAttribute('for') === id) {
            const txt = elementText(l);
            if (txt) return txt;
          }
        }
      }
    }
  } catch {
    /* fallthrough */
  }
  try {
    const doc = typeof document !== 'undefined' ? document : (root as Element).ownerDocument;
    if (doc && typeof (doc as { getElementsByName?: unknown }).getElementsByName === 'function') {
      const candidates = (doc as Document).querySelectorAll?.(
        `label[for="${id.replace(/"/g, '\\"')}"]`,
      );
      if (candidates && candidates.length > 0) {
        const txt = elementText(candidates[0] as Element);
        if (txt) return txt;
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

function getEnclosingLabel(el: Element): Element | null {
  try {
    let cur: Element | null = el;
    for (let i = 0; i < 6 && cur; i += 1) {
      if (cur.tagName === 'LABEL') return cur;
      cur = cur.parentElement ?? null;
    }
    return null;
  } catch {
    return null;
  }
}

export function computeAccessibleName(input: unknown): string {
  if (!isElement(input)) return '';
  const el = input as Element;
  const doc: Document | undefined =
    typeof document !== 'undefined' ? document : (el.ownerDocument ?? undefined);

  const labelledBy = getAttr(el, 'aria-labelledby');
  if (labelledBy) {
    const ids = labelledBy.split(/\s+/).filter(Boolean);
    if (ids.length > 0 && doc) {
      const parts = ids
        .map((id) => doc.getElementById?.(id))
        .filter((n): n is HTMLElement => !!n)
        .map((n) => elementText(n))
        .filter((s) => s.length > 0);
      if (parts.length > 0) return normalizeText(parts.join(' '));
    }
  }

  const ariaLabel = getAttr(el, 'aria-label');
  if (ariaLabel) return normalizeText(ariaLabel);

  const forLabel = resolveLabelByFor(doc, getAttr(el, 'id'));
  if (forLabel) return normalizeText(forLabel);

  const enclosure = getEnclosingLabel(el);
  if (enclosure) {
    const labelText = elementText(enclosure).replace(elementText(el), '').trim();
    if (labelText) return normalizeText(labelText);
  }

  switch (el.tagName.toLowerCase()) {
    case 'input':
    case 'textarea': {
      const placeholder = getAttr(el, 'placeholder');
      if (placeholder) return normalizeText(placeholder);
      break;
    }
    case 'img':
    case 'area': {
      const alt = getAttr(el, 'alt');
      if (alt) return normalizeText(alt);
      break;
    }
  }

  switch (el.tagName.toLowerCase()) {
    case 'button':
    case 'a':
    case 'label':
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6':
    case 'span':
    case 'div':
    case 'li':
    case 'td':
    case 'th':
    case 'option':
    case 'summary': {
      const txt = elementText(el);
      if (txt) return txt;
      break;
    }
  }

  const title = getAttr(el, 'title');
  if (title) return normalizeText(title);

  if (el.tagName.toLowerCase() === 'button') {
    const val = getAttr(el, 'value');
    if (val) return normalizeText(val);
  }

  return '';
}

export function extractVisibleText(input: unknown, sensitive = false): string {
  if (!isElement(input)) return '';
  if (sensitive) return '';
  const el = input as Element;
  switch (el.tagName.toLowerCase()) {
    case 'input':
    case 'select':
    case 'textarea': {
      const txt = elementText(el);
      return txt;
    }
    default: {
      return elementText(el);
    }
  }
}

export const _priv = { normalizeText, resolveLabelByFor, getEnclosingLabel };

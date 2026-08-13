import { SENSITIVE_AUTOCOMPLETE_TOKENS, SENSITIVE_INPUT_TYPES } from './constants';
import type { FieldSensitivity } from './types';

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

function htmlElement(input: unknown): HTMLElement | null {
  if (!isElement(input)) return null;
  if ('focus' in input && typeof (input as HTMLElement).focus === 'function')
    return input as HTMLElement;
  return null;
}

export function detectSensitivity(input: unknown): FieldSensitivity {
  const el = htmlElement(input);
  if (!el) return 'none';
  const tag = el.tagName.toLowerCase();
  if (tag === 'input') {
    const type = (getAttr(el, 'type') ?? 'text').toLowerCase();
    if (SENSITIVE_INPUT_TYPES.includes(type)) return 'password';
  }
  const autocomplete = (getAttr(el, 'autocomplete') ?? '').toLowerCase();
  if (autocomplete) {
    const tokens = autocomplete.split(/\s+/);
    const sensitive = tokens.some((t) => SENSITIVE_AUTOCOMPLETE_TOKENS.includes(t));
    if (sensitive) {
      const hasPassword = tokens.some((t) => t.includes('password'));
      return hasPassword ? 'password' : 'sensitive';
    }
  }
  return 'none';
}

export function isSensitive(input: unknown): boolean {
  return detectSensitivity(input) !== 'none';
}

export function sanitizeFieldValue(input: unknown, rawValue: unknown): string | null {
  const sens = detectSensitivity(input);
  if (sens !== 'none') return null;
  if (typeof rawValue !== 'string') return null;
  const v = rawValue.trim();
  if (v.length === 0) return null;
  if (v.length > 400) return `${v.slice(0, 399)}…`;
  return v;
}

export function sanitizeVisibleText(
  input: unknown,
  rawText: string,
  sensitivity?: FieldSensitivity,
): string {
  const s = sensitivity ?? detectSensitivity(input);
  if (s !== 'none') return '';
  return typeof rawText === 'string' ? rawText : '';
}

export function sanitizeValue(input: unknown): string | null {
  const el = htmlElement(input);
  if (!el) return null;
  const tag = el.tagName.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') {
    const raw = (el as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value ?? '';
    return sanitizeFieldValue(input, raw);
  }
  return null;
}

export const _priv = { htmlElement };

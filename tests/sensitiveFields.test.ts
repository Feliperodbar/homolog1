import { describe, it, expect } from 'vitest';
import {
  detectSensitivity,
  isSensitive,
  sanitizeFieldValue,
  sanitizeVisibleText,
  sanitizeValue,
} from '../extension/src/shared/sensitiveFields';

describe('detectSensitivity', () => {
  it('input type=password → password', () => {
    const el = document.createElement('input');
    el.type = 'password';
    expect(detectSensitivity(el)).toBe('password');
    expect(isSensitive(el)).toBe(true);
  });

  it('input autocomplete="current-password" → password', () => {
    const el = document.createElement('input');
    el.type = 'text';
    el.autocomplete = 'current-password';
    expect(detectSensitivity(el)).toBe('password');
  });

  it('input autocomplete="cc-number" → sensitive (nao password)', () => {
    const el = document.createElement('input');
    el.autocomplete = 'cc-number';
    expect(detectSensitivity(el)).toBe('sensitive');
    expect(isSensitive(el)).toBe(true);
  });

  it('input autocomplete="cc-csc" → sensitive', () => {
    const el = document.createElement('input');
    el.autocomplete = 'cc-csc';
    expect(detectSensitivity(el)).toBe('sensitive');
  });

  it('input autocomplete="new-password" → password', () => {
    const el = document.createElement('input');
    el.autocomplete = 'section-shipping new-password';
    expect(detectSensitivity(el)).toBe('password');
  });

  it('input comum → none', () => {
    const el = document.createElement('input');
    el.type = 'email';
    expect(detectSensitivity(el)).toBe('none');
    expect(isSensitive(el)).toBe(false);
  });

  it('div qualquer → none', () => {
    const el = document.createElement('div');
    expect(detectSensitivity(el)).toBe('none');
  });

  it('null / undefined → none', () => {
    expect(detectSensitivity(null)).toBe('none');
    expect(detectSensitivity(undefined)).toBe('none');
  });
});

describe('sanitizeFieldValue', () => {
  it('campo sensivel retorna null sempre', () => {
    const el = document.createElement('input');
    el.type = 'password';
    expect(sanitizeFieldValue(el, 'segredo123')).toBeNull();
  });
  it('campo normal retorna valor trimado', () => {
    const el = document.createElement('input');
    el.type = 'text';
    expect(sanitizeFieldValue(el, '  ola  ')).toBe('ola');
  });
  it('valor vazio retorna null', () => {
    const el = document.createElement('input');
    expect(sanitizeFieldValue(el, '   ')).toBeNull();
  });
  it('valor >400 trunca com reticencias', () => {
    const el = document.createElement('input');
    el.type = 'text';
    const val = 'a'.repeat(500);
    const r = sanitizeFieldValue(el, val);
    expect(r).not.toBeNull();
    expect(r!.length).toBe(400);
    expect(r!.endsWith('…')).toBe(true);
  });
});

describe('sanitizeVisibleText', () => {
  it('password retorna vazio', () => {
    const el = document.createElement('input');
    el.type = 'password';
    expect(sanitizeVisibleText(el, 'meu texto')).toBe('');
  });
  it('sensibilidade explicitada password → vazio', () => {
    const div = document.createElement('div');
    expect(sanitizeVisibleText(div, 'xpto', 'password')).toBe('');
  });
  it('sensibilidade sensitive → vazio', () => {
    const div = document.createElement('div');
    expect(sanitizeVisibleText(div, 'xpto', 'sensitive')).toBe('');
  });
  it('none retorna texto original', () => {
    const div = document.createElement('div');
    expect(sanitizeVisibleText(div, 'visivel', 'none')).toBe('visivel');
  });
});

describe('sanitizeValue', () => {
  it('input type=password sempre null', () => {
    const el = document.createElement('input');
    el.type = 'password';
    (el as HTMLInputElement).value = 'abc123';
    expect(sanitizeValue(el)).toBeNull();
  });
  it('input text retorna value quando nao vazio', () => {
    const el = document.createElement('input');
    el.type = 'text';
    (el as HTMLInputElement).value = 'meu_nome@ex.com';
    expect(sanitizeValue(el)).toBe('meu_nome@ex.com');
  });
  it('textarea comum retorna valor', () => {
    const el = document.createElement('textarea');
    (el as HTMLTextAreaElement).value = 'descricao longa';
    expect(sanitizeValue(el)).toBe('descricao longa');
  });
  it('div (nao inputavel) retorna null', () => {
    const el = document.createElement('div');
    (el as HTMLElement).textContent = 'nao e campo';
    expect(sanitizeValue(el)).toBeNull();
  });
  it('input com autocomplete cc-csc nullifica o valor', () => {
    const el = document.createElement('input');
    el.type = 'text';
    el.autocomplete = 'cc-csc';
    (el as HTMLInputElement).value = '123';
    expect(sanitizeValue(el)).toBeNull();
  });
});

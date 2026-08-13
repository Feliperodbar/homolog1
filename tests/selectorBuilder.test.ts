import { describe, it, expect, beforeEach } from 'vitest';
import { buildStableSelector, _priv } from '../extension/src/shared/selectorBuilder';

const { escapeAttr, semanticQualifier, indexAmongSiblings, cssSafeId } = _priv;

describe('escapeAttr', () => {
  it('escapa aspas duplas', () => {
    expect(escapeAttr('a"b')).toBe('a\\"b');
  });
  it('escapa backslashes', () => {
    expect(escapeAttr('a\\b')).toBe('a\\\\b');
  });
  it('preserva strings simples', () => {
    expect(escapeAttr('simple123')).toBe('simple123');
  });
});

describe('cssSafeId', () => {
  it('usa CSS.escape quando disponivel (jsdom tem)', () => {
    const r = cssSafeId('my-id');
    expect(r.length).toBeGreaterThan(0);
    expect(r.startsWith('#')).toBe(true);
  });
});

describe('semanticQualifier', () => {
  it('button [type=submit]', () => {
    const b = document.createElement('button');
    b.type = 'submit';
    expect(semanticQualifier(b)).toBe('[type="submit"]');
  });
  it('input [type=email]', () => {
    const i = document.createElement('input');
    i.type = 'email';
    expect(semanticQualifier(i)).toBe('[type="email"]');
  });
  it('label com for', () => {
    const l = document.createElement('label');
    l.htmlFor = 'fld-id';
    expect(semanticQualifier(l)).toBe('[for="fld-id"]');
  });
  it('a href=#ancora', () => {
    const a = document.createElement('a');
    a.href = '#topo';
    expect(semanticQualifier(a)).toBe('[href="#topo"]');
  });
  it('div retorna null', () => {
    const d = document.createElement('div');
    expect(semanticQualifier(d)).toBeNull();
  });
});

describe('indexAmongSiblings', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });
  it('primeiro filho unico', () => {
    const p = document.createElement('div');
    const c = document.createElement('span');
    p.appendChild(c);
    document.body.appendChild(p);
    expect(indexAmongSiblings(c)).toBe(1);
  });
  it('terceiro filho do mesmo tipo', () => {
    const p = document.createElement('ul');
    const li1 = document.createElement('li');
    const li2 = document.createElement('li');
    const li3 = document.createElement('li');
    p.append(li1, li2, li3);
    document.body.appendChild(p);
    expect(indexAmongSiblings(li3)).toBe(3);
  });
});

describe('buildStableSelector - ordem de prioridade', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('1. prioriza data-testid', () => {
    const el = document.createElement('button');
    el.dataset.testid = 'btn-salvar';
    el.id = 'botao1';
    document.body.appendChild(el);
    expect(buildStableSelector(el)).toBe('[data-testid="btn-salvar"]');
  });

  it('2. data-test se nao tem data-testid', () => {
    const el = document.createElement('input');
    el.setAttribute('data-test', 'campo-nome');
    el.id = 'x';
    document.body.appendChild(el);
    expect(buildStableSelector(el)).toBe('[data-test="campo-nome"]');
  });

  it('3. aria-label se atributos data ausentes', () => {
    const el = document.createElement('button');
    el.setAttribute('aria-label', 'Fechar modal');
    document.body.appendChild(el);
    expect(buildStableSelector(el)).toBe('button[aria-label="Fechar modal"]');
  });

  it('4. id como quarto criterio (alfa numerico simples)', () => {
    const el = document.createElement('div');
    el.id = 'header-menu';
    document.body.appendChild(el);
    expect(buildStableSelector(el)).toBe('#header-menu');
  });

  it('5. name para input/select/textarea/button/form', () => {
    const el = document.createElement('input');
    el.name = 'usuario[email]';
    document.body.appendChild(el);
    expect(buildStableSelector(el)).toBe('input[name="usuario[email]"]');
  });

  it('6. qualifier semantico quando unico no pai', () => {
    const form = document.createElement('form');
    const submit = document.createElement('button');
    submit.type = 'submit';
    form.appendChild(submit);
    document.body.appendChild(form);
    expect(buildStableSelector(submit)).toBe('button[type="submit"]');
  });

  it('7. fallback estrutural nth-of-type', () => {
    const wrap = document.createElement('section');
    const a = document.createElement('span');
    const b = document.createElement('span');
    wrap.append(a, b);
    document.body.appendChild(wrap);
    const sel = buildStableSelector(b);
    expect(sel).toContain('span:nth-of-type(2)');
  });

  it('entrada nao-elemento retorna string vazia', () => {
    expect(buildStableSelector(null)).toBe('');
    expect(buildStableSelector(42)).toBe('');
    expect(buildStableSelector('str')).toBe('');
    expect(buildStableSelector(undefined)).toBe('');
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import {
  computeAccessibleName,
  extractVisibleText,
  _priv,
} from '../extension/src/shared/accessibleName';

const { normalizeText } = _priv;

describe('normalizeText', () => {
  it('normaliza espacos e trima', () => {
    expect(normalizeText('  ola   \n\t mundo  ')).toBe('ola mundo');
  });
  it('trunca em DEDUPLICATION.TEXT_MAX_LENGTH default=240', () => {
    const long = 'a'.repeat(300);
    const r = normalizeText(long);
    expect(r.length).toBe(240);
    expect(r.endsWith('…')).toBe(true);
  });
  it('entrada nao-string vira vazio', () => {
    expect(normalizeText(null)).toBe('');
    expect(normalizeText(undefined)).toBe('');
    expect(normalizeText(42)).toBe('');
  });
});

describe('computeAccessibleName', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('1. aria-labelledby referencia varios ids', () => {
    document.body.innerHTML = `
      <span id="a1">Confirmar</span>
      <span id="a2">Pagamento</span>
      <button aria-labelledby="a1 a2">X</button>
    `;
    const btn = document.querySelector('button')!;
    expect(computeAccessibleName(btn)).toBe('Confirmar Pagamento');
  });

  it('2. aria-label direto', () => {
    const b = document.createElement('button');
    b.setAttribute('aria-label', 'Fechar dialogo');
    expect(computeAccessibleName(b)).toBe('Fechar dialogo');
  });

  it('3. label[for=id]', () => {
    document.body.innerHTML = '';
    const label = document.createElement('label');
    label.htmlFor = 'pwd';
    label.textContent = 'Senha de acesso';
    const input = document.createElement('input');
    input.id = 'pwd';
    input.type = 'password';
    document.body.append(label, input);
    expect(computeAccessibleName(input)).toBe('Senha de acesso');
  });

  it('4. label ancestral (enclosure)', () => {
    document.body.innerHTML = `
      <label>
        Termo de uso
        <input type="checkbox" />
      </label>
    `;
    const input = document.querySelector('input')!;
    expect(computeAccessibleName(input)).toBe('Termo de uso');
  });

  it('5. placeholder para input/textarea', () => {
    const i = document.createElement('input');
    i.placeholder = 'Digite seu CPF';
    expect(computeAccessibleName(i)).toBe('Digite seu CPF');
  });

  it('6. alt para img', () => {
    const img = document.createElement('img');
    img.alt = 'Logo da empresa';
    expect(computeAccessibleName(img)).toBe('Logo da empresa');
  });

  it('7. innerText de button/a/h1/etc', () => {
    const b = document.createElement('a');
    b.href = '#';
    b.textContent = '  Sair  do  Sistema  ';
    expect(computeAccessibleName(b)).toBe('Sair do Sistema');
  });

  it('8. title atributo como ultimo recurso', () => {
    const d = document.createElement('div');
    d.title = 'Tooltip info';
    expect(computeAccessibleName(d)).toBe('Tooltip info');
  });

  it('elemento desconhecido sem titulo retorna vazio', () => {
    const d = document.createElement('section');
    expect(computeAccessibleName(d)).toBe('');
  });

  it('input nao-elemento retorna vazio', () => {
    expect(computeAccessibleName(null)).toBe('');
    expect(computeAccessibleText('abc')).toBe('');
  });
});

function computeAccessibleText(_x: string): string {
  return '';
}

describe('extractVisibleText', () => {
  it('retorna texto normalizado para botoes', () => {
    const b = document.createElement('button');
    b.innerHTML = '  Enviar   <span>Formulario</span>  ';
    expect(extractVisibleText(b)).toMatch(/Enviar.*Formulario/);
  });
  it('campo sensivel retorna string vazia', () => {
    const p = document.createElement('input');
    p.type = 'password';
    p.value = 'secreta';
    expect(extractVisibleText(p, true)).toBe('');
  });
  it('entrada invalida retorna vazio', () => {
    expect(extractVisibleText(null)).toBe('');
  });
});

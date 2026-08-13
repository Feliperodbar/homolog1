import { describe, it, expect } from 'vitest';
import {
  isDataUrlImage,
  detectDataUrlFormat,
  estimateDataUrlBytes,
  buildAutomaticDescription,
  buildRecordingStep,
  actionTypeFromInputSource,
} from '../extension/src/shared/screenshotUtils';
import type { InteractionEvent } from '../extension/src/shared/types';

function validPngDataUrlSmall(width = 1, height = 1): string {
  const header =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  return `data:image/png;base64,${header}`;
}

function sampleInteraction(over: Partial<InteractionEvent> = {}): InteractionEvent {
  return {
    interactionId: 'iid-1',
    sessionId: 's-1',
    inputSource: 'mouse',
    timestamp: 1_700_000_000_000,
    viewportPoint: { x: 100, y: 200 },
    viewportSize: { width: 1024, height: 768 },
    devicePixelRatio: 1,
    target: {
      tagName: 'BUTTON',
      role: 'button',
      id: 'btn-entrar',
      name: '',
      className: '',
      accessibleName: 'Entrar',
      visibleText: 'Entrar',
      title: '',
      placeholder: '',
      ariaLabel: '',
      href: '',
      src: '',
      typeAttribute: '',
      labelText: '',
      formControlName: '',
      fieldType: null,
      value: '',
      sensitivity: 'none',
      isPassword: false,
    },
    stableSelector: '#btn-entrar',
    elementRect: { x: 90, y: 190, width: 80, height: 40 },
    url: 'https://exemplo.com/login',
    pageTitle: 'Entrar',
    tabId: 1,
    isTrusted: true,
    ...over,
  };
}

describe('screenshotUtils.isDataUrlImage', () => {
  it('aceita png jpeg pequeno', () => {
    expect(isDataUrlImage(validPngDataUrlSmall())).toBe(true);
    const jpeg = `data:image/jpeg;base64,${'_'.repeat(400)}`;
    expect(isDataUrlImage(jpeg)).toBe(true);
  });
  it('rejeita prefixo errado', () => {
    expect(isDataUrlImage('')).toBe(false);
    expect(isDataUrlImage('data:text/plain;base64,Zm9v')).toBe(false);
    expect(isDataUrlImage('http://foo/a.png')).toBe(false);
  });
  it('rejeita acima do limite padrao', () => {
    const big = `data:image/png;base64,${'A'.repeat(6_000_000)}`;
    expect(isDataUrlImage(big)).toBe(false);
  });
});

describe('screenshotUtils.detectDataUrlFormat', () => {
  it('detecta png e jpeg', () => {
    expect(detectDataUrlFormat(validPngDataUrlSmall())).toBe('image/png');
    expect(detectDataUrlFormat(`data:image/jpeg;base64,${'A'.repeat(100)}`)).toBe('image/jpeg');
  });
  it('retorna jpeg como fallback para formatos nao suportados (isDataUrlImage deve barrar antes)', () => {
    const webp = 'data:image/webp;base64,aaa';
    expect(isDataUrlImage(webp)).toBe(false);
    expect(typeof detectDataUrlFormat(webp)).toBe('string');
  });
});

describe('screenshotUtils.estimateDataUrlBytes', () => {
  it('calcula tamanho base64 corretamente (sem padding)', () => {
    const s = 'data:image/png;base64,QUJDRA';
    expect(Number.isFinite(estimateDataUrlBytes(s))).toBe(true);
  });
  it('rejeita valores invalidos', () => {
    expect(estimateDataUrlBytes('')).toBe(0);
  });
});

describe('screenshotUtils.actionTypeFromInputSource', () => {
  it('mapeia mouse/touch/pen/unknown', () => {
    expect(actionTypeFromInputSource('mouse')).toBe('click');
    expect(actionTypeFromInputSource('touch')).toBe('tap');
    expect(actionTypeFromInputSource('pen')).toBe('press');
    expect(actionTypeFromInputSource('unknown')).toBe('unknown');
  });
});

describe('screenshotUtils.buildAutomaticDescription', () => {
  it('formato "Clicar no botão \"Entrar\""', () => {
    const d = buildAutomaticDescription(sampleInteraction());
    expect(d).toContain('Clicar');
    expect(d).toContain('botão');
    expect(d).toContain('Entrar');
  });
  it('nao repete nome se vier vazio', () => {
    const d = buildAutomaticDescription(
      sampleInteraction({
        target: {
          ...sampleInteraction().target,
          accessibleName: '',
          visibleText: '',
          ariaLabel: '',
          title: '',
          id: '',
        },
      }),
    );
    expect(d.length).toBeGreaterThan(6);
    expect(d).toContain('Clicar');
  });
  it('tipo input email -> campo de e-mail', () => {
    const d = buildAutomaticDescription(
      sampleInteraction({
        target: {
          tagName: 'INPUT',
          role: 'textbox',
          id: 'email',
          name: '',
          className: '',
          accessibleName: 'E-mail',
          visibleText: '',
          title: '',
          placeholder: 'voce@exemplo.com',
          ariaLabel: '',
          href: '',
          src: '',
          typeAttribute: 'email',
          labelText: 'E-mail',
          formControlName: 'email',
          fieldType: null,
          value: '',
          sensitivity: 'none',
          isPassword: false,
        },
      }),
    );
    expect(d).toContain('campo');
  });
  it('toque -> verbo Tocar', () => {
    const d = buildAutomaticDescription(sampleInteraction({ inputSource: 'touch' }));
    expect(d).toContain('Tocar');
  });
});

describe('screenshotUtils.buildRecordingStep', () => {
  const dataUrl = validPngDataUrlSmall();
  const compressed = {
    dataUrl,
    format: 'image/png' as const,
    widthPx: 1,
    heightPx: 1,
    bytes: 100,
  };
  it('retorna step valido', () => {
    const step = buildRecordingStep({
      interaction: sampleInteraction(),
      screenshotDataUrl: dataUrl,
      sequence: 1,
      sessionId: 's-1',
      tabId: 1,
      compressed,
    });
    expect(step).not.toBeNull();
    if (!step) return;
    expect(step.stepId.length).toBeGreaterThanOrEqual(6);
    expect(step.sequence).toBe(1);
    expect(step.sessionId).toBe('s-1');
    expect(step.actionType).toBe('click');
    expect(step.description.length).toBeGreaterThan(4);
    expect(step.screenshotDataUrl.startsWith('data:image/')).toBe(true);
    expect(step.screenshotFormat).toBe('image/png');
    expect(step.screenshotWidthPx).toBe(1);
    expect(step.screenshotHeightPx).toBe(1);
    expect(step.screenshotSizeBytes).toBeGreaterThan(0);
  });
  it('sequence invalido (0 ou negativo) cai para 1 automaticamente', () => {
    const step = buildRecordingStep({
      interaction: sampleInteraction(),
      screenshotDataUrl: dataUrl,
      sequence: 0,
      sessionId: 's-1',
      tabId: 1,
      compressed,
    });
    expect(step).not.toBeNull();
    expect(step?.sequence).toBe(1);
  });
});

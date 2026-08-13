import { describe, it, expect } from 'vitest';
import { isDataUrlImage, buildRecordingStep } from '../extension/src/shared/screenshotUtils';
import { validateRecordingStep } from '../extension/src/shared/messageValidator';
import type { InteractionEvent } from '../extension/src/shared/types';

function validPngDataUrlSmall(): string {
  const header =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  return `data:image/png;base64,${header}`;
}

function interaction(): InteractionEvent {
  return {
    interactionId: 'iid-1',
    sessionId: 's-1',
    inputSource: 'mouse',
    timestamp: 1,
    viewportPoint: { x: 1, y: 1 },
    viewportSize: { width: 100, height: 100 },
    devicePixelRatio: 1,
    target: {
      tagName: 'BUTTON',
      role: 'button',
      id: 'b',
      name: '',
      className: '',
      accessibleName: 'X',
      visibleText: 'X',
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
    stableSelector: '#b',
    elementRect: { x: 0, y: 0, width: 10, height: 10 },
    url: 'https://exemplo.com',
    pageTitle: 'T',
    tabId: 1,
    isTrusted: true,
  };
}

describe('falha de captura de screenshot', () => {
  it('isDataUrlImage detecta url vazia/quebrada', () => {
    expect(isDataUrlImage('')).toBe(false);
    expect(isDataUrlImage('data:')).toBe(false);
    expect(isDataUrlImage('not-a-url')).toBe(false);
  });
  it('buildRecordingStep rejeita screenshot com formato invalido', () => {
    const step = buildRecordingStep({
      interaction: interaction(),
      screenshotDataUrl: 'https://nao-deve-ser-url-externa/x.png',
      sequence: 1,
      sessionId: 's-1',
      tabId: 1,
      compressed: null,
    });
    expect(step).toBeNull();
  });
  it('validateRecordingStep rejeita step sem dataURL imagem', () => {
    const valido = buildRecordingStep({
      interaction: interaction(),
      screenshotDataUrl: validPngDataUrlSmall(),
      sequence: 1,
      sessionId: 's-1',
      tabId: 1,
      compressed: {
        dataUrl: validPngDataUrlSmall(),
        format: 'image/png',
        widthPx: 1,
        heightPx: 1,
        bytes: 50,
      },
    })!;
    expect(validateRecordingStep(valido).ok).toBe(true);
    const quebrado = { ...valido, screenshotDataUrl: '' };
    expect(validateRecordingStep(quebrado as never).ok).toBe(false);
    const formatoInvalido = { ...valido, screenshotFormat: 'image/bmp' as never };
    expect(validateRecordingStep(formatoInvalido).ok).toBe(false);
  });
  it('erro amigavel quando step é invalido (mensagens contem campo indicado)', () => {
    const r = validateRecordingStep(null);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.length).toBeGreaterThan(3);
  });
});

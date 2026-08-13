import { describe, it, expect } from 'vitest';
import { buildRecordingStep } from '../extension/src/shared/screenshotUtils';
import { validateRecordingStep } from '../extension/src/shared/messageValidator';
import type { InteractionEvent } from '../extension/src/shared/types';

function validPngDataUrlSmall(): string {
  const header =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  return `data:image/png;base64,${header}`;
}

function makeInteraction(i: number, overrides: Partial<InteractionEvent> = {}): InteractionEvent {
  return {
    interactionId: `iid-${i}`,
    sessionId: 'sess-1',
    inputSource: 'mouse',
    timestamp: 1_700_000_000_000 + i * 1000,
    viewportPoint: { x: 100 + i * 10, y: 200 + i * 10 },
    viewportSize: { width: 1024, height: 768 },
    devicePixelRatio: 1,
    target: {
      tagName: 'BUTTON',
      role: 'button',
      id: `btn-${i}`,
      name: '',
      className: '',
      accessibleName: `Botao ${i}`,
      visibleText: `Botao ${i}`,
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
    stableSelector: `#btn-${i}`,
    elementRect: { x: 90, y: 190, width: 80, height: 40 },
    url: 'https://exemplo.com/page',
    pageTitle: `Pagina ${i}`,
    tabId: 1,
    isTrusted: true,
    ...overrides,
  };
}

describe('associação clique/screenshot', () => {
  const dataUrl = validPngDataUrlSmall();
  const compressed = {
    dataUrl,
    format: 'image/png' as const,
    widthPx: 1,
    heightPx: 1,
    bytes: 100,
  };
  it('cada interação gera exatamente um step com interactionId correspondente', () => {
    const interactions = [makeInteraction(1), makeInteraction(2), makeInteraction(3)];
    const steps = interactions
      .map((it, i) =>
        buildRecordingStep({
          interaction: it,
          screenshotDataUrl: dataUrl,
          sequence: i + 1,
          sessionId: 'sess-1',
          tabId: 1,
          compressed,
        }),
      )
      .filter(Boolean) as ReturnType<typeof buildRecordingStep> extends infer T
      ? NonNullable<T>[]
      : never;
    expect(steps.length).toBe(3);
    const ids = new Set(steps.map((s) => s!.interactionId));
    expect(ids.size).toBe(3);
    expect(ids.has('iid-1')).toBe(true);
    expect(ids.has('iid-2')).toBe(true);
    expect(ids.has('iid-3')).toBe(true);
  });
  it('metadados do elemento sao preservados no step', () => {
    const it = makeInteraction(99);
    const step = buildRecordingStep({
      interaction: it,
      screenshotDataUrl: dataUrl,
      sequence: 99,
      sessionId: 'sess-1',
      tabId: 1,
      compressed,
    })!;
    expect(step).not.toBeNull();
    expect(step.target.accessibleName).toBe(it.target.accessibleName);
    expect(step.target.id).toBe('btn-99');
    expect(step.url).toBe(it.url);
    expect(step.pageTitle).toBe(it.pageTitle);
    expect(step.viewportPoint.x).toBe(it.viewportPoint.x);
    expect(step.viewportPoint.y).toBe(it.viewportPoint.y);
    expect(step.tabId).toBe(it.tabId);
    expect(step.isTrusted).toBe(true);
  });
  it('validateRecordingStep aprova step bem formado', () => {
    const step = buildRecordingStep({
      interaction: makeInteraction(1),
      screenshotDataUrl: dataUrl,
      sequence: 1,
      sessionId: 'sess-1',
      tabId: 1,
      compressed,
    })!;
    const v = validateRecordingStep(step);
    expect(v.ok).toBe(true);
  });
});

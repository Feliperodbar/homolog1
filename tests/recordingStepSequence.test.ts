import { describe, it, expect } from 'vitest';
import { buildRecordingStep } from '../extension/src/shared/screenshotUtils';
import { validateRecordingStep } from '../extension/src/shared/messageValidator';
import type { InteractionEvent, RecordingStep } from '../extension/src/shared/types';

function validPngDataUrlSmall(): string {
  const header =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  return `data:image/png;base64,${header}`;
}

function makeInteraction(i: number): InteractionEvent {
  return {
    interactionId: `iid-${i}`,
    sessionId: 'sess-1',
    inputSource: 'mouse',
    timestamp: 1_700_000_000_000 + i * 1000,
    viewportPoint: { x: i, y: i },
    viewportSize: { width: 1024, height: 768 },
    devicePixelRatio: 1,
    target: {
      tagName: 'BUTTON',
      role: 'button',
      id: `b-${i}`,
      name: '',
      className: '',
      accessibleName: `B${i}`,
      visibleText: `B${i}`,
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
    stableSelector: `#b-${i}`,
    elementRect: { x: 0, y: 0, width: 10, height: 10 },
    url: 'https://exemplo.com',
    pageTitle: 'Teste',
    tabId: 1,
    isTrusted: true,
  };
}

describe('sequenciamento de passos', () => {
  const dataUrl = validPngDataUrlSmall();
  const compressed = {
    dataUrl,
    format: 'image/png' as const,
    widthPx: 1,
    heightPx: 1,
    bytes: 100,
  };

  it('sequence começa em 1 e cresce estritamente', () => {
    const n = 5;
    const steps: RecordingStep[] = [];
    for (let i = 0; i < n; i += 1) {
      const s = buildRecordingStep({
        interaction: makeInteraction(i + 1),
        screenshotDataUrl: dataUrl,
        sequence: i + 1,
        sessionId: 'sess-1',
        tabId: 1,
        compressed,
      });
      expect(s).not.toBeNull();
      if (s) steps.push(s);
    }
    expect(steps.length).toBe(n);
    for (let i = 0; i < n; i += 1) {
      expect(steps[i].sequence).toBe(i + 1);
    }
    for (let i = 1; i < n; i += 1) {
      expect(steps[i].timestamp).toBeGreaterThanOrEqual(steps[i - 1].timestamp);
    }
  });

  it('stepIds sao unicos mesmo com sequence igual (caso hipotetico repeticao)', () => {
    const s1 = buildRecordingStep({
      interaction: makeInteraction(1),
      screenshotDataUrl: dataUrl,
      sequence: 1,
      sessionId: 'sess-1',
      tabId: 1,
      compressed,
    })!;
    const s2 = buildRecordingStep({
      interaction: makeInteraction(2),
      screenshotDataUrl: dataUrl,
      sequence: 1,
      sessionId: 'sess-1',
      tabId: 1,
      compressed,
    })!;
    expect(s1.stepId).not.toEqual(s2.stepId);
  });

  it('cada step passa validateRecordingStep', () => {
    for (let i = 0; i < 10; i += 1) {
      const s = buildRecordingStep({
        interaction: makeInteraction(i + 1),
        screenshotDataUrl: dataUrl,
        sequence: i + 1,
        sessionId: 'sess-1',
        tabId: 1,
        compressed,
      })!;
      const v = validateRecordingStep(s);
      expect(v.ok).toBe(true);
    }
  });
});

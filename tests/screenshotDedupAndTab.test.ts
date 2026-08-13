import { describe, it, expect } from 'vitest';
import { buildRecordingStep } from '../extension/src/shared/screenshotUtils';
import { validateRecordingStep } from '../extension/src/shared/messageValidator';
import type { InteractionEvent, RecordingStep } from '../extension/src/shared/types';

function validPngDataUrlSmall(): string {
  const header =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  return `data:image/png;base64,${header}`;
}

function interaction(i: number, tabId = 1): InteractionEvent {
  return {
    interactionId: `iid-${i}`,
    sessionId: 'sess-1',
    inputSource: 'mouse',
    timestamp: 1_700_000_000_000 + i * 1000,
    viewportPoint: { x: i, y: i },
    viewportSize: { width: 100, height: 100 },
    devicePixelRatio: 1,
    target: {
      tagName: 'BUTTON',
      role: 'button',
      id: `b${i}`,
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
    stableSelector: `#b${i}`,
    elementRect: { x: 0, y: 0, width: 10, height: 10 },
    url: 'https://exemplo.com',
    pageTitle: 'T',
    tabId,
    isTrusted: true,
  };
}

function buildStep(i: number, tab = 1, seq = i, sessionId = 'sess-1'): RecordingStep {
  return buildRecordingStep({
    interaction: interaction(i, tab),
    screenshotDataUrl: validPngDataUrlSmall(),
    sequence: seq,
    sessionId,
    tabId: tab,
    compressed: {
      dataUrl: validPngDataUrlSmall(),
      format: 'image/png',
      widthPx: 1,
      heightPx: 1,
      bytes: 50,
    },
  }) as RecordingStep;
}

function isDuplicateInteractionStep(
  steps: Array<RecordingStep>,
  interactionId: string,
  windowMs = 1500,
  timestampNow = Date.now(),
): boolean {
  for (let i = steps.length - 1; i >= 0; i -= 1) {
    const s = steps[i];
    if (timestampNow - s.timestamp > windowMs) break;
    if (s.interactionId === interactionId) return true;
  }
  return false;
}

describe('deduplicação de passos', () => {
  it('mesmo interactionId na janela de 1.5s é considerado duplicado', () => {
    const s1 = buildStep(1);
    const agora = s1.timestamp + 100;
    expect(isDuplicateInteractionStep([s1], s1.interactionId, 1500, agora)).toBe(true);
  });
  it('fora da janela de 1.5s não é duplicado', () => {
    const s1 = buildStep(1);
    const depois = s1.timestamp + 20_000;
    expect(isDuplicateInteractionStep([s1], s1.interactionId, 1500, depois)).toBe(false);
  });
  it('interactionIds diferentes nunca são duplicados', () => {
    const s1 = buildStep(1);
    const s2 = buildStep(2);
    const agora = s2.timestamp + 1;
    expect(isDuplicateInteractionStep([s1], s2.interactionId, 1500, agora)).toBe(false);
  });
});

describe('validação de aba (associação sender vs sessão)', () => {
  function abasCoincidem(
    sessionTab: number | null,
    senderTab: number | null,
  ): { ok: boolean; error?: string } {
    if (sessionTab === null || senderTab === null) return { ok: true };
    if (sessionTab !== senderTab) {
      return {
        ok: false,
        error: `aba sender ${senderTab} diferente da sessao ${sessionTab}`,
      };
    }
    return { ok: true };
  }
  it('permite quando ambas abas sao iguais', () => {
    expect(abasCoincidem(1, 1).ok).toBe(true);
  });
  it('rejeita quando abas diferem', () => {
    const r = abasCoincidem(1, 99);
    expect(r.ok).toBe(false);
    expect(r.error).toContain('diferente');
  });
  it('aceita aba null (ainda não definida em runtime)', () => {
    expect(abasCoincidem(null, 1).ok).toBe(true);
    expect(abasCoincidem(1, null).ok).toBe(true);
    expect(abasCoincidem(null, null).ok).toBe(true);
  });
  it('step gravado carrega tabId do sender esperado', () => {
    const step42 = buildStep(1, 42);
    expect(step42.tabId).toBe(42);
    expect(validateRecordingStep(step42).ok).toBe(true);
  });
  it('sessionId diferente nao invalida aba, mas step pertence ao seu sessionId', () => {
    const stepA = buildStep(1, 1, 1, 'sess-A');
    const stepB = buildStep(1, 1, 1, 'sess-B');
    expect(stepA.sessionId).toBe('sess-A');
    expect(stepB.sessionId).toBe('sess-B');
    expect(stepA.sessionId === stepB.sessionId).toBe(false);
  });
});

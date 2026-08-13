import { describe, it, expect } from 'vitest';
import {
  validateRuntimeMessage,
  validateRecordingSession,
  validateInteractionEvent,
} from '../extension/src/shared/messageValidator';
import type { InteractionEvent, RecordingSession } from '../extension/src/shared/types';

describe('validateRuntimeMessage', () => {
  it('mensagens validas dos tipos conhecidos', () => {
    for (const t of [
      'GET_STATE',
      'START',
      'PAUSE',
      'RESUME',
      'FINALIZE',
      'INCREMENT_STEP',
      'RESET',
      '__STATE_CHANGED__',
      '__GET_LAST_INTERACTION__',
      '__RECORD_INTERACTION__',
    ] as const) {
      const r = validateRuntimeMessage({ type: t });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.type).toBe(t);
    }
  });
  it('rejeita tipo desconhecido', () => {
    const r = validateRuntimeMessage({ type: 'QUALQUER_OUTRO' });
    expect(r.ok).toBe(false);
  });
  it('rejeita nao-objetos', () => {
    expect(validateRuntimeMessage(null).ok).toBe(false);
    expect(validateRuntimeMessage('string').ok).toBe(false);
    expect(validateRuntimeMessage(42).ok).toBe(false);
    expect(validateRuntimeMessage(undefined).ok).toBe(false);
  });
  it('rejeita payload nao-objeto', () => {
    const r = validateRuntimeMessage({ type: 'START', payload: ['qualquer'] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/payload/);
  });
  it('aceita payload objeto ou undefined/null', () => {
    expect(validateRuntimeMessage({ type: 'START', payload: { a: 1 } }).ok).toBe(true);
    expect(validateRuntimeMessage({ type: 'START', payload: undefined }).ok).toBe(true);
    expect(validateRuntimeMessage({ type: 'START', payload: null }).ok).toBe(true);
  });
});

function sampleSession(over: Partial<RecordingSession> = {}): RecordingSession {
  return {
    sessionId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    state: 'idle',
    tabId: 1,
    stepCount: 0,
    startedAt: null,
    pausedAt: null,
    endedAt: null,
    lastUpdatedAt: Date.now(),
    ...over,
  };
}

describe('validateRecordingSession', () => {
  it('sessao idle valida', () => {
    expect(validateRecordingSession(sampleSession())).toBe(true);
  });
  it('todos os 4 estados validos', () => {
    for (const s of ['idle', 'recording', 'paused', 'finalized'] as const) {
      expect(validateRecordingSession(sampleSession({ state: s }))).toBe(true);
    }
  });
  it('estado desconhecido invalido', () => {
    expect(validateRecordingSession(sampleSession({ state: 'QUEBRADO' as never }))).toBe(false);
  });
  it('tabId null permitido', () => {
    expect(validateRecordingSession(sampleSession({ tabId: null }))).toBe(true);
  });
  it('stepCount negativo invalido', () => {
    expect(validateRecordingSession(sampleSession({ stepCount: -1 }))).toBe(false);
  });
  it('lastUpdatedAt NaN invalido', () => {
    expect(validateRecordingSession(sampleSession({ lastUpdatedAt: NaN }))).toBe(false);
  });
  it('nao objeto → false', () => {
    expect(validateRecordingSession(null)).toBe(false);
    expect(validateRecordingSession('session')).toBe(false);
  });
});

function sampleInteraction(over: Partial<InteractionEvent> = {}): InteractionEvent {
  return {
    interactionId: 'inter-00000000-0000-0000-0000-000000000000',
    sessionId: 'sess-00000000-0000-0000-0000-000000000000',
    target: {
      tagName: 'BUTTON',
      visibleText: 'Salvar',
      accessibleName: 'Salvar',
      ariaLabel: null,
      title: null,
      id: null,
      name: null,
      role: 'button',
      fieldType: null,
      value: null,
      sensitivity: 'none',
    },
    viewportPoint: { x: 120, y: 80 },
    elementRect: { x: 100, y: 60, width: 80, height: 32 },
    url: 'https://example.com/path?q=1',
    pageTitle: 'Pagina Exemplo',
    viewportSize: { width: 1280, height: 720 },
    devicePixelRatio: 1.5,
    timestamp: Date.now(),
    stableSelector: 'button[type="submit"]',
    inputSource: 'mouse',
    isTrusted: true,
    ...over,
  };
}

describe('validateInteractionEvent', () => {
  it('evento exemplo valido', () => {
    const r = validateInteractionEvent(sampleInteraction());
    expect(r.ok).toBe(true);
  });

  it('rejeita nao-objeto', () => {
    expect(validateInteractionEvent(null).ok).toBe(false);
    expect(validateInteractionEvent(42).ok).toBe(false);
  });

  it('rejeita interactionId ausente ou muito longo', () => {
    expect(validateInteractionEvent(sampleInteraction({ interactionId: '' as never })).ok).toBe(
      false,
    );
    const r = validateInteractionEvent(sampleInteraction({ interactionId: 'x'.repeat(200) }));
    expect(r.ok).toBe(false);
  });

  it('rejeita target invalido', () => {
    const r = validateInteractionEvent(
      sampleInteraction({ target: { ...sampleInteraction().target, tagName: '' } }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/target/);
  });

  it('rejeita sensitivity invalido', () => {
    const ev = sampleInteraction();
    const bad = { ...ev, target: { ...ev.target, sensitivity: 'xxx' as never } };
    expect(validateInteractionEvent(bad).ok).toBe(false);
  });

  it('rejeita viewportPoint com NaN', () => {
    const r = validateInteractionEvent(sampleInteraction({ viewportPoint: { x: NaN, y: 0 } }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/viewportPoint/);
  });

  it('rejeita elementRect width negativa', () => {
    const r = validateInteractionEvent(
      sampleInteraction({ elementRect: { x: 0, y: 0, width: -1, height: 10 } }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/elementRect/);
  });

  it('viewportSize exige width/height numericos finitos', () => {
    const bad = { ...sampleInteraction(), viewportSize: { width: -1, height: 800 } as never };
    expect(validateInteractionEvent(bad).ok).toBe(false);
  });

  it('devicePixelRatio < 0.1 invalido', () => {
    expect(validateInteractionEvent(sampleInteraction({ devicePixelRatio: 0 })).ok).toBe(false);
    expect(validateInteractionEvent(sampleInteraction({ devicePixelRatio: 2 })).ok).toBe(true);
  });

  it('inputSource deve estar na enum', () => {
    expect(
      validateInteractionEvent(sampleInteraction({ inputSource: 'teclado' as never })).ok,
    ).toBe(false);
    for (const s of ['mouse', 'touch', 'pen', 'unknown'] as const) {
      expect(validateInteractionEvent(sampleInteraction({ inputSource: s })).ok).toBe(true);
    }
  });

  it('isTrusted deve ser booleano', () => {
    expect(validateInteractionEvent(sampleInteraction({ isTrusted: 1 as never })).ok).toBe(false);
    expect(validateInteractionEvent(sampleInteraction({ isTrusted: false })).ok).toBe(true);
  });

  it('sessionId null permitido', () => {
    expect(validateInteractionEvent(sampleInteraction({ sessionId: null })).ok).toBe(true);
  });

  it('value string longa > 400 eh rejeitada', () => {
    const ev = sampleInteraction();
    const bad = {
      ...ev,
      target: { ...ev.target, value: 'a'.repeat(401) },
    };
    expect(validateInteractionEvent(bad).ok).toBe(false);
  });
});

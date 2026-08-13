import { describe, it, expect } from 'vitest';
import {
  createEmptySession,
  createNewSession,
  start,
  pause,
  resume,
  finalize,
  incrementStep,
  reset,
  isValidTransition,
  applyTransition,
  cloneSession,
} from '../extension/src/shared/stateMachine';
import { RecordingSession, RecordingState, Transition } from '../extension/src/shared/types';

function freeze<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

describe('createEmptySession / createNewSession', () => {
  it('createEmptySession retorna sessão idle vazia', () => {
    const s = createEmptySession();
    expect(s.state).toBe('idle');
    expect(s.sessionId).toBe('');
    expect(s.tabId).toBeNull();
    expect(s.stepCount).toBe(0);
    expect(s.startedAt).toBeNull();
    expect(s.pausedAt).toBeNull();
    expect(s.endedAt).toBeNull();
    expect(typeof s.lastUpdatedAt).toBe('number');
  });

  it('createNewSession gera UUID, tabId opcional e estado idle', () => {
    const s = createNewSession(42);
    expect(s.state).toBe('idle');
    expect(s.sessionId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(s.tabId).toBe(42);
    expect(s.stepCount).toBe(0);
    expect(s.startedAt).toBeNull();
    expect(s.pausedAt).toBeNull();
    expect(s.endedAt).toBeNull();

    const s2 = createNewSession();
    expect(s2.tabId).toBeNull();
    expect(s2.sessionId).not.toBe(s.sessionId);
  });

  it('createNewSession aceita sessionId customizado', () => {
    const custom = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const s = createNewSession(7, custom);
    expect(s.sessionId).toBe(custom);
    expect(s.tabId).toBe(7);
  });

  it('cloneSession cria cópia rasa independente', () => {
    const s = createNewSession(1);
    const c = cloneSession(s);
    expect(c).toEqual(s);
    expect(c).not.toBe(s);
  });
});

describe('START transition', () => {
  it('idle → START muda para recording e define startedAt', () => {
    const s = createNewSession(99);
    const beforeMs = Date.now();
    const r = start(freeze(s));
    const afterMs = Date.now();
    expect(r.changed).toBe(true);
    expect(r.session.state).toBe('recording');
    expect(r.session.tabId).toBe(99);
    expect(r.session.startedAt).toBeGreaterThanOrEqual(beforeMs);
    expect(r.session.startedAt).toBeLessThanOrEqual(afterMs);
    expect(r.session.pausedAt).toBeNull();
    expect(r.session.endedAt).toBeNull();
    expect(r.session.stepCount).toBe(0);
  });

  it('recording → START é no-op', () => {
    const idle = createNewSession();
    const recording = start(idle).session;
    const r = start(freeze(recording));
    expect(r.changed).toBe(false);
    expect(r.reason).toContain('gravando');
    expect(r.session.state).toBe('recording');
  });

  it('paused → START é inválido', () => {
    const paused = start(createNewSession()).session;
    const paused2 = pause(paused).session;
    const r = start(freeze(paused2));
    expect(r.changed).toBe(false);
    expect(r.reason).toContain('invalido');
    expect(r.session.state).toBe('paused');
  });

  it('finalized → START é inválido (deve usar reset primeiro)', () => {
    const fin = start(createNewSession()).session;
    const fin2 = finalize(fin).session;
    const r = start(freeze(fin2));
    expect(r.changed).toBe(false);
    expect(r.reason).toContain('invalido');
    expect(r.session.state).toBe('finalized');
  });
});

describe('PAUSE transition', () => {
  it('recording → PAUSE muda para paused e define pausedAt', () => {
    const recording = start(createNewSession(5)).session;
    const before = Date.now();
    const r = pause(freeze(recording));
    const after = Date.now();
    expect(r.changed).toBe(true);
    expect(r.session.state).toBe('paused');
    expect(r.session.pausedAt).toBeGreaterThanOrEqual(before);
    expect(r.session.pausedAt).toBeLessThanOrEqual(after);
    expect(r.session.startedAt).not.toBeNull();
    expect(r.session.endedAt).toBeNull();
  });

  it('paused → PAUSE é no-op', () => {
    const rec = start(createNewSession()).session;
    const paus = pause(rec).session;
    const r = pause(freeze(paus));
    expect(r.changed).toBe(false);
    expect(r.reason).toContain('pausado');
  });

  it.each(['idle', 'finalized'] as RecordingState[])('%s → PAUSE é inválido', (state) => {
    const s = { ...createNewSession(), state };
    const r = pause(freeze(s));
    expect(r.changed).toBe(false);
    expect(r.reason).toContain('invalido');
  });
});

describe('RESUME transition', () => {
  it('paused → RESUME volta para recording e limpa pausedAt', () => {
    const rec = start(createNewSession(3)).session;
    const paus = pause(rec).session;
    expect(paus.pausedAt).not.toBeNull();
    const r = resume(freeze(paus));
    expect(r.changed).toBe(true);
    expect(r.session.state).toBe('recording');
    expect(r.session.pausedAt).toBeNull();
    expect(r.session.startedAt).not.toBeNull();
  });

  it('recording → RESUME é no-op', () => {
    const rec = start(createNewSession()).session;
    const r = resume(freeze(rec));
    expect(r.changed).toBe(false);
    expect(r.reason).toContain('gravando');
  });

  it.each(['idle', 'finalized'] as RecordingState[])('%s → RESUME é inválido', (state) => {
    const s = { ...createNewSession(), state };
    const r = resume(freeze(s));
    expect(r.changed).toBe(false);
    expect(r.reason).toContain('invalido');
  });
});

describe('FINALIZE transition', () => {
  it('recording → FINALIZE vai para finalized e define endedAt', () => {
    const rec = start(createNewSession(10)).session;
    const before = Date.now();
    const r = finalize(freeze(rec));
    const after = Date.now();
    expect(r.changed).toBe(true);
    expect(r.session.state).toBe('finalized');
    expect(r.session.pausedAt).toBeNull();
    expect(r.session.endedAt).toBeGreaterThanOrEqual(before);
    expect(r.session.endedAt).toBeLessThanOrEqual(after);
  });

  it('paused → FINALIZE vai para finalized e limpa pausedAt', () => {
    const paus = pause(start(createNewSession()).session).session;
    const r = finalize(freeze(paus));
    expect(r.changed).toBe(true);
    expect(r.session.state).toBe('finalized');
    expect(r.session.pausedAt).toBeNull();
    expect(r.session.endedAt).not.toBeNull();
  });

  it('finalized → FINALIZE é no-op', () => {
    const fin = finalize(start(createNewSession()).session).session;
    const r = finalize(freeze(fin));
    expect(r.changed).toBe(false);
    expect(r.reason).toContain('finalizado');
  });

  it('idle → FINALIZE é inválido', () => {
    const r = finalize(createNewSession());
    expect(r.changed).toBe(false);
    expect(r.reason).toContain('invalido');
  });
});

describe('INCREMENT_STEP', () => {
  it('incrementStep aumenta contador apenas durante recording', () => {
    let s = start(createNewSession()).session;
    expect(s.stepCount).toBe(0);
    const r1 = incrementStep(freeze(s));
    expect(r1.changed).toBe(true);
    expect(r1.session.stepCount).toBe(1);
    s = r1.session;
    const r2 = incrementStep(freeze(s));
    expect(r2.session.stepCount).toBe(2);
    const r3 = incrementStep(freeze(r2.session));
    expect(r3.session.stepCount).toBe(3);
  });

  it.each(['idle', 'paused', 'finalized'] as RecordingState[])(
    '%s → INCREMENT_STEP é inválido',
    (state) => {
      const s = { ...createNewSession(), state, stepCount: 2 };
      const r = incrementStep(freeze(s));
      expect(r.changed).toBe(false);
      expect(r.session.stepCount).toBe(2);
    },
  );
});

describe('RESET', () => {
  it('reset de qualquer estado cria nova sessão idle com mesmo tabId por padrão', () => {
    const base = finalize(incrementStep(start(createNewSession(77)).session).session).session;
    const r = reset(freeze(base));
    expect(r.changed).toBe(true);
    expect(r.session.state).toBe('idle');
    expect(r.session.tabId).toBe(77);
    expect(r.session.stepCount).toBe(0);
    expect(r.session.startedAt).toBeNull();
    expect(r.session.pausedAt).toBeNull();
    expect(r.session.endedAt).toBeNull();
    expect(r.session.sessionId).not.toBe(base.sessionId);
    expect(r.reason).toBe('reset');
  });

  it('reset aceita novo tabId', () => {
    const s = start(createNewSession(1)).session;
    const r = reset(freeze(s), 999);
    expect(r.session.tabId).toBe(999);
    expect(r.session.state).toBe('idle');
  });
});

describe('isValidTransition', () => {
  const cases: Array<{ state: RecordingState; ok: Transition[]; bad: Transition[] }> = [
    {
      state: 'idle',
      ok: ['START', 'RESET'],
      bad: ['PAUSE', 'RESUME', 'FINALIZE', 'INCREMENT_STEP'],
    },
    {
      state: 'recording',
      ok: ['PAUSE', 'FINALIZE', 'INCREMENT_STEP', 'RESET'],
      bad: ['START', 'RESUME'],
    },
    {
      state: 'paused',
      ok: ['RESUME', 'FINALIZE', 'RESET'],
      bad: ['START', 'PAUSE', 'INCREMENT_STEP'],
    },
    {
      state: 'finalized',
      ok: ['RESET'],
      bad: ['START', 'PAUSE', 'RESUME', 'FINALIZE', 'INCREMENT_STEP'],
    },
  ];

  for (const c of cases) {
    for (const t of c.ok) {
      it(`${c.state} → ${t} é válido`, () => {
        expect(isValidTransition(c.state, t)).toBe(true);
      });
    }
    for (const t of c.bad) {
      it(`${c.state} → ${t} é inválido`, () => {
        expect(isValidTransition(c.state, t)).toBe(false);
      });
    }
  }
});

describe('applyTransition dispatch genérico', () => {
  it('aplica START via applyTransition', () => {
    const r = applyTransition(createNewSession(1), 'START');
    expect(r.changed).toBe(true);
    expect(r.session.state).toBe('recording');
  });

  it('transição inválida via applyTransition retorna changed=false e reason descritivo', () => {
    const r = applyTransition(createNewSession(), 'PAUSE');
    expect(r.changed).toBe(false);
    expect(r.reason).toContain('PAUSE');
    expect(r.reason).toContain('idle');
  });

  it('round-trip completo: idle → start → pause → resume → increment(3x) → finalize → reset', () => {
    let cur: RecordingSession = createNewSession(42);
    const originalId = cur.sessionId;
    expect(cur.state).toBe('idle');

    cur = applyTransition(cur, 'START').session;
    expect(cur.state).toBe('recording');
    expect(cur.startedAt).not.toBeNull();

    cur = applyTransition(cur, 'PAUSE').session;
    expect(cur.state).toBe('paused');
    expect(cur.pausedAt).not.toBeNull();

    cur = applyTransition(cur, 'RESUME').session;
    expect(cur.state).toBe('recording');
    expect(cur.pausedAt).toBeNull();

    cur = applyTransition(cur, 'INCREMENT_STEP').session;
    cur = applyTransition(cur, 'INCREMENT_STEP').session;
    cur = applyTransition(cur, 'INCREMENT_STEP').session;
    expect(cur.stepCount).toBe(3);

    cur = applyTransition(cur, 'FINALIZE').session;
    expect(cur.state).toBe('finalized');
    expect(cur.endedAt).not.toBeNull();
    expect(cur.sessionId).toBe(originalId);
    expect(cur.stepCount).toBe(3);
    expect(cur.tabId).toBe(42);

    cur = applyTransition(cur, 'RESET').session;
    expect(cur.state).toBe('idle');
    expect(cur.sessionId).not.toBe(originalId);
    expect(cur.stepCount).toBe(0);
    expect(cur.tabId).toBe(42);
  });
});

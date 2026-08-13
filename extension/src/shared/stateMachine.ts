import { RecordingSession, RecordingState, Transition, TransitionResult } from './types';
import { uuidv4 } from './uuid';

export function createEmptySession(): RecordingSession {
  return {
    sessionId: '',
    state: 'idle',
    tabId: null,
    stepCount: 0,
    startedAt: null,
    pausedAt: null,
    endedAt: null,
    lastUpdatedAt: Date.now(),
  };
}

export function createNewSession(
  tabId: number | null = null,
  sessionId: string = uuidv4(),
): RecordingSession {
  const now = Date.now();
  return {
    sessionId,
    state: 'idle',
    tabId,
    stepCount: 0,
    startedAt: null,
    pausedAt: null,
    endedAt: null,
    lastUpdatedAt: now,
  };
}

export function cloneSession(session: RecordingSession): RecordingSession {
  return {
    ...session,
  };
}

function _updated(session: RecordingSession): RecordingSession {
  return { ...session, lastUpdatedAt: Date.now() };
}

export function isValidTransition(state: RecordingState, transition: Transition): boolean {
  const m: Record<RecordingState, ReadonlyArray<Transition>> = {
    idle: ['START', 'RESET'],
    recording: ['PAUSE', 'FINALIZE', 'INCREMENT_STEP', 'RESET'],
    paused: ['RESUME', 'FINALIZE', 'RESET'],
    finalized: ['RESET'],
  };
  return m[state].includes(transition);
}

function _nop(session: RecordingSession, reason = 'no-op'): TransitionResult {
  return { session, changed: false, reason };
}

export function start(session: RecordingSession): TransitionResult {
  const s = cloneSession(session);
  if (s.state === 'recording') {
    return _nop(s, 'ja esta gravando');
  }
  if (s.state !== 'idle') {
    return _nop(s, `start invalido a partir de ${s.state}`);
  }
  const now = Date.now();
  s.state = 'recording';
  s.startedAt = s.startedAt ?? now;
  s.pausedAt = null;
  s.endedAt = null;
  return { session: _updated(s), changed: true };
}

export function pause(session: RecordingSession): TransitionResult {
  const s = cloneSession(session);
  if (s.state === 'paused') {
    return _nop(s, 'ja esta pausado');
  }
  if (s.state !== 'recording') {
    return _nop(s, `pause invalido a partir de ${s.state}`);
  }
  s.state = 'paused';
  s.pausedAt = Date.now();
  return { session: _updated(s), changed: true };
}

export function resume(session: RecordingSession): TransitionResult {
  const s = cloneSession(session);
  if (s.state === 'recording') {
    return _nop(s, 'ja esta gravando');
  }
  if (s.state !== 'paused') {
    return _nop(s, `resume invalido a partir de ${s.state}`);
  }
  s.state = 'recording';
  s.pausedAt = null;
  return { session: _updated(s), changed: true };
}

export function finalize(session: RecordingSession): TransitionResult {
  const s = cloneSession(session);
  if (s.state === 'finalized') {
    return _nop(s, 'ja finalizado');
  }
  if (s.state !== 'recording' && s.state !== 'paused') {
    return _nop(s, `finalize invalido a partir de ${s.state}`);
  }
  s.state = 'finalized';
  s.pausedAt = null;
  s.endedAt = Date.now();
  return { session: _updated(s), changed: true };
}

export function incrementStep(session: RecordingSession): TransitionResult {
  const s = cloneSession(session);
  if (s.state !== 'recording') {
    return _nop(s, `só e permitido incrementar passos durante gravacao (estado ${s.state})`);
  }
  s.stepCount += 1;
  return { session: _updated(s), changed: true };
}

export function reset(session: RecordingSession, tabId?: number | null): TransitionResult {
  const s = createNewSession(tabId ?? session.tabId ?? null);
  return { session: _updated(s), changed: true, reason: 'reset' };
}

export function applyTransition(
  session: RecordingSession,
  transition: Transition,
): TransitionResult {
  if (!isValidTransition(session.state, transition)) {
    return {
      session: cloneSession(session),
      changed: false,
      reason: `transicao ${transition} invalida a partir de ${session.state}`,
    };
  }
  switch (transition) {
    case 'START':
      return start(session);
    case 'PAUSE':
      return pause(session);
    case 'RESUME':
      return resume(session);
    case 'FINALIZE':
      return finalize(session);
    case 'INCREMENT_STEP':
      return incrementStep(session);
    case 'RESET':
      return reset(session);
  }
}

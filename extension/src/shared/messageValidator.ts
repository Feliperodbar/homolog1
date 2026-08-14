import type {
  InteractionEvent,
  Point2D,
  RecordingSession,
  RecordingStep,
  RectInfo,
  RuntimeMessage,
  RuntimeMessageType,
  TargetElementInfo,
} from './types';
import { SCREENSHOT } from './constants';

const STRING_TYPES: ReadonlySet<RuntimeMessageType> = new Set([
  'GET_STATE',
  'START',
  'PAUSE',
  'RESUME',
  'FINALIZE',
  'INCREMENT_STEP',
  'RESET',
  '__STATE_CHANGED__',
  '__GET_LAST_INTERACTION__',
  '__GET_LAST_STEP__',
  '__LIST_STEPS__',
  '__DELETE_STEP__',
  '__CLEAR_STEPS__',
  '__GET_PROJECT_CONTEXT__',
  '__SAVE_PROJECT_CONTEXT__',
  '__NEW_PROJECT_CONTEXT__',
  '__OPEN_PANEL_BACKGROUND__',
  '__GET_MY_TAB_ID__',
  '__RECORD_INTERACTION__',
  '__REQUEST_SCREENSHOT__',
  '__STEP_RECORDED__',
]);

function isRecord(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === 'object' && !Array.isArray(x);
}

function isNonEmptyString(x: unknown, maxLen = 4096): x is string {
  return typeof x === 'string' && x.length >= 1 && x.length <= maxLen;
}

function isFiniteNumber(x: unknown, min?: number, max?: number): x is number {
  if (typeof x !== 'number' || !Number.isFinite(x)) return false;
  if (typeof min === 'number' && x < min) return false;
  if (typeof max === 'number' && x > max) return false;
  return true;
}

function isNullableString(x: unknown, maxLen = 400): x is string | null {
  if (x === null || x === undefined) return true;
  return typeof x === 'string' && x.length <= maxLen;
}

function isPoint(p: unknown): p is Point2D {
  if (!isRecord(p)) return false;
  return isFiniteNumber(p.x, -10000, 100000) && isFiniteNumber(p.y, -10000, 100000);
}

function isRect(r: unknown): r is RectInfo {
  if (!isRecord(r)) return false;
  return (
    isFiniteNumber(r.x, -10000, 100000) &&
    isFiniteNumber(r.y, -10000, 100000) &&
    isFiniteNumber(r.width, 0, 100000) &&
    isFiniteNumber(r.height, 0, 100000)
  );
}

function isTarget(t: unknown): t is TargetElementInfo {
  if (!isRecord(t)) return false;
  if (!isNonEmptyString(t.tagName, 100)) return false;
  if (typeof t.visibleText !== 'string' || t.visibleText.length > 2000) return false;
  if (typeof t.accessibleName !== 'string' || t.accessibleName.length > 1000) return false;
  if (!isNullableString(t.ariaLabel, 500)) return false;
  if (!isNullableString(t.title, 500)) return false;
  if (!isNullableString(t.id, 200)) return false;
  if (!isNullableString(t.name, 200)) return false;
  if (!isNullableString(t.role, 100)) return false;
  if (!isNullableString(t.fieldType, 60)) return false;
  if (!(t.value === null || (typeof t.value === 'string' && t.value.length <= 400))) return false;
  if (t.sensitivity !== 'none' && t.sensitivity !== 'password' && t.sensitivity !== 'sensitive')
    return false;
  return true;
}

export function validateRuntimeMessage(
  msg: unknown,
): { ok: true; value: RuntimeMessage } | { ok: false; error: string } {
  if (!isRecord(msg)) return { ok: false, error: 'mensagem nao e objeto' };
  const type = msg.type;
  if (!isNonEmptyString(type, 100) || !STRING_TYPES.has(type as RuntimeMessageType)) {
    return { ok: false, error: `tipo de mensagem invalido: ${String(type).slice(0, 80)}` };
  }
  if (msg.payload !== undefined && msg.payload !== null && !isRecord(msg.payload)) {
    return { ok: false, error: 'payload deve ser objeto ou undefined' };
  }
  return { ok: true, value: msg as unknown as RuntimeMessage };
}

export function validateRecordingSession(s: unknown): s is RecordingSession {
  if (!isRecord(s)) return false;
  if (!isNonEmptyString(s.sessionId, 200)) return false;
  if (
    typeof s.state !== 'string' ||
    !['idle', 'recording', 'paused', 'finalized'].includes(s.state)
  )
    return false;
  if (!(s.tabId === null || typeof s.tabId === 'number')) return false;
  if (!isFiniteNumber(s.stepCount, 0, 1_000_000)) return false;
  if (!(s.startedAt === null || isFiniteNumber(s.startedAt))) return false;
  if (!(s.pausedAt === null || isFiniteNumber(s.pausedAt))) return false;
  if (!(s.endedAt === null || isFiniteNumber(s.endedAt))) return false;
  if (!isFiniteNumber(s.lastUpdatedAt)) return false;
  return true;
}

export function validateInteractionEvent(
  ev: unknown,
): { ok: true; value: InteractionEvent } | { ok: false; error: string } {
  if (!isRecord(ev)) return { ok: false, error: 'interacao nao e objeto' };
  if (!isNonEmptyString(ev.interactionId, 128))
    return { ok: false, error: 'interactionId invalido' };
  if (!(ev.sessionId === null || isNonEmptyString(ev.sessionId, 200)))
    return { ok: false, error: 'sessionId invalido' };
  if (!isTarget(ev.target)) return { ok: false, error: 'target invalido' };
  if (!isPoint(ev.viewportPoint)) return { ok: false, error: 'viewportPoint invalido' };
  if (!isRect(ev.elementRect)) return { ok: false, error: 'elementRect invalido' };
  if (!isNonEmptyString(ev.url, 4096)) return { ok: false, error: 'url invalida' };
  if (typeof ev.pageTitle !== 'string' || ev.pageTitle.length > 2000)
    return { ok: false, error: 'pageTitle invalido' };
  if (
    !isRecord(ev.viewportSize) ||
    !isFiniteNumber((ev.viewportSize as Record<string, unknown>).width, 0, 100000) ||
    !isFiniteNumber((ev.viewportSize as Record<string, unknown>).height, 0, 100000)
  ) {
    return { ok: false, error: 'viewportSize invalido' };
  }
  if (!isFiniteNumber(ev.devicePixelRatio, 0.1, 10))
    return { ok: false, error: 'devicePixelRatio invalido' };
  if (!isFiniteNumber(ev.timestamp)) return { ok: false, error: 'timestamp invalido' };
  if (typeof ev.stableSelector !== 'string' || ev.stableSelector.length > 1024)
    return { ok: false, error: 'stableSelector invalido' };
  if (!['mouse', 'touch', 'pen', 'unknown'].includes(String(ev.inputSource))) {
    return { ok: false, error: 'inputSource invalido' };
  }
  if (typeof ev.isTrusted !== 'boolean') return { ok: false, error: 'isTrusted invalido' };
  return { ok: true, value: ev as unknown as InteractionEvent };
}

function isDataUrlImageLoose(x: unknown, maxLen = SCREENSHOT.MAX_DATA_URL_LENGTH): x is string {
  if (typeof x !== 'string') return false;
  if (x.length > maxLen) return false;
  return x.startsWith('data:image/jpeg;base64,') || x.startsWith('data:image/png;base64,');
}

export function validateRecordingStep(
  s: unknown,
): { ok: true; value: RecordingStep } | { ok: false; error: string } {
  if (!isRecord(s)) return { ok: false, error: 'step nao e objeto' };
  if (!isNonEmptyString(s.stepId, 128)) return { ok: false, error: 'stepId invalido' };
  if (!isNonEmptyString(s.sessionId, 200)) return { ok: false, error: 'sessionId invalido' };
  if (!isFiniteNumber(s.sequence, 1, 1_000_000)) return { ok: false, error: 'sequence invalida' };
  if (!['click', 'tap', 'press', 'unknown'].includes(String(s.actionType))) {
    return { ok: false, error: 'actionType invalido' };
  }
  if (!isNonEmptyString(s.interactionId, 128))
    return { ok: false, error: 'interactionId invalido' };
  if (!isTarget(s.target)) return { ok: false, error: 'step target invalido' };
  if (!isPoint(s.viewportPoint)) return { ok: false, error: 'step viewportPoint invalido' };
  if (!isRect(s.elementRect)) return { ok: false, error: 'step elementRect invalido' };
  if (!isNonEmptyString(s.url, 4096)) return { ok: false, error: 'step url invalida' };
  if (typeof s.pageTitle !== 'string' || s.pageTitle.length > 2000)
    return { ok: false, error: 'step pageTitle invalido' };
  if (
    !isRecord(s.viewportSize) ||
    !isFiniteNumber((s.viewportSize as Record<string, unknown>).width, 0, 100000) ||
    !isFiniteNumber((s.viewportSize as Record<string, unknown>).height, 0, 100000)
  ) {
    return { ok: false, error: 'step viewportSize invalido' };
  }
  if (!isFiniteNumber(s.devicePixelRatio, 0.1, 10))
    return { ok: false, error: 'step devicePixelRatio invalido' };
  if (typeof s.stableSelector !== 'string' || s.stableSelector.length > 1024)
    return { ok: false, error: 'step stableSelector invalido' };
  if (!['mouse', 'touch', 'pen', 'unknown'].includes(String(s.inputSource))) {
    return { ok: false, error: 'step inputSource invalido' };
  }
  if (!isDataUrlImageLoose(s.screenshotDataUrl))
    return { ok: false, error: 'step screenshotDataUrl invalido' };
  if (s.screenshotFormat !== 'image/png' && s.screenshotFormat !== 'image/jpeg')
    return { ok: false, error: 'step screenshotFormat invalido' };
  if (!isFiniteNumber(s.screenshotWidthPx, 0, 100000))
    return { ok: false, error: 'step screenshotWidthPx invalido' };
  if (!isFiniteNumber(s.screenshotHeightPx, 0, 100000))
    return { ok: false, error: 'step screenshotHeightPx invalido' };
  if (!isFiniteNumber(s.screenshotSizeBytes, 0, 256 * 1024 * 1024))
    return { ok: false, error: 'step screenshotSizeBytes invalido' };
  if (!isNonEmptyString(s.description, 1024))
    return { ok: false, error: 'step description invalida' };
  if (!isFiniteNumber(s.timestamp)) return { ok: false, error: 'step timestamp invalido' };
  if (!(s.tabId === null || typeof s.tabId === 'number'))
    return { ok: false, error: 'step tabId invalido' };
  if (typeof s.isTrusted !== 'boolean') return { ok: false, error: 'step isTrusted invalido' };
  return { ok: true, value: s as unknown as RecordingStep };
}

export const _priv = {
  isRecord,
  isNonEmptyString,
  isString: isNonEmptyString,
  isFiniteNumber,
  isNullableString,
  isPoint,
  isRect,
  isTarget,
  isDataUrlImageLoose,
};

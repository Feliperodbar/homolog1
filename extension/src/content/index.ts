import { isRestrictedUrl, RestrictionInfo } from '../shared/restrictedUrls';
import {
  _DEDUPLICATION,
  RESTRICTED_PAGE_REASONS,
  SCREENSHOT,
  STORAGE_KEY_RECORDING,
} from '../shared/constants';
import { InteractionDeduplicator } from '../shared/dedupe';
import { computeAccessibleName, extractVisibleText } from '../shared/accessibleName';
import { detectSensitivity, sanitizeValue, sanitizeVisibleText } from '../shared/sensitiveFields';
import { buildStableSelector } from '../shared/selectorBuilder';
import { validateInteractionEvent, validateRuntimeMessage } from '../shared/messageValidator';
import { uuidv4 } from '../shared/uuid';
import type {
  InteractionEvent,
  RecordingSession,
  RuntimeMessage,
  RuntimeResponse,
  RuntimeMessageType,
} from '../shared/types';

const BANNER_ID = '__homolog_restricted_banner__';
const MARKER_ID = SCREENSHOT.POINTER_MARKER_ID;
const OWN_ELEMENT_MARKERS: ReadonlyArray<string> = [BANNER_ID, MARKER_ID];
const FINALIZATION_DELAY_MS = 150;
const MIN_INTERVAL_BETWEEN_CAPTURES_MS = SCREENSHOT.MIN_INTERVAL_BETWEEN_CAPTURES_MS;
const REQUEST_TIMEOUT_MS = SCREENSHOT.TIMEOUT_MS;

const pending = new Map<
  string,
  { createdAt: number; timeoutId: ReturnType<typeof setTimeout> | null }
>();

const logger = {
  info: (...args: unknown[]) => console.log('[homolog:cs]', ...args),
  warn: (...args: unknown[]) => console.warn('[homolog:cs]', ...args),
  error: (...args: unknown[]) => console.error('[homolog:cs]', ...args),
};

const state: {
  recording: boolean;
  sessionId: string | null;
  ownTabId: number | null;
  restricted: boolean;
  dedup: InteractionDeduplicator;
  listenerAttached: boolean;
  lastCaptureStartedAt: number;
  markerTimeoutIds: Array<number>;
} = {
  recording: false,
  sessionId: null,
  ownTabId: null,
  restricted: false,
  dedup: new InteractionDeduplicator(),
  listenerAttached: false,
  lastCaptureStartedAt: 0,
  markerTimeoutIds: [],
};

function getRestrictionInfo(): RestrictionInfo | null {
  try {
    const location = typeof window !== 'undefined' ? window.location?.href : '';
    const info = isRestrictedUrl(location);
    return info.restricted ? info : null;
  } catch {
    return null;
  }
}

function makeBannerText(info: RestrictionInfo): string {
  const base = RESTRICTED_PAGE_REASONS[info.reason ?? 'internal'];
  return base ?? 'O Homolog Recorder não funciona nesta página por restrições do navegador.';
}

function renderBanner(info: RestrictionInfo): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(BANNER_ID)) return;

  const banner = document.createElement('div');
  banner.id = BANNER_ID;
  banner.setAttribute('role', 'status');
  const cssText = [
    'all: initial',
    'position: fixed',
    'top: 8px',
    'left: 50%',
    'transform: translateX(-50%)',
    'z-index: 2147483647',
    'max-width: 640px',
    'width: calc(100% - 32px)',
    'padding: 10px 14px',
    'border-radius: 10px',
    'background: rgba(239,68,68,0.92)',
    'color: #fff',
    'font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
    'font-size: 13px',
    'line-height: 1.4',
    'box-shadow: 0 10px 25px rgba(0,0,0,0.2)',
    'backdrop-filter: blur(4px)',
    'display: flex',
    'gap: 10px',
    'align-items: flex-start',
    'border: 1px solid rgba(255,255,255,0.15)',
  ].join(';');
  banner.style.cssText = cssText;
  banner.innerHTML = [
    `<span aria-hidden="true" style="flex-shrink:0; font-weight:700;">⚠️</span>`,
    `<div>`,
    `<strong style="display:block; margin-bottom:2px;">Homolog Recorder indisponível aqui</strong>`,
    `<span style="opacity:0.95;">${makeBannerText(info)}</span>`,
    `</div>`,
    `<button type="button" aria-label="Fechar aviso" style="`,
    ` all: initial;`,
    ` flex-shrink:0;`,
    ` cursor:pointer;`,
    ` color: #fff;`,
    ` opacity:0.85;`,
    ` font-size:14px;`,
    ` padding: 0 6px;`,
    `">&times;</button>`,
  ].join('');

  const closeBtn = banner.querySelector('button');
  closeBtn?.addEventListener('click', () => {
    banner.style.transition = 'opacity 200ms ease';
    banner.style.opacity = '0';
    setTimeout(() => banner.remove(), 220);
  });

  try {
    document.documentElement.appendChild(banner);
  } catch {
    try {
      document.body.appendChild(banner);
    } catch {
      /* n/a nesta pagina */
    }
  }
}

function insertClickMarker(x: number, y: number): string | null {
  try {
    if (typeof document === 'undefined') return null;
    let marker = document.getElementById(MARKER_ID);
    if (!marker) {
      marker = document.createElement('div');
      marker.id = MARKER_ID;
      marker.setAttribute('data-homolog', 'marker');
      marker.setAttribute('aria-hidden', 'true');
      const radius = SCREENSHOT.POINTER_MARKER_RADIUS_PX;
      const outer = radius * 2;
      marker.style.cssText = [
        'all: initial',
        'position: fixed',
        `left: ${x - radius}px`,
        `top: ${y - radius}px`,
        `width: ${outer}px`,
        `height: ${outer}px`,
        'border-radius: 999px',
        'border: 2px solid #dc2626',
        'box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.22), 0 4px 14px rgba(0,0,0,0.25)',
        'pointer-events: none',
        'z-index: 2147483646',
        'mix-blend-mode: normal',
        'will-change: left, top, opacity',
        'contain: layout style paint',
      ].join(';');
      try {
        document.documentElement.appendChild(marker);
      } catch {
        try {
          document.body.appendChild(marker);
        } catch {
          return null;
        }
      }
    } else {
      const radius = SCREENSHOT.POINTER_MARKER_RADIUS_PX;
      marker.style.left = `${x - radius}px`;
      marker.style.top = `${y - radius}px`;
      marker.style.opacity = '1';
      marker.style.display = 'block';
    }
    return MARKER_ID;
  } catch {
    return null;
  }
}

function removeClickMarker(): void {
  try {
    if (typeof document === 'undefined') return;
    const el = document.getElementById(MARKER_ID);
    if (!el) return;
    el.style.opacity = '0';
    const toId = window.setTimeout(() => {
      try {
        el.remove();
      } catch {
        /* noop */
      }
    }, 120);
    state.markerTimeoutIds.push(Number(toId));
    if (state.markerTimeoutIds.length > 12) {
      const old = state.markerTimeoutIds.shift();
      if (old) clearTimeout(old);
    }
  } catch {
    /* noop */
  }
}

function clearAllMarkerTimeouts(): void {
  while (state.markerTimeoutIds.length) {
    const id = state.markerTimeoutIds.shift();
    if (id) clearTimeout(id);
  }
  removeClickMarker();
}

function isOwnElement(target: EventTarget | null): boolean {
  if (!target) return false;
  try {
    let node: Node | null = target as Node;
    for (let i = 0; i < 20 && node; i += 1) {
      if (node.nodeType === 1) {
        const el = node as Element;
        const id = el.id;
        if (id && OWN_ELEMENT_MARKERS.includes(id)) return true;
      }
      node = node.parentNode ?? null;
    }
  } catch {
    /* n/a */
  }
  return false;
}

function safeGetAttr(el: Element, name: string): string | null {
  try {
    const v = el.getAttribute(name);
    return typeof v === 'string' && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}

function extractTarget(target: EventTarget | null): InteractionEvent['target'] | null {
  if (!target) return null;
  const el = (target as Element).nodeType === 1 ? (target as Element) : null;
  if (!el) return null;
  try {
    void el.tagName;
  } catch {
    return null;
  }
  if (!document.documentElement.contains(el)) {
    return null;
  }
  const sensitivity = detectSensitivity(el);
  const tag = (el.tagName || '').toLowerCase() || 'element';
  const value = sanitizeValue(el);
  const visibleRaw = extractVisibleText(el, sensitivity !== 'none');
  const visibleText = sanitizeVisibleText(el, visibleRaw, sensitivity);
  const accessibleName = sanitizeVisibleText(el, computeAccessibleName(el), sensitivity);
  return {
    tagName: tag,
    visibleText,
    accessibleName,
    ariaLabel: safeGetAttr(el, 'aria-label'),
    title: safeGetAttr(el, 'title'),
    id: safeGetAttr(el, 'id'),
    name: safeGetAttr(el, 'name'),
    role: safeGetAttr(el, 'role'),
    fieldType:
      tag === 'input' || tag === 'button' || tag === 'select' ? safeGetAttr(el, 'type') : null,
    value,
    sensitivity,
  };
}

function resolveInputSource(ev: PointerEvent | null): InteractionEvent['inputSource'] {
  const t = (ev?.pointerType ?? '').toLowerCase();
  if (t === 'mouse' || t === 'touch' || t === 'pen') return t;
  return 'unknown';
}

function sendMessage(
  msg: RuntimeMessage,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<RuntimeResponse> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = window.setTimeout(
      () => {
        if (settled) return;
        settled = true;
        resolve({ ok: false, error: `timeout apos ${timeoutMs}ms` });
      },
      Math.max(500, timeoutMs),
    );
    const finish = (r: RuntimeResponse) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(r);
    };
    try {
      chrome.runtime.sendMessage(msg, (resp: unknown) => {
        const err = chrome.runtime?.lastError;
        if (err && !resp) {
          finish({ ok: false, error: err.message ?? 'runtime error' });
          return;
        }
        if (typeof resp === 'object' && resp !== null && 'ok' in resp) {
          finish(resp as RuntimeResponse);
          return;
        }
        finish({ ok: false, error: 'resposta invalida do bg' });
      });
    } catch (e) {
      finish({
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  });
}

async function finalizeInteraction(id: string, interaction: InteractionEvent): Promise<void> {
  if (!pending.has(id)) return;
  pending.delete(id);

  const msgValid = validateRuntimeMessage({
    type: '__RECORD_INTERACTION__' as RuntimeMessageType,
    payload: { interaction },
  });
  if (!msgValid.ok) {
    logger.warn('mensagem invalida antes do envio', msgValid.error);
    return;
  }
  const evValid = validateInteractionEvent(interaction);
  if (!evValid.ok) {
    logger.warn('interacao invalida antes do envio', evValid.error);
    return;
  }

  const now = Date.now();
  if (now - state.lastCaptureStartedAt < MIN_INTERVAL_BETWEEN_CAPTURES_MS) {
    logger.info(
      `throttle captura: intervalo ${now - state.lastCaptureStartedAt}ms < ${MIN_INTERVAL_BETWEEN_CAPTURES_MS}ms; skip screenshot mas contabiliza interacao`,
    );
    try {
      const r = await sendMessage(msgValid.value);
      if (!r.ok) {
        logger.warn('bg rejeitou interacao throttle', r.error);
        return;
      }
      state.dedup.recordFromInteraction(interaction);
    } catch (e) {
      logger.warn('erro envio throttle', e);
    }
    return;
  }
  state.lastCaptureStartedAt = now;

  let markerRemoved = false;
  const removeMarkerSafe = () => {
    if (markerRemoved) return;
    markerRemoved = true;
    removeClickMarker();
  };

  try {
    insertClickMarker(interaction.viewportPoint.x, interaction.viewportPoint.y);
    await new Promise<void>((r) => window.setTimeout(() => r(), 60));

    const requestMsg = validateRuntimeMessage({
      type: '__REQUEST_SCREENSHOT__' as RuntimeMessageType,
      payload: { interaction },
    });
    if (!requestMsg.ok) {
      logger.warn('request msg invalida', requestMsg.error);
      return;
    }
    const resp = await sendMessage(requestMsg.value);
    if (!resp.ok) {
      logger.warn('bg rejeitou screenshot / step', resp.error);
      return;
    }
    state.dedup.recordFromInteraction(interaction);
  } catch (e) {
    logger.warn('erro ao enviar request screenshot', e);
  } finally {
    removeMarkerSafe();
  }
}

function scheduleInteractionFinalization(
  id: string,
  interaction: InteractionEvent,
  delayMs = FINALIZATION_DELAY_MS,
): void {
  if (pending.has(id)) return;
  const timeoutId = setTimeout(() => {
    void finalizeInteraction(id, interaction);
  }, delayMs);
  pending.set(id, { createdAt: Date.now(), timeoutId });
}

function cancelPendingInteractions(): void {
  for (const [, v] of pending) {
    if (v.timeoutId !== null) clearTimeout(v.timeoutId);
  }
  pending.clear();
  clearAllMarkerTimeouts();
  state.lastCaptureStartedAt = 0;
}

function onPageHideSoon(): void {
  const now = Date.now();
  for (const [id, v] of pending) {
    if (now - v.createdAt < 200) {
      if (v.timeoutId !== null) clearTimeout(v.timeoutId);
      pending.delete(id);
    }
  }
}

function onPointerDownCapture(evt: Event): void {
  try {
    if (!state.recording) return;
    if (state.restricted) return;
    const pe = evt as PointerEvent;
    if (!pe.isTrusted) return;
    if (isOwnElement(evt.target)) return;

    const composedTarget = pe.composedPath?.()?.[0] ?? evt.target;
    const targetInfo = extractTarget(composedTarget);
    if (!targetInfo) return;

    const viewportPoint = {
      x: Number.isFinite(pe.clientX) ? pe.clientX : 0,
      y: Number.isFinite(pe.clientY) ? pe.clientY : 0,
    };
    const el = (composedTarget as Element)?.nodeType === 1 ? (composedTarget as Element) : null;
    let rect: { x: number; y: number; width: number; height: number } = {
      x: viewportPoint.x,
      y: viewportPoint.y,
      width: 0,
      height: 0,
    };
    if (el && typeof el.getBoundingClientRect === 'function') {
      try {
        const r = el.getBoundingClientRect();
        rect = { x: r.x, y: r.y, width: Math.max(0, r.width), height: Math.max(0, r.height) };
      } catch {
        /* n/a */
      }
    }

    const stableSelector = buildStableSelector(el);
    const accessibleName = targetInfo.accessibleName;

    const dup = state.dedup.isDuplicate(
      {
        tagName: targetInfo.tagName,
        selector: stableSelector,
        point: viewportPoint,
        accessibleName,
      },
      Date.now(),
    );
    if (dup.duplicate) {
      logger.info('interacao dedup: ', dup.reason);
      return;
    }

    const interaction: InteractionEvent = {
      interactionId: uuidv4(),
      sessionId: state.sessionId,
      target: targetInfo,
      viewportPoint,
      elementRect: rect,
      url: window.location?.href ?? '',
      pageTitle: document?.title ?? '',
      viewportSize: {
        width: window?.innerWidth ?? 0,
        height: window?.innerHeight ?? 0,
      },
      devicePixelRatio: window?.devicePixelRatio ?? 1,
      timestamp: Date.now(),
      stableSelector,
      inputSource: resolveInputSource(pe),
      isTrusted: true,
    };
    scheduleInteractionFinalization(interaction.interactionId, interaction);
  } catch (e) {
    logger.warn('onPointerDown capture handler falhou', e);
  }
}

function attachListener(): void {
  if (state.listenerAttached) return;
  if (typeof document === 'undefined' || !document.addEventListener) return;
  document.addEventListener('pointerdown', onPointerDownCapture, true);
  state.listenerAttached = true;
  logger.info('pointerdown listener anexado (capture)');
}

function detachListener(): void {
  if (!state.listenerAttached) return;
  if (typeof document === 'undefined') return;
  document.removeEventListener('pointerdown', onPointerDownCapture, true);
  state.listenerAttached = false;
  cancelPendingInteractions();
  logger.info('pointerdown listener removido');
}

function applySessionState(s: RecordingSession | null): void {
  const wasRecording = state.recording;
  const baseRecording = s?.state === 'recording';
  state.sessionId = s?.sessionId ?? null;
  if (baseRecording && s?.tabId !== null && s?.tabId !== undefined && state.ownTabId !== null) {
    if (s.tabId !== state.ownTabId) {
      logger.info(
        `esta aba #${state.ownTabId} nao e a aba gravada #${s.tabId}; desativando recording aqui`,
      );
      state.recording = false;
    } else {
      state.recording = !state.restricted;
    }
  } else if (baseRecording && state.ownTabId === null) {
    logger.info(
      'ownTabId ainda desconhecido; permitindo recording temporariamente (SW filtrara sender.tab.id)',
    );
    state.recording = !state.restricted;
  } else {
    state.recording = baseRecording && !state.restricted;
  }
  if (!wasRecording && state.recording) {
    state.dedup.clear();
    attachListener();
  } else if (wasRecording && !state.recording) {
    detachListener();
  } else if (state.recording && !state.listenerAttached) {
    attachListener();
  }
  logger.info(
    'state aplicado recording=',
    state.recording,
    'sessionId=',
    state.sessionId?.slice(0, 8),
    'ownTabId=',
    state.ownTabId,
    'session.tabId=',
    s?.tabId,
  );
  if (!state.recording) {
    clearAllMarkerTimeouts();
  }
}

async function resolveOwnTabId(): Promise<void> {
  try {
    const msgValid = validateRuntimeMessage({
      type: '__GET_MY_TAB_ID__' as RuntimeMessageType,
    });
    if (!msgValid.ok) return;
    const resp = await sendMessage(msgValid.value, 2500);
    if (resp.ok && typeof (resp as Record<string, unknown>).tabId === 'number') {
      state.ownTabId = (resp as Record<string, unknown>).tabId as number;
      logger.info('content ownTabId resolvido para', state.ownTabId);
    }
  } catch (e) {
    logger.warn('resolveOwnTabId falhou', e);
  }
}

async function fetchInitialState(): Promise<void> {
  try {
    const msgValid = validateRuntimeMessage({ type: 'GET_STATE' as RuntimeMessageType });
    if (!msgValid.ok) return;
    const resp = await sendMessage(msgValid.value);
    if (resp.ok && resp.state) applySessionState(resp.state);
  } catch (e) {
    logger.warn('fetchInitialState falhou', e);
  }
}

function initStorageListener(): void {
  try {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local') return;
      const raw = changes[STORAGE_KEY_RECORDING]?.newValue;
      if (raw && typeof raw === 'object') {
        applySessionState(raw as RecordingSession);
      } else {
        applySessionState(null);
      }
    });
  } catch (e) {
    logger.warn('initStorageListener falhou', e);
  }
}

function initRuntimeListener(): void {
  try {
    chrome.runtime.onMessage.addListener((raw: unknown) => {
      const v = validateRuntimeMessage(raw);
      if (!v.ok) return;
      if (v.value.type === '__STATE_CHANGED__' && v.value.payload?.session) {
        const s = v.value.payload.session as RecordingSession;
        applySessionState(s);
      }
    });
  } catch (e) {
    logger.warn('initRuntimeListener falhou', e);
  }
}

function initPageHideGuard(): void {
  try {
    window.addEventListener('pagehide', onPageHideSoon, true);
    window.addEventListener('beforeunload', onPageHideSoon, true);
  } catch {
    /* n/a */
  }
}

function init(): void {
  try {
    const locationHref = typeof window !== 'undefined' ? window.location?.href ?? '' : '';
    logger.info(
      `content script iniciado readyState=${document?.readyState} location=${locationHref.slice(0, 160)}`,
    );
  } catch {
    logger.info('content script iniciado (sem window disponivel)');
  }
  const restriction = getRestrictionInfo();
  state.restricted = !!restriction;
  const boot = () => {
    void (async () => {
      if (restriction) renderBanner(restriction);
      await resolveOwnTabId();
      await fetchInitialState();
      initStorageListener();
      initRuntimeListener();
      initPageHideGuard();
    })();
  };
  if (typeof document !== 'undefined' && document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
}

init();

export {};

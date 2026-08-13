import { isRestrictedUrl, RestrictionInfo } from '../shared/restrictedUrls';
import {
  DEDUPLICATION as _DEDUPLICATION,
  RESTRICTED_PAGE_REASONS,
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
const OWN_ELEMENT_MARKERS: ReadonlyArray<string> = [BANNER_ID];
const pending = new Map<
  string,
  { createdAt: number; timeoutId: ReturnType<typeof setTimeout> | null }
>();

const logger = {
  info: (...args: unknown[]) => console.debug('[homolog:cs]', ...args),
  warn: (...args: unknown[]) => console.warn('[homolog:cs]', ...args),
};

const state: {
  recording: boolean;
  sessionId: string | null;
  restricted: boolean;
  dedup: InteractionDeduplicator;
  listenerAttached: boolean;
} = {
  recording: false,
  sessionId: null,
  restricted: false,
  dedup: new InteractionDeduplicator(),
  listenerAttached: false,
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

function sendMessage(msg: RuntimeMessage): Promise<RuntimeResponse> {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(msg, (resp: unknown) => {
        const err = chrome.runtime?.lastError;
        if (err && !resp) {
          resolve({ ok: false, error: err.message ?? 'runtime error' });
          return;
        }
        if (typeof resp === 'object' && resp !== null && 'ok' in resp) {
          resolve(resp as RuntimeResponse);
          return;
        }
        resolve({ ok: false, error: 'resposta invalida do bg' });
      });
    } catch (e) {
      resolve({ ok: false, error: e instanceof Error ? e.message : String(e) });
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
  try {
    const r = await sendMessage(msgValid.value);
    if (!r.ok) {
      logger.warn('bg rejeitou interacao', r.error);
      return;
    }
    state.dedup.recordFromInteraction(interaction);
  } catch (e) {
    logger.warn('erro ao enviar interacao', e);
  }
}

function scheduleInteractionFinalization(
  id: string,
  interaction: InteractionEvent,
  delayMs = 180,
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
  state.recording = s?.state === 'recording';
  state.sessionId = s?.sessionId ?? null;
  if (state.restricted) {
    state.recording = false;
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
  );
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
  const restriction = getRestrictionInfo();
  state.restricted = !!restriction;
  if (restriction) {
    if (document.readyState === 'loading') {
      document.addEventListener(
        'DOMContentLoaded',
        () => {
          renderBanner(restriction);
          void fetchInitialState();
          initStorageListener();
          initRuntimeListener();
          initPageHideGuard();
        },
        { once: true },
      );
    } else {
      renderBanner(restriction);
      void fetchInitialState();
      initStorageListener();
      initRuntimeListener();
      initPageHideGuard();
    }
    return;
  }
  if (document.readyState === 'loading') {
    document.addEventListener(
      'DOMContentLoaded',
      () => {
        void fetchInitialState();
        initStorageListener();
        initRuntimeListener();
        initPageHideGuard();
      },
      { once: true },
    );
  } else {
    void fetchInitialState();
    initStorageListener();
    initRuntimeListener();
    initPageHideGuard();
  }
}

init();

export {};

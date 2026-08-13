import {
  createEmptySession,
  createNewSession,
  applyTransition,
  reset as resetSession,
} from '../shared/stateMachine';
import {
  InteractionEvent,
  RecordingSession,
  RuntimeMessage,
  RuntimeResponse,
} from '../shared/types';
import { STORAGE_KEY_LAST_INTERACTION, STORAGE_KEY_RECORDING } from '../shared/constants';
import { validateInteractionEvent, validateRuntimeMessage } from '../shared/messageValidator';

const logger = {
  info: (...args: unknown[]) => console.debug('[homolog:bg]', ...args),
  warn: (...args: unknown[]) => console.warn('[homolog:bg]', ...args),
};

function setActionBadge(state: RecordingSession): void {
  if (!chrome.action) return;
  let text = '';
  let color = '#64748b';
  switch (state.state) {
    case 'recording':
      text = `${state.stepCount}`;
      color = '#dc2626';
      break;
    case 'paused':
      text = 'II';
      color = '#d97706';
      break;
    case 'finalized':
      text = 'OK';
      color = '#2563eb';
      break;
    case 'idle':
    default:
      text = '';
      color = '#64748b';
      break;
  }
  try {
    chrome.action.setBadgeBackgroundColor({ color });
    chrome.action.setBadgeText({ text });
  } catch (e) {
    logger.warn('setBadge falhou', e);
  }
}

async function loadSession(): Promise<RecordingSession> {
  try {
    const raw = await chrome.storage.local.get(STORAGE_KEY_RECORDING);
    const parsed = raw?.[STORAGE_KEY_RECORDING];
    if (parsed && typeof parsed === 'object' && 'sessionId' in parsed) {
      return {
        ...createEmptySession(),
        ...(parsed as RecordingSession),
      };
    }
  } catch (e) {
    logger.warn('loadSession falhou; usando default', e);
  }
  return createNewSession();
}

async function saveSession(session: RecordingSession): Promise<void> {
  try {
    await chrome.storage.local.set({ [STORAGE_KEY_RECORDING]: session });
    setActionBadge(session);
    logger.info('sessao salva', {
      id: session.sessionId.slice(0, 8),
      state: session.state,
      stepCount: session.stepCount,
    });
  } catch (e) {
    logger.warn('saveSession falhou', e);
  }
}

async function loadLastInteraction(): Promise<InteractionEvent | null> {
  try {
    const raw = await chrome.storage.local.get(STORAGE_KEY_LAST_INTERACTION);
    const parsed = raw?.[STORAGE_KEY_LAST_INTERACTION] as InteractionEvent | undefined;
    if (!parsed) return null;
    const valid = validateInteractionEvent(parsed);
    return valid.ok ? valid.value : null;
  } catch {
    return null;
  }
}

async function saveLastInteraction(interaction: InteractionEvent | null): Promise<void> {
  try {
    if (interaction === null) {
      await chrome.storage.local.remove(STORAGE_KEY_LAST_INTERACTION);
      return;
    }
    await chrome.storage.local.set({ [STORAGE_KEY_LAST_INTERACTION]: interaction });
  } catch (e) {
    logger.warn('saveLastInteraction falhou', e);
  }
}

async function broadcastState(session: RecordingSession): Promise<void> {
  try {
    await chrome.runtime.sendMessage({
      type: '__STATE_CHANGED__',
      payload: { session },
    });
  } catch {
    /* popup ou content podem nao estar abertos */
  }
}

async function broadcastInteractionRecorded(
  interaction: InteractionEvent,
  session: RecordingSession,
): Promise<void> {
  try {
    await chrome.runtime.sendMessage({
      type: '__INTERACTION_RECORDED__',
      payload: { interaction, session },
    });
  } catch {
    /* popup pode nao estar aberto */
  }
}

async function getActiveTabId(): Promise<number | null> {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    return tab?.id ?? null;
  } catch {
    return null;
  }
}

async function onGetState(): Promise<RuntimeResponse> {
  const s = await loadSession();
  const last = await loadLastInteraction();
  return { ok: true, state: s, lastInteraction: last ?? undefined };
}

async function onGetLastInteraction(): Promise<RuntimeResponse> {
  const s = await loadSession();
  const last = await loadLastInteraction();
  return { ok: true, state: s, lastInteraction: last ?? undefined };
}

async function onStart(): Promise<RuntimeResponse> {
  const current = await loadSession();
  const tabId = current.tabId ?? (await getActiveTabId());
  let session = current;
  if (session.state === 'idle') {
    const fresh = resetSession(session, tabId).session;
    const r = applyTransition(fresh, 'START');
    session = r.session;
  } else if (session.state === 'finalized') {
    const fresh = createNewSession(tabId);
    const r = applyTransition(fresh, 'START');
    session = r.session;
  } else {
    const r = applyTransition(session, 'START');
    session = r.session;
  }
  session.tabId = session.tabId ?? tabId;
  await saveLastInteraction(null);
  await saveSession(session);
  await broadcastState(session);
  return { ok: true, state: session };
}

async function onSimpleTransition(t: 'PAUSE' | 'RESUME' | 'FINALIZE' | 'INCREMENT_STEP') {
  const current = await loadSession();
  const r = applyTransition(current, t);
  if (!r.changed) {
    return { ok: false, state: r.session, error: r.reason } as RuntimeResponse;
  }
  await saveSession(r.session);
  await broadcastState(r.session);
  return { ok: true, state: r.session } as RuntimeResponse;
}

async function onReset(): Promise<RuntimeResponse> {
  const current = await loadSession();
  const tabId = await getActiveTabId();
  const r = resetSession(current, tabId);
  await saveLastInteraction(null);
  await saveSession(r.session);
  await broadcastState(r.session);
  return { ok: true, state: r.session };
}

async function onInstalled(): Promise<void> {
  logger.info('instalado/atualizado');
  const s = await loadSession();
  if (!s.sessionId) {
    const fresh = createNewSession();
    await saveSession(fresh);
  } else {
    setActionBadge(s);
  }
}

async function onRecordInteraction(
  payload: Record<string, unknown> | undefined,
  sender: chrome.runtime.MessageSender | undefined,
): Promise<RuntimeResponse> {
  const session = await loadSession();
  if (session.state !== 'recording') {
    return { ok: false, state: session, error: 'sessao nao esta gravando' };
  }
  const interactionRaw = payload?.interaction;
  const valid = validateInteractionEvent(interactionRaw);
  if (!valid.ok) {
    return { ok: false, error: `interacao invalida: ${valid.error}` };
  }
  const ev = valid.value;
  if (ev.sessionId && ev.sessionId !== session.sessionId) {
    logger.warn(
      'interacao de outra sessao recebida (esperado=%s recebido=%s); aceitando',
      session.sessionId.slice(0, 8),
      ev.sessionId.slice(0, 8),
    );
  }
  if (sender?.tab?.id !== undefined && session.tabId !== null) {
    if (sender.tab.id !== session.tabId) {
      return {
        ok: false,
        error: `aba enviou interacao diferente da aba original (senderTab ${sender.tab.id} vs sessionTab ${session.tabId})`,
      };
    }
  }
  const stepR = applyTransition(session, 'INCREMENT_STEP');
  let currentFinal: RecordingSession;
  if (!stepR.changed) {
    logger.warn('INCREMENT_STEP nao aplicavel no bg', stepR.reason);
    currentFinal = session;
  } else {
    await saveSession(stepR.session);
    currentFinal = stepR.session;
  }
  await saveLastInteraction(ev);
  await broadcastState(currentFinal);
  await broadcastInteractionRecorded(ev, currentFinal);
  return { ok: true, state: currentFinal, lastInteraction: ev };
}

if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onInstalled) {
  chrome.runtime.onInstalled.addListener(() => {
    void onInstalled();
  });
  chrome.runtime.onStartup.addListener(() => {
    void (async () => {
      const s = await loadSession();
      setActionBadge(s);
    })();
  });

  chrome.runtime.onMessage.addListener((rawMessage, sender, sendResponse) => {
    const msgCheck = validateRuntimeMessage(rawMessage);
    if (!msgCheck.ok) {
      logger.warn('mensagem runtime invalida recebida', msgCheck.error);
      sendResponse({ ok: false, error: msgCheck.error });
      return false;
    }
    const message: RuntimeMessage = msgCheck.value;
    (async () => {
      switch (message.type) {
        case 'GET_STATE':
          return onGetState();
        case '__GET_LAST_INTERACTION__':
          return onGetLastInteraction();
        case 'START':
          return onStart();
        case 'PAUSE':
          return onSimpleTransition('PAUSE');
        case 'RESUME':
          return onSimpleTransition('RESUME');
        case 'FINALIZE':
          return onSimpleTransition('FINALIZE');
        case 'INCREMENT_STEP':
          return onSimpleTransition('INCREMENT_STEP');
        case 'RESET':
          return onReset();
        case '__RECORD_INTERACTION__':
          return onRecordInteraction(message.payload, sender);
        default:
          return {
            ok: false,
            error: `unknown message: ${message.type}`,
          } as RuntimeResponse;
      }
    })()
      .then(sendResponse)
      .catch((e) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }));
    return true;
  });
}

export {};

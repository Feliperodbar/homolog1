import { HOMOLOG_PANEL_DEFAULT_URL, STATE_LABELS } from '../shared/constants';
import { isRestrictedUrl } from '../shared/restrictedUrls';
import {
  InteractionEvent,
  RecordingSession,
  RuntimeMessage,
  RuntimeResponse,
} from '../shared/types';

const els = {
  start: document.getElementById('startBtn') as HTMLButtonElement | null,
  pause: document.getElementById('pauseBtn') as HTMLButtonElement | null,
  resume: document.getElementById('resumeBtn') as HTMLButtonElement | null,
  finalize: document.getElementById('finalizeBtn') as HTMLButtonElement | null,
  reset: document.getElementById('resetBtn') as HTMLButtonElement | null,
  openPanel: document.getElementById('openPanelBtn') as HTMLButtonElement | null,
  statusPill: document.getElementById('statusPill') as HTMLElement | null,
  stepCount: document.getElementById('stepCountBadge') as HTMLElement | null,
  sessionId: document.getElementById('sessionId') as HTMLElement | null,
  startedAt: document.getElementById('startedAt') as HTMLElement | null,
  tabInfo: document.getElementById('tabInfo') as HTMLElement | null,
  restrictedBanner: document.getElementById('restrictedBanner') as HTMLElement | null,
  restrictedReason: document.getElementById('restrictedReason') as HTMLElement | null,
  errorBox: document.getElementById('errorBox') as HTMLElement | null,
  interactionCard: document.getElementById('interactionCard') as HTMLElement | null,
  interactionTag: document.getElementById('interactionTag') as HTMLElement | null,
  interactionTime: document.getElementById('interactionTime') as HTMLElement | null,
  interactionText: document.getElementById('interactionText') as HTMLElement | null,
  interactionSelector: document.getElementById('interactionSelector') as HTMLElement | null,
  interactionCoords: document.getElementById('interactionCoords') as HTMLElement | null,
  interactionSource: document.getElementById('interactionSource') as HTMLElement | null,
};

function formatDateTime(ts: number | null | undefined): string {
  if (!ts) return '—';
  try {
    const d = new Date(ts);
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return '—';
  }
}

function shortSessionId(id: string | null | undefined): string {
  if (!id) return '—';
  const head = id.slice(0, 8);
  const tail = id.slice(-5);
  return `${head}...${tail}`;
}

function setError(msg: string | null): void {
  if (!els.errorBox) return;
  if (!msg) {
    els.errorBox.textContent = '';
    els.errorBox.classList.add('hidden');
    return;
  }
  els.errorBox.textContent = msg;
  els.errorBox.classList.remove('hidden');
}

async function sendMessage(msg: RuntimeMessage): Promise<RuntimeResponse> {
  try {
    const r = (await chrome.runtime.sendMessage(msg)) as RuntimeResponse | undefined;
    if (!r) return { ok: false, error: 'sem resposta do service worker' };
    return r;
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

function updateInteractionView(interaction: InteractionEvent | null | undefined): void {
  if (!els.interactionCard) return;
  if (!interaction) {
    els.interactionCard.classList.add('hidden');
    return;
  }
  els.interactionCard.classList.remove('hidden');
  if (els.interactionTag) {
    els.interactionTag.textContent = interaction.target.tagName || '?';
  }
  if (els.interactionTime) {
    els.interactionTime.textContent = formatDateTime(interaction.timestamp);
  }
  if (els.interactionText) {
    const t = interaction.target.visibleText || interaction.target.accessibleName || '—';
    els.interactionText.textContent = t;
    els.interactionText.title = t;
  }
  if (els.interactionSelector) {
    els.interactionSelector.textContent = interaction.stableSelector || '—';
    els.interactionSelector.title = interaction.stableSelector || '';
  }
  if (els.interactionCoords) {
    els.interactionCoords.textContent = `(${Math.round(interaction.viewportPoint.x)}, ${Math.round(
      interaction.viewportPoint.y,
    )})`;
  }
  if (els.interactionSource) {
    const map: Record<string, string> = {
      mouse: 'Mouse',
      touch: 'Toque',
      pen: 'Caneta',
      unknown: '—',
    };
    els.interactionSource.textContent = map[interaction.inputSource] ?? interaction.inputSource;
  }
}

function updateView(
  session: RecordingSession,
  restricted: boolean,
  interaction?: InteractionEvent | null,
): void {
  if (!els.statusPill) return;
  const stateLabel = STATE_LABELS[session.state] ?? session.state;
  els.statusPill.textContent = stateLabel;
  els.statusPill.className = `pill pill-${session.state}`;

  if (els.stepCount) {
    els.stepCount.textContent = String(session.stepCount ?? 0);
  }
  if (els.sessionId) {
    els.sessionId.textContent = shortSessionId(session.sessionId);
    els.sessionId.title = session.sessionId ?? '';
  }
  if (els.startedAt) {
    els.startedAt.textContent = formatDateTime(session.startedAt);
  }
  if (els.tabInfo) {
    els.tabInfo.textContent =
      typeof session.tabId === 'number' ? `Aba #${session.tabId}` : 'Nenhuma';
  }

  if (els.start) {
    els.start.disabled = session.state !== 'idle' && session.state !== 'finalized';
  }
  if (els.pause) {
    els.pause.disabled = session.state !== 'recording';
  }
  if (els.resume) {
    els.resume.disabled = session.state !== 'paused';
  }
  if (els.finalize) {
    els.finalize.disabled = session.state !== 'recording' && session.state !== 'paused';
  }
  if (els.reset) {
    els.reset.disabled = session.state !== 'finalized' && session.state !== 'idle';
  }

  if (els.restrictedBanner) {
    if (restricted) els.restrictedBanner.classList.remove('hidden');
    else els.restrictedBanner.classList.add('hidden');
  }

  updateInteractionView(interaction ?? null);
}

async function getCurrentTabInfo(): Promise<{
  restricted: boolean;
  tabId: number | null;
  url: string | null;
  title: string | null;
}> {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    const r = isRestrictedUrl(tab?.url);
    return {
      restricted: r.restricted,
      tabId: tab?.id ?? null,
      url: tab?.url ?? null,
      title: tab?.title ?? null,
    };
  } catch {
    return { restricted: false, tabId: null, url: null, title: null };
  }
}

async function refresh(): Promise<void> {
  const [tabInfo, stateResp] = await Promise.all([
    getCurrentTabInfo(),
    sendMessage({ type: 'GET_STATE' }),
  ]);
  if (!stateResp.ok || !stateResp.state) {
    setError(`Erro ao ler estado: ${stateResp.error ?? 'desconhecido'}`);
    return;
  }
  setError(null);
  updateView(stateResp.state, tabInfo.restricted, stateResp.lastInteraction);
}

async function action(type: RuntimeMessage['type']): Promise<void> {
  setError(null);
  const r = await sendMessage({ type });
  if (!r.ok) {
    setError(`Erro: ${r.error ?? 'desconhecido'}`);
  }
  await refresh();
}

async function openPanel(): Promise<void> {
  try {
    await chrome.tabs.create({ url: HOMOLOG_PANEL_DEFAULT_URL });
  } catch (e) {
    setError(`Não foi possível abrir o painel: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function bindButtons(): void {
  els.start?.addEventListener('click', () => void action('START'));
  els.pause?.addEventListener('click', () => void action('PAUSE'));
  els.resume?.addEventListener('click', () => void action('RESUME'));
  els.finalize?.addEventListener('click', () => void action('FINALIZE'));
  els.reset?.addEventListener('click', async () => {
    if (confirm('Iniciar uma nova sessão? Os dados da atual serão descartados.')) {
      await action('RESET');
    }
  });
  els.openPanel?.addEventListener('click', () => void openPanel());

  chrome.storage.onChanged.addListener((_changes, areaName) => {
    if (areaName === 'local') {
      void refresh();
    }
  });
  try {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg?.type === '__STATE_CHANGED__') {
        void refresh();
      } else if (msg?.type === '__INTERACTION_RECORDED__') {
        const interaction = msg?.payload?.interaction as InteractionEvent | undefined;
        if (els.interactionCard) {
          updateInteractionView(interaction ?? null);
        }
        if (els.stepCount && msg?.payload?.session?.stepCount !== undefined) {
          els.stepCount.textContent = String(msg.payload.session.stepCount);
        }
      }
    });
  } catch {
    /* n/a em ambientes sem chrome */
  }
  window.addEventListener('focus', () => void refresh());
}

if (typeof document !== 'undefined') {
  bindButtons();
  void refresh();
}

export {};

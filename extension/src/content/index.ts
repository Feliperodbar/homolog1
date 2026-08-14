import { isRestrictedUrl, RestrictionInfo } from '../shared/restrictedUrls';
import {
  CHROME_MESSAGE_TIMEOUT_MS,
  RESTRICTED_PAGE_REASONS,
  SCREENSHOT,
  STORAGE_KEY_RECORDING,
} from '../shared/constants';
import { computeAccessibleName, extractVisibleText } from '../shared/accessibleName';
import { detectSensitivity, sanitizeValue, sanitizeVisibleText } from '../shared/sensitiveFields';
import { buildStableSelector } from '../shared/selectorBuilder';
import { hasOwnStorageChange } from '../shared/storageChange';
import { validateInteractionEvent, validateRuntimeMessage } from '../shared/messageValidator';
import { uuidv4 } from '../shared/uuid';
import type {
  InteractionEvent,
  RecordingSession,
  RecordingStep,
  RuntimeMessage,
  RuntimeResponse,
  RuntimeMessageType,
} from '../shared/types';

const BANNER_ID = '__homolog_restricted_banner__';
const MARKER_ID = SCREENSHOT.POINTER_MARKER_ID;
const CONTROLS_ID = '__homolog_recording_controls__';
const CONTENT_INSTANCE_ATTRIBUTE = 'data-homolog-recorder-active';
const CONTENT_INSTANCE_GLOBAL = '__homologRecorderContentInitialized__';
const OWN_ELEMENT_MARKERS: ReadonlyArray<string> = [BANNER_ID, MARKER_ID, CONTROLS_ID];
const FINALIZATION_DELAY_MS = 0;
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
  listenerAttached: boolean;
  markerTimeoutIds: Array<number>;
  session: RecordingSession | null;
  controlSteps: Array<RecordingStep>;
  controlsExpanded: boolean;
  projectContext: { name: string; functionality: string; locked?: boolean };
  pendingPanelOpen: boolean;
} = {
  recording: false,
  sessionId: null,
  ownTabId: null,
  restricted: false,
  listenerAttached: false,
  markerTimeoutIds: [],
  session: null,
  controlSteps: [],
  controlsExpanded: false,
  projectContext: { name: 'Projeto padrão', functionality: '', locked: false },
  pendingPanelOpen: false,
};

function setControlsCaptureHidden(hidden: boolean): void {
  const host = document.getElementById(CONTROLS_ID);
  if (host) host.style.visibility = hidden ? 'hidden' : 'visible';
}

async function controlAction(type: 'START' | 'PAUSE' | 'RESUME' | 'FINALIZE'): Promise<void> {
  const response = await sendMessage({ type });
  if (!response.ok) logger.warn('controle flutuante rejeitado', response.error);
  if (response.state) {
    applySessionState(response.state);
    if (response.ok && type === 'START') {
      // Recolhe uma única vez ao iniciar. Atualizações posteriores de passos
      // preservam esse estado visual e nunca reabrem o menu automaticamente.
      state.controlsExpanded = false;
      renderRecordingControls(response.state);
    }
    if (response.ok && type === 'RESUME') {
      // Ao continuar, devolve toda a área útil à página e mantém a mesma sessão.
      state.controlsExpanded = false;
      renderRecordingControls(response.state);
    }
  }
}

async function toggleRecordingControls(): Promise<void> {
  // Abrir e fechar o menu é apenas uma alteração visual. A sessão somente
  // pausa quando o usuário pressiona explicitamente o botão "Pausar".
  state.controlsExpanded = !state.controlsExpanded;
  renderRecordingControls(state.session);
}

function renderStepPreviews(): void {
  const root = document.getElementById(CONTROLS_ID)?.shadowRoot;
  const list = root?.querySelector<HTMLOListElement>('.step-list');
  const empty = root?.querySelector<HTMLElement>('.step-empty');
  if (!list || !empty) return;
  list.replaceChildren();
  const recent = state.controlSteps
    .slice(-12)
    .sort((a, b) => a.sequence - b.sequence);
  empty.hidden = recent.length > 0;
  for (const step of recent) {
    const item = document.createElement('li');
    item.className = 'step-item';
    item.tabIndex = 0;
    item.setAttribute('role', 'button');
    item.setAttribute('aria-label', `Visualizar passo ${step.sequence} em tela cheia`);
    const thumb = document.createElement('div');
    thumb.className = 'thumb';
    if (step.screenshotDataUrl) {
      const image = document.createElement('img');
      image.src = step.screenshotDataUrl;
      image.alt = '';
      thumb.appendChild(image);
    }
    const detail = document.createElement('div');
    detail.className = 'step-detail';
    const title = document.createElement('strong');
    title.textContent = `Passo ${step.sequence}`;
    const description = document.createElement('span');
    description.textContent = step.description || 'Clique registrado';
    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'step-delete';
    deleteButton.textContent = '🗑 Excluir';
    deleteButton.setAttribute('aria-label', `Excluir passo ${step.sequence}`);
    deleteButton.addEventListener('click', (event) => {
      event.stopPropagation();
      void deleteControlStep(step.stepId);
    });
    detail.append(title, description, deleteButton);
    item.append(thumb, detail);
    const openViewer = () => {
      if (!step.screenshotDataUrl) return;
      const viewer = root?.querySelector<HTMLElement>('.viewer');
      const viewerImage = root?.querySelector<HTMLImageElement>('.viewer img');
      const viewerTitle = root?.querySelector<HTMLElement>('.viewer-title');
      if (viewer && viewerImage && viewerTitle) {
        viewerImage.src = step.screenshotDataUrl;
        viewerImage.alt = `Screenshot do passo ${step.sequence}`;
        viewerTitle.textContent = `Passo ${step.sequence} — ${step.description || 'Clique registrado'}`;
        viewer.hidden = false;
        root?.querySelector<HTMLButtonElement>('.viewer-close')?.focus();
      }
    };
    item.addEventListener('click', openViewer);
    item.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openViewer();
      }
    });
    list.appendChild(item);
  }
}

async function refreshControlSteps(): Promise<void> {
  const response = await sendMessage({ type: '__LIST_STEPS__' });
  if (!response.ok || !response.steps) return;
  state.controlSteps = response.steps;
  renderRecordingControls(state.session);
}

async function deleteControlStep(stepId: string): Promise<void> {
  const response = await sendMessage({ type: '__DELETE_STEP__', payload: { stepId } });
  if (!response.ok) {
    logger.warn('não foi possível excluir o passo', response.error);
    return;
  }
  state.controlSteps = response.steps ?? state.controlSteps.filter((step) => step.stepId !== stepId);
  if (response.state) applySessionState(response.state);
  renderRecordingControls(state.session);
}

async function clearControlSteps(): Promise<void> {
  if (!window.confirm('Excluir todos os passos desta sessão?')) return;
  const response = await sendMessage({ type: '__CLEAR_STEPS__' });
  if (!response.ok) {
    logger.warn('não foi possível limpar os passos', response.error);
    return;
  }
  state.controlSteps = [];
  if (response.state) applySessionState(response.state);
  renderRecordingControls(state.session);
}

async function loadProjectContext(): Promise<void> {
  const response = await sendMessage({ type: '__GET_PROJECT_CONTEXT__' });
  if (response.ok && response.projectContext) {
    state.projectContext = response.projectContext;
    renderRecordingControls(state.session);
  }
}

async function saveProjectContext(): Promise<void> {
  const root = document.getElementById(CONTROLS_ID)?.shadowRoot;
  const name = root?.querySelector<HTMLInputElement>('.project-name')?.value ?? '';
  const functionality = root?.querySelector<HTMLInputElement>('.project-functionality')?.value ?? '';
  const response = await sendMessage({
    type: '__SAVE_PROJECT_CONTEXT__',
    payload: { name, functionality },
  });
  if (!response.ok) {
    logger.warn('não foi possível salvar os dados do projeto', response.error);
    return;
  }
  if (response.projectContext) state.projectContext = response.projectContext;
  renderRecordingControls(state.session);
}

function openHomologPanel(): void {
  const url = new URL('http://localhost:5173/');
  url.searchParams.set('homologExtensionId', chrome.runtime.id);
  window.open(url.toString(), '_blank', 'noopener');
}

function requestPanelOpen(): void {
  const current = state.session?.state;
  if (current === 'recording' || current === 'paused') {
    state.pendingPanelOpen = true;
    showPanelRecordingAlert();
    return;
  }
  openHomologPanel();
}

function showPanelRecordingAlert(): void {
  const root = document.getElementById(CONTROLS_ID)?.shadowRoot;
  if (!root || root.querySelector('.panel-recording-alert')) return;
  const dialog = document.createElement('div');
  dialog.className = 'panel-recording-alert';
  dialog.setAttribute('role', 'alertdialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:22px;background:rgba(10,15,23,.82);pointer-events:auto';
  dialog.innerHTML = '<div style="box-sizing:border-box;width:min(402px,calc(100vw - 44px));padding:23px 19px 19px;border:1px solid #315f91;border-radius:12px;background:#0d213a;color:#fff;box-shadow:0 18px 48px rgba(0,0,0,.48)"><p style="margin:0 0 18px;font:700 13px/1.65 system-ui,-apple-system,Segoe UI,sans-serif">Finalize a gravação atual para acessar o painel</p><button class="alert-ok" type="button" style="display:block;width:100%;min-height:38px;border:0;border-radius:9px;background:#188a57;color:#fff;font:700 12px system-ui">Entendi</button></div>';
  dialog.querySelector<HTMLButtonElement>('.alert-ok')?.addEventListener('click', () => dialog.remove());
  root.appendChild(dialog);
  dialog.querySelector<HTMLButtonElement>('.alert-ok')?.focus();
}

function confirmNewProject(): Promise<boolean> {
  return new Promise((resolve) => {
    const root = document.getElementById(CONTROLS_ID)?.shadowRoot;
    if (!root) return resolve(false);
    root.querySelector('.new-project-confirm')?.remove();
    const dialog = document.createElement('div');
    dialog.className = 'new-project-confirm';
    dialog.setAttribute('role', 'alertdialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.style.cssText = 'position:fixed;inset:0;z-index:2147483647;display:grid;place-items:center;padding:22px;background:rgba(10,15,23,.82);pointer-events:auto';
    dialog.innerHTML = '<div style="box-sizing:border-box;width:min(402px,calc(100vw - 44px));padding:23px 19px 19px;border:1px solid #315f91;border-radius:12px;background:#0d213a;color:#fff;box-shadow:0 18px 48px rgba(0,0,0,.48)"><p style="margin:0 0 18px;font:700 13px/1.65 system-ui,-apple-system,Segoe UI,sans-serif">Seus passos atuais serão enviados ao painel, deseja continuar?</p><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><button class="confirm-no" type="button" style="min-height:38px;border:2px solid #dce7f5;border-radius:9px;background:#52637a;color:#fff;font-weight:700">Não</button><button class="confirm-yes" type="button" style="min-height:38px;border:0;border-radius:9px;background:#188a57;color:#fff;font-weight:700">Sim</button></div></div>';
    const finish = (answer: boolean) => {
      dialog.remove();
      resolve(answer);
    };
    dialog.querySelector<HTMLButtonElement>('.confirm-no')?.addEventListener('click', () => finish(false));
    dialog.querySelector<HTMLButtonElement>('.confirm-yes')?.addEventListener('click', () => finish(true));
    root.appendChild(dialog);
    dialog.querySelector<HTMLButtonElement>('.confirm-no')?.focus();
  });
}

async function createNewProjectContext(): Promise<void> {
  if (!(await confirmNewProject())) return;
  const response = await sendMessage({ type: '__NEW_PROJECT_CONTEXT__' });
  if (!response.ok) {
    logger.warn('não foi possível criar o novo projeto', response.error);
    return;
  }
  state.controlSteps = [];
  if (response.projectContext) state.projectContext = response.projectContext;
  if (response.state) applySessionState(response.state);
  state.controlsExpanded = true;
  renderRecordingControls(state.session);
  document.getElementById(CONTROLS_ID)?.shadowRoot
    ?.querySelector<HTMLInputElement>('.project-name')?.focus();
}

function renderRecordingControls(session: RecordingSession | null): void {
  if (typeof document === 'undefined' || state.restricted) return;
  let host = document.getElementById(CONTROLS_ID) as HTMLDivElement | null;
  if (!host) {
    host = document.createElement('div');
    host.id = CONTROLS_ID;
    host.style.cssText = 'all:initial;position:fixed;inset:0 0 0 auto;z-index:2147483646;pointer-events:none';
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<style>
      :host{all:initial}.drawer{position:absolute;top:0;right:0;width:330px;height:100vh;padding:18px 14px 14px;box-sizing:border-box;border-left:1px solid #29476f;background:#0b1729f7;color:#eaf2ff;box-shadow:-16px 0 40px #0006;font:13px/1.35 system-ui,-apple-system,Segoe UI,sans-serif;pointer-events:auto;transform:translateX(0);transition:transform .22s ease;display:flex;flex-direction:column}.drawer.closed{transform:translateX(100%)}.toggle{position:absolute;top:50%;left:-38px;width:38px;height:64px;transform:translateY(-50%);border:1px solid #29476f;border-right:0;border-radius:12px 0 0 12px;background:#0b1729f7;color:#fff;font-size:24px;cursor:pointer;box-shadow:-7px 4px 18px #0004}.head{display:flex;align-items:center;justify-content:space-between;gap:8px}.brand{font-size:15px;font-weight:750}.state{font-size:11px;color:#9fc2ff}.count{min-width:25px;padding:3px 7px;border-radius:20px;background:#17345b;text-align:center;font-weight:700}.actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:14px}button{border:0;border-radius:9px;padding:9px;background:#1b365c;color:#fff;font:600 12px system-ui;cursor:pointer}button:hover{filter:brightness(1.13)}button[data-action="START"]{background:#15804f}button[data-action="PAUSE"]{background:#a56108}button[data-action="RESUME"]{background:#2867d8}button[data-action="FINALIZE"]{background:#a83242}.clear-steps{grid-column:1/-1;background:#7f1d1d}.step-delete{margin-top:auto;padding:4px 7px;align-self:flex-end;background:#7f1d1d;font-size:11px}button:disabled{opacity:.38;filter:saturate(.3);cursor:default}.preview-head{display:flex;align-items:center;justify-content:space-between;margin:18px 0 8px;padding-top:14px;border-top:1px solid #29476f}.preview-head strong{font-size:12px}.step-scroll{min-height:0;overflow:auto;flex:1;padding-right:3px}.step-list{display:grid;gap:8px;padding:0;margin:0;list-style:none}.step-item{display:grid;grid-template-columns:92px 1fr;gap:9px;padding:7px;border:1px solid #29476f;border-radius:10px;background:#101f35;cursor:pointer}.step-item:hover,.step-item:focus-visible{border-color:#6fa2ed;background:#142946;outline:none}.thumb{width:92px;aspect-ratio:16/9;border-radius:6px;background:#1b365c;overflow:hidden}.thumb img{width:100%;height:100%;object-fit:cover}.step-detail{min-width:0;display:flex;flex-direction:column;gap:4px}.step-detail strong{font-size:11px;color:#9fc2ff}.step-detail span{display:-webkit-box;overflow:hidden;-webkit-box-orient:vertical;-webkit-line-clamp:3;font-size:11px}.step-empty{padding:22px 8px;text-align:center;color:#9fb0ca}.foot{display:flex;justify-content:flex-end;padding-top:10px}.panel{padding:5px;background:transparent;color:#9fc2ff}.viewer{position:fixed;inset:0;z-index:2147483647;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:32px;background:#02060ded;color:#fff;pointer-events:auto;font:13px/1.4 system-ui,-apple-system,Segoe UI,sans-serif}.viewer[hidden]{display:none}.viewer img{display:block;max-width:calc(100vw - 64px);max-height:calc(100vh - 110px);object-fit:contain;border-radius:8px;box-shadow:0 18px 60px #000}.viewer-title{max-width:900px;text-align:center}.viewer-close{position:absolute;top:18px;right:20px;width:42px;height:42px;border-radius:50%;font-size:24px;background:#172a48}@media(max-width:520px){.drawer{width:min(88vw,330px)}.viewer{padding:18px}.viewer img{max-width:calc(100vw - 36px)}}
    </style><aside class="drawer" aria-label="Menu Homolog"><button class="toggle" aria-label="Fechar menu Homolog" title="Abrir ou fechar menu">›</button><div class="head"><span class="brand">🎬 Homolog</span><span class="state"></span><span class="count">0</span></div><div class="actions"><button data-action="START">Iniciar gravação</button><button data-action="PAUSE">Pausar</button><button data-action="RESUME">Continuar</button><button data-action="FINALIZE">Finalizar</button><button class="clear-steps">Limpar passos</button></div><div class="preview-head"><strong>Pré-visualização dos passos</strong><span class="preview-count">0</span></div><div class="step-scroll"><div class="step-empty">Nenhum passo registrado.</div><ol class="step-list"></ol></div><div class="foot"><button class="panel">Abrir painel ↗</button></div></aside><div class="viewer" role="dialog" aria-modal="true" aria-label="Visualização do passo" hidden><button class="viewer-close" aria-label="Fechar visualização">×</button><img alt=""><div class="viewer-title"></div></div>`;
    const projectContext = document.createElement('div');
    projectContext.className = 'project-context';
    projectContext.style.cssText = 'display:grid;gap:7px;margin-top:14px;padding:11px;border:1px solid #29476f;border-radius:10px;background:#101f35';
    projectContext.innerHTML = '<label style="display:grid;gap:3px;color:#9fc2ff;font-size:11px">Nome do projeto<input class="project-name" maxlength="200" style="padding:7px;border:1px solid #365577;border-radius:7px;background:#091426;color:#fff"></label><label style="display:grid;gap:3px;color:#9fc2ff;font-size:11px">Funcionalidade<input class="project-functionality" maxlength="300" style="padding:7px;border:1px solid #365577;border-radius:7px;background:#091426;color:#fff"></label><button class="save-project" type="button" style="background:#2867d8">Salvar dados</button><button class="new-project" type="button" style="background:#15804f" hidden>Novo projeto / funcionalidade</button>';
    shadow.querySelector('.actions')?.before(projectContext);
    const head = shadow.querySelector<HTMLElement>('.head');
    if (head) head.style.cssText = 'position:relative;display:flex;align-items:center;justify-content:center;min-height:24px';
    const brand = shadow.querySelector<HTMLElement>('.brand');
    if (brand) brand.textContent = '📷 Homolog';
    const stateLabel = shadow.querySelector<HTMLElement>('.state');
    if (stateLabel) stateLabel.style.cssText = 'position:absolute;left:0;font-size:11px;color:#9fc2ff';
    shadow.querySelector('.count')?.remove();
    const panelButton = shadow.querySelector<HTMLButtonElement>('.panel');
    if (panelButton && head) {
      panelButton.style.cssText = 'width:100%;margin-top:10px;padding:8px;background:#152a47;color:#9fc2ff';
      head.after(panelButton);
    }
    shadow.querySelector<HTMLButtonElement>('.save-project')?.addEventListener('click', () => void saveProjectContext());
    shadow.querySelector<HTMLButtonElement>('.new-project')?.addEventListener('click', () => void createNewProjectContext());
    shadow.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((button) => button.addEventListener('click', () => void controlAction(button.dataset.action as 'START'|'PAUSE'|'RESUME'|'FINALIZE')));
    shadow.querySelector<HTMLButtonElement>('.panel')?.addEventListener('click', requestPanelOpen);
    shadow.querySelector<HTMLButtonElement>('.toggle')?.addEventListener('click', () => void toggleRecordingControls());
    shadow.querySelector<HTMLButtonElement>('.clear-steps')?.addEventListener('click', () => void clearControlSteps());
    const closeViewer = () => { const viewer=shadow.querySelector<HTMLElement>('.viewer');if(viewer)viewer.hidden=true; };
    shadow.querySelector<HTMLButtonElement>('.viewer-close')?.addEventListener('click', closeViewer);
    shadow.querySelector<HTMLElement>('.viewer')?.addEventListener('click', (event) => { if(event.target===event.currentTarget)closeViewer(); });
    shadow.addEventListener('keydown', (event) => { if(event.key==='Escape')closeViewer(); });
    (document.documentElement || document.body).appendChild(host);
  }
  const belongsToThisTab = !session || session.state === 'idle' || session.state === 'finalized' || state.ownTabId === null || session.tabId === state.ownTabId;
  host.style.display = belongsToThisTab ? 'block' : 'none';
  const root = host.shadowRoot;
  const drawer=root?.querySelector('.drawer');drawer?.classList.toggle('closed',!state.controlsExpanded);
  const toggle=root?.querySelector<HTMLButtonElement>('.toggle');if(toggle){toggle.textContent=state.controlsExpanded?'›':'‹';toggle.setAttribute('aria-label',state.controlsExpanded?'Fechar menu Homolog':'Abrir menu Homolog');}
  const current=session?.state ?? 'idle';
  const labels={idle:'Pronto',recording:'Gravando',paused:'Pausado',finalized:'Finalizado'};
  const stateEl=root?.querySelector('.state');if(stateEl)stateEl.textContent=labels[current];
  const previewCount=root?.querySelector('.preview-count');if(previewCount)previewCount.textContent=`${state.controlSteps.length} passos`;
  const projectName=root?.querySelector<HTMLInputElement>('.project-name');if(projectName&&root?.activeElement!==projectName)projectName.value=state.projectContext.name;
  const functionality=root?.querySelector<HTMLInputElement>('.project-functionality');if(functionality&&root?.activeElement!==functionality)functionality.value=state.projectContext.functionality;
  if(projectName)projectName.readOnly=state.projectContext.locked===true;
  if(functionality)functionality.readOnly=state.projectContext.locked===true;
  const saveProject=root?.querySelector<HTMLButtonElement>('.save-project');if(saveProject)saveProject.hidden=state.projectContext.locked===true;
  const newProject=root?.querySelector<HTMLButtonElement>('.new-project');if(newProject)newProject.hidden=state.projectContext.locked!==true;
  root?.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(button=>{const action=button.dataset.action;button.hidden=action==='START'&&(current==='recording'||current==='paused');button.disabled=action==='START'?(current==='recording'||current==='paused'):action==='PAUSE'?current!=='recording':action==='RESUME'?current!=='paused':current!=='recording'&&current!=='paused';});
  renderStepPreviews();
}

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
  timeoutMs: number = REQUEST_TIMEOUT_MS,
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

  let markerRemoved = false;
  const removeMarkerSafe = () => {
    if (markerRemoved) return;
    markerRemoved = true;
    removeClickMarker();
  };

  try {
    insertClickMarker(interaction.viewportPoint.x, interaction.viewportPoint.y);
    setControlsCaptureHidden(true);

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
  } catch (e) {
    logger.warn('erro ao enviar request screenshot', e);
  } finally {
    setControlsCaptureHidden(false);
    removeMarkerSafe();
  }
}

function scheduleInteractionFinalization(
  id: string,
  interaction: InteractionEvent,
  delayMs = FINALIZATION_DELAY_MS,
): void {
  if (pending.has(id)) return;
  pending.set(id, { createdAt: Date.now(), timeoutId: null });
  if (delayMs <= 0) {
    // Dispara ainda durante o pointerdown. Assim o service worker recebe o
    // pedido antes de um clique de navegação descarregar o content script.
    void finalizeInteraction(id, interaction);
    return;
  }
  const timeoutId = setTimeout(() => void finalizeInteraction(id, interaction), delayMs);
  pending.set(id, { createdAt: Date.now(), timeoutId });
}

function cancelPendingInteractions(): void {
  for (const [, v] of pending) {
    if (v.timeoutId !== null) clearTimeout(v.timeoutId);
  }
  pending.clear();
  clearAllMarkerTimeouts();
}

function onPageHideSoon(): void {
  // Não cancele pedidos já enviados: o service worker continua a captura
  // mesmo quando uma navegação descarrega esta página.
  clearAllMarkerTimeouts();
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
  const previousSessionState = state.session?.state;
  const baseRecording = s?.state === 'recording';
  // Iniciar a gravação não recolhe o menu e não interfere no listener.
  state.sessionId = s?.sessionId ?? null;
  state.session = s;
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
  renderRecordingControls(s);
  if ((s?.stepCount ?? 0) !== state.controlSteps.length) void refreshControlSteps();
  if (
    state.pendingPanelOpen &&
    (previousSessionState === 'recording' || previousSessionState === 'paused') &&
    s?.state === 'finalized'
  ) {
    state.pendingPanelOpen = false;
  }
}

async function resolveOwnTabId(): Promise<void> {
  try {
    const msgValid = validateRuntimeMessage({
      type: '__GET_MY_TAB_ID__' as RuntimeMessageType,
    });
    if (!msgValid.ok) return;
    const resp = await sendMessage(msgValid.value, CHROME_MESSAGE_TIMEOUT_MS);
    if (resp.ok && typeof resp.tabId === 'number') {
      state.ownTabId = resp.tabId;
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
      // Outros dados (passos, screenshots e última interação) também são
      // salvos em chrome.storage.local. Eles não significam que a gravação foi
      // removida e não podem desligar o detector após o primeiro clique.
      if (!hasOwnStorageChange(changes, STORAGE_KEY_RECORDING)) return;
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
      } else if (v.value.type === '__STEP_RECORDED__') {
        void refreshControlSteps();
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
      await loadProjectContext();
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

// O manifest já injeta este script. Chamadas programáticas adicionais são
// permitidas apenas como fallback; este marcador impede dois listeners na
// mesma página e, consequentemente, dois passos para um único clique.
const contentGlobal = globalThis as typeof globalThis & Record<string, unknown>;
if (contentGlobal[CONTENT_INSTANCE_GLOBAL] !== true) {
  contentGlobal[CONTENT_INSTANCE_GLOBAL] = true;
  document.documentElement.setAttribute(CONTENT_INSTANCE_ATTRIBUTE, chrome.runtime.id);
  init();
} else {
  logger.info('instância duplicada do content script ignorada');
}

export {};

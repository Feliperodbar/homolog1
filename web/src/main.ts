import './styles/index.css';
import './styles/icons.css';
import './styles/step-layout.css';
import {
  deleteSessionCascade,
  deleteStep,
  exportBackup,
  getScreenshot,
  importBackup,
  importExtensionSnapshot,
  listProjects,
  listSessions,
  listSteps,
  migrateLegacyData,
  newId,
  saveProject,
  saveSession,
  saveStep,
  subscribeSaveState,
  type EvidenceProject,
  type EvidenceSession,
  type EvidenceStep,
  type StepStatus,
} from './core/modules/evidenceStore';
import {
  downloadProfessionalDocx,
  downloadProfessionalHtml,
  downloadProfessionalPdf,
  type ReportStep,
} from './core/modules/professionalReport';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
let project: EvidenceProject;
let session: EvidenceSession;
let steps: EvidenceStep[] = [];
let pendingScreenshot: Blob | undefined;
let deleted: EvidenceStep | null = null;
let lastExtensionSnapshotSignature = '';
let extensionSyncInProgress = false;
let extensionActiveProjectId = '';
let extensionActiveSessionId = '';
const statusLabels: Record<StepStatus, string> = {
  'not-run': 'Não executado',
  passed: 'Aprovado',
  failed: 'Reprovado',
  blocked: 'Bloqueado',
  skipped: 'Ignorado',
};

function toast(message: string): void {
  const el = $<HTMLDivElement>('toast');
  el.textContent = message;
  el.classList.add('visible');
  setTimeout(() => el.classList.remove('visible'), 2600);
}
function emptyProject(): EvidenceProject {
  const now = Date.now();
  return {
    id: newId(),
    name: 'Novo projeto',
    feature: '',
    environment: 'Web',
    version: '',
    responsible: '',
    date: new Date().toISOString().slice(0, 10),
    browser: navigator.userAgent,
    expectedResult: '',
    overallResult: '',
    createdAt: now,
    updatedAt: now,
  };
}
function emptySession(projectId: string): EvidenceSession {
  const now = Date.now();
  return {
    id: newId(),
    projectId,
    name: `Sessão ${new Date().toLocaleString('pt-BR')}`,
    state: 'idle',
    createdAt: now,
    updatedAt: now,
  };
}

async function bootstrap(): Promise<void> {
  subscribeSaveState((state, error) => {
    const el = $('saveIndicator');
    el.textContent =
      state === 'saving' ? 'Salvando…' : state === 'error' ? 'Erro ao salvar' : 'Salvo';
    el.className = `indicator ${state}`;
    if (error) toast(error);
  });
  const migrated = await migrateLegacyData();
  if (migrated) toast(`${migrated} passos antigos migrados; dados originais preservados.`);
  await syncFromExtension();
  const projects = await listProjects();
  project =
    projects.find((item) => item.id === extensionActiveProjectId) ??
    projects[0] ??
    (await saveProject(emptyProject()));
  const sessions = await listSessions(project.id);
  session =
    sessions.find((item) => item.id === extensionActiveSessionId) ??
    sessions[0] ??
    (await saveSession(emptySession(project.id)));
  bind();
  await refreshSelectors();
  await loadCurrent();
  applyTheme(localStorage.getItem('homolog_theme') ?? 'light');
  window.setInterval(() => void syncFromExtension(true), 2500);
}

type ExternalSyncResponse = {
  ok: boolean;
  backup?: unknown;
  activeProjectId?: string;
  activeSessionId?: string;
  error?: string;
};
type ExternalScreenshotResponse = {
  ok: boolean;
  screenshotId?: string;
  imageDataUrl?: string | null;
  error?: string;
};
function extensionSnapshotSignature(value: unknown): string {
  const backup = value as {
    projects?: Array<Record<string, unknown>>;
    sessions?: Array<Record<string, unknown>>;
    steps?: Array<Record<string, unknown>>;
    screenshotsMeta?: Array<Record<string, unknown>>;
  };
  return JSON.stringify({
    projects: (backup.projects ?? []).map((item) => [item.projectId, item.updatedAt]),
    sessions: (backup.sessions ?? []).map((item) => [
      item.sessionId,
      item.updatedAt,
      item.state,
      item.stepCount,
    ]),
    steps: (backup.steps ?? []).map((item) => [
      item.stepId,
      item.sequence,
      item.timestamp,
      item.screenshotId,
    ]),
    screenshots: (backup.screenshotsMeta ?? []).map((item) => [item.screenshotId, item.sizeBytes]),
  });
}
function requestExtensionSnapshot(extensionId: string): Promise<ExternalSyncResponse> {
  return new Promise((resolve) => {
    const runtime = (globalThis as any).chrome?.runtime;
    if (!runtime?.sendMessage) {
      resolve({ ok: false, error: 'API da extensão indisponível.' });
      return;
    }
    runtime.sendMessage(
      extensionId,
      { type: 'HOMOLOG_PANEL_SYNC' },
      (response: ExternalSyncResponse) => {
        const error = runtime.lastError;
        resolve(
          error
            ? { ok: false, error: error.message }
            : (response ?? { ok: false, error: 'Sem resposta da extensão.' }),
        );
      },
    );
  });
}
function requestExtensionScreenshot(
  extensionId: string,
  screenshotId: string,
): Promise<ExternalScreenshotResponse> {
  return new Promise((resolve) => {
    const runtime = (globalThis as any).chrome?.runtime;
    if (!runtime?.sendMessage) {
      resolve({ ok: false, error: 'API da extensao indisponivel.' });
      return;
    }
    runtime.sendMessage(
      extensionId,
      { type: 'HOMOLOG_PANEL_SCREENSHOT', screenshotId },
      (response: ExternalScreenshotResponse) => {
        const error = runtime.lastError;
        resolve(
          error
            ? { ok: false, error: error.message }
            : (response ?? { ok: false, error: 'Sem resposta da extensao.' }),
        );
      },
    );
  });
}
async function hydrateExtensionScreenshots(extensionId: string, backup: unknown): Promise<number> {
  const value = backup as { screenshotsMeta?: Array<Record<string, unknown>> };
  let hydrated = 0;
  for (const shot of value.screenshotsMeta ?? []) {
    if (typeof shot.imageDataUrl === 'string' && shot.imageDataUrl.length > 32) continue;
    const screenshotId = String(shot.screenshotId ?? '');
    if (!screenshotId) continue;
    const response = await requestExtensionScreenshot(extensionId, screenshotId);
    if (response.ok && typeof response.imageDataUrl === 'string') {
      shot.imageDataUrl = response.imageDataUrl;
      hydrated += 1;
    }
  }
  return hydrated;
}
async function syncFromExtension(silent = false): Promise<void> {
  if (extensionSyncInProgress) return;
  const extensionId = new URLSearchParams(location.search).get('homologExtensionId');
  if (!extensionId) return;
  extensionSyncInProgress = true;
  try {
    const response = await requestExtensionSnapshot(extensionId);
    if (response.ok && response.backup)
      await hydrateExtensionScreenshots(extensionId, response.backup);
    if (!response.ok || !response.backup) {
      if (!silent) toast(response.error ?? 'Não foi possível conectar à extensão.');
      return;
    }
    extensionActiveProjectId = response.activeProjectId ?? extensionActiveProjectId;
    extensionActiveSessionId = response.activeSessionId ?? extensionActiveSessionId;
    const signature = extensionSnapshotSignature(response.backup);
    if (signature === lastExtensionSnapshotSignature) return;
    const scrollTop = window.scrollY;
    const result = await importExtensionSnapshot(response.backup);
    lastExtensionSnapshotSignature = signature;
    if (project && session) {
      const projects = await listProjects();
      const synced =
        projects.find((p) => p.id === extensionActiveProjectId) ??
        projects.find((p) => p.id === project.id) ??
        projects[0];
      if (synced) {
        project = synced;
        const sessions = await listSessions(project.id);
        session =
          sessions.find((s) => s.id === extensionActiveSessionId) ??
          sessions.find((s) => s.id === session?.id) ??
          sessions[0];
        if (session) {
          await refreshSelectors();
          await loadCurrent();
          requestAnimationFrame(() =>
            requestAnimationFrame(() =>
              window.scrollTo({ top: scrollTop, left: 0, behavior: 'instant' }),
            ),
          );
        }
      }
    }
    if (!silent) toast(`${result.steps} passos sincronizados da extensão.`);
  } finally {
    extensionSyncInProgress = false;
  }
}

function bind(): void {
  $('saveProjectBtn').addEventListener('click', async () => {
    readProject();
    project = await saveProject(project);
    await refreshSelectors();
    toast('Projeto salvo.');
  });
  $('addStepBtn').addEventListener('click', () => {
    pendingScreenshot = undefined;
    $<HTMLInputElement>('screenshotInput').click();
  });
  $<HTMLInputElement>('screenshotInput').addEventListener('change', async (e) => {
    pendingScreenshot = (e.target as HTMLInputElement).files?.[0];
    await addManualStep();
    (e.target as HTMLInputElement).value = '';
  });
  $('clearSessionBtn').addEventListener('click', async () => {
    if (confirm('Excluir todos os passos desta sessão? Esta ação exige confirmação.')) {
      await deleteSessionCascade(session.id);
      session = await saveSession(emptySession(project.id));
      steps = [];
      await refreshSelectors();
      render();
    }
  });
  $<HTMLInputElement>('searchInput').addEventListener('input', render);
  $<HTMLSelectElement>('statusFilter').addEventListener('change', render);
  $('themeBtn').addEventListener('click', () =>
    applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'),
  );
  $('backupBtn').addEventListener('click', async () =>
    download(await exportBackup(), 'homolog-backup.json'),
  );
  $<HTMLInputElement>('importInput').addEventListener('change', async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) {
      await importBackup(file);
      toast('Backup importado.');
      location.reload();
    }
  });
  $('htmlBtn').addEventListener('click', () => void exportReport('html'));
  $('docxBtn').addEventListener('click', () => void exportReport('docx'));
  $('pdfBtn').addEventListener('click', () => void exportReport('pdf'));
}

async function refreshSelectors(): Promise<void> {
  $('projectSelect').textContent = project.name || 'Projeto sem nome';
  $('sessionSelect').textContent = session.name || 'Sessão sem nome';
}
async function loadCurrent(): Promise<void> {
  steps = await listSteps(session.id);
  fillProject();
  render();
}
function fillProject(): void {
  const map: Record<string, string> = {
    projectName: project.name,
    feature: project.feature,
    environment: 'Web',
    version: project.version,
    responsible: project.responsible,
    projectDate: project.date,
    browser: project.browser,
    overallResult: project.overallResult,
  };
  Object.entries(map).forEach(([id, value]) => {
    $<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(id).value = value ?? '';
  });
}
function readProject(): void {
  project = {
    ...project,
    name: $<HTMLInputElement>('projectName').value.trim() || 'Projeto sem nome',
    feature: $<HTMLInputElement>('feature').value,
    environment: 'Web',
    version: $<HTMLInputElement>('version').value,
    responsible: $<HTMLInputElement>('responsible').value,
    date: $<HTMLInputElement>('projectDate').value,
    browser: $<HTMLInputElement>('browser').value,
    expectedResult: '',
    overallResult: $<HTMLSelectElement>('overallResult').value,
  };
}
async function addManualStep(): Promise<void> {
  const screenshotId = pendingScreenshot ? newId() : null;
  const step: EvidenceStep = {
    id: newId(),
    sessionId: session.id,
    projectId: project.id,
    sequence: steps.length + 1,
    title: `Passo ${steps.length + 1}`,
    action: 'Ação manual',
    element: '',
    description: 'Descrever a ação realizada.',
    expectedResult: '',
    actualResult: '',
    status: 'not-run',
    url: '',
    timestamp: Date.now(),
    screenshotId,
  };
  await saveStep(step, pendingScreenshot);
  steps.push(step);
  render();
  toast('Passo criado.');
}

async function render(): Promise<void> {
  const timeline = $('timeline');
  const search = $<HTMLInputElement>('searchInput').value.toLowerCase();
  const filter = $<HTMLSelectElement>('statusFilter').value;
  const visible = steps.filter(
    (s) =>
      (!filter || s.status === filter) &&
      (!search || JSON.stringify(s).toLowerCase().includes(search)),
  );
  timeline.innerHTML = '';
  for (const step of visible) timeline.append(await stepCard(step));
  $('emptyState').classList.toggle('hidden', visible.length > 0);
  $('stepCounter').textContent = `${steps.length} ${steps.length === 1 ? 'passo' : 'passos'}`;
}
async function stepCard(step: EvidenceStep): Promise<HTMLElement> {
  const article = document.createElement('article');
  article.className = 'step-card';
  article.tabIndex = 0;
  article.dataset.id = step.id;
  const blob = await getScreenshot(step.screenshotId);
  const url = blob ? URL.createObjectURL(blob) : '';
  article.innerHTML = `
    <div class="step-number">${step.sequence}</div>
    <div class="thumbnail">${url ? `<img src="${url}" alt="Miniatura do passo ${step.sequence}">` : 'Sem imagem'}</div>
    <div class="step-editor">
      <div class="step-fields">
        <label>Título<input data-field="title" value="${escapeAttr(step.title)}"></label>
        <label>Status<select data-field="status">${Object.entries(statusLabels)
          .map(
            ([value, label]) =>
              `<option value="${value}" ${step.status === value ? 'selected' : ''}>${label}</option>`,
          )
          .join('')}</select></label>
        <label>Ação<input data-field="action" value="${escapeAttr(step.action)}"></label>
        <label>Elemento clicado<input data-field="element" value="${escapeAttr(step.element)}"></label>
        <label class="wide">Descrição<textarea data-field="description">${escapeText(step.description)}</textarea></label>
        <label>Resultado esperado<textarea data-field="expectedResult">${escapeText(step.expectedResult)}</textarea></label>
        <label>Resultado obtido<textarea data-field="actualResult">${escapeText(step.actualResult)}</textarea></label>
      </div>
    </div>
    <div class="step-support">
      <div class="support-fields">
        <label class="wide">URL<input data-field="url" value="${escapeAttr(step.url)}"></label>
      </div>
      <p class="step-meta">${new Date(step.timestamp).toLocaleString('pt-BR')}</p>
      <div class="step-actions">
        <button data-action="up" class="step-icon-button" aria-label="Mover passo para cima" title="Mover para cima"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m6 15 6-6 6 6"/></svg></button>
        <button data-action="down" class="step-icon-button" aria-label="Mover passo para baixo" title="Mover para baixo"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg></button>
        <button data-action="duplicate" class="step-icon-button" aria-label="Duplicar passo" title="Duplicar passo"><svg aria-hidden="true" viewBox="0 0 24 24"><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg></button>
        <button data-action="sensitive" class="step-icon-button" aria-label="${step.sensitive ? 'Exibir dados sensíveis' : 'Ocultar dados sensíveis'}" title="${step.sensitive ? 'Exibir dados sensíveis' : 'Ocultar dados sensíveis'}"><svg aria-hidden="true" viewBox="0 0 24 24">${step.sensitive ? '<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>' : '<path d="m3 3 18 18M10.6 10.7a2 2 0 0 0 2.7 2.7M9.9 5.2A10 10 0 0 1 12 5c6.5 0 10 7 10 7a16 16 0 0 1-2.1 3M6.6 6.6C3.6 8.3 2 12 2 12s3.5 7 10 7a10 10 0 0 0 4-.8"/>'}</svg></button>
        <button data-action="delete" class="danger step-icon-button" aria-label="Excluir passo" title="Excluir passo"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3m-9 0 1 14h10l1-14M10 11v6m4-6v6"/></svg></button>
      </div>
    </div>`;
  article
    .querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('[data-field]')
    .forEach((input) =>
      input.addEventListener('change', async () => {
        const field = input.dataset.field as keyof EvidenceStep;
        (step as unknown as Record<string, unknown>)[field] = input.value;
        await saveStep(step);
        render();
      }),
    );
  article
    .querySelectorAll<HTMLButtonElement>('[data-action]')
    .forEach((button) =>
      button.addEventListener('click', () => void action(step, button.dataset.action ?? '')),
    );
  return article;
}
async function action(step: EvidenceStep, actionName: string): Promise<void> {
  const index = steps.findIndex((s) => s.id === step.id);
  if (actionName === 'delete') {
    deleted = step;
    await deleteStep(step.id);
    steps.splice(index, 1);
    normalize();
    toast('Passo excluído. Pressione Ctrl+Z para desfazer.');
  }
  if (actionName === 'duplicate') {
    const copy = {
      ...step,
      id: newId(),
      screenshotId: null,
      sequence: steps.length + 1,
      title: `${step.title} (cópia)`,
    };
    await saveStep(copy);
    steps.push(copy);
  }
  if (actionName === 'sensitive') {
    step.sensitive = !step.sensitive;
    await saveStep(step);
  }
  if (actionName === 'up' && index > 0) {
    [steps[index - 1], steps[index]] = [steps[index], steps[index - 1]];
    await normalize();
  }
  if (actionName === 'down' && index < steps.length - 1) {
    [steps[index + 1], steps[index]] = [steps[index], steps[index + 1]];
    await normalize();
  }
  render();
}
async function normalize(): Promise<void> {
  for (let i = 0; i < steps.length; i++) {
    steps[i].sequence = i + 1;
    await saveStep(steps[i]);
  }
}
document.addEventListener('keydown', async (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && deleted) {
    const restore = { ...deleted, sequence: steps.length + 1 };
    await saveStep(restore);
    steps.push(restore);
    deleted = null;
    render();
    toast('Exclusão desfeita.');
  }
});
async function reportSteps(): Promise<ReportStep[]> {
  return Promise.all(
    steps.map(async (s) => {
      const blob = await getScreenshot(s.screenshotId);
      return { ...s, screenshotDataUrl: blob ? await blobToDataUrl(blob) : null };
    }),
  );
}
async function exportReport(kind: 'html' | 'docx' | 'pdf'): Promise<void> {
  readProject();
  await saveProject(project);
  const report = await reportSteps();
  const options = { includeUrls: true, includeTechnicalData: false, hideSensitive: true };
  if (kind === 'html') downloadProfessionalHtml(project, report, options);
  if (kind === 'docx') await downloadProfessionalDocx(project, report, options);
  if (kind === 'pdf') downloadProfessionalPdf(project, report, options);
  toast(`Relatório ${kind.toUpperCase()} gerado.`);
}
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
function applyTheme(theme: string): void {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem('homolog_theme', theme);
}
function escapeText(value: string): string {
  return String(value ?? '').replace(
    /[&<>]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] ?? c,
  );
}
function escapeAttr(value: string): string {
  return escapeText(value).replaceAll('"', '&quot;');
}
void bootstrap().catch((error) => {
  console.error(error);
  toast(error instanceof Error ? error.message : 'Falha ao iniciar o painel.');
});

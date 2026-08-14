export type StepStatus = 'not-run' | 'passed' | 'failed' | 'blocked' | 'skipped';

export interface EvidenceProject {
  id: string;
  name: string;
  feature: string;
  environment: string;
  version: string;
  responsible: string;
  date: string;
  browser: string;
  expectedResult: string;
  overallResult: string;
  createdAt: number;
  updatedAt: number;
}

export interface EvidenceSession {
  id: string;
  projectId: string;
  name: string;
  state: 'idle' | 'recording' | 'paused' | 'finalized';
  createdAt: number;
  updatedAt: number;
}

export interface EvidenceStep {
  id: string;
  sessionId: string;
  projectId: string;
  sequence: number;
  title: string;
  action: string;
  element: string;
  description: string;
  expectedResult: string;
  actualResult: string;
  status: StepStatus;
  url: string;
  timestamp: number;
  screenshotId: string | null;
  technicalData?: Record<string, unknown>;
  sensitive?: boolean;
  highlight?: { x: number; y: number } | null;
}

export interface EvidenceScreenshot {
  id: string;
  stepId: string;
  projectId: string;
  sessionId: string;
  blob: Blob;
  createdAt: number;
}

interface ExtensionBackup {
  schema: 'homolog-backup';
  schemaVersion: 1;
  projects: Array<Record<string, any>>;
  sessions: Array<Record<string, any>>;
  steps: Array<Record<string, any>>;
  screenshotsMeta: Array<Record<string, any>>;
}

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';
type Listener = (state: SaveState, error?: string) => void;

const DB_NAME = 'homolog_web_evidence';
const DB_VERSION = 1;
const listeners = new Set<Listener>();

function notify(state: SaveState, error?: string): void {
  listeners.forEach((listener) => listener(state, error));
}

export function subscribeSaveState(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () => reject(value.error ?? new Error('Falha no IndexedDB.'));
  });
}

export async function openEvidenceDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('sessions')) {
        const store = db.createObjectStore('sessions', { keyPath: 'id' });
        store.createIndex('projectId', 'projectId');
      }
      if (!db.objectStoreNames.contains('steps')) {
        const store = db.createObjectStore('steps', { keyPath: 'id' });
        store.createIndex('sessionId', 'sessionId');
      }
      if (!db.objectStoreNames.contains('screenshots')) {
        const store = db.createObjectStore('screenshots', { keyPath: 'id' });
        store.createIndex('stepId', 'stepId', { unique: true });
      }
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Não foi possível abrir o armazenamento local.'));
  });
}

async function write<T>(storeName: string, value: T): Promise<T> {
  notify('saving');
  try {
    const db = await openEvidenceDb();
    const tx = db.transaction(storeName, 'readwrite');
    await request(tx.objectStore(storeName).put(value));
    notify('saved');
    return value;
  } catch (error) {
    const message = error instanceof DOMException && error.name === 'QuotaExceededError'
      ? 'O limite de armazenamento local foi atingido.'
      : error instanceof Error ? error.message : 'Falha ao salvar.';
    notify('error', message);
    throw new Error(message);
  }
}

export const newId = (): string => crypto.randomUUID();

export async function saveProject(project: EvidenceProject): Promise<EvidenceProject> {
  return write('projects', { ...project, updatedAt: Date.now() });
}

export async function saveSession(session: EvidenceSession): Promise<EvidenceSession> {
  return write('sessions', { ...session, updatedAt: Date.now() });
}

export async function saveStep(step: EvidenceStep, screenshot?: Blob): Promise<EvidenceStep> {
  notify('saving');
  try {
    const db = await openEvidenceDb();
    const tx = db.transaction(['steps', 'screenshots'], 'readwrite');
    tx.objectStore('steps').put(step);
    if (screenshot && step.screenshotId) {
      const record: EvidenceScreenshot = {
        id: step.screenshotId,
        stepId: step.id,
        projectId: step.projectId,
        sessionId: step.sessionId,
        blob: screenshot,
        createdAt: Date.now(),
      };
      tx.objectStore('screenshots').put(record);
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    notify('saved');
    return step;
  } catch (error) {
    notify('error', error instanceof Error ? error.message : 'Falha ao salvar passo.');
    throw error;
  }
}

export async function listProjects(): Promise<EvidenceProject[]> {
  const db = await openEvidenceDb();
  const all = await request(db.transaction('projects').objectStore('projects').getAll());
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function listSessions(projectId: string): Promise<EvidenceSession[]> {
  const db = await openEvidenceDb();
  const all = await request(db.transaction('sessions').objectStore('sessions').index('projectId').getAll(projectId));
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function listSteps(sessionId: string): Promise<EvidenceStep[]> {
  const db = await openEvidenceDb();
  const all = await request(db.transaction('steps').objectStore('steps').index('sessionId').getAll(sessionId));
  return all.sort((a, b) => a.sequence - b.sequence);
}

export async function getScreenshot(id: string | null): Promise<Blob | null> {
  if (!id) return null;
  const db = await openEvidenceDb();
  const result = await request(db.transaction('screenshots').objectStore('screenshots').get(id)) as EvidenceScreenshot | undefined;
  return result?.blob ?? null;
}

export async function deleteStep(id: string): Promise<void> {
  const db = await openEvidenceDb();
  const tx = db.transaction(['steps', 'screenshots'], 'readwrite');
  const step = await request(tx.objectStore('steps').get(id)) as EvidenceStep | undefined;
  if (step?.screenshotId) tx.objectStore('screenshots').delete(step.screenshotId);
  tx.objectStore('steps').delete(id);
}

export async function deleteSessionCascade(id: string): Promise<void> {
  const steps = await listSteps(id);
  for (const step of steps) await deleteStep(step.id);
  const db = await openEvidenceDb();
  await request(db.transaction('sessions', 'readwrite').objectStore('sessions').delete(id));
}

export async function deleteProjectCascade(id: string): Promise<void> {
  const sessions = await listSessions(id);
  for (const session of sessions) await deleteSessionCascade(session.id);
  const db = await openEvidenceDb();
  await request(db.transaction('projects', 'readwrite').objectStore('projects').delete(id));
}

export async function migrateLegacyData(): Promise<number> {
  const marker = localStorage.getItem('homolog_idb_migration_web_v1');
  if (marker) return 0;
  const rawSteps = localStorage.getItem('homolog_steps_v1');
  const rawProject = localStorage.getItem('homolog_project_data_v1');
  if (!rawSteps && !rawProject) {
    localStorage.setItem('homolog_idb_migration_web_v1', String(Date.now()));
    return 0;
  }
  const now = Date.now();
  const oldProject = rawProject ? JSON.parse(rawProject) : {};
  const project: EvidenceProject = {
    id: newId(), name: oldProject.projectName || 'Projeto migrado', feature: oldProject.frontName || '',
    environment: '', version: '', responsible: oldProject.responsible || '', date: oldProject.projectDate || '',
    browser: navigator.userAgent, expectedResult: oldProject.expectedResult || '', overallResult: '',
    createdAt: now, updatedAt: now,
  };
  const session: EvidenceSession = { id: newId(), projectId: project.id, name: 'Sessão migrada', state: 'finalized', createdAt: now, updatedAt: now };
  await saveProject(project); await saveSession(session);
  const oldSteps = rawSteps ? JSON.parse(rawSteps) : [];
  let migrated = 0;
  for (const [index, old] of oldSteps.entries()) {
    const screenshotId = old.imageDataUrl ? newId() : null;
    const step: EvidenceStep = {
      id: old.id || newId(), sessionId: session.id, projectId: project.id, sequence: index + 1,
      title: old.title || `Passo ${index + 1}`, action: 'Clique', element: old.tag || '', description: old.description || '',
      expectedResult: '', actualResult: '', status: 'not-run', url: '', timestamp: now + index, screenshotId,
    };
    const blob = old.imageDataUrl ? await (await fetch(old.imageDataUrl)).blob() : undefined;
    await saveStep(step, blob); migrated += 1;
  }
  // Dados antigos são mantidos. Apenas registramos a conclusão após todas as gravações.
  localStorage.setItem('homolog_idb_migration_web_v1', String(Date.now()));
  return migrated;
}

export async function exportBackup(): Promise<Blob> {
  const db = await openEvidenceDb();
  const names = ['projects', 'sessions', 'steps', 'settings'] as const;
  const result: Record<string, unknown> = { schema: 'homolog-web-backup', version: 1, exportedAt: Date.now() };
  for (const name of names) result[name] = await request(db.transaction(name).objectStore(name).getAll());
  const screenshots = await request(db.transaction('screenshots').objectStore('screenshots').getAll()) as EvidenceScreenshot[];
  result.screenshots = await Promise.all(screenshots.map(async ({ blob, ...meta }) => ({ ...meta, dataUrl: await blobToDataUrl(blob) })));
  return new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(reader.error); reader.readAsDataURL(blob); });
}

export async function importBackup(file: Blob): Promise<void> {
  const data = JSON.parse(await file.text());
  if (data?.schema !== 'homolog-web-backup' || data.version !== 1) throw new Error('Backup incompatível.');
  for (const project of data.projects ?? []) await write('projects', project);
  for (const session of data.sessions ?? []) await write('sessions', session);
  for (const step of data.steps ?? []) await write('steps', step);
  for (const screenshot of data.screenshots ?? []) {
    const { dataUrl, ...meta } = screenshot;
    await write('screenshots', { ...meta, blob: await (await fetch(dataUrl)).blob() });
  }
}

/** Importação idempotente do banco isolado da extensão para o painel web. */
export async function importExtensionSnapshot(data: unknown): Promise<{ projects: number; sessions: number; steps: number }> {
  const backup = data as ExtensionBackup;
  if (backup?.schema !== 'homolog-backup' || backup.schemaVersion !== 1) {
    throw new Error('A extensão retornou dados incompatíveis. Atualize a extensão e tente novamente.');
  }

  const shots = new Map(backup.screenshotsMeta.map((shot) => [String(shot.stepId), shot]));
  const existingProjects = new Map((await listProjects()).map((item) => [item.id, item]));
  for (const source of backup.projects) {
    const metadata = (source.metadata ?? {}) as Record<string, any>;
    const existing = existingProjects.get(String(source.projectId));
    await saveProject({
      id: String(source.projectId), name: existing?.name ?? String(source.name || 'Projeto Homolog'),
      feature: existing?.feature ?? String(metadata.feature ?? ''), environment: existing?.environment ?? String(metadata.environment ?? ''),
      version: existing?.version ?? String(metadata.version ?? ''), responsible: existing?.responsible ?? String(metadata.responsible ?? ''),
      date: existing?.date ?? String(metadata.date ?? new Date(source.createdAt ?? Date.now()).toISOString().slice(0, 10)),
      browser: existing?.browser ?? String(metadata.browser ?? navigator.userAgent), expectedResult: existing?.expectedResult ?? String(metadata.expectedResult ?? ''),
      overallResult: existing?.overallResult ?? String(metadata.overallResult ?? ''), createdAt: existing?.createdAt ?? Number(source.createdAt ?? Date.now()),
      updatedAt: Number(source.updatedAt ?? Date.now()),
    });
  }
  for (const source of backup.sessions) {
    await saveSession({
      id: String(source.sessionId), projectId: String(source.projectId), name: String(source.name || 'Sessão gravada'),
      state: source.state === 'recording' || source.state === 'paused' || source.state === 'finalized' ? source.state : 'idle',
      createdAt: Number(source.createdAt ?? source.startedAt ?? Date.now()), updatedAt: Number(source.updatedAt ?? Date.now()),
    });
  }
  for (const source of backup.steps) {
    const target = (source.target ?? {}) as Record<string, any>;
    const shot = shots.get(String(source.stepId));
    const screenshotId = shot ? String(shot.screenshotId) : null;
    const db = await openEvidenceDb();
    const existing = await request(db.transaction('steps').objectStore('steps').get(String(source.stepId))) as EvidenceStep | undefined;
    const step: EvidenceStep = {
      id: String(source.stepId), sessionId: String(source.sessionId), projectId: String(source.projectId),
      sequence: Number(source.sequence), title: `Passo ${Number(source.sequence)}`,
      action: source.actionType === 'tap' ? 'Toque' : 'Clique',
      element: String(target.accessibleName || target.visibleText || target.ariaLabel || target.tagName || ''),
      description: String(source.description || 'Interação registrada.'), expectedResult: '', actualResult: '',
      status: 'not-run', url: String(source.url || ''), timestamp: Number(source.timestamp ?? Date.now()), screenshotId,
      highlight: source.viewportPoint ?? null,
      sensitive: target.sensitivity === 'password' || target.sensitivity === 'sensitive',
      technicalData: { target, stableSelector: source.stableSelector, pageTitle: source.pageTitle, viewportSize: source.viewportSize },
    };
    if(existing){step.title=existing.title;step.description=existing.description;step.expectedResult=existing.expectedResult;step.actualResult=existing.actualResult;step.status=existing.status;step.sensitive=existing.sensitive;}
    const imageExists = screenshotId ? await getScreenshot(screenshotId) : null;
    const image = !imageExists && shot?.imageDataUrl ? await (await fetch(String(shot.imageDataUrl))).blob() : undefined;
    await saveStep(step, image);
  }
  return { projects: backup.projects.length, sessions: backup.sessions.length, steps: backup.steps.length };
}

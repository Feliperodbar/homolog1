import type { RecordingSession, RecordingStep } from '../types';
import { STORAGE_KEY_LAST_STEP, STORAGE_KEY_RECORDING, STORAGE_KEY_STEPS } from '../constants';
import { uuidv4 } from '../uuid';

import type {
  HomologBackupV1,
  HomologProject,
  HomologScreenshot,
  HomologScreenshotPersistedV2,
  HomologSession,
  HomologSettingEntry,
  HomologStep,
  MigrationResult,
  ProjectId,
  SaveIndicatorSnapshot,
  SaveIndicatorStatus,
  SessionId,
  SettingsKey,
  ScreenshotId,
  StepId,
  FullProjectTree,
} from './types';
import { INDEX, STORE } from './types';
import {
  closeDatabase,
  getKeyRange,
  openDatabase,
  withTransaction,
  wrapRequest,
} from './idbConnection';
import {
  blobToDataUrl,
  blobToUint8Array,
  dataUrlToBlob as _dataUrlToBlob,
  dataUrlToUint8AndMime,
  detectImageMimeOrDefault,
  readBlobDimensions,
  uint8ArrayToBlob,
} from './blobUtils';

export { closeDatabase };

type PersistedScreenshot = HomologScreenshotPersistedV2 & {
  image?: Blob;
  imageBytes?: Uint8Array;
  imageMime?: string;
};

async function _screenshotToPersisted(domain: HomologScreenshot): Promise<PersistedScreenshot> {
  const bytes = domain.image instanceof Uint8Array
    ? domain.image as unknown as Uint8Array
    : await blobToUint8Array(domain.image as Blob);
  const mime = ((domain.image as unknown as { type?: string })?.type) || domain.format || 'image/jpeg';
  const out: PersistedScreenshot = {
    screenshotId: domain.screenshotId,
    stepId: domain.stepId,
    sessionId: domain.sessionId,
    projectId: domain.projectId,
    imageBytes: bytes,
    imageMime: mime,
    format: domain.format,
    widthPx: domain.widthPx,
    heightPx: domain.heightPx,
    sizeBytes: domain.sizeBytes,
    createdAt: domain.createdAt,
  };
  return out;
}

function screenshotFromPersisted(persisted: PersistedScreenshot): HomologScreenshot {
  const mimeOrFmt: string =
    persisted.imageMime || persisted.format || 'image/jpeg';
  const rawBytes = persisted.imageBytes as unknown;
  let image: Blob;
  if (rawBytes instanceof ArrayBuffer) {
    image = uint8ArrayToBlob(new Uint8Array(rawBytes), mimeOrFmt);
  } else if (ArrayBuffer.isView(rawBytes)) {
    const view = rawBytes as ArrayBufferView;
    image = uint8ArrayToBlob(
      new Uint8Array(view.buffer, view.byteOffset, view.byteLength),
      mimeOrFmt,
    );
  } else if (Array.isArray(rawBytes)) {
    image = uint8ArrayToBlob(new Uint8Array(rawBytes), mimeOrFmt);
  } else if (persisted.image instanceof Blob) {
    image = persisted.image;
  } else {
    image = new Blob([new Uint8Array(0)], { type: mimeOrFmt });
  }
  return {
    screenshotId: persisted.screenshotId,
    stepId: persisted.stepId,
    sessionId: persisted.sessionId,
    projectId: persisted.projectId,
    image,
    format: persisted.format,
    widthPx: persisted.widthPx,
    heightPx: persisted.heightPx,
    sizeBytes: persisted.sizeBytes,
    createdAt: persisted.createdAt,
  };
}

type RecordingStepLike = Pick<
  RecordingStep,
  | 'sessionId'
  | 'interactionId'
  | 'sequence'
  | 'actionType'
  | 'target'
  | 'stableSelector'
  | 'url'
  | 'pageTitle'
  | 'viewportPoint'
  | 'elementRect'
  | 'viewportSize'
  | 'devicePixelRatio'
  | 'description'
  | 'timestamp'
  | 'inputSource'
  | 'tabId'
  | 'isTrusted'
  | 'stepId'
  | 'screenshotDataUrl'
  | 'screenshotFormat'
  | 'screenshotWidthPx'
  | 'screenshotHeightPx'
  | 'screenshotSizeBytes'
>;

type RecordingSessionLike = Pick<
  RecordingSession,
  'sessionId' | 'state' | 'tabId' | 'stepCount' | 'startedAt' | 'endedAt'
> & {
  durationMs?: number;
  createdAt?: number;
  updatedAt?: number;
  name?: string;
  description?: string | null;
  projectId?: string;
};

const saveState: {
  status: SaveIndicatorStatus;
  pendingCount: number;
  lastSavedAt: number | null;
  lastError: string | null;
  listeners: Set<(s: SaveIndicatorSnapshot) => void>;
} = {
  status: 'idle',
  pendingCount: 0,
  lastSavedAt: null,
  lastError: null,
  listeners: new Set(),
};

function emitSave(): void {
  const snap = getSaveIndicatorSnapshot();
  for (const cb of Array.from(saveState.listeners)) {
    try {
      cb(snap);
    } catch {
      /* n/a */
    }
  }
}

export function getSaveIndicatorSnapshot(): SaveIndicatorSnapshot {
  return {
    status: saveState.status,
    pendingCount: saveState.pendingCount,
    lastSavedAt: saveState.lastSavedAt,
    lastError: saveState.lastError,
  };
}

export function subscribeSaveIndicator(
  cb: (s: SaveIndicatorSnapshot) => void,
): () => void {
  saveState.listeners.add(cb);
  cb(getSaveIndicatorSnapshot());
  return () => {
    saveState.listeners.delete(cb);
  };
}

function beginSave(): void {
  saveState.pendingCount += 1;
  saveState.status = 'saving';
  emitSave();
}

function endSave(err?: string | null): void {
  saveState.pendingCount = Math.max(0, saveState.pendingCount - 1);
  if (err) {
    saveState.status = 'error';
    saveState.lastError = err;
  } else if (saveState.pendingCount === 0) {
    saveState.status = 'saved';
    saveState.lastSavedAt = Date.now();
    saveState.lastError = null;
  } else {
    saveState.status = 'saving';
  }
  emitSave();
}

export async function estimateStorageQuota(): Promise<{
  usageBytes: number;
  quotaBytes: number;
  usagePercent: number;
  isAvailable: boolean;
}> {
  try {
    if (!navigator.storage || !navigator.storage.estimate) {
      return { usageBytes: 0, quotaBytes: 0, usagePercent: 0, isAvailable: false };
    }
    const e = await navigator.storage.estimate();
    const usage = Number(e.usage ?? 0);
    const quota = Number(e.quota ?? 0);
    return {
      usageBytes: usage,
      quotaBytes: quota,
      usagePercent: quota > 0 ? (usage / quota) * 100 : 0,
      isAvailable: true,
    };
  } catch {
    return { usageBytes: 0, quotaBytes: 0, usagePercent: 0, isAvailable: false };
  }
}

export function friendlyStorageError(cause: unknown, operation: string): Error {
  const q = /quota/i.test(cause instanceof Error ? cause.message : String(cause ?? ''));
  const msg = q
    ? `Armazenamento cheio (Quota excedida) ao ${operation}. Libere espaço excluindo sessões antigas ou exporte backup.`
    : `Erro ao ${operation}: ${cause instanceof Error ? cause.message : String(cause ?? 'desconhecido')}`;
  const e = new Error(msg);
  (e as Error & { code?: string; cause?: unknown }).code = q ? 'ERR_STORAGE_QUOTA' : 'ERR_STORAGE_OP';
  (e as Error & { cause?: unknown }).cause = cause;
  return e;
}

/* --- Project --- */
export async function createProject(input: {
  name: string;
  description?: string | null;
  color?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<HomologProject> {
  beginSave();
  try {
    await openDatabase();
    const now = Date.now();
    const project: HomologProject = {
      projectId: uuidv4(),
      name: String(input.name || 'Projeto sem nome').slice(0, 200),
      description: input.description ?? null,
      color: input.color ?? null,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
      metadata: input.metadata ?? {},
    };
    await withTransaction(STORE.PROJECTS, 'readwrite', (tx) => {
      const store = tx.objectStore(STORE.PROJECTS);
      return wrapRequest(store.put(project));
    });
    endSave();
    return project;
  } catch (e) {
    endSave(e instanceof Error ? e.message : String(e));
    throw friendlyStorageError(e, 'criar projeto');
  }
}

export async function updateProject(
  projectId: ProjectId,
  patch: Partial<Omit<HomologProject, 'projectId' | 'createdAt'>>,
): Promise<HomologProject> {
  beginSave();
  try {
    const proj = await getProjectById(projectId);
    if (!proj) throw new Error(`projeto ${projectId} nao existe`);
    const updated: HomologProject = {
      ...proj,
      ...patch,
      projectId: proj.projectId,
      createdAt: proj.createdAt,
      updatedAt: Date.now(),
    };
    await withTransaction(STORE.PROJECTS, 'readwrite', (tx) =>
      wrapRequest(tx.objectStore(STORE.PROJECTS).put(updated)),
    );
    endSave();
    return updated;
  } catch (e) {
    endSave(e instanceof Error ? e.message : String(e));
    throw friendlyStorageError(e, 'atualizar projeto');
  }
}

export async function getProjectById(projectId: ProjectId): Promise<HomologProject | null> {
  try {
    await openDatabase();
    return await withTransaction(STORE.PROJECTS, 'readonly', (tx) =>
      wrapRequest<HomologProject | undefined>(tx.objectStore(STORE.PROJECTS).get(projectId)).then(
        (v) => v ?? null,
      ),
    );
  } catch (e) {
    throw friendlyStorageError(e, 'ler projeto');
  }
}

export async function listProjects(opts: {
  includeArchived?: boolean;
  sortBy?: 'name' | 'updatedAt' | 'createdAt';
  limit?: number;
} = {}): Promise<Array<HomologProject>> {
  try {
    await openDatabase();
    const includeArchived = !!opts.includeArchived;
    const sortBy = opts.sortBy ?? 'updatedAt';
    const limit = typeof opts.limit === 'number' ? opts.limit : undefined;
    return await withTransaction(STORE.PROJECTS, 'readonly', (tx) => {
      return new Promise<HomologProject[]>((resolve, reject) => {
        const store = tx.objectStore(STORE.PROJECTS);
        let source: IDBObjectStore | IDBIndex = store;
        if (sortBy === 'name') source = store.index('by_name');
        else if (sortBy === 'createdAt') source = store.index('by_createdAt');
        else source = store.index('by_updatedAt');
        const cursorReq = source.openCursor(null, 'prev');
        const out: HomologProject[] = [];
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (!cursor) return resolve(out);
          const v = cursor.value as HomologProject;
          if (!includeArchived && v.archivedAt) {
            cursor.continue();
            return;
          }
          out.push(v);
          if (limit !== undefined && out.length >= limit) return resolve(out);
          cursor.continue();
        };
        cursorReq.onerror = () => reject(cursorReq.error ?? new Error('cursor falhou'));
      });
    });
  } catch (e) {
    throw friendlyStorageError(e, 'listar projetos');
  }
}

/* --- Session --- */
export async function createSession(input: {
  projectId: ProjectId;
  name?: string | null;
  description?: string | null;
  state?: RecordingSession['state'];
  tabId?: number | null;
  metadata?: Record<string, unknown>;
}): Promise<HomologSession> {
  beginSave();
  try {
    await openDatabase();
    const proj = await getProjectById(input.projectId);
    if (!proj) throw new Error(`projeto ${input.projectId} nao existe para criar sessao`);
    const now = Date.now();
    const sess: HomologSession = {
      sessionId: uuidv4(),
      projectId: input.projectId,
      name: input.name ? String(input.name).slice(0, 200) : `Sessão ${new Date(now).toLocaleString('pt-BR')}`,
      description: input.description ?? null,
      state: input.state ?? 'recording',
      tabId: input.tabId ?? null,
      stepCount: 0,
      startedAt: input.state === 'recording' || input.state === 'paused' ? now : null,
      endedAt: null,
      createdAt: now,
      updatedAt: now,
      durationMs: 0,
      metadata: input.metadata ?? {},
    };
    await withTransaction(STORE.SESSIONS, 'readwrite', (tx) =>
      wrapRequest(tx.objectStore(STORE.SESSIONS).put(sess)),
    );
    endSave();
    return sess;
  } catch (e) {
    endSave(e instanceof Error ? e.message : String(e));
    throw friendlyStorageError(e, 'criar sessao');
  }
}

export async function upsertSessionFromRecordingSession(
  projectId: ProjectId,
  rs: RecordingSessionLike,
  opts?: { name?: string | null; description?: string | null },
): Promise<HomologSession> {
  beginSave();
  try {
    await openDatabase();
    const existing = await getSessionById(rs.sessionId);
    const now = Date.now();
    if (existing && existing.projectId !== projectId) {
      throw new Error('sessao pertence a outro projeto (projectId divergente)');
    }
    const sess: HomologSession = existing
      ? {
          ...existing,
          state: rs.state,
          tabId: rs.tabId ?? existing.tabId,
          stepCount: rs.stepCount ?? existing.stepCount,
          startedAt: rs.startedAt ?? existing.startedAt,
          endedAt: rs.endedAt ?? existing.endedAt,
          updatedAt: now,
          durationMs: rs.durationMs ?? existing.durationMs,
          name: opts?.name ?? existing.name,
          description: opts?.description ?? existing.description,
        }
      : {
          sessionId: rs.sessionId,
          projectId,
          name: opts?.name ? String(opts.name).slice(0, 200) : `Sessão ${new Date(now).toLocaleString('pt-BR')}`,
          description: opts?.description ?? null,
          state: rs.state,
          tabId: rs.tabId ?? null,
          stepCount: rs.stepCount ?? 0,
          startedAt: rs.startedAt ?? now,
          endedAt: rs.endedAt ?? null,
          createdAt: (rs as { createdAt?: number }).createdAt ?? now,
          updatedAt: (rs as { updatedAt?: number }).updatedAt ?? now,
          durationMs: rs.durationMs ?? 0,
          metadata: {},
        };
    await withTransaction(STORE.SESSIONS, 'readwrite', (tx) =>
      wrapRequest(tx.objectStore(STORE.SESSIONS).put(sess)),
    );
    endSave();
    return sess;
  } catch (e) {
    endSave(e instanceof Error ? e.message : String(e));
    throw friendlyStorageError(e, 'persistir sessao');
  }
}

export async function getSessionById(sessionId: SessionId): Promise<HomologSession | null> {
  try {
    await openDatabase();
    return await withTransaction(STORE.SESSIONS, 'readonly', (tx) =>
      wrapRequest<HomologSession | undefined>(tx.objectStore(STORE.SESSIONS).get(sessionId)).then(
        (v) => v ?? null,
      ),
    );
  } catch (e) {
    throw friendlyStorageError(e, 'ler sessao');
  }
}

export async function listSessionsByProject(projectId: ProjectId): Promise<Array<HomologSession>> {
  try {
    await openDatabase();
    return await withTransaction(STORE.SESSIONS, 'readonly', (tx) => {
      return new Promise<HomologSession[]>((resolve, reject) => {
        const idx = tx.objectStore(STORE.SESSIONS).index(INDEX.SESSIONS_BY_PROJECT);
        const range = getKeyRange().lowerBound([projectId]);
        const cursorReq = idx.openCursor(range, 'prev');
        const out: HomologSession[] = [];
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (!cursor) return resolve(out.reverse());
          const val = cursor.value as HomologSession;
          if (val.projectId !== projectId) return resolve(out.reverse());
          out.push(val);
          cursor.continue();
        };
        cursorReq.onerror = () => reject(cursorReq.error ?? new Error('cursor falhou'));
      });
    });
  } catch (e) {
    throw friendlyStorageError(e, 'listar sessoes');
  }
}

/* --- Steps + Screenshots --- */
export async function addStepWithScreenshot(
  projectId: ProjectId,
  sessionId: SessionId,
  stepLike: RecordingStepLike,
  screenshotBlob?: Blob | null,
): Promise<{ step: HomologStep; screenshot: HomologScreenshot | null }> {
  beginSave();
  try {
    await openDatabase();
    const now = stepLike.timestamp || Date.now();
    const screenshotId: ScreenshotId | null = screenshotBlob ? uuidv4() : null;
    const format = detectImageMimeOrDefault(
      screenshotBlob ?? stepLike.screenshotFormat ?? 'image/jpeg',
      'image/jpeg',
    );
    const step: HomologStep = {
      stepId: stepLike.stepId ?? uuidv4(),
      sessionId,
      projectId,
      sequence: stepLike.sequence,
      actionType: stepLike.actionType ?? 'unknown',
      interactionId: stepLike.interactionId,
      screenshotId,
      target: stepLike.target as unknown as object & Record<string, unknown>,
      stableSelector: stepLike.stableSelector ?? null,
      url: stepLike.url,
      pageTitle: stepLike.pageTitle ?? '',
      viewportPoint: { ...stepLike.viewportPoint },
      elementRect: { ...stepLike.elementRect },
      viewportSize: { ...stepLike.viewportSize },
      devicePixelRatio: stepLike.devicePixelRatio ?? 1,
      description: stepLike.description ?? '',
      timestamp: now,
      inputSource: stepLike.inputSource ?? 'unknown',
      tabId: stepLike.tabId ?? null,
      isTrusted: !!stepLike.isTrusted,
      metadata: {},
    };
    let screenshot: HomologScreenshot | null = null;
    let screenshotPersistedBytes: Uint8Array | null = null;
    let screenshotPersistedMime: string = format;
    if (screenshotBlob && screenshotId) {
      screenshotPersistedBytes = await blobToUint8Array(screenshotBlob);
      screenshotPersistedMime =
        (screenshotBlob as unknown as { type?: string })?.type ||
        detectImageMimeOrDefault(screenshotBlob, 'image/jpeg');
      const { widthPx, heightPx } = stepLike.screenshotWidthPx && stepLike.screenshotHeightPx
        ? { widthPx: stepLike.screenshotWidthPx, heightPx: stepLike.screenshotHeightPx }
        : await readBlobDimensions(screenshotBlob);
      screenshot = {
        screenshotId,
        stepId: step.stepId,
        sessionId,
        projectId,
        image: uint8ArrayToBlob(screenshotPersistedBytes, screenshotPersistedMime),
        format,
        widthPx,
        heightPx,
        sizeBytes: screenshotPersistedBytes.length,
        createdAt: now,
      };
    } else if (stepLike.screenshotDataUrl && stepLike.screenshotDataUrl.length > 32) {
      const { bytes, mime } = dataUrlToUint8AndMime(stepLike.screenshotDataUrl);
      screenshotPersistedBytes = bytes;
      screenshotPersistedMime = mime;
      const id = uuidv4();
      const finalFormat: 'image/png' | 'image/jpeg' = stepLike.screenshotFormat === 'image/png'
        ? 'image/png'
        : detectImageMimeOrDefault(mime);
      const hasDims = stepLike.screenshotWidthPx && stepLike.screenshotHeightPx;
      const dims = hasDims
        ? { widthPx: stepLike.screenshotWidthPx, heightPx: stepLike.screenshotHeightPx }
        : screenshotPersistedBytes.length
          ? { widthPx: 2, heightPx: 2 }
          : { widthPx: 0, heightPx: 0 };
      screenshot = {
        screenshotId: id,
        stepId: step.stepId,
        sessionId,
        projectId,
        image: uint8ArrayToBlob(screenshotPersistedBytes, screenshotPersistedMime),
        format: finalFormat,
        widthPx: dims.widthPx,
        heightPx: dims.heightPx,
        sizeBytes: screenshotPersistedBytes.length,
        createdAt: now,
      };
      (step as { screenshotId: ScreenshotId | null }).screenshotId = id;
    }
    const stores: string[] = [STORE.STEPS];
    if (screenshot) stores.push(STORE.SCREENSHOTS, STORE.SESSIONS);
    let persistedShot: PersistedScreenshot | null = null;
    if (screenshot && screenshotPersistedBytes) {
      persistedShot = {
        screenshotId: screenshot.screenshotId,
        stepId: screenshot.stepId,
        sessionId: screenshot.sessionId,
        projectId: screenshot.projectId,
        imageBytes: screenshotPersistedBytes,
        imageMime: screenshotPersistedMime,
        format: screenshot.format,
        widthPx: screenshot.widthPx,
        heightPx: screenshot.heightPx,
        sizeBytes: screenshotPersistedBytes.length,
        createdAt: screenshot.createdAt,
      };
    }
    await withTransaction(stores, 'readwrite', async (tx) => {
      const stepsStore = tx.objectStore(STORE.STEPS);
      await wrapRequest(stepsStore.put(step));
      if (persistedShot) {
        const shotsStore = tx.objectStore(STORE.SCREENSHOTS);
        await wrapRequest(shotsStore.put(persistedShot));
      }
    });
    endSave();
    return { step, screenshot };
  } catch (e) {
    endSave(e instanceof Error ? e.message : String(e));
    throw friendlyStorageError(e, 'gravar passo com screenshot');
  }
}

export async function listStepsBySession(sessionId: SessionId): Promise<Array<HomologStep>> {
  try {
    await openDatabase();
    return await withTransaction(STORE.STEPS, 'readonly', (tx) => {
      return new Promise<HomologStep[]>((resolve, reject) => {
        const idx = tx.objectStore(STORE.STEPS).index(INDEX.STEPS_BY_SESSION);
        const range = getKeyRange().lowerBound([sessionId]);
        const cursorReq = idx.openCursor(range, 'next');
        const out: HomologStep[] = [];
        cursorReq.onsuccess = () => {
          const cursor = cursorReq.result;
          if (!cursor) return resolve(out);
          const val = cursor.value as HomologStep;
          if (val.sessionId !== sessionId) return resolve(out);
          out.push(val);
          cursor.continue();
        };
        cursorReq.onerror = () => reject(cursorReq.error ?? new Error('cursor falhou'));
      });
    });
  } catch (e) {
    throw friendlyStorageError(e, 'listar passos');
  }
}

export async function getScreenshotById(
  screenshotId: ScreenshotId,
): Promise<HomologScreenshot | null> {
  try {
    await openDatabase();
    return await withTransaction(STORE.SCREENSHOTS, 'readonly', (tx) =>
      wrapRequest<PersistedScreenshot | undefined>(
        tx.objectStore(STORE.SCREENSHOTS).get(screenshotId),
      ).then((v) => (v ? screenshotFromPersisted(v) : null)),
    );
  } catch (e) {
    throw friendlyStorageError(e, 'ler screenshot');
  }
}

/* --- Settings --- */
export async function getSetting<T = unknown>(key: SettingsKey): Promise<T | null> {
  try {
    await openDatabase();
    const r = await withTransaction(STORE.SETTINGS, 'readonly', (tx) =>
      wrapRequest<HomologSettingEntry<T> | undefined>(tx.objectStore(STORE.SETTINGS).get(key)).then(
        (v) => v ?? null,
      ),
    );
    return r?.value ?? null;
  } catch (e) {
    throw friendlyStorageError(e, `ler setting ${key}`);
  }
}

export async function setSetting<T = unknown>(key: SettingsKey, value: T): Promise<void> {
  beginSave();
  try {
    await openDatabase();
    const entry: HomologSettingEntry<T> = { key, value, updatedAt: Date.now() };
    await withTransaction(STORE.SETTINGS, 'readwrite', (tx) =>
      wrapRequest(tx.objectStore(STORE.SETTINGS).put(entry)),
    );
    endSave();
  } catch (e) {
    endSave(e instanceof Error ? e.message : String(e));
    throw friendlyStorageError(e, `gravar setting ${key}`);
  }
}

/* --- Delete + cascata --- */
export async function deleteStepCascade(stepId: StepId): Promise<void> {
  beginSave();
  try {
    await openDatabase();
    await withTransaction([STORE.STEPS, STORE.SCREENSHOTS], 'readwrite', async (tx) => {
      const shots = tx.objectStore(STORE.SCREENSHOTS);
      const shot = await wrapRequest<PersistedScreenshot | undefined>(
        shots.index(INDEX.SCREENSHOTS_BY_STEP).get([stepId]),
      );
      if (shot) await wrapRequest(shots.delete(shot.screenshotId));
      await wrapRequest(tx.objectStore(STORE.STEPS).delete(stepId));
    });
    endSave();
  } catch (e) {
    endSave(e instanceof Error ? e.message : String(e));
    throw friendlyStorageError(e, `excluir passo ${stepId}`);
  }
}

export async function clearSessionSteps(sessionId: SessionId): Promise<number> {
  const steps = await listStepsBySession(sessionId);
  for (const step of steps) await deleteStepCascade(step.stepId);
  return steps.length;
}

export async function moveSessionEvidenceToProject(
  sessionId: SessionId,
  projectId: ProjectId,
): Promise<{ steps: number; screenshots: number }> {
  await openDatabase();
  const steps = await listStepsBySession(sessionId);
  let screenshots = 0;
  await withTransaction([STORE.STEPS, STORE.SCREENSHOTS], 'readwrite', async (tx) => {
    const stepStore = tx.objectStore(STORE.STEPS);
    for (const step of steps) {
      await wrapRequest(stepStore.put({ ...step, projectId }));
    }
    const shotIndex = tx.objectStore(STORE.SCREENSHOTS).index('by_sessionId');
    await new Promise<void>((resolve, reject) => {
      const cursorRequest = shotIndex.openCursor(getKeyRange().only(sessionId));
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) return resolve();
        cursor.update({ ...(cursor.value as PersistedScreenshot), projectId });
        screenshots += 1;
        cursor.continue();
      };
      cursorRequest.onerror = () => reject(cursorRequest.error ?? new Error('cursor de screenshots falhou'));
    });
  });
  return { steps: steps.length, screenshots };
}

export async function deleteSessionCascade(sessionId: SessionId): Promise<{
  deletedSession: boolean;
  deletedSteps: number;
  deletedScreenshots: number;
}> {
  beginSave();
  try {
    await openDatabase();
    const sess = await getSessionById(sessionId);
    if (!sess) {
      endSave();
      return { deletedSession: false, deletedSteps: 0, deletedScreenshots: 0 };
    }
    const steps = await listStepsBySession(sessionId);
    const stepIds = steps.map((s) => s.stepId);
    let deletedSteps = 0;
    let deletedShots = 0;
    await withTransaction(
      [STORE.SESSIONS, STORE.STEPS, STORE.SCREENSHOTS],
      'readwrite',
      async (tx) => {
        const shotsStore = tx.objectStore(STORE.SCREENSHOTS);
        const stepIndex = shotsStore.index('by_sessionId');
        const shotsRange = getKeyRange().only(sessionId);
        await new Promise<void>((resolve, reject) => {
          const cur = stepIndex.openCursor(shotsRange);
          cur.onsuccess = () => {
            const cursor = cur.result;
            if (!cursor) return resolve();
            cursor.delete();
            deletedShots += 1;
            cursor.continue();
          };
          cur.onerror = () => reject(cur.error ?? new Error('cursor del shot falhou'));
        });
        const stepsStore = tx.objectStore(STORE.STEPS);
        for (const stepId of stepIds) {
          await wrapRequest(stepsStore.delete(stepId));
          deletedSteps += 1;
        }
        await wrapRequest(tx.objectStore(STORE.SESSIONS).delete(sessionId));
      },
    );
    endSave();
    return { deletedSession: true, deletedSteps, deletedScreenshots: deletedShots };
  } catch (e) {
    endSave(e instanceof Error ? e.message : String(e));
    throw friendlyStorageError(e, `excluir sessao ${sessionId}`);
  }
}

export async function deleteProjectCascade(projectId: ProjectId): Promise<{
  deletedProject: boolean;
  deletedSessions: number;
  deletedSteps: number;
  deletedScreenshots: number;
}> {
  beginSave();
  try {
    const proj = await getProjectById(projectId);
    if (!proj) {
      endSave();
      return { deletedProject: false, deletedSessions: 0, deletedSteps: 0, deletedScreenshots: 0 };
    }
    void (await listSessionsByProject(projectId));
    let deletedSteps = 0;
    let deletedShots = 0;
    let deletedSessions = 0;
    await withTransaction(
      [STORE.PROJECTS, STORE.SESSIONS, STORE.STEPS, STORE.SCREENSHOTS],
      'readwrite',
      async (tx) => {
        const projStore = tx.objectStore(STORE.PROJECTS);
        const sessionStore = tx.objectStore(STORE.SESSIONS);
        const stepsStore = tx.objectStore(STORE.STEPS);
        const shotsStore = tx.objectStore(STORE.SCREENSHOTS);
        const sessionIdx = sessionStore.index(INDEX.SESSIONS_BY_PROJECT);
        const sessRange = getKeyRange().lowerBound([projectId]);
        const sessionIds: string[] = [];
        await new Promise<void>((resolve, reject) => {
          const cur = sessionIdx.openCursor(sessRange);
          cur.onsuccess = () => {
            const cursor = cur.result;
            if (!cursor) return resolve();
            const val = cursor.value as HomologSession;
            if (val.projectId !== projectId) return resolve();
            sessionIds.push(val.sessionId);
            cursor.delete();
            deletedSessions += 1;
            cursor.continue();
          };
          cur.onerror = () => reject(cur.error ?? new Error('cursor del sessao falhou'));
        });
        const stepProjectIdx = stepsStore.index('by_projectId');
        await new Promise<void>((resolve, reject) => {
          const cur = stepProjectIdx.openCursor(getKeyRange().only(projectId));
          cur.onsuccess = () => {
            const cursor = cur.result;
            if (!cursor) return resolve();
            cursor.delete();
            deletedSteps += 1;
            cursor.continue();
          };
          cur.onerror = () => reject(cur.error ?? new Error('cursor del step falhou'));
        });
        const shotProjectIdx = shotsStore.index('by_projectId');
        await new Promise<void>((resolve, reject) => {
          const cur = shotProjectIdx.openCursor(getKeyRange().only(projectId));
          cur.onsuccess = () => {
            const cursor = cur.result;
            if (!cursor) return resolve();
            cursor.delete();
            deletedShots += 1;
            cursor.continue();
          };
          cur.onerror = () => reject(cur.error ?? new Error('cursor del shot falhou'));
        });
        await wrapRequest(projStore.delete(projectId));
        void deletedSessions;
        void sessionIds;
      },
    );
    endSave();
    return { deletedProject: true, deletedSessions, deletedSteps, deletedScreenshots: deletedShots };
  } catch (e) {
    endSave(e instanceof Error ? e.message : String(e));
    throw friendlyStorageError(e, `excluir projeto ${projectId}`);
  }
}

export async function getFullProjectTree(projectId: ProjectId): Promise<FullProjectTree | null> {
  const project = await getProjectById(projectId);
  if (!project) return null;
  const sessions = await listSessionsByProject(projectId);
  const out: FullProjectTree['sessions'] = [];
  for (const s of sessions) {
    const steps = await listStepsBySession(s.sessionId);
    const rich: FullProjectTree['sessions'][number] = {
      ...s,
      steps: [],
    };
    for (const step of steps) {
      let screenshot: HomologScreenshot | null = null;
      if (step.screenshotId) {
        screenshot = await getScreenshotById(step.screenshotId);
      }
      rich.steps.push({ ...step, screenshot });
    }
    out.push(rich);
  }
  return { project, sessions: out };
}

/* --- Migration from chrome.storage.local (legado) --- */
export async function migrateFromLegacyChromeStorage(opts: {
  getLegacy?: (key: string) => Promise<unknown>;
  removeLegacyAfter?: boolean;
  defaultProjectName?: string;
  defaultSessionName?: string;
} = {}): Promise<MigrationResult> {
  beginSave();
  const result: MigrationResult = {
    ok: true,
    migratedProjects: 0,
    migratedSessions: 0,
    migratedSteps: 0,
    migratedScreenshots: 0,
    skippedLegacyEmpty: true,
    errors: [],
  };
  const getter = opts.getLegacy ?? (async (k: string) => {
    if (typeof chrome === 'undefined' || !chrome.storage?.local?.get) return undefined;
    const r = await chrome.storage.local.get(k);
    return r?.[k];
  });
  try {
    const [rawRec, rawSteps] = await Promise.all([
      getter(STORAGE_KEY_RECORDING),
      getter(STORAGE_KEY_STEPS),
    ]);
    const rec = rawRec && typeof rawRec === 'object' ? (rawRec as Record<string, unknown>) : null;
    const steps = Array.isArray(rawSteps) ? (rawSteps as Array<Record<string, unknown>>) : [];
    if (!rec && steps.length === 0) {
      result.skippedLegacyEmpty = true;
      await setSetting('migration.v1.completedAt', Date.now());
      result.completedAt = Date.now();
      endSave();
      return result;
    }
    result.skippedLegacyEmpty = false;
    const projectName = opts.defaultProjectName ?? 'Projeto (migrado do legado)';
    const project = await createProject({ name: projectName });
    result.migratedProjects = 1;

    const sessionName = opts.defaultSessionName ??
      (rec?.sessionId ? `Sessão ${String(rec.sessionId).slice(0, 8)}` : 'Sessão migrada');
    const rsLike = {
      sessionId: (rec?.sessionId as string | undefined) ?? uuidv4(),
      state: (rec?.state as HomologSession['state'] | undefined) ?? 'finalized',
      tabId: (rec?.tabId as number | null | undefined) ?? null,
      stepCount: Number(rec?.stepCount ?? steps.length),
      startedAt: typeof rec?.startedAt === 'number' ? rec.startedAt : null,
      endedAt: typeof rec?.endedAt === 'number' ? rec.endedAt : null,
      durationMs: Number(rec?.durationMs ?? 0),
    };
    const session = await upsertSessionFromRecordingSession(project.projectId, rsLike, {
      name: sessionName,
      description: 'Sessão migrada do armazenamento legado (localStorage/chrome.storage.local)',
    });
    result.migratedSessions = 1;

    for (const raw of steps) {
      try {
        const valid = validateRecordingStepLegacy(raw);
        if (!valid) continue;
        const { step, screenshot } = await addStepWithScreenshot(
          project.projectId,
          session.sessionId,
          valid as RecordingStepLike,
          null,
        );
        void step;
        if (screenshot) result.migratedScreenshots += 1;
        result.migratedSteps += 1;
      } catch (e) {
        result.errors.push(`step_migrate: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    const updatedSession = { ...session, stepCount: result.migratedSteps };
    await withTransaction(STORE.SESSIONS, 'readwrite', (tx) =>
      wrapRequest(tx.objectStore(STORE.SESSIONS).put(updatedSession)),
    );

    result.completedAt = Date.now();
    await setSetting('migration.v1.completedAt', result.completedAt);

    if (opts.removeLegacyAfter && typeof chrome !== 'undefined' && chrome.storage?.local?.remove) {
      try {
        await chrome.storage.local.remove([STORAGE_KEY_STEPS, STORAGE_KEY_LAST_STEP]);
      } catch (e) {
        result.errors.push(
          `remove_legado_apos_migracao: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
    if (result.errors.length > 0) result.ok = false;
    endSave();
    return result;
  } catch (e) {
    endSave(e instanceof Error ? e.message : String(e));
    result.ok = false;
    result.errors.push(`top_level: ${e instanceof Error ? e.message : String(e)}`);
    return result;
  }
}

function validateRecordingStepLegacy(raw: Record<string, unknown>): RecordingStepLike | null {
  if (!raw || typeof raw !== 'object') return null;
  if (!('stepId' in raw) || typeof raw.stepId !== 'string') return null;
  return raw as RecordingStepLike;
}

/* --- Delete steps + screenshots preservando sessao (usado por overwrite) --- */
async function deleteStepsAndScreenshotsBySession(
  sessionId: SessionId,
): Promise<{ deletedSteps: number; deletedScreenshots: number }> {
  try {
    await openDatabase();
    const steps = await listStepsBySession(sessionId);
    const stepIds = steps.map((s) => s.stepId);
    let deletedSteps = 0;
    let deletedShots = 0;
    await withTransaction(
      [STORE.STEPS, STORE.SCREENSHOTS],
      'readwrite',
      async (tx) => {
        const shotsStore = tx.objectStore(STORE.SCREENSHOTS);
        const shotIndex = shotsStore.index('by_sessionId');
        const shotsRange = getKeyRange().only(sessionId);
        await new Promise<void>((resolve, reject) => {
          const cur = shotIndex.openCursor(shotsRange);
          cur.onsuccess = () => {
            const cursor = cur.result;
            if (!cursor) return resolve();
            cursor.delete();
            deletedShots += 1;
            cursor.continue();
          };
          cur.onerror = () => reject(cur.error ?? new Error('cursor del shot (by_session) falhou'));
        });
        const stepsStore = tx.objectStore(STORE.STEPS);
        for (const stepId of stepIds) {
          await wrapRequest(stepsStore.delete(stepId));
          deletedSteps += 1;
        }
      },
    );
    return { deletedSteps, deletedScreenshots: deletedShots };
  } catch (e) {
    throw friendlyStorageError(e, `limpar passos da sessao ${sessionId}`);
  }
}

/* --- Backup export/import local --- */
export async function exportBackup(
  opts: { projectIds?: ProjectId[]; includeScreenshots?: boolean } = {},
): Promise<HomologBackupV1> {
  try {
    await openDatabase();
    const projects = opts.projectIds?.length
      ? (await Promise.all(opts.projectIds.map((id) => getProjectById(id)))).filter(
          (p): p is HomologProject => !!p,
        )
      : await listProjects({ includeArchived: true });

    const projectIdSet = new Set(projects.map((p) => p.projectId));
    const allSessions: HomologSession[] = [];
    const allSteps: HomologStep[] = [];
    const allShotsMeta: Array<HomologBackupV1['screenshotsMeta'][number]> = [];
    const settings: HomologSettingEntry[] = await withTransaction(
      STORE.SETTINGS,
      'readonly',
      (tx) => {
        return new Promise<HomologSettingEntry[]>((resolve, reject) => {
          const cur = tx.objectStore(STORE.SETTINGS).openCursor();
          const out: HomologSettingEntry[] = [];
          cur.onsuccess = () => {
            const cursor = cur.result;
            if (!cursor) return resolve(out);
            out.push(cursor.value as HomologSettingEntry);
            cursor.continue();
          };
          cur.onerror = () => reject(cur.error ?? new Error('settings cursor falhou'));
        });
      },
    );

    for (const p of projects) {
      const ss = await listSessionsByProject(p.projectId);
      for (const s of ss) {
        allSessions.push(s);
        const steps = await listStepsBySession(s.sessionId);
        for (const step of steps) {
          if (!projectIdSet.has(step.projectId)) continue;
          allSteps.push(step);
          if (step.screenshotId) {
            const shot = await getScreenshotById(step.screenshotId);
            if (shot) {
              const dataUrl = (opts.includeScreenshots ?? true)
                ? await blobToDataUrl(shot.image)
                : undefined;
              allShotsMeta.push({
                screenshotId: shot.screenshotId,
                stepId: shot.stepId,
                sessionId: shot.sessionId,
                projectId: shot.projectId,
                ...(dataUrl ? { imageDataUrl: dataUrl } : {}),
                format: shot.format,
                widthPx: shot.widthPx,
                heightPx: shot.heightPx,
                sizeBytes: shot.sizeBytes,
                createdAt: shot.createdAt,
              });
            }
          }
        }
      }
    }
    return {
      schema: 'homolog-backup',
      schemaVersion: 1,
      exportedAt: Date.now(),
      projects,
      sessions: allSessions,
      steps: allSteps,
      screenshotsMeta: allShotsMeta,
      settings,
    };
  } catch (e) {
    throw friendlyStorageError(e, 'exportar backup');
  }
}

export async function importBackup(
  backup: HomologBackupV1,
  opts?: { onConflict?: 'skip' | 'overwrite' | 'renameProject' },
): Promise<{
  importedProjects: number;
  importedSessions: number;
  importedSteps: number;
  importedScreenshots: number;
  errors: Array<string>;
}> {
  beginSave();
  const report = {
    importedProjects: 0,
    importedSessions: 0,
    importedSteps: 0,
    importedScreenshots: 0,
    errors: [] as Array<string>,
  };
  const onConflict = opts?.onConflict ?? 'renameProject';
  try {
    if (!backup || backup.schema !== 'homolog-backup' || backup.schemaVersion !== 1) {
      throw new Error('backup invalido (schema ou schemaVersion desconhecido)');
    }
    await openDatabase();
    const existingProjects = await listProjects({ includeArchived: true });
    const existingNames = new Set(existingProjects.map((p) => p.name));
    const _existingProjectIds = new Set(existingProjects.map((p) => p.projectId));
    const allSessionRows = await withTransaction(STORE.SESSIONS, 'readonly', (tx) =>
      wrapRequest<Array<HomologSession>>(tx.objectStore(STORE.SESSIONS).getAll()),
    );
    const existingSessionIds = new Set(allSessionRows.map((s) => s.sessionId));
    const projectIdMap = new Map<ProjectId, ProjectId>();
    const sessionIdMap = new Map<SessionId, SessionId>();
    const stepIdMap = new Map<StepId, StepId>();
    const screenshotIdMap = new Map<ScreenshotId, ScreenshotId>();

    for (const srcProj of backup.projects) {
      try {
        const exists = existingProjects.find((p) => p.projectId === srcProj.projectId);
        let targetId: ProjectId;
        if (exists && onConflict === 'skip') {
          projectIdMap.set(srcProj.projectId, exists.projectId);
          continue;
        }
        if (exists && onConflict === 'overwrite') {
          targetId = exists.projectId;
          await updateProject(targetId, {
            name: srcProj.name,
            description: srcProj.description ?? null,
            color: srcProj.color ?? null,
            archivedAt: srcProj.archivedAt ?? null,
            metadata: srcProj.metadata ?? {},
            updatedAt: srcProj.updatedAt,
          });
        } else {
          let name = srcProj.name;
          if ((exists || existingNames.has(name)) && onConflict === 'renameProject') {
            let i = 1;
            while (existingNames.has(`${name} (importado ${i})`)) i += 1;
            name = `${name} (importado ${i})`;
          }
          const created = await createProject({
            name,
            description: srcProj.description ?? null,
            color: srcProj.color ?? null,
            metadata: srcProj.metadata ?? {},
          });
          targetId = created.projectId;
          existingNames.add(name);
        }
        projectIdMap.set(srcProj.projectId, targetId);
        report.importedProjects += 1;
      } catch (e) {
        report.errors.push(`import_project ${srcProj.projectId}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    for (const srcSess of backup.sessions) {
      try {
        const newProjectId = projectIdMap.get(srcSess.projectId) ?? srcSess.projectId;
        const sessionExists = existingSessionIds.has(srcSess.sessionId);
        let targetSessionId = srcSess.sessionId;

        if (sessionExists && onConflict === 'overwrite') {
          await deleteStepsAndScreenshotsBySession(srcSess.sessionId);
        } else if (sessionExists) {
          targetSessionId = uuidv4() as SessionId;
          while (existingSessionIds.has(targetSessionId)) {
            targetSessionId = uuidv4() as SessionId;
          }
          existingSessionIds.add(targetSessionId);
        }

        const targetSession: HomologSession = {
          ...srcSess,
          sessionId: targetSessionId,
          projectId: newProjectId,
        };
        await withTransaction(STORE.SESSIONS, 'readwrite', (tx) =>
          wrapRequest(tx.objectStore(STORE.SESSIONS).put(targetSession)),
        );
        sessionIdMap.set(srcSess.sessionId, targetSession.sessionId);
        report.importedSessions += 1;
      } catch (e) {
        report.errors.push(`import_session ${srcSess.sessionId}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    const shotByStep = new Map<StepId, HomologBackupV1['screenshotsMeta'][number]>();
    for (const s of backup.screenshotsMeta) {
      shotByStep.set(s.stepId, s);
    }

    for (const srcStep of backup.steps) {
      try {
        const newProjectId = projectIdMap.get(srcStep.projectId) ?? srcStep.projectId;
        const newSessionId = sessionIdMap.get(srcStep.sessionId) ?? srcStep.sessionId;
        const shotMeta = shotByStep.get(srcStep.stepId);
        const {
          stepId: _oldStepId,
          screenshotId: _oldScreenshotId,
          projectId: _oldProjectId,
          sessionId: _oldSessionId,
          ...rest
        } = srcStep as unknown as HomologStep & {
          stepId?: StepId;
          screenshotId?: ScreenshotId | null;
          projectId?: ProjectId;
          sessionId?: SessionId;
        };
        const like: RecordingStepLike = {
          ...(rest as unknown as RecordingStepLike),
          sessionId: newSessionId,
          screenshotDataUrl: shotMeta ? shotMeta.imageDataUrl : undefined,
          screenshotWidthPx: shotMeta?.widthPx,
          screenshotHeightPx: shotMeta?.heightPx,
          screenshotFormat: shotMeta?.format,
        } as RecordingStepLike;
        void stepIdMap;
        void screenshotIdMap;
        const persistedStep = await addStepWithScreenshot(newProjectId, newSessionId, like, null);
        report.importedSteps += 1;
        if (persistedStep.screenshot) report.importedScreenshots += 1;
      } catch (e) {
        report.errors.push(`import_step ${srcStep.stepId}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    for (const setting of backup.settings) {
      try {
        await setSetting(setting.key, setting.value);
      } catch (e) {
        report.errors.push(
          `import_setting ${String(setting.key)}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
    endSave();
    return report;
  } catch (e) {
    endSave(e instanceof Error ? e.message : String(e));
    report.errors.push(`top_level: ${e instanceof Error ? e.message : String(e)}`);
    return report;
  }
}

export const __priv = { friendlyStorageError, validateRecordingStepLegacy, saveState };

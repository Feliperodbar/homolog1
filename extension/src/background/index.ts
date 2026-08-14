import {
  createEmptySession,
  createNewSession,
  applyTransition,
  reset as resetSession,
} from '../shared/stateMachine';
import type {
  InteractionEvent,
  RecordingSession,
  RecordingStep,
  RuntimeMessage,
  RuntimeResponse,
} from '../shared/types';
import {
  SCREENSHOT,
  STORAGE_KEY_ACTIVE_PROJECT_ID,
  STORAGE_KEY_ACTIVE_SESSION_ID,
  STORAGE_KEY_IDB_MIGRATION_DONE,
  STORAGE_KEY_LAST_INTERACTION,
  STORAGE_KEY_LAST_STEP,
  STORAGE_KEY_RECORDING,
  STORAGE_KEY_STEPS,
} from '../shared/constants';
import {
  validateInteractionEvent,
  validateRecordingStep,
  validateRuntimeMessage,
} from '../shared/messageValidator';
import {
  buildRecordingStep,
  compressScreenshotDataUrl,
} from '../shared/screenshotUtils';
import {
  addStepWithScreenshot,
  createProject,
  listProjects,
  migrateFromLegacyChromeStorage,
  upsertSessionFromRecordingSession,
  getSaveIndicatorSnapshot,
  subscribeSaveIndicator,
  getSessionById,
  getSetting,
  exportBackup,
  deleteStepCascade,
  clearSessionSteps,
  getProjectById,
  updateProject,
  moveSessionEvidenceToProject,
  listStepsBySession,
  getScreenshotById,
} from '../shared/storage/repository';
import type { HomologSession } from '../shared/storage/types';

const logger = {
  info: (...args: unknown[]) => console.log('[homolog:bg]', ...args),
  warn: (...args: unknown[]) => console.warn('[homolog:bg]', ...args),
  error: (...args: unknown[]) => console.error('[homolog:bg]', ...args),
};

// Evita duas chamadas simultâneas a captureVisibleTab e garante sequência
// determinística quando interações chegam quase juntas.
let screenshotQueue: Promise<void> = Promise.resolve();
let lastCaptureStartedAt = 0;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

async function screenshotAsDataUrl(screenshotId: string): Promise<string | null> {
  const screenshot = await getScreenshotById(screenshotId);
  if (!screenshot?.image.size) return null;
  const bytes = new Uint8Array(await screenshot.image.arrayBuffer());
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return `data:${screenshot.image.type || screenshot.format};base64,${btoa(binary)}`;
}

function enqueueScreenshot<T>(operation: () => Promise<T>): Promise<T> {
  const result = screenshotQueue.then(operation, operation);
  screenshotQueue = result.then(() => undefined, () => undefined);
  return result;
}

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

async function loadSteps(sessionId?: string): Promise<Array<RecordingStep>> {
  try {
    const raw = await chrome.storage.local.get(STORAGE_KEY_STEPS);
    const arr = raw?.[STORAGE_KEY_STEPS];
    if (!Array.isArray(arr)) return [];
    const out: Array<RecordingStep> = [];
    for (const item of arr) {
      const v = validateRecordingStep(item);
      if (!v.ok) continue;
      if (sessionId && v.value.sessionId !== sessionId) continue;
      out.push(v.value);
    }
    out.sort((a, b) => a.sequence - b.sequence);
    return out;
  } catch {
    return [];
  }
}

async function saveSteps(steps: Array<RecordingStep>): Promise<void> {
  try {
    const max = SCREENSHOT.MAX_STEPS_IN_STORAGE;
    const slice = steps.length > max ? steps.slice(steps.length - max) : steps;
    await chrome.storage.local.set({ [STORAGE_KEY_STEPS]: slice });
  } catch (e) {
    logger.warn('saveSteps falhou (storage pode estar cheio)', e);
  }
}

async function clearStepsForNewSession(): Promise<void> {
  try {
    await chrome.storage.local.remove([STORAGE_KEY_STEPS, STORAGE_KEY_LAST_STEP]);
  } catch {
    /* noop */
  }
}

async function loadLastStep(): Promise<RecordingStep | null> {
  try {
    const raw = await chrome.storage.local.get(STORAGE_KEY_LAST_STEP);
    const parsed = raw?.[STORAGE_KEY_LAST_STEP];
    const v = validateRecordingStep(parsed);
    return v.ok ? v.value : null;
  } catch {
    return null;
  }
}

async function saveLastStep(step: RecordingStep | null): Promise<void> {
  try {
    if (step === null) {
      await chrome.storage.local.remove(STORAGE_KEY_LAST_STEP);
      return;
    }
    await chrome.storage.local.set({ [STORAGE_KEY_LAST_STEP]: step });
  } catch (e) {
    logger.warn('saveLastStep falhou', e);
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

async function broadcastStepRecorded(
  step: RecordingStep,
  session: RecordingSession,
): Promise<void> {
  try {
    await chrome.runtime.sendMessage({
      type: '__STEP_RECORDED__',
      payload: { step, session },
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
  const [s, last] = await Promise.all([loadSession(), loadLastInteraction()]);
  return { ok: true, state: s, lastInteraction: last ?? undefined };
}

async function onGetLastInteraction(): Promise<RuntimeResponse> {
  const [s, last] = await Promise.all([loadSession(), loadLastInteraction()]);
  return { ok: true, state: s, lastInteraction: last ?? undefined };
}

function onGetMyTabId(sender: chrome.runtime.MessageSender | undefined): RuntimeResponse {
  const tabId = sender?.tab?.id ?? null;
  if (tabId === null || tabId === undefined) {
    return { ok: false, error: 'sender sem tab.id' } as RuntimeResponse;
  }
  return { ok: true, tabId } as RuntimeResponse;
}

async function onGetLastStep(): Promise<RuntimeResponse> {
  const [s, lastStep, lastInter] = await Promise.all([
    loadSession(),
    loadLastStep(),
    loadLastInteraction(),
  ]);
  return {
    ok: true,
    state: s,
    lastInteraction: lastInter ?? undefined,
    lastStep: lastStep ?? undefined,
  };
}

async function onListSteps(): Promise<RuntimeResponse> {
  const [s, steps] = await Promise.all([loadSession(), loadSteps()]);
  return { ok: true, state: s, steps };
}

async function ensureContentInjected(tabId: number | null | undefined): Promise<boolean> {
  if (typeof tabId !== 'number') return false;
  try {
    if (!chrome.scripting || typeof chrome.scripting.executeScript !== 'function') return false;
    let tabUrl: string | undefined;
    try {
      const tab = await chrome.tabs.get(tabId);
      tabUrl = tab.url;
      if (!tabUrl) return false;
      if (!/^https?:\/\//i.test(tabUrl) && !/^file:\/\//i.test(tabUrl)) {
        logger.warn(
          `ensureContentInjected: pulando tab#${tabId} (url nao suportada: ${tabUrl.slice(0, 120)})`,
        );
        return false;
      }
    } catch {
      /* n/a */
    }
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content/index.js'],
    });
    logger.info(
      `ensureContentInjected: content script injetado na aba #${tabId} (${(tabUrl ?? '').slice(0, 120)})`,
    );
    return true;
  } catch (e) {
    logger.warn(
      `ensureContentInjected falhou tab#${tabId} —`,
      e instanceof Error ? e.message : String(e),
    );
    return false;
  }
}

async function getOrCreateActiveProjectId(): Promise<string> {
  try {
    if (typeof chrome?.storage?.local?.get === 'function') {
      const stored = await chrome.storage.local.get(STORAGE_KEY_ACTIVE_PROJECT_ID);
      const existing = stored?.[STORAGE_KEY_ACTIVE_PROJECT_ID];
      if (typeof existing === 'string' && existing.length > 0) {
        const project = await getProjectById(existing);
        if (project) return existing;
      }
    }
    const list = await listProjects({ includeArchived: false, limit: 1 });
    if (list.length > 0) {
      if (typeof chrome?.storage?.local?.set === 'function') {
        await chrome.storage.local.set({ [STORAGE_KEY_ACTIVE_PROJECT_ID]: list[0].projectId });
      }
      return list[0].projectId;
    }
    const proj = await createProject({ name: 'Projeto padrão', description: 'Criado automaticamente pela extensão Homolog' });
    if (typeof chrome?.storage?.local?.set === 'function') {
      await chrome.storage.local.set({ [STORAGE_KEY_ACTIVE_PROJECT_ID]: proj.projectId });
    }
    return proj.projectId;
  } catch (e) {
    logger.warn('getOrCreateActiveProjectId falhou; usando sessionId temporario como fallback', e);
    return 'default-project-fallback';
  }
}

async function persistRecordingSessionOnIdb(
  session: RecordingSession,
  opts?: { projectId?: string; name?: string | null; description?: string | null },
): Promise<HomologSession | null> {
  try {
    const projectId = opts?.projectId ?? (await getOrCreateActiveProjectId());
    const sess = await upsertSessionFromRecordingSession(projectId, session, {
      name: opts?.name,
      description: opts?.description,
    });
    if (typeof chrome?.storage?.local?.set === 'function') {
      await chrome.storage.local.set({
        [STORAGE_KEY_ACTIVE_PROJECT_ID]: projectId,
        [STORAGE_KEY_ACTIVE_SESSION_ID]: sess.sessionId,
      });
    }
    return sess;
  } catch (e) {
    logger.warn('persistRecordingSessionOnIdb ignorou erro:', e instanceof Error ? e.message : String(e));
    return null;
  }
}

async function reconcileSessionEvidence(
  session: RecordingSession,
  projectId: string,
): Promise<number> {
  const recoverySteps = await loadSteps(session.sessionId);
  if (recoverySteps.length === 0) return 0;
  const persistedSteps = await listStepsBySession(session.sessionId);
  const persistedById = new Map(persistedSteps.map((step) => [step.stepId, step]));
  let repaired = 0;
  for (const step of recoverySteps) {
    const persisted = persistedById.get(step.stepId);
    const screenshot = persisted?.screenshotId
      ? await getScreenshotById(persisted.screenshotId)
      : null;
    if (persisted && screenshot?.image.size) continue;
    await addStepWithScreenshot(projectId, session.sessionId, step, null);
    repaired += 1;
  }
  if (repaired > 0) {
    logger.info(`reconcileSessionEvidence: ${repaired} passo(s) recuperado(s)`);
  }
  return repaired;
}

async function onStart(): Promise<RuntimeResponse> {
  const current = await loadSession();
  // Cada acionamento de "Iniciar gravação" pertence à aba ativa naquele
  // momento e cria uma sessão independente das gravações anteriores.
  const tabId = await getActiveTabId();
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
  let targetUrl = '';
  try {
    if (session.tabId !== null && session.tabId !== undefined) {
      const t = await chrome.tabs.get(session.tabId);
      targetUrl = t.url ?? '';
    }
  } catch {
    /* n/a */
  }
  logger.info(
    `onStart: sessao pronta tab#${session.tabId} url=${targetUrl.slice(0, 160)} state=${session.state}`,
  );
  await clearStepsForNewSession();
  await saveLastInteraction(null);
  await saveSession(session);
  void persistRecordingSessionOnIdb(session, {
    name: `Sessão ${new Date(session.startedAt ?? Date.now()).toLocaleString('pt-BR')}`,
    description: targetUrl ? `Origem: ${targetUrl.slice(0, 200)}` : null,
  });
  if (session.tabId !== null && session.tabId !== undefined) {
    await ensureContentInjected(session.tabId);
  }
  await broadcastState(session);
  return { ok: true, state: session };
}

async function onSimpleTransition(t: 'PAUSE' | 'RESUME' | 'FINALIZE' | 'INCREMENT_STEP') {
  if (t === 'FINALIZE') {
    // Não finalize enquanto cliques aceitos ainda aguardam captura/persistência.
    await screenshotQueue;
  }
  const current = await loadSession();
  const r = applyTransition(current, t);
  if (!r.changed) {
    return { ok: false, state: r.session, error: r.reason } as RuntimeResponse;
  }
  if (t !== 'INCREMENT_STEP') {
    // A finalização só é anunciada depois que a sessão estiver integralmente
    // persistida; assim o painel nunca abre durante uma gravação ainda pendente.
    if (t === 'FINALIZE') {
      const activeProjectId = await getOrCreateActiveProjectId();
      await persistRecordingSessionOnIdb(r.session, { projectId: activeProjectId });
      await reconcileSessionEvidence(r.session, activeProjectId);
      await moveSessionEvidenceToProject(r.session.sessionId, activeProjectId);
      await persistRecordingSessionOnIdb(r.session, { projectId: activeProjectId });
    } else {
      await persistRecordingSessionOnIdb(r.session);
    }
  }
  await saveSession(r.session);
  await broadcastState(r.session);
  if (t === 'FINALIZE') {
    try {
      await openPanelTab(true);
    } catch (error) {
      logger.warn('gravação finalizada, mas o painel não pôde ser aberto', error);
    }
  }
  return { ok: true, state: r.session } as RuntimeResponse;
}

async function onReset(): Promise<RuntimeResponse> {
  const current = await loadSession();
  const tabId = await getActiveTabId();
  const r = resetSession(current, tabId);
  await clearStepsForNewSession();
  await saveLastInteraction(null);
  await saveSession(r.session);
  void persistRecordingSessionOnIdb(r.session, {
    name: `Sessão ${new Date(r.session.startedAt ?? Date.now()).toLocaleString('pt-BR')}`,
    description: 'Sessão limpa (reset)',
  });
  await broadcastState(r.session);
  return { ok: true, state: r.session };
}

async function onInstalled(): Promise<void> {
  logger.info('instalado/atualizado');
  try {
    const done = await getSetting<number>('migration.v1.completedAt').catch(() => null);
    if (!done) {
      const m = await migrateFromLegacyChromeStorage({ removeLegacyAfter: false });
      logger.info(
        `migracao legado concluida ok=${m.ok} steps=${m.migratedSteps} shots=${m.migratedScreenshots} erros=${m.errors.length}`,
      );
    } else {
      logger.info(`migracao legado ja concluida em ${new Date(done).toISOString()}`);
    }
    try {
      if (typeof chrome?.storage?.local?.set === 'function') {
        await chrome.storage.local.set({
          [STORAGE_KEY_IDB_MIGRATION_DONE]: Date.now(),
        });
      }
    } catch {
      /* n/a */
    }
  } catch (e) {
    logger.warn('migracao idb falhou; prosseguindo sem ela', e);
  }
  const s = await loadSession();
  if (!s.sessionId) {
    const fresh = createNewSession();
    await saveSession(fresh);
  } else {
    setActionBadge(s);
  }
  try {
    subscribeSaveIndicator((snap) => {
      logger.info(
        `save indicator status=${snap.status} pending=${snap.pendingCount} lastSavedAt=${
          snap.lastSavedAt ? new Date(snap.lastSavedAt).toISOString() : 'null'
        }${snap.lastError ? ` erro=${snap.lastError.slice(0, 160)}` : ''}`,
      );
    });
  } catch {
    /* n/a */
  }
  void getSaveIndicatorSnapshot;
}

async function captureTabDataUrl(
  tabIdArg: number | null | undefined,
): Promise<{ dataUrl: string; tabId: number | null }> {
  const tabId = typeof tabIdArg === 'number' ? tabIdArg : null;
  if (tabId === null) throw new Error('nao foi possivel identificar a aba da sessao');
  const tab = await chrome.tabs.get(tabId);
  if (typeof tab.windowId !== 'number') throw new Error('nao foi possivel identificar a janela da aba');
  if (!tab.active) throw new Error('a aba da gravacao nao esta ativa');
  const captureOptions: chrome.tabs.CaptureVisibleTabOptions = {
    format: 'jpeg',
    quality: Math.max(1, Math.min(100, Math.round(SCREENSHOT.QUALITY * 100))),
  };
  try {
    const remaining =
      SCREENSHOT.MIN_INTERVAL_BETWEEN_CAPTURES_MS - (Date.now() - lastCaptureStartedAt);
    if (remaining > 0) await wait(remaining);
    lastCaptureStartedAt = Date.now();
    let dataUrl = '';
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, captureOptions);
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        if (attempt < 2) await wait(SCREENSHOT.MIN_INTERVAL_BETWEEN_CAPTURES_MS);
      }
    }
    if (lastError) throw lastError;
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
      throw new Error('o navegador retornou uma captura invalida');
    }
    return { dataUrl: typeof dataUrl === 'string' ? dataUrl : '', tabId };
  } catch (e) {
    throw new Error(
      e instanceof Error ? `captura falhou: ${e.message}` : 'captura falhou (erro desconhecido)',
    );
  }
}

async function ensureSameTabAsSession(
  sender: chrome.runtime.MessageSender | undefined,
  session: RecordingSession,
): Promise<{ ok: boolean; error?: string; senderTabId: number | null }> {
  const senderTabId = sender?.tab?.id ?? null;
  if (session.tabId === null || senderTabId === null) {
    return { ok: true, senderTabId };
  }
  if (senderTabId !== session.tabId) {
    return {
      ok: false,
      error: `aba enviou interacao diferente da aba gravada (sender=${senderTabId} vs sessao=${session.tabId})`,
      senderTabId,
    };
  }
  try {
    const tab = await chrome.tabs.get(session.tabId);
    if (!tab) {
      return {
        ok: false,
        error: 'aba original da sessao nao existe mais',
        senderTabId,
      };
    }
  } catch (e) {
    return {
      ok: false,
      error: `verificacao de aba falhou: ${e instanceof Error ? e.message : String(e)}`,
      senderTabId,
    };
  }
  return { ok: true, senderTabId };
}

function isDuplicateInteractionStep(
  steps: Array<RecordingStep>,
  interactionId: string,
  windowMs = 1500,
  timestampNow = Date.now(),
): boolean {
  for (let i = steps.length - 1; i >= 0; i -= 1) {
    const s = steps[i];
    if (timestampNow - s.timestamp > windowMs) break;
    if (s.interactionId === interactionId) return true;
  }
  return false;
}

async function onRequestScreenshot(
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

  const tabCheck = await ensureSameTabAsSession(sender, session);
  if (!tabCheck.ok) {
    return { ok: false, error: tabCheck.error ?? 'troca de aba detectada' };
  }

  if (ev.sessionId && ev.sessionId !== session.sessionId) {
    logger.warn(
      'interacao de outra sessao recebida (esperado=%s recebido=%s)',
      session.sessionId.slice(0, 8),
      ev.sessionId.slice(0, 8),
    );
  }

  const priorSteps = await loadSteps(session.sessionId);
  if (isDuplicateInteractionStep(priorSteps, ev.interactionId, 1500, Date.now())) {
    return { ok: false, error: 'step duplicado para mesma interacao; ignorado' };
  }

  let captured: { dataUrl: string; tabId: number | null };
  try {
    captured = await captureTabDataUrl(session.tabId ?? tabCheck.senderTabId);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : 'screenshot indisponivel nesta pagina',
    };
  }
  if (!captured.dataUrl || captured.dataUrl.length < 32) {
    return { ok: false, error: 'screenshot vazia; navegador bloqueou a captura' };
  }

  const compressed = await compressScreenshotDataUrl(captured.dataUrl, {
    maxWidthPx: SCREENSHOT.MAX_WIDTH_PX,
    format: SCREENSHOT.FORMAT,
    quality: SCREENSHOT.QUALITY,
  });
  if (!compressed) {
    return { ok: false, error: 'screenshot corrompida apos compressao' };
  }

  const nextSequence = priorSteps.length + 1;
  const step = buildRecordingStep({
    interaction: ev,
    screenshotDataUrl: captured.dataUrl,
    sequence: nextSequence,
    tabId: session.tabId ?? tabCheck.senderTabId,
    sessionId: session.sessionId,
    compressed,
  });
  if (!step) {
    return { ok: false, error: 'falha ao montar step apos screenshot' };
  }
  const stepValid = validateRecordingStep(step);
  if (!stepValid.ok) {
    return { ok: false, error: `step invalido: ${stepValid.error}` };
  }

  const stepR = applyTransition(session, 'INCREMENT_STEP');
  let finalSession: RecordingSession;
  if (!stepR.changed) {
    logger.warn('INCREMENT_STEP nao aplicavel ao salvar screenshot', stepR.reason);
    finalSession = session;
  } else {
    await saveSession(stepR.session);
    finalSession = stepR.session;
  }

  const nextSteps = [...priorSteps, stepValid.value];
  await saveSteps(nextSteps);
  await saveLastStep(stepValid.value);
  await saveLastInteraction(ev);

  try {
    const projectId = await getOrCreateActiveProjectId();
    const persisted = await addStepWithScreenshot(
      projectId,
      finalSession.sessionId,
      stepValid.value as RecordingStep,
      null,
    );
    void persisted;
    const sessOnIdb = await getSessionById(finalSession.sessionId);
    if (!sessOnIdb || sessOnIdb.stepCount !== stepValid.value.sequence) {
      const updated = {
        ...finalSession,
        stepCount: stepValid.value.sequence,
      };
      await upsertSessionFromRecordingSession(projectId, updated);
    }
  } catch (e) {
    logger.warn(
      `idb persist step falhou (mantendo legado) sequence=${stepValid.value.sequence} erro:`,
      e instanceof Error ? e.message : String(e),
    );
  }

  await broadcastState(finalSession);
  await broadcastStepRecorded(stepValid.value, finalSession);

  return { ok: true, state: finalSession, lastStep: stepValid.value, lastInteraction: ev };
}

async function onDeleteStep(payload: Record<string, unknown> | undefined): Promise<RuntimeResponse> {
  const stepId = typeof payload?.stepId === 'string' ? payload.stepId : '';
  if (!stepId || stepId.length > 128) return { ok: false, error: 'passo inválido' };
  const session = await loadSession();
  const steps = await loadSteps(session.sessionId);
  if (!steps.some((step) => step.stepId === stepId)) {
    return { ok: false, state: session, error: 'passo não encontrado' };
  }
  const remaining = steps
    .filter((step) => step.stepId !== stepId)
    .map((step, index) => ({ ...step, sequence: index + 1 }));
  await deleteStepCascade(stepId);
  await saveSteps(remaining);
  await saveLastStep(remaining.at(-1) ?? null);
  const updated = { ...session, stepCount: remaining.length, lastUpdatedAt: Date.now() };
  await saveSession(updated);
  await upsertSessionFromRecordingSession(await getOrCreateActiveProjectId(), updated);
  await broadcastState(updated);
  return { ok: true, state: updated, steps: remaining };
}

async function onClearSteps(): Promise<RuntimeResponse> {
  const session = await loadSession();
  await clearSessionSteps(session.sessionId);
  await chrome.storage.local.remove([
    STORAGE_KEY_STEPS,
    STORAGE_KEY_LAST_STEP,
    STORAGE_KEY_LAST_INTERACTION,
  ]);
  const updated = { ...session, stepCount: 0, lastUpdatedAt: Date.now() };
  await saveSession(updated);
  await upsertSessionFromRecordingSession(await getOrCreateActiveProjectId(), updated);
  await broadcastState(updated);
  return { ok: true, state: updated, steps: [] };
}

async function onGetProjectContext(): Promise<RuntimeResponse> {
  const project = await getProjectById(await getOrCreateActiveProjectId());
  return {
    ok: true,
    projectContext: {
      name: project?.name ?? 'Projeto padrão',
      functionality: String(project?.metadata?.feature ?? ''),
      locked: project?.metadata?.contextLocked === true,
    },
  };
}

async function onSaveProjectContext(
  payload: Record<string, unknown> | undefined,
): Promise<RuntimeResponse> {
  const name = typeof payload?.name === 'string' ? payload.name.trim().slice(0, 200) : '';
  const functionality =
    typeof payload?.functionality === 'string' ? payload.functionality.trim().slice(0, 300) : '';
  if (!name) return { ok: false, error: 'Informe o nome do projeto.' };
  const projectId = await getOrCreateActiveProjectId();
  const current = await getProjectById(projectId);
  const updated = await updateProject(projectId, {
    name,
    metadata: {
      ...(current?.metadata ?? {}),
      feature: functionality,
      environment: 'Web',
      contextLocked: true,
    },
  });
  return {
    ok: true,
    projectContext: { name: updated.name, functionality, locked: true },
  };
}

async function onNewProjectContext(): Promise<RuntimeResponse> {
  const current = await loadSession();
  let archived = current;
  if (current.state === 'recording' || current.state === 'paused') {
    const finalized = applyTransition(current, 'FINALIZE');
    archived = finalized.session;
    await saveSession(archived);
    await persistRecordingSessionOnIdb(archived);
  }

  const project = await createProject({
    name: 'Novo projeto',
    description: 'Criado pelo menu lateral do Homolog',
    metadata: { feature: '', environment: 'Web', contextLocked: false },
  });
  await chrome.storage.local.set({ [STORAGE_KEY_ACTIVE_PROJECT_ID]: project.projectId });
  const nextSession = createNewSession(current.tabId);
  await clearStepsForNewSession();
  await saveLastInteraction(null);
  await saveSession(nextSession);
  await upsertSessionFromRecordingSession(project.projectId, nextSession);
  await broadcastState(nextSession);
  const panelUrl = new URL('http://localhost:5173/');
  panelUrl.searchParams.set('homologExtensionId', chrome.runtime.id);
  try {
    await chrome.tabs.create({ url: panelUrl.toString(), active: false });
  } catch (error) {
    logger.warn('não foi possível abrir o painel em segundo plano', error);
  }
  return {
    ok: true,
    state: nextSession,
    steps: [],
    projectContext: { name: project.name, functionality: '', locked: false },
  };
}

async function onOpenPanelBackground(): Promise<RuntimeResponse> {
  await openPanelTab(false);
  return { ok: true };
}

async function openPanelTab(active: boolean): Promise<void> {
  const panelUrl = new URL('http://localhost:5173/');
  panelUrl.searchParams.set('homologExtensionId', chrome.runtime.id);
  await chrome.tabs.create({ url: panelUrl.toString(), active });
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
  try {
    chrome.tabs.onUpdated.addListener((tabId, info) => {
      if (info.status !== 'complete') return;
      void (async () => {
        const session = await loadSession();
        if (session.state !== 'recording') return;
        if (session.tabId !== tabId) return;
        await ensureContentInjected(tabId);
      })();
    });
    chrome.tabs.onActivated.addListener((info) => {
      void (async () => {
        const session = await loadSession();
        if (session.state !== 'recording') return;
        if (session.tabId !== info.tabId) return;
        await ensureContentInjected(info.tabId);
      })();
    });
  } catch (e) {
    logger.warn('tabs listeners nao disponiveis', e);
  }

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
        case '__GET_LAST_STEP__':
          return onGetLastStep();
        case '__LIST_STEPS__':
          return onListSteps();
        case '__DELETE_STEP__':
          return onDeleteStep(message.payload);
        case '__CLEAR_STEPS__':
          return onClearSteps();
        case '__GET_PROJECT_CONTEXT__':
          return onGetProjectContext();
        case '__SAVE_PROJECT_CONTEXT__':
          return onSaveProjectContext(message.payload);
        case '__NEW_PROJECT_CONTEXT__':
          return onNewProjectContext();
        case '__OPEN_PANEL_BACKGROUND__':
          return onOpenPanelBackground();
        case '__GET_MY_TAB_ID__':
          return onGetMyTabId(sender);
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
        case '__REQUEST_SCREENSHOT__':
          return enqueueScreenshot(() => onRequestScreenshot(message.payload, sender));
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

  // O painel web vive em outra origem e, portanto, não enxerga o IndexedDB da
  // extensão. Esta API externa, limitada pelo manifest a localhost, transfere
  // uma cópia local dos projetos, sessões, passos e imagens para o painel.
  chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
    const senderUrl = sender.url ?? '';
    const allowed = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(senderUrl);
    const supported = message?.type === 'HOMOLOG_PANEL_SYNC' ||
      message?.type === 'HOMOLOG_PANEL_SCREENSHOT';
    if (!allowed || !supported) {
      sendResponse({ ok: false, error: 'Solicitação externa não autorizada.' });
      return false;
    }
    if (message.type === 'HOMOLOG_PANEL_SCREENSHOT') {
      const screenshotId = typeof message.screenshotId === 'string' ? message.screenshotId : '';
      if (!screenshotId || screenshotId.length > 128) {
        sendResponse({ ok: false, error: 'Identificador de captura invalido.' });
        return false;
      }
      screenshotAsDataUrl(screenshotId)
        .then((imageDataUrl) => sendResponse({ ok: !!imageDataUrl, screenshotId, imageDataUrl }))
        .catch((error) => sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : 'Falha ao ler captura.',
        }));
      return true;
    }
    (async () => {
      // Tambem recupera gravacoes finalizadas por uma versao anterior: a copia
      // do menu lateral contem o passo completo, inclusive a imagem capturada.
      const session = await loadSession();
      if (session.state !== 'idle') {
        const projectId = await getOrCreateActiveProjectId();
        await persistRecordingSessionOnIdb(session, { projectId });
        await reconcileSessionEvidence(session, projectId);
        await moveSessionEvidenceToProject(session.sessionId, projectId);
      }
      return Promise.all([
        exportBackup({ includeScreenshots: false }),
        chrome.storage.local.get([STORAGE_KEY_ACTIVE_PROJECT_ID, STORAGE_KEY_ACTIVE_SESSION_ID]),
      ]);
    })()
      .then(([backup, active]) =>
        sendResponse({
          ok: true,
          backup,
          activeProjectId: active?.[STORAGE_KEY_ACTIVE_PROJECT_ID],
          activeSessionId: active?.[STORAGE_KEY_ACTIVE_SESSION_ID],
        }),
      )
      .catch((error) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : 'Não foi possível sincronizar o painel.',
        }),
      );
    return true;
  });
}

export {};

import { closeDatabase, _resetConnectionForTests } from '../extension/src/shared/storage/idbConnection';
import {
  createProject,
  createSession,
  addStepWithScreenshot,
} from '../extension/src/shared/storage/repository';
import type { RecordingStep } from '../extension/src/shared/types';
import { uuidv4 } from '../extension/src/shared/uuid';

export async function clearAllIndexedDbStores(): Promise<void> {
  closeDatabase();
  _resetConnectionForTests();
  try {
    const dbs = await indexedDB.databases();
    const names = new Set<string>();
    for (const d of dbs) if (d.name) names.add(d.name);
    names.add('homolog_main_v1');
    for (const n of Array.from(names)) {
      try {
        await new Promise<void>((resolve, reject) => {
          const req = indexedDB.deleteDatabase(n);
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error ?? new Error(`deleteDB ${n} erro`));
          req.onblocked = () => resolve();
        });
      } catch {
        /* n/a */
      }
    }
  } catch {
    try {
      await new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase('homolog_main_v1');
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
        req.onblocked = () => resolve();
      });
    } catch {
      /* n/a */
    }
  }
  closeDatabase();
  _resetConnectionForTests();
  // Espera 1 tick + pequeno timeout para garantir que a conexão singleton velha foi
  // completamente desanexada do fake-indexeddb (evita "escrita fantasma" em lote).
  await new Promise<void>((r) => setTimeout(r, 30));
}

const TINY_JPEG_BASE64 =
  '/9j/4AAQSkZJRgABAQEASABIAAD/4QBYRXhpZgAATU0AKgAAAAgAAgESAAMAAAABAAEAAIdpAAQAAAABAAAAJgAAAAAAA6ABAAMAAAAB//8AAKACAAQAAAABAAAAIKADAAQAAAABAAAAIAAAAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wgARCAACAAgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD+/iiiigD/2Q==';
const TINY_JPEG_DATAURL = `data:image/jpeg;base64,${TINY_JPEG_BASE64}`;
const TINY_JPEG_BYTES = 721;
export { TINY_JPEG_BYTES, TINY_JPEG_DATAURL as TINY_JPEG_DATA_URL };

export function makeRecordingStep(
  partial: Partial<RecordingStep> & Pick<RecordingStep, 'sequence' | 'sessionId' | 'description' | 'url' | 'interactionId'>,
): RecordingStep {
  return {
    stepId: uuidv4(),
    sessionId: partial.sessionId,
    sequence: partial.sequence,
    actionType: partial.actionType ?? 'click',
    interactionId: partial.interactionId,
    target: { tagName: 'BUTTON', text: 'Entrar' },
    viewportPoint: { x: partial.viewportPoint?.x ?? 10, y: partial.viewportPoint?.y ?? 20 },
    elementRect: { x: 0, y: 0, width: 100, height: 40 },
    url: partial.url,
    pageTitle: partial.pageTitle ?? 'Página',
    viewportSize: { width: 1280, height: 800 },
    devicePixelRatio: partial.devicePixelRatio ?? 1,
    stableSelector: null,
    inputSource: 'mouse',
    screenshotDataUrl: partial.screenshotDataUrl ?? TINY_JPEG_DATAURL,
    screenshotFormat: 'image/jpeg',
    screenshotWidthPx: partial.screenshotWidthPx ?? 2,
    screenshotHeightPx: partial.screenshotHeightPx ?? 2,
    screenshotSizeBytes: partial.screenshotSizeBytes ?? TINY_JPEG_BYTES,
    description: partial.description,
    timestamp: partial.timestamp ?? Date.now() + partial.sequence,
    tabId: partial.tabId ?? 1,
    isTrusted: true,
    ...partial,
  };
}

export async function seedProjectWithSessions(
  opts: { projectName?: string; nSessions?: number; nSteps?: number } = {},
) {
  const proj = await createProject({ name: opts.projectName ?? 'Projeto Teste', description: 'semente' });
  const sessionsOut: Awaited<ReturnType<typeof createSession>>[] = [];
  for (let i = 0; i < (opts.nSessions ?? 2); i += 1) {
    const sess = await createSession({
      projectId: proj.projectId,
      name: `Sessão ${i + 1}`,
      tabId: 100 + i,
    });
    sessionsOut.push(sess);
    for (let s = 1; s <= (opts.nSteps ?? 3); s += 1) {
      const step = makeRecordingStep({
        sessionId: sess.sessionId,
        sequence: s,
        interactionId: `int_${proj.projectId}_${sess.sessionId}_${s}`,
        description: `Clicar no botão "${s}"`,
        url: `https://example.com/page/${i + 1}`,
        viewportPoint: { x: 50 + s, y: 50 + s },
      });
      await addStepWithScreenshot(proj.projectId, sess.sessionId, step, null);
    }
  }
  return { project: proj, sessions: sessionsOut };
}

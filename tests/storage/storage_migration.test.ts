import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { clearAllIndexedDbStores } from '../_idbTestHelper';
import {
  createProject,
  migrateFromLegacyChromeStorage,
  listProjects,
  listSessionsByProject,
  listStepsBySession,
  getSetting,
} from '../../extension/src/shared/storage/repository';
import type { RecordingStep, RecordingSession } from '../../extension/src/shared/types';
import { uuidv4 } from '../../extension/src/shared/uuid';

function makeLegacy(stepCount: number) {
  const sessId = uuidv4();
  const startedAt = Date.now() - 3_600_000;
  const session: RecordingSession & { createdAt?: number; updatedAt?: number } = {
    sessionId: sessId,
    state: 'recording',
    tabId: 123,
    stepCount,
    startedAt,
    endedAt: null,
    durationMs: 10,
    createdAt: startedAt,
    updatedAt: startedAt + 100,
  };
  const steps: RecordingStep[] = [];
  for (let i = 1; i <= stepCount; i += 1) {
    steps.push({
      stepId: uuidv4(),
      sessionId: sessId,
      sequence: i,
      actionType: 'click',
      interactionId: `old_${i}`,
      target: { tagName: 'A', text: 'Link' },
      viewportPoint: { x: i * 10, y: i * 10 },
      elementRect: { x: 0, y: 0, width: 50, height: 20 },
      url: 'https://example.com/old',
      pageTitle: 'Old',
      viewportSize: { width: 1024, height: 768 },
      devicePixelRatio: 2,
      stableSelector: 'body > a:nth-child(1)',
      inputSource: 'mouse',
      screenshotDataUrl:
        'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/4QBYRXhpZgAATU0AKgAAAAgAAgESAAMAAAABAAEAAIdpAAQAAAABAAAAJgAAAAAAA6ABAAMAAAAB//8AAKACAAQAAAABAAAAIKADAAQAAAABAAAAIAAAAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wgARCAACAAgDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD+/iiiigD/2Q==',
      screenshotFormat: 'image/jpeg',
      screenshotWidthPx: 2,
      screenshotHeightPx: 2,
      screenshotSizeBytes: 660,
      description: `Clicar no link "Antigo ${i}"`,
      timestamp: startedAt + i * 1000,
      tabId: 123,
      isTrusted: true,
    });
  }
  return { session, steps };
}

describe('storage migração do legado chrome.storage.local → IndexedDB', () => {
  beforeEach(async () => {
    await clearAllIndexedDbStores();
  });
  afterEach(async () => {
    await clearAllIndexedDbStores();
  });

  it('migração NÃO apaga dados legados (removeLegacyAfter=false default)', async () => {
    const legacy = makeLegacy(3);
    const chromeLocal: Record<string, unknown> = {
      homolog_recording_v1: legacy.session,
      homolog_steps_v1: legacy.steps,
    };
    let removedCalled = false;
    const getter = async (k: string) => chromeLocal[k];
    const remover = vi.fn(async () => {
      removedCalled = true;
    });
    // remover não é chamado default
    const result = await migrateFromLegacyChromeStorage({ getLegacy: getter });
    expect(result.ok).toBe(true);
    expect(result.migratedProjects).toBe(1);
    expect(result.migratedSessions).toBe(1);
    expect(result.migratedSteps).toBe(3);
    expect(result.migratedScreenshots).toBeGreaterThanOrEqual(1);
    expect(result.skippedLegacyEmpty).toBe(false);
    expect(removedCalled).toBe(false);
    expect(await getSetting<number>('migration.v1.completedAt')).toBeGreaterThan(0);
    const projects = await listProjects();
    expect(projects).toHaveLength(1);
    const sessions = await listSessionsByProject(projects[0].projectId);
    expect(sessions).toHaveLength(1);
    const steps = await listStepsBySession(sessions[0].sessionId);
    expect(steps).toHaveLength(3);
    expect(steps.map((x) => x.description)).toContain('Clicar no link "Antigo 2"');
    expect(steps[0].screenshotId).toBeTruthy();
  });

  it('se legado vazio, migration marca completedAt e pula (skippedLegacyEmpty)', async () => {
    const getter = async (k: string) => (k === 'nao' ? undefined : undefined);
    const result = await migrateFromLegacyChromeStorage({ getLegacy: getter });
    expect(result.ok).toBe(true);
    expect(result.skippedLegacyEmpty).toBe(true);
    expect(result.migratedSteps).toBe(0);
    expect(await getSetting<number>('migration.v1.completedAt')).toBeGreaterThan(0);
    const p = await listProjects();
    expect(p).toHaveLength(0);
  });

  it('se houver projetos antigos, migração adiciona sem conflitar', async () => {
    await createProject({ name: 'Antigo' });
    const legacy = makeLegacy(2);
    const chromeLocal: Record<string, unknown> = {
      homolog_recording_v1: legacy.session,
      homolog_steps_v1: legacy.steps,
    };
    const getter = async (k: string) => chromeLocal[k];
    const result = await migrateFromLegacyChromeStorage({
      getLegacy: getter,
      defaultProjectName: 'Importado',
    });
    expect(result.migratedProjects).toBe(1);
    const p = await listProjects({ includeArchived: true });
    expect(p.map((x) => x.name)).toEqual(expect.arrayContaining(['Antigo', 'Importado']));
  });
});

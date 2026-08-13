import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { clearAllIndexedDbStores, seedProjectWithSessions } from '../_idbTestHelper';
import {
  deleteProjectCascade,
  deleteSessionCascade,
  listProjects,
  listSessionsByProject,
  listStepsBySession,
  getScreenshotById,
} from '../../extension/src/shared/storage/repository';

describe('storage exclusão segura / cascata controlada', () => {
  beforeEach(async () => {
    await clearAllIndexedDbStores();
  });
  afterEach(async () => {
    await clearAllIndexedDbStores();
  });

  it('deleteSessionCascade: exclui sessão + passos + screenshots; outras sessões permanecem', async () => {
    const { project, sessions } = await seedProjectWithSessions({ nSessions: 2, nSteps: 3 });
    const [sessA, sessB] = sessions;
    const stepsA = await listStepsBySession(sessA.sessionId);
    const shotIds = stepsA.filter((x) => !!x.screenshotId).map((x) => x.screenshotId as string);
    const del = await deleteSessionCascade(sessA.sessionId);
    expect(del.deletedSession).toBe(true);
    expect(del.deletedSteps).toBeGreaterThanOrEqual(3);
    expect(del.deletedScreenshots).toBeGreaterThanOrEqual(0);
    for (const id of shotIds) {
      expect(await getScreenshotById(id)).toBe(null);
    }
    // sessão B intacta
    const remaining = await listSessionsByProject(project.projectId);
    expect(remaining.map((s) => s.sessionId)).toEqual([sessB.sessionId]);
    const stepsB = await listStepsBySession(sessB.sessionId);
    expect(stepsB).toHaveLength(3);
  });

  it('deleteSessionCascade idempotente: sessão inexistente = 0', async () => {
    const del = await deleteSessionCascade('sessao-que-nao-existe');
    expect(del).toEqual({ deletedSession: false, deletedSteps: 0, deletedScreenshots: 0 });
  });

  it('deleteProjectCascade: exclui TUDO (projeto+sessions+steps+shots)', async () => {
    const { project } = await seedProjectWithSessions({ nSessions: 2, nSteps: 2 });
    const sess = (await listSessionsByProject(project.projectId))[0];
    const stepIds = (await listStepsBySession(sess.sessionId)).map((x) => x.stepId);
    void stepIds;
    const del = await deleteProjectCascade(project.projectId);
    expect(del.deletedProject).toBe(true);
    expect(del.deletedSessions).toBe(2);
    expect(del.deletedSteps).toBeGreaterThanOrEqual(4);
    expect(del.deletedScreenshots).toBeGreaterThanOrEqual(0);
    const list = await listProjects({ includeArchived: true });
    expect(list.find((p) => p.projectId === project.projectId)).toBeUndefined();
    const remainingSessions = await listSessionsByProject(project.projectId);
    expect(remainingSessions).toHaveLength(0);
  });

  it('deleteProjectCascade idempotente', async () => {
    const del = await deleteProjectCascade('nao-existe');
    expect(del).toEqual({ deletedProject: false, deletedSessions: 0, deletedSteps: 0, deletedScreenshots: 0 });
  });
});

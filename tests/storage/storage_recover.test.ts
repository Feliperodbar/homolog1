import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { clearAllIndexedDbStores, seedProjectWithSessions } from '../_idbTestHelper';
import {
  getFullProjectTree,
  listProjects,
  listSessionsByProject,
  listStepsBySession,
  getScreenshotById,
  getSessionById,
} from '../../extension/src/shared/storage/repository';
import { closeDatabase, _resetConnectionForTests } from '../../extension/src/shared/storage/idbConnection';

describe('storage recuperação (recover after reload)', () => {
  beforeEach(async () => {
    await clearAllIndexedDbStores();
  });
  afterEach(async () => {
    await clearAllIndexedDbStores();
  });

  it('dados persistem após fechar conexão e reabrir (simula reload painel)', async () => {
    const { project, sessions } = await seedProjectWithSessions({ nSessions: 2, nSteps: 2 });
    closeDatabase();
    _resetConnectionForTests();
    const projList = await listProjects();
    expect(projList).toHaveLength(1);
    expect(projList[0].projectId).toBe(project.projectId);
    const sess = await listSessionsByProject(project.projectId);
    expect(sess).toHaveLength(2);
    expect(sess[0].sessionId).toBe(sessions[0].sessionId);
    const steps = await listStepsBySession(sess[1].sessionId);
    expect(steps.map((x) => x.sequence)).toEqual([1, 2]);
    const firstShotId = steps[0].screenshotId;
    if (firstShotId) {
      const shot = await getScreenshotById(firstShotId);
      expect(shot).toBeTruthy();
      expect(shot?.stepId).toBe(steps[0].stepId);
    }
  });

  it('getFullProjectTree carrega passos + screenshot juntos', async () => {
    const { project } = await seedProjectWithSessions({ nSessions: 1, nSteps: 3 });
    const tree = await getFullProjectTree(project.projectId);
    expect(tree).toBeTruthy();
    expect(tree!.project.projectId).toBe(project.projectId);
    expect(tree!.sessions).toHaveLength(1);
    expect(tree!.sessions[0].steps).toHaveLength(3);
    for (const step of tree!.sessions[0].steps) {
      expect(step.screenshot).toBeTruthy();
      expect(step.screenshot?.sizeBytes).toBeGreaterThan(0);
      expect(step.screenshot?.format).toMatch(/image\/(png|jpeg)/);
    }
  });

  it('getFullProjectTree idempotente (projectId null => null)', async () => {
    expect(await getFullProjectTree('id-qualquer')).toBe(null);
  });

  it('getSessionById retorna sessão por PK', async () => {
    const { sessions } = await seedProjectWithSessions({ nSessions: 1 });
    const sess = sessions[0];
    const loaded = await getSessionById(sess.sessionId);
    expect(loaded?.sessionId).toBe(sess.sessionId);
    expect(loaded?.projectId).toBe(sess.projectId);
    expect(await getSessionById('xx')).toBe(null);
  });
});

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { clearAllIndexedDbStores, seedProjectWithSessions } from '../_idbTestHelper';
import {
  getFullProjectTree,
  deleteSessionCascade,
  listStepsBySession,
  getScreenshotById,
  listSessionsByProject,
} from '../../extension/src/shared/storage/repository';
import { blobToUint8Array } from '../../extension/src/shared/storage/blobUtils';

describe('storage integridade sessão ↔ passo ↔ screenshot', () => {
  beforeEach(async () => {
    await clearAllIndexedDbStores();
  });
  afterEach(async () => {
    await clearAllIndexedDbStores();
  });

  it('cada step criado com screenshot tem screenshot.stepId == step.stepId e screenshot.sessionId == sessionId', async () => {
    const { sessions } = await seedProjectWithSessions({ nSessions: 1, nSteps: 5 });
    const sess = sessions[0];
    const steps = await listStepsBySession(sess.sessionId);
    for (const step of steps) {
      expect(step.sessionId).toBe(sess.sessionId);
      expect(step.projectId).toBe(sess.projectId);
      expect(step.sequence).toBeGreaterThan(0);
      const shot = step.screenshotId ? await getScreenshotById(step.screenshotId) : null;
      expect(shot).toBeTruthy();
      expect(shot?.stepId).toBe(step.stepId);
      expect(shot?.sessionId).toBe(sess.sessionId);
      expect(shot?.projectId).toBe(sess.projectId);
      expect(shot?.sizeBytes).toBeGreaterThan(0);
    }
  });

  it('getFullProjectTree garante FK consistentes sessao→step→shot', async () => {
    const { project } = await seedProjectWithSessions({ nSessions: 2, nSteps: 2 });
    const tree = await getFullProjectTree(project.projectId);
    for (const session of tree!.sessions) {
      expect(session.projectId).toBe(project.projectId);
      for (const step of session.steps) {
        expect(step.sessionId).toBe(session.sessionId);
        if (step.screenshot) {
          expect(step.screenshot.stepId).toBe(step.stepId);
          expect(step.screenshot.screenshotId).toBe(step.screenshotId);
          expect(step.screenshot.sessionId).toBe(session.sessionId);
        }
      }
    }
  });

  it('após exclusão cascata de sessão, não ficam passos orfãos', async () => {
    const { sessions, project } = await seedProjectWithSessions({ nSessions: 2, nSteps: 3 });
    const [sessA, sessB] = sessions;
    const stepsA = await listStepsBySession(sessA.sessionId);
    const shotIds = stepsA.map((s) => s.screenshotId).filter((x): x is string => !!x);
    await deleteSessionCascade(sessA.sessionId);
    // sessão B intacta
    const sess = await listSessionsByProject(project.projectId);
    expect(sess.map((s) => s.sessionId)).toEqual([sessB.sessionId]);
    for (const id of shotIds) {
      expect(await getScreenshotById(id)).toBe(null);
    }
    const stepsAfter = await listStepsBySession(sessA.sessionId);
    expect(stepsAfter).toHaveLength(0);
  });

  it('screenshot.sizeBytes === blob.size (Blob é gravado com tamanho real)', async () => {
    const { sessions } = await seedProjectWithSessions({ nSessions: 1, nSteps: 2 });
    const steps = await listStepsBySession(sessions[0].sessionId);
    for (const s of steps) {
      const shot = s.screenshotId ? await getScreenshotById(s.screenshotId) : null;
      expect(shot).toBeTruthy();
      if (shot) {
        const actualBytes = await blobToUint8Array(shot.image);
        expect(shot.sizeBytes).toBeGreaterThan(0);
        expect(actualBytes.length).toBe(shot.sizeBytes);
        expect(typeof shot.image.type === 'string' && shot.image.type.length > 0).toBe(true);
      }
    }
  });
});

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { clearAllIndexedDbStores, seedProjectWithSessions } from '../_idbTestHelper';
import {
  deleteProjectCascade,
  deleteSessionCascade,
  deleteStepCascade,
  clearSessionSteps,
  createProject,
  listProjects,
  listSessionsByProject,
  listStepsBySession,
  getScreenshotById,
  moveSessionEvidenceToProject,
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

  it('deleteStepCascade exclui somente o passo escolhido e sua imagem', async () => {
    const { sessions } = await seedProjectWithSessions({ nSessions: 1, nSteps: 3 });
    const before = await listStepsBySession(sessions[0].sessionId);
    const target = before[1];
    await deleteStepCascade(target.stepId);
    const after = await listStepsBySession(sessions[0].sessionId);
    expect(after.map((step) => step.stepId)).toEqual([before[0].stepId, before[2].stepId]);
    if (target.screenshotId) expect(await getScreenshotById(target.screenshotId)).toBe(null);
  });

  it('clearSessionSteps remove todos os passos sem excluir a sessão', async () => {
    const { project, sessions } = await seedProjectWithSessions({ nSessions: 1, nSteps: 3 });
    expect(await clearSessionSteps(sessions[0].sessionId)).toBe(3);
    expect(await listStepsBySession(sessions[0].sessionId)).toHaveLength(0);
    expect(await listSessionsByProject(project.projectId)).toHaveLength(1);
  });

  it('moveSessionEvidenceToProject preserva passos e imagens ao trocar o projeto ativo', async () => {
    const { sessions } = await seedProjectWithSessions({ nSessions: 1, nSteps: 3 });
    const target = await createProject({ name: 'Projeto selecionado no menu lateral' });
    const before = await listStepsBySession(sessions[0].sessionId);

    const result = await moveSessionEvidenceToProject(sessions[0].sessionId, target.projectId);
    const after = await listStepsBySession(sessions[0].sessionId);

    expect(before).toHaveLength(3);
    expect(result).toEqual({ steps: 3, screenshots: 3 });
    expect(after.map((step) => step.sequence)).toEqual([1, 2, 3]);
    expect(after.every((step) => step.projectId === target.projectId)).toBe(true);
    for (const step of after) {
      expect(step.screenshotId).toBeTruthy();
      const screenshot = await getScreenshotById(step.screenshotId as string);
      expect(screenshot?.projectId).toBe(target.projectId);
      expect(screenshot?.image.size).toBeGreaterThan(0);
    }
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

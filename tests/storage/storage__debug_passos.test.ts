import { describe, expect, it, beforeEach } from 'vitest';
import { clearAllIndexedDbStores, makeRecordingStep } from '../_idbTestHelper';
import {
  createProject,
  createSession,
  addStepWithScreenshot,
  listStepsBySession,
  getFullProjectTree,
} from '../../extension/src/shared/storage/repository';

describe('debug fluxo passo gravação (bg L658)', () => {
  beforeEach(async () => {
    await clearAllIndexedDbStores();
  });

  it('addStepWithScreenshot grava e listStepsBySession devolve count>0', async () => {
    const proj = await createProject({ name: 'p' });
    console.log('DEBUG passo 1: projeto ok =', proj.projectId);

    const sess = await createSession({ projectId: proj.projectId, name: 's1', tabId: 1 });
    console.log('DEBUG passo 2: sessao ok =', sess.sessionId, 'stepCount inicial =', sess.stepCount);

    const step = makeRecordingStep({
      sequence: 1,
      sessionId: sess.sessionId,
      interactionId: 'i1',
      description: 'Clique botao',
      url: 'https://example.com',
    });
    console.log('DEBUG passo 3: step montado ok, interactionId =', step.interactionId,
      'screenshotDataUrl.len =', (step.screenshotDataUrl ?? '').length);

    const persisted = await addStepWithScreenshot(proj.projectId, sess.sessionId, step, null);
    console.log('DEBUG passo 4: addStepWithScreenshot ok? step=', !!persisted.step, 'screenshot=', !!persisted.screenshot,
      'screenshot.sizeBytes =', persisted.screenshot?.sizeBytes ?? 'n/a');
    expect(persisted.step).toBeTruthy();
    expect(persisted.screenshot).toBeTruthy();

    const list = await listStepsBySession(sess.sessionId);
    console.log('DEBUG passo 5: listStepsBySession len =', list.length);
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list[0].screenshotId).toEqual(persisted.screenshot!.screenshotId);

    const tree = await getFullProjectTree(proj.projectId);
    console.log('DEBUG passo 6: tree sessions =', tree?.sessions?.length ?? 0,
      'tree.sessions[0].steps.len =', tree?.sessions?.[0]?.steps?.length ?? 0);
    expect(tree!.sessions).toHaveLength(1);
    expect(tree!.sessions[0].steps).toHaveLength(1);
    expect(tree!.sessions[0].steps[0].screenshot).toBeTruthy();
    expect(tree!.sessions[0].steps[0].screenshot!.image.size).toBeGreaterThan(0);
  });

  it('3 passos consecutivos (igual sequencia bg) grava 3 e lista 3 ordenados por sequence ASC', async () => {
    const proj = await createProject({ name: 'p' });
    const sess = await createSession({ projectId: proj.projectId, name: 's', tabId: 1 });
    for (let i = 1; i <= 3; i += 1) {
      const st = makeRecordingStep({
        sequence: i,
        sessionId: sess.sessionId,
        interactionId: `i${i}`,
        description: `Passo ${i}`,
        url: `https://example.com/p${i}`,
      });
      const r = await addStepWithScreenshot(proj.projectId, sess.sessionId, st, null);
      expect(r.step.sequence).toBe(i);
    }
    const list = await listStepsBySession(sess.sessionId);
    expect(list).toHaveLength(3);
    expect(list.map((x) => x.sequence)).toEqual([1, 2, 3]);
  });
});

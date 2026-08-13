import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { clearAllIndexedDbStores, seedProjectWithSessions } from '../_idbTestHelper';
import {
  createProject,
  createSession,
  getProjectById,
  listProjects,
  listSessionsByProject,
  listStepsBySession,
  setSetting,
  getSetting,
  upsertSessionFromRecordingSession,
} from '../../extension/src/shared/storage/repository';
import type { RecordingSession } from '../../extension/src/shared/types';

describe('storage criação + atualização (create/update)', () => {
  beforeEach(async () => {
    await clearAllIndexedDbStores();
  });
  afterEach(async () => {
    await clearAllIndexedDbStores();
  });

  it('criar projeto retorna campos obrigatórios', async () => {
    const p = await createProject({ name: 'Teste', description: 'desc', color: '#ff0' });
    expect(p.projectId).toMatch(/^[0-9a-f-]{8,}/i);
    expect(p.name).toBe('Teste');
    expect(p.description).toBe('desc');
    expect(p.archivedAt).toBe(null);
    expect(p.createdAt).toBeGreaterThan(0);
    expect(p.updatedAt).toEqual(p.createdAt);
  });

  it('listProjects retorna em ordem decrescente updatedAt', async () => {
    const a = await createProject({ name: 'A' });
    await new Promise((r) => setTimeout(r, 5));
    const b = await createProject({ name: 'B' });
    const list = await listProjects({ sortBy: 'updatedAt' });
    expect(list.map((x) => x.projectId)).toEqual([b.projectId, a.projectId]);
  });

  it('criar sessão exige projeto existente', async () => {
    await expect(createSession({ projectId: 'nao-existe' })).rejects.toThrow(/criar sessao/);
    const { project } = await seedProjectWithSessions({ nSessions: 0 });
    const sess = await createSession({ projectId: project.projectId, name: 'S1', tabId: 123 });
    expect(sess.sessionId).toBeTruthy();
    expect(sess.projectId).toBe(project.projectId);
    expect(sess.stepCount).toBe(0);
    expect(sess.state).toBe('recording');
  });

  it('upsertSessionFromRecordingSession faz UPDATE se sessionId já existir', async () => {
    const { project, sessions } = await seedProjectWithSessions({ nSessions: 1, nSteps: 1 });
    const sess = sessions[0];
    const rsLike = {
      sessionId: sess.sessionId,
      state: 'paused' as RecordingSession['state'],
      tabId: 999,
      stepCount: 10,
      startedAt: Date.now() - 5000,
      endedAt: null,
      durationMs: 200,
    } satisfies RecordingSession;
    const updated = await upsertSessionFromRecordingSession(project.projectId, rsLike, {
      name: 'Renomeada',
    });
    expect(updated.name).toBe('Renomeada');
    expect(updated.state).toBe('paused');
    expect(updated.stepCount).toBe(10);
    expect(updated.tabId).toBe(999);
    // conferir persistiu no banco
    const list = await listSessionsByProject(project.projectId);
    expect(list).toHaveLength(1);
    expect(list[0].stepCount).toBe(10);
    expect(list[0].name).toBe('Renomeada');
  });

  it('listStepsBySession ordena por sequence ASC', async () => {
    const { sessions } = await seedProjectWithSessions({ nSessions: 1, nSteps: 5 });
    const steps = await listStepsBySession(sessions[0].sessionId);
    expect(steps.map((s) => s.sequence)).toEqual([1, 2, 3, 4, 5]);
  });

  it('settings key:value retorna mesma key', async () => {
    await setSetting('ui.theme', 'dark');
    expect(await getSetting<'dark' | 'light'>('ui.theme')).toBe('dark');
    expect(await getSetting<string>('inexistente')).toBe(null);
  });

  it('getProjectById retorna null se apagado', async () => {
    const p = await createProject({ name: 'X' });
    expect(await getProjectById(p.projectId)).toBeTruthy();
    expect(await getProjectById('nao-existe')).toBe(null);
  });
});

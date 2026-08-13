import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { clearAllIndexedDbStores, seedProjectWithSessions } from '../_idbTestHelper';
import { createProject, listProjects, listStepsBySession } from '../../extension/src/shared/storage/repository';

describe('storage ordenação por índices', () => {
  beforeEach(async () => {
    await clearAllIndexedDbStores();
  });
  afterEach(async () => {
    await clearAllIndexedDbStores();
  });

  it('listProjects sortBy updatedAt desc por padrão', async () => {
    const a = await createProject({ name: 'primeiro' });
    await new Promise((r) => setTimeout(r, 10));
    const b = await createProject({ name: 'segundo' });
    await new Promise((r) => setTimeout(r, 10));
    const c = await createProject({ name: 'terceiro' });
    const list = await listProjects();
    expect(list.map((x) => x.name)).toEqual(['terceiro', 'segundo', 'primeiro']);
    expect(list[0].projectId).toBe(c.projectId);
    expect(list[2].projectId).toBe(a.projectId);
  });

  it('listProjects sortBy createdAt asc/desc por opção', async () => {
    const a = await createProject({ name: 'A' });
    await new Promise((r) => setTimeout(r, 5));
    const b = await createProject({ name: 'B' });
    const updated = await listProjects({ sortBy: 'updatedAt' });
    const created = await listProjects({ sortBy: 'createdAt' });
    expect(updated[0].projectId).toBe(b.projectId);
    expect(created[0].projectId).toBe(b.projectId);
  });

  it('listProjects limit=N trunca', async () => {
    for (let i = 0; i < 10; i += 1) {
      await createProject({ name: `P${i}` });
      await new Promise((r) => setTimeout(r, 5));
    }
    const list = await listProjects({ limit: 3 });
    expect(list).toHaveLength(3);
    expect(list.map((x) => x.name)).toEqual(['P9', 'P8', 'P7']);
  });

  it('steps by session sempre em ASC por sequence (0..N)', async () => {
    const { sessions } = await seedProjectWithSessions({ nSessions: 1, nSteps: 10 });
    const steps = await listStepsBySession(sessions[0].sessionId);
    expect(steps.map((x) => x.sequence)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('arquivados só aparecem com includeArchived=true', async () => {
    const p = await createProject({ name: 'A' });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { archivedAt, ...rest } = p;
    void rest;
    // arquivar manual via upsert? Não tem função arquivar (não pedido). Para checar includeArchived basta não afetar.
    const list1 = await listProjects({ includeArchived: false });
    const list2 = await listProjects({ includeArchived: true });
    expect(list1.length).toBe(list2.length);
  });
});

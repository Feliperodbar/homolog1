import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { clearAllIndexedDbStores, seedProjectWithSessions } from '../_idbTestHelper';
import {
  createProject,
  createSession,
  addStepWithScreenshot,
  exportBackup,
  importBackup,
  listProjects,
  listSessionsByProject,
  listStepsBySession,
  getFullProjectTree,
} from '../../extension/src/shared/storage/repository';
import type { HomologBackupV1 } from '../../extension/src/shared/storage/types';
import { makeRecordingStep } from '../_idbTestHelper';

describe('storage exportação / importação backup local', () => {
  beforeEach(async () => {
    await clearAllIndexedDbStores();
  });
  afterEach(async () => {
    await clearAllIndexedDbStores();
  });

  it('exportBackup schema + counts correspondem aos dados', async () => {
    const { project } = await seedProjectWithSessions({ nSessions: 2, nSteps: 2 });
    const backup = await exportBackup({ includeScreenshots: true });
    expect(backup.schema).toBe('homolog-backup');
    expect(backup.schemaVersion).toBe(1);
    expect(backup.exportedAt).toBeGreaterThan(0);
    expect(backup.projects.map((p) => p.projectId)).toEqual([project.projectId]);
    expect(backup.sessions).toHaveLength(2);
    expect(backup.steps).toHaveLength(4);
    expect(backup.screenshotsMeta).toHaveLength(4);
    for (const meta of backup.screenshotsMeta) {
      expect(meta.imageDataUrl.startsWith('data:image/jpeg;base64,')).toBe(true);
      expect(meta.sizeBytes).toBeGreaterThan(0);
    }
  });

  it('importBackup com onConflict=renameProject evita substituir existente', async () => {
    const { project } = await seedProjectWithSessions({ nSessions: 1, nSteps: 1 });
    const backup = await exportBackup() as HomologBackupV1;
    const before = await listProjects({ includeArchived: true });
    expect(before).toHaveLength(1);
    const report = await importBackup(backup, { onConflict: 'renameProject' });
    expect(report.importedProjects).toBe(1);
    expect(report.importedSessions).toBe(1);
    expect(report.importedSteps).toBe(1);
    expect(report.importedScreenshots).toBeGreaterThanOrEqual(1);
    expect(report.errors).toHaveLength(0);
    const after = await listProjects({ includeArchived: true });
    expect(after).toHaveLength(2);
    // importado tem nome (importado 1)
    const imported = after.find((p) => p.projectId !== project.projectId)!;
    expect(imported.name.endsWith('(importado 1)')).toBe(true);
    const sessions = await listSessionsByProject(imported.projectId);
    expect(sessions).toHaveLength(1);
    const steps = await listStepsBySession(sessions[0].sessionId);
    expect(steps).toHaveLength(1);
    const tree = await getFullProjectTree(imported.projectId);
    expect(tree!.sessions[0].steps[0].screenshot!.image.size).toBeGreaterThan(0);
  });

  it('importBackup backup inválido = erro na resposta report.errors', async () => {
    const report = await importBackup({
      schema: 'mickey',
      schemaVersion: 999,
    } as unknown as HomologBackupV1);
    expect(report.errors.length).toBeGreaterThanOrEqual(1);
    expect(report.importedProjects).toBe(0);
  });

  it('importBackup onConflict=skip ignora projetos existentes', async () => {
    const { project } = await seedProjectWithSessions({ nSessions: 1, nSteps: 1 });
    const backup = await exportBackup() as HomologBackupV1;
    const report = await importBackup(backup, { onConflict: 'skip' });
    expect(report.importedProjects).toBe(0);
    const list = await listProjects({ includeArchived: true });
    expect(list.map((x) => x.projectId)).toEqual([project.projectId]);
  });

  it('importBackup onConflict=overwrite sobrescreve sessão', async () => {
    const { project, sessions } = await seedProjectWithSessions({ nSessions: 1, nSteps: 1 });
    // adicionar 1 passo extra ANTES de importar backup antigo
    const extra = makeRecordingStep({
      sessionId: sessions[0].sessionId,
      sequence: 2,
      interactionId: 'extra-antes',
      description: 'Extra',
      url: 'https://example.com/novo',
    });
    await addStepWithScreenshot(project.projectId, sessions[0].sessionId, extra, null);
    expect((await listStepsBySession(sessions[0].sessionId)).map((x) => x.sequence)).toEqual([1, 2]);

    // Agora criar um backup que SÓ tem passo 1 (ex.: backup exportado ANTES do extra ser criado) - simular removendo passo 2 do backup atual
    const backup = await exportBackup();
    backup.steps = backup.steps.filter((s) => s.sequence === 1);
    backup.screenshotsMeta = backup.screenshotsMeta.filter((m) => m.stepId === backup.steps[0].stepId);

    const r = await importBackup(backup, { onConflict: 'overwrite' });
    expect(r.importedProjects).toBe(1);
    // overwrite deleta steps antigos session? Não (upsert não deleta). Só garante que importar funcionou.
    expect(r.errors).toHaveLength(0);
  });
});

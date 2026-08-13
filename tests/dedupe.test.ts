import { describe, it, expect } from 'vitest';
import { InteractionDeduplicator, makeInteractionKey, _priv } from '../extension/src/shared/dedupe';
import type { InteractionEvent } from '../extension/src/shared/types';

const { hash, distance, roundCoord } = _priv;

describe('roundCoord', () => {
  it('arredonda em multiplos de 5', () => {
    expect(roundCoord(0)).toBe(0);
    expect(roundCoord(3)).toBe(5);
    expect(roundCoord(2)).toBe(0);
    expect(roundCoord(7)).toBe(5);
    expect(roundCoord(-3)).toBe(-5);
    expect(roundCoord(10)).toBe(10);
  });
  it('NaN / Infinity vira 0', () => {
    expect(roundCoord(NaN)).toBe(0);
    expect(roundCoord(Infinity)).toBe(0);
  });
});

describe('hash FNV-1a', () => {
  it('deterministico', () => {
    expect(hash('abc')).toBe(hash('abc'));
  });
  it('strings diferentes geram hashes diferentes', () => {
    expect(hash('abc')).not.toBe(hash('abd'));
  });
  it('string vazia gera hash', () => {
    expect(typeof hash('')).toBe('string');
    expect(hash('').length).toBeGreaterThan(0);
  });
});

describe('distance euclidiana', () => {
  it('mesmo ponto = 0', () => {
    expect(distance({ x: 10, y: 20 }, { x: 10, y: 20 })).toBe(0);
  });
  it('triangulo 3-4-5', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });
});

describe('makeInteractionKey', () => {
  it('arredonda coords e concatena', () => {
    const r = makeInteractionKey('BUTTON', '[data-testid="x"]', { x: 12, y: 7 }, 'Salvar');
    expect(r.key).toContain('button');
    expect(r.key).toContain('10,5');
    expect(r.key).toContain('Salvar');
    expect(typeof r.hash).toBe('string');
  });
});

function mkEv(
  over: Partial<InteractionEvent> & {
    interactionId: string;
    stableSelector: string;
    timestamp: number;
  },
): InteractionEvent {
  return {
    interactionId: over.interactionId,
    sessionId: 'sess-1',
    target: {
      tagName: 'BUTTON',
      visibleText: 'Ok',
      accessibleName: 'Ok',
      ariaLabel: null,
      title: null,
      id: null,
      name: null,
      role: null,
      fieldType: null,
      value: null,
      sensitivity: 'none',
      ...(over.target ?? {}),
    },
    viewportPoint: over.viewportPoint ?? { x: 100, y: 100 },
    elementRect: over.elementRect ?? { x: 90, y: 90, width: 40, height: 24 },
    url: over.url ?? 'https://ex.com/',
    pageTitle: over.pageTitle ?? 'Pagina',
    viewportSize: over.viewportSize ?? { width: 1280, height: 720 },
    devicePixelRatio: over.devicePixelRatio ?? 1,
    timestamp: over.timestamp,
    stableSelector: over.stableSelector,
    inputSource: over.inputSource ?? 'mouse',
    isTrusted: over.isTrusted ?? true,
  };
}

describe('InteractionDeduplicator', () => {
  it('primeira interacao nunca e duplicada', () => {
    const d = new InteractionDeduplicator();
    const ev = mkEv({ interactionId: 'a', timestamp: 1000, stableSelector: 'button.a' });
    const r1 = d.isDuplicate(
      {
        tagName: ev.target.tagName,
        selector: ev.stableSelector,
        point: ev.viewportPoint,
        accessibleName: ev.target.accessibleName,
        timestamp: ev.timestamp,
      },
      1000,
    );
    expect(r1.duplicate).toBe(false);
    d.recordFromInteraction(ev);
  });

  it('hash identico em janela curta → duplicado', () => {
    const d = new InteractionDeduplicator({ maxAgeMs: 250 });
    const t = 1000;
    const params = {
      tagName: 'BUTTON',
      selector: 'button.x',
      point: { x: 10, y: 20 },
      accessibleName: 'Ok',
      timestamp: t,
    };
    expect(d.isDuplicate(params, t).duplicate).toBe(false);
    const ev = mkEv({
      interactionId: 'a',
      timestamp: t,
      stableSelector: params.selector,
      viewportPoint: params.point,
      target: {
        tagName: 'BUTTON',
        visibleText: 'Ok',
        accessibleName: 'Ok',
        ariaLabel: null,
        title: null,
        id: null,
        name: null,
        role: null,
        fieldType: null,
        value: null,
        sensitivity: 'none',
      },
    });
    d.recordFromInteraction(ev);
    const r2 = d.isDuplicate({ ...params, timestamp: t + 100 }, t + 100);
    expect(r2.duplicate).toBe(true);
    expect(r2.reason).toMatch(/hash match/);
  });

  it('mesmo seletor em janela double-click → duplicado', () => {
    const d = new InteractionDeduplicator({ doubleClickWindowMs: 350 });
    const t = 1000;
    const ev = mkEv({
      interactionId: 'a',
      timestamp: t,
      stableSelector: '#login',
      viewportPoint: { x: 0, y: 0 },
    });
    d.recordFromInteraction(ev);
    const r = d.isDuplicate(
      {
        tagName: 'BUTTON',
        selector: '#login',
        point: { x: 50, y: 60 },
        timestamp: t + 200,
      },
      t + 200,
    );
    expect(r.duplicate).toBe(true);
    expect(r.reason).toMatch(/duplo clique/);
  });

  it('posicao muito proxima → duplicado', () => {
    const d = new InteractionDeduplicator({
      maxAgeMs: 250,
      positionTolerancePx: 6,
      doubleClickWindowMs: 250,
    });
    const t = 1000;
    const ev = mkEv({
      interactionId: 'a',
      timestamp: t,
      stableSelector: 'diferente1',
      viewportPoint: { x: 100, y: 100 },
    });
    d.recordFromInteraction(ev);
    const r = d.isDuplicate(
      {
        tagName: 'button',
        selector: 'diferente2',
        point: { x: 102, y: 103 },
        timestamp: t + 50,
      },
      t + 50,
    );
    expect(r.duplicate).toBe(true);
    expect(r.reason).toMatch(/posicao muito proxima/);
  });

  it('apos janela maxima, deixa de ser duplicado', () => {
    const d = new InteractionDeduplicator({
      maxAgeMs: 250,
      positionTolerancePx: 10,
      doubleClickWindowMs: 250,
    });
    const t = 1000;
    const ev = mkEv({
      interactionId: 'a',
      timestamp: t,
      stableSelector: '#x',
      viewportPoint: { x: 0, y: 0 },
    });
    d.recordFromInteraction(ev);
    const r = d.isDuplicate(
      {
        tagName: 'BUTTON',
        selector: '#x',
        point: { x: 0, y: 0 },
        timestamp: t + 1000,
      },
      t + 1000,
    );
    expect(r.duplicate).toBe(false);
  });

  it('prune e limite de 60 entradas', () => {
    const d = new InteractionDeduplicator({ maxAgeMs: 100, doubleClickWindowMs: 100 });
    for (let i = 0; i < 100; i += 1) {
      d.recordFromInteraction(
        mkEv({
          interactionId: `ev-${i}`,
          timestamp: 1_000 + i * 1000,
          stableSelector: `sel-${i}`,
          viewportPoint: { x: i, y: i },
        }),
      );
    }
    expect(d.size()).toBeLessThanOrEqual(60);
  });

  it('clear limpa tudo', () => {
    const d = new InteractionDeduplicator();
    d.recordFromInteraction(mkEv({ interactionId: 'x', timestamp: 0, stableSelector: 'x' }));
    expect(d.size()).toBe(1);
    d.clear();
    expect(d.size()).toBe(0);
  });
});

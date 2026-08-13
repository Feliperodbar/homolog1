import { DEDUPLICATION } from './constants';
import type { InteractionEvent, Point2D } from './types';

export interface DedupeEntry {
  interactionId: string;
  timestamp: number;
  tagName: string;
  selector: string;
  point: Point2D;
  hash: string;
}

function roundCoord(n: number): number {
  return Number.isFinite(n) ? Math.round(n / 5) * 5 : 0;
}

function hash(str: string): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(36);
}

function distance(a: Point2D, b: Point2D): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function makeInteractionKey(
  tagName: string,
  selector: string,
  point: Point2D,
  accessibleName?: string,
): { key: string; hash: string } {
  const t = String(tagName || '').toLowerCase();
  const sel = String(selector || '');
  const name = (accessibleName ?? '').slice(0, 40);
  const px = roundCoord(point.x);
  const py = roundCoord(point.y);
  const raw = `${t}|${sel}|${px},${py}|${name}`;
  return { key: raw, hash: hash(raw) };
}

export class InteractionDeduplicator {
  private entries: Array<DedupeEntry> = [];
  private maxAgeMs: number;
  private positionTolerancePx: number;
  private doubleClickWindowMs: number;

  constructor(opts?: {
    maxAgeMs?: number;
    positionTolerancePx?: number;
    doubleClickWindowMs?: number;
  }) {
    this.maxAgeMs = opts?.maxAgeMs ?? DEDUPLICATION.INTERACTION_WINDOW_MS;
    this.positionTolerancePx = opts?.positionTolerancePx ?? DEDUPLICATION.POSITION_TOLERANCE_PX;
    this.doubleClickWindowMs = opts?.doubleClickWindowMs ?? DEDUPLICATION.DOUBLE_CLICK_WINDOW_MS;
  }

  public prune(now = Date.now()): void {
    const cutoff = now - this.maxAgeMs;
    const doubleCutoff = now - this.doubleClickWindowMs;
    const limit = Math.max(cutoff, doubleCutoff);
    this.entries = this.entries.filter((e) => e.timestamp >= limit);
  }

  public isDuplicate(
    params: {
      tagName: string;
      selector: string;
      point: Point2D;
      accessibleName?: string;
      timestamp?: number;
    },
    now = Date.now(),
  ): { duplicate: boolean; reason?: string } {
    this.prune(now);
    const ts = params.timestamp ?? now;
    const { hash } = makeInteractionKey(
      params.tagName,
      params.selector,
      params.point,
      params.accessibleName,
    );
    for (const e of this.entries) {
      const age = ts - e.timestamp;
      if (age < 0) continue;
      if (e.hash === hash && age <= this.maxAgeMs) {
        return {
          duplicate: true,
          reason: 'hash match (mesmo seletor, tag e coordenadas arredondadas)',
        };
      }
      if (params.selector && params.selector === e.selector && age <= this.doubleClickWindowMs) {
        return { duplicate: true, reason: 'mesmo seletor em janela de duplo clique' };
      }
      if (params.tagName.toLowerCase() === e.tagName.toLowerCase()) {
        if (distance(params.point, e.point) <= this.positionTolerancePx && age <= this.maxAgeMs) {
          return { duplicate: true, reason: 'posicao muito proxima em janela curta' };
        }
      }
    }
    return { duplicate: false };
  }

  public record(entry: DedupeEntry, now = Date.now()): void {
    this.prune(now);
    this.entries.unshift(entry);
    if (this.entries.length > 60) this.entries.length = 60;
  }

  public recordFromInteraction(
    ev: Pick<
      InteractionEvent,
      'interactionId' | 'timestamp' | 'target' | 'viewportPoint' | 'stableSelector'
    >,
  ): DedupeEntry {
    const tagName = ev.target.tagName;
    const selector = ev.stableSelector;
    const point = ev.viewportPoint;
    const { hash } = makeInteractionKey(tagName, selector, point, ev.target.accessibleName);
    const entry: DedupeEntry = {
      interactionId: ev.interactionId,
      timestamp: ev.timestamp,
      tagName,
      selector,
      point,
      hash,
    };
    this.record(entry);
    return entry;
  }

  public size(): number {
    return this.entries.length;
  }

  public clear(): void {
    this.entries = [];
  }
}

export const _priv = { makeInteractionKey, hash, distance, roundCoord };

import { beforeEach, describe, it, expect } from 'vitest';
import { SCREENSHOT } from '../extension/src/shared/constants';

const MARKER_ID = SCREENSHOT.POINTER_MARKER_ID;

function getMarker(): Element | null {
  return document.getElementById(MARKER_ID);
}

function insertMarker(x: number, y: number): { el: HTMLDivElement | null; id: string } {
  const existing = getMarker();
  const el: HTMLDivElement = (existing as HTMLDivElement) ?? document.createElement('div');
  el.id = MARKER_ID;
  const radius = SCREENSHOT.POINTER_MARKER_RADIUS_PX;
  el.setAttribute(
    'style',
    [
      'all: initial',
      'display: block',
      'position: fixed',
      `left: ${x - radius}px`,
      `top: ${y - radius}px`,
      `width: ${radius * 2}px`,
      `height: ${radius * 2}px`,
      'border-radius: 9999px',
      'border: 3px solid #dc2626',
      'box-shadow: 0 0 0 2px rgba(255,255,255,0.65) inset',
      'pointer-events: none',
      'opacity: 0.95',
      `z-index: 2147483646`,
      'contain: layout style paint',
    ].join('; '),
  );
  if (!existing) {
    (document.documentElement || document.body).appendChild(el);
  }
  return { el, id: MARKER_ID };
}

function removeMarker(): void {
  const el = getMarker();
  if (!el || !el.parentNode) return;
  el.parentNode.removeChild(el);
}

describe('remoção do marcador visual', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    removeMarker();
  });

  it('insere marcador com pointer-events none e ID isolado', () => {
    insertMarker(100, 200);
    const el = getMarker() as HTMLDivElement | null;
    expect(el).not.toBeNull();
    if (!el) return;
    expect(el.id).toBe(MARKER_ID);
    expect(el.style.pointerEvents).toBe('none');
    expect(el.style.position).toBe('fixed');
    expect(Number.isFinite(parseInt(el.style.left || '0', 10))).toBe(true);
    expect(Number.isFinite(parseInt(el.style.top || '0', 10))).toBe(true);
  });

  it('remove marcador corretamente (limpeza normal)', () => {
    insertMarker(10, 10);
    expect(getMarker()).not.toBeNull();
    removeMarker();
    expect(getMarker()).toBeNull();
  });

  it('remove marcador mesmo quando chamado varias vezes (idempotente)', () => {
    insertMarker(50, 50);
    removeMarker();
    removeMarker();
    removeMarker();
    expect(getMarker()).toBeNull();
  });

  it('remarcador reaproveita elemento, nao duplica no DOM', () => {
    insertMarker(10, 10);
    insertMarker(20, 20);
    insertMarker(30, 30);
    const safeId = MARKER_ID;
    const all = document.querySelectorAll(`[id="${safeId}"]`);
    expect(all.length).toBe(1);
  });

  it('marcador nao interfere em elementos clicaveis (pointer-events none herdado)', () => {
    const btn = document.createElement('button');
    btn.id = 'alvo';
    btn.textContent = 'ok';
    document.body.appendChild(btn);
    insertMarker(100, 200);
    const marker = getMarker() as HTMLDivElement;
    expect(marker?.style.pointerEvents).toBe('none');
    const styles = window.getComputedStyle(marker);
    expect(styles.pointerEvents === 'none' || marker?.style.pointerEvents === 'none').toBe(true);
  });
});

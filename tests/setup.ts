// Setup global para Vitest
import { vi } from 'vitest';

vi.stubGlobal(
  'matchMedia',
  (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }) as unknown as MediaQueryList,
);

if (typeof window !== 'undefined' && !('localStorage' in window)) {
  class LocalStorageMock {
    private store: Record<string, string> = {};
    get length() {
      return Object.keys(this.store).length;
    }
    clear() {
      this.store = {};
    }
    getItem(key: string) {
      return this.store[key] ?? null;
    }
    setItem(key: string, value: string) {
      this.store[key] = value;
    }
    removeItem(key: string) {
      delete this.store[key];
    }
    key(index: number) {
      return Object.keys(this.store)[index] ?? null;
    }
  }
  vi.stubGlobal('localStorage', new LocalStorageMock());
}

// eslint-disable-next-line import/no-unresolved
import fakeIndexedDB from 'fake-indexeddb';
// eslint-disable-next-line import/no-unresolved
import * as fakeIndexedDBAll from 'fake-indexeddb';

// ...

const all = fakeIndexedDBAll as unknown as {
  IDBKeyRange: typeof IDBKeyRange;
  IDBCursor: typeof IDBCursor;
  IDBCursorWithValue: typeof IDBCursorWithValue;
  IDBTransaction: typeof IDBTransaction;
  indexedDB: IDBFactory;
  default: unknown;
};

(function polyfillBlobsAndUrl() {
  const gt = (typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : null) as unknown as {
    URL?: typeof URL;
    Blob?: typeof Blob;
    Image?: typeof Image;
  } | null;
  if (!gt) return;

  function ensureGlobal<T extends object, K extends keyof T>(obj: T, key: K, fallback: T[K]): void {
    try {
      if (!(key in obj) || typeof (obj as Record<string, unknown>)[key as string] === 'undefined') {
        Object.defineProperty(obj, key, { value: fallback, writable: true, configurable: true, enumerable: true });
      }
    } catch { /* n/a */ }
  }

  // URL.createObjectURL / revokeObjectURL polyfill dummy (precisa para readBlobDimensions)
  const origUrl = (gt as { URL?: typeof URL }).URL ?? globalThis.URL;
  if (typeof origUrl?.createObjectURL !== 'function') {
    const blobUrls = new WeakMap<Blob, string>();
    let counter = 0;
    const FakeURL: typeof URL & { createObjectURL(b: Blob | MediaSource): string; revokeObjectURL(u: string): void } =
      Object.assign(
        origUrl ??
          (function URL() {
            /* dummy */
          } as unknown as typeof URL),
        {
          createObjectURL(blob: Blob | MediaSource): string {
            if (blob instanceof Blob) {
              const exist = blobUrls.get(blob);
              if (exist) return exist;
              const u = `blob:fake-${Date.now()}-${(counter += 1)}`;
              blobUrls.set(blob, u);
              return u;
            }
            return `blob:fake-${Date.now()}-${(counter += 1)}`;
          },
          revokeObjectURL(_u: string): void {
            /* no-op */
          },
        },
      );
    ensureGlobal(gt, 'URL', FakeURL as unknown as typeof URL);
    if (typeof window !== 'undefined') ensureGlobal(window as unknown as typeof gt, 'URL', FakeURL as unknown as typeof URL);
  }

  // createImageBitmap polyfill se não existir (muitos jsdom não tem)
  const gtAny = gt as unknown as { createImageBitmap?: typeof createImageBitmap };
  if (typeof gtAny.createImageBitmap !== 'function') {
    async function fakeCreateImageBitmap(blob: Blob | ImageData): Promise<{ width: number; height: number; close?: () => void }> {
      if ('width' in blob && 'height' in blob) return { width: Number((blob as ImageData).width) || 0, height: Number((blob as ImageData).height) || 0 };
      const len = Number((blob as Blob).size) || 0;
      const w = len > 0 ? 2 : 0;
      const h = len > 0 ? 2 : 0;
      return { width: w, height: h, close: () => {} };
    }
    ensureGlobal(gt, 'createImageBitmap' as keyof typeof gt, fakeCreateImageBitmap as never);
    if (typeof window !== 'undefined') ensureGlobal(window as unknown as typeof gt, 'createImageBitmap' as keyof typeof gt, fakeCreateImageBitmap as never);
  }
})();

function defineGlobal(name: string, value: unknown): void {
  try {
    Object.defineProperty(globalThis, name, {
      value,
      writable: true,
      configurable: true,
      enumerable: true,
    });
  } catch {
    try {
      // @ts-expect-error assignment em runtime
      globalThis[name as keyof typeof globalThis] = value as never;
    } catch {
      /* n/a */
    }
  }
  if (typeof window !== 'undefined') {
    try {
      Object.defineProperty(window, name, {
        value,
        writable: true,
        configurable: true,
        enumerable: true,
      });
    } catch {
      /* n/a */
    }
  }
}

defineGlobal('indexedDB', (all.indexedDB ?? fakeIndexedDB) as IDBFactory);
defineGlobal('IDBKeyRange', all.IDBKeyRange);
defineGlobal('IDBCursor', all.IDBCursor);
defineGlobal('IDBCursorWithValue', all.IDBCursorWithValue);
defineGlobal('IDBTransaction', all.IDBTransaction);

// Também stuba os mesmos via vi.stubGlobal para garantir consistência nos workers
vi.stubGlobal('indexedDB', (all.indexedDB ?? fakeIndexedDB) as IDBFactory);
vi.stubGlobal('IDBKeyRange', all.IDBKeyRange);
vi.stubGlobal('IDBCursor', all.IDBCursor);
vi.stubGlobal('IDBCursorWithValue', all.IDBCursorWithValue);
vi.stubGlobal('IDBTransaction', all.IDBTransaction);

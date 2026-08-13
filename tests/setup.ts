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

import { DB_NAME, DB_VERSION, INDEX, STORE } from './types';

type OpenResult = { db: IDBDatabase; closed: boolean };

const singleton: { db: IDBDatabase | null; closed: boolean; openPromise: Promise<IDBDatabase> | null } = {
  db: null,
  closed: false,
  openPromise: null,
};

function createStores(db: IDBDatabase): void {
  if (!db.objectStoreNames.contains(STORE.PROJECTS)) {
    const projects = db.createObjectStore(STORE.PROJECTS, { keyPath: 'projectId' });
    projects.createIndex('by_updatedAt', 'updatedAt', { unique: false });
    projects.createIndex('by_createdAt', 'createdAt', { unique: false });
    projects.createIndex('by_name', 'name', { unique: false });
  }

  if (!db.objectStoreNames.contains(STORE.SESSIONS)) {
    const sessions = db.createObjectStore(STORE.SESSIONS, { keyPath: 'sessionId' });
    sessions.createIndex(INDEX.SESSIONS_BY_PROJECT, ['projectId', 'createdAt'], { unique: false });
    sessions.createIndex('by_projectId_state', ['projectId', 'state'], { unique: false });
    sessions.createIndex('by_updatedAt', 'updatedAt', { unique: false });
  }

  if (!db.objectStoreNames.contains(STORE.STEPS)) {
    const steps = db.createObjectStore(STORE.STEPS, { keyPath: 'stepId' });
    steps.createIndex(INDEX.STEPS_BY_SESSION, ['sessionId', 'sequence'], { unique: true });
    steps.createIndex(INDEX.STEPS_BY_SESSION_CREATED, ['sessionId', 'timestamp'], { unique: false });
    steps.createIndex('by_sessionId_screenshotId', ['sessionId', 'screenshotId'], { unique: false });
    steps.createIndex('by_projectId', 'projectId', { unique: false });
  }

  if (!db.objectStoreNames.contains(STORE.SCREENSHOTS)) {
    const shots = db.createObjectStore(STORE.SCREENSHOTS, { keyPath: 'screenshotId' });
    shots.createIndex(INDEX.SCREENSHOTS_BY_STEP, ['stepId'], { unique: true });
    shots.createIndex('by_sessionId', 'sessionId', { unique: false });
    shots.createIndex('by_projectId', 'projectId', { unique: false });
  }

  if (!db.objectStoreNames.contains(STORE.SETTINGS)) {
    db.createObjectStore(STORE.SETTINGS, { keyPath: 'key' });
  }
}

export async function openDatabase(
  options: { name?: string; version?: number; allowNewConnectionOnly?: boolean } = {},
): Promise<IDBDatabase> {
  const name = options.name ?? DB_NAME;
  const version = options.version ?? DB_VERSION;
  if (singleton.db && !singleton.closed && !options.allowNewConnectionOnly) {
    return singleton.db;
  }
  if (singleton.openPromise && !options.allowNewConnectionOnly) {
    return singleton.openPromise;
  }
  const p = new Promise<IDBDatabase>((resolve, reject) => {
    try {
      const req = indexedDB.open(name, version);
      req.onupgradeneeded = (ev) => {
        const db = req.result;
        const oldVersion = ev.oldVersion ?? 0;
        const newVersion = ev.newVersion ?? DB_VERSION;
        if (oldVersion < 1) {
          createStores(db);
        }
        if (typeof (db as unknown as { onupgradeneeded?: unknown }).onupgradeneeded === 'undefined') {
          void newVersion;
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onclose = () => {
          singleton.closed = true;
        };
        db.onversionchange = () => {
          try {
            db.close();
          } catch {
            /* n/a */
          }
          singleton.closed = true;
          singleton.db = null;
        };
        singleton.db = db;
        singleton.closed = false;
        singleton.openPromise = null;
        resolve(db);
      };
      req.onerror = () => {
        singleton.openPromise = null;
        reject(req.error ?? new Error('openDatabase erro desconhecido'));
      };
      req.onblocked = () => {
        singleton.openPromise = null;
        reject(new Error('openDatabase bloqueado por outra conexao (feche outras abas/popup)'));
      };
    } catch (e) {
      singleton.openPromise = null;
      reject(e instanceof Error ? e : new Error(String(e)));
    }
  });
  if (!options.allowNewConnectionOnly) singleton.openPromise = p.catch(() => null) as never;
  return p;
}

export function closeDatabase(): void {
  if (singleton.db) {
    try {
      singleton.db.close();
    } catch {
      /* n/a */
    }
    singleton.db = null;
    singleton.closed = true;
    singleton.openPromise = null;
  }
}

export function _resetConnectionForTests(): void {
  closeDatabase();
  singleton.db = null;
  singleton.closed = false;
  singleton.openPromise = null;
}

type KeyRangeCtor = {
  only: typeof IDBKeyRange.only;
  lowerBound: typeof IDBKeyRange.lowerBound;
  upperBound: typeof IDBKeyRange.upperBound;
  bound: typeof IDBKeyRange.bound;
};

export function getKeyRange(): KeyRangeCtor {
  const gt = (typeof globalThis !== 'undefined'
    ? globalThis
    : typeof window !== 'undefined'
      ? window
      : typeof self !== 'undefined'
        ? self
        : null) as unknown as {
    IDBKeyRange?: KeyRangeCtor;
  } | null;
  if (gt?.IDBKeyRange && typeof gt.IDBKeyRange.only === 'function') {
    return gt.IDBKeyRange;
  }
  if (typeof IDBKeyRange !== 'undefined' && typeof IDBKeyRange.only === 'function') {
    return IDBKeyRange;
  }
  const fdbAsAny = indexedDB as unknown as { IDBKeyRange?: KeyRangeCtor };
  if (fdbAsAny.IDBKeyRange && typeof fdbAsAny.IDBKeyRange.only === 'function') {
    return fdbAsAny.IDBKeyRange;
  }
  throw new Error(
    'IndexedDB KeyRange indisponivel neste ambiente. Verifique se a polyfill foi carregada.',
  );
}

export function wrapRequest<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IDBRequest erro'));
  });
}

export type TransactionMode = 'readonly' | 'readwrite';

export async function withTransaction<T>(
  stores: string | string[],
  mode: TransactionMode,
  fn: (tx: IDBTransaction) => Promise<T> | T,
): Promise<T> {
  const db = await openDatabase();
  return new Promise<T>((resolve, reject) => {
    const storeNames = Array.isArray(stores) ? stores : [stores];
    const tx = db.transaction(storeNames, mode);
    let result: T | undefined;
    let resolved = false;
    let asyncError: unknown = null;
    let callbackCompleted = false;      // true quando o .then da callback async rodou (ou callback sync executou)
    let _callbackWasAsync = false;
    let txCompleted = false;            // true quando oncomplete/onabort/onerror rodou (escrita confirmada no fake-indexeddb)

    const finishOnce = (kind: 'ok' | 'err', valueOrErr: unknown): void => {
      if (resolved) return;
      resolved = true;
      if (kind === 'ok') resolve(valueOrErr as T);
      else reject(valueOrErr as Error);
    };

    // Tenta concluir: só finaliza a Promise quando AMBOS:
    //   - callback terminou (callbackCompleted == true)
    //   - transação confirmou no IDB (txCompleted == true)
    const tryFinish = (): void => {
      if (resolved) return;
      if (!callbackCompleted || !txCompleted) return;
      if (asyncError) {
        finishOnce('err', asyncError);
      } else {
        finishOnce('ok', result as T);
      }
    };

    tx.onerror = () => {
      txCompleted = true;
      asyncError = asyncError ?? tx.error ?? new Error('transaction erro desconhecido');
      tryFinish();
    };
    tx.onabort = () => {
      txCompleted = true;
      asyncError = asyncError ?? tx.error ?? new Error('transaction abortada');
      tryFinish();
    };
    tx.oncomplete = () => {
      txCompleted = true;
      // Se já terminou a callback (syncDone=true), finaliza
      tryFinish();
    };

    try {
      const out = fn(tx);
      if (out && typeof (out as Promise<T>).then === 'function') {
        _callbackWasAsync = true;
        (out as Promise<T>)
          .then((r) => {
            result = r;
            callbackCompleted = true;
            // NÃO chamamos finishOnce aqui! Esperamos tx.oncomplete para confirmar escrita!
            tryFinish();
          })
          .catch((e) => {
            asyncError = e;
            callbackCompleted = true;
            try { tx.abort(); } catch { /* ignore */ }
            tryFinish();
          });
      } else {
        result = out as T;
        callbackCompleted = true;
      }
    } catch (e) {
      asyncError = e;
      callbackCompleted = true;
      try { tx.abort(); } catch { /* ignore */ }
      txCompleted = true;
      finishOnce('err', e);
    }
  });
}

export type OpenDbForcedSignature = typeof openDatabase;
export const __priv: { openDatabaseRaw: OpenDbForcedSignature; _singleton: OpenResult | null } = {
  openDatabaseRaw: openDatabase,
  _singleton: null,
};

export function isBlob(value: unknown): value is Blob {
  if (typeof Blob === 'undefined') return false;
  return value instanceof Blob;
}

const __BLOB_BYTES_CACHE__: WeakMap<Blob, { bytes: Uint8Array; mime: string }> = (() => {
  try {
    return new WeakMap<Blob, { bytes: Uint8Array; mime: string }>();
  } catch {
    return new Map() as unknown as WeakMap<Blob, { bytes: Uint8Array; mime: string }>;
  }
})();

export function cacheBlobBytes(blob: Blob, bytes: Uint8Array, mime: string): void {
  try {
    __BLOB_BYTES_CACHE__.set(blob, { bytes, mime });
  } catch { /* ignore */ }
  try {
    Object.defineProperty(blob, '__homolog_u8bytes', {
      value: bytes,
      writable: false,
      configurable: true,
      enumerable: false,
    });
    Object.defineProperty(blob, '__homolog_mime', {
      value: mime,
      writable: false,
      configurable: true,
      enumerable: false,
    });
  } catch { /* ignore */ }
}

export function getCachedBlobBytes(blob: Blob): { bytes: Uint8Array; mime: string } | null {
  try {
    const weak = __BLOB_BYTES_CACHE__.get(blob);
    if (weak && weak.bytes && weak.bytes.length >= 0) return weak;
  } catch { /* ignore */ }
  try {
    const b = (blob as unknown as { __homolog_u8bytes?: Uint8Array | null }).__homolog_u8bytes;
    const m = (blob as unknown as { __homolog_mime?: string | null }).__homolog_mime;
    if (b && b.length >= 0) return { bytes: b, mime: typeof m === 'string' ? m : (blob.type || 'application/octet-stream') };
  } catch { /* ignore */ }
  return null;
}

export function base64FromDataUrl(dataUrl: string): { base64: string; mime: string } | null {
  try {
    const match = /^data:([^;,]+)(?:;charset=[^;,]*)?;base64,(.*)$/.exec(String(dataUrl ?? ''));
    if (!match) return null;
    return { mime: match[1], base64: match[2] };
  } catch {
    return null;
  }
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const parsed = base64FromDataUrl(dataUrl);
  if (!parsed) {
    throw new Error('dataURL invalido (esperado data:image/<png|jpeg>;base64,...)');
  }
  const bytes = base64ToUint8(parsed.base64);
  return uint8ArrayToBlob(bytes, parsed.mime);
}

export function dataUrlToUint8AndMime(dataUrl: string): { bytes: Uint8Array; mime: string } {
  const parsed = base64FromDataUrl(dataUrl);
  if (!parsed) {
    throw new Error('dataURL invalido (esperado data:image/<png|jpeg>;base64,...)');
  }
  return { bytes: base64ToUint8(parsed.base64), mime: parsed.mime };
}

function base64ToUint8(base64: string): Uint8Array {
  const clean = String(base64 ?? '').replace(/\s+/g, '');
  const hasBuffer = typeof Buffer !== 'undefined' &&
    typeof (Buffer as unknown as { from?: (s: string, enc?: string) => { length: number; byteLength?: number } }).from === 'function';
  if (hasBuffer) {
    try {
      const buf = (Buffer as unknown as { from: (s: string, enc: string) => ArrayBufferLike & { length: number; byteOffset?: number } }).from(
        clean,
        'base64',
      );
      return new Uint8Array(buf as unknown as ArrayBufferLike);
    } catch {
      /* fallback abaixo */
    }
  }
  if (typeof atob === 'function') {
    const binStr = atob(clean);
    const len = binStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i += 1) bytes[i] = binStr.charCodeAt(i);
    return bytes;
  }
  return new Uint8Array(0);
}

function bytesToBase64(bytes: Uint8Array): string {
  if (!bytes || bytes.length === 0) return '';
  const hasBuffer = typeof Buffer !== 'undefined' &&
    typeof (Buffer as unknown as { from?: (b: Uint8Array, enc?: string) => { toString: (enc?: string) => string } }).from === 'function';
  if (hasBuffer) {
    try {
      const buf = (Buffer as unknown as { from: (b: Uint8Array, enc: string) => { toString: (enc: string) => string } }).from(
        bytes,
        'binary',
      );
      return buf.toString('base64');
    } catch {
      /* fallback abaixo */
    }
  }
  if (typeof btoa === 'function') {
    try {
      let binary = '';
      const chunkSize = 0x8000;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode.apply(null, Array.from(chunk) as number[]);
      }
      return btoa(binary);
    } catch {
      /* fallback abaixo */
    }
  }
  try {
    const uint8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes as unknown as ArrayBufferLike);
    const len = uint8.length;
    let out = '';
    const map = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    for (let i = 0; i < len; i += 3) {
      const b1 = uint8[i];
      const b2 = i + 1 < len ? uint8[i + 1] : 0;
      const b3 = i + 2 < len ? uint8[i + 2] : 0;
      const triple = (b1 << 16) | (b2 << 8) | b3;
      out += map[(triple >> 18) & 0x3f];
      out += map[(triple >> 12) & 0x3f];
      out += i + 1 < len ? map[(triple >> 6) & 0x3f] : '=';
      out += i + 2 < len ? map[triple & 0x3f] : '=';
    }
    return out;
  } catch {
    return '';
  }
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  const cached = getCachedBlobBytes(blob);
  if (cached && cached.bytes.length > 0) {
    const base64 = bytesToBase64(cached.bytes);
    return `data:${cached.mime};base64,${base64}`;
  }
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? '');
      try {
        const parsed = base64FromDataUrl(dataUrl);
        if (parsed) cacheBlobBytes(blob, base64ToUint8(parsed.base64), parsed.mime);
      } catch { /* ignore */ }
      resolve(dataUrl);
    };
    reader.onerror = () => reject(reader.error ?? new Error('FileReader erro'));
    reader.readAsDataURL(blob);
  });
}

export function detectImageMimeOrDefault(value: Blob | string | null | undefined, fallback: 'image/png' | 'image/jpeg' = 'image/jpeg'): 'image/png' | 'image/jpeg' {
  if (typeof value === 'string') {
    const v = value.toLowerCase();
    if (v.startsWith('data:image/png')) return 'image/png';
    if (v.startsWith('data:image/jpeg')) return 'image/jpeg';
    return fallback;
  }
  if (value instanceof Blob) {
    const t = (value.type || '').toLowerCase();
    if (t === 'image/png') return 'image/png';
    if (t === 'image/jpeg') return 'image/jpeg';
    return fallback;
  }
  return fallback;
}

export function estimateBlobBytes(value: Blob | unknown): number {
  if (isBlob(value)) return (value as Blob).size;
  if (typeof value === 'string') return new Blob([value]).size;
  return 0;
}

export async function readBlobDimensions(blob: Blob): Promise<{ widthPx: number; heightPx: number }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(blob);
      const { width, height } = bmp;
      try {
        bmp.close?.();
      } catch {
        /* n/a */
      }
      return { widthPx: width, heightPx: height };
    } catch {
      /* fallback abaixo */
    }
  }
  if (typeof Image !== 'undefined' &&
      typeof URL !== 'undefined' &&
      typeof URL.createObjectURL === 'function' &&
      typeof URL.revokeObjectURL === 'function') {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      const cleanup = () => {
        try {
          URL.revokeObjectURL(url);
        } catch {
          /* n/a */
        }
      };
      img.onload = () => {
        const r = { widthPx: img.naturalWidth || img.width || 0, heightPx: img.naturalHeight || img.height || 0 };
        cleanup();
        resolve(r);
      };
      img.onerror = () => {
        cleanup();
        resolve({ widthPx: 0, heightPx: 0 });
      };
      img.src = url;
    });
  }
  return { widthPx: 0, heightPx: 0 };
}

function normalizeBytes(bytesLike: unknown): Uint8Array {
  if (bytesLike instanceof Uint8Array) return bytesLike;
  if (bytesLike instanceof ArrayBuffer) return new Uint8Array(bytesLike);
  if (typeof SharedArrayBuffer !== 'undefined' && bytesLike instanceof SharedArrayBuffer) {
    return new Uint8Array(bytesLike);
  }
  if (bytesLike && typeof bytesLike === 'object' && typeof (bytesLike as { buffer?: unknown }).buffer !== 'undefined') {
    try {
      const view = bytesLike as ArrayBufferView;
      if (typeof view.byteLength === 'number' && typeof view.byteOffset === 'number' && view.buffer) {
        return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
      }
    } catch { /* ignore */ }
  }
  if (bytesLike && typeof bytesLike === 'object') {
    try {
      const len = (bytesLike as { length?: number }).length ?? -1;
      if (len >= 0 && len < 500_000_000) {
        const u8 = new Uint8Array(len);
        const src = bytesLike as Record<number, number>;
        for (let i = 0; i < len; i += 1) {
          u8[i] = (src[i] | 0) & 0xff;
        }
        return u8;
      }
    } catch { /* ignore */ }
  }
  if (Array.isArray(bytesLike)) {
    try {
      return new Uint8Array(bytesLike.map((v) => Number(v ?? 0) & 0xff));
    } catch { /* ignore */ }
  }
  return new Uint8Array(0);
}

export async function blobToUint8Array(blob: Blob): Promise<Uint8Array> {
  if (blob instanceof Uint8Array) return blob;
  const cached = getCachedBlobBytes(blob);
  if (cached && cached.bytes.length > 0) return cached.bytes.slice();
  const asAny = blob as unknown as {
    arrayBuffer?: () => Promise<ArrayBuffer>;
    _buffer?: { buffer: ArrayBufferLike; byteOffset: number; length: number };
    buffer?: ArrayBuffer;
    byteOffset?: number;
    length?: number;
  };
  if (typeof asAny.arrayBuffer === 'function') {
    try {
      const buf = await asAny.arrayBuffer();
      const u8 = new Uint8Array(buf);
      cacheBlobBytes(blob, u8, blob.type || 'application/octet-stream');
      return u8;
    } catch {
      /* fallback abaixo */
    }
  }
  if (asAny._buffer && asAny._buffer.buffer) {
    try {
      return new Uint8Array(asAny._buffer.buffer, asAny._buffer.byteOffset ?? 0, asAny._buffer.length ?? 0);
    } catch {
      /* fallback abaixo */
    }
  }
  try {
    if (typeof Response !== 'undefined') {
      const buf = await new Response(blob).arrayBuffer();
      return new Uint8Array(buf);
    }
  } catch {
    /* fallback abaixo */
  }
  return new Promise<Uint8Array>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const buf = reader.result as ArrayBuffer | null;
      resolve(buf ? new Uint8Array(buf) : new Uint8Array(0));
    };
    reader.onerror = () => reject(reader.error ?? new Error('FileReader erro (blobToUint8Array)'));
    reader.readAsArrayBuffer(blob);
  });
}

export function uint8ArrayToBlob(input: unknown, mime: string): Blob {
  const safeBytes = normalizeBytes(input);
  const m = (mime || 'application/octet-stream').toString();
  const copiedBytes = new Uint8Array(safeBytes.byteLength);
  copiedBytes.set(safeBytes);
  const blob = new Blob([copiedBytes.buffer], { type: m });
  cacheBlobBytes(blob, safeBytes, m);
  return blob;
}

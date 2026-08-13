// Funcoes utilitarias compartilhadas (sem dependencias de DOM)

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function buildId(prefix = 'id'): string {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${t}${r}`;
}

export function sanitizeFilename(name: string, maxLen = 80): string {
  if (!name) return 'unnamed';
  // eslint-disable-next-line no-control-regex
  const safe = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return safe.length > maxLen ? safe.slice(0, maxLen) : safe;
}

export function cmToTwip(cm: number): number {
  return Math.round(cm * 567);
}

export function cmToEmu(cm: number): number {
  return Math.round(cm * 360000);
}

export function escapeHtml(str: string): string {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

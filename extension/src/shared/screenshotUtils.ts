import { SCREENSHOT, ACTION_LABELS } from './constants';
import type { ActionType, InteractionEvent, RecordingStep, TargetElementInfo } from './types';
import { uuidv4 } from './uuid';

const DATA_URL_PREFIX_JPEG = 'data:image/jpeg;base64,';
const DATA_URL_PREFIX_PNG = 'data:image/png;base64,';

export function isDataUrlImage(v: unknown): v is string {
  if (typeof v !== 'string') return false;
  if (v.length > SCREENSHOT.MAX_DATA_URL_LENGTH) return false;
  return v.startsWith(DATA_URL_PREFIX_JPEG) || v.startsWith(DATA_URL_PREFIX_PNG);
}

export function detectDataUrlFormat(dataUrl: string): 'image/png' | 'image/jpeg' {
  if (dataUrl.startsWith(DATA_URL_PREFIX_PNG)) return 'image/png';
  return 'image/jpeg';
}

export function estimateDataUrlBytes(dataUrl: string): number {
  if (typeof dataUrl !== 'string') return 0;
  const comma = dataUrl.indexOf(',');
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const pad = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - pad);
}

export async function compressScreenshotDataUrl(
  input: unknown,
  opts?: {
    maxWidthPx?: number;
    format?: 'image/png' | 'image/jpeg';
    quality?: number;
  },
): Promise<{
  dataUrl: string;
  format: 'image/png' | 'image/jpeg';
  widthPx: number;
  heightPx: number;
  bytes: number;
} | null> {
  if (typeof input !== 'string') return null;
  if (typeof document === 'undefined' || typeof Image !== 'function') {
    if (isDataUrlImage(input)) {
      const format = detectDataUrlFormat(input);
      return {
        dataUrl: input,
        format,
        widthPx: 0,
        heightPx: 0,
        bytes: estimateDataUrlBytes(input),
      };
    }
    return null;
  }
  const maxWidth = opts?.maxWidthPx ?? SCREENSHOT.MAX_WIDTH_PX;
  const format = opts?.format ?? SCREENSHOT.FORMAT;
  const quality = opts?.quality ?? SCREENSHOT.QUALITY;
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error('image decode error'));
      im.src = input;
    });
    if (!img.naturalWidth || !img.naturalHeight) return null;
    let targetWidth = img.naturalWidth;
    let targetHeight = img.naturalHeight;
    if (targetWidth > maxWidth) {
      const ratio = maxWidth / targetWidth;
      targetWidth = maxWidth;
      targetHeight = Math.max(1, Math.round(img.naturalHeight * ratio));
    }
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
    const dataUrl =
      format === 'image/jpeg'
        ? canvas.toDataURL('image/jpeg', quality)
        : canvas.toDataURL('image/png');
    return {
      dataUrl,
      format,
      widthPx: targetWidth,
      heightPx: targetHeight,
      bytes: estimateDataUrlBytes(dataUrl),
    };
  } catch {
    if (isDataUrlImage(input)) {
      const fmt = detectDataUrlFormat(input);
      return {
        dataUrl: input,
        format: fmt,
        widthPx: 0,
        heightPx: 0,
        bytes: estimateDataUrlBytes(input),
      };
    }
    return null;
  }
}

function friendlyRoleOrTag(t: TargetElementInfo): string {
  const role = (t.role ?? '').toLowerCase().trim();
  if (role) {
    switch (role) {
      case 'button':
        return 'botão';
      case 'link':
        return 'link';
      case 'checkbox':
        return 'checkbox';
      case 'radio':
        return 'radio';
      case 'textbox':
        return 'campo de texto';
      case 'searchbox':
        return 'campo de busca';
      case 'combobox':
        return 'combobox';
      case 'tab':
        return 'aba';
      case 'menuitem':
        return 'item de menu';
      default:
        return role;
    }
  }
  const tag = (t.tagName ?? '').toLowerCase().trim();
  switch (tag) {
    case 'button':
      return 'botão';
    case 'a':
      return 'link';
    case 'input': {
      const tp = (t.fieldType ?? '').toLowerCase();
      if (tp === 'submit' || tp === 'button' || tp === 'reset') return 'botão';
      if (tp === 'checkbox') return 'checkbox';
      if (tp === 'radio') return 'radio';
      if (tp === 'email') return 'campo de e-mail';
      if (tp === 'password') return 'campo de senha';
      if (tp === 'search') return 'campo de busca';
      if (tp === 'tel') return 'campo de telefone';
      if (tp === 'number') return 'campo numérico';
      return 'campo de texto';
    }
    case 'select':
      return 'combobox';
    case 'textarea':
      return 'área de texto';
    case 'label':
      return 'rótulo';
    case 'img':
      return 'imagem';
    case 'li':
      return 'item de lista';
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6':
      return 'título';
    case 'td':
    case 'th':
      return 'célula de tabela';
    default:
      return tag || 'elemento';
  }
}

function bestElementName(t: TargetElementInfo): string | null {
  const candidates = [t.accessibleName, t.ariaLabel, t.visibleText, t.title, t.id];
  for (const c of candidates) {
    const v = (c ?? '').replace(/\s+/g, ' ').trim();
    if (v.length >= 1 && v.length <= 120) return v;
  }
  return null;
}

function actionVerbFor(action: ActionType, inputSource: InteractionEvent['inputSource']): string {
  if (action === 'tap' || inputSource === 'touch') return 'Tocar';
  if (inputSource === 'pen' || action === 'press') return 'Pressionar';
  return 'Clicar';
}

export function buildAutomaticDescription(
  interaction: Pick<InteractionEvent, 'inputSource'> & {
    target: TargetElementInfo;
    actionType?: ActionType;
  },
): string {
  const action = interaction.actionType ?? 'click';
  const verb = actionVerbFor(action, interaction.inputSource);
  const kind = friendlyRoleOrTag(interaction.target);
  const name = bestElementName(interaction.target);
  const _label = ACTION_LABELS[action] ?? 'interacao';
  void _label;
  if (name) {
    return `${verb} no ${kind} “${name}”.`;
  }
  return `${verb} no ${kind}.`;
}

export function actionTypeFromInputSource(src: InteractionEvent['inputSource']): ActionType {
  switch (src) {
    case 'touch':
      return 'tap';
    case 'pen':
      return 'press';
    case 'mouse':
      return 'click';
    default:
      return 'unknown';
  }
}

export interface BuildStepParams {
  interaction: InteractionEvent;
  screenshotDataUrl: string;
  sequence: number;
  tabId?: number | null;
  sessionId?: string;
  compressed?: {
    dataUrl: string;
    format: 'image/png' | 'image/jpeg';
    widthPx: number;
    heightPx: number;
    bytes: number;
  } | null;
}

export function buildRecordingStep(p: BuildStepParams): RecordingStep | null {
  if (!p.interaction?.interactionId) return null;
  if (!isDataUrlImage(p.screenshotDataUrl) && !p.compressed) return null;
  const compressed = p.compressed ?? {
    dataUrl: p.screenshotDataUrl,
    format: detectDataUrlFormat(p.screenshotDataUrl),
    widthPx: 0,
    heightPx: 0,
    bytes: estimateDataUrlBytes(p.screenshotDataUrl),
  };
  const actionType = actionTypeFromInputSource(p.interaction.inputSource);
  const description = buildAutomaticDescription({ ...p.interaction, actionType });
  const sessionId = p.sessionId ?? p.interaction.sessionId ?? '';
  if (!sessionId) return null;
  const step: RecordingStep = {
    stepId: uuidv4(),
    sessionId,
    sequence: Number.isFinite(p.sequence) && p.sequence > 0 ? p.sequence : 1,
    actionType,
    interactionId: p.interaction.interactionId,
    target: p.interaction.target,
    viewportPoint: p.interaction.viewportPoint,
    elementRect: p.interaction.elementRect,
    url: p.interaction.url,
    pageTitle: p.interaction.pageTitle,
    viewportSize: p.interaction.viewportSize,
    devicePixelRatio: p.interaction.devicePixelRatio,
    stableSelector: p.interaction.stableSelector,
    inputSource: p.interaction.inputSource,
    screenshotDataUrl: compressed.dataUrl,
    screenshotFormat: compressed.format,
    screenshotWidthPx: compressed.widthPx,
    screenshotHeightPx: compressed.heightPx,
    screenshotSizeBytes: compressed.bytes,
    description,
    timestamp: p.interaction.timestamp,
    tabId: p.tabId ?? null,
    isTrusted: p.interaction.isTrusted,
  };
  return step;
}

export const _priv = {
  friendlyRoleOrTag,
  bestElementName,
  actionVerbFor,
  actionTypeFromInputSource,
};

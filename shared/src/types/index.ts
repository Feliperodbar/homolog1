// Tipos compartilhados entre painel web, extensao e backend
export type Id = string;

export type Point2D = { x: number; y: number };
export type Size2D = { width: number; height: number };
export type Rect2D = Point2D & Size2D;

export type CaptureMode = 'click' | 'select' | 'area';
export type StepOrigin =
  'USER_CLICK' | 'MANUAL_BUTTON' | 'TRIGGER_API' | 'HOTKEY' | 'EXTENSION_AUTO';

export interface ProjectData {
  projectName?: string;
  frontName?: string;
  distributorName?: string;
  responsible?: string;
  projectDate?: string;
  expectedResult?: string;
}

export interface StepV1 {
  id: string;
  title: string;
  description: string;
  tag?: string;
  imageDataUrl: string;
  createdAt: number;
  clickPoint?: Point2D | null;
}

export interface HighlightConfig {
  showArrow: boolean;
  showCircle: boolean;
  color: string;
  radius: number;
}

export interface BlobRef {
  store: 'indexed-db' | 'chrome-storage' | 'local-storage';
  key: string;
  sizeBytes: number;
  mimeType: string;
  sha256Hash?: string;
}

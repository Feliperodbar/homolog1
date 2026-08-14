export const DB_NAME = 'homolog_main_v1';
export const DB_VERSION = 2;

export interface HomologScreenshotPersistedV2 {
  readonly screenshotId: ScreenshotId;
  readonly stepId: StepId;
  readonly sessionId: SessionId;
  readonly projectId: ProjectId;
  imageBytes: Uint8Array;
  imageMime: string;
  format: 'image/png' | 'image/jpeg';
  widthPx: number;
  heightPx: number;
  sizeBytes: number;
  createdAt: number;
}

export const STORE = {
  PROJECTS: 'projects',
  SESSIONS: 'sessions',
  STEPS: 'steps',
  SCREENSHOTS: 'screenshots',
  SETTINGS: 'settings',
} as const;

export const STORE_LIST = [
  STORE.PROJECTS,
  STORE.SESSIONS,
  STORE.STEPS,
  STORE.SCREENSHOTS,
  STORE.SETTINGS,
] as const;

export const INDEX = {
  SESSIONS_BY_PROJECT: 'by_projectId_createdAt',
  STEPS_BY_SESSION: 'by_sessionId_sequence',
  STEPS_BY_SESSION_CREATED: 'by_sessionId_createdAt',
  SCREENSHOTS_BY_STEP: 'by_stepId',
} as const;

export type ProjectId = string;
export type SessionId = string;
export type StepId = string;
export type ScreenshotId = string;
export type SettingsKey =
  | 'migration.v1.completedAt'
  | 'migration.v1.source.hash'
  | 'ui.lastOpened.projectId'
  | 'ui.lastOpened.sessionId'
  | 'ui.theme';

export interface HomologProject {
  readonly projectId: ProjectId;
  name: string;
  description?: string | null;
  color?: string | null;
  createdAt: number;
  updatedAt: number;
  archivedAt?: number | null;
  metadata?: Record<string, unknown>;
}

export interface HomologSession {
  readonly sessionId: SessionId;
  readonly projectId: ProjectId;
  name: string;
  description?: string | null;
  state: 'idle' | 'recording' | 'paused' | 'finalized';
  tabId: number | null;
  stepCount: number;
  startedAt: number | null;
  endedAt: number | null;
  createdAt: number;
  updatedAt: number;
  durationMs: number;
  metadata?: Record<string, unknown>;
}

export interface HomologStep {
  readonly stepId: StepId;
  readonly sessionId: SessionId;
  readonly projectId: ProjectId;
  sequence: number;
  actionType: 'click' | 'tap' | 'press' | 'unknown';
  interactionId: string;
  readonly screenshotId: ScreenshotId | null;
  target: Record<string, unknown>;
  stableSelector?: string | null;
  url: string;
  pageTitle: string;
  viewportPoint: { x: number; y: number };
  elementRect: { x: number; y: number; width: number; height: number };
  viewportSize: { width: number; height: number };
  devicePixelRatio: number;
  description: string;
  timestamp: number;
  inputSource: 'mouse' | 'touch' | 'pen' | 'unknown';
  tabId: number | null;
  isTrusted: boolean;
  metadata?: Record<string, unknown>;
}

export interface HomologScreenshot {
  readonly screenshotId: ScreenshotId;
  readonly stepId: StepId;
  readonly sessionId: SessionId;
  readonly projectId: ProjectId;
  image: Blob;
  format: 'image/png' | 'image/jpeg';
  widthPx: number;
  heightPx: number;
  sizeBytes: number;
  createdAt: number;
}

export interface HomologSettingEntry<T = unknown> {
  readonly key: SettingsKey;
  value: T;
  updatedAt: number;
}

export type SaveIndicatorStatus = 'idle' | 'saving' | 'saved' | 'error';
export interface SaveIndicatorSnapshot {
  status: SaveIndicatorStatus;
  pendingCount: number;
  lastSavedAt: number | null;
  lastError?: string | null;
}

export interface HomologBackupV1 {
  schema: 'homolog-backup';
  schemaVersion: 1;
  exportedAt: number;
  projects: Array<HomologProject>;
  sessions: Array<HomologSession>;
  steps: Array<HomologStep>;
  screenshotsMeta: Array<Omit<HomologScreenshot, 'image'> & { imageDataUrl?: string }>;
  settings: Array<HomologSettingEntry>;
}

export interface MigrationResult {
  ok: boolean;
  migratedProjects: number;
  migratedSessions: number;
  migratedSteps: number;
  migratedScreenshots: number;
  skippedLegacyEmpty: boolean;
  errors: Array<string>;
  completedAt?: number;
}

export interface FullProjectTree {
  project: HomologProject;
  sessions: Array<
    HomologSession & {
      steps: Array<HomologStep & { screenshot?: HomologScreenshot | null }>;
    }
  >;
}

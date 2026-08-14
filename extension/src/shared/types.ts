export type RecordingState = 'idle' | 'recording' | 'paused' | 'finalized';

export interface RecordingSession {
  sessionId: string;
  state: RecordingState;
  tabId: number | null;
  stepCount: number;
  startedAt: number | null;
  pausedAt: number | null;
  endedAt: number | null;
  lastUpdatedAt: number;
}

export interface PopupViewState {
  session: RecordingSession;
  isCurrentTabRecorded: boolean;
  isInRestrictedPage: boolean;
  restrictedReason?: string;
}

export type Transition = 'START' | 'PAUSE' | 'RESUME' | 'FINALIZE' | 'INCREMENT_STEP' | 'RESET';

export interface TransitionResult {
  session: RecordingSession;
  changed: boolean;
  reason?: string;
}

export interface Point2D {
  x: number;
  y: number;
}

export interface RectInfo {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type FieldSensitivity = 'none' | 'password' | 'sensitive';

export interface TargetElementInfo {
  tagName: string;
  visibleText: string;
  accessibleName: string;
  ariaLabel: string | null;
  title: string | null;
  id: string | null;
  name: string | null;
  role: string | null;
  fieldType: string | null;
  value: string | null;
  sensitivity: FieldSensitivity;
}

export interface InteractionEvent {
  interactionId: string;
  sessionId: string | null;
  target: TargetElementInfo;
  viewportPoint: Point2D;
  elementRect: RectInfo;
  url: string;
  pageTitle: string;
  viewportSize: { width: number; height: number };
  devicePixelRatio: number;
  timestamp: number;
  stableSelector: string;
  inputSource: 'mouse' | 'touch' | 'pen' | 'unknown';
  isTrusted: boolean;
}

export type ActionType = 'click' | 'tap' | 'press' | 'unknown';

export interface RecordingStep {
  stepId: string;
  sessionId: string;
  sequence: number;
  actionType: ActionType;
  interactionId: string;
  target: TargetElementInfo;
  viewportPoint: Point2D;
  elementRect: RectInfo;
  url: string;
  pageTitle: string;
  viewportSize: { width: number; height: number };
  devicePixelRatio: number;
  stableSelector: string;
  inputSource: 'mouse' | 'touch' | 'pen' | 'unknown';
  screenshotDataUrl: string;
  screenshotFormat: 'image/png' | 'image/jpeg';
  screenshotWidthPx: number;
  screenshotHeightPx: number;
  screenshotSizeBytes: number;
  description: string;
  timestamp: number;
  tabId: number | null;
  isTrusted: boolean;
}

export type RuntimeMessageType =
  | 'GET_STATE'
  | 'START'
  | 'PAUSE'
  | 'RESUME'
  | 'FINALIZE'
  | 'INCREMENT_STEP'
  | 'RESET'
  | '__RECORD_INTERACTION__'
  | '__REQUEST_SCREENSHOT__'
  | '__STATE_CHANGED__'
  | '__STEP_RECORDED__'
  | '__GET_LAST_INTERACTION__'
  | '__GET_LAST_STEP__'
  | '__LIST_STEPS__'
  | '__GET_MY_TAB_ID__'
  | '__INTERACTION_RECORDED__';

export interface RuntimeMessage {
  type: RuntimeMessageType;
  payload?: Record<string, unknown>;
}

export interface RuntimeResponse {
  ok: boolean;
  state?: RecordingSession;
  lastInteraction?: InteractionEvent;
  lastStep?: RecordingStep;
  steps?: Array<RecordingStep>;
  tabId?: number;
  error?: string;
}

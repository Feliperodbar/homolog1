export const STORAGE_KEY_RECORDING = 'homolog_recording_v1';
export const STORAGE_KEY_LAST_INTERACTION = 'homolog_last_interaction_v1';
export const STORAGE_KEY_STEPS = 'homolog_steps_v1';
export const STORAGE_KEY_LAST_STEP = 'homolog_last_step_v1';
export const STORAGE_KEY_ACTIVE_PROJECT_ID = 'homolog_active_project_id_v1';
export const STORAGE_KEY_ACTIVE_SESSION_ID = 'homolog_active_session_id_v1';
export const STORAGE_KEY_IDB_MIGRATION_DONE = 'homolog_idb_migration_done_v1';

export const CHROME_MESSAGE_TIMEOUT_MS = 1500;

export const SCREENSHOT = {
  FORMAT: 'image/jpeg' as const,
  QUALITY: 0.82,
  MAX_WIDTH_PX: 1920,
  TIMEOUT_MS: 4000,
  MIN_INTERVAL_BETWEEN_CAPTURES_MS: 350,
  POINTER_MARKER_ID: '__homolog_click_marker__',
  POINTER_MARKER_RADIUS_PX: 18,
  POINTER_MARKER_DURATION_MS: 1200,
  MAX_STEPS_IN_STORAGE: 200,
  MAX_DATA_URL_LENGTH: 4 * 1024 * 1024,
} as const;

export const ACTION_LABELS: Readonly<Record<string, string>> = {
  click: 'clique',
  tap: 'toque',
  press: 'pressionar',
  unknown: 'interacao',
};

export const HOMOLOG_PANEL_DEFAULT_URL = 'https://github.com/Feliperodbar/homolog1';

export const RESTRICTED_URL_PATTERNS: ReadonlyArray<RegExp> = [
  /^chrome:\/\//i,
  /^edge:\/\//i,
  /^about:/i,
  /^view-source:/i,
  /^devtools:/i,
  /^chrome-search:/i,
  /^chrome-untrusted:/i,
];

export const RESTRICTED_HOSTNAMES: ReadonlyArray<string> = [
  'chrome.google.com',
  'chromewebstore.google.com',
  'microsoftedge.microsoft.com',
  'addons.mozilla.org',
  'addons.opera.com',
  'addons.chromium.org',
];

export const RESTRICTED_PAGE_REASONS: Readonly<Record<string, string>> = {
  internal:
    'Esta é uma página interna do navegador. A gravação de passos não é permitida aqui por motivos de segurança.',
  webstore:
    'Esta página é uma loja de extensões. Por restrições do navegador, extensões não funcionam aqui.',
};

export const STATE_LABELS: Readonly<Record<string, string>> = {
  idle: 'Pronto',
  recording: 'Gravando',
  paused: 'Pausado',
  finalized: 'Finalizado',
};

export const DEDUPLICATION = {
  INTERACTION_WINDOW_MS: 250,
  POSITION_TOLERANCE_PX: 6,
  DOUBLE_CLICK_WINDOW_MS: 350,
  TEXT_MAX_LENGTH: 240,
  SELECTOR_MAX_LENGTH: 320,
} as const;

export const SENSITIVE_AUTOCOMPLETE_TOKENS: ReadonlyArray<string> = [
  'password',
  'new-password',
  'current-password',
  'cc-number',
  'cc-csc',
  'cc-cvv',
  'cc-exp',
  'cc-exp-month',
  'cc-exp-year',
  'off',
];

export const SENSITIVE_INPUT_TYPES: ReadonlyArray<string> = ['password'];

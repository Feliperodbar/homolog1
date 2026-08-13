// Constantes compartilhadas
export const STORAGE_KEY_STEPS = 'homolog_steps_v1';
export const STORAGE_KEY_PROJECT_DATA = 'homolog_project_data_v1';
export const STORAGE_KEY_SESSION = 'homolog_session_v1';

export const EXPORT_IMAGE_WIDTH_CM = 20.23;
export const EXPORT_IMAGE_HEIGHT_CM = 9.28;
export const DOCX_PAGE_WIDTH_CM = 21.0;
export const DOCX_PAGE_HEIGHT_CM = 29.7;
export const DOCX_PAGE_MARGIN_CM = 2.0;
export const DOCX_IMAGE_MAX_WIDTH_CM = DOCX_PAGE_WIDTH_CM - DOCX_PAGE_MARGIN_CM * 2;
export const DOCX_IMAGE_MAX_HEIGHT_CM = 10;

export const DEFAULT_HIGHLIGHT = {
  showArrow: true,
  showCircle: true,
  color: '#ef4444',
  radius: 18,
} as const;

export const DEFAULT_DEBOUNCE_MS = 200;
export const DEFAULT_IMAGE_QUALITY = 0.9;
export const DEFAULT_OCR_LANGS = 'por+eng';

export const BACKEND_BASE_DEFAULT = 'http://localhost:8010';

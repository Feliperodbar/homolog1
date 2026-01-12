/**
 * Homolog — Criador de Passos de Teste
 * 
 * Aplicação para capturar e documentar passos de teste com screenshots.
 * Divide a funcionalidade em módulos para melhor manutenibilidade.
 */

// ===== Imports =====
import * as storage from './modules/storage.js';
import * as ui from './modules/ui.js';
import * as capture from './modules/capture.js';
import * as stepsModule from './modules/steps.js';
import * as ocr from './modules/ocr.js';
import * as exp from './modules/export.js';
import * as backend from './modules/backend.js';

// ===== Estado =====
let steps = [];
let lastTriggerTs = 0;
let projectData = {};
let captureMode = 'click'; // 'click' | 'select'
let showArrowOnCapture = false; // Controla se a seta aparece na captura

// ===== Inicialização =====
document.addEventListener('DOMContentLoaded', async () => {
  // Detectar preferência de movimento reduzido
  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  function applyMotionPreference(e) {
    const reduced = !!e.matches;
    document.documentElement.setAttribute('data-reduced-motion', reduced ? 'true' : 'false');
  }
  applyMotionPreference(reducedMotionQuery);
  try {
    reducedMotionQuery.addEventListener('change', applyMotionPreference);
  } catch { }

  // Carregar passos persistidos
  steps = storage.load();
  projectData = storage.loadProjectData();
  
  // Carregar dados do projeto nos inputs
  loadProjectDataToForm();
  renderSteps();

  // Conectar botões
  setupEventListeners();
    const clearProjectBtn = document.getElementById('clearProjectBtn');
    if (clearProjectBtn) {
      clearProjectBtn.addEventListener('click', clearProjectData);
    }

  // Iniciar polling de triggers
  startTriggerPolling();

  ui.setStatus('Pronto');
});

// ===== Event Listeners =====
function setupEventListeners() {
  const startBtn = document.getElementById('startCaptureBtn');
  const stopBtn = document.getElementById('stopCaptureBtn');
  const addBtn = document.getElementById('addStepBtn');
  const downloadHtmlBtn = document.getElementById('downloadHtmlBtn');
  const downloadDocxBtn = document.getElementById('downloadDocxBtn');
  const toggleExpandBtn = document.getElementById('toggleExpandBtn');
  const modeClickBtn = document.getElementById('modeClickBtn');
  const modeSelectBtn = document.getElementById('modeSelectBtn');
  const clearBtn = document.getElementById('clearStepsBtn');
  const prevStepBtn = document.getElementById('prevStepBtn');
  const nextStepBtn = document.getElementById('nextStepBtn');
  const videoEl = document.getElementById('screenVideo');

  if (startBtn) startBtn.addEventListener('click', handleStartCapture);
  if (stopBtn) stopBtn.addEventListener('click', handleStopCapture);
  if (addBtn) addBtn.addEventListener('click', handleAddStep);
  if (downloadHtmlBtn) downloadHtmlBtn.addEventListener('click', () => exp.downloadHtml(steps, projectData));
  if (downloadDocxBtn) downloadDocxBtn.addEventListener('click', handleDownloadDocx);
  if (toggleExpandBtn) {
    toggleExpandBtn.addEventListener('click', ui.toggleFullscreenCapture);
    document.addEventListener('fullscreenchange', ui.updateExpandButtonLabel);
  }
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (confirm('Tem certeza que deseja limpar todos os passos?')) {
        steps = [];
        renderSteps();
        storage.persist(steps);
      }
    });
  }
  
  // Listener para checkbox de seta
  const showArrowCheckbox = document.getElementById('showArrowCheckbox');
  if (showArrowCheckbox) {
    showArrowCheckbox.addEventListener('change', (e) => {
      showArrowOnCapture = e.target.checked;
    });
  }
  
  if (prevStepBtn) prevStepBtn.addEventListener('click', () => stepsModule.scrollCarouselLeft());
  if (nextStepBtn) nextStepBtn.addEventListener('click', () => stepsModule.scrollCarouselRight());
  
  // Listener para atualizar botões de navegação quando scroll mudar
  const stepsList = document.getElementById('stepsList');
  if (stepsList) {
    stepsList.addEventListener('scroll', () => {
      const hasScroll = stepsList.scrollWidth > stepsList.clientWidth;
      if (prevStepBtn) prevStepBtn.disabled = !hasScroll || stepsList.scrollLeft === 0;
      if (nextStepBtn) nextStepBtn.disabled = !hasScroll || (stepsList.scrollLeft + stepsList.clientWidth >= stepsList.scrollWidth - 10);
    });
  }
  
  if (videoEl) {
    videoEl.addEventListener('click', handleVideoClick);
  }
  if (modeClickBtn && modeSelectBtn) {
    modeClickBtn.addEventListener('click', () => setCaptureMode('click'));
    modeSelectBtn.addEventListener('click', () => setCaptureMode('select'));
      // Inicializa legenda de modo abaixo dos botões
      setCaptureMode('click');
  }

  // Conectar campos de dados do projeto
  setupProjectDataListeners();
}

// ===== Handlers =====

/**
 * Inicia captura de tela
 */
async function handleStartCapture() {
  await capture.startCapture();
}

/**
 * Para captura de tela
 */
function handleStopCapture() {
  capture.stopCapture();
}

/**
 * Adiciona passo simples (sem detecção de local)
 */
async function handleAddStep() {
  const mediaStream = capture.getMediaStream();
  if (!mediaStream) {
    ui.showToast('Inicie a captura para criar passos');
    return;
  }

  await capture.ensureVideoReady();
  const image = capture.captureScreenshot(null, showArrowOnCapture);
  if (!image) {
    ui.showToast('Não foi possível capturar a tela');
    return;
  }

  const step = stepsModule.createStep(image, {
    title: `Passo #${steps.length + 1} — ${new Date().toLocaleString('pt-BR')}`,
    description: 'Descreva a ação realizada, o objetivo e o resultado esperado.',
  });

  steps.push(step);
  renderSteps();
  storage.persist(steps);
  ui.showToast('Passo adicionado');
}

/**
 * Inicia fluxo de seleção e cria passo recortado
 */
async function startSelectionFlow() {
  const mediaStream = capture.getMediaStream();
  const video = document.getElementById('screenVideo');
  if (!mediaStream || !video) {
    ui.showToast('Inicie a captura para selecionar área');
    return;
  }
  await capture.ensureVideoReady();

  ui.startAreaSelection({
    targetEl: video,
    onComplete: (clientRect) => {
      const rect = clientRectToVideoRect(video, clientRect);
      const image = capture.captureScreenshotRegion(rect);
      if (!image) {
        ui.showToast('Falha ao recortar área');
        return;
      }
      const step = stepsModule.createStep(image, {
        title: `Área selecionada (${Math.round(rect.x)}, ${Math.round(rect.y)}) ${Math.round(rect.width)}x${Math.round(rect.height)}`,
        description: 'Descreva a ação realizada na área selecionada.',
      });
      steps.push(step);
      renderSteps();
      storage.persist(steps);
      ui.showToast('Passo criado pela seleção de área');
    }
  });
}

/**
 * Deleta passo
 */
function handleStepDelete(id) {
  const deletedIndex = steps.findIndex(s => s.id === id);
  steps = stepsModule.removeStep(steps, id);

  renderSteps();
  storage.persist(steps);
}

/**
 * Atualiza campo de passo
 */
function handleStepUpdate(id, field, value) {
  steps = stepsModule.updateStep(steps, id, field, value);
  storage.persist(steps);
}

/**
 * Manipula clique no vídeo
 */
async function handleVideoClick(e) {
  const mediaStream = capture.getMediaStream();
  if (!mediaStream) {
    ui.showToast('Inicie a captura para criar passos');
    return;
  }

  if (captureMode === 'select') {
    // No modo seleção, iniciar fluxo de seleção (não usar modo clique)
    e.preventDefault();
    e.stopPropagation();
    await startSelectionFlow();
    return;
  }

  // Modo clicar: cria passo com destaque e OCR
  const video = document.getElementById('screenVideo');
  const coords = getVideoFrameCoordsFromClient(video, e.clientX, e.clientY);
  if (!coords) {
    ui.showToast('Clique dentro do vídeo');
    return;
  }
  await addStepWithHighlight(coords);
}

/**
 * Download DOCX (com fallback para HTML)
 */
async function handleDownloadDocx() {
  try {
    await exp.downloadDocx(steps, projectData);
  } catch (e) {
    exp.downloadHtml(steps, projectData);
  }
}

// ===== Funções Auxiliares =====

/**
 * Renderiza a lista de passos
 */
function renderSteps() {
  stepsModule.renderSteps(steps, {
    onDelete: handleStepDelete,
    onUpdate: handleStepUpdate,
    onImageClick: ui.openImageModal,
  });
}

/**
 * Converte coordenadas do cliente para coordenadas do frame de vídeo
 */
function getVideoFrameCoordsFromClient(video, clientX, clientY) {
  if (!video) return null;

  const rect = video.getBoundingClientRect();
  const relX = clientX - rect.left;
  const relY = clientY - rect.top;

  if (relX < 0 || relY < 0 || relX > rect.width || relY > rect.height) return null;

  const scaleX = video.videoWidth / rect.width;
  const scaleY = video.videoHeight / rect.height;

  return {
    x: Math.round(relX * scaleX),
    y: Math.round(relY * scaleY),
  };
}

/**
 * Converte retângulo em coordenadas do cliente para coordenadas de frame de vídeo
 */
function clientRectToVideoRect(video, clientRect) {
  const bounds = video.getBoundingClientRect();
  const scaleX = video.videoWidth / bounds.width;
  const scaleY = video.videoHeight / bounds.height;
  const x = Math.round(clientRect.x * scaleX);
  const y = Math.round(clientRect.y * scaleY);
  const width = Math.round(clientRect.width * scaleX);
  const height = Math.round(clientRect.height * scaleY);
  return { x, y, width, height };
}

/**
 * Adiciona passo com detecção de clique via OCR
 */
async function addStepWithHighlight(coords) {
  const video = document.getElementById('screenVideo');
  await capture.ensureVideoReady();

  const image = capture.captureScreenshot(coords, showArrowOnCapture);
  if (!image) return;

  const step = stepsModule.createStep(image, {
    title: `Clicado no ponto (${coords.x}, ${coords.y})`,
    description: '',
  });

  steps.push(step);
  renderSteps();
  storage.persist(steps);

  // Tentar sugerir rótulo via OCR
  try {
    const suggestion = await ocr.suggestLabelFromVideo(video, coords);
    const label = ocr.sanitizeLabel(suggestion);

    if (label) {
      const lastStep = steps[steps.length - 1];
      steps = stepsModule.updateStep(steps, lastStep.id, 'title', label);
      steps = stepsModule.updateStep(steps, lastStep.id, 'tag', label);
      steps = stepsModule.updateStep(steps, lastStep.id, 'description', buildDefaultDescription(label, coords));
      renderSteps();
      storage.persist(steps);
      ui.showToast(`Clicado em ${label}`);
    } else {
      const lastStep = steps[steps.length - 1];
      steps = stepsModule.updateStep(steps, lastStep.id, 'description', buildDefaultDescription(null, coords));
      storage.persist(steps);
      ui.showToast('Passo criado pelo clique');
    }
  } catch (e) {
    console.warn('Falha ao processar OCR:', e);
    ui.showToast('Passo criado (OCR indisponível)');
  }
}

/**
 * Constrói descrição padrão para passo
 */
function buildDefaultDescription(label, coords) {
  const hasCoords = coords && typeof coords.x === 'number' && typeof coords.y === 'number';
  const pos = hasCoords ? ` (${coords.x}, ${coords.y})` : '';

  if (label) {
    return `Clique no item "${label}"${pos} para executar a ação pretendida. Descreva o objetivo, os passos e o resultado esperado.`;
  }

  return `Clique na área indicada${pos}. Descreva o objetivo, os passos e o resultado esperado.`;
}

/**
 * Inicia polling do servidor para triggers de captura
 */
function startTriggerPolling() {
  setInterval(async () => {
    try {
      const data = await backend.getTriggerState();
      if (!data?.ts || data.ts <= lastTriggerTs) return;

      lastTriggerTs = data.ts;

      const mediaStream = capture.getMediaStream();
      if (!mediaStream) return;

      const x = typeof data.x === 'number' ? data.x : null;
      const y = typeof data.y === 'number' ? data.y : null;

      if (x != null && y != null) {
        await addStepWithHighlight({ x, y });
      } else {
        await handleAddStep();
      }
    } catch (e) {
      console.warn('Polling falhou:', e);
    }
  }, 1000);
}

// ===== Project Data =====

/**
 * Configura listeners para campos de dados do projeto
 */
function setupProjectDataListeners() {
  const fields = ['projectName', 'frontName', 'distributorName', 'responsible', 'projectDate', 'expectedResult'];
  
  fields.forEach(fieldId => {
    const element = document.getElementById(fieldId);
    if (element) {
      element.addEventListener('input', (e) => {
        projectData[fieldId] = e.target.value;
        storage.persistProjectData(projectData);
      });
      
      element.addEventListener('change', (e) => {
        projectData[fieldId] = e.target.value;
        storage.persistProjectData(projectData);
      });
    }
  });
}

/**
 * Carrega dados do projeto nos campos do formulário
 */
function loadProjectDataToForm() {
  const fields = ['projectName', 'frontName', 'distributorName', 'responsible', 'projectDate', 'expectedResult'];
  
  fields.forEach(fieldId => {
    const element = document.getElementById(fieldId);
    if (element && projectData[fieldId]) {
      element.value = projectData[fieldId];
    }
  });
}

/**
 * Limpa campos de Dados do Projeto e persiste
 */
function clearProjectData() {
  const fields = ['projectName', 'frontName', 'distributorName', 'responsible', 'projectDate', 'expectedResult'];
  fields.forEach(fieldId => {
    const el = document.getElementById(fieldId);
    if (el) el.value = '';
    projectData[fieldId] = '';
  });
  storage.persistProjectData(projectData);
  ui.showToast('Campos de projeto limpos');
}

// ===== Modo de captura =====
function setCaptureMode(mode) {
  if (mode !== 'click' && mode !== 'select') return;
  captureMode = mode;
  const clickBtn = document.getElementById('modeClickBtn');
  const selectBtn = document.getElementById('modeSelectBtn');
  if (clickBtn && selectBtn) {
    const isClick = captureMode === 'click';
    clickBtn.classList.toggle('active', isClick);
    selectBtn.classList.toggle('active', !isClick);
    clickBtn.setAttribute('aria-pressed', String(isClick));
    selectBtn.setAttribute('aria-pressed', String(!isClick));
  }
  ui.setStatus(mode === 'click' ? 'Modo: clicar para capturar' : 'Modo: seleção de área');
  const modeInlineCaption = document.getElementById('modeInlineCaption');
  if (modeInlineCaption) {
    const isSelect = mode === 'select';
    modeInlineCaption.textContent = isSelect ? 'Seleção de área' : '';
    modeInlineCaption.classList.toggle('hidden', !isSelect);
  }
}

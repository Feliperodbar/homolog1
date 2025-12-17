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
let carouselIndex = 0;
let projectData = {};

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
  carouselIndex = 0;
  
  // Carregar dados do projeto nos inputs
  loadProjectDataToForm();
  renderSteps();

  // Conectar botões
  setupEventListeners();

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
  const clearBtn = document.getElementById('clearStepsBtn');
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
        carouselIndex = 0;
        renderSteps();
        storage.persist(steps);
      }
    });
  }
  if (videoEl) {
    videoEl.addEventListener('click', handleVideoClick);
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
  const image = capture.captureScreenshot();
  if (!image) {
    ui.showToast('Não foi possível capturar a tela');
    return;
  }

  const step = stepsModule.createStep(image, {
    title: `Passo #${steps.length + 1} — ${new Date().toLocaleString('pt-BR')}`,
    description: 'Descreva a ação realizada, o objetivo e o resultado esperado.',
  });

  steps.push(step);
  carouselIndex = steps.length - 1; // Ir para o novo passo
  renderSteps();
  storage.persist(steps);
  ui.showToast('Passo adicionado');
}

/**
 * Deleta passo
 */
function handleStepDelete(id) {
  const deletedIndex = steps.findIndex(s => s.id === id);
  steps = stepsModule.removeStep(steps, id);

  // Ajustar índice do carrossel
  if (steps.length === 0) {
    carouselIndex = 0;
  } else if (carouselIndex >= steps.length) {
    carouselIndex = steps.length - 1;
  }

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
 * Renderiza a lista de passos com gerenciamento de carrossel
 */
function renderSteps() {
  stepsModule.renderSteps(steps, {
    onDelete: handleStepDelete,
    onUpdate: handleStepUpdate,
    onImageClick: ui.openImageModal,
    onNavigate: handleCarouselNavigate,
  }, carouselIndex);
}

/**
 * Navega para o próximo ou anterior passo no carrossel
 */
function handleCarouselNavigate(direction) {
  const newIndex = carouselIndex + direction;
  if (newIndex >= 0 && newIndex < steps.length) {
    carouselIndex = newIndex;
    renderSteps();
  }
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
 * Adiciona passo com detecção de clique via OCR
 */
async function addStepWithHighlight(coords) {
  const video = document.getElementById('screenVideo');
  await capture.ensureVideoReady();

  const image = capture.captureScreenshot(coords);
  if (!image) return;

  const step = stepsModule.createStep(image, {
    title: `Clicado no ponto (${coords.x}, ${coords.y})`,
    description: '',
  });

  steps.push(step);
  carouselIndex = steps.length - 1; // Ir para o novo passo
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

const els = {
  start: document.getElementById('startCaptureBtn'),
  stop: document.getElementById('stopCaptureBtn'),
  add: document.getElementById('addStepBtn'),
  exportHtml: document.getElementById('exportHtmlBtn'),
  toggleExpand: document.getElementById('toggleExpandBtn'),
  copyMd: document.getElementById('copyMdBtn'),
  downloadMd: document.getElementById('downloadMdBtn'),
  downloadHtml: document.getElementById('downloadHtmlBtn'),
  clear: document.getElementById('clearStepsBtn'),
  video: document.getElementById('screenVideo'),
  videoWrapper: document.getElementById('videoWrapper'),
  overlay: document.getElementById('videoOverlay'),
  steps: document.getElementById('stepsList'),
  logs: document.getElementById('logsList'),
  toast: document.getElementById('toast'),
  imageModal: document.getElementById('imageModal'),
  modalImage: document.getElementById('modalImage'),
  status: document.getElementById('statusText'),
  headerMenuBtn: document.getElementById('headerMenuBtn'),
};

let mediaStream = null;
let steps = [];
let logs = [];

const STORAGE_KEY = 'homolog_steps_v1';
const LOGS_STORAGE_KEY = 'homolog_logs_v1';

function showToast(msg, ms = 1600) {
  if (!els.toast) return;
  els.toast.textContent = msg;
  els.toast.classList.remove('hidden');
  setTimeout(() => els.toast.classList.add('hidden'), ms);
}

function setStatus(text) {
  if (els.status) els.status.textContent = text;
}

async function startCapture() {
  try {
    mediaStream = await navigator.mediaDevices.getDisplayMedia({
      video: { cursor: 'always' },
      audio: false,
    });
    els.video.srcObject = mediaStream;
    els.overlay.classList.remove('hidden');
    setStatus('Capturando tela');
    showToast('Captura iniciada');
  } catch (err) {
    console.error('Erro ao iniciar captura:', err);
    showToast('Não foi possível iniciar a captura');
  }
}

function stopCapture() {
  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop());
    mediaStream = null;
    els.video.srcObject = null;
    els.overlay.classList.add('hidden');
    setStatus('Pronto');
    showToast('Captura finalizada');
  }
}

function captureScreenshot(highlight) {
  const video = els.video;
  if (!video || !video.videoWidth || !video.videoHeight) {
    showToast('Vídeo indisponível para captura');
    return null;
  }
  const w = video.videoWidth;
  const h = video.videoHeight;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, w, h);
  if (highlight && typeof highlight.x === 'number' && typeof highlight.y === 'number') {
    const baseRadius = Math.max(18, Math.round(Math.min(w, h) * 0.025));
    drawPointerHighlight(ctx, highlight.x, highlight.y, baseRadius);
  }
  const dataUrl = canvas.toDataURL('image/png', 0.9);
  return dataUrl;
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(steps));
  } catch (e) {
    console.warn('Persistência falhou:', e);
  }
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) steps = JSON.parse(raw) || [];
  } catch {}
}

function persistLogs() {
  try { localStorage.setItem(LOGS_STORAGE_KEY, JSON.stringify(logs)); } catch {}
}

function loadLogs() {
  try {
    const raw = localStorage.getItem(LOGS_STORAGE_KEY);
    if (raw) logs = JSON.parse(raw) || [];
  } catch {}
}

function addLog(message) {
  const entry = { id: `log_${Date.now()}`, message, ts: Date.now() };
  logs.push(entry);
  renderLogs();
  persistLogs();
}

function renderLogs() {
  if (!els.logs) return;
  els.logs.innerHTML = '';
  if (!logs.length) {
    const empty = document.createElement('div');
    empty.className = 'hint';
    empty.textContent = 'Nenhum log ainda. Clique no vídeo para gerar.';
    els.logs.appendChild(empty);
    return;
  }
  for (const l of logs) {
    const item = document.createElement('div');
    item.className = 'log-item';
    const msg = document.createElement('div'); msg.className = 'msg'; msg.textContent = l.message;
    const time = document.createElement('div'); time.className = 'time'; time.textContent = formatTime(l.ts);
    const del = document.createElement('button'); del.className = 'secondary'; del.textContent = 'Apagar';
    del.addEventListener('click', () => removeLog(l.id));
    item.appendChild(msg); item.appendChild(time); item.appendChild(del);
    els.logs.appendChild(item);
  }
}

function formatTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function removeLog(id) {
  logs = logs.filter((l) => l.id !== id);
  renderLogs();
  persistLogs();
}

function addStep() {
  const image = captureScreenshot();
  if (!image) return;
  const id = `step_${Date.now()}`;
  const step = {
    id,
    title: 'Novo passo',
    description: '',
    imageDataUrl: image,
    createdAt: Date.now(),
  };
  steps.push(step);
  renderSteps();
  persist();
  showToast('Passo adicionado');
}

function removeStep(id) {
  steps = steps.filter((s) => s.id !== id);
  renderSteps();
  persist();
}

function updateStep(id, field, value) {
  const idx = steps.findIndex((s) => s.id === id);
  if (idx >= 0) {
    steps[idx][field] = value;
    persist();
  }
}

function clearSteps() {
  steps = [];
  renderSteps();
  persist();
}

function renderSteps() {
  els.steps.innerHTML = '';
  if (!steps.length) {
    const empty = document.createElement('div');
    empty.className = 'hint';
    empty.textContent = 'Nenhum passo ainda. Capture a tela e adicione passos.';
    els.steps.appendChild(empty);
    return;
  }
  for (const s of steps) {
    const card = document.createElement('div');
    card.className = 'step-card';

    const img = document.createElement('img');
    img.className = 'step-thumb';
    img.src = s.imageDataUrl;
    img.alt = s.title || 'Passo';
    img.addEventListener('click', () => openImageModal(s.imageDataUrl));

    const fields = document.createElement('div');
    fields.className = 'step-fields';
    const titleLabel = document.createElement('label');
    titleLabel.textContent = 'Título';
    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.value = s.title || '';
    titleInput.addEventListener('input', (e) => updateStep(s.id, 'title', e.target.value));

  const descLabel = document.createElement('label');
  descLabel.textContent = 'Descrição';
  const descInput = document.createElement('textarea');
  descInput.value = s.description || '';
  descInput.addEventListener('input', (e) => updateStep(s.id, 'description', e.target.value));

    const tagLabel = document.createElement('label');
    tagLabel.textContent = 'Tag (item clicado)';
    const tagInput = document.createElement('input');
    tagInput.type = 'text';
    tagInput.value = s.tag || '';
    tagInput.placeholder = 'Ex.: Home, Menu, Salvar';
    tagInput.addEventListener('input', (e) => updateStep(s.id, 'tag', e.target.value));

    fields.appendChild(titleLabel);
    fields.appendChild(titleInput);
    fields.appendChild(tagLabel);
    fields.appendChild(tagInput);
    fields.appendChild(descLabel);
    fields.appendChild(descInput);

    const actions = document.createElement('div');
    actions.className = 'step-actions';
    const delBtn = document.createElement('button');
    delBtn.textContent = 'Excluir';
    delBtn.className = 'danger';
    delBtn.addEventListener('click', () => removeStep(s.id));
    actions.appendChild(delBtn);

    card.appendChild(img);
    card.appendChild(fields);
    card.appendChild(actions);
    els.steps.appendChild(card);
  }
}

async function exportDocx() {
  // Exportação totalmente no cliente usando a biblioteca docx (CDN)
  const docxLib = window.docx || (typeof docx !== 'undefined' ? docx : null);
  if (!docxLib) {
    console.error('Biblioteca docx não está carregada.');
    showToast('Biblioteca DOCX ausente');
    return;
  }
  try {
    await clientExportDocxFallback(docxLib);
    showToast('Exportado como DOCX (navegador)');
  } catch (e) {
    console.error('Falha ao exportar DOCX no cliente:', e);
    showToast('Falha na exportação DOCX');
  }
}

async function clientExportDocxFallback(docxLib) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, ImageRun } = docxLib;
  const children = [];
  children.push(new Paragraph({ text: 'Guia Homolog', heading: HeadingLevel.HEADING_1 }));
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    const titleText = `${i + 1}. ${s.title || 'Passo'}`;
    children.push(new Paragraph({ text: titleText, heading: HeadingLevel.HEADING_2 }));
    if (s.tag) children.push(new Paragraph({ children: [new TextRun({ text: `Tag: ${s.tag}`, bold: true })] }));
    if (s.description) children.push(new Paragraph({ text: s.description }));
    if (s.imageDataUrl && ImageRun) {
      const uint8 = dataUrlToUint8Array(s.imageDataUrl);
      const { width, height } = await getImageDimensions(s.imageDataUrl);
      const maxW = 640; const scale = width > maxW ? maxW / width : 1;
      const w = Math.round(width * scale); const h = Math.round(height * scale);
      children.push(new Paragraph({ children: [new ImageRun({ data: uint8, transformation: { width: w, height: h } })] }));
    }
    children.push(new Paragraph({ text: '' }));
  }
  const doc = new Document({ sections: [{ properties: {}, children }] });
  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'homolog_export.docx'; a.click();
  URL.revokeObjectURL(url);
}

function copyMarkdown() {
  const md = steps.map((s, i) => (
    `### ${i + 1}. ${s.title || 'Passo'}\n\n${s.description ? s.description + '\n\n' : ''}![](${s.imageDataUrl})\n`
  )).join('\n');
  navigator.clipboard.writeText(md).then(() => {
    showToast('Markdown copiado');
  }).catch(() => showToast('Falha ao copiar Markdown'));
}

function downloadMarkdown() {
  if (!steps.length) { showToast('Nenhum passo para exportar'); return; }
  const md = steps.map((s, i) => (
    `### ${i + 1}. ${s.title || 'Passo'}\n\n${s.description ? s.description + '\n\n' : ''}![](${s.imageDataUrl})\n`
  )).join('\n');
  const blob = new Blob([md], { type: 'text/markdown;charset=UTF-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'homolog_export.md'; a.click();
  URL.revokeObjectURL(url);
  showToast('Markdown baixado');
}

function downloadHtml() {
  if (!steps.length) { showToast('Nenhum passo para exportar'); return; }
  const head = `<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Guia Homolog</title><style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Cantarell,Noto Sans,sans-serif;padding:24px;line-height:1.5;color:#0f172a;background:#fff}h1{font-size:24px;margin:0 0 16px}h2{font-size:18px;margin:24px 0 8px}p{margin:6px 0}img{max-width:100%;height:auto;border:1px solid #e5e7eb;border-radius:6px;box-shadow:0 1px 3px rgba(0,0,0,.08);margin:8px 0}nav.toc{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;margin:12px 0}nav.toc h2{font-size:16px;margin:0 0 8px}nav.toc ol{margin:0;padding-left:18px}nav.toc li{margin:4px 0}</style></head><body>`;
  let body = `<h1>Guia Homolog</h1>`;

  // Sumário com âncoras para cada passo
  let toc = `<nav class="toc"><h2>Sumário</h2><ol>`;
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    const title = escapeHtml(s.title || 'Passo');
    toc += `<li><a href="#step-${i + 1}">${i + 1}. ${title}</a></li>`;
  }
  toc += `</ol></nav>`;
  body += toc;

  // Conteúdo dos passos com ids para âncoras
  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    const title = escapeHtml(s.title || 'Passo');
    body += `<h2 id="step-${i + 1}">${i + 1}. ${title}</h2>`;
    if (s.tag) body += `<p><strong>Tag:</strong> ${escapeHtml(s.tag)}</p>`;
    if (s.description) body += `<p>${escapeHtml(s.description)}</p>`;
    if (s.imageDataUrl) body += `<img src="${s.imageDataUrl}" alt="${title}">`;
  }
  const html = head + body + `</body></html>`;
  const blob = new Blob([html], { type: 'text/html;charset=UTF-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'homolog_export.html'; a.click();
  URL.revokeObjectURL(url);
  showToast('HTML baixado');
}

function dataUrlToUint8Array(dataUrl) {
  const parts = dataUrl.split(',');
  const base64 = parts[1] || '';
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function getImageDimensions(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || img.width, height: img.naturalHeight || img.height });
    img.onerror = (e) => reject(e);
    img.src = dataUrl;
  });
}

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

// Eventos
els.start.addEventListener('click', startCapture);
els.stop.addEventListener('click', stopCapture);
els.add.addEventListener('click', addStep);
els.exportHtml.addEventListener('click', exportDocx);
if (els.toggleExpand) {
  els.toggleExpand.addEventListener('click', toggleFullscreenCapture);
  document.addEventListener('fullscreenchange', updateExpandButtonLabel);
}
els.copyMd.addEventListener('click', copyMarkdown);
if (els.downloadMd) els.downloadMd.addEventListener('click', downloadMarkdown);
if (els.downloadHtml) els.downloadHtml.addEventListener('click', downloadHtml);
els.clear.addEventListener('click', () => {
  if (confirm('Tem certeza que deseja limpar todos os passos?')) {
    clearSteps();
  }
});

// Menu responsivo do header (tela pequena)
if (els.headerMenuBtn) {
  const actionsContainer = document.querySelector('.actions');
  const btn = els.headerMenuBtn;
  const toggle = (open) => {
    const isOpen = typeof open === 'boolean' ? open : !actionsContainer.classList.contains('open');
    if (isOpen) {
      actionsContainer.classList.add('open');
      btn.setAttribute('aria-expanded', 'true');
    } else {
      actionsContainer.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
    }
  };
  btn.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });

  // fechar ao clicar fora
  document.addEventListener('click', (e) => {
    if (!actionsContainer) return;
    if (!actionsContainer.classList.contains('open')) return;
    const target = e.target;
    if (target === btn || actionsContainer.contains(target)) return;
    toggle(false);
  });

  // fechar ao redimensionar para desktop
  window.addEventListener('resize', () => {
    if (window.innerWidth > 680 && actionsContainer.classList.contains('open')) {
      toggle(false);
    }
  });
}
els.video.addEventListener('click', (e) => {
  if (!mediaStream) {
    showToast('Inicie a captura para criar passos');
    return;
  }
  const coords = getVideoFrameCoordsFromClient(e.clientX, e.clientY);
  if (!coords) {
    showToast('Clique dentro do vídeo');
    return;
  }
  addStepWithHighlight(coords);
});

// Inicialização
load();
loadLogs();
renderSteps();
renderLogs();

function toggleFullscreenCapture() {
  try {
    if (!document.fullscreenElement && els.videoWrapper?.requestFullscreen) {
      els.videoWrapper.requestFullscreen();
    } else if (document.exitFullscreen) {
      document.exitFullscreen();
    }
  } catch (e) {
    console.warn('Falha ao alternar fullscreen:', e);
    showToast('Não foi possível alternar tela cheia');
  }
}

function updateExpandButtonLabel() {
  if (!els.toggleExpand) return;
  const isFs = !!document.fullscreenElement;
  els.toggleExpand.textContent = isFs ? 'Retrair captura' : 'Expandir captura';
}

function openImageModal(url) {
  if (!els.imageModal || !els.modalImage) return;
  els.modalImage.src = url;
  els.imageModal.classList.remove('hidden');
  els.imageModal.addEventListener('click', closeImageModal, { once: true });
}

function closeImageModal() {
  if (!els.imageModal) return;
  els.imageModal.classList.add('hidden');
}
function drawPointerHighlight(ctx, x, y, baseRadius = 22) {
  const r = baseRadius;
  const glow = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 1.8);
  glow.addColorStop(0, 'rgba(79,124,255,0.28)');
  glow.addColorStop(1, 'rgba(79,124,255,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, r * 1.8, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(79,124,255,0.95)';
  ctx.lineWidth = Math.max(4, Math.round(r * 0.22));
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = 'rgba(20,184,166,0.9)';
  ctx.beginPath();
  ctx.arc(x, y, Math.max(3, Math.round(r * 0.18)), 0, Math.PI * 2);
  ctx.fill();
}

function getVideoFrameCoordsFromClient(clientX, clientY) {
  const video = els.video;
  const rect = video.getBoundingClientRect();
  const relX = clientX - rect.left;
  const relY = clientY - rect.top;
  if (relX < 0 || relY < 0 || relX > rect.width || relY > rect.height) return null;
  const scaleX = video.videoWidth / rect.width;
  const scaleY = video.videoHeight / rect.height;
  return { x: Math.round(relX * scaleX), y: Math.round(relY * scaleY) };
}

async function addStepWithHighlight(coords) {
  const image = captureScreenshot(coords);
  if (!image) return;
  const id = `step_${Date.now()}`;
  const defaultTitle = `Clicado no ponto (${coords.x}, ${coords.y})`;
  const step = {
    id,
    title: defaultTitle,
    description: '',
    imageDataUrl: image,
    createdAt: Date.now(),
  };
  steps.push(step);
  renderSteps();
  persist();
  showToast('Passo criado pelo clique');

  // Tentar sugerir um título a partir de texto próximo ao clique
  const suggestion = await suggestLabelFromVideo(coords).catch(() => null);
  const label = sanitizeLabel(suggestion);
  if (label) {
    const refinedTitle = label; // manter exatamente como na tela
    updateStep(id, 'title', refinedTitle);
    updateStep(id, 'tag', label);
    renderSteps();
    addLog(`Clicado em ${label}`);
  } else {
    addLog(defaultTitle);
  }
}

function suggestLabelFromVideo(coords) {
  return new Promise((resolve) => {
    try {
      const video = els.video;
      if (!video || !video.videoWidth || !video.videoHeight) return resolve(null);
      const w = video.videoWidth; const h = video.videoHeight;
      const fullCanvas = document.createElement('canvas');
      fullCanvas.width = w; fullCanvas.height = h;
      const ctx = fullCanvas.getContext('2d');
      ctx.drawImage(video, 0, 0, w, h);

      const cropW = Math.max(180, Math.round(w * 0.22));
      const cropH = Math.max(100, Math.round(h * 0.16));
      const x0 = Math.max(0, Math.min(w - cropW, coords.x - Math.round(cropW / 2)));
      const y0 = Math.max(0, Math.min(h - cropH, coords.y - Math.round(cropH / 2)));

      const cropCanvas = document.createElement('canvas');
      cropCanvas.width = cropW; cropCanvas.height = cropH;
      const cropCtx = cropCanvas.getContext('2d');
      cropCtx.drawImage(fullCanvas, x0, y0, cropW, cropH, 0, 0, cropW, cropH);
      const cropUrl = cropCanvas.toDataURL('image/png', 0.92);

      if (!window.Tesseract || !window.Tesseract.recognize) {
        return resolve(null);
      }

      const clickCropX = coords.x - x0;
      const clickCropY = coords.y - y0;

      window.Tesseract.recognize(cropUrl, 'por+eng')
        .then(r => {
          const data = r?.data;
          const words = Array.isArray(data?.words) ? data.words : [];
          const getBB = (item) => item?.bbox || item?.boundingBox || item?.box;
          const xMinOf = (bb) => bb?.x0 ?? bb?.left ?? bb?.x ?? 0;
          const yMinOf = (bb) => bb?.y0 ?? bb?.top ?? bb?.y ?? 0;
          const xMaxOf = (bb) => bb?.x1 ?? ((bb?.left ?? 0) + (bb?.width ?? 0));
          const yMaxOf = (bb) => bb?.y1 ?? ((bb?.top ?? 0) + (bb?.height ?? 0));

          // Escolher a palavra que contém o clique, senão a mais próxima
          let chosenWord = null;
          for (const wItem of words) {
            const bb = getBB(wItem); if (!bb) continue;
            if (clickCropX >= xMinOf(bb) && clickCropX <= xMaxOf(bb) && clickCropY >= yMinOf(bb) && clickCropY <= yMaxOf(bb)) {
              chosenWord = wItem; break;
            }
          }
          if (!chosenWord && words.length) {
            let bestDist = Infinity;
            for (const wItem of words) {
              const bb = getBB(wItem); if (!bb) continue;
              const cx = (xMinOf(bb) + xMaxOf(bb)) / 2; const cy = (yMinOf(bb) + yMaxOf(bb)) / 2;
              const d = Math.hypot(cx - clickCropX, cy - clickCropY);
              if (d < bestDist) { bestDist = d; chosenWord = wItem; }
            }
          }
          const rawText = (chosenWord?.text || '').trim();
          const label = pickLabelFromText(rawText);
          resolve(label || null);
        })
        .catch(err => { console.warn('OCR falhou:', err); resolve(null); });
    } catch (e) {
      console.warn('Sugestão de título falhou:', e);
      resolve(null);
    }
  });
}

function pickLabelFromText(text) {
  if (!text) return null;
  const tokens = String(text).trim().split(/\s+/).filter(Boolean);
  const first = tokens[0] || null;
  if (!first) return null;
  return first.length <= 60 ? first : first.slice(0, 60);
}

function sanitizeLabel(label) {
  if (!label) return null;
  const trimmed = label.trim();
  if (!trimmed) return null;
  return trimmed;
}

function toTitleCase(s) {
  // Mantemos o texto como está; função deixada por compatibilidade
  return s;
}

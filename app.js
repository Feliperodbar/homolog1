const els = {
  start: document.getElementById('startCaptureBtn'),
  stop: document.getElementById('stopCaptureBtn'),
  add: document.getElementById('addStepBtn'),
  toggleExpand: document.getElementById('toggleExpandBtn'),
  exportDocx: document.getElementById('exportDocxBtn'),
  downloadZip: document.getElementById('downloadZipBtn'),
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
};
// Removido: integrações e tipos do cliente DOCX

let mediaStream = null;
let steps = [];
let logs = [];

const STORAGE_KEY = 'homolog_steps_v1';
const LOGS_STORAGE_KEY = 'homolog_logs_v1';

// Detecção de movimento reduzido: reflete preferência no documento
const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
function applyMotionPreference(e) {
  const reduced = !!e.matches;
  document.documentElement.setAttribute('data-reduced-motion', reduced ? 'true' : 'false');
}
applyMotionPreference(reducedMotionQuery);
try { reducedMotionQuery.addEventListener('change', applyMotionPreference); } catch {}

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

    const videoTrack = mediaStream.getVideoTracks()[0];
    videoTrack.onended = () => {
        stopCapture();
    };

    els.video.srcObject = mediaStream;
    els.overlay.classList.remove('hidden');
    setStatus('Capturando tela');
    showToast('Captura iniciada');
    if (els.videoWrapper?.requestFullscreen) {
      await els.videoWrapper.requestFullscreen();
    }
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
    if (document.fullscreenElement) {
      document.exitFullscreen();
    }
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

function addStep(img, title, description) {
  const newStep = {
    id: nanoid(),
    img: img || '',
    title: title || `Passo #${steps.length + 1} — ${new Date().toLocaleString('pt-BR')}`,
    description: description || '',
  };
  steps.push(newStep);
  persistSteps();
  renderSteps();
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




function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function downloadHtml() {
  try {
    const now = new Date();
    const title = `Homolog — Captura ${now.toLocaleString()}`;
    const stepsHtml = steps.map((s, i) => {
      const t = escapeHtml(s.title || `Passo ${i+1}`);
      const d = escapeHtml(s.description || '');
      const tag = escapeHtml(s.tag || '');
      const img = s.imageDataUrl || '';
      return `<article style="border:1px solid #d1d5db;border-radius:8px;padding:10px;background:#fafafa;margin:10px 0;">
        <header>
          <h3 style="margin:0 0 6px;color:#111827;font-family:system-ui,Segoe UI,Roboto">${t}</h3>
          ${tag ? `<p style="margin:0 0 8px;color:#374151;font-size:12px">Tag: ${tag}</p>` : ''}
        </header>
        ${img ? `<img src="${img}" alt="${t}" style="max-width:100%;border:1px solid #e5e7eb;border-radius:6px">` : ''}
        ${d ? `<p style="margin:8px 0;color:#1f2937">${d}</p>` : ''}
      </article>`;
    }).join('');

    const logsHtml = logs.length ? `<section>
      <h2 style="font-family:system-ui,Segoe UI,Roboto;color:#111827">Logs</h2>
      <ul style="padding-left:18px;color:#1f2937">${logs.map(l => `<li>${escapeHtml(l.message)} — ${escapeHtml(new Date(l.ts).toLocaleTimeString())}</li>`).join('')}</ul>
    </section>` : '';

    const doc = `<!doctype html><html lang="pt-BR"><head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>${escapeHtml(title)}</title>
      <style>
        body{font-family:ui-sans-serif,system-ui,Segoe UI,Roboto;background:#ffffff;color:#111827;margin:20px}
        h1{font-size:20px;margin:0 0 12px}
        .hint{color:#6b7280;font-size:12px;margin-bottom:12px}
      </style>
    </head><body>
      <h1>${escapeHtml(title)}</h1>
      <p class="hint">Arquivo gerado pelo Homolog — contém imagens incorporadas.</p>
      <section>
        <h2 style="font-family:system-ui,Segoe UI,Roboto;color:#111827">Passos</h2>
        ${stepsHtml || '<p>Nenhum passo.</p>'}
      </section>
      ${logsHtml}
    </body></html>`;

    const blob = new Blob([doc], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `homolog_${now.toISOString().slice(0,19).replace(/[:T]/g,'-')}.html`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
    showToast('HTML baixado');
  } catch (e) {
    console.warn('Falha ao baixar HTML:', e);
    showToast('Não foi possível gerar o HTML');
  }
}
// Eventos
els.start.addEventListener('click', startCapture);
els.stop.addEventListener('click', stopCapture);
els.add.addEventListener('click', addStep);
if (els.downloadHtml) { els.downloadHtml.addEventListener('click', downloadHtml); }
// Removido: exportação DOCX
if (els.toggleExpand) {
  els.toggleExpand.addEventListener('click', toggleFullscreenCapture);
  document.addEventListener('fullscreenchange', updateExpandButtonLabel);
}
if (els.exportDocx) { els.exportDocx.addEventListener('click', exportDocxRedocx); }
if (els.downloadZip) { els.downloadZip.addEventListener('click', downloadStepsZip); }
// Removido: copiar/baixar Markdown
// Removido: botão de baixar HTML
els.clear.addEventListener('click', () => {
if (confirm('Tem certeza que deseja limpar todos os passos?')) {
    clearSteps();
  }
});
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
  els.toggleExpand.setAttribute('aria-expanded', String(isFs));
}

let lastFocusedEl = null;
function openImageModal(url) {
  if (!els.imageModal || !els.modalImage) return;
  els.modalImage.src = url;
  els.imageModal.classList.remove('hidden');
  els.imageModal.setAttribute('aria-hidden', 'false');
  lastFocusedEl = document.activeElement;
  try { els.imageModal.focus(); } catch {}
  els.imageModal.addEventListener('click', closeImageModal, { once: true });
  const escHandler = (ev) => { if (ev.key === 'Escape') closeImageModal(); };
  document.addEventListener('keydown', escHandler, { once: true });
}

function closeImageModal() {
  if (!els.imageModal) return;
  els.imageModal.classList.add('hidden');
  els.imageModal.setAttribute('aria-hidden', 'true');
  try { if (lastFocusedEl && typeof lastFocusedEl.focus === 'function') lastFocusedEl.focus(); } catch {}
}
function drawPointerHighlight(ctx, x, y, baseRadius = 18) {
  const r = baseRadius;
  // Brilho vermelho ao redor do tip
  const glow = ctx.createRadialGradient(x, y, r * 0.35, x, y, r * 1.6);
  glow.addColorStop(0, 'rgba(239,68,68,0.35)');
  glow.addColorStop(1, 'rgba(239,68,68,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, r * 1.6, 0, Math.PI * 2);
  ctx.fill();

  // Desenhar seta vermelha (orientada a -45°; ponta em x,y)
  const size = r * 1.7; // menor
  const headLen = size * 0.58;
  const headWidth = size * 0.50;
  const tailLen = size * 0.9;
  const tailWidth = Math.max(2, Math.round(size * 0.14));
  const angle = -Math.PI / 4; // -45 graus
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const rot = (px, py) => ({ x: x + px * cos - py * sin, y: y + px * sin + py * cos });

  const points = [
    rot(0, 0), // ponta
    rot(-headWidth / 2, headLen),
    rot(-tailWidth / 2, headLen),
    rot(-tailWidth / 2, headLen + tailLen),
    rot(tailWidth / 2, headLen + tailLen),
    rot(tailWidth / 2, headLen),
    rot(headWidth / 2, headLen),
  ];

  // Preenchimento da seta
  ctx.fillStyle = 'rgba(239,68,68,1)';
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.closePath();
  ctx.fill();

  // Contorno para legibilidade
  ctx.strokeStyle = 'rgba(220,38,38,1)';
  ctx.lineWidth = Math.max(2, Math.round(r * 0.16));
  ctx.lineJoin = 'round';
  ctx.stroke();
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

// Removido: utilitários de imagem para DOCX

function getBackendBase() {
  try {
    const origin = window.location.origin || '';
    if (origin.includes('localhost:8010') || origin.includes('127.0.0.1:8010')) return '';
    return 'http://localhost:8010';
  } catch {
    return 'http://localhost:8010';
  }
}

// Removido: exportação DOCX via backend

// Removido: listener de botão Exportar DOCX
async function exportDocxRedocx() {
  try {
    const url = 'http://localhost:8020/export-docx';
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ steps }),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const blob = await resp.blob();
    const cd = resp.headers.get('content-disposition') || '';
    const m = cd.match(/filename="?([^";]+)"?/i);
    const filename = m ? m[1] : `homolog_export_${Date.now()}.docx`;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    showToast('DOCX exportado via redocx');
  } catch (e) {
    console.warn('Falha ao exportar DOCX (redocx):', e);
    showToast('Servidor redocx offline? Rode: npm run docx-server', 4000);
  }
}

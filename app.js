const els = {
  start: document.getElementById('startCaptureBtn'),
  stop: document.getElementById('stopCaptureBtn'),
  add: document.getElementById('addStepBtn'),
  toggleExpand: document.getElementById('toggleExpandBtn'),
  downloadHtml: document.getElementById('downloadHtmlBtn'),
  downloadDocx: document.getElementById('downloadDocxBtn'),
  clear: document.getElementById('clearStepsBtn'),
  video: document.getElementById('screenVideo'),
  videoWrapper: document.getElementById('videoWrapper'),
  overlay: document.getElementById('videoOverlay'),
  steps: document.getElementById('stepsList'),
  toast: document.getElementById('toast'),
  imageModal: document.getElementById('imageModal'),
  modalImage: document.getElementById('modalImage'),
  status: document.getElementById('statusText'),
};
// Removido: integrações e tipos do cliente DOCX

let mediaStream = null;
let steps = [];

const STORAGE_KEY = 'homolog_steps_v1';
// Removido: LOGS_STORAGE_KEY

// Configuração global de tamanho de imagem para exportações
// Ajustado para seguir o modelo do Word enviado (largura 20,23 cm; altura 9,28 cm)
const EXPORT_IMAGE_WIDTH_CM = 20.23;
const EXPORT_IMAGE_HEIGHT_CM = 9.28;

// Tamanho máximo específico para imagens no DOCX (para ficarem menores)
// Ajuste aqui se quiser outro limite.
const DOCX_IMAGE_MAX_WIDTH_CM = 7; // largura fixa para imagens dos passos (DOCX)
const DOCX_IMAGE_MAX_HEIGHT_CM = 10; // altura fixa para imagens dos passos (DOCX)

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
      video: { cursor: 'always', preferCurrentTab: true },
      audio: false,
    });

    const videoTrack = mediaStream.getVideoTracks()[0];
    videoTrack.onended = () => {
        stopCapture();
    };

    els.video.srcObject = mediaStream;
    await ensureVideoReady();
    els.overlay.classList.remove('hidden');
    setStatus('Capturando tela');
    showToast('Captura iniciada');
    try { window.focus(); } catch {}
    setTimeout(() => { try { window.focus(); } catch {} }, 50);
    // Não entrar em fullscreen automaticamente ao iniciar captura
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

async function ensureVideoReady() {
  const v = els.video;
  if (!v) return;
  if (v.readyState >= 2 && v.videoWidth && v.videoHeight) return;
  await new Promise((resolve) => v.addEventListener('loadedmetadata', resolve, { once: true }));
  try { await v.play(); } catch {}
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

async function addStep() {
  if (!mediaStream) {
    showToast('Inicie a captura para criar passos');
    return;
  }
  await ensureVideoReady();

  const image = captureScreenshot();
  if (!image) {
    showToast('Não foi possível capturar a tela');
    return;
  }
  const step = {
    id: `step_${Date.now()}`,
    title: `Passo #${steps.length + 1} — ${new Date().toLocaleString('pt-BR')}`,
    description: 'Passo manual. Descreva a ação realizada, o objetivo e o resultado esperado.',
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
    tagLabel.textContent = 'Item clicado';
    const tagInput = document.createElement('input');
    tagInput.type = 'text';
    tagInput.value = s.tag || '';
    tagInput.placeholder = 'Texto visível do item clicado (ex.: "Salvar", "Menu Home").';
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

function buildExportHtml() {
  const now = new Date();
  const title = '';
  const CONTENT_WIDTH_CM = EXPORT_IMAGE_WIDTH_CM;
  const IMAGE_HEIGHT_CM = EXPORT_IMAGE_HEIGHT_CM;
  const stepsHtml = steps.map((s, i) => {
    const t = escapeHtml(s.title || `Passo ${i + 1}`);
    const d = escapeHtml(s.description || '');
    const tag = escapeHtml(s.tag || '');
    const img = s.imageDataUrl || '';
    return `<article style="border:none;border-radius:6px;padding:10px;background:#fafafa;margin:10px 0;">
      <header>
        <h3 style="margin:0 0 6px;color:#111827;font-family:system-ui,Segoe UI,Roboto">${t}</h3>
        ${tag ? `<p style="margin:0 0 8px;color:#374151;font-size:12px">Item clicado: ${tag}</p>` : ''}
      </header>
      ${img ? `<img src="${img}" alt="${t}" style="display:block;margin:6px auto;width:${CONTENT_WIDTH_CM}cm;height:auto;max-height:${IMAGE_HEIGHT_CM}cm;border:none;border-radius:6px;object-fit:contain">` : ''}
      ${d ? `<p style="margin:8px 0;color:#1f2937">${d}</p>` : ''}
    </article>`;
  }).join('');

  const doc = `<!doctype html><html lang="pt-BR"><head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <style>
      body{font-family:ui-sans-serif,system-ui,Segoe UI,Roboto;background:#ffffff;color:#111827;margin:20px}
      .docx-container{width:${CONTENT_WIDTH_CM}cm;margin:0 auto}
      h1{font-size:20px;margin:0 0 12px}
      .hint{color:#6b7280;font-size:12px;margin-bottom:12px}
      .layout-header{margin:6px 0 14px}
      .brand{display:flex;align-items:center;gap:8px;margin-bottom:6px}
      .brand-logo{height:20px}
      .brand-name{display:none}
      .meta-table{width:100%;border-collapse:collapse;font-size:12px;border:none}
      .meta-table th,.meta-table td{border:none;padding:6px;vertical-align:top}
    </style>
  </head><body>
    <div class="docx-container">
      <div class="layout-header">
        <div class="brand">
          <img src="./assets/headerneo.JPG" alt="Header" style="width:100%;height:auto;border-radius:6px"/>
        </div>
        <table class="meta-table">
          <tr>
            <td><strong>Projeto:</strong> <span contenteditable="true"></span></td>
            <td><strong>Frente:</strong> <span contenteditable="true"></span></td>
          </tr>
          <tr>
            <td><strong>Distribuidora:</strong> <span contenteditable="true"></span></td>
            <td><strong>Responsável:</strong> <span contenteditable="true"></span></td>
          </tr>
          <tr>
            <td><strong>Produto/Serviço:</strong> <span contenteditable="true"></span></td>
            <td><strong>Data:</strong> <span contenteditable="true"></span></td>
          </tr>
          <tr>
            <td><strong>Resultado Esperado:</strong> <span contenteditable="true"></span></td>
            <td><strong>Versão:</strong> <span contenteditable="true"></span> &nbsp; | &nbsp; <strong>Navegador:</strong> <span contenteditable="true"></span></td>
          </tr>
        </table>
      </div>
      <section>
        
        ${stepsHtml || '<p>Nenhum passo.</p>'}
      </section>
    </div>
    </body></html>`;
  return doc;
}

async function dataUrlToArrayBuffer(dataUrl) {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return await blob.arrayBuffer();
}

async function assetToDataUrl(url) {
  const res = await fetch(url);
  const blob = await res.blob();
  return await new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = reject;
    fr.readAsDataURL(blob);
  });
}

function getImageDimensions(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth || img.width || 1920, height: img.naturalHeight || img.height || 1080 });
    img.onerror = () => resolve({ width: 1920, height: 1080 });
    img.src = dataUrl;
  });
}

// Redimensiona uma imagem (data URL) para caber nos limites informados, mantendo proporção.
// Retorna { buffer: ArrayBuffer, width: number, height: number } com o novo tamanho em px.
async function resizeImageToFit(dataUrl, maxWpx, maxHpx) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = async () => {
      const srcW = img.naturalWidth || img.width;
      const srcH = img.naturalHeight || img.height;
      const scale = Math.min(maxWpx / srcW, maxHpx / srcH, 1);
      const targetW = Math.round(srcW * scale);
      const targetH = Math.round(srcH * scale);

      // Se não precisa reduzir, retorna dado original
      if (scale >= 1) {
        try {
          const blob = await (await fetch(dataUrl)).blob();
          const buffer = await blob.arrayBuffer();
          resolve({ buffer, width: srcW, height: srcH });
        } catch (e) {
          resolve({ buffer: new ArrayBuffer(0), width: srcW, height: srcH });
        }
        return;
      }

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        // Fallback: retorna original
        (async () => {
          const blob = await (await fetch(dataUrl)).blob();
          const buffer = await blob.arrayBuffer();
          resolve({ buffer, width: srcW, height: srcH });
        })();
        return;
      }
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, targetW, targetH);

      canvas.toBlob(async (blob) => {
        if (!blob) {
          const originalBlob = await (await fetch(dataUrl)).blob();
          const buffer = await originalBlob.arrayBuffer();
          resolve({ buffer, width: srcW, height: srcH });
          return;
        }
        const buffer = await blob.arrayBuffer();
        resolve({ buffer, width: targetW, height: targetH });
      }, 'image/jpeg', 0.9);
    };
    img.onerror = async () => {
      try {
        const blob = await (await fetch(dataUrl)).blob();
        const buffer = await blob.arrayBuffer();
        resolve({ buffer, width: maxWpx, height: maxHpx });
      } catch (e) {
        resolve({ buffer: new ArrayBuffer(0), width: maxWpx, height: maxHpx });
      }
    };
    img.src = dataUrl;
  });
}

async function downloadDocxEditable() {
  try {
    if (!window.docx) {
      // fallback para HTML->DOCX se docx não estiver disponível
      return downloadDocx();
    }
    const { Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, Header } = window.docx;
    const d = window.docx || {};
    const now = new Date();
    const title = '';
    const IMAGE_WIDTH_CM = EXPORT_IMAGE_WIDTH_CM; // largura uniforme
    const IMAGE_HEIGHT_CM = EXPORT_IMAGE_HEIGHT_CM; // altura uniforme
    const cmToPx = (cm) => Math.round((cm / 2.54) * 96);

    const children = [];
    // Sem título/rodapé iniciais conforme solicitação

    // Tenta carregar imagem de cabeçalho (assets/headerneo.JPG)
    let headerImageRun = null;
    try {
      const headerImgUrl = './assets/headerneo.JPG';
      const headerBuf = await (await fetch(headerImgUrl)).arrayBuffer();
      const hdims = await getImageDimensions(headerImgUrl);
      const maxW = cmToPx(IMAGE_WIDTH_CM);
      const targetW = Math.min(maxW, hdims.width || maxW);
      const scale = (hdims.width ? targetW / hdims.width : 1);
      const targetH = Math.round((hdims.height || maxW) * scale);
      headerImageRun = new ImageRun({ data: headerBuf, transformation: { width: targetW, height: targetH } });
    } catch {}

    // Cabeçalho fixo em todas as páginas (texto e tabela simples)
    const headerRows = [
      new TableRow({ children: [
        new TableCell({ children: [ new Paragraph({ children: [ new TextRun({ text: 'Projeto:', bold: true }), new TextRun({ text: ' ' }) ] }) ] }),
        new TableCell({ children: [ new Paragraph({ children: [ new TextRun({ text: 'Frente:', bold: true }), new TextRun({ text: ' ' }) ] }) ] }),
      ]}),
      new TableRow({ children: [
        new TableCell({ children: [ new Paragraph({ children: [ new TextRun({ text: 'Distribuidora:', bold: true }), new TextRun({ text: ' ' }) ] }) ] }),
        new TableCell({ children: [ new Paragraph({ children: [ new TextRun({ text: 'Responsável:', bold: true }), new TextRun({ text: ' ' }) ] }) ] }),
      ]}),
      new TableRow({ children: [
        new TableCell({ children: [ new Paragraph({ children: [ new TextRun({ text: 'Produto/Serviço:', bold: true }), new TextRun({ text: ' ' }) ] }) ] }),
        new TableCell({ children: [ new Paragraph({ children: [ new TextRun({ text: 'Data:', bold: true }), new TextRun({ text: ' ' }) ] }) ] }),
      ]}),
      new TableRow({ children: [
        new TableCell({ children: [ new Paragraph({ children: [ new TextRun({ text: 'Resultado Esperado:', bold: true }), new TextRun({ text: ' ' }) ] }) ] }),
        new TableCell({ children: [ new Paragraph({ children: [ new TextRun({ text: 'Versão:', bold: true }), new TextRun({ text: ' ' }), new TextRun({ text: '  |  Navegador:', bold: true }), new TextRun({ text: ' ' }) ] }) ] }),
      ]}),
    ];

    const headerChildren = [
      ...(headerImageRun ? [ new Paragraph({ alignment: d.AlignmentType ? d.AlignmentType.CENTER : undefined, children: [ headerImageRun ] }) ] : []),
      ...(Table ? [ new Table({
        rows: headerRows,
        borders: {
          top: { size: 0, color: 'FFFFFF', style: d.BorderStyle ? d.BorderStyle.NONE : undefined },
          left: { size: 0, color: 'FFFFFF', style: d.BorderStyle ? d.BorderStyle.NONE : undefined },
          bottom: { size: 0, color: 'FFFFFF', style: d.BorderStyle ? d.BorderStyle.NONE : undefined },
          right: { size: 0, color: 'FFFFFF', style: d.BorderStyle ? d.BorderStyle.NONE : undefined },
          insideHorizontal: { size: 0, color: 'FFFFFF', style: d.BorderStyle ? d.BorderStyle.NONE : undefined },
          insideVertical: { size: 0, color: 'FFFFFF', style: d.BorderStyle ? d.BorderStyle.NONE : undefined },
        },
      }) ] : [ new Paragraph({ children: [ new TextRun({ text: 'Projeto:', bold: true }) ] }) ]),
    ];

    // Conteúdo principal
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      const header = s.title || `Passo ${i + 1}`;
      const tag = s.tag || '';
      const desc = s.description || '';

      children.push(new Paragraph({ spacing: { before: 240, after: 120 }, children: [
        new TextRun({ text: header, bold: true, size: 26 }),
      ] }));
      if (tag) {
        children.push(new Paragraph({ children: [ new TextRun({ text: `Item clicado: ${tag}`, italics: true, size: 20 }) ] }));
      }

      if (s.imageDataUrl) {
        const buffer = await dataUrlToArrayBuffer(s.imageDataUrl);
        const targetW = cmToPx(DOCX_IMAGE_MAX_WIDTH_CM);
        const targetH = cmToPx(DOCX_IMAGE_MAX_HEIGHT_CM);
        const floating = (d.HorizontalPositionRelativeFrom && d.HorizontalPositionAlign && d.VerticalPositionRelativeFrom && d.VerticalPositionAlign && d.TextWrappingType)
          ? {
              horizontalPosition: { relative: d.HorizontalPositionRelativeFrom.MARGIN, align: d.HorizontalPositionAlign.CENTER },
              verticalPosition: { relative: d.VerticalPositionRelativeFrom.PARAGRAPH, align: d.VerticalPositionAlign.TOP },
              wrap: { type: d.TextWrappingType.SQUARE },
            }
          : undefined;
        children.push(new Paragraph({
          alignment: d.AlignmentType ? d.AlignmentType.CENTER : undefined,
          children: [
            new ImageRun({ data: buffer, transformation: { width: targetW, height: targetH }, floating })
          ],
        }));
      }

      if (desc) {
        children.push(new Paragraph({ spacing: { before: 120 }, children: [ new TextRun({ text: desc, size: 22 }) ] }));
      }
    }

    const doc = new Document({
      sections: [
        {
          properties: {
            page: {
              margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
            },
          },
          headers: {
            default: Header ? new Header({ children: headerChildren }) : undefined,
          },
          children,
        },
      ],
    });

    const blob = await Packer.toBlob(doc);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `homolog_${now.toISOString().slice(0,19).replace(/[:T]/g,'-')}.docx`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
    showToast('DOCX baixado');
  } catch (e) {
    console.warn('Falha ao gerar DOCX editável:', e);
    showToast('Não foi possível gerar o DOCX editável');
  }
}
function downloadHtml() {
  try {
    const now = new Date();
    const title = '';
    const CONTENT_WIDTH_CM = EXPORT_IMAGE_WIDTH_CM; // largura útil absoluta em cm
    const IMAGE_HEIGHT_CM = EXPORT_IMAGE_HEIGHT_CM; // altura absoluta da imagem em cm
    const headerImgSrc = './assets/headerneo.JPG';
    const stepsHtml = steps.map((s, i) => {
      const t = escapeHtml(s.title || `Passo ${i+1}`);
      const d = escapeHtml(s.description || '');
      const tag = escapeHtml(s.tag || '');
      const img = s.imageDataUrl || '';
      return `<article style="border:none;border-radius:8px;padding:10px;background:#fafafa;margin:10px 0;">
        <header>
          <h3 style="margin:0 0 6px;color:#111827;font-family:system-ui,Segoe UI,Roboto">${t}</h3>
          ${tag ? `<p style="margin:0 0 8px;color:#374151;font-size:12px">Item clicado: ${tag}</p>` : ''}
        </header>
        ${img ? `<img src="${img}" alt="${t}" style="display:block;margin:6px auto;width:${CONTENT_WIDTH_CM}cm;height:auto;max-height:${IMAGE_HEIGHT_CM}cm;border:none;border-radius:6px;object-fit:contain">` : ''}
        ${d ? `<p style="margin:8px 0;color:#1f2937">${d}</p>` : ''}
      </article>`;
    }).join('');

    // Removido: seção de logs

    const doc = `<!doctype html><html lang="pt-BR"><head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>${escapeHtml(title)}</title>
      <style>
        body{font-family:ui-sans-serif,system-ui,Segoe UI,Roboto;background:#ffffff;color:#111827;margin:20px}
        .docx-container{width:${CONTENT_WIDTH_CM}cm;margin:0 auto}
        h1{font-size:20px;margin:0 0 12px}
        .hint{color:#6b7280;font-size:12px;margin-bottom:12px}
        .layout-header{margin:6px 0 14px}
        .brand{margin-bottom:6px}
        .brand-name{display:none}
        .meta-table{width:100%;border-collapse:collapse;font-size:12px;border:none}
        .meta-table th,.meta-table td{border:none;padding:6px;vertical-align:top}
      </style>
    </head><body>
      <div class="docx-container">
        <div class="layout-header">
          <div class="brand">
            <img src="${headerImgSrc}" alt="Header" style="width:100%;height:auto;border-radius:6px"/>
          </div>
          <table class="meta-table">
            <tr>
              <td><strong>Projeto:</strong> <span contenteditable="true"></span></td>
              <td><strong>Frente:</strong> <span contenteditable="true"></span></td>
            </tr>
            <tr>
              <td><strong>Distribuidora:</strong> <span contenteditable="true"></span></td>
              <td><strong>Responsável:</strong> <span contenteditable="true"></span></td>
            </tr>
            <tr>
              <td><strong>Produto/Serviço:</strong> <span contenteditable="true"></span></td>
              <td><strong>Data:</strong> <span contenteditable="true"></span></td>
            </tr>
            <tr>
              <td><strong>Resultado Esperado:</strong> <span contenteditable="true"></span></td>
              <td><strong>Versão:</strong> <span contenteditable="true"></span> &nbsp; | &nbsp; <strong>Navegador:</strong> <span contenteditable="true"></span></td>
            </tr>
          </table>
        </div>
        <section>
        
        ${stepsHtml || '<p>Nenhum passo.</p>'}
        </section>
      </div>
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
async function downloadDocx() {
  try {
    let html = buildExportHtml();
    const now = new Date();
    if (!window.htmlDocx || typeof window.htmlDocx.asBlob !== 'function') {
      showToast('Biblioteca DOCX não carregada');
      return;
    }
    try {
      const headerDataUrl = await assetToDataUrl('./assets/headerneo.JPG');
      html = html.replace('./assets/headerneo.JPG', headerDataUrl);
    } catch {}
    const blob = window.htmlDocx.asBlob(html, { orientation: 'portrait' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `homolog_${now.toISOString().slice(0,19).replace(/[:T]/g,'-')}.docx`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
    showToast('DOCX baixado');
  } catch (e) {
    console.warn('Falha ao gerar DOCX:', e);
    showToast('Não foi possível gerar o DOCX');
  }
}
if (els.downloadDocx) { els.downloadDocx.addEventListener('click', () => {
  // prioriza o gerador nativo e cai para HTML->DOCX se indisponível
  if (window.docx) {
    downloadDocxEditable();
  } else {
    downloadDocx();
  }
}); }
if (els.toggleExpand) {
  els.toggleExpand.addEventListener('click', toggleFullscreenCapture);
  document.addEventListener('fullscreenchange', updateExpandButtonLabel);
}
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
renderSteps();
startTriggerPolling();
// Removido: inicialização de logs

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
  await ensureVideoReady();
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
    updateStep(id, 'description', buildDefaultDescription(label, coords));
    renderSteps();
    showToast(`Clicado em ${label}`);
  } else {
    updateStep(id, 'description', buildDefaultDescription(null, coords));
    renderSteps();
    showToast(defaultTitle);
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
          if (!chosenWord) {
            return resolve(null);
          }
          const chosenBB = getBB(chosenWord);
          const lineTop = yMinOf(chosenBB);
          const lineBottom = yMaxOf(chosenBB);
          const bandPad = Math.max(4, Math.round((lineBottom - lineTop) * 0.6));
          const bandTop = lineTop - bandPad;
          const bandBottom = lineBottom + bandPad;

          // Palavras na mesma linha (faixa vertical próxima à palavra escolhida)
          const lineWords = words
            .filter(w => {
              const bb = getBB(w); if (!bb) return false;
              const overlapY = Math.min(yMaxOf(bb), bandBottom) - Math.max(yMinOf(bb), bandTop);
              return overlapY > 0;
            })
            .sort((a, b) => xMinOf(getBB(a)) - xMinOf(getBB(b)));

          const phrase = lineWords
            .map(w => String(w?.text || '').trim())
            .filter(Boolean)
            .join(' ')
            .trim();

          const fallbackWord = String(chosenWord?.text || '').trim();
          const label = pickLabelFromText(phrase || fallbackWord);
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
  const cleaned = String(text).replace(/\s+/g, ' ').trim();
  // Evitar cortar no meio de palavra; preferir limite em 80 chars
  if (cleaned.length <= 80) return cleaned;
  const sliced = cleaned.slice(0, 80);
  const lastSpace = sliced.lastIndexOf(' ');
  return lastSpace > 40 ? sliced.slice(0, lastSpace) : sliced;
}

function sanitizeLabel(label) {
  if (!label) return null;
  const trimmed = label.trim();
  if (!trimmed) return null;
  return trimmed;
}

// Gera uma descrição padrão mais clara para o item clicado
function buildDefaultDescription(label, coords) {
    const hasCoords = coords && typeof coords.x === 'number' && typeof coords.y === 'number';
    const pos = hasCoords ? ` (${coords.x}, ${coords.y})` : '';
    if (label) {
        return `Clique no item "${label}"${pos} para executar a ação pretendida. Descreva o objetivo, os passos e o resultado esperado.`;
    }
    return `Clique na área indicada${pos}. Descreva o objetivo, os passos e o resultado esperado.`;
}

// Removido: toTitleCase (não utilizado)

// Removido: utilitários de imagem para DOCX

// Removido: getBackendBase (não utilizado)

// Removido: exportação DOCX via backend

// Removido: listener de botão Exportar DOCX
// Removido: exportDocxRedocx

// Removido: Baixar ZIP de passos via Flask
// Removido: downloadStepsZip
// Polling de gatilhos via servidor Flask
let lastTriggerTs = 0;
function getBackendBase() {
  const origin = window.location.origin || '';
  return (origin.includes('localhost:8010') || origin.includes('127.0.0.1:8010')) ? '' : 'http://localhost:8010';
}
function startTriggerPolling() {
  const base = getBackendBase();
  setInterval(async () => {
    try {
      const resp = await fetch(`${base}/trigger-state`);
      if (!resp.ok) return;
      const data = await resp.json().catch(() => null);
      const ts = (data && data.ts) || 0;
      if (ts && ts > lastTriggerTs) {
        lastTriggerTs = ts;
        const x = (data && typeof data.x === 'number') ? data.x : null;
        const y = (data && typeof data.y === 'number') ? data.y : null;
        const track = mediaStream && mediaStream.getVideoTracks && mediaStream.getVideoTracks()[0];
        const settings = track && typeof track.getSettings === 'function' ? track.getSettings() : {};
        const surface = settings && settings.displaySurface; // 'monitor' | 'window' | 'browser'
        if (surface === 'monitor' && x != null && y != null) {
          await addStepWithHighlight({ x, y });
        } else {
          await addStep();
        }
      }
    } catch {}
  }, 1000);
}

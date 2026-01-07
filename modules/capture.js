/**
 * Módulo de captura de tela.
 * Gerencia mediaStream e screenshots.
 */

import { showToast, setStatus } from './ui.js';

let mediaStream = null;

/**
 * Obtém o mediaStream ativo
 * @returns {MediaStream|null}
 */
export function getMediaStream() {
    return mediaStream;
}

/**
 * Inicia a captura de tela
 */
export async function startCapture() {
    try {
        mediaStream = await navigator.mediaDevices.getDisplayMedia({
            video: { cursor: 'always', preferCurrentTab: true },
            audio: false,
        });

        const videoTrack = mediaStream.getVideoTracks()[0];
        if (videoTrack) {
            videoTrack.onended = () => {
                stopCapture();
            };
        }

        const video = document.getElementById('screenVideo');
        const overlay = document.getElementById('videoOverlay');
        if (video) {
            video.srcObject = mediaStream;
            await ensureVideoReady();
        }
        if (overlay) overlay.classList.remove('hidden');

        setStatus('Capturando tela');
        showToast('Captura iniciada');

        // Traz de volta o foco para esta aba após a seleção da tela, evitando ficar preso na aba/ janela escolhida no picker
        setTimeout(() => {
            try {
                window.focus();
            } catch { }
        }, 150);

    } catch (err) {
        console.error('Erro ao iniciar captura:', err);
        showToast('Não foi possível iniciar a captura');
    }
}

/**
 * Para a captura de tela
 */
export function stopCapture() {
    if (mediaStream) {
        mediaStream.getTracks().forEach((t) => t.stop());
        mediaStream = null;

        const video = document.getElementById('screenVideo');
        const overlay = document.getElementById('videoOverlay');
        if (video) video.srcObject = null;
        if (overlay) overlay.classList.add('hidden');

        setStatus('Pronto');
        showToast('Captura finalizada');

        if (document.fullscreenElement) {
            document.exitFullscreen();
        }
    }
}

/**
 * Captura screenshot do vídeo com destaque opcional
 * @param {Object} highlight - Coordenadas para destaque { x: number, y: number }
 * @returns {string|null} Data URL da imagem ou null
 */
export function captureScreenshot(highlight = null) {
    const video = document.getElementById('screenVideo');
    if (!video?.videoWidth || !video?.videoHeight) {
        showToast('Vídeo indisponível para captura');
        return null;
    }

    const w = video.videoWidth;
    const h = video.videoHeight;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, w, h);

    if (highlight && typeof highlight.x === 'number' && typeof highlight.y === 'number') {
        const baseRadius = Math.max(18, Math.round(Math.min(w, h) * 0.025));
        drawPointerHighlight(ctx, highlight.x, highlight.y, baseRadius);
    }

    return canvas.toDataURL('image/png', 0.9);
}

/**
 * Captura screenshot recortando uma região do vídeo
 * @param {{x:number,y:number,width:number,height:number}} region - Coordenadas no espaço do vídeo (videoWidth/videoHeight)
 * @returns {string|null} Data URL da imagem recortada
 */
export function captureScreenshotRegion(region) {
    const video = document.getElementById('screenVideo');
    if (!video?.videoWidth || !video?.videoHeight) {
        showToast('Vídeo indisponível para captura');
        return null;
    }

    const w = video.videoWidth;
    const h = video.videoHeight;
    const sx = Math.max(0, Math.min(w, Math.round(region.x)));
    const sy = Math.max(0, Math.min(h, Math.round(region.y)));
    const sw = Math.max(1, Math.min(w - sx, Math.round(region.width)));
    const sh = Math.max(1, Math.min(h - sy, Math.round(region.height)));

    // Canvas de origem
    const src = document.createElement('canvas');
    src.width = w; src.height = h;
    const sctx = src.getContext('2d');
    if (!sctx) return null;
    sctx.drawImage(video, 0, 0, w, h);

    // Canvas de destino recortado
    const dst = document.createElement('canvas');
    dst.width = sw; dst.height = sh;
    const dctx = dst.getContext('2d');
    if (!dctx) return null;
    dctx.drawImage(src, sx, sy, sw, sh, 0, 0, sw, sh);

    return dst.toDataURL('image/png', 0.9);
}

/**
 * Garante que o vídeo está pronto para captura
 */
export async function ensureVideoReady() {
    const v = document.getElementById('screenVideo');
    if (!v) return;

    if (v.readyState >= 2 && v.videoWidth && v.videoHeight) return;

    await new Promise((resolve) => {
        v.addEventListener('loadedmetadata', resolve, { once: true });
    });

    try {
        await v.play();
    } catch { }
}

/**
 * Desenha destaque com seta vermelha no contexto do canvas
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} x - Coordenada X
 * @param {number} y - Coordenada Y
 * @param {number} baseRadius - Raio base em pixels
 */
function drawPointerHighlight(ctx, x, y, baseRadius = 18) {
    const r = baseRadius;

    // Brilho vermelho ao redor
    const glow = ctx.createRadialGradient(x, y, r * 0.35, x, y, r * 1.6);
    glow.addColorStop(0, 'rgba(239,68,68,0.35)');
    glow.addColorStop(1, 'rgba(239,68,68,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, r * 1.6, 0, Math.PI * 2);
    ctx.fill();

    // Desenhar seta vermelha (-45°)
    const size = r * 1.2;
    const headLen = size * 0.58;
    const headWidth = size * 0.50;
    const tailLen = size * 0.9;
    const tailWidth = Math.max(2, Math.round(size * 0.14));
    const angle = -Math.PI / 4;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    const rot = (px, py) => ({
        x: x + px * cos - py * sin,
        y: y + px * sin + py * cos,
    });

    const points = [
        rot(0, 0),
        rot(-headWidth / 2, headLen),
        rot(-tailWidth / 2, headLen),
        rot(-tailWidth / 2, headLen + tailLen),
        rot(tailWidth / 2, headLen + tailLen),
        rot(tailWidth / 2, headLen),
        rot(headWidth / 2, headLen),
    ];

    // Preenchimento
    ctx.fillStyle = 'rgba(239,68,68,1)';
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.closePath();
    ctx.fill();

    // Contorno
    ctx.strokeStyle = 'rgba(220,38,38,1)';
    ctx.lineWidth = Math.max(2, Math.round(r * 0.16));
    ctx.lineJoin = 'round';
    ctx.stroke();
}

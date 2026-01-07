/**
 * Módulo de interface do usuário.
 * Gerencia feedback visual (toasts, status, modals).
 */

/**
 * Exibe mensagem temporária (toast)
 * @param {string} msg - Mensagem a exibir
 * @param {number} ms - Duração em milissegundos (padrão: 1600ms)
 */
export function showToast(msg, ms = 1600) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), ms);
}

/**
 * Atualiza o status de texto na interface
 * @param {string} text - Texto de status
 */
export function setStatus(text) {
    const status = document.getElementById('statusText');
    if (status) status.textContent = text;
}

/**
 * Abre modal com imagem em tela cheia
 * @param {string} url - URL da imagem
 */
export function openImageModal(url) {
    const modal = document.getElementById('imageModal');
    const modalImage = document.getElementById('modalImage');
    if (!modal || !modalImage) return;

    modalImage.src = url;
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');

    const lastFocused = document.activeElement;
    try {
        modal.focus();
    } catch { }

    const closeHandler = () => closeImageModal(lastFocused);
    modal.addEventListener('click', closeHandler, { once: true });

    const escHandler = (ev) => {
        if (ev.key === 'Escape') closeImageModal(lastFocused);
    };
    document.addEventListener('keydown', escHandler, { once: true });
}

/**
 * Fecha modal de imagem
 * @param {HTMLElement} lastFocused - Elemento a restaurar o foco
 */
export function closeImageModal(lastFocused) {
    const modal = document.getElementById('imageModal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    try {
        if (lastFocused?.focus) lastFocused.focus();
    } catch { }
}

/**
 * Alterna tela cheia da captura
 */
export function toggleFullscreenCapture() {
    try {
        const wrapper = document.getElementById('videoWrapper');
        if (!wrapper) return;

        if (!document.fullscreenElement && wrapper.requestFullscreen) {
            wrapper.requestFullscreen();
        } else if (document.exitFullscreen) {
            document.exitFullscreen();
        }
    } catch (e) {
        console.warn('Falha ao alternar fullscreen:', e);
        showToast('Não foi possível alternar tela cheia');
    }
}

/**
 * Atualiza label do botão de expandir com base no estado fullscreen
 */
export function updateExpandButtonLabel() {
    const btn = document.getElementById('toggleExpandBtn');
    if (!btn) return;
    const isFs = !!document.fullscreenElement;
    btn.setAttribute('aria-expanded', String(isFs));
}

/**
 * Inicia seleção de área com retângulo expansível sobre um elemento alvo.
 * @param {Object} opts
 * @param {HTMLElement} opts.targetEl - Elemento alvo (ex.: vídeo)
 * @param {(rect: {x:number,y:number,width:number,height:number})=>void} opts.onComplete - Callback com retângulo final relativo ao elemento
 */
export function startAreaSelection({ targetEl, onComplete }) {
    if (!targetEl || typeof onComplete !== 'function') return;

    const wrapper = targetEl.parentElement;
    if (!wrapper) return;

    const rectEl = document.createElement('div');
    rectEl.className = 'selection-rect';
    const layer = document.createElement('div');
    layer.className = 'selection-layer';
    layer.appendChild(rectEl);
    wrapper.appendChild(layer);

    let startX = 0, startY = 0;
    let currentX = 0, currentY = 0;
    let selecting = false;

    const bounds = targetEl.getBoundingClientRect();

    function clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }

    function toLocal(x, y) {
        return {
            x: clamp(x - bounds.left, 0, bounds.width),
            y: clamp(y - bounds.top, 0, bounds.height),
        };
    }

    function onMouseDown(ev) {
        if (ev.button !== 0) return;
        selecting = true;
        const p = toLocal(ev.clientX, ev.clientY);
        startX = p.x; startY = p.y;
        currentX = p.x; currentY = p.y;
        updateRect();
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp, { once: true });
    }

    function onMouseMove(ev) {
        if (!selecting) return;
        const p = toLocal(ev.clientX, ev.clientY);
        currentX = p.x; currentY = p.y;
        updateRect();
    }

    function onMouseUp() {
        selecting = false;
        window.removeEventListener('mousemove', onMouseMove);
        finishSelection();
    }

    function updateRect() {
        const x = Math.min(startX, currentX);
        const y = Math.min(startY, currentY);
        const w = Math.abs(currentX - startX);
        const h = Math.abs(currentY - startY);
        rectEl.style.left = `${x}px`;
        rectEl.style.top = `${y}px`;
        rectEl.style.width = `${w}px`;
        rectEl.style.height = `${h}px`;
    }

    function finishSelection() {
        const x = Math.min(startX, currentX);
        const y = Math.min(startY, currentY);
        const w = Math.abs(currentX - startX);
        const h = Math.abs(currentY - startY);
        try { onComplete({ x, y, width: w, height: h }); } finally {
            cleanup();
        }
    }

    function onKey(ev) {
        if (ev.key === 'Escape') {
            cleanup();
        }
    }

    function cleanup() {
        try {
            targetEl.removeEventListener('mousedown', onMouseDown);
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('keydown', onKey);
        } catch {}
        if (layer?.parentElement) layer.parentElement.removeChild(layer);
    }

    targetEl.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKey);
}

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
    btn.textContent = isFs ? 'Retrair captura' : 'Expandir captura';
    btn.setAttribute('aria-expanded', String(isFs));
}

/**
 * Módulo de OCR e reconhecimento de texto.
 * Usa Tesseract.js para sugerir rótulos de elementos.
 */

/**
 * Sugerir rótulo a partir do vídeo usando OCR
 * @param {HTMLVideoElement} video - Elemento de vídeo
 * @param {Object} coords - Coordenadas do clique { x: number, y: number }
 * @returns {Promise<string|null>}
 */
export async function suggestLabelFromVideo(video, coords) {
    return new Promise((resolve) => {
        try {
            if (!video?.videoWidth || !video?.videoHeight) return resolve(null);

            const w = video.videoWidth;
            const h = video.videoHeight;

            // Capturar frame completo
            const fullCanvas = document.createElement('canvas');
            fullCanvas.width = w;
            fullCanvas.height = h;
            const ctx = fullCanvas.getContext('2d');
            if (!ctx) return resolve(null);
            ctx.drawImage(video, 0, 0, w, h);

            // Recortar região ao redor do clique
            const cropW = Math.max(180, Math.round(w * 0.22));
            const cropH = Math.max(100, Math.round(h * 0.16));
            const x0 = Math.max(0, Math.min(w - cropW, coords.x - Math.round(cropW / 2)));
            const y0 = Math.max(0, Math.min(h - cropH, coords.y - Math.round(cropH / 2)));

            const cropCanvas = document.createElement('canvas');
            cropCanvas.width = cropW;
            cropCanvas.height = cropH;
            const cropCtx = cropCanvas.getContext('2d');
            if (!cropCtx) return resolve(null);
            cropCtx.drawImage(fullCanvas, x0, y0, cropW, cropH, 0, 0, cropW, cropH);

            const cropUrl = cropCanvas.toDataURL('image/png', 0.92);

            // Verificar Tesseract disponível
            if (!window.Tesseract?.recognize) {
                return resolve(null);
            }

            const clickCropX = coords.x - x0;
            const clickCropY = coords.y - y0;

            window.Tesseract.recognize(cropUrl, 'por+eng')
                .then((result) => {
                    const words = result?.data?.words || [];
                    if (!Array.isArray(words) || words.length === 0) {
                        return resolve(null);
                    }

                    // Encontrar palavra clicada ou mais próxima
                    const chosen = findWordAtClick(words, clickCropX, clickCropY) ||
                        findClosestWord(words, clickCropX, clickCropY);

                    if (!chosen) return resolve(null);

                    // Extrair linha de palavras próximas
                    const lineWords = extractLineWords(words, chosen);
                    const text = lineWords
                        .map((w) => String(w?.text || '').trim())
                        .filter(Boolean)
                        .join(' ')
                        .trim();

                    const label = pickLabelFromText(text || String(chosen?.text || '').trim());
                    resolve(label);
                })
                .catch((err) => {
                    console.warn('OCR falhou:', err);
                    resolve(null);
                });
        } catch (e) {
            console.warn('Sugestão de rótulo falhou:', e);
            resolve(null);
        }
    });
}

/**
 * Encontra palavra que contém as coordenadas do clique
 * @private
 */
function findWordAtClick(words, clickX, clickY) {
    for (const word of words) {
        const bb = word?.bbox || word?.boundingBox;
        if (!bb) continue;

        const xMin = bb.x0 ?? bb.left ?? bb.x ?? 0;
        const yMin = bb.y0 ?? bb.top ?? bb.y ?? 0;
        const xMax = bb.x1 ?? ((bb.left ?? 0) + (bb.width ?? 0));
        const yMax = bb.y1 ?? ((bb.top ?? 0) + (bb.height ?? 0));

        if (clickX >= xMin && clickX <= xMax && clickY >= yMin && clickY <= yMax) {
            return word;
        }
    }
    return null;
}

/**
 * Encontra palavra mais próxima das coordenadas
 * @private
 */
function findClosestWord(words, clickX, clickY) {
    let best = null;
    let bestDist = Infinity;

    for (const word of words) {
        const bb = word?.bbox || word?.boundingBox;
        if (!bb) continue;

        const xMin = bb.x0 ?? bb.left ?? bb.x ?? 0;
        const yMin = bb.y0 ?? bb.top ?? bb.y ?? 0;
        const xMax = bb.x1 ?? ((bb.left ?? 0) + (bb.width ?? 0));
        const yMax = bb.y1 ?? ((bb.top ?? 0) + (bb.height ?? 0));

        const cx = (xMin + xMax) / 2;
        const cy = (yMin + yMax) / 2;
        const d = Math.hypot(cx - clickX, cy - clickY);

        if (d < bestDist) {
            bestDist = d;
            best = word;
        }
    }

    return best;
}

/**
 * Extrai palavras na mesma linha de uma palavra referência
 * @private
 */
function extractLineWords(words, refWord) {
    const bb = refWord?.bbox || refWord?.boundingBox;
    if (!bb) return [];

    const yMin = bb.y0 ?? bb.top ?? bb.y ?? 0;
    const yMax = bb.y1 ?? ((bb.top ?? 0) + (bb.height ?? 0));
    const lineHeight = yMax - yMin;
    const bandPad = Math.max(4, Math.round(lineHeight * 0.6));

    const bandTop = yMin - bandPad;
    const bandBottom = yMax + bandPad;

    return words
        .filter((word) => {
            const wbb = word?.bbox || word?.boundingBox;
            if (!wbb) return false;

            const wYMin = wbb.y0 ?? wbb.top ?? wbb.y ?? 0;
            const wYMax = wbb.y1 ?? ((wbb.top ?? 0) + (wbb.height ?? 0));
            const overlap = Math.min(wYMax, bandBottom) - Math.max(wYMin, bandTop);

            return overlap > 0;
        })
        .sort((a, b) => {
            const aBB = a?.bbox || a?.boundingBox || {};
            const bBB = b?.bbox || b?.boundingBox || {};
            const aX = aBB.x0 ?? aBB.left ?? aBB.x ?? 0;
            const bX = bBB.x0 ?? bBB.left ?? bBB.x ?? 0;
            return aX - bX;
        });
}

/**
 * Extrai rótulo legível do texto
 * @param {string} text - Texto raw
 * @returns {string|null}
 */
export function pickLabelFromText(text) {
    if (!text) return null;

    const cleaned = String(text).replace(/\s+/g, ' ').trim();

    if (cleaned.length <= 80) return cleaned;

    const sliced = cleaned.slice(0, 80);
    const lastSpace = sliced.lastIndexOf(' ');

    return lastSpace > 40 ? sliced.slice(0, lastSpace) : sliced;
}

/**
 * Sanitiza rótulo
 * @param {string} label
 * @returns {string|null}
 */
export function sanitizeLabel(label) {
    if (!label) return null;
    const trimmed = String(label).trim();
    return trimmed || null;
}

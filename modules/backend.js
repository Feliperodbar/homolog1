/**
 * Módulo de comunicação com backend.
 * Gerencia polling de triggers para captura de passos.
 */

/**
 * Obtém base URL do backend
 * @returns {string}
 */
export function getBackendBase() {
    const origin = window.location.origin || '';
    const isLocalhost = origin.includes('localhost:8010') || origin.includes('127.0.0.1:8010');
    return isLocalhost ? '' : 'http://localhost:8010';
}

/**
 * Busca estado atual do trigger no backend
 * @returns {Promise<Object>}
 */
export async function getTriggerState() {
    try {
        const base = getBackendBase();
        const resp = await fetch(`${base}/trigger-state`);
        if (!resp.ok) return null;
        return await resp.json().catch(() => null);
    } catch {
        return null;
    }
}

/**
 * Verifica saúde da aplicação backend
 * @returns {Promise<boolean>}
 */
export async function checkHealth() {
    try {
        const base = getBackendBase();
        const resp = await fetch(`${base}/health`);
        return resp.ok;
    } catch {
        return false;
    }
}
